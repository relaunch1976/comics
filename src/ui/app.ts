import type { RakutenItem, Series, SalesDate } from "../core/types.ts";
import { groupBySection } from "../core/sections.ts";
import { loadStore, saveStore } from "../core/store.ts";
import {
  extractPrefix,
  isEligibleAsBase,
  resolveSeries,
  SIZE_COMIC,
} from "../core/series.ts";
import {
  createClient,
  isUsingFixtures,
  FIXTURE_TITLES,
  type SearchClient,
} from "../api/client.ts";

type Screen = { name: "list" } | { name: "add" };

const client: SearchClient = createClient();

let store = loadStore();
let screen: Screen = { name: "list" };
let openDetailId: string | null = null;

let root: HTMLElement;

export function mount(el: HTMLElement): void {
  root = el;
  render();
}

function commit(): void {
  saveStore(store);
  render();
}

// ---------------------------------------------------------------- 小さな部品

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  for (const c of children) if (c !== null && c !== false) node.append(c);
  return node;
};

/** 「2026年9月30日」。確定していない日付には「頃」を添える */
function formatDate(d: SalesDate | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.date.split("-");
  const base =
    d.precision === "year"
      ? `${Number(y)}年`
      : d.precision === "month"
        ? `${Number(y)}年${Number(m)}月`
        : `${Number(y)}年${Number(m)}月${Number(day)}日`;
  return d.tentative ? `${base}頃` : base;
}

const coverOf = (url: string | undefined): HTMLElement =>
  url
    ? el("img", { class: "cover", src: url, alt: "", loading: "lazy" })
    : el("div", { class: "cover" });

// ---------------------------------------------------------------- 一覧画面

function renderList(): Node[] {
  const groups = groupBySection(store.series);

  const header = el(
    "header",
    {},
    el("h1", {}, "コミックス"),
    store.series.length > 0
      ? el("span", { class: "progress" }, `${store.series.length}作品`)
      : null,
  );

  const body: Node[] = [header];

  if (isUsingFixtures())
    body.push(
      el(
        "p",
        { class: "notice" },
        `検証用データで動作中。検索できるのは ${FIXTURE_TITLES.join(" / ")} のみです。`,
      ),
    );

  if (store.series.length === 0) {
    body.push(
      el(
        "p",
        { class: "empty" },
        "まだ何も登録されていません。下のボタンから追加してください。",
      ),
    );
  }

  for (const g of groups) {
    body.push(
      el(
        "h2",
        {},
        g.label,
        el("span", { class: "count" }, ` ${g.items.length}`),
      ),
      el("ul", {}, ...g.items.map(renderRow)),
    );
  }

  body.push(
    el("button", {
      class: "fab",
      textContent: "＋ 作品を追加",
      onclick: () => {
        screen = { name: "add" };
        render();
      },
    }),
  );

  return body;
}

function renderRow(s: Series): HTMLElement {
  const behind =
    s.latestVolume !== undefined && s.readUpTo < s.latestVolume
      ? s.latestVolume - s.readUpTo
      : 0;

  const progress = el(
    "div",
    { class: "progress" },
    `${s.readUpTo}巻まで読んだ`,
    s.latestVolume !== undefined
      ? el(
          "span",
          { class: behind > 0 ? "behind" : "" },
          ` / 最新は${s.latestVolume}巻${behind > 0 ? `（${behind}巻未読）` : ""}`,
        )
      : el("span", {}, " / 最新は確認中"),
    s.nextVolume !== undefined
      ? `　次巻 ${s.nextVolume}巻 ${formatDate(s.nextSalesDate)}`
      : "",
  );

  const info = el(
    "div",
    { class: "info" },
    el("div", { class: "title", textContent: s.title }),
    progress,
  );
  info.onclick = () => {
    openDetailId = openDetailId === s.id ? null : s.id;
    render();
  };

  const capped =
    s.latestVolume !== undefined && s.readUpTo >= s.latestVolume;

  const plus = el("button", {
    class: "plus",
    textContent: "＋",
    disabled: capped,
    title: "タップで1巻進める / 長押しで直接入力",
  });
  attachPlusHandlers(plus, s);

  const row = el("li", { class: "row" }, coverOf(s.coverUrl), info, plus);
  if (openDetailId === s.id) row.append(renderDetail(s));
  return row;
}

/** タップで +1、長押しで直接入力 */
function attachPlusHandlers(btn: HTMLButtonElement, s: Series): void {
  let timer: number | undefined;
  let longPressed = false;

  const start = () => {
    longPressed = false;
    timer = window.setTimeout(() => {
      longPressed = true;
      promptReadUpTo(s);
    }, 500);
  };
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", cancel);
  btn.addEventListener("pointerleave", cancel);
  btn.addEventListener("pointercancel", cancel);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("click", () => {
    cancel();
    if (longPressed) return;
    const cap = s.latestVolume ?? Number.MAX_SAFE_INTEGER;
    s.readUpTo = Math.min(s.readUpTo + 1, cap);
    commit();
  });
}

function promptReadUpTo(s: Series): void {
  const input = window.prompt(
    `「${s.title}」は何巻まで読みましたか？`,
    String(s.readUpTo),
  );
  if (input === null) return;
  const n = Number(input.trim());
  if (!Number.isInteger(n) || n < 0) return;
  s.readUpTo = Math.min(n, s.latestVolume ?? n);
  commit();
}

function renderDetail(s: Series): HTMLElement {
  const lines: Node[] = [];

  if (s.latestVolume !== undefined && s.latestIsbn)
    lines.push(
      el(
        "div",
        { class: "detail-line" },
        `最新 ${s.latestVolume}巻 ${formatDate(s.latestSalesDate)}`,
        el("button", {
          textContent: "この本は違う",
          onclick: () => excludeItem(s, s.latestIsbn!),
        }),
      ),
    );

  if (s.nextVolume !== undefined && s.nextIsbn)
    lines.push(
      el(
        "div",
        { class: "detail-line" },
        `次巻 ${s.nextVolume}巻 ${formatDate(s.nextSalesDate)}`,
        el("button", {
          textContent: "この本は違う",
          onclick: () => excludeItem(s, s.nextIsbn!),
        }),
      ),
    );

  lines.push(
    el(
      "div",
      { class: "detail-line" },
      // ＋の長押しでも同じことができるが、スマホでは長押しを発見できないので
      // 明示的なボタンを置く。誤タップの取り消しもここから行う
      el("button", {
        textContent: "何巻まで読んだか入力",
        onclick: () => promptReadUpTo(s),
      }),
      el("button", {
        textContent: s.isCompleted ? "完結マークを外す" : "完結にする",
        onclick: () => {
          s.isCompleted = !s.isCompleted;
          commit();
        },
      }),
      el("button", {
        class: "danger",
        textContent: "削除",
        onclick: () => {
          if (!window.confirm(`「${s.title}」を削除しますか？`)) return;
          store.series = store.series.filter((x) => x.id !== s.id);
          openDetailId = null;
          commit();
        },
      }),
    ),
  );

  if (s.excludedIsbns.length > 0)
    lines.push(
      el(
        "div",
        { class: "detail-line" },
        `${s.excludedIsbns.length}件を除外中`,
        el("button", {
          textContent: "除外を解除",
          onclick: () => {
            s.excludedIsbns = [];
            void refresh(s);
          },
        }),
      ),
    );

  return el("div", { class: "detail" }, ...lines);
}

function excludeItem(s: Series, isbn: string): void {
  if (!s.excludedIsbns.includes(isbn)) s.excludedIsbns.push(isbn);
  void refresh(s);
}

// ---------------------------------------------------------------- 追加画面

let query = "";
let candidates: RakutenItem[] | null = null;
let searching = false;

function renderAdd(): Node[] {
  const header = el(
    "header",
    {},
    el("h1", {}, "作品を追加"),
    el("button", {
      class: "link",
      textContent: "戻る",
      onclick: () => {
        screen = { name: "list" };
        candidates = null;
        query = "";
        render();
      },
    }),
  );

  const input = el("input", {
    type: "search",
    value: query,
    placeholder: "作品名で検索",
    enterKeyHint: "search",
  });
  input.oninput = () => {
    query = input.value;
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") void search();
  };

  const bar = el(
    "div",
    { class: "search-bar" },
    input,
    el("button", {
      class: "btn",
      textContent: searching ? "検索中" : "検索",
      disabled: searching,
      onclick: () => void search(),
    }),
  );

  const body: Node[] = [header, bar];

  if (isUsingFixtures())
    body.push(
      el(
        "p",
        { class: "notice" },
        `検証用データで動作中。${FIXTURE_TITLES.join(" / ")} のみ検索できます。`,
      ),
    );

  body.push(
    el(
      "p",
      { class: "notice" },
      "自分が持っている巻を1冊選んでください。そこからシリーズを判別します。",
    ),
  );

  if (candidates !== null) {
    if (candidates.length === 0)
      body.push(el("p", { class: "empty" }, "見つかりませんでした。"));
    else body.push(el("div", {}, ...candidates.map(renderCandidate)));
  }

  // フォーカスは描画後に当てる
  queueMicrotask(() => input.focus());
  return body;
}

function renderCandidate(item: RakutenItem): HTMLElement {
  const eligible = isEligibleAsBase(item);
  const why = !eligible
    ? item.size !== SIZE_COMIC
      ? "コミックス以外"
      : !item.seriesName
        ? "レーベル情報なし"
        : "通常版ではない"
    : "";

  const btn = el(
    "button",
    { class: "candidate", disabled: !eligible },
    coverOf(item.largeImageUrl),
    el(
      "div",
      {},
      el("div", { class: "title", textContent: item.title }),
      el(
        "div",
        { class: "why" },
        [item.author, item.seriesName].filter(Boolean).join(" / "),
        why ? el("div", {}, `選べません（${why}）`) : null,
      ),
    ),
  );
  if (eligible) btn.onclick = () => addSeries(item);
  return btn;
}

function addSeries(item: RakutenItem): void {
  const { prefix, volume } = extractPrefix(item.title);

  const s: Series = {
    id: crypto.randomUUID(),
    title: prefix,
    titlePrefix: prefix,
    label: item.seriesName,
    publisher: item.publisherName,
    baseIsbn: item.isbn,
    // 選んだ巻＝読んだ巻とみなす。ズレていれば長押しで直せる
    readUpTo: volume,
    isCompleted: false,
    excludedIsbns: [],
  };

  // 検索結果をそのまま使えるので、この場で最新巻まで解決する
  if (candidates) applyResolved(s, candidates);

  store.series.push(s);
  screen = { name: "list" };
  candidates = null;
  query = "";
  commit();
}

// ---------------------------------------------------------------- 検索と更新

async function search(): Promise<void> {
  if (!query.trim() || searching) return;
  searching = true;
  render();
  try {
    const res = await client.search(query.trim());
    candidates = res.Items;
  } catch {
    candidates = [];
  } finally {
    searching = false;
    render();
  }
}

function applyResolved(s: Series, items: RakutenItem[]): void {
  const r = resolveSeries(items, s);
  s.lastCheckedAt = new Date().toISOString();
  if (!r) return;
  s.latestVolume = r.latestVolume;
  s.latestIsbn = r.latestIsbn;
  s.latestSalesDate = r.latestSalesDate;
  s.nextVolume = r.nextVolume;
  s.nextIsbn = r.nextIsbn;
  s.nextSalesDate = r.nextSalesDate;
  s.coverUrl = r.coverUrl;
  // 選んだ巻より最新が古いことはある（誤検出）。readUpTo は下げない
  if (s.latestVolume !== undefined && s.readUpTo > s.latestVolume)
    s.latestVolume = s.readUpTo;
}

/** 1作品だけ取り直す（除外操作の直後など） */
async function refresh(s: Series): Promise<void> {
  try {
    const res = await client.search(s.titlePrefix);
    applyResolved(s, res.Items);
  } catch {
    // 失敗しても既存の表示は残す
  }
  commit();
}

// ---------------------------------------------------------------- 描画

function render(): void {
  root.replaceChildren(
    ...(screen.name === "list" ? renderList() : renderAdd()),
  );
}
