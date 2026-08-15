import type { RakutenItem, RakutenSearchResponse } from "../core/types.ts";
import { createRakutenClient } from "./rakuten.ts";
import fujii from "./fixtures/robou-no-fujii.json";
import aonohako from "./fixtures/ao-no-hako.json";
import arslan from "./fixtures/arslan-senki.json";

export type SearchClient = {
  /** 追加画面用。候補を広く出す */
  searchForAdd(title: string): Promise<RakutenItem[]>;
  /** 更新用。最新巻と予約巻が取れれば足りる */
  fetchLatest(titlePrefix: string): Promise<RakutenItem[]>;
};

/**
 * フィクスチャ版。ローカル開発ではこちらになる。
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

  const lookup = async (title: string): Promise<RakutenItem[]> => {
    const q = title.normalize("NFKC").replace(/[\s　]/g, "").toLowerCase();
    const hit = q
      ? table.find(([keys]) =>
          keys.some(
            (k) => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()),
          ),
        )
      : undefined;
    // 実APIの体感に近づけるため少し待つ
    await new Promise((r) => setTimeout(r, 150));
    return hit?.[1].Items ?? [];
  };

  return { searchForAdd: lookup, fetchLatest: lookup };
}

/** 検索できる作品名（フィクスチャ版でのみ意味がある） */
export const FIXTURE_TITLES = ["路傍のフジイ", "アオのハコ", "アルスラーン戦記"];

declare const __RAKUTEN_APP_ID__: string;
declare const __RAKUTEN_ACCESS_KEY__: string;

const appId = typeof __RAKUTEN_APP_ID__ === "string" ? __RAKUTEN_APP_ID__ : "";
const accessKey =
  typeof __RAKUTEN_ACCESS_KEY__ === "string" ? __RAKUTEN_ACCESS_KEY__ : "";

/**
 * 認証情報が揃っていれば実API、無ければフィクスチャ。
 *
 * 楽天APIは applicationId と accessKey の両方が必須なので、
 * 片方だけでは実APIに繋がない（400 で全滅するより黙ってフィクスチャのほうがまし）。
 */
export const isUsingFixtures = (): boolean => !appId || !accessKey;

export function createClient(): SearchClient {
  if (isUsingFixtures()) return createFixtureClient();
  return createRakutenClient({ appId, accessKey });
}
