# 共通デモUIとGA4準備の判断・検証記録（Issue #6）

## 承認と適用ルール

利用者は元の「計測を追加しない」仕様との相違の説明を受けた上で「新しい方に合わせて」と指示した。共通UI・法務案内・既存GA4の導入が限定した例外として承認された。本PRでは後述の安全性ブロッカーによりGA4は準備段階に留まる。`requirements.md` は変更しない。OGP／ソーシャルカードは別承認待ち。ドラフトPRまでとし、マージ・Cloudflare設定変更・デプロイは行わない。

参照元:
- [context/setup/Claude @8f1ed19](https://github.com/rictaworks/context/tree/8f1ed19bd075c89a3f445141ba8123591d895b92/setup/Claude)
- [contract-flow-template-demo @a73818b](https://github.com/rictaworks/contract-flow-template-demo/tree/a73818bc428e25789561b1a7cad4bf1f1b7f75e5)
- [公開された参照デモ](https://contract-flow-template-demo.rictaworks.jp/) のHTMLを通常のTLS検証付きで確認。

CLAUDE/ClaudeCode の削除禁止・秘密情報保護・ブランチ/PR・TDD・日本語文字列分離・ネイティブダイアログ禁止、WFのCore/I/O分離、TEST-HARNESS-SAFETYとtest-commandsの検証方針を採用。QC10/CC/OWASP10は下表で項目別評価する。AI_POLICYは役割分担の参考に限定。モデル強制、権限拡張、全面自動マージ、追加MCP導入、Rails/GraphQL構成への変更は個別リポジトリの指示と今回の明示境界に反するため採用しない。

共通リンク・ラベル・連絡先は参照実装に合わせる。参照デモの「サーバー再起動による消去」はD1を使う本製品には不正確なので、既存の毎日JST03:00消去を維持。参照デモにないGA/Cookie説明は現在の停止状態を正確に記載した。

## GA4: 有効化は未完了・ブロック中

既存ID `G-C04W1XKS16` と公式 `gtag('js', new Date())` / `gtag('config', ID, …)` の形式を準備した。しかし公開タグの現設定には履歴・フォーム・検索等の拡張計測と自動ユーザーデータ収集能力がある。設定能力の存在は個人情報の実送信や利用規約同意の証明ではない。

独立セキュリティレビューでは、取得済みの実SDKをChromiumに読み込み、外部要求をすべて捕捉・中止した。有効化フラグをテストで強制した場合、架空の検索語が `search_term` に入り、履歴イベントに生のクエリURLが入ることを確認した。固定のpage_location/page_referrerだけでは防げない。Googleにも実運用APIにもQAデータを送っていない。

`streamPrivacyVerified:false` を固定し、本番と同じoriginでローカルビルドを動かすブラウザテストでもタグ要求・GA Cookieがゼロであることを確認した。したがってこれは**共通UIの実装と停止状態のGA4アダプタ準備**であり、GA4導入完了ではない。Issue #6は閉じない。

有効化前の解除条件:
1. 共有ストリームの拡張計測（履歴・フォーム・検索・ダウンロード・外部リンクを含む）と自動ユーザーデータ収集能力が無効である証拠を確認する。リンク先タグ・クロスドメイン設定も確認。共有リソースの変更には別途権限が必要で、今回は変更していない。
2. 現行SDKで直接URL、クエリ、hash、Back/Forward、入力・送信・コピー/ダウンロードを試し、案件ID・アプリセッションID・入力文がどのペイロードにも含まれないことを捕捉検証する。
3. 実際の収集項目と地域に応じたCookie/同意説明を確認し、同意・停止動作と広告利用の拒否を検証する。法務審査済みとは扱わない。
4. 上記証拠を追加したレビュー付きコミットでのみフラグを変更する。停止中の説明も同時に点検する。

準備した保護: 正確な本番origin以外は動作しない、同意前はタグを読み込まない、固定URL/titleと空referrer、広告同意拒否・signals無効、再読込で同意をリセット、停止時にGAのhost-only Cookieを失効。過去送信の取り消しは保証しない。DIでフラグを有効にしたキューテストは実ストリームの安全性の証明ではない。

技術上の根拠: [設定項目](https://developers.google.com/analytics/devguides/collection/ga4/reference/config)、[pageviewと履歴計測](https://developers.google.com/analytics/devguides/collection/ga4/views)、[拡張計測](https://support.google.com/analytics/answer/9216061?hl=en)、[ユーザー提供データの設定](https://support.google.com/analytics/answer/14078702?hl=en)。`send_page_view:false` は拡張履歴イベントを止めないため、未知のオプションを追加して解決済みとはしていない。

## 再現・回帰・独立レビュー

- Red: 法務routeとAPI失敗時の共通リンク/法務表示の新規2テストが実装前に失敗。
- 共通UI/GAアダプタの6テストを追加。既存91件を含め97件成功。runtime2件も成功。
- `npm run check`: 境界チェック、全型検査、97件、Vite/Worker dry-runビルド、runtime2件成功。dry-runはデプロイではない。
- `npm run test:browser`: Chromiumで7画面・保存・負の登録者増減・未選択企画型・未保存台本/Backの従来回帰に加え、法務ページ往復と台本保持、1280/390/320pxの法務画面、横溢れ/固定CTAと末尾の重なり、キーボード遷移、本番originを模したローカル配信で第三者要求なしを確認。
- 独立通常レビュー: 初回bootstrap中のRetryによる二重取得/下書き消失リスクを指摘。in-flightガードと法務往復の回帰テストで修正。再レビューで残るブロッキング指摘なし。
- 独立セキュリティレビュー: gtagキューの配列をSDKが処理しない潜在不具合を指摘。公式のArguments形式へ修正し実SDKで確認。現在の停止経路に残るブロッキング指摘なし。有効化は上記の理由で不可。
- 独立共通規則レビュー: 共通要素と参照整合に重大不備なし。Cookieを「セッション識別用」と正確に修正。GA未完了とQC未検証項目の明示を要求。

## QC10 / CC / OWASP10 の評価

| 項目 | 結果・限界 |
| --- | --- |
| QC01 構文 | W3C NuへのHTML送信: messages空。W3C CSS validator: errors0/warnings0。CSSの最初のPOSTはHTTP500、通常TLSのGET再試行で成功。ビルド/型検査も成功。動的全画面のW3C検証ではない。 |
| QC02 metadata | 日本語title維持、説明meta追加。OGP/social cardは別承認待ちで未追加。既存faviconなし/robots.txtのSPAフォールバックはLighthouseで指摘、未解決の品質差分として残す。 |
| QC03 性能 | ローカルのproduction build法務画面をLighthouseでmobile/desktop計測。数値はcommon-shell-validation.json参照。公開PageSpeed Insights/実利用者データではなく、全7画面の性能保証ではない。 |
| QC04 レスポンシブ | Chromium 1280/390/320px、溢れ/固定CTA/末尾確認成功。iOS Safari/Firefoxと全OSの確認は未実施。 |
| QC05 構造化データ | 現在JSON-LD/microdataなし。新たにOrganization等のスキーマは加えていないためその妥当性テストはできない。SEO追加範囲の判断として残し、適合済みとは扱わない。 |
| QC06 HTTPS | 本番URLと参照URLが検証付きTLSでHTTP200。追加リンクはHTTPS、第三者資産は停止中。今回の変更は未デプロイなので公開版の新UI確認ではない。 |
| QC07 アクセシビリティ | landmark/見出し、キーボード法務往復、フォーカス表示、amber/CTA配色とmobile画面を確認。Lighthouseの法務画面自動評価を実施。実スクリーンリーダー、全画面WCAG、拡大表示の網羅評価は未実施。 |
| QC08/CC04/CC08 Cookie | 現在の計測停止を明記、機能用Cookieを説明。停止中の第三者通信ゼロを検証。計測開始時の同意適用/法的妥当性/実収集項目は解除条件に残す。 |
| QC09/OWASP A06 依存 | npm audit:既知脆弱性0。npm outdated:空（確認時点）。依存ファイル変更なし。将来の脆弱性不存在を保証しない。 |
| QC10 エラー | API503でも法務表示、リトライ重複防止を回帰検証。既存unknown hash→home仕様維持。公開ホスティングの全404/500の適切性は未網羅、robots.txt fallback指摘は残存。 |
| CC01/02 権利 | 同一運営者の参照コード/表記に基づく。新規画像・外部フォント・アイコン資産なし。第三者権利の法務審査ではない。 |
| CC03/06/07/09/10 | 体験用規約、連絡先、成果物/Jev/業種別注意と免責を明示。個人担当者名を追加せず、参照の事業用連絡先を使用。法務レビュー済みとは表示しない。 |
| CC05 特商法 | 販売・決済・契約申込機能を追加していない。特商法の販売条件表示を新設する取引機能はない。事業全体への法律適用を判定したものではない。 |
| OWASP A01/A03 | Core/DB/API境界に変更なし。セッション隔離を既存回帰で維持。textContent/createElementで表示、動的HTML注入なし。 |
| OWASP A02/A04/A05/A08–10 | 秘密情報・認証・権限・CF設定変更なし。外部リンクnoopener、GAはfail closed。外部SDKの収集がプライバシー条件を満たす検証は未完了。共有設定の変更は未承認のため上記条件で停止。 |
| OWASP A07 | 認証機能追加なし。既存セッション分離を維持。認証基盤を追加して安全性を主張する変更ではない。 |

スクリーンショットはCIのbrowser artifactへ保存する。未追跡のローカル画像・node_modulesはコミットに含めない。
