import Link from "next/link";
import DeepenPanel from "../components/DeepenPanel";

// 結果画面（T-14）がまだないので、ダミーの値で「深める」を単独で確認するページ。
// 結果画面ができたら、そこから DeepenPanel に実データを渡す。
export const metadata = { title: "深める" };

export default function DeepenPage() {
  return (
    <main
      className="mx-auto w-full max-w-170 px-4 py-6"
      style={{ background: "var(--ui-bg)", color: "var(--ui-ink)" }}
    >
      <Link href="/" style={{ color: "var(--ui-muted)" }} className="text-sm">
        ← 結果にもどる
      </Link>
      <h1 className="mt-4 mb-6 text-2xl font-bold">深める</h1>
      <DeepenPanel
        question="他者とは、自分にとってどういう存在なのだろうか。"
        field="哲学"
        term="他者論"
        teachers={[
          { name: "○○ ○○", theme: "現象学" },
          { name: "△△ △△", theme: "倫理学" },
        ]}
      />
    </main>
  );
}
