/** 楽天ブックス書籍検索API のレスポンス 1件分（アプリが使うフィールドのみ） */
export type RakutenItem = {
  title: string;
  titleKana?: string;
  subTitle?: string;
  /** レーベル名。作品名ではない。空文字のことがある */
  seriesName: string;
  author?: string;
  publisherName: string;
  /** 文字列。コミックスは "コミック"。セット商品は "" */
  size: string;
  isbn: string;
  /** 表記が不定。parseSalesDate で正規化する */
  salesDate: string;
  largeImageUrl?: string;
  /** 文字列。"5" が予約受付中＝未発売。"" のこともある */
  availability: string;
  limitedFlag?: number;
  booksGenreId?: string;
};

export type RakutenSearchResponse = {
  count: number;
  page: number;
  hits: number;
  pageCount: number;
  /** 大文字 I。formatVersion=2 でも変わらない */
  Items: RakutenItem[];
};

export type SalesDate = {
  /** APIの生値 */
  raw: string;
  /** "2026-09-30" 比較・表示用 */
  date: string;
  precision: "year" | "month" | "day";
  /** 「頃」「上旬/中旬/下旬」「以降」が付いていた */
  tentative: boolean;
};

export type Series = {
  id: string;

  // ---- OneDrive に同期する（ユーザーの意図）----
  title: string;
  titlePrefix: string;
  /** レーベル名（APIの seriesName） */
  label: string;
  publisher: string;
  baseIsbn: string;
  readUpTo: number;
  isCompleted: boolean;
  excludedIsbns: string[];

  // ---- 同期しない（APIから再取得できる端末内キャッシュ）----
  latestVolume?: number;
  latestSalesDate?: SalesDate;
  nextVolume?: number;
  nextSalesDate?: SalesDate;
  coverUrl?: string;
  lastCheckedAt?: string;
};

/** 同定に必要な部分だけを取り出したもの */
export type SeriesKey = Pick<
  Series,
  "titlePrefix" | "label" | "publisher" | "excludedIsbns"
>;

export type Store = {
  schemaVersion: 1;
  updatedAt: string;
  series: Series[];
};
