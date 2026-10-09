# API一覧

すべて同一オリジンの `/api` 以下です。Cookie のセッション ID を所有者とし、別セッションの案件は404を返します。セッション ID 自体はレスポンスに含めません。全変更APIは JSON、96KiB以下、ハニーポット `website: ""` を受け付けます。未知の入力列を永続データへコピーしません。

`/api/projects/{projectId}` を P とします。変更成功時はその案件全体（安全なID・全成果物）を返します。

| タイトル | メソッド・URL | 主な入力 |
|---|---|---|
| 起動確認 | GET /api/health | なし |
| 初期データ | GET /api/bootstrap | なし。projects / catalog / today を返します |
| 案件作成 | POST /api/projects | clientAlias（1〜80字） |
| 案件取得 | GET P | なし |
| チャンネル設計 | PUT P/channel | industry / goal / target（任意200字） |
| 企画メモ保存・分類 | POST P/ideas | memo（2〜500字）/ ideaType（指定時は手動） |
| 企画シート | POST P/plans | ideaId / ideaType |
| 台本作成 | POST P/outlines | planId / targetSeconds（1〜1800、既定480） |
| 台本メモ保存 | PUT P/outlines/{outlineId} | blocks: seq / talkingPoints（2000字）/ shootMemo（1000字） |
| 日程逆算 | POST P/schedules | planId / publishDate / shootDate（任意） |
| 工程状態 | PATCH P/tasks/{taskId} | status: todo / in_progress / done |
| 編集指示書 | POST P/edit-briefs | planId |
| 月次数値保存 | PUT P/metrics | month / views / subsDelta / retention / conversions |
| 月次比較 | GET P/report?month=YYYY-MM | 対象月。直前の暦月と比較します |

日付は有効な YYYY-MM-DD、時点は JST で扱います。数値は非負の安全整数、維持率のみ0〜100の有限小数を許可します。ハニーポットが空でないリクエストは204で破棄し、DB操作を行いません。

変更リクエストは Origin がある場合に同一オリジンを検証し、cross-site Fetch Metadata を拒否します。Cookie は HttpOnly / SameSite=Strict、本番HTTPSでは Secure、次の JST03:00 で期限切れです。

エラーは `{error: code, message: 日本語説明}`。400入力不正、403外部オリジン、404対象なし、409前提成果物なし、413サイズ超過、415形式不正、503DB未設定、500内部障害です。内部SQLや秘密情報を返しません。

Jev エラーは保存された企画の classification に明示し、手動選択へ進めます。自動生成へ見せかけた成功レスポンスは返しません。
