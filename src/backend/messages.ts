export const HTTP_MESSAGES = {
  invalidInput: '入力形式が正しくありません。',
  jsonRequired: 'JSON 形式で送信してください。',
  crossSite: '別のサイトからの送信は受け付けません。',
  tooLarge: '入力が大きすぎます。',
  invalidJson: 'JSON の形式が正しくありません。',
  invalidMonth: '対象月の形式が正しくありません。',
  noApi: '対象の API はありません。',
  databaseUnavailable: 'データベースを利用できません。',
  noMetric: '対象月の数値を先に保存してください。',
  channelRequired: 'チャンネル設計を先に保存してください。',
  allBlocks: 'すべての台本ブロックを送信してください。',
  invalidBlocks: '台本ブロックが一致しません。',
  productionRequired: '台本とスケジュールを先に作成してください。',
  internalError: '処理に失敗しました。入力を確認してから、もう一度お試しください。',
  notFound: '対象の案件または成果物が見つかりません。',
};
export const FIELD_LABELS = {
  month: '対象月', clientAlias: 'クライアント呼称', industry: '業種', goal: '目的', target: 'ターゲット像', memo: '企画メモ', ideaType: '企画型', seconds: '目標尺', seq: 'ブロック順', talkingPoints: '話すことの要点', shootMemo: '撮影メモ', shootDate: '撮影日', publishDate: '投稿日', taskStatus: '工程状態', views: '再生数', subsDelta: '登録者増減', retention: '視聴維持率', conversions: '問い合わせ・応募数',
};
export function requiredMessage(name: string): string { return `${name}を入力してください。`; }
export function textLengthMessage(name: string, min: number, max: number): string { return `${name}は${min}〜${max}字で入力してください。`; }
export function numberMessage(name: string): string { return `${name}の数値が正しくありません。`; }
export function choiceMessage(name: string): string { return `${name}を選択してください。`; }
export const JEV_MESSAGES = {
  choice: '企画メモ memo に最も適する YouTube 企画型を1つ選んでください。',
  caution: '企画メモ memo が次の業種別表現注意に抵触する可能性はありますか。',
  separator: '／', yes: '注意表現に該当する可能性があります', no: '注意表現に該当しません',
};
