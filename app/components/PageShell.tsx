import Link from "next/link";
import type { ReactNode } from "react";

// 結果画面以外の画面に共通の外枠。題名・戻るリンク・「非公式」の注記を持つ。
export default function PageShell({
  kicker,
  title,
  backLabel = "もどる",
  showBack = true,
  onBack,
  showNotice = true,
  showSource = false,
  hero = false,
  continued = false,
  layout = "narrow",
  children,
}: {
  kicker: string;
  title: string;
  backLabel?: string;
  showBack?: boolean;
  // 指定すると、戻るリンクの代わりに、その場で呼ばれるボタンになる（検索を取りやめるときなど）
  onBack?: () => void;
  showNotice?: boolean;
  // 先生・分野のデータを出す画面では、出典（KAKEN）を載せる
  showSource?: boolean;
  // 入口の画面だけ、題名を大きくする
  hero?: boolean;
  // 前の画面から続いているとき。上の部分（戻る・題名）は動かさず、下だけを動かして入れる
  continued?: boolean;
  // 広い画面（PC）での並べ方。スマホでは、どれも 1 列。
  // narrow: 1 列のまま / split: 入口（左に題名、右に入力）/ wide: 結果（左にタブ、右に中身）
  layout?: "narrow" | "split" | "wide";
  children: ReactNode;
}) {
  return (
    <div className="ui-page">
      <main
        className={[
          "ui-main",
          continued && "is-continued",
          layout !== "narrow" && `is-${layout}`,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="ui-topbar">
          {onBack ? (
            <button className="ui-back" onClick={onBack} type="button">
              ← {backLabel}
            </button>
          ) : showBack ? (
            <Link href="/" className="ui-back">
              ← {backLabel}
            </Link>
          ) : (
            <span />
          )}
          <Link href="/" className="ui-brand" aria-label="問学（トップへ）">
            <span className="ui-seal" aria-hidden="true">
              問
            </span>
            <span className="ui-brand-name">問学</span>
          </Link>
        </div>
        <p className="ui-kicker">{kicker}</p>
        <h1 className={hero ? "ui-title ui-title-hero" : "ui-title"}>
          {title}
        </h1>
        {children}
        {showNotice && (
          <footer className="ui-foot">
            {showSource && (
              <p>
                出典: KAKEN（国立情報学研究所）{" "}
                <a
                  href="https://kaken.nii.ac.jp/"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://kaken.nii.ac.jp/
                </a>{" "}
                ／ 加工して表示しています。
              </p>
            )}
            <p>
              大学の公式サービスではない、非公式の作品です。先生との近さは AI
              による推定で、入試やカリキュラムの情報ではありません。進路を決めるときは、大学の公式な情報も確かめてください。
            </p>
          </footer>
        )}
      </main>
    </div>
  );
}
