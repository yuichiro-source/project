// JSON ファイルによるシンプルな永続化
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'meetings.json');

function load() {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    db.questionCats ||= {};
    for (const m of db.meetings) {
      m.supervisor_questions ||= [];
      m.supervisor_feedback ||= [];
    }
    return db;
  } catch {
    return { meetings: [], issues: {}, questionCats: {} };
  }
}

function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

export function listMeetings() {
  return load().meetings.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function getMeeting(id) {
  return load().meetings.find((m) => m.id === id);
}

// これまでに記録された改善点カテゴリ（同じミスの判定に使う）
export function listIssues() {
  const db = load();
  return Object.entries(db.issues).map(([key, v]) => ({
    key,
    label: v.label,
    count: db.meetings.filter((m) => feedbackOf(m).some((i) => i.issue_key === key)).length,
  }));
}

// AI の改善点と上長の指摘は同じカテゴリ体系を共有する
const feedbackOf = (m) => [...m.improvements, ...m.supervisor_feedback];

// 上長の質問カテゴリ（よく出る質問の集計に使う）
export function listQuestionCats() {
  const db = load();
  return Object.entries(db.questionCats).map(([key, v]) => ({
    key,
    label: v.label,
    count: db.meetings.filter((m) => m.supervisor_questions.some((q) => q.q_key === key)).length,
  }));
}

// カテゴリごとに項目と出現した MTG をまとめる（よく出る質問・指摘の集計）
function summarize(db, pick) {
  const map = new Map();
  for (const m of db.meetings) {
    for (const { key, label, text, note } of pick(m)) {
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key).items.push({ text, note, meetingId: m.id, client: m.client, title: m.title, type: m.type, date: m.date });
    }
  }
  return [...map.values()]
    .map((c) => ({
      ...c,
      count: new Set(c.items.map((i) => i.meetingId)).size,
      types: [...new Set(c.items.map((i) => i.type))],
      items: c.items.sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => b.count - a.count || b.items.length - a.items.length);
}

export function questionSummary() {
  const db = load();
  return summarize(db, (m) => m.supervisor_questions.map((q) => ({
    key: q.q_key, label: db.questionCats[q.q_key]?.label || q.q_label, text: q.question, note: q.why,
  })));
}

// 指摘・アドバイス: AI 分析と上長の指摘を別々に集計
export function issueSummary() {
  const db = load();
  const pick = (field) => (m) => m[field].map((i) => ({
    key: i.issue_key, label: db.issues[i.issue_key]?.label || i.issue_label, text: i.text, note: i.advice,
  }));
  return { supervisor: summarize(db, pick('supervisor_feedback')), ai: summarize(db, pick('improvements')) };
}

export function addMeeting(meeting) {
  const db = load();
  for (const imp of feedbackOf(meeting)) {
    if (!db.issues[imp.issue_key]) db.issues[imp.issue_key] = { label: imp.issue_label };
  }
  for (const q of meeting.supervisor_questions) {
    if (!db.questionCats[q.q_key]) db.questionCats[q.q_key] = { label: q.q_label };
  }
  db.meetings.push(meeting);
  save(db);
  return meeting;
}

export function deleteMeeting(id) {
  const db = load();
  const before = db.meetings.length;
  db.meetings = db.meetings.filter((m) => m.id !== id);
  // どの MTG からも参照されなくなったカテゴリは削除
  const used = new Set(db.meetings.flatMap((m) => feedbackOf(m).map((i) => i.issue_key)));
  for (const key of Object.keys(db.issues)) if (!used.has(key)) delete db.issues[key];
  const usedQ = new Set(db.meetings.flatMap((m) => m.supervisor_questions.map((q) => q.q_key)));
  for (const key of Object.keys(db.questionCats)) if (!usedQ.has(key)) delete db.questionCats[key];
  save(db);
  return db.meetings.length !== before;
}
