const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SUB_LABELS = { hearing: 'ヒアリング', proposal: '提案・説明', facilitation: '進行', closing: '合意形成' };

let state = { meetings: [], issues: [], selected: null };

const storage = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `エラー (${res.status})`);
  return data;
}

function scoreClass(n) { return n >= 8 ? 's-hi' : n <= 4 ? 's-lo' : ''; }

async function refresh() {
  const data = await api('/api/meetings');
  state.meetings = data.meetings;
  state.issues = data.issues;
  renderKpis();
  renderList();
  renderIssues();
  $('#clients').innerHTML = [...new Set(state.meetings.map((m) => m.client))].map((c) => `<option value="${esc(c)}">`).join('');
}

function renderKpis() {
  const ms = state.meetings;
  const avg = (arr) => (arr.length ? (arr.reduce((s, m) => s + m.score, 0) / arr.length).toFixed(1) : '-');
  const recent = ms.slice(0, 5);
  const repeats = state.issues.filter((i) => i.count >= 2).length;
  $('#kpis').innerHTML = `
    <span>件数<b>${ms.length}</b></span>
    <span>平均<b>${avg(ms)}</b></span>
    <span>直近5件<b>${avg(recent)}</b></span>
    <span>繰り返しミス<b class="${repeats ? 'warn' : ''}">${repeats}</b></span>`;
}

function renderList() {
  const q = $('#q').value.trim().toLowerCase();
  const t = $('#fType').value;
  const rows = state.meetings.filter((m) => (!q || m.client.toLowerCase().includes(q)) && (!t || m.type === t));
  $('#rows').innerHTML = rows.map((m) => `
    <tr data-id="${m.id}" class="${state.selected === m.id ? 'sel' : ''}">
      <td>${esc(m.date.slice(5).replace('-', '/'))}</td>
      <td class="cli" title="${esc(m.title)}">${esc(m.client)}</td>
      <td><span class="badge">${esc(m.type)}</span></td>
      <td class="num score ${scoreClass(m.score)}">${m.score}</td>
      <td>${m.alerts?.length ? `<span class="warn" title="同じミスあり">⚠${m.alerts.length}</span>` : ''}</td>
    </tr>`).join('');
  $('#empty').classList.toggle('hidden', state.meetings.length > 0);
}

function renderIssues() {
  const top = state.issues.slice(0, 8);
  $('#issuesCard').classList.toggle('hidden', !top.length);
  $('#issues').innerHTML = top.map((i) => `<li class="${i.count >= 2 ? 'rep' : ''}"><span>${esc(i.label)}</span><span>${i.count}回</span></li>`).join('');
}

async function showDetail(id) {
  state.selected = id;
  renderList();
  const m = await api(`/api/meetings/${id}`);
  const repeated = new Set((m.alerts || []).map((a) => a.issue_key));
  const issueCount = Object.fromEntries(state.issues.map((i) => [i.key, i.count]));

  $('#detail').innerHTML = `
    <div class="d-head">
      <div class="big ${scoreClass(m.score)}">${m.score}<small>/10</small></div>
      <div class="meta">
        <div>${esc(m.client)} <span class="badge">${esc(m.type)}</span></div>
        <div class="muted">${esc(m.date)}${m.title ? ` ・ ${esc(m.title)}` : ''}${m.source?.kind === 'gdoc' ? ` ・ <a href="${esc(m.source.url)}" target="_blank" rel="noopener">元ドキュメント</a>` : ''}</div>
      </div>
    </div>
    <div class="muted">${esc(m.score_reason)}</div>
    <div class="subs">${Object.entries(m.sub_scores || {}).map(([k, v]) => `
      <div class="sub">${SUB_LABELS[k] || k} <b>${v}</b><div class="bar"><i style="width:${v * 10}%"></i></div></div>`).join('')}
    </div>
    ${(m.alerts || []).length ? `<div class="alert"><b>⚠ 同じミスを繰り返しています</b><ul>${m.alerts.map((a) => `
      <li>${esc(a.issue_label)}（${a.times}回目）<span class="muted"> 前回: ${a.previous.map((p) => `${esc(p.date)} ${esc(p.client)}/${esc(p.type)}`).join('、')}</span></li>`).join('')}</ul></div>` : ''}
    <p>${esc(m.summary)}</p>
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
    <details><summary class="muted">文字起こし（${m.transcript.length.toLocaleString()}文字）</summary><pre>${esc(m.transcript)}</pre></details>
    <div class="actions">
      <button class="ghost" id="copyBtn">テキストでコピー</button>
      <button class="ghost" id="delBtn">削除</button>
    </div>`;

  $('#copyBtn').onclick = () => {
    const md = [
      `【${m.client} / ${m.type}${m.title ? ` / ${m.title}` : ''}】${m.date}  ${m.score}/10`,
      m.score_reason, '',
      '■良かった点', ...m.good_points.map((g) => `・${g}`), '',
      '■改善点', ...m.improvements.map((i) => `・${i.text}\n  → ${i.advice}`),
      ...(m.alerts?.length ? ['', '■繰り返しミス', ...m.alerts.map((a) => `・${a.issue_label}（${a.times}回目）`)] : []),
    ].join('\n');
    navigator.clipboard.writeText(md).then(() => { $('#copyBtn').textContent = 'コピーしました'; });
  };
  $('#delBtn').onclick = async () => {
    if (!confirm('このMTGを削除しますか？')) return;
    await api(`/api/meetings/${m.id}`, { method: 'DELETE' });
    state.selected = null;
    $('#detail').innerHTML = '<p class="muted">削除しました。</p>';
    refresh();
  };
}

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
    selfName: $('#selfName').value,
    text: gdoc ? '' : fd.get('text'), docUrl: gdoc ? fd.get('docUrl') : '',
  };
  if (!body.text.trim() && !body.docUrl.trim()) return setMsg('文字起こしかURLを入力してください', true);

  $('#submitBtn').disabled = true;
  setMsg('分析中…（1〜2分かかります）');
  try {
    const m = await api('/api/meetings', { method: 'POST', body: JSON.stringify(body) });
    setMsg(m.alerts.length ? `⚠ 同じミスが${m.alerts.length}件あります` : '分析完了', m.alerts.length > 0);
    $('#text').value = ''; $('#docUrl').value = ''; e.target.title.value = '';
    await refresh();
    showDetail(m.id);
  } catch (err) {
    setMsg(err.message, true);
  } finally {
    $('#submitBtn').disabled = false;
  }
});

$('#rows').addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) showDetail(tr.dataset.id); });
$('#q').addEventListener('input', renderList);
$('#fType').addEventListener('change', renderList);
$('#selfName').value = storage.get('selfName');
$('#selfName').addEventListener('change', (e) => storage.set('selfName', e.target.value));
$('#date').value = new Date().toLocaleDateString('sv');

refresh().catch((err) => setMsg(err.message, true));
