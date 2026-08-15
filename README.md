# comics

追っている漫画シリーズについて、**「自分がどこまで読んだか」と「刊行済みの最新巻」の差**を表示する個人用アプリ。

主目的は新刊の取りこぼし防止。読書記録アプリではない。

- 公開URL: https://relaunch1976.github.io/comics/
- 設計書: [comics-tracker-design.md](comics-tracker-design.md)
- API検証の記録: [comics-tracker-verification.md](comics-tracker-verification.md)

## 構成

ブラウザで完結する静的ページ。サーバーサイドの処理は無い。

- データは端末内の localStorage
- PC・スマホ間の共有は OneDrive（Microsoft Graph / AppFolder スコープ）
- 書誌情報は楽天ブックス書籍検索API

## 開発

```bash
npm install
npm test        # コアロジックのテスト（Node 標準の test runner）
npm run dev     # 開発サーバー
npm run build   # 本番ビルド
```

### ローカルからは実APIを叩けない

楽天アプリ登録の「許可されたWebサイト」に `relaunch1976.github.io` しか登録できていない（`localhost` も `127.0.0.1` も書式チェックで弾かれる）。

そのため開発は **`src/api/fixtures/` の実レスポンスを使ったフィクスチャ駆動**で行う。実APIの確認が要る段階で GitHub Pages にデプロイする。

## デプロイ

`main` に push すると GitHub Actions がビルドして Pages に公開する。

必要なリポジトリシークレット:

| 名前 | 内容 |
|---|---|
| `RAKUTEN_APP_ID` | 楽天ウェブサービスの applicationId |
| `RAKUTEN_ACCESS_KEY` | 同 accessKey |
