import Link from "next/link";
import type { ReactNode } from "react";

// 結果画面以外の画面に共通の外枠。題名・戻るリンク・「非公式」の注記を持つ。
export default function PageShell({
  kicker,
  title,
  backLabel = "もどる",
  showBack = true,
  showNotice = true,
  showSource = false,
  children,
}: {
  kicker: string;
  title: string;
  backLabel?: string;
  showBack?: boolean;
  showNotice?: boolean;
  // 先生・分野のデータを出す画面では、出典（KAKEN）を載せる
  showSource?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="ui-page">
      <main className="ui-main">
        {showBack ? (
          <Link href="/" className="ui-back">
            ← {backLabel}
          </Link>
        ) : (
          <div className="ui-back-space" />
        )}
        <p className="ui-kicker">{kicker}</p>
        <h1 className="ui-title">{title}</h1>
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
