# 年号120

小学生向けの歴史年号暗記用静的PWAです。vanilla HTML/CSS/JSのみで動き、ビルドや外部リソースは使いません。

## 起動方法

`file://` で開くとService Workerが動かないため、ローカル配信で確認します。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開きます。

## 問題データ

開発用に `questions.sample.json` を同梱しています。実データはリポジトリに入れず、アプリの「設定とデータ」画面からJSONファイルを読み込みます。

問題データの形:

```json
{
  "version": "2026-07-08",
  "title": "重要年代（標準編）120問",
  "questions": [
    { "id": 1, "col": 1, "row": 1, "round": 1, "event": "出来事", "year": 645, "goro": "" }
  ]
}
```

読み込み時に、120問・id 1〜120・year整数・round 1〜4・列と回の対応を検証します。不正なJSONは反映されません。

## 記録の保存

問題データ、問題別成績、セッション履歴、設定はブラウザのlocalStorageに保存します。「設定とデータ」画面からJSONとしてエクスポート/インポートできます。

## GitHub Pages公開手順

1. このディレクトリをGitHubリポジトリにpushします。
2. GitHubのSettings → Pagesで、公開ブランチとルートディレクトリを選びます。
3. 公開URLをiPad Safariで開き、ホーム画面に追加します。
4. 実データは公開リポジトリに置かず、iPadの「ファイル」からアプリ内で読み込みます。
