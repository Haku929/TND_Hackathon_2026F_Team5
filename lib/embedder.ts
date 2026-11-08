"use client";

import type {
  EmbedderRequest,
  EmbedderResponse,
  EmbeddingKind,
} from "./embedder-protocol";

export type EmbedderStatus =
  | { state: "loading"; progress: number; file: string }
  | { state: "ready"; progress: 100 }
  | { state: "error"; progress: number; message: string };

type PendingEmbedding = {
  resolve: (vector: number[]) => void;
  reject: (error: Error) => void;
};

const initialStatus: EmbedderStatus = {
  state: "loading",
  progress: 0,
  file: "モデル",
};

class Embedder {
  private readonly worker: Worker;
  private readonly listeners = new Set<(status: EmbedderStatus) => void>();
  private readonly pendingEmbeddings = new Map<number, PendingEmbedding>();
  private nextId = 0;
  private initialization: Promise<void> | null = null;
  private resolveInitialization: (() => void) | null = null;
  private rejectInitialization: ((error: Error) => void) | null = null;
  private currentStatus: EmbedderStatus = initialStatus;

  constructor() {
    this.worker = new Worker(new URL("./embedder.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.addEventListener("error", this.handleWorkerError);
    this.worker.addEventListener("messageerror", this.handleMessageError);
  }

  get status() {
    return this.currentStatus;
  }

  subscribe(listener: (status: EmbedderStatus) => void) {
    this.listeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.listeners.delete(listener);
    };
  }

  initialize() {
    if (this.currentStatus.state === "ready") return Promise.resolve();
    if (this.initialization) return this.initialization;

    this.initialization = new Promise<void>((resolve, reject) => {
      this.resolveInitialization = resolve;
      this.rejectInitialization = reject;
    });
    this.worker.postMessage({ type: "load" } satisfies EmbedderRequest);
    return this.initialization;
  }

  async embed(text: string, kind: EmbeddingKind = "query") {
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error("入力文が空です");
    }
    await this.initialize();

    const id = this.nextId++;
    const result = new Promise<number[]>((resolve, reject) => {
      this.pendingEmbeddings.set(id, { resolve, reject });
    });
    this.worker.postMessage({
      type: "embed",
      id,
      text: trimmedText,
      kind,
    } satisfies EmbedderRequest);
    return result;
  }

  private setStatus(status: EmbedderStatus) {
    this.currentStatus = status;
    this.listeners.forEach((listener) => listener(status));
  }

  private handleMessage = (event: MessageEvent<EmbedderResponse>) => {
    const response = event.data;
    if (response.type === "progress") {
      this.setStatus({
        state: "loading",
        progress: response.progress,
        file: response.file,
      });
      return;
    }

    if (response.type === "ready") {
      this.setStatus({ state: "ready", progress: 100 });
      this.resolveInitialization?.();
      this.resolveInitialization = null;
      this.rejectInitialization = null;
      return;
    }

    if (response.type === "embedded") {
      this.pendingEmbeddings.get(response.id)?.resolve(response.vector);
      this.pendingEmbeddings.delete(response.id);
      return;
    }

    const error = new Error(response.message);
    if (response.id !== undefined) {
      this.pendingEmbeddings.get(response.id)?.reject(error);
      this.pendingEmbeddings.delete(response.id);
      return;
    }

    this.setStatus({
      state: "error",
      progress: this.currentStatus.progress,
      message: response.message,
    });
    this.rejectInitialization?.(error);
    this.resolveInitialization = null;
    this.rejectInitialization = null;
    this.initialization = null;
  };

  private handleWorkerError = (event: ErrorEvent) => {
    this.failAll(
      new Error(event.message || "埋め込みWorkerでエラーが発生しました"),
    );
  };

  private handleMessageError = () => {
    this.failAll(new Error("埋め込みWorkerとの通信に失敗しました"));
  };

  private failAll(error: Error) {
    this.setStatus({
      state: "error",
      progress: this.currentStatus.progress,
      message: error.message,
    });
    this.rejectInitialization?.(error);
    this.resolveInitialization = null;
    this.rejectInitialization = null;
    this.initialization = null;
    this.pendingEmbeddings.forEach(({ reject }) => reject(error));
    this.pendingEmbeddings.clear();
  }
}

let embedder: Embedder | null = null;

export function getEmbedder() {
  embedder ??= new Embedder();
  return embedder;
}
