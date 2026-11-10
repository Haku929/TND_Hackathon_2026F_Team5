import PageShell from "../components/PageShell";

export const metadata = { title: "このアプリについて" };

export default function AboutPage() {
  return (
    <PageShell
      kicker="はじめての人へ"
      title="このアプリについて"
      showNotice={false}
    >
      <section className="ui-section">
        <h2>どんなアプリか</h2>
        <p>
          日常の言葉で書いた「気になること」から、近い学問の分野と、その分野を研究している先生を見つけるアプリです。専門用語を知らなくても使えます。
        </p>
      </section>

      <section className="ui-section">
        <h2>
          問いの文章は送りません <span className="ui-tag">端末の中</span>
        </h2>
        <p>
          問いと研究の近さを調べる AI
          は、あなたの端末（ブラウザ）の中で動きます。問いの文章はサーバーに送らず、保存もしません。ログインも履歴もありません。
        </p>
      </section>

      <section className="ui-section">
        <h2>データの出典</h2>
        <p>
          出典: KAKEN（国立情報学研究所）{" "}
          <a href="https://kaken.nii.ac.jp/" target="_blank" rel="noreferrer">
            https://kaken.nii.ac.jp/
          </a>{" "}
          ／ 加工して表示
        </p>
      </section>

      <section className="ui-section">
        <h2>気をつけてほしいこと</h2>
        <div className="ui-callout">
          先生との近さは AI
          による推定で、入試やカリキュラムの情報ではありません。進路を決めるときは、大学の公式な情報も確かめてください。このアプリは、大学の公式サービスではありません。
        </div>
      </section>
    </PageShell>
  );
}
