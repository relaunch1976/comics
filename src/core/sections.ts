import type { Series } from "./types.ts";

export type SectionId = "unread" | "dated" | "unknown" | "completed";

export const SECTION_LABEL: Record<SectionId, string> = {
  unread: "未読の巻がある",
  dated: "次巻の発売日が判明",
  unknown: "次巻の予定なし",
  completed: "完結",
};

/** 画面に出す順序。判定順とは異なる */
export const SECTION_ORDER: SectionId[] = [
  "unread",
  "dated",
  "unknown",
  "completed",
];

/**
 * セクションは排他ではないので if / else if で上から判定する。
 *
 * 判定順は 未読 → 完結 → 次巻判明 → 予定なし。
 * 完結作品は nextVolume を持たないため、「予定なし」より後ろに置くと
 * すべてそこへ吸い込まれて「完結」セクションが永久に空になる。
 *
 * 完結作品でも未読が残っていれば「未読」に出す。差分の可視化が目的なので。
 */
export function sectionOf(s: Series): SectionId {
  if (s.latestVolume !== undefined && s.readUpTo < s.latestVolume)
    return "unread";
  if (s.isCompleted) return "completed";
  if (s.nextVolume !== undefined) return "dated";
  return "unknown";
}

/** 表示順に並べたセクションの配列を返す。空のセクションは含めない */
export function groupBySection(
  list: Series[],
): { id: SectionId; label: string; items: Series[] }[] {
  const buckets = new Map<SectionId, Series[]>();
  for (const s of list) {
    const id = sectionOf(s);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(s);
    else buckets.set(id, [s]);
  }
  return SECTION_ORDER.filter((id) => (buckets.get(id)?.length ?? 0) > 0).map(
    (id) => ({ id, label: SECTION_LABEL[id], items: buckets.get(id)! }),
  );
}
