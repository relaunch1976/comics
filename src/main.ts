import "./style.css";
import { mount, refreshStale } from "./ui/app.ts";

mount(document.querySelector<HTMLDivElement>("#app")!);

// 画面を出してから裏で更新する。ユーザーを待たせない（設計書 §8）
void refreshStale();
