import express from 'express';
import crypto from 'node:crypto';
import { analyzeTranscript } from './lib/analyze.js';
import { mockAnalyze } from './lib/mock.js';
import { fetchGoogleDocText } from './lib/gdoc.js';
import * as store from './lib/store.js';

const TYPES = ['オリエン', '中間', 'プレゼン', 'その他'];
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static('public'));

app.get('/api/meetings', (req, res) => {
  const meetings = store.listMeetings().map(({ transcript, ...m }) => m);
  res.json({ meetings, issues: store.listIssues().sort((a, b) => b.count - a.count) });
});

app.get('/api/questions', (req, res) => {
  res.json({ categories: store.questionSummary(), meetingCount: store.listMeetings().length });
});

app.get('/api/issues', (req, res) => {
  res.json(store.issueSummary());
});

app.get('/api/meetings/:id', (req, res) => {
  const m = store.getMeeting(req.params.id);
  m ? res.json(m) : res.status(404).json({ error: '見つかりません' });
});

app.delete('/api/meetings/:id', (req, res) => {
  store.deleteMeeting(req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: '見つかりません' });
});

app.post('/api/meetings', async (req, res) => {
  try {
    const { client, type, title = '', date, text = '', docUrl = '' } = req.body || {};
    if (!client?.trim()) return res.status(400).json({ error: 'クライアント名を入力してください' });
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'MTG種別を選択してください' });

    const transcript = docUrl.trim() ? await fetchGoogleDocText(docUrl.trim()) : text.trim();
    if (transcript.length < 50) return res.status(400).json({ error: '文字起こしが短すぎます' });

    const issues = store.listIssues();
    const questionCats = store.listQuestionCats();
    const input = { client: client.trim(), type, title: title.trim(), transcript, issues, questionCats };
    const result = process.env.MOCK_ANALYSIS ? mockAnalyze(input) : await analyzeTranscript(input);

    // 同じミスの検出: 過去の MTG（AI の改善点・上長の指摘）に同じ issue_key があればアラート
    const past = store.listMeetings();
    const alerts = [];
    const hasKey = (m, key) => [...m.improvements, ...m.supervisor_feedback].some((i) => i.issue_key === key);
    for (const imp of [...result.improvements, ...result.supervisor_feedback]) {
      const hits = past.filter((m) => hasKey(m, imp.issue_key));
      if (hits.length && !alerts.some((a) => a.issue_key === imp.issue_key)) {
        alerts.push({
          issue_key: imp.issue_key,
          issue_label: store.listIssues().find((i) => i.key === imp.issue_key)?.label || imp.issue_label,
          times: hits.length + 1,
          previous: hits.slice(0, 5).map((m) => ({ id: m.id, client: m.client, type: m.type, date: m.date })),
        });
      }
    }

    const meeting = store.addMeeting({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      date: date || new Date().toISOString().slice(0, 10),
      client: input.client,
      type,
      title: input.title,
      source: docUrl.trim() ? { kind: 'gdoc', url: docUrl.trim() } : { kind: 'text' },
      transcript,
      ...result,
      alerts,
    });
    res.json(meeting);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || '分析に失敗しました' });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`MTG分析: http://localhost:${port}`));
