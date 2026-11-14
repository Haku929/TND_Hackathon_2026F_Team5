"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getEmbedder, type EmbedderStatus } from "@/lib/embedder";
import { markFromSearch, saveResult, type SearchResults } from "@/lib/result";
import { DEFAULT_UNIVERSITY_ID, UNIVERSITIES } from "@/lib/universities";
import { useUniversity } from "@/lib/use-university";
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
// 検索中の表示がそっと消えるまで待つ時間（ミリ秒。CSS の .ui-leaving と合わせる）
const LEAVE_MS = 200;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function HomeView() {
  const [status, setStatus] = useState<EmbedderStatus>({
    state: "loading",
    progress: 0,
    file: "モデル",
  });
  const [question, setQuestion] = useState("");
  const [savedUniversity, setUniversity] = useUniversity();
  // 選べる大学（データが DB に入っている大学）。取れるまでは、既定の大学だけ
  const [enabledIds, setEnabledIds] = useState<string[]>([
    DEFAULT_UNIVERSITY_ID,
  ]);
  // 覚えている大学が、いまは選べないときは、既定の大学にする
  const university = enabledIds.includes(savedUniversity)
    ? savedUniversity
    : DEFAULT_UNIVERSITY_ID;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // 入力画面 → 検索中の画面 → 結果画面
  const [phase, setPhase] = useState<"input" | "searching">("input");
  const [stage, setStage] = useState<SearchStage>("embed");
  // 結果へ移る直前（検索中の表示を消している間）
  const [leaving, setLeaving] = useState(false);
  // 検索をやめて入力に戻ったとき、遅れて届いた結果を使わないための印
  const runId = useRef(0);

  // 選べる大学を、裏で取る。取れなくても、既定の大学で使える
  useEffect(() => {
    let alive = true;
    fetch("/api/universities")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (
          alive &&
          isRecord(payload) &&
          Array.isArray(payload.enabled) &&
          payload.enabled.every((id) => typeof id === "string")
        ) {
          setEnabledIds(payload.enabled as string[]);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // AI（モデル）の読み込みは、ページを開いた時点から裏で進める
  useEffect(() => {
    const embedder = getEmbedder();
    const unsubscribe = embedder.subscribe(setStatus);

    void embedder.initialize().catch((loadError: unknown) => {
      setError(getErrorMessage(loadError));
    });

    return unsubscribe;
  }, []);

  // 結果画面へ移ったあと、この画面は裏に残る（戻ったときに状態も残る）。
  // 画面から離れるときに「検索中」を終わらせて、戻ったら入力画面になるようにする
  useEffect(() => {
    return () => {
      runId.current += 1;
      setPhase("input");
    };
  }, []);

  async function search(asked: string, id: number, universityId: string) {
    // AI の読み込みが終わっていなければ、ここで待つ（待っている間も、読み込みは続く）
    const vector = await getEmbedder().embed(asked, "query");
    if (runId.current !== id) return null;

    setStage("search");
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embedding: vector, university: universityId }),
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
    const askedUniversity = university;
    const id = ++runId.current;

    setError(null);
    setStage("embed");
    setLeaving(false);
    setPhase("searching");

    try {
      // 速く終わっても、検索中の画面を一瞬でちらつかせない
      const [results] = await Promise.all([
        search(asked, id, askedUniversity),
        wait(MIN_SEARCHING_MS),
      ]);
      if (runId.current !== id || !results) return;

      // 結果は URL に載せず、このタブにだけ置いて結果画面へ移る
      saveResult({
        question: asked,
        results,
        university: askedUniversity,
      });
      markFromSearch();

      // 検索中の表示をそっと消してから移る（「動きを減らす」設定のときは待たない）
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setLeaving(true);
        await wait(LEAVE_MS);
        if (runId.current !== id) return;
      }
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
        layout="wide"
        kicker="あなたの問い"
        onBack={cancelSearch}
        showNotice={false}
        title={question}
      >
        <SearchProgress leaving={leaving} stage={stage} status={status} />
      </PageShell>
    );
  }

  return (
    <PageShell
      hero
      key="input"
      layout="split"
      kicker="問いから学問を探す"
      showBack={false}
      showNotice={false}
      title="問いから、学問へ。"
    >
      <p className="ui-lead">ふだんの言葉の疑問から、近い学問と先生へ。</p>
      <form onSubmit={handleSubmit}>
        <span className="ui-label" id="university-label">
          知りたい大学
        </span>
        <div
          aria-labelledby="university-label"
          className="ui-universities"
          role="radiogroup"
        >
          {UNIVERSITIES.map((u) => (
            <button
              aria-checked={university === u.id}
              className="ui-univ"
              disabled={!enabledIds.includes(u.id)}
              key={u.id}
              onClick={() => setUniversity(u.id)}
              role="radio"
              type="button"
            >
              {u.name}
              {!enabledIds.includes(u.id) && (
                <span className="ui-univ-soon">準備中</span>
              )}
            </button>
          ))}
        </div>

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
          autoCapitalize="off"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl / Cmd + Enter で送る（Enter だけは、改行）
            if (
              (event.ctrlKey || event.metaKey) &&
              event.key === "Enter" &&
              question.trim()
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          spellCheck={false}
          placeholder="例：国と国は、どうして争うのだろう？"
          value={question}
        />
        <div className="ui-formbar">
          <span>{question.length} / 200文字</span>
          <button className="ui-btn" disabled={!question.trim()} type="submit">
            問いから分野を探す
          </button>
        </div>
        <p className="ui-note">
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <rect height="10" rx="2" width="14" x="5" y="11" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          入力した文章は、この端末の外へ送られません。
        </p>

        {error && (
          <p className="ui-errmsg" role="alert">
            {error}
          </p>
        )}
      </form>

      {/* AI の準備は裏で進む。ここには、さりげなく状況だけを出す */}
      <p
        aria-live="polite"
        className="ui-status"
        hidden={status.state === "ready"}
      >
        {status.state === "loading" && (
          <>
            <span className="ui-tag ui-tag-ai">AI</span>{" "}
            を裏で準備しています（初回だけ・{status.progress}
            %）。準備の途中でも、探せます。
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
