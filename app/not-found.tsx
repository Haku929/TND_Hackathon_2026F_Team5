import PageShell from "./components/PageShell";

export const metadata = { title: "ページが見つかりません" };

// 存在しない URL を開いたとき
export default function NotFound() {
  return (
    <PageShell
      backLabel="問いの入力へ"
      kicker="404"
      showNotice={false}
      title="ページが見つかりません"
    >
      <p>
        開こうとしたページは、ありませんでした。問いの入力から、はじめてください。
      </p>
    </PageShell>
  );
}
