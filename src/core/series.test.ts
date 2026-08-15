import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  extractPrefix,
  volumeOf,
  isPrimary,
  isSecondary,
  isEligibleAsBase,
  isUnreleased,
  resolveSeries,
} from "./series.ts";
import type { RakutenItem, RakutenSearchResponse, SeriesKey } from "./types.ts";

const fixture = (name: string): RakutenSearchResponse =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../api/fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );

const fujii = fixture("robou-no-fujii");
const aonohako = fixture("ao-no-hako");
const arslan = fixture("arslan-senki");

const find = (r: RakutenSearchResponse, title: string): RakutenItem => {
  const it = r.Items.find((i) => i.title === title);
  assert.ok(it, `fixture に "${title}" が無い`);
  return it;
};

/** 基準の1冊から SeriesKey を作る（追加画面がやること） */
const baseFrom = (item: RakutenItem): SeriesKey => ({
  titlePrefix: extractPrefix(item.title).prefix,
  label: item.seriesName,
  publisher: item.publisherName,
  excludedIsbns: [],
});

// ---------------------------------------------------------------- 接頭辞抽出

test("接頭辞抽出: 括弧付きを空白区切りより先に評価する", () => {
  assert.deepEqual(extractPrefix("路傍のフジイ（1）"), {
    prefix: "路傍のフジイ",
    volume: 1,
  });
  assert.deepEqual(extractPrefix("宇宙兄弟（46）"), {
    prefix: "宇宙兄弟",
    volume: 46,
  });
});

test("接頭辞抽出: 末尾の空白区切り", () => {
  assert.deepEqual(extractPrefix("アオのハコ 18"), {
    prefix: "アオのハコ",
    volume: 18,
  });
  assert.deepEqual(extractPrefix("HUNTER×HUNTER 39"), {
    prefix: "HUNTER×HUNTER",
    volume: 39,
  });
});

test("接頭辞抽出: 巻数がタイトルの途中にある", () => {
  assert.deepEqual(extractPrefix("悪の令嬢と十二の瞳 2 〜最強従者たちと…〜"), {
    prefix: "悪の令嬢と十二の瞳",
    volume: 2,
  });
});

test("接頭辞抽出: タイトル本文の数字を巻数と誤認しない", () => {
  assert.deepEqual(
    extractPrefix("神の目で見た限界レベル9999の仲間達を…（23）"),
    { prefix: "神の目で見た限界レベル9999の仲間達を…", volume: 23 },
  );
});

test("接頭辞抽出: 巻数表記が無ければ1巻扱い", () => {
  assert.deepEqual(extractPrefix("よつばと！"), {
    prefix: "よつばと！",
    volume: 1,
  });
});

// ---------------------------------------------------------------- 巻数パース

test("巻数は残り文字列の先頭にアンカーする", () => {
  assert.equal(volumeOf("路傍のフジイ（7）", "路傍のフジイ"), 7);
  assert.equal(volumeOf("アオのハコ 18", "アオのハコ"), 18);
  // 先頭アンカーしないと 2026 巻として取り込まれる
  assert.equal(volumeOf("路傍のフジイ 公式ガイド 2026", "路傍のフジイ"), null);
  assert.equal(volumeOf("別の漫画 3", "路傍のフジイ"), null);
});

test("レーベルのスペースや全角半角を吸収する", () => {
  assert.equal(volumeOf("路傍のフジイ（７）", "路傍の フジイ"), 7);
});

// ------------------------------------------------------- 路傍のフジイ（基本形）

test("路傍のフジイ: 全8件から latest=6 / next=7 を得る", () => {
  const base = baseFrom(find(fujii, "路傍のフジイ（1）"));
  assert.equal(base.titlePrefix, "路傍のフジイ");
  assert.equal(base.label, "ビッグ コミックス");

  const r = resolveSeries(fujii.Items, base);
  assert.ok(r);
  assert.equal(r.latestVolume, 6);
  assert.equal(r.nextVolume, 7);
  assert.equal(r.nextSalesDate?.date, "2026-09-30");
  // 未発売の7巻に「頃」は付いていない
  assert.equal(r.nextSalesDate?.tentative, false);
});

test("路傍のフジイ: セット商品は size が空文字なので除外語に頼らず落ちる", () => {
  const base = baseFrom(find(fujii, "路傍のフジイ（1）"));
  const set = find(fujii, "【全巻】 路傍のフジイ 1-6巻セット");
  assert.equal(set.size, "");
  assert.equal(isPrimary(set, base), false);
  assert.equal(isSecondary(set, base), false);
});

test("路傍のフジイ: 未発売は availability='5' で判定する", () => {
  assert.equal(isUnreleased(find(fujii, "路傍のフジイ（7）")), true);
  assert.equal(isUnreleased(find(fujii, "路傍のフジイ（6）")), false);
});

// ------------------------------------------------------------- アオのハコ

test("アオのハコ: 1〜26巻を集め next=27 を得る", () => {
  const base = baseFrom(find(aonohako, "アオのハコ 1"));
  const r = resolveSeries(aonohako.Items, base);
  assert.ok(r);
  assert.equal(r.latestVolume, 26);
  assert.equal(r.nextVolume, 27);
});

test("アオのハコ: 小説版は別レーベルかつ size が新書なので落ちる", () => {
  const base = baseFrom(find(aonohako, "アオのハコ 1"));
  for (const t of ["アオのハコ Prologue", "アオのハコ Interlude"]) {
    const it = find(aonohako, t);
    assert.equal(isPrimary(it, base), false, t);
    assert.equal(isSecondary(it, base), false, t);
  }
});

test("アオのハコ: 未発売27巻の noimage を表紙に採用しない", () => {
  const base = baseFrom(find(aonohako, "アオのハコ 1"));
  const r = resolveSeries(aonohako.Items, base);
  assert.ok(r?.coverUrl);
  assert.ok(!r.coverUrl.includes("noimage"));
  // 既刊の最新（26巻）の表紙が採られる
  assert.ok(r.coverUrl.includes("9784088850924"));
});

test("アオのハコ: 1ページに収まっていない（ページングが要る）", () => {
  assert.equal(aonohako.count, 35);
  assert.equal(aonohako.pageCount, 2);
});

// --------------------------------------------------------- アルスラーン戦記

test("アルスラーン戦記: 特装版しかない25巻を補助系列で拾う", () => {
  const base = baseFrom(find(arslan, "アルスラーン戦記（1）"));
  assert.equal(base.label, "講談社コミックス");

  const r = resolveSeries(arslan.Items, base);
  assert.ok(r);
  assert.equal(r.latestVolume, 24);
  // 主系列だけだとここが undefined になる
  assert.equal(r.nextVolume, 25);
  assert.equal(r.nextSalesDate?.date, "2026-10-08");
  assert.equal(r.nextSalesDate?.tentative, true);
});

test("アルスラーン戦記: 特装版は別レーベルなので主系列には入らない", () => {
  const base = baseFrom(find(arslan, "アルスラーン戦記（1）"));
  const tokusou = find(arslan, "アルスラーン戦記（25）クリアしおり付き特装版");
  assert.equal(tokusou.seriesName, "講談社キャラクターズA");
  assert.equal(isPrimary(tokusou, base), false);
  // 補助系列には入る（これが無いと25巻を見逃す）
  assert.equal(isSecondary(tokusou, base), true);
});

test("アルスラーン戦記: 小説版は size と出版社の両方で落ちる", () => {
  const base = baseFrom(find(arslan, "アルスラーン戦記（1）"));
  for (const t of ["天涯無限", "汗血公路", "蛇王再臨"]) {
    const it = find(arslan, t);
    assert.equal(isPrimary(it, base), false, t);
    assert.equal(isSecondary(it, base), false, t);
  }
});

test("アルスラーン戦記: availability='4'（お取り寄せ）は刊行済み扱い", () => {
  const it = find(arslan, "アルスラーン戦記（18）");
  assert.equal(it.availability, "4");
  assert.equal(isUnreleased(it), false);
});

test("アルスラーン戦記: availability が空文字でも未発売扱いにしない", () => {
  const it = find(arslan, "アルスラーン戦記（24）ミニクリアファイル＜第2弾＞付き特装版");
  assert.equal(it.availability, "");
  assert.equal(isUnreleased(it), false);
});

test("アルスラーン戦記: 6ページある", () => {
  assert.equal(arslan.count, 165);
  assert.equal(arslan.pageCount, 6);
});

// -------------------------------------------------------- 基準に選べない商品

test("seriesName が空の商品は基準にできない", () => {
  const it = find(arslan, "蛇王再臨");
  assert.equal(it.seriesName, "");
  assert.equal(isEligibleAsBase(it), false);
});

test("基準レーベルが空だと主系列は成立しない", () => {
  const base: SeriesKey = {
    titlePrefix: "アルスラーン戦記",
    label: "",
    publisher: "講談社",
    excludedIsbns: [],
  };
  assert.equal(isPrimary(find(arslan, "アルスラーン戦記（24）"), base), false);
});

test("特装版・セット・小説は基準に選ばせない", () => {
  assert.equal(
    isEligibleAsBase(find(arslan, "アルスラーン戦記（20）特装版")),
    false,
  );
  assert.equal(
    isEligibleAsBase(find(fujii, "【全巻】 路傍のフジイ 1-6巻セット")),
    false,
  );
  assert.equal(isEligibleAsBase(find(aonohako, "アオのハコ Prologue")), false);
  assert.equal(isEligibleAsBase(find(fujii, "路傍のフジイ（1）")), true);
});

// ---------------------------------------------------------------- 除外リスト

test("excludedIsbns に入れた商品は両系列から外れる", () => {
  const b = find(arslan, "アルスラーン戦記（1）");
  const base: SeriesKey = {
    ...baseFrom(b),
    excludedIsbns: ["9784065449455"], // 25巻の特装版
  };
  const r = resolveSeries(arslan.Items, base);
  assert.ok(r);
  assert.equal(r.latestVolume, 24);
  assert.equal(r.nextVolume, undefined);
});
