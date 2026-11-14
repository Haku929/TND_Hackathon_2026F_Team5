import { connection, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { DEFAULT_UNIVERSITY_ID, isKnownUniversity } from "@/lib/universities";

// データ（先生）が入っている大学の id を返す。入口の「知りたい大学」の選べる範囲になる。
// DB に大学のデータを入れる（data/load_university.py）と、コードを変えずに、ここに増える。
// 大学の列がまだない DB（移行前）では、既定の大学だけを返す。
// 同じサーバーの中で、60 秒だけ結果を使い回す（短い間に何度呼ばれても、DB への問い合わせは 1 回）
const CACHE_MS = 60_000;
let cache: { at: number; enabled: string[] } | null = null;

export async function GET() {
  // リクエストのたびに実行する。これがないと、ビルドのときに 1 回だけ実行されて、その結果が配られ続け、
  // DB に大学のデータを入れても、選べる大学が増えない（本番で確認した）
  await connection();
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(
      { enabled: cache.enabled },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
  const fallback = NextResponse.json({ enabled: [DEFAULT_UNIVERSITY_ID] });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT university_id, count(*)::int AS researchers
      FROM researchers
      GROUP BY university_id
    `;
    const enabled = rows
      .filter((row) => isKnownUniversity(row.university_id))
      .map((row) => row.university_id as string);
    const result = enabled.length > 0 ? enabled : [DEFAULT_UNIVERSITY_ID];
    cache = { at: Date.now(), enabled: result };
    return NextResponse.json(
      { enabled: result },
      // 頻繁には変わらないので、少しだけ使い回す
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch {
    return fallback;
  }
}
