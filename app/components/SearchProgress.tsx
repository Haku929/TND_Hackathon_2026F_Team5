import type { EmbedderStatus } from "@/lib/embedder";

export type SearchStage = "embed" | "search";

type StepState = "done" | "active" | "todo";

function Step({
  state,
  title,
  children,
}: {
  state: StepState;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="ui-step" data-state={state}>
      <span aria-hidden="true" className="ui-step-mark">
        {state === "done" && (
          <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            viewBox="0 0 24 24"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      <span className="ui-step-body">
        <span className="ui-step-title">{title}</span>
        {children}
      </span>
    </li>
  );
}

// 検索中の画面。インクの波紋と、3 つの手順の進み具合を見せる。
// AI の読み込みが終わっていなければ、ここで続きを見せる（読み込み自体は入力画面から裏で進んでいる）。
export default function SearchProgress({
  status,
  stage,
  leaving = false,
}: {
  status: EmbedderStatus;
  stage: SearchStage;
  // 結果へ移る直前。そっと消えて、結果が下から入ってくる
  leaving?: boolean;
}) {
  const modelReady = status.state === "ready";

  const modelState: StepState = modelReady ? "done" : "active";
  const embedState: StepState = !modelReady
    ? "todo"
    : stage === "embed"
      ? "active"
      : "done";
  const searchState: StepState = stage === "search" ? "active" : "todo";

  return (
    <div className={leaving ? "ui-searching ui-leaving" : "ui-searching"}>
      {/* 墨を落としたように、朱の点から波紋が広がる。飾りなので読み上げない */}
      <div aria-hidden="true" className="ui-ink">
        <span />
        <span />
        <span />
      </div>
      <p className="ui-searching-label">検索中</p>

      <ol aria-live="polite" className="ui-steps-list" role="status">
        <Step
          state={modelState}
          title={modelReady ? "AI の準備ができました" : "AI を準備しています"}
        >
          {!modelReady && (
            <span className="ui-step-bar">
              <progress
                aria-label="AI の読み込み進捗"
                max={100}
                value={status.progress}
              />
              <span>{status.progress}%</span>
            </span>
          )}
        </Step>
        <Step state={embedState} title="問いを数字にする（この端末の中で）" />
        <Step state={searchState} title="近い分野と先生を探す" />
      </ol>
    </div>
  );
}
