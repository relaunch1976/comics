# フィクスチャ

楽天ブックス書籍検索API（`BooksBook/Search/20170404`）の**実レスポンス**。
2026-08-15 にAPIテストフォームで取得したもの。

リクエスト: `title=<作品名>` / `formatVersion=2` / `hits=30` / `outOfStockFlag=1`
（`booksGenreId` と `size` は未指定＝生のまま観測するため）

## 加工

各 `Items[]` から、本番リクエストの `elements` に含めないフィールドを削除している。
残してあるのはアプリが使うものと、判定の根拠になるもの。

削除: `itemCaption` `*Kana`（`titleKana` を除く）`itemPrice` `listPrice` `discountRate`
`discountPrice` `itemUrl` `affiliateUrl` `smallImageUrl` `mediumImageUrl`
`chirayomiUrl` `postageFlag` `reviewCount` `reviewAverage` `contents`

**値そのものは一切改変していない。** `count` `pageCount` などのメタ情報も原文のまま。

## 各ファイルが押さえている論点

| ファイル | 論点 |
|---|---|
| `robou-no-fujii.json` | 基本形。全8件1ページ。未発売の7巻が `availability:"5"` かつ `salesDate` に「頃」が**付かない**。セット商品の `size` が空文字 |
| `ao-no-hako.json` | 2ページ（`count:35`）。集英社は `titleKana` に巻数を含まない。小説版が別レーベル `JUMP jBOOKS` かつ `size:"新書"`。未発売27巻の画像が `noimage_01.gif` |
| `arslan-senki.json` | 6ページ（`count:165`）。**25巻が特装版しか存在せず、しかも別レーベル `講談社キャラクターズA`**。`availability` に `""` と `"4"` が混在。`seriesName` が空文字の商品。小説版が `subTitle` に作品名＋巻数を持つ。`salesDate` の月のみ表記 |

詳細は [../../../comics-tracker-verification.md](../../../comics-tracker-verification.md) を参照。
