// JSON ファイルによるシンプルな永続化
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'meetings.json');

function load() {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    db.questionCats ||= {};
    for (const m of db.meetings) m.supervisor_questions ||= [];
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
    count: db.meetings.filter((m) => m.improvements.some((i) => i.issue_key === key)).length,
  }));
}

// 上長の質問カテゴリ（よく出る質問の集計に使う）
export function listQuestionCats() {
  const db = load();
  return Object.entries(db.questionCats).map(([key, v]) => ({
    key,
    label: v.label,
    count: db.meetings.filter((m) => m.supervisor_questions.some((q) => q.q_key === key)).length,
  }));
}

// よく出る質問: カテゴリごとに実際の質問と出現した MTG をまとめる
export function questionSummary() {
  const db = load();
  const map = new Map();
  for (const m of db.meetings) {
    for (const q of m.supervisor_questions) {
      if (!map.has(q.q_key)) map.set(q.q_key, { key: q.q_key, label: db.questionCats[q.q_key]?.label || q.q_label, items: [] });
      map.get(q.q_key).items.push({ question: q.question, why: q.why, meetingId: m.id, client: m.client, title: m.title, type: m.type, date: m.date });
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

export function addMeeting(meeting) {
  const db = load();
  for (const imp of meeting.improvements) {
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
  const used = new Set(db.meetings.flatMap((m) => m.improvements.map((i) => i.issue_key)));
  for (const key of Object.keys(db.issues)) if (!used.has(key)) delete db.issues[key];
  const usedQ = new Set(db.meetings.flatMap((m) => m.supervisor_questions.map((q) => q.q_key)));
  for (const key of Object.keys(db.questionCats)) if (!usedQ.has(key)) delete db.questionCats[key];
  save(db);
  return db.meetings.length !== before;
}
