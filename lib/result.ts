// 検索結果の型と、入力画面（/）から結果画面（/result）へ渡す仕組み。
// 問いの文章は URL に載せない（履歴やアクセスログに残さないため）。
// 結果はこのタブの sessionStorage にだけ置き、サーバーには送らない。

export type SearchResearcher = {
  id: string;
  name: string;
  affiliation: string;
  theme: string;
  kaken_url: string;
};

export type ResearchProject = {
  firstSentence: string;
  keywords: string;
  abstract: string;
};

export type SearchField = {
  id: string;
  name: string;
  summary: string;
  misconception: string;
  term: { term: string; description: string } | null;
  researchers: SearchResearcher[];
};

export type SearchResults = {
  fields: SearchField[];
  low_similarity_fields: Pick<
    SearchField,
    "id" | "name" | "summary" | "misconception"
  >[];
};

export const RESULT_STORAGE_KEY = "search-result";

export type StoredResult = {
  question: string;
  results: SearchResults;
};

function getFirstSentence(text: string) {
  const end = text.search(/[。！？!?]/);
  return end === -1 ? text.trim() : text.slice(0, end + 1).trim();
}

export function parseResearchTheme(theme: string): ResearchProject[] {
  return theme
    .split(/\r?\n/)
    .map((entry) => {
      const keywordMarker = /キーワード[:：]/.exec(entry);
      const abstractMarker = /概要[:：]/.exec(entry);
      const markerIndexes = [
        keywordMarker?.index,
        abstractMarker?.index,
      ].filter((index): index is number => index !== undefined);
      const titleEnd =
        markerIndexes.length > 0 ? Math.min(...markerIndexes) : entry.length;
      const title = entry.slice(0, titleEnd).trim();
      const keywordStart = keywordMarker
        ? keywordMarker.index + keywordMarker[0].length
        : null;
      const keywordEnd =
        keywordStart !== null &&
        abstractMarker &&
        abstractMarker.index > keywordStart
          ? abstractMarker.index
          : entry.length;
      const keywords =
        keywordStart === null
          ? ""
          : entry
              .slice(keywordStart, keywordEnd)
              .replace(/^[。．\s]+|[。．\s]+$/g, "")
              .trim();
      const abstract = abstractMarker
        ? entry
            .slice(abstractMarker.index + abstractMarker[0].length)
            .replace(/^[。．\s]+/, "")
            .trim()
        : "";

      return {
        firstSentence: getFirstSentence(title || abstract),
        keywords,
        abstract,
      };
    })
    .filter(
      (project) =>
        project.firstSentence || project.keywords || project.abstract,
    );
}

export function saveResult(value: StoredResult) {
  try {
    sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 保存できないときは、結果画面が「結果が見つかりません」を出す
  }
}

export function parseStoredResult(raw: string | null): StoredResult | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { question, results } = v as Record<string, unknown>;
    if (typeof question !== "string") return null;
    if (typeof results !== "object" || results === null) return null;
    const r = results as Record<string, unknown>;
    if (!Array.isArray(r.fields) || !Array.isArray(r.low_similarity_fields)) {
      return null;
    }
    return { question, results: results as SearchResults };
  } catch {
    return null;
  }
}
