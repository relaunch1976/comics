import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStore, mergeSeries, mergeStores, syncedPart } from "./store.ts";
import type { Series, Store } from "./types.ts";

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

const store = (series: Series[]): Store => ({
  schemaVersion: 1,
  updatedAt: "2026-08-15T00:00:00.000Z",
  series,
});

test("壊れた値でも空の Store で起動できる", () => {
  assert.deepEqual(parseStore(null).series, []);
  assert.deepEqual(parseStore("").series, []);
  assert.deepEqual(parseStore("{").series, []);
  assert.deepEqual(parseStore("null").series, []);
  assert.deepEqual(parseStore('"文字列"').series, []);
  assert.deepEqual(parseStore('{"schemaVersion":1}').series, []);
});

test("schemaVersion が違えば読まない", () => {
  const json = JSON.stringify({ schemaVersion: 2, updatedAt: "", series: [S({})] });
  assert.deepEqual(parseStore(json).series, []);
});

test("形の合わない要素だけ落とす", () => {
  const json = JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-08-15T00:00:00.000Z",
    series: [S({ id: "ok" }), { id: "壊れている" }, null, 42],
  });
  const parsed = parseStore(json);
  assert.equal(parsed.series.length, 1);
  assert.equal(parsed.series[0]!.id, "ok");
});

test("同期対象にAPI由来のフィールドを含めない", () => {
  const s = S({ latestVolume: 6, nextVolume: 7, coverUrl: "u", lastCheckedAt: "t" });
  assert.deepEqual(Object.keys(syncedPart(s)).sort(), [
    "baseIsbn", "excludedIsbns", "id", "isCompleted",
    "label", "publisher", "readUpTo", "title", "titlePrefix",
  ]);
});

test("readUpTo は大きい方、完結は true が勝つ、除外は和集合", () => {
  const a = S({ readUpTo: 5, isCompleted: false, excludedIsbns: ["a"] });
  const b = S({ readUpTo: 3, isCompleted: true, excludedIsbns: ["b"] });
  const m = mergeSeries(a, b);
  assert.equal(m.readUpTo, 5);
  assert.equal(m.isCompleted, true);
  assert.deepEqual(m.excludedIsbns.sort(), ["a", "b"]);
});

test("マージは可換。順序が入れ替わっても同じ結果になる", () => {
  const a = S({ id: "s", readUpTo: 5, excludedIsbns: ["a"] });
  const b = S({ id: "s", readUpTo: 3, isCompleted: true, excludedIsbns: ["b"] });
  const ab = mergeSeries(a, b);
  const ba = mergeSeries(b, a);
  assert.equal(ab.readUpTo, ba.readUpTo);
  assert.equal(ab.isCompleted, ba.isCompleted);
  assert.deepEqual(ab.excludedIsbns.sort(), ba.excludedIsbns.sort());
});

test("他端末で進めた readUpTo を巻き戻さない", () => {
  // PC が古いスナップショット（readUpTo=1）を持ったまま書き戻しても、
  // スマホで進めた 5 が残る
  const pc = store([S({ id: "s", readUpTo: 1 })]);
  const phone = store([S({ id: "s", readUpTo: 5 })]);
  assert.equal(mergeStores(pc, phone).series[0]!.readUpTo, 5);
  assert.equal(mergeStores(phone, pc).series[0]!.readUpTo, 5);
});

test("片方にしか無い作品は残る", () => {
  const merged = mergeStores(
    store([S({ id: "a" })]),
    store([S({ id: "b" })]),
  );
  assert.deepEqual(merged.series.map((s) => s.id).sort(), ["a", "b"]);
});
