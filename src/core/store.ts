import type { Series, Store } from "./types.ts";

export const STORAGE_KEY = "comics:store";

export const emptyStore = (): Store => ({
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  series: [],
});

/**
 * 保存されたJSONを Store に戻す。壊れていたら空の Store を返す。
 *
 * localStorage は他のスクリプトやユーザー操作で壊れうるので、
 * 例外を投げて起動不能になるより空で始めるほうがまし。
 */
export function parseStore(json: string | null): Store {
  if (!json) return emptyStore();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return emptyStore();
  }
  if (typeof raw !== "object" || raw === null) return emptyStore();

  const o = raw as Partial<Store>;
  if (o.schemaVersion !== 1) return emptyStore();
  if (!Array.isArray(o.series)) return emptyStore();

  return {
    schemaVersion: 1,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
    series: o.series.filter(isSeries),
  };
}

function isSeries(v: unknown): v is Series {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<Series>;
  return (
    typeof s.id === "string" &&
    typeof s.title === "string" &&
    typeof s.titlePrefix === "string" &&
    typeof s.publisher === "string" &&
    typeof s.readUpTo === "number" &&
    Array.isArray(s.excludedIsbns)
  );
}

/**
 * OneDrive 同期の対象になるフィールドだけを取り出す。
 *
 * API由来のフィールド（latestVolume など）は再取得できるので同期しない。
 * これを守らないと、バックグラウンド更新が他端末の readUpTo を巻き戻す。
 */
export function syncedPart(s: Series) {
  return {
    id: s.id,
    title: s.title,
    titlePrefix: s.titlePrefix,
    label: s.label,
    publisher: s.publisher,
    baseIsbn: s.baseIsbn,
    readUpTo: s.readUpTo,
    isCompleted: s.isCompleted,
    excludedIsbns: s.excludedIsbns,
  };
}

export type SyncedSeries = ReturnType<typeof syncedPart>;

/**
 * 2つの Series をマージする。すべての規則が可換なので、
 * 適用順が入れ替わっても結果は同じになる（衝突検出もリトライも要らない）。
 */
export function mergeSeries(a: Series, b: Series): Series {
  return {
    ...a,
    readUpTo: Math.max(a.readUpTo, b.readUpTo),
    isCompleted: a.isCompleted || b.isCompleted,
    excludedIsbns: [...new Set([...a.excludedIsbns, ...b.excludedIsbns])],
  };
}

/** 片方にしか無い作品は残す。削除は明示的な削除操作のときだけ */
export function mergeStores(local: Store, remote: Store): Store {
  const byId = new Map<string, Series>();
  for (const s of local.series) byId.set(s.id, s);
  for (const s of remote.series) {
    const cur = byId.get(s.id);
    byId.set(s.id, cur ? mergeSeries(cur, s) : s);
  }
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    series: [...byId.values()],
  };
}

// ---- localStorage の薄いラッパ（テストは上の純粋関数側で行う）----

export function loadStore(): Store {
  try {
    return parseStore(localStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...store, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // 容量超過やプライベートモードなど。落とさない
  }
}
