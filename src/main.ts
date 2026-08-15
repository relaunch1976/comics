import "./style.css";
import { mount, refreshStale } from "./ui/app.ts";

mount(document.querySelector<HTMLDivElement>("#app")!);

// 画面を出してから裏で更新する。ユーザーを待たせない（設計書 §8）
void refreshStale();

// Service Worker はビルド後のみ。開発中に登録すると更新が反映されなくなる
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL },
    );
  });
}
