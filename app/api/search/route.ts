import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { makeUnknownRuntimeDataHangingPromise } from "next/dist/server/dynamic-rendering-utils";

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
        const project_rows = await sql`
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

        const fields = await Promise.all(
          field_ids.map(async (field_id, index) => {
            const field = field_rows.find((row) => row.id === field_id);
            const term_result = await sql`
      SELECT id, field_id, term, description
      FROM terms
      WHERE field_id = ${field_id}
      ORDER BY embedding <=> ${vector}::vector
      LIMIT 1
    `;

            return {
              ...field,
              term: term_result[0] ?? null,
              researchers: picks[index].map((pick) => ({
                ...researcher_by_id.get(pick.researcher_id),
                project_id: pick.project_id,
                score: pick.score,
              })),
            };
          }),
        );

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
