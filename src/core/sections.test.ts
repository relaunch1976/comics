import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionOf, groupBySection } from "./sections.ts";
import type { Series } from "./types.ts";

const S = (over: Partial<Series>): Series => ({
  id: "x",
  title: "t",
  titlePrefix: "t",
  label: "L",
  publisher: "P",
  baseIsbn: "i",
  readUpTo: 1,
  isCompleted: false,
  excludedIsbns: [],
  ...over,
});

test("未読があれば最優先", () => {
  assert.equal(sectionOf(S({ readUpTo: 1, latestVolume: 3 })), "unread");
});

test("完結でも未読が残っていれば未読に出す", () => {
  assert.equal(
    sectionOf(S({ readUpTo: 1, latestVolume: 3, isCompleted: true })),
    "unread",
  );
});

test("完結で読み切っていれば完結", () => {
  assert.equal(
    sectionOf(S({ readUpTo: 3, latestVolume: 3, isCompleted: true })),
    "completed",
  );
});

test("完結作品は nextVolume を持たなくても『予定なし』に落ちない", () => {
  // 判定順を間違えると完結セクションが永久に空になる
  const s = S({ readUpTo: 3, latestVolume: 3, isCompleted: true });
  assert.equal(s.nextVolume, undefined);
  assert.equal(sectionOf(s), "completed");
});

test("次巻が判明していれば dated", () => {
  assert.equal(
    sectionOf(S({ readUpTo: 3, latestVolume: 3, nextVolume: 4 })),
    "dated",
  );
});

test("それ以外は unknown", () => {
  assert.equal(sectionOf(S({ readUpTo: 3, latestVolume: 3 })), "unknown");
});

test("latestVolume 未取得（他端末で追加された直後）は unknown", () => {
  assert.equal(sectionOf(S({ readUpTo: 0 })), "unknown");
});

test("表示順は 未読 → 次巻判明 → 予定なし → 完結", () => {
  const groups = groupBySection([
    S({ id: "d", readUpTo: 3, latestVolume: 3, isCompleted: true }),
    S({ id: "c", readUpTo: 3, latestVolume: 3 }),
    S({ id: "b", readUpTo: 3, latestVolume: 3, nextVolume: 4 }),
    S({ id: "a", readUpTo: 1, latestVolume: 3 }),
  ]);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["unread", "dated", "unknown", "completed"],
  );
  assert.deepEqual(
    groups.map((g) => g.items[0]!.id),
    ["a", "b", "c", "d"],
  );
});

test("空のセクションは出さない", () => {
  const groups = groupBySection([S({ readUpTo: 1, latestVolume: 3 })]);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["unread"],
  );
});
