"use client";

import { useState } from "react";
import { buildPrompt, type PromptInput } from "@/lib/prompt";

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
      <span className="ui-outer-tag">アプリの外</span>
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

      <pre tabIndex={0} aria-label="コピーされる質問文" className="ui-preview">
        {text}
      </pre>

      <button type="button" onClick={copy} className="ui-copy">
        {status === "copied" ? "コピーしました ✓" : "質問文をコピーする"}
      </button>
      <p role="status" className="ui-status">
        {status === "copied" && "自分の AI に貼り付けてください。"}
        {status === "failed" &&
          "コピーできませんでした。上の文章を選んで、手でコピーしてください。"}
      </p>
    </section>
  );
}
