# Open-Prompted Anime Tools (OPAT)

OpenToonz コミュニティメンバーが AI を使って開発した、アニメ制作に役立つ小規模な Web アプリケーション集です。
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

## ライセンス / License

- **ポータル本体**（`index.html`、`scripts/`、ルート直下のファイル）は New BSD License (BSD 3-Clause) で公開しています。詳細は [LICENSE](./LICENSE) を参照してください。
- **各アプリ**（`apps/<app_id>/`）のライセンスは各アプリで規定されます。特に明記がない場合、AI生成部分は著作権を主張せず、人間が手直しした部分は 0BSD、プロンプトは `meta.json` の `promptLicense` で著者が指定したライセンスが適用されます。

- The **portal itself** (`index.html`, `scripts/`, and other files at the repository root) is released under the New BSD License (BSD 3-Clause). See [LICENSE](./LICENSE).
- The license of each **application** (`apps/<app_id>/`) is defined by that application. Unless stated otherwise, no copyright is claimed on AI-generated code, human-modified parts are under 0BSD, and prompts are licensed by their authors as given in `promptLicense` in `meta.json`.
