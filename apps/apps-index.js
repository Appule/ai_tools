// 自動生成されたインデックスデータです。変更しないでください。
window.globalAppsData = [
  {
    "id": "clip_file_checker",
    "name": "CLIP STUDIOファイル解析・チェック",
    "shortDescription": "CLIP STUDIOのファイル（.clip）を解析し、そのデータがあらかじめ指定した条件を満たしているかどうかをチェックします",
    "tags": [
      "作画",
      "CLIP STUDIO",
      "解析"
    ],
    "searchKeywords": [
      "clip studio",
      "check",
      "validation"
    ],
    "aiInfo": {
      "model": "Gemini",
      "version": "3.5"
    },
    "manual": "1.入力フィールドにチェック対象のCLIPファイルをドラッグ＆ドロップするか、クリックして選択します。<br>2.判定条件を入力し、チェック結果を確認します。<br>3.「再読み込み」ボタンを押すと、同じファイルを再度読み込んでチェック結果を更新します。<br>4.「修正版を保存」ボタンを押すと、条件をクリアしたCLIPファイルを保存できます。<br>※上書き保存する場合は、必ずバックアップを取って作業してください。",
    "promptUrl": "https://gemini.google.com/share/d/1XXapvE6hImYjsUX0tys9udLfoUhChQlx?usp=sharing",
    "author": "Shun Iwasawa",
    "promptLicense": "CC BY 4.0",
    "referencedOSS": [
      {
        "name": "clipstudio.js",
        "url": "https://github.com/saitolume/clipstudio.js",
        "license": "MIT License"
      }
    ],
    "referenceArticles": [
      {
        "title": "CLIP STUDIO PAINTのファイルからNode.jsでサムネイル画像を出力する",
        "url": "https://qiita.com/kcpoipoi/items/16afb4ae3f83439f6ff6"
      }
    ]
  },
  {
    "id": "color_changer",
    "name": "色替えツール",
    "shortDescription": "参照画像ペアから色置換パレットを作成し、複数画像の色を一括置換します",
    "tags": [
      "仕上げ",
      "色替え",
      "色置換",
      "TGA"
    ],
    "searchKeywords": [
      "color change",
      "color replace"
    ],
    "aiInfo": {
      "model": "Claude Code",
      "version": "Sonnet 5"
    },
    "manual": "1.フォルダの指定方法を選択し、フィールドにフォルダをドラッグ＆ドロップするか、ファイルブラウザからフォルダまたは複数のファイルを選択して指定します<br> 2.入力画像／参照画像のペアから色置換パレットが作成されます。PaintMan用色置換設定ファイルの書き出しも可能です<br> 3.「色替え処理開始」ボタンを押すと、色置換パレットに従って処理対象ファイルの色替えを行い、ファイルが上書き保存されます",
    "promptUrl": "./apps/color_changer/color-changer-dev-log.html",
    "author": "Shun Iwasawa",
    "promptLicense": "CC BY 4.0",
    "referencedOSS": [],
    "referenceArticles": [],
    "downloadUrl": "https://drive.google.com/file/d/11-0eneMbRBdsxD2YHzI5REDhHmWxXzS5/view?usp=sharing"
  },
  {
    "id": "export_folder_zipper",
    "name": "OpenToonz Export Folder Zipper",
    "shortDescription": "Package a folder created by OpenToonz Export > Export Scene into a shareable ZIP file directly in your browser. Files stay local and are not uploaded to a server.",
    "tags": [
      "OpenToonz",
      "Export Scene",
      "ZIP",
      "Troubleshooting",
      "Project Sharing"
    ],
    "searchKeywords": [
      "opentoonz",
      "export scene",
      "zip",
      "folder",
      "scene package",
      "scene file",
      "tnz",
      "tlv",
      "tpl",
      "palette",
      "troubleshooting",
      "project sharing",
      "browser tool"
    ],
    "aiInfo": {
      "model": "ChatGPT",
      "version": "GPT-5.5 Thinking"
    },
    "manual": "1. In OpenToonz, use Export > Export Scene to create an exported scene folder.\n2. Select that exported folder in this tool.\n3. Review the detected contents, warnings, total size, and suggested ZIP name.\n4. Click Create ZIP.\n5. Download the generated ZIP package and use the SHA-256 receipt for verification when sharing or troubleshooting.",
    "author": "Rodney Baker / Open Animation Library",
    "promptUrl": "https://github.com/OpenAnimationLibrary/extrastuff/blob/master/docs/tools/opentoonz-export-folder-zipper/prompts/initial_prompt.md",
    "promptLicense": "CC BY 4.0",
    "referencedOSS": [
      {
        "name": "JSZip",
        "url": "https://github.com/Stuk/jszip",
        "license": "MIT License"
      }
    ],
    "referenceArticles": [
      {
        "title": "MDN: HTMLInputElement.webkitdirectory",
        "url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory"
      },
      {
        "title": "MDN: File API",
        "url": "https://developer.mozilla.org/en-US/docs/Web/API/File_API"
      },
      {
        "title": "MDN: SubtleCrypto.digest()",
        "url": "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest"
      },
      {
        "title": "JSZip documentation",
        "url": "https://stuk.github.io/jszip/"
      }
    ]
  },
  {
    "id": "fill_black_pixels_with_color",
    "name": "黒ピクセルを塗り色で埋める",
    "shortDescription": "二値TGA画像の、実線（黒ピクセル）部分を周囲の塗り色で埋めます",
    "tags": [
      "仕上げ",
      "二値",
      "TGA",
      "補正"
    ],
    "searchKeywords": [
      "ink paint",
      "fill lines",
      "black pixels"
    ],
    "aiInfo": {
      "model": "Gemini",
      "version": "3.5"
    },
    "manual": "1.入力フィールドに処理対象のTGAファイルをドラッグ＆ドロップするか、クリックして選択します。（複数選択可）<br>2. 処理が行われるので、結果をダウンロードします。",
    "promptUrl": "https://gemini.google.com/share/d/1zUFBBd4z4mRuqNwzzkz-yG4_xfRTBPyH?usp=sharing",
    "author": "Shun Iwasawa",
    "promptLicense": "CC BY 4.0"
  },
  {
    "id": "img_to_pdf",
    "name": "画像一括PDF変換",
    "shortDescription": "絵コンテなどの画像ファイルをPDFに変換します。透かし（ウォーターマーク）を付けることができます。",
    "tags": [
      "絵コンテ",
      "PDF変換",
      "透かし"
    ],
    "searchKeywords": [
      "storyboard",
      "conversion",
      "watermark"
    ],
    "aiInfo": {
      "model": "Gemini",
      "version": "3.5"
    },
    "manual": "1. 画像ファイルをドラッグ＆ドロップ又はクリックして選択します。(複数選択可)<br>2. 透かしを設定します。<br>3. 「PDFを生成してダウンロード」ボタンをクリックします。",
    "author": "Naruya Ninomiya",
    "promptLicense": "CC BY 4.0"
  },
  {
    "id": "timesheet_entry_assist",
    "name": "タイムシート入力補助",
    "shortDescription": "手書きのタイムシートのデジタル入力をサポートするツールです。タイムシート画像に入力フィールドを重畳して、手書きの数字を透かしながら動画番号を入力することができます。",
    "tags": [
      "作画",
      "XDTS"
    ],
    "searchKeywords": [
      "timeline",
      "xsheet",
      "digitize"
    ],
    "aiInfo": {
      "model": "Gemini",
      "version": "3.x"
    },
    "manual": "画面左下「使い方ガイド」をクリックして説明をご参照ください。",
    "author": "Yuka Chomei",
    "promptLicense": "CC BY 4.0"
  },
  {
    "id": "trace_fix",
    "name": "Trace Fix（線修正支援ツール）",
    "shortDescription": "仕上げ工程の線の修正を支援する 3 つのツール集です。下に潜った線の復元（線交差修正）、色トレスの影境界合わせ（影境界修正）、塗りの境目のジャギー除去（境界なめらか化）を、ブラウザの中だけで行います。",
    "tags": [
      "仕上げ",
      "線修正",
      "色トレス",
      "TGA",
      "AI"
    ],
    "searchKeywords": [
      "trace fix",
      "line",
      "crossing",
      "shadow",
      "boundary",
      "smooth",
      "jaggy",
      "ink paint",
      "onnx"
    ],
    "aiInfo": {
      "model": "Claude Code",
      "version": "Opus 5.5"
    },
    "manual": "1. スタート画面で使うツール（線交差修正／影境界修正／境界なめらか化）を選びます。<br>2. 「フォルダを開く」（Ctrl+O）でフォルダを選ぶか、PNG / TGA の画像を画面にドラッグ＆ドロップします。<br>3. 線交差修正では「修正前」「修正後」の色と処理モードを選びます。影境界修正では「色の指定」で塗りの影色・ノーマル色と色トレスの影側・ノーマル側の4色を指定します。境界なめらか化では「なぞり登録」で隣り合う2色の組を登録し、登録した組だけを直すか、それ以外を直すかを選びます。<br>4. 修正したい範囲を囲む（全体選択は A キー。影境界修正では色トレス2色の範囲）と、修正結果がプレビューされます。キーを押している間だけ修正前を表示できるので（線交差修正は P、影境界修正・境界なめらか化は C）、見比べてから Enter で確定、Esc で取り消します。<br>5. 線交差修正と影境界修正では、設定が決まったら「全フレーム一括」（Ctrl+B）で全フレームに適用し、1枚ずつ送って確認します（境界なめらか化は一括処理に未対応のため、1フレームずつ処理します）。<br>6. 「保存」（Ctrl+S）／「全フレーム保存」（Ctrl+Shift+S）で書き出します。既定は元のファイルへの上書きなので、必要ならバックアップを取ってから作業してください。「保存先…」で別フォルダへ変更でき、「名前を付けて保存」（Ctrl+Alt+S）で今の1枚を別名で保存できます。直接書き込みに対応しない環境ではダウンロードになります。<br>※ 画像はどこにも送信されず、AI の処理もすべてブラウザの中で行います。フォルダの読み書きは Chrome / Edge で使えます。キーは既定の割り当てです。キーの確認・変更は、線交差修正では「設定」内の「キー割り当て」、境界なめらか化では「キー設定」で行います（影境界修正にはキー設定画面はありません）。",
    "author": "Naruya Ninomiya",
    "referencedOSS": [],
    "referenceArticles": []
  },
  {
    "id": "xdts_timeline_checker",
    "name": "XDTS 総合チェック",
    "shortDescription": "原画と動画の .xdtsファイル を選択（複数選択可）し、動画タイムラインの全体集計と合成伝票を自動生成します。",
    "tags": [
      "作画",
      "XDTS",
      "解析"
    ],
    "searchKeywords": [
      "timeline",
      "check",
      "annalyze"
    ],
    "aiInfo": {
      "model": "Gemini",
      "version": "3.x"
    },
    "manual": "1. 原画、動画のXDTSファイルを、それぞれのファイル選択ボタンから指定します。<br>「タイムラインを解析して伝票・表を作成」ボタンをクリックして、解析結果を確認します。",
    "author": "Yuka Chomei",
    "promptLicense": "CC BY 4.0"
  }
];