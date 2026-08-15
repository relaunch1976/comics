import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSalesDate } from "./salesDate.ts";

test("日まで確定した表記", () => {
  const r = parseSalesDate("2026年09月30日");
  assert.deepEqual(r, {
    raw: "2026年09月30日",
    date: "2026-09-30",
    precision: "day",
    tentative: false,
  });
});

test("「頃」付き。発売済みでも付くので tentative は未発売の意味ではない", () => {
  const r = parseSalesDate("2026年02月27日頃");
  assert.equal(r?.date, "2026-02-27");
  assert.equal(r?.tentative, true);
});

test("月のみは月末に寄せる", () => {
  assert.equal(parseSalesDate("2013年06月")?.date, "2013-06-30");
  assert.equal(parseSalesDate("2014年04月")?.date, "2014-04-30");
  assert.equal(parseSalesDate("2013年06月")?.precision, "month");
});

test("うるう年の2月末", () => {
  assert.equal(parseSalesDate("2024年02月")?.date, "2024-02-29");
  assert.equal(parseSalesDate("2025年02月")?.date, "2025-02-28");
});

test("年のみは年末に寄せる", () => {
  const r = parseSalesDate("2020年");
  assert.equal(r?.date, "2020-12-31");
  assert.equal(r?.precision, "year");
});

test("上旬・中旬・下旬", () => {
  assert.equal(parseSalesDate("2026年09月上旬")?.date, "2026-09-10");
  assert.equal(parseSalesDate("2026年09月中旬")?.date, "2026-09-20");
  assert.equal(parseSalesDate("2026年09月下旬")?.date, "2026-09-30");
  assert.equal(parseSalesDate("2026年09月上旬")?.tentative, true);
});

test("「以降」も tentative", () => {
  assert.equal(parseSalesDate("2026年09月30日以降")?.tentative, true);
});

test("全角数字を吸収する", () => {
  assert.equal(parseSalesDate("２０２６年０９月３０日")?.date, "2026-09-30");
});

test("空文字とパースできない値は null", () => {
  assert.equal(parseSalesDate(""), null);
  assert.equal(parseSalesDate("発売日未定"), null);
});
