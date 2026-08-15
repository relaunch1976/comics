import { defineConfig } from "vite";

// GitHub Pages のプロジェクトサイト（https://relaunch1976.github.io/comics/）
// で配信するため、base をサブパスに固定する。
// PWA のマニフェストと Service Worker のスコープも同じにすること。
export default defineConfig({
  base: "/comics/",
  define: {
    // accessKey はリポジトリに書かず、GitHub Actions のシークレットから注入する。
    // ドメイン制限（許可されたWebサイト = relaunch1976.github.io）があるため、
    // 成果物に含まれること自体は許容している。詳細は設計書 §2。
    __RAKUTEN_APP_ID__: JSON.stringify(process.env.RAKUTEN_APP_ID ?? ""),
    __RAKUTEN_ACCESS_KEY__: JSON.stringify(process.env.RAKUTEN_ACCESS_KEY ?? ""),
  },
});
