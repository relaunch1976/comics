import type { SalesDate } from "./types.ts";

/**
 * 楽天APIの salesDate を正規化する。
 *
 * 公式仕様:
 *   「YYYY年」「YYYY年MM月」「YYYY年MM月DD日」
 *   発売日が確定していない商品には「上旬/中旬/下旬」「頃」「以降」などが付加される
 *
 * 重要: 「頃」は未発売の印ではない。発売済みの商品にも付く。
 * 刊行済み／未発売の判定には availability を使うこと（isUnreleased）。
 */

/** 発売日が確定していないことを示す修飾語 */
const TENTATIVE_MARKERS = ["上旬", "中旬", "下旬", "頃", "ごろ", "以降", "予定"];

/** 上旬/中旬/下旬 を日に落とす。月のみの場合は月末に寄せる */
const DECADE_DAY: Record<string, number> = { 上旬: 10, 中旬: 20 };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOf = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export function parseSalesDate(raw: string): SalesDate | null {
  if (!raw) return null;
  const s = raw.normalize("NFKC").trim();

  const tentative = TENTATIVE_MARKERS.some((m) => s.includes(m));

  const m = s.match(/(\d{4})年(?:\s*(\d{1,2})月)?(?:\s*(\d{1,2})日)?/);
  if (!m?.[1]) return null;

  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : undefined;
  const day = m[3] ? Number(m[3]) : undefined;

  if (month === undefined) {
    // 年のみ。年末に寄せる（「まだ出ていない」と誤判定しないため）
    return { raw, date: `${year}-12-31`, precision: "year", tentative };
  }

  if (day === undefined) {
    // 月のみ。上旬/中旬なら該当日、それ以外は月末に寄せる
    const decade = TENTATIVE_MARKERS.find((k) => k in DECADE_DAY && s.includes(k));
    const d = decade ? DECADE_DAY[decade]! : lastDayOf(year, month);
    return {
      raw,
      date: `${year}-${pad(month)}-${pad(d)}`,
      precision: "month",
      tentative,
    };
  }

  return {
    raw,
    date: `${year}-${pad(month)}-${pad(day)}`,
    precision: "day",
    tentative,
  };
}
