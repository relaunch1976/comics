import type { RakutenItem, RakutenSearchResponse } from "../core/types.ts";

export const ENDPOINT =
  "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404";

/** itemCaption は数百文字あり使わないので落とす */
const ELEMENTS = [
  "title", "titleKana", "subTitle", "seriesName", "author", "publisherName",
  "size", "isbn", "salesDate", "availability", "limitedFlag",
  "largeImageUrl", "booksGenreId",
].join(",");

/** 楽天のレート制限対策。1リクエストあたりこの間隔を空ける */
export const MIN_INTERVAL_MS = 1000;

/** 429 / 5xx のときのリトライ回数と初期待ち時間 */
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

export type RakutenClientOptions = {
  appId: string;
  accessKey: string;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  /** テストから待ち時間を潰すため */
  sleepImpl?: (ms: number) => Promise<void>;
};

export class RakutenApiError extends Error {
  // Node の型ストリッピングはパラメータプロパティに対応していないので書き下す
  // （テストを依存ゼロで動かすため。enum と namespace も同様に使えない）
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "RakutenApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

export type RakutenClient = {
  /** 追加画面用。候補を広く出したいので2ページまで見る */
  searchForAdd(title: string): Promise<RakutenItem[]>;
  /**
   * 更新用。最新巻と予約巻さえ取れれば足りるので、
   * 発売日の新しい順で1ページだけ取る。全巻を集める必要はない。
   */
  fetchLatest(titlePrefix: string): Promise<RakutenItem[]>;
  /** 低レベル。ページ指定の生の1リクエスト */
  searchPage(
    title: string,
    page: number,
    sort?: string,
  ): Promise<RakutenSearchResponse>;
};

export function createRakutenClient(
  opts: RakutenClientOptions,
): RakutenClient {
  const doFetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const sleep = opts.sleepImpl ?? defaultSleep;
  const minInterval = opts.minIntervalMs ?? MIN_INTERVAL_MS;

  // 全リクエストを直列化し、最低 minInterval を空ける
  let chain: Promise<unknown> = Promise.resolve();
  let lastStartedAt = 0;

  function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = minInterval - (Date.now() - lastStartedAt);
      if (wait > 0) await sleep(wait);
      lastStartedAt = Date.now();
      return task();
    };
    // 直前のタスクが失敗しても後続は流す
    const result = chain.then(run, run);
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function buildUrl(title: string, page: number, sort?: string): string {
    const p = new URLSearchParams({
      applicationId: opts.appId,
      accessKey: opts.accessKey,
      title,
      size: "9", // コミックスのみ。入力パラメータ側は数値
      outOfStockFlag: "1", // 品切れの巻を落とさない
      hits: "30",
      page: String(page),
      formatVersion: "2",
      elements: ELEMENTS,
    });
    // booksGenreId は指定しない（デフォルトの 001 でよい）
    if (sort) p.set("sort", sort);
    return `${ENDPOINT}?${p}`;
  }

  async function requestOnce(url: string): Promise<RakutenSearchResponse> {
    const res = await doFetch(url);

    if (res.status === 404) {
      // 該当なし。エラーではない
      return { count: 0, page: 1, hits: 0, pageCount: 0, Items: [] };
    }
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        /* 読めなくても続行 */
      }
      throw new RakutenApiError(
        `楽天API ${res.status}: ${detail}`,
        res.status,
        retryable,
      );
    }

    const body = (await res.json()) as Partial<RakutenSearchResponse>;
    return {
      count: body.count ?? 0,
      page: body.page ?? 1,
      hits: body.hits ?? 0,
      pageCount: body.pageCount ?? 0,
      Items: Array.isArray(body.Items) ? body.Items : [],
    };
  }

  async function searchPage(
    title: string,
    page: number,
    sort?: string,
  ): Promise<RakutenSearchResponse> {
    const url = buildUrl(title, page, sort);
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await schedule(() => requestOnce(url));
      } catch (e) {
        lastError = e;
        const retryable =
          e instanceof RakutenApiError ? e.retryable : true; // 通信断も再試行
        if (!retryable || attempt === MAX_RETRIES) break;
        await sleep(BACKOFF_BASE_MS * 2 ** attempt);
      }
    }
    throw lastError;
  }

  return {
    searchPage,

    async searchForAdd(title) {
      const first = await searchPage(title, 1);
      if (first.pageCount <= 1) return first.Items;
      const second = await searchPage(title, 2);
      return [...first.Items, ...second.Items];
    },

    async fetchLatest(titlePrefix) {
      const res = await searchPage(titlePrefix, 1, "-releaseDate");
      return res.Items;
    },
  };
}
