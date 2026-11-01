# ライフプラン（個人用 PWA）

やりたい事・タスク・習い事・ジャーナルをまとめて整理する、自分専用のライフプランアプリです。
ビルド不要の静的ファイル（HTML / CSS / JS）だけで動き、外部ライブラリや CDN は使いません。オフラインでも使えます。

- データはこのブラウザの **localStorage** に保存されます。コードやリポジトリにはデータは含まれません。
- 任意で **GitHub 同期**（プライベートリポジトリ `100nao/life-plan-data`）をオンにすると、AIコーチがデータを読み、アドバイスを返せます。
- 個人的な内容は最初から入っていません。サンプルが必要なときは「サンプルを追加」ボタンで入れます（まとめて削除もできます）。

## ファイル構成

| ファイル | 内容 |
|---|---|
| `index.html` | 画面の骨組み。iOS 用 meta、CSP（通信先は自分自身と `api.github.com` のみ） |
| `styles.css` | スタイル（ライト／ダーク、スマホ優先、PCではサイドバー） |
| `app.js` | アプリ本体（`.parts/p1〜p6.js` を連結したもの） |
| `sw.js` | Service Worker（全ファイルをキャッシュしてオフライン対応。GitHub API はキャッシュしない） |
| `manifest.webmanifest` | ホーム画面に追加するための設定 |
| `icons/` | アイコン（180 / 192 / 512 / maskable / favicon）。`tools/make_icons.py` で生成 |
| `tests/test_full.py` | Playwright による E2E テスト（GitHub API はモック） |
| `screens/` | テスト時のスクリーンショット |

`app.js` を直すときは `.parts/` を編集して `cat .parts/p[1-6].js > app.js` で作り直します（直接 `app.js` を編集しても動きます）。
アプリを更新したら `sw.js` の `CACHE_VERSION` を上げると、端末側のキャッシュが確実に入れ替わります。

## 主な機能

- **ホーム**：コーチからの新着アドバイス、今年のフォーカス、件数、ミニマトリックス、ずっとできていない事、期限が近いもの、今日のやりたい事ピック、カテゴリ別の進み具合、最近のジャーナル
- **マトリクス**：緊急かつ重要／重要だが緊急でない／緊急だが重要でない／どちらでもない（上＝緊急、左＝重要）。iPhone は ⇄ をタップして移動、PC はドラッグでも移動
- **ステップ**：各項目に順番付きステップ（期限・完了チェック・並べ替え）、進捗バー、縦のステッパー表示。「💡 ステップのヒント」（引っ越し・資格取得・旅行計画・買い物 など）と「📋 番号付きリストから貼り付け」
- **ずっとできていない事**：作成日／最後の進捗からの日数。14日以上で「停滞」。理由タグ（時間がない／優先度が低い／気が重い／次の一歩が不明／お金／他人待ち／その他）と自由メモ
- **やりたい事**：カテゴリ（編集可）・重要度・時期（今年／1〜3年／5年以内／いつか＋日付）・状態・絞り込みと並べ替え
- **後回しでいい事**：「やりたい事へ ↑」で昇格
- **習い事**：状態・頻度・月額・開始日・メモ・練習記録、今月の回数、継続中の月額合計
- **未整理**：とりあえずメモ → ワンタップで振り分け。「リマインダーから読み込み」
- **ジャーナル**：日付・気分（1〜5）・関連タスク、検索
- **コーチに相談**：GitHub 同期の予備として、状況のまとめ（テキスト＋JSON）をコピー／共有。返ってきたアドバイスやステップ JSON を貼り付けて取り込み
- どこからでも ＋ でクイック追加、検索、完了履歴、取り消し（元に戻す）、JSON の書き出し／読み込み、ダークモード

## GitHub 同期（AIコーチ連携）— 最初の1回だけ

1. GitHub で **Fine-grained personal access token** を作る
   （Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token）
   - Repository access：**Only select repositories** → `life-plan-data` だけ
   - Permissions → Repository permissions → **Contents：Read and write**（ほかは不要）
   - 有効期限は任意（切れたらアプリに「トークンが正しくないか、期限切れです」と出るので、作り直して貼り直す）
2. アプリの **設定 → GitHub 同期** でトークンを貼り付けて **「接続テスト」** を押す
   （owner `100nao` / repo `life-plan-data` / path `data/life-plan.json` / branch `main` は最初から入っています。変える場合は「詳細設定」）

以後は自動です。
- アプリを開いたとき・画面に戻ったとき・オンラインに戻ったとき・表示中は3分ごとに **自動で読み込み**（他の端末やコーチの変更をマージ）
- 変更すると約3秒後に **自動で保存**（内容が変わったときだけコミット）
- `data/coach-inbox.json` を **自動で取り込み**、ホームに「コーチからの新着アドバイス」として表示
- 右上の雲アイコンが同期状態（緑＝同期済み／青＝同期中／赤＝エラー／黄＝オフライン）。手動の保存・読み込みボタンは設定の「手動操作・接続設定」にあります

マージは項目ごとに「新しく更新された方が勝つ」方式で、削除も記録（トゥームストーン、180日保持）して同期します。
トークンはこの端末の localStorage（`lifeplan.sync`）にだけ保存され、バックアップや GitHub のデータには含まれません。

## データ形式

### `data/life-plan.json`（アプリが書く・AIコーチが読む）

```json
{
  "app": "lifeplan", "schema": 2, "version": "1.0.0", "savedAt": "2026-11-01T06:00:00.000Z",
  "data": {
    "categories": ["旅行", "仕事/キャリア", "健康", "家族", "趣味", "学び", "お金", "その他"],
    "items": [{
      "id": "…", "list": "task | wish | later | inbox", "title": "英会話", "notes": "",
      "category": "学び", "importance": "high | mid | low",
      "timeframe": "thisYear | y1_3 | y5 | someday | ''", "targetDate": "2026-12-31",
      "status": "todo | doing | done", "quadrant": "q1 | q2 | q3 | q4 | ''",
      "steps": [{ "id": "…", "text": "無料体験を予約", "due": "2026-11-10", "done": false, "doneAt": "" }],
      "stuck": { "tags": ["時間がない"], "text": "平日の夜が埋まりがち", "updatedAt": "…" },
      "tags": [], "createdAt": "…", "updatedAt": "…", "lastProgressAt": "…", "completedAt": ""
    }],
    "lessons": [{ "id": "…", "name": "英会話", "status": "considering | active | paused | ended", "frequency": "週1", "monthlyCost": 6480, "startDate": "", "notes": "", "logs": [{ "id": "…", "date": "2026-11-01", "memo": "" }] }],
    "journal": [{ "id": "…", "date": "2026-11-01", "mood": 4, "text": "…", "linked": ["<item id>"] }],
    "coachNotes": [{ "id": "…", "date": "2026-11-01", "title": "", "text": "…", "read": true, "source": "github | paste", "stepsResult": [] }],
    "focus": { "2026": "健康の土台をつくる" },
    "deleted": { "<id>": "<削除日時>" }
  }
}
```
象限：`q1` 緊急かつ重要／`q2` 重要だが緊急でない／`q3` 緊急だが重要でない／`q4` どちらでもない。
AIコーチは原則このファイルを **読むだけ** にして、返事は下の受信箱に書いてください。

### `data/coach-inbox.json`（AIコーチが書く・アプリが自動で取り込む）

```json
{
  "messages": [
    {
      "id": "2026-11-01-weekly",
      "date": "2026-11-01",
      "title": "今週のフォーカス",
      "text": "緊急かつ重要のうち「9hoursパリティ解消」を最優先に。英会話は停滞中なので、まず無料体験の予約だけでOK。",
      "stepSuggestions": [
        { "taskTitle": "英会話", "steps": ["オンライン英会話を3社比較", "無料体験を予約"] }
      ]
    }
  ]
}
```
- `id` ごとに1回だけ取り込みます（同じ `id` を書き直しても重複しません）。新しいメッセージは配列に **追記** してください。古いものは消しても構いません。
- `text`（または `advice` / `message` / `body`）が本文。`title`・`date`・`stepSuggestions` は任意。
- `stepSuggestions[].taskTitle` はタイトルの完全一致 → 部分一致で項目を探し、見つからなければ未整理に新しい項目を作ってステップを追加します（同じ文のステップは重複しません）。
- 配列だけ（`[ {...}, {...} ]`）や、1件だけのオブジェクトでも受け付けます。

### コーチのステップ JSON（貼り付け取り込み・「コーチに相談」画面）

```json
{"taskTitle": "引っ越しする", "steps": ["物件の条件を決める", "内見を予約", "管理会社に退去連絡"]}
```
複数のときは配列 `[{...}, {...}]` か `{"tasks": [...]}`。前後に文章や ```json のコードブロックがあっても JSON 部分を探して読みます。

### リマインダー（`reminders.json`）

iPhone のショートカット等で書き出した JSON を「未整理 → リマインダーから読み込み」で取り込みます。
```json
{"reminders": [
  {"title": "パスポート更新", "list": "旅行", "notes": "…", "dueDate": "2026-12-20T09:00:00+09:00",
   "isCompleted": false, "priority": 1, "flagged": false, "tags": ["手続き"]}
]}
```
- 配列だけでも可。`title` 以外は任意。
- `priority`：1〜4 → 高、5 → 中、6〜9 → 低（`"high"` などの文字も可）、`flagged: true` → 高
- 完了済みは既定でスキップ（チェックで含められます）。同じタイトル・リスト・期限は重複として追加しません。
- `list` 名がカテゴリ名と同じなら、そのカテゴリに入ります。

### バックアップ（設定 → JSONで書き出す）

`{"app":"lifeplan","schema":2,"version":"1.0.0","exportedAt":"…","data":{…上と同じ…}}`。
読み込みは「統合（新しい方を残す）」か「置き換え」を選べます。トークンは含まれません。

## 公開（ホスティング）について

- iPhone の「ホーム画面に追加」とオフライン動作には **HTTPS** が必要です（`localhost` は例外）。
  例：GitHub Pages、Cloudflare Pages、Netlify などの静的ホスティング。
- **アプリのコードを置くリポジトリと、データの `life-plan-data` リポジトリは分けてください。**
  データ用はプライベートのまま、アプリ側にはデータを一切置きません（アプリにはデータは含まれていません）。
- GitHub Pages で公開すると URL を知っている人は画面を開けますが、データは各自のブラウザにしか無く、トークンが無ければ GitHub のデータも読めません。
- iPhone：Safari で開く → 共有 → 「ホーム画面に追加」。

## 制限・注意

- iOS Safari は、ホーム画面に追加していないサイトのデータを長期間使わないと消すことがあります。ホーム画面に追加して使い、GitHub 同期か定期的な JSON 書き出しを推奨します。
- トークンは端末の localStorage に平文で保存されます。対象を `life-plan-data` だけ・Contents 権限だけにしたトークンを使ってください。端末を手放す前に「接続を解除」。
- 自動保存は変更ごと（約3秒まとめて）に GitHub へ1コミットします。コミット数は多めになります。
- 同時に2台で同じ項目を編集した場合は、後から更新した方が残ります（項目単位）。
- 実際の GitHub への接続はテストしていません（テストはモックの GitHub API で実施）。
- 通知（プッシュ通知）や、AIへの直接送信機能はありません（AIコーチは GitHub 上のファイルを介してやり取りします）。

## ローカルで動かす・テスト

```bash
cd life-plan-app
python3 -m http.server 8792 --bind 127.0.0.1   # http://127.0.0.1:8792/
python3 tests/test_full.py                     # Playwright（Chrome）で E2E テスト
python3 tools/make_icons.py                    # アイコン再生成（Pillow）
```
