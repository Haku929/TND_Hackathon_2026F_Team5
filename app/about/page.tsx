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
        <h2>
          AI はどこで動いているか <span className="ui-tag">端末の中</span>
        </h2>
        <p>
          あなたの問いと、分野・先生の研究テーマの「意味の近さ」を計算するところだけで、小さな
          AI モデルを使っています。この AI
          は、あなたの端末（ブラウザ）の中で動きます。
        </p>
      </section>

      <section className="ui-section">
        <h2>
          問いは保存しません <span className="ui-tag">送らない</span>
        </h2>
        <p>
          入力した問いの文章は、サーバーに送りません。保存もしません。ログインも履歴もありません。サーバーに届くのは、問いを数値に変えたものだけです。
        </p>
      </section>

      <section className="ui-section">
        <h2>
          「深める」の画面について <span className="ui-tag">アプリの外</span>
        </h2>
        <p>
          質問文をコピーして貼り付ける先の AI（ChatGPT
          など）は、このアプリの外にあります。このアプリから自動で送ることはなく、送るかどうかはあなたが決めます。
        </p>
      </section>

      <section className="ui-section">
        <h2>データの出典</h2>
        <p>
          先生の名前・所属・研究テーマは、KAKEN（科学研究費助成事業データベース）のデータをもとに、このアプリ用に加工したものです。
        </p>
      </section>

      <section className="ui-section">
        <h2>気をつけてほしいこと</h2>
        <div className="ui-callout">
          先生との近さは AI
          による推定で、入試やカリキュラムの情報ではありません。進路を決めるときは、大学の公式な情報も確かめてください。
        </div>
      </section>

      <section className="ui-section">
        <h2>公式のサービスではありません</h2>
        <p>
          これは大学の公式サービスではなく、有志が作った非公式の作品です。大学のロゴ・校章は使っていません。
        </p>
      </section>
    </PageShell>
  );
}
