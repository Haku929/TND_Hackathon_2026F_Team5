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
    <section
      aria-labelledby="deepen-title"
      className="rounded-lg p-5 sm:p-6"
      style={{
        background: "var(--ui-outer-bg)",
        color: "var(--ui-outer-ink)",
        border: "1px solid var(--ui-outer-line)",
      }}
    >
      <p
        className="inline-block rounded px-2 text-xs"
        style={{ border: "1px solid var(--ui-outer-line)" }}
      >
        アプリの外
      </p>
      <h2 id="deepen-title" className="mt-2 text-xl font-bold">
        ここから先は、アプリの外
      </h2>
      <p className="mt-2 text-base leading-7">
        この質問文は、あなたが使っている AI（ChatGPT
        など）に貼り付けて使います。このアプリから自動で送ることはありません。送るかどうかは、あなたが決めてください。
      </p>

      <pre
        tabIndex={0}
        aria-label="コピーされる質問文"
        className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded p-3 text-sm leading-7"
        style={{ border: "1px solid var(--ui-outer-line)", font: "inherit" }}
      >
        {text}
      </pre>

      <p role="status" className="mt-4 min-h-6 text-sm font-bold">
        {status === "copied" &&
          "コピーしました。自分の AI に貼り付けてください。"}
        {status === "failed" &&
          "コピーできませんでした。上の文章を選んで、手でコピーしてください。"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="min-h-11 rounded px-5 font-bold"
          style={{
            background: "var(--ui-outer-ink)",
            color: "var(--ui-outer-bg)",
          }}
        >
          質問文をコピーする
        </button>
      </div>
    </section>
  );
}
