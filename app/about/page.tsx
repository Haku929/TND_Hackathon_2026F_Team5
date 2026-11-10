import Link from "next/link";

export const metadata = { title: "このアプリについて" };

const items = [
  {
    title: "AI はどこで動いているか",
    body: "あなたの問いと分野・先生の研究テーマの「意味の近さ」を計算するところだけで、小さな AI モデルを使っています。この AI はあなたの端末（ブラウザ）の中で動きます。",
  },
  {
    title: "問いは保存しません",
    body: "入力した問いの文章は、サーバーに送りません。保存もしません。ログインも履歴もありません。サーバーに届くのは、問いを数値に変えたものだけです。",
  },
  {
    title: "「深める」の画面について",
    body: "質問文をコピーして貼り付ける先の AI（ChatGPT など）は、このアプリの外にあります。このアプリから自動で送ることはなく、送るかどうかはあなたが決めます。",
  },
  {
    title: "データの出典",
    body: "先生の名前・所属・研究テーマは、KAKEN（科学研究費助成事業データベース）のデータをもとに、このアプリ用に加工したものです。",
  },
  {
    title: "気をつけてほしいこと",
    body: "先生との近さは AI による推定で、入試やカリキュラムの情報ではありません。進路を決めるときは、大学の公式な情報も確かめてください。",
  },
  {
    title: "公式のサービスではありません",
    body: "これは大学の公式サービスではなく、有志が作った非公式の作品です。大学のロゴ・校章は使っていません。",
  },
];

export default function AboutPage() {
  return (
    <main
      className="mx-auto w-full max-w-170 px-4 py-6 leading-8"
      style={{ background: "var(--ui-bg)", color: "var(--ui-ink)" }}
    >
      <Link href="/" style={{ color: "var(--ui-muted)" }} className="text-sm">
        ← もどる
      </Link>
      <h1 className="mt-4 mb-6 text-2xl font-bold">このアプリについて</h1>
      {items.map((it) => (
        <section key={it.title} className="mb-6">
          <h2 className="text-lg font-bold">{it.title}</h2>
          <p className="mt-1">{it.body}</p>
        </section>
      ))}
    </main>
  );
}
