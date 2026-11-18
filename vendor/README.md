# 同梱ライブラリ / Vendored libraries

このフォルダには、アプリに埋め込む第三者ライブラリの原本を置きます。各ライブラリのファイルは npm の公式パッケージから取り出したもので、変更していません。ライブラリには、それぞれのライセンスが適用されます。

This directory stores the original files of third-party libraries embedded in apps. The library files are extracted unchanged from the official npm packages. Each library remains under its respective license.

| ライブラリ / Library | バージョン / Version | ライセンス / License | 入手元 / Source |
| --- | --- | --- | --- |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) | [npm](https://registry.npmjs.org/jszip/-/jszip-3.10.1.tgz) |
| jspdf | 2.5.1 | MIT | [npm](https://registry.npmjs.org/jspdf/-/jspdf-2.5.1.tgz) |
| driver.js | 1.0.1 | MIT | [npm](https://registry.npmjs.org/driver.js/-/driver.js-1.0.1.tgz) |
| sql.js | 1.8.0 | MIT | [npm](https://registry.npmjs.org/sql.js/-/sql.js-1.8.0.tgz) |

## 追加手順 / Adding a library

1. 原本と `NOTICE.txt` をライブラリ用のフォルダに置きます。
2. `manifest.json` にファイルの情報と SHA-384 を追記します。
3. 下のコマンドでテストを実行します。

1. Place the original files and `NOTICE.txt` in the library directory.
2. Add the files and their SHA-384 digests to `manifest.json`.
3. Run the tests below.

```sh
node --test scripts/test/opat-core.test.mjs scripts/test/vendor.test.mjs
```
