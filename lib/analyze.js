// Claude による MTG 文字起こしの分析
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

const TYPE_FOCUS = {
  オリエン: '課題・目的・予算・スケジュール・決裁者などのヒアリングの深さ、前提条件の確認、次回までの宿題の明確化',
  中間: '進捗共有の分かりやすさ、方向性のすり合わせ、フィードバックの引き出し方、懸念点の早期解消',
  プレゼン: '提案の論理構成と説得力、相手の課題との接続、質疑応答の対応、クロージングと次のアクション合意',
  その他: '目的の明確さ、議事進行、合意事項と次のアクションの明確化',
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'review', 'summary', 'good_points', 'improvements', 'supervisor_questions'],
  properties: {
    score: { type: 'integer', description: '総合点 (0〜10)' },
    review: { type: 'string', description: '総評（採点理由を含む2〜3文）' },
    summary: { type: 'string', description: 'MTGの要約（2〜3文）' },
    good_points: {
      type: 'array',
      description: '良かった点（箇条書き、具体的に）',
      items: { type: 'string' },
    },
    improvements: {
      type: 'array',
      description: '改善点（箇条書き、具体的に）',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'advice', 'issue_key', 'issue_label'],
        properties: {
          text: { type: 'string', description: '何が問題だったか（発言の引用があれば含める）' },
          advice: { type: 'string', description: '次回どうすべきか' },
          issue_key: {
            type: 'string',
            description: 'ミスの種類を表す英小文字スネークケースのキー。既存カテゴリと同じ種類のミスなら必ず既存のキーを使う',
          },
          issue_label: { type: 'string', description: 'ミスの種類の短い日本語名（例: 予算のヒアリング漏れ）' },
        },
      },
    },
    supervisor_questions: {
      type: 'array',
      description: '上長がサポートとしてお客様に投げかけた質問（なければ空配列）',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'why', 'q_key', 'q_label'],
        properties: {
          question: { type: 'string', description: '上長の質問（文字起こしからの引用、または要旨）' },
          why: { type: 'string', description: 'この質問で何が引き出せたか／本来は担当者が聞くべきだった理由' },
          q_key: {
            type: 'string',
            description: '質問の種類を表す英小文字スネークケースのキー。既存の質問カテゴリと同じ種類なら必ず既存のキーを使う',
          },
          q_label: { type: 'string', description: '質問の種類の短い日本語名（例: 予算感の確認）' },
        },
      },
    },
  },
};

const SYSTEM = `あなたは広告・クリエイティブ業界の営業／ディレクター向けの商談コーチです。
お客様とのMTGの文字起こしを読み、自社側の担当者（自己分析をする本人）のふるまいを評価してください。

- 評価対象はあくまで自社側担当者。お客様の発言は評価材料として使う。
- 良い点・改善点はできるだけ多く、具体的な箇条書きで出す（目安：各5〜10個）。抽象的な一般論は避け、文字起こし中の具体的な場面に基づくこと。
- 採点は10点満点の整数。5点が「可もなく不可もなし」、8点以上は「明確に優れていた」場合のみ。甘くしない。
- 改善点には issue_key / issue_label でミスの種類を付ける。過去と同じ種類のミスなら既存カテゴリの issue_key をそのまま使う。新しい種類のときだけ新しいキーを作る。粒度は「予算のヒアリング漏れ」「次回アクションの未確定」程度。
- 上長（自社側の同席者）がお客様に投げかけた質問は supervisor_questions に漏れなく抜き出す。担当者へのフォローとして上長が聞いた質問が対象で、雑談や挨拶は除く。上長がいない・質問していない場合は空配列。q_key / q_label は issue_key と同じルールで、既存の質問カテゴリと同じ種類なら既存キーを使う。
- すべて日本語で出力する。`;

export async function analyzeTranscript({ client: clientName, type, title, selfName, bossName, transcript, issues, questionCats }) {
  const issueList = issues.length
    ? issues.map((i) => `- ${i.key}: ${i.label}（過去${i.count}回）`).join('\n')
    : '（まだありません）';
  const qList = questionCats.length
    ? questionCats.map((q) => `- ${q.key}: ${q.label}（過去${q.count}回）`).join('\n')
    : '（まだありません）';

  const userText = `## MTG情報
- クライアント名: ${clientName}
- MTG種別: ${type}${title ? `\n- 案件名: ${title}` : ''}
- 自社側担当者の話者名: ${selfName || '（不明。文脈から自社側を判断してください）'}
- 上長の話者名: ${bossName || '（不明。自社側の担当者以外の同席者がいれば上長とみなしてください）'}
- この種別で特に重視する観点: ${TYPE_FOCUS[type] || TYPE_FOCUS['その他']}

## 既存のミスカテゴリ（過去の改善点）
${issueList}

## 既存の質問カテゴリ（過去に上長がした質問）
${qList}

## 文字起こし
<transcript>
${transcript}
</transcript>`;

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: userText }],
  });
  const msg = await stream.finalMessage();

  if (msg.stop_reason === 'refusal') throw new Error('分析がモデルに拒否されました。内容を確認してください');
  if (msg.stop_reason === 'max_tokens') throw new Error('出力が長すぎて途中で切れました。文字起こしを分割してください');

  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const result = JSON.parse(text);

  const clamp = (n) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
  const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '') || 'other';
  result.score = clamp(result.score);
  for (const imp of result.improvements) imp.issue_key = normKey(imp.issue_key);
  for (const q of result.supervisor_questions) q.q_key = normKey(q.q_key);
  return result;
}
