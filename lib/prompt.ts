// 「深める」画面で、利用者が自分の AI に貼り付ける質問文を組み立てる。
// テンプレートは docs/SPEC.md 4.4 に従う。ここで外部へ送信はしない（F-14）。

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
  const lines = [
    "最近、こんなことが気になっています。",
    question.trim(),
    `${field}では「${term}」という言葉で語られるそうです。`,
    "",
  ];

  if (teachers.length > 0) {
    lines.push(
      "この大学では、次の先生がこれに近いテーマを研究しています。",
      ...teachers.map((t) => `- ${t.name}（${t.theme}）`),
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
