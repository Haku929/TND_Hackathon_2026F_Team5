"use client";

import { useEffect, useRef, useState } from "react";
import { buildPrompt, type PromptInput } from "@/lib/prompt";

// 質問文を貼り付ける先の例。開くだけで、問いや質問文は渡さない（URL にも載せない）
const AI_SERVICES = [
  { name: "ChatGPT", href: "https://chatgpt.com/" },
  { name: "Claude", href: "https://claude.ai/" },
  { name: "Gemini", href: "https://gemini.google.com/" },
];

// 前回選んだ AI の名前。この端末（ブラウザ）にだけ置く。読めない・書けないときは、なかったことにする
const PREFERRED_KEY = "preferred-ai";

function readPreferred(): string | null {
  try {
    return localStorage.getItem(PREFERRED_KEY);
  } catch {
    return null;
  }
}

// 飾りのアイコン。読み上げない
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// 「深める」: 質問文のプレビューとコピー。アプリの外の AI に渡す画面（F-12〜F-16）。
export default function DeepenPanel(
  props: PromptInput & {
    // モーダルでは、見出しを上の帯に出すので、ここでは出さない
    hideTitle?: boolean;
  },
) {
  const text = buildPrompt(props);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  // 最後に押した AI の名前（そのボタンだけ、コピーできたしるしを出す）
  const [picked, setPicked] = useState<string | null>(null);
  // 開いた時点の「前回の AI」。押しても並びは変えない（動くと、押し間違える）
  const [preferred] = useState(readPreferred);
  const [services] = useState(() =>
    [...AI_SERVICES].sort(
      (a, b) => Number(b.name === preferred) - Number(a.name === preferred),
    ),
  );

  // 「コピーしました」は少しだけ見せて、元に戻す。連続で押しても、最後の押下から数える
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      timer.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <section
      aria-labelledby={props.hideTitle ? undefined : "deepen-title"}
      className="ui-outer"
    >
      {!props.hideTitle && <h2 id="deepen-title">AI に質問してみよう</h2>}

      <ul className="ui-ai-links">
        {services.map((service) => (
          <li key={service.name}>
            <a
              className={
                service.name === preferred ? "is-preferred" : undefined
              }
              href={service.href}
              // 先にコピーして、そのまま新しいタブで開く（リンクの動きは止めない）
              onClick={() => {
                setPicked(service.name);
                try {
                  localStorage.setItem(PREFERRED_KEY, service.name);
                } catch {
                  // 覚えられなくても、そのまま開ける
                }
                void copy();
              }}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span>{service.name}</span>
              <span className="ui-ai-side">
                {service.name === preferred && (
                  <span className="ui-ai-last">前回</span>
                )}
                {status === "copied" && picked === service.name ? (
                  <svg
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 12 12"
                  >
                    <path d="M4 8l4-4M4.5 4H8v3.5" />
                  </svg>
                )}
              </span>
              <span className="ui-sr">（新しいタブで開く）</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="ui-quote">
        <div className="ui-quote-bar">
          <span className="ui-quote-label">質問文</span>
          <button
            type="button"
            onClick={copy}
            className={status === "copied" ? "ui-copy is-done" : "ui-copy"}
          >
            {status === "copied" ? (
              <>
                <Icon>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </Icon>
                コピーしました
              </>
            ) : (
              <>
                <Icon>
                  <rect x="9" y="9" width="12" height="12" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
          "コピーしました。開いた AI に貼り付けてください。"}
        {status === "failed" &&
          "コピーできませんでした。上の文章を選んで、手でコピーしてください。"}
      </p>
    </section>
  );
}
