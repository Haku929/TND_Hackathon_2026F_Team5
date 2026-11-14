import { useEffect, type RefObject } from "react";

// スマートフォンで、下から出るシート（<dialog>）を、下へ引っ張って閉じられるようにする。
// iOS のシートと同じ考え方:
// - 中身が一番上まで戻っているときだけ、下への動きがシートを引っ張る（途中なら、ふつうのスクロール）
// - 指に合わせて動き、離したときの距離か速さで、閉じるか元に戻すかを決める
// - 閉じるときは、いまの位置から滑らかに画面の外へ出す
// 画面幅が広い（PC・タブレット）ときは、中央のモーダルなので何もしない。

const SHEET_QUERY = "(max-width: 559px)";
const START_DISTANCE = 8; // これ以上、下へ動いたら引っ張り始める（px）
const CLOSE_DISTANCE = 96; // これ以上引いて離したら閉じる（px）
const CLOSE_VELOCITY = 0.6; // これより速く引き下ろしたら閉じる（px/ms）
const SETTLE_MS = 320; // 閉じる・戻すアニメーションの長さ（CSS の --dur と合わせる）

export function useSheetDrag(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const sheet = window.matchMedia(SHEET_QUERY);
    let tracking = false;
    let dragging = false;
    let startY = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const setOffset = (y: number) => {
      dialog.style.setProperty("--sheet-y", `${y}px`);
      // 引くほど、後ろの暗さをうすくする
      const dim = Math.max(0, 1 - y / Math.max(1, dialog.offsetHeight));
      dialog.style.setProperty("--sheet-dim", String(dim));
    };
    const clear = () => {
      dialog.style.removeProperty("--sheet-y");
      dialog.style.removeProperty("--sheet-dim");
      dialog.style.removeProperty("transition");
    };

    const onStart = (event: TouchEvent) => {
      if (!sheet.matches || event.touches.length !== 1) return;
      // 中身が途中までスクロールされているときは、引っ張らない
      tracking = dialog.scrollTop <= 0;
      dragging = false;
      startY = lastY = event.touches[0].clientY;
      lastTime = event.timeStamp;
      velocity = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const y = event.touches[0].clientY;
      const dy = y - startY;

      if (!dragging) {
        if (dy > START_DISTANCE && dialog.scrollTop <= 0) {
          dragging = true;
          dialog.style.transition = "none";
        } else if (dy < -START_DISTANCE || dialog.scrollTop > 0) {
          tracking = false; // 上へのスクロール。ふつうに任せる
          return;
        } else {
          return;
        }
      }

      event.preventDefault(); // 引っ張っている間は、ページ側のスクロールを止める
      velocity = (y - lastY) / Math.max(1, event.timeStamp - lastTime);
      lastY = y;
      lastTime = event.timeStamp;
      setOffset(Math.max(0, dy));
    };

    const onEnd = () => {
      if (!dragging) {
        tracking = false;
        return;
      }
      tracking = false;
      dragging = false;

      const distance = lastY - startY;
      const shouldClose =
        distance > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY;
      dialog.style.transition = `transform ${SETTLE_MS}ms var(--ease-sheet)`;

      if (shouldClose) {
        setOffset(dialog.offsetHeight);
        timer = setTimeout(() => dialog.close(), SETTLE_MS * 0.8);
      } else {
        setOffset(0);
        timer = setTimeout(clear, SETTLE_MS);
      }
    };

    // 閉じたあと（ボタン・Esc・外側のクリックでも）、引っ張りの状態を消す
    const onClose = () => {
      clearTimeout(timer);
      clear();
    };

    dialog.addEventListener("touchstart", onStart, { passive: true });
    // 引っ張り中にスクロールを止めるため、passive にしない
    dialog.addEventListener("touchmove", onMove, { passive: false });
    dialog.addEventListener("touchend", onEnd);
    dialog.addEventListener("touchcancel", onEnd);
    dialog.addEventListener("close", onClose);
    return () => {
      clearTimeout(timer);
      dialog.removeEventListener("touchstart", onStart);
      dialog.removeEventListener("touchmove", onMove);
      dialog.removeEventListener("touchend", onEnd);
      dialog.removeEventListener("touchcancel", onEnd);
      dialog.removeEventListener("close", onClose);
    };
  }, [ref]);
}
