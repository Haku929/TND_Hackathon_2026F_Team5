"use client";

import { useState } from "react";
import { buildPrompt, type PromptInput } from "@/lib/prompt";

// 飾りのアイコン。読み上げない
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// 「深める」: 質問文のプレビューとコピー。アプリの外の AI に渡す画面（F-12〜F-16）。
export default function DeepenPanel(props: PromptInput) {
  const text = buildPrompt(props);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <section aria-labelledby="deepen-title" className="ui-outer">
      <span className="ui-outer-tag">
        アプリの外
        <svg
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 8l4-4M4.5 4H8v3.5" />
        </svg>
      </span>
      <h2 id="deepen-title">ここから先は、アプリの外です</h2>
      <p>
        この質問文は、あなたが使っている AI（ChatGPT
        など）に渡すためのものです。このアプリから自動で送ることはありません。送るかどうかは、あなたが決めてください。
      </p>

      <ol className="ui-steps">
        <li>
          <b aria-hidden="true">1</b>
          <span>下の質問文を読んで、必要なら自分の言葉に直す</span>
        </li>
        <li>
          <b aria-hidden="true">2</b>
          <span>コピーして、自分の AI に貼り付ける</span>
        </li>
      </ol>

      <div className="ui-quote">
        <div className="ui-quote-bar">
          <span className="ui-quote-label">質問文</span>
          <button type="button" onClick={copy} className="ui-copy">
            {status === "copied" ? (
              <>
                <Icon>
                  <path d="M3 8.5l3.5 3.5L13 4.5" />
                </Icon>
                コピーしました
              </>
            ) : (
              <>
                <Icon>
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
                  <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
                </Icon>
                コピー
              </>
            )}
          </button>
        </div>
        <pre aria-label="コピーされる質問文" className="ui-preview">
          {text}
        </pre>
      </div>

      {/* コピーできた・できなかった（読み上げ用。失敗のときだけ目にも見せる） */}
      <p role="status" className={status === "failed" ? "ui-error" : "ui-sr"}>
        {status === "copied" &&
          "コピーしました。自分の AI に貼り付けてください。"}
        {status === "failed" &&
          "コピーできませんでした。上の文章を選んで、手でコピーしてください。"}
      </p>
    </section>
  );
}
