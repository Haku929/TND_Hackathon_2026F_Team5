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
  clearFromSearch,
  parseStoredResult,
  readFromSearch,
  type SearchField,
  type SearchResearcher,
  type SearchResults,
} from "@/lib/result";

function subscribe() {
  return () => {};
}

// 広い画面（PC）では、タブを左に縦に並べる（CSS の @media と同じ幅）
const WIDE_QUERY = "(min-width: 1024px)";
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function getWide() {
  return window.matchMedia(WIDE_QUERY).matches;
}
function getWideServer() {
  return false;
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
  switched,
  leaving,
}: {
  field: SearchField;
  question: string;
  tabId: string;
  panelId: string;
  switched: boolean;
  // 別の分野へ切り替える途中（この中身が静かに引いている間）
  leaving: boolean;
}) {
  // 「深める」は、画面の上に重ねるダイアログ（モーダル）で開く
  // 開いた回数。閉じる動きの途中で中身が消えないよう、閉じても中身は残し、開くたびに作り直す（key）
  const [openCount, setOpenCount] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // スマートフォンでは、下へ引っ張って閉じられる
  useSheetDrag(dialogRef);

  return (
    <section
      aria-labelledby={tabId}
      className="ui-panel"
      data-leaving={leaving ? "true" : undefined}
      data-switched={switched ? "true" : undefined}
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

      <h3>この大学で学べる先生</h3>
      {field.researchers.length === 0 ? (
        <p className="ui-sub">先生の情報はまだありません。</p>
      ) : (
        <>
          <ul className="ui-people">
            {field.researchers.map((researcher) => (
              <Person key={researcher.id} researcher={researcher} />
            ))}
          </ul>
        </>
      )}

      <aside aria-labelledby={`${panelId}-deepen`} className="ui-deepen">
        <h3 id={`${panelId}-deepen`}>AI に聞いて、さらに深めよう</h3>
        <p>
          この分野の質問文を用意しました。ChatGPT・Claude・Gemini
          などに貼り付ければ、続きを詳しく聞けます。
        </p>
        <button
          className="ui-btn"
          onClick={() => {
            setOpenCount((n) => n + 1);
            dialogRef.current?.showModal();
            // 最初のフォーカスは「閉じる」ではなく、ダイアログ自身に置く（輪郭が出て目立つため）
            dialogRef.current?.focus({ preventScroll: true });
          }}
          type="button"
        >
          質問文を見る
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
        ref={dialogRef}
      >
        <div className="ui-modal-bar">
          <h2 className="ui-modal-title">AI に質問してみよう</h2>
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
        {openCount > 0 && (
          <DeepenPanel
            hideTitle
            key={openCount}
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

// 古い中身が静かに引くのを待つ時間（ミリ秒。CSS の [data-leaving] と合わせる）
const PANEL_LEAVE_MS = 140;

function ResultBody({
  question,
  results,
}: {
  question: string;
  results: SearchResults;
}) {
  // 検索中の画面から続いて来たか（上は動かさず、下だけを動かして入れる）
  const [continued] = useState(readFromSearch);
  useEffect(() => {
    clearFromSearch();
  }, []);
  // 分野を切り替えたあとの中身は、大きく動かさず、短いフェードだけにする（CSS の data-switched）
  const [switched, setSwitched] = useState(false);
  const vertical = useSyncExternalStore(subscribeWide, getWide, getWideServer);
  // タブはすぐ動き、中身は、古いものが静かに引いてから替わる
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(0);
  const [shownIndex, setShownIndex] = useState(0);
  const [panelLeaving, setPanelLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const selectedField = results.fields[shownIndex];

  function selectField(index: number) {
    if (index === selectedFieldIndex) return;
    setSelectedFieldIndex(index);
    setSwitched(true);
    clearTimeout(leaveTimer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShownIndex(index);
      setPanelLeaving(false);
      return;
    }
    setPanelLeaving(true);
    leaveTimer.current = setTimeout(() => {
      setShownIndex(index);
      setPanelLeaving(false);
    }, PANEL_LEAVE_MS);
  }
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
      indicator.style.setProperty("--y", `${tab.offsetTop}px`);
      indicator.style.setProperty("--h", `${tab.offsetHeight}px`);
    };
    place();
    // 最初の配置は動かさない（すべる動きを入れるのは、最初の絵が出たあと）。
    // すぐに入れると、下線が幅 0 から伸びて見える
    let frame = 0;
    if (indicator.dataset.ready !== "true") {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          indicator.dataset.ready = "true";
        });
      });
    }
    // 選んだタブが横に隠れているときだけ、見える位置まで動かす（ページは縦に動かさない）
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < tabs.scrollLeft || right > tabs.scrollLeft + tabs.clientWidth) {
      tabs.scrollTo({
        left: left - (tabs.clientWidth - tab.offsetWidth) / 2,
        behavior: "smooth",
      });
    }

    window.addEventListener("resize", place);
    void document.fonts?.ready.then(place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
    };
  }, [selectedFieldIndex]);

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) {
    const count = results.fields.length;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (i + 1) % count;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (i - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;

    event.preventDefault();
    selectField(next);
    document.getElementById(`field-tab-${next}`)?.focus();
  }

  return (
    <PageShell
      continued={continued}
      layout="wide"
      kicker="あなたの問い"
      title={question}
      backLabel="問いを書き直す"
      showSource
    >
      {/* タブも、中身も、「別の視点」も、ひとつの塊にする（入ってくるとき、ばらばらに動いて見えないように） */}
      <div className="ui-result">
        {results.fields.length === 0 ? (
          <p className="ui-errmsg">
            近い分野が見つかりませんでした。別の問いでも試してみてください。
          </p>
        ) : (
          <>
            <div className="ui-tabs-wrap">
              <div
                aria-label="問いに近い分野"
                aria-orientation={vertical ? "vertical" : "horizontal"}
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
                    onClick={() => selectField(index)}
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
                switched={switched}
                // 分野を切り替えたら「深める」は閉じた状態に戻す
                key={selectedField.id}
                field={selectedField}
                leaving={panelLeaving}
                panelId={`field-panel-${shownIndex}`}
                question={question}
                tabId={`field-tab-${shownIndex}`}
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
      </div>
    </PageShell>
  );
}
