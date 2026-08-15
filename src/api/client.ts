import type { RakutenSearchResponse } from "../core/types.ts";
import fujii from "./fixtures/robou-no-fujii.json";
import aonohako from "./fixtures/ao-no-hako.json";
import arslan from "./fixtures/arslan-senki.json";

export type SearchClient = {
  search(title: string, page?: number): Promise<RakutenSearchResponse>;
};

/**
 * フィクスチャ版。ローカル開発ではこちらを使う。
 *
 * 楽天アプリ登録の「許可されたWebサイト」に localhost を入れられないため、
 * ローカルからは実APIを叩けない（設計書 §10）。
 */
export function createFixtureClient(): SearchClient {
  const table: [string[], RakutenSearchResponse][] = [
    [["路傍のフジイ", "フジイ", "ろぼう"], fujii as RakutenSearchResponse],
    [["アオのハコ", "あおのはこ"], aonohako as RakutenSearchResponse],
    [["アルスラーン戦記", "アルスラーン"], arslan as RakutenSearchResponse],
  ];

  return {
    async search(title) {
      const q = title.normalize("NFKC").replace(/[\s　]/g, "").toLowerCase();
      const hit = q
        ? table.find(([keys]) =>
            keys.some((k) => k.toLowerCase().includes(q) || q.includes(k.toLowerCase())),
          )
        : undefined;

      // 実APIの体感に近づけるため少し待つ
      await new Promise((r) => setTimeout(r, 150));

      return (
        hit?.[1] ?? {
          count: 0,
          page: 1,
          hits: 0,
          pageCount: 0,
          Items: [],
        }
      );
    },
  };
}

/** 検索できる作品名（フィクスチャ版でのみ意味がある） */
export const FIXTURE_TITLES = ["路傍のフジイ", "アオのハコ", "アルスラーン戦記"];

declare const __RAKUTEN_APP_ID__: string;

/**
 * 実APIクライアントは §12 手順6 で実装する。
 * 認証情報が無い環境（ローカル開発）では自動的にフィクスチャ版になる。
 */
export function createClient(): SearchClient {
  const hasCredentials =
    typeof __RAKUTEN_APP_ID__ === "string" && __RAKUTEN_APP_ID__ !== "";
  if (!hasCredentials) return createFixtureClient();
  // TODO(§12 手順6): fetch + レート制限 + ページング + 429バックオフ
  return createFixtureClient();
}

export const isUsingFixtures = (): boolean =>
  typeof __RAKUTEN_APP_ID__ !== "string" || __RAKUTEN_APP_ID__ === "";
