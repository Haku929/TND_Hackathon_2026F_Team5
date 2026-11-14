import { NextResponse } from "next/server";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { DEFAULT_UNIVERSITY_ID, isKnownUniversity } from "@/lib/universities";

type Sql = NeonQueryFunction<false, false>;

// 課題の順位づけ。大学で絞る（researchers.university_id）。
// DB の移行（db/migrations/20261115_add_university.sql）の前は、この列がないので、
// 既定の大学（立命館大学）に限って、従来の絞り込みなしの検索で答える。
async function rankProjects(sql: Sql, vector: string, university: string) {
  try {
    return await sql`
  WITH ranked AS (
    SELECT rc.project_id, MAX(1 - (rc.embedding <=> ${vector}::vector)) AS score
    FROM researcher_chunks rc
    JOIN researchers r ON r.id = rc.researcher_id
    WHERE r.university_id = ${university}
    GROUP BY rc.project_id
    ORDER BY score DESC, project_id ASC
    LIMIT 300
  )
  SELECT
    ranked.project_id,
    ranked.score,
    participant.researcher_id,
    ARRAY(
      SELECT rf.field_id
      FROM researcher_fields rf
      WHERE rf.researcher_id = participant.researcher_id
    ) AS field_ids
  FROM ranked
  JOIN LATERAL (
    SELECT DISTINCT rc.researcher_id
    FROM researcher_chunks rc
    JOIN researchers r ON r.id = rc.researcher_id
    WHERE rc.project_id = ranked.project_id
      AND r.university_id = ${university}
  ) participant ON true
  ORDER BY ranked.score DESC, ranked.project_id ASC, participant.researcher_id ASC
`;
  } catch (error) {
    const missingColumn =
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "42703";
    if (!missingColumn || university !== DEFAULT_UNIVERSITY_ID) throw error;
    return await sql`
  WITH ranked AS (
    SELECT project_id, MAX(1 - (embedding <=> ${vector}::vector)) AS score
    FROM researcher_chunks
    GROUP BY project_id
    ORDER BY score DESC, project_id ASC
    LIMIT 300
  )
  SELECT
    ranked.project_id,
    ranked.score,
    participant.researcher_id,
    ARRAY(
      SELECT rf.field_id
      FROM researcher_fields rf
      WHERE rf.researcher_id = participant.researcher_id
    ) AS field_ids
  FROM ranked
  JOIN LATERAL (
    SELECT DISTINCT rc.researcher_id
    FROM researcher_chunks rc
    WHERE rc.project_id = ranked.project_id
  ) participant ON true
  ORDER BY ranked.score DESC, ranked.project_id ASC, participant.researcher_id ASC
`;
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディが正しくありません" },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: "不正なリクエストです" },
      { status: 400 },
    );
  }

  // 検索する大学。省略したときは既定の大学。知っている大学の id だけを受け付ける
  const requested = (body as { university?: unknown }).university;
  const university = requested ?? DEFAULT_UNIVERSITY_ID;
  if (!isKnownUniversity(university)) {
    return NextResponse.json(
      { error: "指定された大学は、対象にありません" },
      { status: 400 },
    );
  }

  const emb = (body as { embedding?: unknown }).embedding;
  if (Array.isArray(emb)) {
    if (emb.length == 384) {
      if (
        emb.every(
          (value) => typeof value === "number" && Number.isFinite(value),
        )
      ) {
        const vector = `[${emb.join(",")}]`;

        const sql = neon(process.env.DATABASE_URL!);

        // 課題をチャンクの最大類似度で順位づけし、参加している先生とその分野を取る
        const project_rows = await rankProjects(sql, vector, university);

        const projects: {
          id: string;
          score: number;
          researcher_ids: string[];
          field_ids: Set<string>;
        }[] = [];
        for (const row of project_rows) {
          if (projects.at(-1)?.id !== row.project_id) {
            projects.push({
              id: row.project_id,
              score: Number(row.score),
              researcher_ids: [],
              field_ids: new Set(),
            });
          }
          const project = projects[projects.length - 1];
          project.researcher_ids.push(row.researcher_id);
          for (const field_id of row.field_ids) {
            project.field_ids.add(field_id);
          }
        }

        // 上位の課題から順に、分野を 3 つ集める
        const field_ids: string[] = [];
        for (const project of projects) {
          for (const field_id of [...project.field_ids].sort()) {
            if (field_ids.length < 3 && !field_ids.includes(field_id)) {
              field_ids.push(field_id);
            }
          }
          if (field_ids.length === 3) {
            break;
          }
        }

        // 同じ課題は 2 回出さない
        const shown_projects = new Set<string>();
        const picks = field_ids.map((field_id) => {
          const seen: {
            researcher_id: string;
            project_id: string;
            score: number;
          }[] = [];
          for (const project of projects) {
            if (seen.length === 3) {
              break;
            }
            if (
              !project.field_ids.has(field_id) ||
              shown_projects.has(project.id)
            ) {
              continue;
            }
            const researcher_id = project.researcher_ids.find(
              (id) => !seen.some((pick) => pick.researcher_id === id),
            );
            if (researcher_id) {
              seen.push({
                researcher_id,
                project_id: project.id,
                score: project.score,
              });
              shown_projects.add(project.id);
            }
          }
          return seen;
        });

        const researcher_ids = [
          ...new Set(picks.flat().map((pick) => pick.researcher_id)),
        ];
        const researcher_rows = await sql`
  SELECT id, name, affiliation, theme, kaken_url
  FROM researchers
  WHERE id = ANY(${researcher_ids})
`;
        const researcher_by_id = new Map(
          researcher_rows.map((researcher) => [researcher.id, researcher]),
        );

        const field_rows = await sql`
  SELECT
    id,
    name,
    summary,
    misconception,
    1 - (embedding <=> ${vector}::vector) AS score
  FROM fields
  WHERE id = ANY(${field_ids})
`;

        const fields = [];

        for (const [index, field_id] of field_ids.entries()) {
          const field = field_rows.find((row) => row.id === field_id);
          const term_result = await sql`
    SELECT id, field_id, term, description
    FROM terms
    WHERE field_id = ${field_id}
    ORDER BY embedding <=> ${vector}::vector
    LIMIT 1
  `;

          fields.push({
            ...field,
            term: term_result[0] ?? null,
            researchers: picks[index].map((pick) => ({
              ...researcher_by_id.get(pick.researcher_id),
              project_id: pick.project_id,
              score: pick.score,
            })),
          });
        }

        const low_similarity_fields = await sql`
  SELECT
    id,
    name,
    summary,
    misconception,
    1 - (embedding <=> ${vector}::vector) AS score
  FROM fields
  ORDER BY embedding <=> ${vector}::vector DESC
  LIMIT 2
`;

        const result = {
          fields,
          low_similarity_fields,
        };
        return NextResponse.json(result);
      } else {
        return NextResponse.json(
          { error: "入力のベクトルに数値以外が含まれています" },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "ベクトルの次元数が384ではありません" },
        { status: 400 },
      );
    }
  } else {
    return NextResponse.json(
      { error: "embedding must be an array" },
      { status: 400 },
    );
  }
}
