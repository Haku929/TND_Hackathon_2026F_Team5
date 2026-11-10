import Link from "next/link";
import type { ReactNode } from "react";

// 結果画面以外の画面に共通の外枠。題名・戻るリンク・「非公式」の注記を持つ。
export default function PageShell({
  kicker,
  title,
  backLabel = "もどる",
  showNotice = true,
  children,
}: {
  kicker: string;
  title: string;
  backLabel?: string;
  showNotice?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="ui-page">
      <main className="ui-main">
        <Link href="/" className="ui-back">
          ← {backLabel}
        </Link>
        <p className="ui-kicker">{kicker}</p>
        <h1 className="ui-title">{title}</h1>
        {children}
        {showNotice && (
          <footer className="ui-foot">
            大学の公式サービスではない、非公式の作品です。先生との近さは AI
            による推定で、入試やカリキュラムの情報ではありません。進路を決めるときは、大学の公式な情報も確かめてください。
          </footer>
        )}
      </main>
    </div>
  );
}
