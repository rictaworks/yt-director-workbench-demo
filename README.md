# Director Workbench（デモ版）

法人向け YouTube 制作の企画・台本・日程・編集指示・月次振り返りを、型に沿って作る日本語デモです。生成はテンプレートと決定的ルールで行います。

## 起動

Node.js 24 と npm を使用します。

```sh
npm ci
npm run dev:api
```

別のターミナルで実行します。

```sh
npm run dev
```

[http://localhost:5173/](http://localhost:5173/) を開き、「A社」など架空の呼称で案件を作成してください。認証・自動ログインはありません。ローカル D1 の初回マイグレーションは起動時に適用します。作成済みデータは `.wrangler/local-d1` に保存します。

自動分類は、Workers AI バインディング未設定のローカル環境では明示停止します。そのまま手動で企画型を選び、すべての制作工程を進められます。偽の AI 分類や別モデルへのフォールバックは行いません。

## 画面一覧

案件 ID は作成後の URL に入ります。

| 画面 | URL |
|---|---|
| ホーム・案件一覧 | [/#home](http://localhost:5173/#home) |
| チャンネル設計 | /#channel/{projectId} |
| 企画メモ・企画シート | /#ideas/{projectId} |
| 台本構成・撮影チェックリスト | /#outline/{projectId} |
| スケジュール | /#schedule/{projectId} |
| 編集指示書 | /#brief/{projectId} |
| 月次レポート | /#report/{projectId} |

各成果物は Markdown としてコピーできます。クリップボードが使えない場合は選択可能なテキストを表示します。

## チェック

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

`check` は境界チェック、型検査、単体・SQLite/API テスト、UI/Worker ビルド、実 workerd+D1 統合テストを実行します。ブラウザテストでは7画面の制作フローとモバイル表示を確認します。既存の Chromium を使う場合は `CHROMIUM_PATH=/path/to/chromium` を指定できます。

## ドキュメント

- [API一覧](SPEC/api.md)
- [開発環境](ENV/DEVELOPMENT.md)
- [公開前の確認と制約](ENV/PRODUCTION.md)
- [採用した開発ルール](AGENTS.md)
- [仕様の読み替えと実装上の判断](TASKS/implementation-notes.md)
- [原本仕様書](requirements.md)

個人情報・機密情報は入力しないでください。公開時のデータは毎日 JST 03:00 に消去されます。ローカル開発サーバーは Cron を自動発火しません。
