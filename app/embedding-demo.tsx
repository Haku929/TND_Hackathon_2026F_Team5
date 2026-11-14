"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { getEmbedder, type EmbedderStatus } from "@/lib/embedder";
import embeddingConfig from "@/shared/embedding.json";

type SearchResearcher = {
  id: string;
  name: string;
  affiliation: string;
  theme: string;
  kaken_url: string;
};

type ResearchProject = {
  firstSentence: string;
  keywords: string;
  abstract: string;
};

type SearchField = {
  id: string;
  name: string;
  summary: string;
  misconception: string;
  term: { term: string; description: string } | null;
  researchers: SearchResearcher[];
};

type SearchResults = {
  fields: SearchField[];
  low_similarity_fields: Pick<
    SearchField,
    "id" | "name" | "summary" | "misconception"
  >[];
};

const exampleQuestions = [
  "なぜ人は協力するのだろう？",
  "他者とは、自分にとってどういう存在なのだろうか。",
  "人はなぜ物語を語るのだろう？",
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getFirstSentence(text: string) {
  const end = text.search(/[。！？!?]/);
  return end === -1 ? text.trim() : text.slice(0, end + 1).trim();
}

function parseResearchTheme(theme: string): ResearchProject[] {
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

export default function EmbeddingDemo() {
  const [status, setStatus] = useState<EmbedderStatus>({
    state: "loading",
    progress: 0,
    file: "モデル",
  });
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const selectedField = results?.fields[selectedFieldIndex];

  useEffect(() => {
    const embedder = getEmbedder();
    const unsubscribe = embedder.subscribe(setStatus);

    void embedder.initialize().catch((loadError: unknown) => {
      setError(getErrorMessage(loadError));
    });

    return unsubscribe;
  }, []);

  function handleFieldTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    fieldCount: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % fieldCount;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + fieldCount) % fieldCount;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = fieldCount - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    setSelectedFieldIndex(nextIndex);
    document.getElementById(`field-tab-${nextIndex}`)?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResults(null);
    setSelectedFieldIndex(0);
    setIsSearching(true);

    try {
      const vector = await getEmbedder().embed(question, "query");
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedding: vector }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : `検索に失敗しました (${response.status})`;
        throw new Error(message);
      }

      if (
        !isRecord(payload) ||
        !Array.isArray(payload.fields) ||
        !Array.isArray(payload.low_similarity_fields)
      ) {
        throw new Error("検索結果を読み込めませんでした");
      }

      setResults(payload as SearchResults);
    } catch (searchError) {
      setError(getErrorMessage(searchError));
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-5 py-12 sm:px-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-wide text-indigo-700 dark:text-indigo-300">
          問いの星図 · 問いから学問を探す
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          あなたの問いを、学問につなぐ
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
          問いをブラウザ内でベクトルに変換します。入力した文章はサーバーへ送信されません。
        </p>
      </header>

      <section
        aria-label="モデルの読み込み状況"
        aria-live="polite"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">モデルの準備</h2>
            <p className="mt-1 break-all text-sm text-zinc-600 dark:text-zinc-300">
              {embeddingConfig.model} · q8
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800">
            {status.state === "ready"
              ? "準備完了"
              : status.state === "error"
                ? "エラー"
                : `${status.progress}%`}
          </span>
        </div>

        {status.state === "loading" && (
          <>
            <progress
              aria-label="モデルの読み込み進捗"
              className="h-2 w-full accent-indigo-600"
              max={100}
              value={status.progress}
            />
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {status.file} を読み込み中です。問いは先に入力できます。
            </p>
          </>
        )}

        {status.state === "ready" && (
          <p className="text-sm text-green-700 dark:text-green-300">
            ブラウザ内で埋め込みを実行できます。
          </p>
        )}

        {status.state === "error" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-red-700 dark:text-red-300">
              モデルを読み込めませんでした: {status.message}
            </p>
            <button
              className="min-h-11 rounded-full border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
              onClick={() => {
                setError(null);
                void getEmbedder()
                  .initialize()
                  .catch((loadError: unknown) => {
                    setError(getErrorMessage(loadError));
                  });
              }}
              type="button"
            >
              再試行
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 sm:p-6">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <p className="font-semibold">例文から選ぶ</p>
            <div className="flex flex-wrap gap-2">
              {exampleQuestions.map((example) => (
                <button
                  className="min-h-11 rounded-full border border-zinc-300 px-4 py-2 text-left text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                  key={example}
                  onClick={() => {
                    setQuestion(example);
                    setError(null);
                    setResults(null);
                  }}
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
          <label
            className="flex flex-col gap-2 font-semibold"
            htmlFor="question"
          >
            いま気になっている問い
            <textarea
              className="min-h-32 resize-y rounded-xl border border-zinc-300 bg-transparent p-4 text-base font-normal leading-7 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 dark:border-zinc-600"
              id="question"
              maxLength={200}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="例：なぜ人は協力するのだろう？"
              value={question}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              {question.length} / 200文字
            </span>
            <button
              className="min-h-11 rounded-full bg-indigo-700 px-6 font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              disabled={!question.trim() || isSearching}
              type="submit"
            >
              {isSearching
                ? "検索中…"
                : status.state === "loading"
                  ? "準備でき次第、検索する"
                  : "問いから分野を探す"}
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
      </section>

      {results && (
        <section aria-live="polite" className="flex flex-col gap-5">
          <div>
            <h2 className="text-2xl font-bold">問いに近い分野</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              AIによる意味の近さの推定です。進路を決める際は大学の公式情報も確認してください。
            </p>
          </div>

          {results.fields.length === 0 ? (
            <p className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
              分野が見つかりませんでした。別の問いでも試してみてください。
            </p>
          ) : (
            <>
              <div
                aria-label="検索結果の分野"
                aria-orientation="horizontal"
                className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-2"
                role="tablist"
              >
                {results.fields.map((field, index) => (
                  <button
                    aria-controls={`field-panel-${index}`}
                    aria-selected={selectedFieldIndex === index}
                    className={`min-h-11 shrink-0 snap-start rounded-full border px-4 font-medium transition-colors ${
                      selectedFieldIndex === index
                        ? "border-indigo-700 bg-indigo-700 text-white dark:border-indigo-500 dark:bg-indigo-500"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                    id={`field-tab-${index}`}
                    key={field.id}
                    onClick={() => setSelectedFieldIndex(index)}
                    onKeyDown={(event) =>
                      handleFieldTabKeyDown(event, index, results.fields.length)
                    }
                    role="tab"
                    tabIndex={selectedFieldIndex === index ? 0 : -1}
                    type="button"
                  >
                    {field.name}
                  </button>
                ))}
              </div>

              {selectedField && (
                <article
                  aria-labelledby={`field-tab-${selectedFieldIndex}`}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
                  id={`field-panel-${selectedFieldIndex}`}
                  role="tabpanel"
                  tabIndex={0}
                >
                  <h3 className="text-xl font-bold">{selectedField.name}</h3>
                  <dl className="mt-4 flex flex-col gap-4">
                    <div>
                      <dt className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                        ひとことで言うと
                      </dt>
                      <dd className="mt-1">{selectedField.summary}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                        よくある誤解
                      </dt>
                      <dd className="mt-1">{selectedField.misconception}</dd>
                    </div>
                    {selectedField.term && (
                      <div>
                        <dt className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                          この分野での呼び名
                        </dt>
                        <dd className="mt-1">
                          <span className="font-semibold">
                            {selectedField.term.term}
                          </span>
                          {selectedField.term.description && (
                            <span>：{selectedField.term.description}</span>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                    <h4 className="font-semibold">関連する先生</h4>
                    {selectedField.researchers.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                        先生の情報はまだありません。
                      </p>
                    ) : (
                      <ul className="mt-3 flex flex-col gap-3">
                        {selectedField.researchers.map((researcher) => {
                          const projects = parseResearchTheme(researcher.theme);
                          const theme = projects[0]?.firstSentence ?? "";
                          const keywords = [
                            ...new Set(
                              projects
                                .map((project) => project.keywords)
                                .filter(Boolean),
                            ),
                          ].join("、");
                          const overview = projects
                            .map((project) => project.abstract)
                            .filter(Boolean)
                            .join("\n\n");
                          return (
                            <li key={researcher.id}>
                              <details className="rounded-xl bg-zinc-50 dark:bg-zinc-800">
                                <summary className="cursor-pointer rounded-xl p-4 marker:text-indigo-700 dark:marker:text-indigo-300">
                                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <span className="font-semibold">
                                      {researcher.name}
                                    </span>
                                    <span className="text-sm text-zinc-600 dark:text-zinc-300">
                                      {researcher.affiliation}
                                    </span>
                                  </span>
                                  {theme && (
                                    <span className="mt-2 block text-sm leading-6">
                                      {theme}
                                    </span>
                                  )}
                                </summary>
                                <div className="flex flex-col gap-4 border-t border-zinc-200 p-4 dark:border-zinc-700">
                                  {!theme && !keywords && !overview ? (
                                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                                      研究テーマの情報はありません。
                                    </p>
                                  ) : (
                                    <>
                                      {theme && (
                                        <div>
                                          <h6 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                                            テーマ
                                          </h6>
                                          <p className="mt-1 leading-7">
                                            {theme}
                                          </p>
                                        </div>
                                      )}
                                      {keywords && (
                                        <div>
                                          <h6 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                                            キーワード
                                          </h6>
                                          <p className="mt-1 leading-7">
                                            {keywords}
                                          </p>
                                        </div>
                                      )}
                                      {overview && (
                                        <div>
                                          <h6 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                                            概要
                                          </h6>
                                          <p className="mt-1 whitespace-pre-wrap leading-7">
                                            {overview}
                                          </p>
                                        </div>
                                      )}
                                    </>
                                  )}
                                  <a
                                    className="inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
                                    href={researcher.kaken_url}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    KAKENの研究者ページ
                                  </a>
                                </div>
                              </details>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </article>
              )}
            </>
          )}

          {results.low_similarity_fields.length > 0 && (
            <div>
              <h3 className="text-lg font-bold">別の視点から見る</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {results.low_similarity_fields.map((field) => (
                  <li
                    className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
                    key={field.id}
                  >
                    <h4 className="font-semibold">{field.name}</h4>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {field.summary}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
