"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import DeepenPanel from "../components/DeepenPanel";
import PageShell from "../components/PageShell";
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
            <span>{researcher.name}</span>
            {researcher.affiliation && (
              <span className="ui-tag ui-tag-warm">
                {researcher.affiliation}
              </span>
            )}
          </span>
          {theme && <span className="ui-theme-line">{theme}</span>}
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
  const [deepenOpen, setDeepenOpen] = useState(false);

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

      <div className="ui-deepen">
        {deepenOpen ? (
          <DeepenPanel
            question={question}
            field={field.name}
            term={field.term?.term ?? ""}
            teachers={field.researchers.map((r) => ({
              name: r.name,
              theme: parseResearchTheme(r.theme)[0]?.firstSentence ?? "",
            }))}
          />
        ) : (
          <>
            <p>
              この分野をもっと知りたいときは、自分の AI
              に聞くための質問文をつくれます。
            </p>
            <button
              className="ui-btn ui-btn-quiet"
              onClick={() => setDeepenOpen(true)}
              type="button"
            >
              この分野を深める
            </button>
          </>
        )}
      </div>
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
        <span className="ui-tag">AI</span>{" "}
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
              role="tablist"
            >
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
            <span className="ui-tag ui-tag-blue">隣の分野</span>
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
