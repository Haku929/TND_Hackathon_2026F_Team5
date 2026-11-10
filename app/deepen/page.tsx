import DeepenPanel from "../components/DeepenPanel";
import PageShell from "../components/PageShell";

// 結果画面（T-14）がまだないので、ダミーの値で「深める」を単独で確認するページ。
// 結果画面ができたら、そこから DeepenPanel に実データを渡す。
export const metadata = { title: "深める" };

export default function DeepenPage() {
  return (
    <PageShell
      kicker="深める"
      title="他者とは、自分にとってどういう存在なのだろうか。"
      backLabel="結果にもどる"
    >
      <DeepenPanel
        question="他者とは、自分にとってどういう存在なのだろうか。"
        field="哲学"
        term="他者論"
        teachers={[
          { name: "○○ ○○", theme: "現象学" },
          { name: "△△ △△", theme: "倫理学" },
        ]}
      />
    </PageShell>
  );
}
