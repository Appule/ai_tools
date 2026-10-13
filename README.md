# Open-Prompted Anime Tools (OPAT)

OpenToonz コミュニティメンバーが AI を使って作成した、アニメ制作に役立つ小規模な Web アプリケーション集です。
A collection of small, AI-generated web applications for anime production, built by the OpenToonz community.

- 公開ページ / Site: https://opentoonz.github.io/ai_tools/
- アプリの追加方法 / How to contribute: [CONTRIBUTING.md](./CONTRIBUTING.md)

## 構成 / Layout

```text
index.html          ポータル本体 (アプリ一覧・Information パネル)
apps/<app_id>/      各アプリ (index.html + meta.json)
apps/apps-index.js  meta.json から自動生成されるインデックス (手動編集不可)
scripts/build-index.js  インデックス生成スクリプト (node scripts/build-index.js)
```

`apps/**/meta.json` を変更して `main` に push すると、GitHub Actions が `apps/apps-index.js` を再生成します。
