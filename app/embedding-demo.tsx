"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getEmbedder, type EmbedderStatus } from "@/lib/embedder";
import { saveResult, type SearchResults } from "@/lib/result";
import PageShell from "./components/PageShell";

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

export default function EmbeddingDemo() {
  const [status, setStatus] = useState<EmbedderStatus>({
    state: "loading",
    progress: 0,
    file: "モデル",
  });
  const [question, setQuestion] = useState("");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

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

      // 結果は URL に載せず、このタブにだけ置いて結果画面へ移る
      saveResult({ question, results: payload as SearchResults });
      router.push("/result");
    } catch (searchError) {
      setError(getErrorMessage(searchError));
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <PageShell
      kicker="問いの星図 · 問いから学問を探す"
      title="あなたの問いを、学問につなぐ"
      showBack={false}
    >
      <p className="ui-privacy">
        問いは、この端末の外へ送られません。意味の近さは、この端末の中で動く{" "}
        <span className="ui-tag">AI</span> が計算します。
      </p>

      <div
        aria-live="polite"
        aria-label="モデルの読み込み状況"
        className="ui-status"
        style={{ marginTop: "var(--sp-6)" }}
      >
        {status.state === "loading" && (
          <>
            <span>
              <span className="ui-tag">AI</span> の準備中 {status.progress}%
              （初回だけ時間がかかります。問いは先に入力できます）
            </span>
            <progress
              aria-label="モデルの読み込み進捗"
              max={100}
              value={status.progress}
            />
          </>
        )}
        {status.state === "ready" && (
          <span>
            <span className="ui-tag">AI</span> の準備ができました。
          </span>
        )}
        {status.state === "error" && (
          <span>
            <span className="ui-status-err">
              モデルを読み込めませんでした: {status.message}
            </span>{" "}
            <button
              className="ui-btn ui-btn-quiet"
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
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <span className="ui-label" id="examples-label">
          例文から選ぶ
        </span>
        <ul aria-labelledby="examples-label" className="ui-examples">
          {exampleQuestions.map((example) => (
            <li key={example}>
              <button
                className="ui-chip"
                onClick={() => {
                  setQuestion(example);
                  setError(null);
                }}
                type="button"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>

        <label className="ui-label" htmlFor="question">
          いま気になっている問い
        </label>
        <textarea
          className="ui-textarea"
          id="question"
          maxLength={200}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="例：なぜ人は協力するのだろう？"
          value={question}
        />
        <div className="ui-formbar">
          <span>{question.length} / 200文字</span>
          <button
            className="ui-btn"
            disabled={!question.trim() || isSearching}
            type="submit"
          >
            {isSearching
              ? "検索中…"
              : status.state === "loading"
                ? "準備でき次第、探す"
                : "問いから分野を探す"}
          </button>
        </div>

        {error && (
          <p className="ui-errmsg" role="alert">
            {error}
          </p>
        )}
      </form>
    </PageShell>
  );
}
