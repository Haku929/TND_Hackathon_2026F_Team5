"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import DeepenPanel from "../components/DeepenPanel";
import PageShell from "../components/PageShell";
import { useSheetDrag } from "@/lib/use-sheet-drag";
import {
  RESULT_STORAGE_KEY,
  parseResearchTheme,
  parseStoredResult,
  type SearchField,
  type SearchResearcher,
  type SearchResults,
} from "@/lib/result";

function subscribe() {
  return () => {};
}
function getSnapshot(): string | null {
  try {
    return sessionStorage.getItem(RESULT_STORAGE_KEY);
  } catch {
    return null;
  }
}
function getServerSnapshot(): string | null {
  return null;
}

export default function ResultView() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const stored = useMemo(() => parseStoredResult(raw), [raw]);

  if (!stored) {
    return (
      <PageShell
        kicker="結果"
        title="結果が見つかりません"
        backLabel="問いを書き直す"
      >
        <p>
          このタブには、検索結果がありません。
          <Link href="/">問いの入力</Link>から、もう一度探してください。
        </p>
      </PageShell>
    );
  }

  return <ResultBody question={stored.question} results={stored.results} />;
}

// 先生 1 人。見出し（名前・学部・テーマの第一文）は常に見え、開くと詳しく読める
function Person({ researcher }: { researcher: SearchResearcher }) {
  const projects = parseResearchTheme(researcher.theme);
  const theme = projects[0]?.firstSentence ?? "";
  const keywords = [
    ...new Set(projects.map((p) => p.keywords).filter(Boolean)),
  ].join("、");
  const overview = projects
    .map((p) => p.abstract)
    .filter(Boolean)
    .join("\n\n");

  return (
    <li>
      <details className="ui-person">
        <summary>
          <span className="ui-who">
            <span>{researcher.name} 先生</span>
            {researcher.affiliation && (
              <span className="ui-tag ui-tag-warm">
                {researcher.affiliation}
              </span>
            )}
          </span>
          {theme && <span className="ui-theme-line">{theme}</span>}
          <span aria-hidden="true" className="ui-toggle" />
        </summary>
        <dl className="ui-more">
          {!theme && !keywords && !overview && (
            <dd>研究テーマの情報はありません。</dd>
          )}
          {keywords && (
            <>
              <dt>キーワード</dt>
              <dd>{keywords}</dd>
            </>
          )}
          {overview && (
            <dd>
              <details>
                <summary>研究の概要を読む</summary>
                <p>{overview}</p>
              </details>
            </dd>
          )}
          <dd>
            <a href={researcher.kaken_url} rel="noreferrer" target="_blank">
              KAKEN で研究者ページを見る ↗
            </a>
          </dd>
        </dl>
      </details>
    </li>
  );
}

function FieldPanel({
  field,
  question,
  tabId,
  panelId,
}: {
  field: SearchField;
  question: string;
  tabId: string;
  panelId: string;
}) {
  // 「深める」は、画面の上に重ねるダイアログ（モーダル）で開く
  const [deepenOpen, setDeepenOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // スマートフォンでは、下へ引っ張って閉じられる
  useSheetDrag(dialogRef);

  return (
    <section
      aria-labelledby={tabId}
      className="ui-panel"
      id={panelId}
      role="tabpanel"
      tabIndex={0}
    >
      <h2>{field.name}</h2>
      <p>{field.summary}</p>
      {field.term && (
        <p>
          あなたの問いは、この分野では{" "}
          <mark className="ui-mark">{field.term.term}</mark> と呼ばれます。
          {field.term.description && <> {field.term.description}</>}
        </p>
      )}
      <div className="ui-callout">
        <span className="ui-callout-label">よくある誤解</span>
        {field.misconception}
      </div>

      <h3>
        この大学で学べる先生{" "}
        <span className="ui-tag">{field.researchers.length}人</span>
      </h3>
      {field.researchers.length === 0 ? (
        <p className="ui-sub">先生の情報はまだありません。</p>
      ) : (
        <>
          <p className="ui-sub">
            問いに近いテーマを研究している順です（AI の推定）。
          </p>
          <ul className="ui-people">
            {field.researchers.map((researcher) => (
              <Person key={researcher.id} researcher={researcher} />
            ))}
          </ul>
        </>
      )}

      <aside aria-labelledby={`${panelId}-deepen`} className="ui-deepen">
        <h3 id={`${panelId}-deepen`}>この分野を、もっと深く</h3>
        <p>
          気になったら、自分の AI（ChatGPT
          など）に聞くための質問文をつくれます。
        </p>
        <button
          className="ui-btn"
          onClick={() => {
            setDeepenOpen(true);
            dialogRef.current?.showModal();
            // 最初のフォーカスは「閉じる」ではなく、ダイアログ自身に置く（輪郭が出て目立つため）
            dialogRef.current?.focus({ preventScroll: true });
          }}
          type="button"
        >
          この分野を深める
        </button>
      </aside>

      <dialog
        aria-label={`${field.name}を深める`}
        className="ui-modal"
        tabIndex={-1}
        onClick={(event) => {
          // 外側（暗い部分）を押したら閉じる
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        onClose={() => setDeepenOpen(false)}
        ref={dialogRef}
      >
        <div className="ui-modal-bar">
          <button
            aria-label="閉じる"
            className="ui-modal-close"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {deepenOpen && (
          <DeepenPanel
            question={question}
            field={field.name}
            term={field.term?.term ?? ""}
            teachers={field.researchers.map((r) => ({
              name: r.name,
              theme: parseResearchTheme(r.theme)[0]?.firstSentence ?? "",
            }))}
          />
        )}
      </dialog>
    </section>
  );
}

function ResultBody({
  question,
  results,
}: {
  question: string;
  results: SearchResults;
}) {
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(0);
  const selectedField = results.fields[selectedFieldIndex];
  const tabsRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  // 選んだタブの下に、すべる下線（iOS のセグメントのように動く）を合わせる。
  // 状態は持たず、CSS 変数だけを直接書き換える
  useEffect(() => {
    const tabs = tabsRef.current;
    const indicator = indicatorRef.current;
    const tab = document.getElementById(`field-tab-${selectedFieldIndex}`);
    if (!tabs || !indicator || !tab) return;

    const place = () => {
      indicator.style.setProperty("--x", `${tab.offsetLeft}px`);
      indicator.style.setProperty("--w", `${tab.offsetWidth}px`);
    };
    place();
    // 最初の配置は動かさず、2 回目以降だけ動かす
    indicator.dataset.ready = "true";
    // 選んだタブが画面の外なら、見える位置まで動かす
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });

    window.addEventListener("resize", place);
    void document.fonts?.ready.then(place);
    return () => window.removeEventListener("resize", place);
  }, [selectedFieldIndex]);

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) {
    const count = results.fields.length;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (i + 1) % count;
    else if (event.key === "ArrowLeft") next = (i - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;

    event.preventDefault();
    setSelectedFieldIndex(next);
    document.getElementById(`field-tab-${next}`)?.focus();
  }

  return (
    <PageShell
      kicker="あなたの問い"
      title={question}
      backLabel="問いを書き直す"
      showSource
    >
      <p className="ui-privacy">
        問いは、この端末の外へ送られません。意味の近さは、この端末の中で動く{" "}
        <span className="ui-tag ui-tag-ai">AI</span>{" "}
        が計算しています。進路を決めるときは、大学の公式な情報も確かめてください。
      </p>

      {results.fields.length === 0 ? (
        <p className="ui-errmsg">
          近い分野が見つかりませんでした。別の問いでも試してみてください。
        </p>
      ) : (
        <>
          <div className="ui-tabs-wrap">
            <div
              aria-label="問いに近い分野"
              aria-orientation="horizontal"
              className="ui-tabs"
              ref={tabsRef}
              role="tablist"
            >
              <span
                aria-hidden="true"
                className="ui-tab-indicator"
                ref={indicatorRef}
              />
              {results.fields.map((field, index) => (
                <button
                  aria-controls={`field-panel-${index}`}
                  aria-selected={selectedFieldIndex === index}
                  className="ui-tab"
                  id={`field-tab-${index}`}
                  key={field.id}
                  onClick={() => setSelectedFieldIndex(index)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  role="tab"
                  tabIndex={selectedFieldIndex === index ? 0 : -1}
                  type="button"
                >
                  {field.name}
                </button>
              ))}
            </div>
          </div>

          {selectedField && (
            <FieldPanel
              // 分野を切り替えたら「深める」は閉じた状態に戻す
              key={selectedField.id}
              field={selectedField}
              panelId={`field-panel-${selectedFieldIndex}`}
              question={question}
              tabId={`field-tab-${selectedFieldIndex}`}
            />
          )}
        </>
      )}

      {results.low_similarity_fields.length > 0 && (
        <section aria-labelledby="adjacent-title" className="ui-section">
          <h2 id="adjacent-title">
            別の視点から見る{" "}
            <span className="ui-tag ui-tag-quiet">隣の分野</span>
          </h2>
          <ul className="ui-adjacent">
            {results.low_similarity_fields.map((field) => (
              <li key={field.id}>
                <h4>{field.name}</h4>
                <p>{field.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
