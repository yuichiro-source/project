// MOCK_ANALYSIS=1 のときに使うダミー分析（API キーなしで画面確認する用）
export function mockAnalyze({ transcript, issues, questionCats }) {
  const reuse = issues[0];
  return {
    score: 6,
    review: '説明は分かりやすく関係づくりもできていたが、予算と決裁フローの確認が不足し、次回アクションも曖昧なまま終了した。',
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
    supervisor_questions: [
      {
        question: 'ちなみに今回のご予算はどのくらいを想定されていますか？',
        why: '予算レンジが分かり、提案の規模感を合わせられた。担当者がオリエン冒頭で聞くべきだった',
        q_key: questionCats[0]?.key || 'budget_range',
        q_label: questionCats[0]?.label || '予算感の確認',
      },
      {
        question: '最終的なご判断はどなたがされますか？',
        why: '決裁者と承認フローが明確になった',
        q_key: 'decision_maker',
        q_label: '決裁者の確認',
      },
    ],
  };
}
