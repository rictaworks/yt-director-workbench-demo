# 開発環境

- Node.js24 / npm。依存は package-lock.json で固定します。
- UI: 静的 TypeScript を Vite で配信。127.0.0.1:5173 の /api を 127.0.0.1:8787 へプロキシします。
- Worker: `npm run dev:api` はバンドル後、公式 Miniflare API で workerd を起動します。D1スキーマを初回だけ適用し、`.wrangler/local-d1` に永続化します。
- Wrangler CLI を使う場合は `npm run dev:api:wrangler` です。環境によってCLIのネットワークインターフェース取得が制限されるため、標準の開発コマンドは Miniflare を採用しています。
- Domain Core はプラットフォーム型なしで型検査します。入出力は純粋関数・ポートで分離しています。
- AI はローカルで無効。テストで使うプロバイダー応答は合成データで、外部呼び出しはありません。

## コマンド

- npm run lint: Core依存境界・禁止UI APIの限定的静的チェック。
- npm run typecheck: Core/UI/Workerの型検査。
- npm test: Core、HTTP、実SQLite、API、Jev adapter、Frontend、安全性のテスト。
- npm run build: dist/pages に静的UIを生成。
- npm run build:api: dist/worker にWorkerをdry-runビルド。公開しません。
- npm run test:runtime: 実workerdとローカルD1の統合フロー。
- npm run check: 上記すべて。
- npm run test:browser: Chromiumで7画面を通る実ブラウザ検証。先に npm run check と npx playwright install chromium を実行。

CIはPRとmain push時に同じcheckを実行します。ブラウザ検証用のChromiumはCIで別途インストールします。デプロイ処理は含みません。

ホームが書き込み不可の実行環境では、XDG_CONFIG_HOME と npm_config_cache を書き込み可能な開発用パスへ設定してください。シークレットをこれらの設定値に含めません。

ローカルのCronは自動発火しません。日次消去はテストでscheduled handlerを直接呼んで確認します。本番はwrangler設定の `0 18 * * *` が発火します。
