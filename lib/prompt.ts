// 「深める」画面で、利用者が自分の AI に貼り付ける質問文を組み立てる。
// テンプレートは docs/SPEC.md 4.4 に従う。ここで外部へ送信はしない（F-14）。

// 質問文に差し込むデータ由来の文字列の長さの上限（文字数）
const MAX_NAME = 40;
const MAX_THEME = 80;
const MAX_LABEL = 40;

/**
 * データ（KAKEN など）由来の 1 行の文字列を整える。
 * 改行・タブ・制御文字は空白にし、ゼロ幅などの見えない文字は消し、
 * 連続する空白を 1 つにして、長すぎれば切る。
 * 質問文は行ごとの箇条書きなので、改行が混ざると形が崩れる。
 */
export function cleanLine(text: string, max: number): string {
  const s = text
    .replace(/\p{Cf}/gu, "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(s);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : s;
}

// 利用者が書いた問いは、改行は残し、制御文字と見えない文字だけ除く
function cleanQuestion(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\p{Cf}/gu, "")
    .replace(/[^\P{Cc}\n]/gu, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type PromptTeacher = {
  name: string;
  theme: string;
};

export type PromptInput = {
  question: string;
  field: string;
  term: string;
  teachers: PromptTeacher[];
};

export function buildPrompt({
  question,
  field,
  term,
  teachers,
}: PromptInput): string {
  const fieldText = cleanLine(field, MAX_LABEL);
  // 「」で囲むので、用語の中の「」は除く
  const termText = cleanLine(term.replace(/[「」]/g, ""), MAX_LABEL);

  const lines = [
    "最近、こんなことが気になっています。",
    cleanQuestion(question),
    // 呼び名が無い分野では、この一文を省く
    termText
      ? `${fieldText}では「${termText}」という言葉で語られるそうです。`
      : `${fieldText}について気になっています。`,
    "",
  ];

  // 名前が空の先生は載せない。研究テーマが空なら、カッコも付けない
  const items = teachers
    .map((t) => ({
      name: cleanLine(t.name, MAX_NAME),
      // カッコの中なので、文末の句点は取る
      theme: cleanLine(t.theme, MAX_THEME).replace(/[。．]$/, ""),
    }))
    .filter((t) => t.name);

  if (items.length > 0) {
    lines.push(
      "この大学では、次の先生がこれに近いテーマを研究しています。",
      ...items.map((t) =>
        t.theme ? `- ${t.name}（${t.theme}）` : `- ${t.name}`,
      ),
      "",
      "この先生たちの研究の方向性も手がかりにして、詳しく教えてください。",
    );
  } else {
    lines.push("詳しく教えてください。");
  }

  lines.push(
    "ほかの分野に面白いつながりがあれば、それも知りたいです。",
    "",
    "それから、この分野の研究者が、自分の研究の面白さやロマンを語っている記事やインタビューがあれば、出典のURLを添えて引用・紹介してください。",
    "見つからなければ、無理に作らないでください。",
    "本や人の名前を出すときも、確かなものだけにしてください。",
  );

  return lines.join("\n");
}
