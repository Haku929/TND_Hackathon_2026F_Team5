import type { EmbedderStatus } from "@/lib/embedder";

export type SearchStage = "embed" | "search";

type StepState = "done" | "active" | "todo";

function Step({
  state,
  title,
  detail,
  children,
}: {
  state: StepState;
  title: string;
  detail: string;
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
        <span className="ui-step-detail">{detail}</span>
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
}: {
  status: EmbedderStatus;
  stage: SearchStage;
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
    <div>
      {/* 墨を落としたように、朱の点から波紋が広がる。飾りなので読み上げない */}
      <div aria-hidden="true" className="ui-ink">
        <span />
        <span />
        <span />
      </div>

      <ol aria-live="polite" className="ui-steps-list" role="status">
        <Step
          detail={
            modelReady
              ? "準備できました。"
              : "初回だけ、少し時間がかかります。次からは、この端末に保存されます。"
          }
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
        <Step
          detail="この端末の中で、問いの意味を数字に変えています。文章は外へ出ません。"
          state={embedState}
          title="問いを数字にする"
        />
        <Step
          detail="数字だけを送って、意味の近い分野と先生を探します。"
          state={searchState}
          title="近い分野と先生を探す"
        />
      </ol>
    </div>
  );
}
