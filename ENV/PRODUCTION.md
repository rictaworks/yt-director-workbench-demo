# 公開前の確認

本リポジトリの現在の設定はローカル開発用です。GitHubへのソース公開と、稼働サービスの公開は別の工程です。リモートD1、AIバインディング、ドメイン、デプロイは未設定です。

## Cloudflare

1. ユーザーの許可を得たアカウントが Workers Free であることを確認します。コードの WORKERS_PLAN 文字列は請求プランを証明・変更しません。
2. D1を作成し、ダミーUUIDを実DB IDへ置き換え、migrations/0001_initial.sql を適用します。データ共有や権限を勝手に拡張しません。
3. Pages の成果物は dist/pages。API Worker を同じオリジンの /api/* にルーティングします。クロスオリジンCookie許可で代用しません。
4. WorkerのCronはUTC18:00（JST03:00）。scheduled handlerが全セッションを起点に全件消去します。
5. 実環境でセッション分離・Cookie属性・DB・Cron・コピー操作を確認してから公開判定します。

## Jevのライブ接続に残る検証

実装は公式 Workers AI binding の `AI.run('typesafe/jev', {state, questions})` を使用し、ChoiceとNoulを同一呼び出しで評価します。`jev-1.13.0` 以外の応答、スキーマ不正、障害は明示停止します。代替モデルや直接TypeSafe APIは呼びません。

重要: 公式Cloudflareの現在の入力schemaにはJevのversion指定がありません。そのため、応答modelを厳密検証して版変更時に停止する方式です。リクエスト段階の厳密pinを確認したという意味ではありません。

- [Cloudflare Jev model](https://developers.cloudflare.com/ai/models/typesafe/jev/) は third-party / token料金で掲載されています。
- [Workers AI料金](https://developers.cloudflare.com/workers-ai/platform/pricing/) の10,000 Neurons無料枠にJevが含まれるかは、現行公開資料だけでは確認できていません。
- [TypeSafe models](https://docs.typesafe.ai/models) の直接APIはversion指定を説明していますが、仕様で禁止されているため本アプリでは使用しません。

このため `JEV_ENABLED=false` を既定とし、AIバインディングも追加していません。無料条件・バージョン固定方法・必要な規約・ユーザー承認を確認するまでライブ接続を有効化しません。課金プラン移行は行いません。この未検証点を「自動分類のライブ動作確認済み」と報告しません。

[Workers AI errors](https://developers.cloudflare.com/workers-ai/platform/errors/) の日次枠超過は明示停止し、手動選択だけで継続できます。一般の一時障害・モデル不一致も手動選択に限定します。
