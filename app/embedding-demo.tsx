"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getEmbedder, type EmbedderStatus } from "@/lib/embedder";
import { saveResult, type SearchResults } from "@/lib/result";
import PageShell from "./components/PageShell";
import SearchProgress, { type SearchStage } from "./components/SearchProgress";

// 例文は 3 つのまま、人文・社会・自然の 3 方面から 1 つずつ選ぶ。
// どれも、実際に検索して、近い分野が妥当に出ることを確かめてある
const exampleQuestions = [
  "他者とは、自分にとってどういう存在なのだろうか。", // 哲学・倫理学
  "国と国は、どうして争うのだろう？", // 国際関係学・政治学・地域研究
  "宇宙は、どうやって始まったのだろう？", // 物理・天文・地球科学
];

// 検索中の画面が一瞬で消えてちらつかないよう、最低限これだけは見せる（ミリ秒）
const MIN_SEARCHING_MS = 900;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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
  // 入力画面 → 検索中の画面 → 結果画面
  const [phase, setPhase] = useState<"input" | "searching">("input");
  const [stage, setStage] = useState<SearchStage>("embed");
  // 検索をやめて入力に戻ったとき、遅れて届いた結果を使わないための印
  const runId = useRef(0);

  // AI（モデル）の読み込みは、ページを開いた時点から裏で進める
  useEffect(() => {
    const embedder = getEmbedder();
    const unsubscribe = embedder.subscribe(setStatus);

    void embedder.initialize().catch((loadError: unknown) => {
      setError(getErrorMessage(loadError));
    });

    return unsubscribe;
  }, []);

  async function search(asked: string, id: number) {
    // AI の読み込みが終わっていなければ、ここで待つ（待っている間も、読み込みは続く）
    const vector = await getEmbedder().embed(asked, "query");
    if (runId.current !== id) return null;

    setStage("search");
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
    return payload as SearchResults;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const asked = question;
    const id = ++runId.current;

    setError(null);
    setStage("embed");
    setPhase("searching");

    try {
      // 速く終わっても、検索中の画面を一瞬でちらつかせない
      const [results] = await Promise.all([
        search(asked, id),
        wait(MIN_SEARCHING_MS),
      ]);
      if (runId.current !== id || !results) return;

      // 結果は URL に載せず、このタブにだけ置いて結果画面へ移る
      saveResult({ question: asked, results });
      router.push("/result");
    } catch (searchError) {
      if (runId.current !== id) return;
      setError(getErrorMessage(searchError));
      setPhase("input");
    }
  }

  function cancelSearch() {
    runId.current += 1; // 進行中の検索の結果は、使わない
    setPhase("input");
  }

  if (phase === "searching") {
    return (
      <PageShell
        backLabel="問いを書き直す"
        key="searching"
        kicker="いま、探しています"
        onBack={cancelSearch}
        title={question}
      >
        <SearchProgress stage={stage} status={status} />
      </PageShell>
    );
  }

  return (
    <PageShell
      hero
      key="input"
      kicker="問いから学問を探す"
      showBack={false}
      title="問いから、学問へ。"
    >
      <p className="ui-lead">
        ふとした疑問を、ふだんの言葉で書くだけ。近い学問の分野と、この大学で学べる先生が見つかります。
      </p>
      <p className="ui-privacy">
        問いは、この端末の外へ送られません。意味の近さは、この端末の中で動く{" "}
        <span className="ui-tag ui-tag-ai">AI</span> が計算します。
      </p>

      <aside className="ui-sample" aria-label="たとえば">
        <span className="ui-sample-label">たとえば</span>
        <p className="ui-sample-q">
          「他者とは、自分にとってどういう存在なのだろうか。」
        </p>
        <p className="ui-sample-a">
          この問いは、哲学では <mark className="ui-mark">他者論</mark>{" "}
          と呼ばれています。
        </p>
      </aside>

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
          placeholder="例：国と国は、どうして争うのだろう？"
          value={question}
        />
        <div className="ui-formbar">
          <span>{question.length} / 200文字</span>
          <button className="ui-btn" disabled={!question.trim()} type="submit">
            問いから分野を探す
          </button>
        </div>

        {error && (
          <p className="ui-errmsg" role="alert">
            {error}
          </p>
        )}
      </form>

      {/* AI の準備は裏で進む。ここには、さりげなく状況だけを出す */}
      <p aria-live="polite" className="ui-status">
        {status.state === "loading" && (
          <>
            <span className="ui-tag ui-tag-ai">AI</span>{" "}
            を裏で準備しています（初回だけ・{status.progress}
            %）。準備の途中でも、探せます。
          </>
        )}
        {status.state === "ready" && (
          <>
            <span className="ui-tag ui-tag-ai">AI</span> の準備ができています。
          </>
        )}
        {status.state === "error" && (
          <>
            <span className="ui-status-err">
              AI を読み込めませんでした: {status.message}
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
          </>
        )}
      </p>
    </PageShell>
  );
}
