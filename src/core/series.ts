import type { RakutenItem, SalesDate, SeriesKey } from "./types.ts";
import { parseSalesDate } from "./salesDate.ts";

/** 全角半角・大小文字・空白を吸収する正規化 */
export const norm = (s?: string): string =>
  (s ?? "").normalize("NFKC").replace(/[\s　]/g, "").toLowerCase();

/** 通常版ではない商品を弾くための語 */
export const EXCLUDE_WORDS = [
  "特装版", "限定版", "愛蔵版", "完全版", "総集編", "文庫版", "新装版",
  "モノクロ版", "カラー版", "分冊版", "セット", "画集",
];

/** コミックスの判型。API の size は数値コードではなく日本語の文字列で返る */
export const SIZE_COMIC = "コミック";

/** availability="5" が予約受付中＝未発売。"4"(お取り寄せ) は刊行済みなので完全一致で見ること */
export const isUnreleased = (item: RakutenItem): boolean =>
  item.availability === "5";

/** 未発売巻の表紙は NOW PRINTING のプレースホルダになる */
export const hasRealCover = (item: RakutenItem): boolean =>
  !!item.largeImageUrl && !item.largeImageUrl.includes("noimage");

const hasExcludeWord = (title: string): boolean =>
  EXCLUDE_WORDS.some((w) => norm(title).includes(norm(w)));

/**
 * 基準の1冊のタイトルから、シリーズの接頭辞と巻数を取り出す。
 *
 * 評価順が重要。括弧付きを先に見ないと、タイトル本文の数字を巻数と誤認する。
 *   例: 「神の目で見た限界レベル9999の仲間達を…（23）」→ 9999 ではなく 23
 */
export function extractPrefix(rawTitle: string): {
  prefix: string;
  volume: number;
} {
  const t = rawTitle.trim();
  let m: RegExpMatchArray | null;

  // (a) 末尾の括弧付き巻数   例: 路傍のフジイ（7）
  if ((m = t.match(/^(.*?)\s*[（(]\s*(\d{1,3})\s*[）)]\s*$/)))
    return { prefix: m[1]!.trim(), volume: Number(m[2]) };

  // (b) 末尾の空白区切り巻数 例: アオのハコ 18
  if ((m = t.match(/^(.*?)\s+(\d{1,3})\s*$/)))
    return { prefix: m[1]!.trim(), volume: Number(m[2]) };

  // (c) 途中の空白区切り巻数 例: 悪の令嬢と十二の瞳 2 〜最強従者たちと…〜
  if ((m = t.match(/^(.*?)\s+(\d{1,3})\s+.+$/)))
    return { prefix: m[1]!.trim(), volume: Number(m[2]) };

  // (d) 巻数表記なし → 1巻扱い
  return { prefix: t, volume: 1 };
}

/**
 * 接頭辞を取り除いた残りの「先頭」から巻数を取る。
 *
 * 任意位置を検索してはいけない。
 *   「路傍のフジイ 公式ガイド 2026」を 2026 巻として取り込んでしまう。
 */
export function volumeOf(title: string, prefix: string): number | null {
  const t = norm(title);
  const b = norm(prefix);
  if (!b || !t.startsWith(b)) return null;
  const m = t.slice(b.length).match(/^[（(]?(\d{1,3})[）)]?/);
  return m ? Number(m[1]) : null;
}

/**
 * 主系列: latestVolume と表示情報に使う。厳格。
 */
export function isPrimary(item: RakutenItem, base: SeriesKey): boolean {
  if (base.excludedIsbns.includes(item.isbn)) return false;
  if (item.size !== SIZE_COMIC) return false;
  // 基準レーベルが空だと "" === "" で通ってしまい、無関係な商品を大量に拾う
  if (!base.label) return false;
  if (norm(item.seriesName) !== norm(base.label)) return false;
  if (norm(item.publisherName) !== norm(base.publisher)) return false;
  if (hasExcludeWord(item.title)) return false;
  return volumeOf(item.title, base.titlePrefix) !== null;
}

/**
 * 補助系列: 「その巻が存在する」ことの検出だけに使う。緩い。
 *
 * 特装版しか登録されていない次巻（アルスラーン戦記25巻）を拾うために必要。
 * 特装版は別レーベルになるため、主系列だけでは取りこぼす。
 */
export function isSecondary(item: RakutenItem, base: SeriesKey): boolean {
  if (base.excludedIsbns.includes(item.isbn)) return false;
  if (item.size !== SIZE_COMIC) return false;
  if (norm(item.publisherName) !== norm(base.publisher)) return false;
  return volumeOf(item.title, base.titlePrefix) !== null;
}

export type ResolvedSeries = {
  latestVolume: number;
  latestSalesDate?: SalesDate;
  /** latestVolume を出した商品。「この本は違う」で除外するのに要る */
  latestIsbn: string;
  nextVolume?: number;
  nextSalesDate?: SalesDate;
  nextIsbn?: string;
  coverUrl?: string;
};

/**
 * 検索結果から latestVolume / nextVolume を求める。
 *
 * 1. 主系列を集め、未発売でないものの最大巻数を latestVolume とする
 * 2. 補助系列のうち latestVolume を超える巻を集める
 * 3. そのうち未発売のものの最小巻を nextVolume とする
 * 4. 表紙は主系列の latestVolume のものを使う（未発売巻の仮画像を避ける）
 */
export function resolveSeries(
  items: RakutenItem[],
  base: SeriesKey,
): ResolvedSeries | null {
  const primary = items
    .filter((i) => isPrimary(i, base))
    .map((i) => ({ volume: volumeOf(i.title, base.titlePrefix)!, item: i }));

  const released = primary.filter((p) => !isUnreleased(p.item));
  if (released.length === 0) return null;

  // 同一巻数が複数残った場合は発売日が最も早いものを採る（通常版が先に出る）
  const byVolume = new Map<number, (typeof released)[number]>();
  for (const p of released) {
    const cur = byVolume.get(p.volume);
    if (!cur) {
      byVolume.set(p.volume, p);
      continue;
    }
    const a = parseSalesDate(p.item.salesDate)?.date ?? "9999-12-31";
    const b = parseSalesDate(cur.item.salesDate)?.date ?? "9999-12-31";
    if (a < b) byVolume.set(p.volume, p);
  }

  const latestVolume = Math.max(...byVolume.keys());
  const latestEntry = byVolume.get(latestVolume)!;

  // 補助系列で latestVolume を超える未発売巻を探す
  const ahead = items
    .filter((i) => isSecondary(i, base))
    .map((i) => ({ volume: volumeOf(i.title, base.titlePrefix)!, item: i }))
    .filter((p) => p.volume > latestVolume && isUnreleased(p.item))
    .sort((a, b) => a.volume - b.volume);

  const next = ahead[0];

  // 表紙は実画像を持つ既刊から。最新巻が仮画像なら手前の巻に遡る
  const cover = [...byVolume.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, e]) => e.item)
    .find(hasRealCover)?.largeImageUrl;

  const latestDate = parseSalesDate(latestEntry.item.salesDate);
  const nextDate = next ? parseSalesDate(next.item.salesDate) : null;

  return {
    latestVolume,
    latestIsbn: latestEntry.item.isbn,
    ...(latestDate ? { latestSalesDate: latestDate } : {}),
    ...(next
      ? {
          nextVolume: next.volume,
          nextIsbn: next.item.isbn,
          ...(nextDate ? { nextSalesDate: nextDate } : {}),
        }
      : {}),
    ...(cover ? { coverUrl: cover } : {}),
  };
}

/** 追加画面で基準に選ばせてはいけない商品 */
export function isEligibleAsBase(item: RakutenItem): boolean {
  if (item.size !== SIZE_COMIC) return false;
  if (!item.seriesName) return false;
  if (hasExcludeWord(item.title)) return false;
  return true;
}
