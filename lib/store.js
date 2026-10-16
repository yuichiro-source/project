// JSON ファイルによるシンプルな永続化
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'meetings.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { meetings: [], issues: {} };
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

export function addMeeting(meeting) {
  const db = load();
  for (const imp of meeting.improvements) {
    if (!db.issues[imp.issue_key]) db.issues[imp.issue_key] = { label: imp.issue_label };
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
  save(db);
  return db.meetings.length !== before;
}
