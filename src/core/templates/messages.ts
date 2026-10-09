import type { BlockKind, DelayStatus, MetricKey } from '../types.ts';
export const MESSAGES = {
  invalidChoice: '選択肢が正しくありません。', invalidText: '文字列を入力してください。',
  memoLength: '企画メモは空白以外の2〜500文字で入力してください。', targetLength: 'ターゲット像は200文字以内で入力してください。',
  invalidDate: '日付を実在する日付（YYYY-MM-DD）で入力してください。', dateRange: '日付の計算結果が対応範囲を超えました。',
  integerDays: '営業日数は整数で指定してください。', invalidSeconds: '目標尺は1〜1800秒の整数で入力してください。',
  invalidMetrics: '登録者増減は正・ゼロ・負の整数、再生数・問い合わせ等は0以上の整数、維持率は0〜100の数値で入力してください。',
  invalidStructure: '成果物のデータ形式が正しくありません。', incompatibleOutline: '企画と台本構成の企画型が一致していません。',
  quota: '本日の自動分類は終了しました。企画型を手動で選択してください。', classificationFailed: '自動分類に失敗しました。企画型を手動で選択してください。',
  nonRecommended: '選択した企画型はこの業種・目的では非推奨です。理由：', titleTooLong: '短縮後も40文字を超えるタイトルがあります。掲載前に調整してください。',
  tinyOutline: '短い尺のため0秒のブロックがあります。撮影・編集時に内容を本論へまとめてください。',
  shootAfterPublish: '撮影日は投稿日以前の日付にしてください。', compressed: '撮影後の工程が標準所要営業日を満たさないため、圧縮しています。制作体制を確認してください。',
  insufficient: '日程不足です。最短投稿日を確認し、日程を見直してください。', shootNeedsReschedule: '固定した撮影日までに準備期間を確保できません。最短撮影日以降へ撮影日の見直しが必要です。',
  calendarNote: '営業日は土日を除きます。祝日は考慮していません。投稿・指定撮影日は土日も指定できます。',
  negativePrevious: '前月が負のため変化率は算出しません。差分で比較してください。', noPreviousResults: '前月実績なし', noPreviousInput: '前月未入力', rateUnavailable: '変化率が計算範囲を超えたため表示できません。', pointDifference: '視聴維持率の差分はパーセントポイント、変化率は前月値を基準にした割合です。',
  reportNotice: '施策候補は入力値の変化に基づくルールの提案です。原因や効果を断定するものではありません。', noPreviousMeasures: '前月未入力のため前月比と変化に基づく施策候補は表示していません。',
  briefSuffix: 'の編集指示書', briefNotice: 'テンプレートによる編集指示です。表現・権利・事実関係を確認してください。法務レビュー済みではありません。',
  cautionPrefix: '業種別表現注意：', captionSeparator: '／',
};
export const DELAY_LABELS: Record<DelayStatus, string> = { none: '遅延なし', warning: '要注意', delayed: '遅延' };
export const METRIC_LABELS: Record<MetricKey, string> = { views: '再生数', subsDelta: '登録者増減', retention: '視聴維持率', conversions: '問い合わせ・応募数' };
export const EDIT_POLICIES: Record<BlockKind, { captions: string; bgm: string; cuts: string }> = {
  hook: { captions: '結論と対象者を短いテロップで示す。誇張表現は避ける。', bgm: '声が明瞭に聞こえる音量で短く導入する。', cuts: '最初の発話へ速やかに入り、結論に寄りカットを合わせる。' },
  problem: { captions: '疑問・課題と前提条件を読みやすく整理する。', bgm: '説明を妨げない控えめな音量にする。', cuts: '問題を示す資料と話者を切り替え、前提を省略しない。' },
  main: { captions: '要点を一度にひとつ表示し、数値・固有の主張には出典や条件を添える。', bgm: '音量と曲調を安定させ、説明に集中できるようにする。', cuts: '意味のまとまりごとに切り、手順・図解の寄りを補う。' },
  example: { captions: '事例の条件・期間・個別性を明示し、結果の保証に見える編集を避ける。', bgm: '結果を過度に強調する効果音を避ける。', cuts: '比較条件が同じことを確認し、経過と結果を順番に見せる。' },
  summary: { captions: '主要な要点と適用条件を短く再掲する。', bgm: 'まとめを聞き取りやすい控えめな音量にする。', cuts: '要点ごとに切り替え、必要以上に同じ内容を繰り返さない。' },
  cta: { captions: '相談・応募・詳細情報の案内先と次の行動をひとつずつ示す。', bgm: '案内の最後まで声が聞こえる音量を保つ。', cuts: '案内先を読む時間を確保し、終了画面の余白を空ける。' },
};
