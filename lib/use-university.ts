import { useSyncExternalStore } from "react";
import { DEFAULT_UNIVERSITY_ID, isKnownUniversity } from "./universities";

// 選んだ大学を、この端末のブラウザにだけ覚える（サーバーには送らない）。
// 読めない・書けないときは、既定の大学になる。
const KEY = "university";
const EVENT = "university-change";

function read(): string {
  try {
    const value = localStorage.getItem(KEY);
    return isKnownUniversity(value) ? value : DEFAULT_UNIVERSITY_ID;
  } catch {
    return DEFAULT_UNIVERSITY_ID;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useUniversity(): [string, (id: string) => void] {
  const id = useSyncExternalStore(subscribe, read, () => DEFAULT_UNIVERSITY_ID);
  const set = (next: string) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // 覚えられなくても、この画面では選べる
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [id, set];
}
