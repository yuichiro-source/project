const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = { meetings: [], issues: [], selected: null, open: new Set(), questions: [] };

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `エラー (${res.status})`);
  return data;
}

const scoreClass = (n) => (n >= 8 ? 's-hi' : n <= 4 ? 's-lo' : '');
const shortDate = (d) => d.slice(5).replace('-', '/');
// 案件 = クライアント名 + 案件名
const groupKey = (m) => JSON.stringify([m.client, m.title || '']);

async function refresh() {
  const data = await api('/api/meetings');
  state.meetings = data.meetings;
  state.issues = data.issues;
  renderKpis();
  renderList();
  renderIssues();
  $('#clients').innerHTML = [...new Set(state.meetings.map((m) => m.client))].map((c) => `<option value="${esc(c)}">`).join('');
  $('#titles').innerHTML = [...new Set(state.meetings.map((m) => m.title).filter(Boolean))].map((t) => `<option value="${esc(t)}">`).join('');
}

function renderKpis() {
  const ms = state.meetings;
  const avg = (arr) => (arr.length ? (arr.reduce((s, m) => s + m.score, 0) / arr.length).toFixed(1) : '-');
  const repeats = state.issues.filter((i) => i.count >= 2).length;
  $('#kpis').innerHTML = `
    <span>件数<b>${ms.length}</b></span>
    <span>平均<b>${avg(ms)}</b></span>
    <span>直近5件<b>${avg(ms.slice(0, 5))}</b></span>
    <span>繰り返しミス<b class="${repeats ? 'warn' : ''}">${repeats}</b></span>`;
}

function renderList() {
  // 案件ごとにまとめる（一覧は新しい順なので、最初に出た MTG が案件の最新）
  const groups = new Map();
  for (const m of state.meetings) {
    const k = groupKey(m);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }

  let html = '';
  for (const [k, ms] of groups) {
    const open = state.open.has(k);
    const latest = ms[0];
    const alerts = ms.reduce((s, m) => s + (m.alerts?.length || 0), 0);
    const avg = (ms.reduce((s, m) => s + m.score, 0) / ms.length).toFixed(1);
    html += `
      <tr class="grp ${open ? 'open' : ''}" data-group="${esc(k)}">
        <td class="cli"><span class="caret">▸</span>${esc(latest.client)}${latest.title ? ` <span class="muted">/ ${esc(latest.title)}</span>` : ''}</td>
        <td class="muted">${ms.length}件 ・ ${shortDate(latest.date)}</td>
        <td class="num score ${scoreClass(Number(avg))}">${ms.length > 1 ? avg : latest.score}</td>
        <td>${alerts ? `<span class="warn" title="同じミスあり">⚠${alerts}</span>` : ''}</td>
      </tr>`;
    if (open) {
      html += ms.map((m) => `
        <tr class="child ${state.selected === m.id ? 'sel' : ''}" data-id="${m.id}">
          <td class="indent">${shortDate(m.date)}</td>
          <td><span class="badge">${esc(m.type)}</span></td>
          <td class="num score ${scoreClass(m.score)}">${m.score}</td>
          <td>${m.alerts?.length ? `<span class="warn">⚠${m.alerts.length}</span>` : ''}</td>
        </tr>`).join('');
    }
  }
  $('#rows').innerHTML = html;
  $('#empty').classList.toggle('hidden', state.meetings.length > 0);
}

function renderIssues() {
  const top = state.issues.slice(0, 8);
  $('#issuesCard').classList.toggle('hidden', !top.length);
  $('#issues').innerHTML = top.map((i) => `<li class="${i.count >= 2 ? 'rep' : ''}"><span>${esc(i.label)}</span><span>${i.count}回</span></li>`).join('');
}

async function showDetail(id) {
  state.selected = id;
  const m = await api(`/api/meetings/${id}`);
  state.open.add(groupKey(m));
  renderList();

  const repeated = new Set((m.alerts || []).map((a) => a.issue_key));
  const issueCount = Object.fromEntries(state.issues.map((i) => [i.key, i.count]));
  const qCount = Object.fromEntries(state.questions.map((q) => [q.key, q.count]));
  const sq = m.supervisor_questions || [];
  const review = m.review || m.score_reason || '';

  $('#detail').innerHTML = `
    <div class="d-top">
      <div class="meta">
        <div class="ttl">${esc(m.client)}${m.title ? ` <span class="muted">/ ${esc(m.title)}</span>` : ''}</div>
        <div class="muted"><span class="badge">${esc(m.type)}</span> ${esc(m.date)}${m.source?.kind === 'gdoc' ? ` ・ <a href="${esc(m.source.url)}" target="_blank" rel="noopener">元ドキュメント</a>` : ''}</div>
        <p class="summary">${esc(m.summary)}</p>
      </div>
      <div class="review">
        <div class="big ${scoreClass(m.score)}">${m.score}<small>/10</small></div>
        <div><b>総評</b>${esc(review)}</div>
      </div>
    </div>
    ${(m.alerts || []).length ? `<div class="alert"><b>⚠ 同じミスを繰り返しています</b><ul>${m.alerts.map((a) => `
      <li>${esc(a.issue_label)}（${a.times}回目）<span class="muted"> 前回: ${a.previous.map((p) => `${esc(p.date)} ${esc(p.client)}/${esc(p.type)}`).join('、')}</span></li>`).join('')}</ul></div>` : ''}
    <div class="cols">
      <div>
        <h3 class="g">良かった点（${m.good_points.length}）</h3>
        <ul>${m.good_points.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
      </div>
      <div>
        <h3 class="b">改善点（${m.improvements.length}）</h3>
        <ul>${m.improvements.map((i) => `
          <li>${esc(i.text)}
            <span class="tag ${repeated.has(i.issue_key) ? 'rep' : ''}">${esc(i.issue_label)}${(issueCount[i.issue_key] || 0) >= 2 ? ` ×${issueCount[i.issue_key]}` : ''}</span>
            <span class="adv">${esc(i.advice)}</span></li>`).join('')}</ul>
      </div>
    </div>
    <div class="sq">
      <h3 class="q">上長のサポート質問（${sq.length}）</h3>
      ${sq.length ? `<ul>${sq.map((q) => `
        <li>「${esc(q.question)}」
          <span class="tag">${esc(q.q_label)}${(qCount[q.q_key] || 0) >= 2 ? ` ×${qCount[q.q_key]}` : ''}</span>
          <span class="adv">${esc(q.why)}</span></li>`).join('')}</ul>` : '<p class="muted">上長の質問はありませんでした。</p>'}
    </div>
    <details><summary class="muted">文字起こし（${m.transcript.length.toLocaleString()}文字）</summary><pre>${esc(m.transcript)}</pre></details>
    <div class="actions">
      <button class="ghost" id="copyBtn">テキストでコピー</button>
      <button class="ghost" id="delBtn">削除</button>
    </div>`;

  $('#copyBtn').onclick = () => {
    const md = [
      `【${m.client}${m.title ? ` / ${m.title}` : ''} / ${m.type}】${m.date}  ${m.score}/10`,
      `総評: ${review}`, '',
      '■良かった点', ...m.good_points.map((g) => `・${g}`), '',
      '■改善点', ...m.improvements.map((i) => `・${i.text}\n  → ${i.advice}`),
      ...(sq.length ? ['', '■上長のサポート質問', ...sq.map((q) => `・「${q.question}」\n  → ${q.why}`)] : []),
      ...(m.alerts?.length ? ['', '■繰り返しミス', ...m.alerts.map((a) => `・${a.issue_label}（${a.times}回目）`)] : []),
    ].join('\n');
    navigator.clipboard.writeText(md).then(() => { $('#copyBtn').textContent = 'コピーしました'; });
  };
  $('#delBtn').onclick = async () => {
    if (!confirm('このMTGを削除しますか？')) return;
    await api(`/api/meetings/${m.id}`, { method: 'DELETE' });
    state.selected = null;
    $('#detail').innerHTML = '<p class="muted">削除しました。</p>';
    await Promise.all([refresh(), loadQuestions()]);
  };
}

// ---- 集計タブ（よく出る質問 / 指摘・アドバイス） ----
const PAGES = {
  questions: { api: '/api/questions', radio: 'qType', quote: true, empty: 'まだ上長の質問が記録されていません。' },
  advice: { api: '/api/issues', radio: 'aType', quote: false, empty: 'まだ指摘が記録されていません。' },
};

async function loadPage(name) {
  const cats = (await api(PAGES[name].api)).categories;
  if (name === 'questions') state.questions = cats;
  state[`${name}Cats`] = cats;
  renderPage(name);
}
const loadQuestions = () => loadPage('questions');

function renderPage(name) {
  const page = PAGES[name];
  const t = document.querySelector(`input[name=${page.radio}]:checked`).value;
  const cats = (state[`${name}Cats`] || [])
    .map((c) => {
      const items = t ? c.items.filter((i) => i.type === t) : c.items;
      return { ...c, items, count: new Set(items.map((i) => i.meetingId)).size };
    })
    .filter((c) => c.items.length)
    .sort((a, b) => b.count - a.count || b.items.length - a.items.length);

  $(`#view-${name} .agg-list`).innerHTML = cats.length ? cats.map((c, idx) => `
    <details class="qcat" ${idx < 3 ? 'open' : ''}>
      <summary>
        <span class="rank">${idx + 1}</span>
        <span class="qlabel">${esc(c.label)}</span>
        <span class="types">${c.types.map((ty) => `<span class="badge">${esc(ty)}</span>`).join('')}</span>
        <span class="cnt ${c.count >= 2 ? 'warn' : ''}">${c.count}回</span>
      </summary>
      <ul>${c.items.map((i) => `
        <li><a href="#meetings" data-open="${i.meetingId}">${page.quote ? `「${esc(i.text)}」` : esc(i.text)}</a>
          <span class="muted"> ${shortDate(i.date)} ${esc(i.client)}${i.title ? `/${esc(i.title)}` : ''}・${esc(i.type)}</span>
          <span class="adv">${esc(i.note)}</span></li>`).join('')}</ul>
    </details>`).join('') : `<p class="muted">${page.empty}</p>`;
}

// ---- タブ切り替え ----
function route() {
  const tab = location.hash.slice(1) in PAGES ? location.hash.slice(1) : 'meetings';
  for (const v of ['meetings', ...Object.keys(PAGES)]) $(`#view-${v}`).classList.toggle('hidden', tab !== v);
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  if (PAGES[tab]) loadPage(tab).catch((err) => alert(err.message));
}
window.addEventListener('hashchange', route);

// ---- イベント ----
function setMsg(text, err = false) {
  $('#formMsg').textContent = text;
  $('#formMsg').classList.toggle('err', err);
}

$('#srcSeg').addEventListener('change', (e) => {
  const gdoc = e.target.value === 'gdoc';
  $('#text').classList.toggle('hidden', gdoc);
  $('#docUrl').classList.toggle('hidden', !gdoc);
});

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const gdoc = fd.get('src') === 'gdoc';
  const body = {
    client: fd.get('client'), type: fd.get('type'), title: fd.get('title'), date: fd.get('date'),
    text: gdoc ? '' : fd.get('text'), docUrl: gdoc ? fd.get('docUrl') : '',
  };
  if (!body.text.trim() && !body.docUrl.trim()) return setMsg('文字起こしかURLを入力してください', true);

  $('#submitBtn').disabled = true;
  setMsg('分析中…（1〜2分かかります）');
  try {
    const m = await api('/api/meetings', { method: 'POST', body: JSON.stringify(body) });
    setMsg(m.alerts.length ? `⚠ 同じミスが${m.alerts.length}件あります` : '分析完了', m.alerts.length > 0);
    $('#text').value = ''; $('#docUrl').value = '';
    await Promise.all([refresh(), loadQuestions()]);
    showDetail(m.id);
  } catch (err) {
    setMsg(err.message, true);
  } finally {
    $('#submitBtn').disabled = false;
  }
});

$('#rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  if (tr.dataset.group !== undefined) {
    const k = tr.dataset.group;
    state.open.has(k) ? state.open.delete(k) : state.open.add(k);
    renderList();
  } else if (tr.dataset.id) {
    showDetail(tr.dataset.id);
  }
});

for (const name of Object.keys(PAGES)) {
  $(`#view-${name} .type-filter`).addEventListener('change', () => renderPage(name));
  $(`#view-${name} .agg-list`).addEventListener('click', (e) => {
    const a = e.target.closest('a[data-open]');
    if (a) showDetail(a.dataset.open);
  });
}

$('#date').value = new Date().toLocaleDateString('sv');

route();
Promise.all([refresh(), loadQuestions()]).catch((err) => setMsg(err.message, true));
