/// <reference lib="webworker" />

import {
  pipeline,
  type DataType,
  type ProgressInfo,
} from "@huggingface/transformers";
import embeddingConfig from "../shared/embedding.json";
import type { EmbedderRequest, EmbedderResponse } from "./embedder-protocol";

const workerScope = self as DedicatedWorkerGlobalScope;
type FeatureExtractor = Awaited<
  ReturnType<typeof pipeline<"feature-extraction">>
>;

let extractor: FeatureExtractor | null = null;

function postMessage(message: EmbedderResponse) {
  workerScope.postMessage(message);
}

function reportProgress(info: ProgressInfo) {
  if (info.status === "ready") return;

  const file = "file" in info ? info.file : "モデル";
  const progress =
    info.status === "progress_total" || info.status === "progress"
      ? info.progress
      : 0;

  postMessage({
    type: "progress",
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    file,
  });
}

function getModelDtype(): DataType {
  if (embeddingConfig.dtype === "q8") return "q8";
  throw new Error(`Unsupported model dtype: ${embeddingConfig.dtype}`);
}

async function loadExtractor(device: "webgpu" | "wasm") {
  return pipeline("feature-extraction", embeddingConfig.model, {
    device,
    dtype: getModelDtype(),
    progress_callback: reportProgress,
  });
}

async function initialize() {
  if (extractor) return;

  if (!("gpu" in workerScope.navigator)) {
    extractor = await loadExtractor("wasm");
    return;
  }

  try {
    extractor = await loadExtractor("webgpu");
  } catch (webGpuError) {
    try {
      extractor = await loadExtractor("wasm");
    } catch (wasmError) {
      const webGpuMessage =
        webGpuError instanceof Error
          ? webGpuError.message
          : String(webGpuError);
      const wasmMessage =
        wasmError instanceof Error ? wasmError.message : String(wasmError);
      throw new Error(
        `WebGPU failed: ${webGpuMessage}. WASM fallback failed: ${wasmMessage}`,
      );
    }
  }
}

function normalize(vector: number[]) {
  if (vector.length !== embeddingConfig.dimensions) {
    throw new Error(
      `Expected ${embeddingConfig.dimensions} dimensions, received ${vector.length}`,
    );
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error("The model returned a vector that cannot be normalized");
  }

  return vector.map((value) => value / norm);
}

async function handleRequest(request: EmbedderRequest) {
  if (request.type === "load") {
    try {
      await initialize();
      postMessage({ type: "ready" });
    } catch (error) {
      postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  try {
    await initialize();
    if (!extractor) {
      throw new Error("The embedding model did not initialize");
    }

    const prefix =
      request.kind === "query"
        ? embeddingConfig.query_prefix
        : embeddingConfig.passage_prefix;
    const output = await extractor(`${prefix}${request.text}`, {
      pooling: "mean",
      normalize: false,
    });

    postMessage({
      type: "embedded",
      id: request.id,
      vector: normalize(Array.from(output.data, Number)),
    });
  } catch (error) {
    postMessage({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

workerScope.addEventListener(
  "message",
  (event: MessageEvent<EmbedderRequest>) => {
    void handleRequest(event.data);
  },
);
