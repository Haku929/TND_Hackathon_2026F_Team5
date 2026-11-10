import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function POST(request: Request) {
  const body = await request.json();

  const emb = body.embedding;
  if (Array.isArray(emb)) {
    if (emb.length == 384) {
      if (
        emb.every(
          (value) => typeof value === "number" && Number.isFinite(value),
        )
      ) {
        const vector = `[${emb.join(",")}]`;

        const sql = neon(process.env.DATABASE_URL!);

        const field_result = await sql`
  SELECT
    id,
    name,
    summary,
    misconception,
    1 - (embedding <=> ${vector}::vector) AS score
  FROM fields
  ORDER BY embedding <=> ${vector}::vector
  LIMIT 3
`;

        const fields = await Promise.all(
          field_result.map(async (field) => {
            const term_result = await sql`
      SELECT id, field_id, term, description
      FROM terms
      WHERE field_id = ${field.id}
      ORDER BY embedding <=> ${vector}::vector
      LIMIT 1
    `;

            const researchers_result = await sql`
      SELECT
        r.id,
        r.name,
        r.affiliation,
        r.theme,
        r.kaken_url,
        1 - (r.embedding <=> ${vector}::vector) AS score
      FROM researchers r
      JOIN researcher_fields rf
        ON r.id = rf.researcher_id
      WHERE rf.field_id = ${field.id}
      ORDER BY r.embedding <=> ${vector}::vector
      LIMIT 3
    `;

            return {
              ...field,
              term: term_result[0] ?? null,
              researchers: researchers_result,
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
