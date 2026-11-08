export type EmbeddingKind = "query" | "passage";

export type EmbedderRequest =
  | { type: "load" }
  | {
      type: "embed";
      id: number;
      text: string;
      kind: EmbeddingKind;
    };

export type EmbedderResponse =
  | { type: "progress"; progress: number; file: string }
  | { type: "ready" }
  | { type: "embedded"; id: number; vector: number[] }
  | { type: "error"; message: string; id?: number };
