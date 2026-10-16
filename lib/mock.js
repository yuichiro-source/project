// MOCK_ANALYSIS=1 のときに使うダミー分析（API キーなしで画面確認する用）
export function mockAnalyze({ transcript, issues }) {
  const reuse = issues[0];
  return {
    score: 6,
    score_reason: '要点は押さえているが、予算と決裁フローの確認が不足。',
    sub_scores: { hearing: 5, proposal: 7, facilitation: 6, closing: 5 },
    summary: `ダミー分析です（${transcript.length}文字）。MOCK_ANALYSIS を外すと Claude で分析します。`,
    good_points: ['冒頭でアジェンダを共有できていた', '相手の発言を要約して確認していた', '事例を交えて説明していた'],
    improvements: [
      {
        text: '予算感を確認しないまま提案の話に進んだ',
        advice: 'オリエン時点で予算レンジと決裁者を必ず確認する',
        issue_key: reuse?.key || 'budget_hearing_missing',
        issue_label: reuse?.label || '予算のヒアリング漏れ',
      },
      {
        text: '次回MTGの日程が決まらないまま終了した',
        advice: '終了5分前にネクストアクションと日程をその場で確定する',
        issue_key: 'next_action_undecided',
        issue_label: '次回アクションの未確定',
      },
    ],
  };
}
