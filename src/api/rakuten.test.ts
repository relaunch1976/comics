import { test } from "node:test";
import assert from "node:assert/strict";
import { createRakutenClient, RakutenApiError, ENDPOINT } from "./rakuten.ts";

type Call = { url: string };

/** fetch のスタブ。応答を順番に返す */
function stub(responses: (() => Response)[]) {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    calls.push({ url: String(input) });
    const make = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return make();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });
const err = (status: number) => new Response("{}", { status });

const page = (over: Record<string, unknown> = {}) => ({
  count: 1,
  page: 1,
  hits: 1,
  pageCount: 1,
  Items: [{ title: "路傍のフジイ（1）", isbn: "a" }],
  ...over,
});

/** テストでは待ち時間を潰す */
const client = (fetchImpl: typeof fetch) =>
  createRakutenClient({
    appId: "APP",
    accessKey: "KEY",
    fetchImpl,
    minIntervalMs: 0,
    sleepImpl: async () => {},
  });

test("必須パラメータを組み立てる", async () => {
  const { calls, fetchImpl } = stub([() => ok(page())]);
  await client(fetchImpl).fetchLatest("路傍のフジイ");

  const url = new URL(calls[0]!.url);
  assert.equal(`${url.origin}${url.pathname}`, ENDPOINT);
  assert.equal(url.searchParams.get("applicationId"), "APP");
  assert.equal(url.searchParams.get("accessKey"), "KEY");
  assert.equal(url.searchParams.get("size"), "9");
  assert.equal(url.searchParams.get("outOfStockFlag"), "1");
  assert.equal(url.searchParams.get("formatVersion"), "2");
  assert.equal(url.searchParams.get("hits"), "30");
  // ドキュメントのサンプル値を入れるとコミックスが0件になるので指定しない
  assert.equal(url.searchParams.get("booksGenreId"), null);
});

test("更新は発売日の新しい順で1ページだけ取る", async () => {
  const { calls, fetchImpl } = stub([() => ok(page({ pageCount: 6 }))]);
  await client(fetchImpl).fetchLatest("アルスラーン戦記");

  assert.equal(calls.length, 1, "6ページあっても1回で済ませる");
  assert.equal(
    new URL(calls[0]!.url).searchParams.get("sort"),
    "-releaseDate",
  );
});

test("追加検索は2ページ目まで取る", async () => {
  const { calls, fetchImpl } = stub([() => ok(page({ pageCount: 2 }))]);
  const items = await client(fetchImpl).searchForAdd("アオのハコ");

  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((c) => new URL(c.url).searchParams.get("page")),
    ["1", "2"],
  );
  assert.equal(items.length, 2);
  // 追加検索では並び順を指定しない（古い巻も候補に出したい）
  assert.equal(new URL(calls[0]!.url).searchParams.get("sort"), null);
});

test("1ページしかなければ2回目を投げない", async () => {
  const { calls, fetchImpl } = stub([() => ok(page({ pageCount: 1 }))]);
  await client(fetchImpl).searchForAdd("路傍のフジイ");
  assert.equal(calls.length, 1);
});

test("429 はバックオフして再試行する", async () => {
  let n = 0;
  const { calls, fetchImpl } = stub([
    () => (++n <= 2 ? err(429) : ok(page())),
  ]);
  const items = await client(fetchImpl).fetchLatest("路傍のフジイ");

  assert.equal(calls.length, 3, "2回失敗して3回目で成功");
  assert.equal(items.length, 1);
});

test("429 が続けば諦めて投げる", async () => {
  const { calls, fetchImpl } = stub([() => err(429)]);
  await assert.rejects(
    () => client(fetchImpl).fetchLatest("路傍のフジイ"),
    (e: unknown) =>
      e instanceof RakutenApiError && e.status === 429 && e.retryable,
  );
  assert.equal(calls.length, 4, "初回 + 3リトライ");
});

test("400 は設定ミスなので再試行しない", async () => {
  const { calls, fetchImpl } = stub([() => err(400)]);
  await assert.rejects(
    () => client(fetchImpl).fetchLatest("x"),
    (e: unknown) => e instanceof RakutenApiError && !e.retryable,
  );
  assert.equal(calls.length, 1);
});

test("5xx は再試行する", async () => {
  let n = 0;
  const { calls, fetchImpl } = stub([() => (++n === 1 ? err(503) : ok(page()))]);
  await client(fetchImpl).fetchLatest("x");
  assert.equal(calls.length, 2);
});

test("404 は該当なしとして空で返す（エラーにしない）", async () => {
  const { fetchImpl } = stub([() => err(404)]);
  const items = await client(fetchImpl).fetchLatest("存在しない作品");
  assert.deepEqual(items, []);
});

test("Items が欠けていても落ちない", async () => {
  const { fetchImpl } = stub([() => ok({ count: 0 })]);
  const items = await client(fetchImpl).fetchLatest("x");
  assert.deepEqual(items, []);
});

test("リクエストは直列化され、最低間隔が空く", async () => {
  const started: number[] = [];
  const fetchImpl = (async () => {
    started.push(Date.now());
    await new Promise((r) => setTimeout(r, 5));
    return ok(page());
  }) as unknown as typeof fetch;

  const c = createRakutenClient({
    appId: "A",
    accessKey: "K",
    fetchImpl,
    minIntervalMs: 40,
  });

  await Promise.all([
    c.fetchLatest("a"),
    c.fetchLatest("b"),
    c.fetchLatest("c"),
  ]);

  assert.equal(started.length, 3);
  for (let i = 1; i < started.length; i++) {
    const gap = started[i]! - started[i - 1]!;
    assert.ok(gap >= 35, `${i}番目の間隔が短すぎる: ${gap}ms`);
  }
});

test("1件失敗しても後続のリクエストは流れる", async () => {
  let n = 0;
  const { fetchImpl } = stub([() => (++n === 1 ? err(400) : ok(page()))]);
  const c = client(fetchImpl);

  await assert.rejects(() => c.fetchLatest("失敗する"));
  const items = await c.fetchLatest("続けて呼べる");
  assert.equal(items.length, 1);
});
