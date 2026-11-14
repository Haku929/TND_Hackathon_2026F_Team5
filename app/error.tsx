"use client";

import PageShell from "./components/PageShell";

// 画面の表示中に、予期しないエラーが起きたとき
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <PageShell
      kicker="エラー"
      showBack={false}
      showNotice={false}
      title="うまく表示できませんでした"
    >
      <p>
        一時的な問題かもしれません。もう一度ためしても直らないときは、時間をおいて開き直してください。
      </p>
      <p style={{ marginTop: "var(--sp-6)" }}>
        <button className="ui-btn" onClick={() => retry()} type="button">
          もう一度ためす
        </button>
      </p>
    </PageShell>
  );
}
