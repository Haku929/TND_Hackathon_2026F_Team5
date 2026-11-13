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
          学部や研究室を選ぶ前に、「自分の気になることは、学問ではどう呼ばれているのか」を知るためのアプリです。日常の言葉で書いた問いから、近い学問の分野と、その分野を研究している先生を見つけます。専門用語を知らなくても使えます。
        </p>
      </section>

      <section className="ui-section">
        <h2>使い方</h2>
        <ol className="ui-howto">
          <li>
            <b aria-hidden="true">1</b>
            <span>
              気になることを、ふだんの言葉で書きます（例文から選んでもかまいません）。
            </span>
          </li>
          <li>
            <b aria-hidden="true">2</b>
            <span>
              近い分野がタブで並びます。分野ごとに、ひとことでの説明、その分野での呼び名、よくある誤解、研究している先生を見られます。ときどき、少し離れた「隣の分野」も混ぜて見せます。
            </span>
          </li>
          <li>
            <b aria-hidden="true">3</b>
            <span>
              もっと知りたくなったら「深める」で質問文をコピーして、自分の
              AI（ChatGPT など）に聞いてみます。ここから先は、アプリの外です。
            </span>
          </li>
        </ol>
      </section>

      <section className="ui-section">
        <h2>問いの文章は送りません</h2>
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
