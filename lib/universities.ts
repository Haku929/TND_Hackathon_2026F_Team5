import universitiesJson from "@/shared/universities.json";

// 対象の大学（並び順・名前）。shared/universities.json で管理する。
// どの大学が「選べる」かは、ここでは決めない。DB にその大学の先生のデータが入っているかで決まる
// （app/api/universities）。データを入れれば、コードを変えずに、自動で選べるようになる。
export type University = { id: string; name: string };

export const UNIVERSITIES: University[] = universitiesJson;

export const DEFAULT_UNIVERSITY_ID = "ritsumei";

export function findUniversity(id: string | null | undefined) {
  return UNIVERSITIES.find((u) => u.id === id);
}

// 知っている大学の id か。API の入力検証に使う（データの有無は、別に決まる）
export function isKnownUniversity(id: unknown): id is string {
  return typeof id === "string" && findUniversity(id) !== undefined;
}

export function universityName(id: string | null | undefined) {
  return (findUniversity(id) ?? findUniversity(DEFAULT_UNIVERSITY_ID))!.name;
}
