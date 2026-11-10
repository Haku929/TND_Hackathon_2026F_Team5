"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getEmbedder, type EmbedderStatus } from "@/lib/embedder";
import embeddingConfig from "@/shared/embedding.json";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function EmbeddingDemo() {
  const [status, setStatus] = useState<EmbedderStatus>({
    state: "loading",
    progress: 0,
    file: "モデル",
  });
  const [question, setQuestion] = useState("");
  const [vector, setVector] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEmbedding, setIsEmbedding] = useState(false);

  useEffect(() => {
    const embedder = getEmbedder();
    const unsubscribe = embedder.subscribe(setStatus);

    void embedder.initialize().catch((loadError: unknown) => {
      setError(getErrorMessage(loadError));
    });

    return unsubscribe;
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setVector(null);
    setIsEmbedding(true);

    try {
      setVector(await getEmbedder().embed(question, "query"));
    } catch (embeddingError) {
      setError(getErrorMessage(embeddingError));
    } finally {
      setIsEmbedding(false);
    }
  }

  const vectorNorm = vector
    ? Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
    : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-5 py-12 sm:px-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-wide text-indigo-700 dark:text-indigo-300">
          問いの星図 · 埋め込みモデル検証
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
              disabled={!question.trim() || isEmbedding}
              type="submit"
            >
              {isEmbedding ? "変換中…" : "問いをベクトルに変換"}
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}

        {vector && vectorNorm !== null && (
          <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-700">
            <h2 className="font-semibold">埋め込み結果</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-600 dark:text-zinc-300">次元数</dt>
                <dd className="font-mono">{vector.length}</dd>
              </div>
              <div>
                <dt className="text-zinc-600 dark:text-zinc-300">L2ノルム</dt>
                <dd className="font-mono">{vectorNorm.toFixed(6)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
              先頭8要素（ベクトル全体はブラウザ内にあります）
            </p>
            <output className="mt-2 block overflow-x-auto rounded-xl bg-zinc-100 p-4 font-mono text-sm dark:bg-zinc-800">
              [
              {vector
                .slice(0, 8)
                .map((value) => value.toFixed(5))
                .join(", ")}
              , …]
            </output>
          </div>
        )}
      </section>
    </main>
  );
}
