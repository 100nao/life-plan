
  // ───────────────────────── サンプル ─────────────────────────
  function addSamples() {
    const now = Date.now();
    GENERIC_SAMPLES.forEach((s, n) => {
      const t = new Date(now - n * 1000).toISOString();
      state.items.unshift(normItem({ ...s, steps: (s.steps || []).map((x, k) => ({ text: x, done: k === 0 })), status: s.steps ? 'doing' : 'todo', sample: 'generic', createdAt: t, updatedAt: t }));
    });
    state.lessons.unshift(normLesson({ ...GENERIC_LESSON_SAMPLE, sample: 'generic' }));
    save(); rerender(); toast('サンプルを追加しました（設定からまとめて削除できます）');
  }
  function addMemoSamples() {
    let n = 0;
    const now = Date.now();
    Object.entries(MEMO_SAMPLES).forEach(([q, titles]) => titles.forEach((title) => {
      if (state.items.some((i) => i.title === title && i.status !== 'done')) return;
      const t = new Date(now - n * 1000).toISOString();
      state.items.push(normItem({ title, list: 'task', quadrant: q, importance: q === 'q1' || q === 'q2' ? 'high' : 'mid', sample: 'memo', createdAt: t, updatedAt: t }));
      n++;
    }));
    save(); go('#matrix'); toast(n ? `手書きメモから ${n}件 追加しました` : 'すでに追加済みです');
  }
  async function removeSamples() {
    const n = state.items.filter((i) => i.sample === 'generic').length + state.lessons.filter((l) => l.sample === 'generic').length;
    if (!n) return toast('（サンプル）の項目はありません');
    if (!(await confirmDialog(`（サンプル）と付いた ${n}件 を削除します。手書きメモから追加した項目は残ります。`, '削除する', true))) return;
    const snap = snapshot();
    state.items.filter((i) => i.sample === 'generic').forEach((i) => markDeleted(i.id));
    state.lessons.filter((l) => l.sample === 'generic').forEach((l) => markDeleted(l.id));
    state.items = state.items.filter((i) => i.sample !== 'generic');
    state.lessons = state.lessons.filter((l) => l.sample !== 'generic');
    save(); rerender(); undoable('サンプルを削除しました', snap);
  }

  // ───────────────────────── 書き出し・読み込み ─────────────────────────
  const backupName = () => `lifeplan-backup-${todayStr().replace(/-/g, '')}.json`;
  const exportText = () => JSON.stringify({ app: 'lifeplan', schema: 2, version: APP_VERSION, exportedAt: nowIso(), data: state }, null, 2);
  function downloadText(name, text, type = 'application/json') {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  async function shareText(name, text, asFile) {
    try {
      if (asFile && navigator.canShare) {
        const file = new File([text], name, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
      }
      if (navigator.share) { await navigator.share({ title: name, text }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return true; }
    return false;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* フォールバック */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove(); return ok;
  }
  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
      inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); if (!f) return resolve(null); const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => resolve(null); r.readAsText(f); });
      document.body.appendChild(inp); inp.click();
    });
  }
  function extractJson(text) {
    const t = String(text || '').trim();
    try { return JSON.parse(t); } catch (e) { /* 続行 */ }
    const blocks = [...t.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim());
    for (const b of blocks) { try { return JSON.parse(b); } catch (e) { /* 次へ */ } }
    for (const [o, c] of [['[', ']'], ['{', '}']]) {
      const a = t.indexOf(o); const z = t.lastIndexOf(c);
      if (a >= 0 && z > a) { try { return JSON.parse(t.slice(a, z + 1)); } catch (e) { /* 次へ */ } }
    }
    const objs = [];
    const re = /\{[^{}]*"steps"\s*:\s*\[[^\]]*\][^{}]*\}/g;
    let m; while ((m = re.exec(t))) { try { objs.push(JSON.parse(m[0])); } catch (e) { /* 無視 */ } }
    return objs.length ? objs : null;
  }
  function openImport() {
    openModal(`${modalHead('バックアップを読み込む')}
      <p class="muted small">このアプリで書き出した JSON ファイルを選ぶか、内容を貼り付けてください。</p>
      <div class="btn-row"><button class="btn soft" data-action="importPickFile">ファイルを選ぶ</button></div>
      <textarea id="importText" rows="5" placeholder="または JSON を貼り付け"></textarea>
      <div class="field"><span class="field-label">読み込み方法</span>
        <label class="radio-line"><input type="radio" name="importMode" value="merge" checked> 今のデータと統合する（同じ項目は新しい方を残す）</label>
        <label class="radio-line"><input type="radio" name="importMode" value="replace"> すべて置き換える</label></div>
      <div class="btn-row end"><button class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" data-action="importRun">読み込む</button></div>`);
  }
  async function runImport(text, mode) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { toast('JSONとして読めませんでした'); return; }
    const d = obj && obj.app === 'lifeplan' && obj.data ? obj.data : obj;
    if (!d || !Array.isArray(d.items)) {
      if (Array.isArray(obj) || (obj && Array.isArray(obj.reminders))) { toast('リマインダー形式のようです。「リマインダーから読み込み」を使ってください'); return; }
      toast('ライフプランのバックアップ形式ではありません'); return;
    }
    const inc = normalizeState(d);
    const snap = snapshot();
    if (mode === 'replace') {
      if (!(await confirmDialog('今のデータをすべて置き換えます。よろしいですか？', '置き換える', true))) return;
      const keep = new Set(SYNC_COLLECTIONS.flatMap((k) => inc[k].map((x) => x.id)));
      const del = { ...state.deleted, ...inc.deleted };
      SYNC_COLLECTIONS.forEach((k) => state[k].forEach((x) => { if (!keep.has(x.id)) del[x.id] = nowIso(); }));
      const theme = state.settings.theme;
      state = inc; state.deleted = del; state.settings.theme = theme;
      state.categoriesAt = nowIso();
      save(); closeModal(); applyTheme(); rerender(); undoable('読み込みました', snap);
    } else {
      const before = state.items.length + state.lessons.length + state.journal.length;
      state = mergeStates(state, inc);
      const added = state.items.length + state.lessons.length + state.journal.length - before;
      save(); closeModal(); rerender();
      toast(`統合しました（${added >= 0 ? '追加 ' + added + '件' : ''}）`, { label: '元に戻す', run: () => restore(snap) });
    }
  }

  // リマインダー（Apple Reminders を書き出した reminders.json）
  function openRemindersImport() {
    openModal(`${modalHead('リマインダーから読み込み')}
      <p class="muted small">iPhone のショートカット等で書き出した <code>reminders.json</code> を読み込み、「未整理」に入れます。あとで振り分けてください。</p>
      <details class="format"><summary>対応している形式</summary><pre class="mono small">[
  {
    "title": "パスポート更新",
    "list": "やること",
    "notes": "期限に注意",
    "dueDate": "2026-12-01T09:00:00+09:00",
    "isCompleted": false,
    "priority": 1,
    "flagged": true,
    "tags": ["手続き"]
  }
]</pre><p class="muted small">配列、または <code>{"reminders": [...]}</code>。priority は 1〜4=高・5=中・6〜9=低（"high" などの文字も可）。同じ内容は二重に入りません。</p></details>
      <div class="btn-row"><button class="btn soft" data-action="remindersPickFile">ファイルを選ぶ</button></div>
      <textarea id="remText" rows="5" placeholder="または JSON を貼り付け"></textarea>
      <label class="radio-line"><input type="checkbox" id="remIncludeDone"> 完了済みのリマインダーも読み込む</label>
      <div class="btn-row end"><button class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" data-action="remindersRun">読み込む</button></div>`);
  }
  function reminderPriority(p, flagged) {
    if (flagged === true) return 'high';
    if (typeof p === 'string') {
      const s = p.toLowerCase().trim();
      if (/high|高|^!!!$/.test(s)) return 'high';
      if (/low|低|^!$/.test(s)) return 'low';
      if (/medium|mid|中|^!!$/.test(s)) return 'mid';
      p = Number(s);
    }
    if (typeof p === 'number' && !isNaN(p)) { if (p >= 1 && p <= 4) return 'high'; if (p >= 6) return 'low'; }
    return 'mid';
  }
  function toDateStr(v) {
    if (!v) return '';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    if (isNaN(d.getTime())) { const m = String(v).match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/); return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : ''; }
    return todayStr(d);
  }
  function importReminders(text, includeDone) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { toast('JSONとして読めませんでした'); return null; }
    const arr = Array.isArray(obj) ? obj : obj && (obj.reminders || obj.items || obj.data);
    if (!Array.isArray(arr)) { toast('リマインダーの配列が見つかりませんでした'); return null; }
    const keys = new Set(state.items.filter((i) => i.sourceKey).map((i) => i.sourceKey));
    const res = { added: 0, dup: 0, done: 0, invalid: 0 };
    const now = Date.now();
    arr.forEach((r, n) => {
      if (!r || typeof r !== 'object') { res.invalid++; return; }
      const title = String(r.title || r.name || r.text || '').trim();
      if (!title) { res.invalid++; return; }
      const completed = r.isCompleted === true || r.completed === true || r.isCompleted === 'true';
      if (completed && !includeDone) { res.done++; return; }
      const list = String(r.list || r.listName || r.calendar || '').trim();
      const due = toDateStr(r.dueDate || r.due);
      const key = `rem:${norm(title)}|${norm(list)}|${due}`;
      if (keys.has(key)) { res.dup++; return; }
      keys.add(key);
      let tags = r.tags;
      if (typeof tags === 'string') tags = tags.split(/[,\s#]+/);
      tags = Array.isArray(tags) ? tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean) : [];
      const t = new Date(now - n).toISOString();
      state.items.push(normItem({
        title, notes: String(r.notes || r.body || ''), list: 'inbox', targetDate: due,
        importance: reminderPriority(r.priority, r.flagged === true || r.isFlagged === true), tags,
        category: state.categories.includes(list) ? list : '', status: completed ? 'done' : 'todo',
        completedAt: completed ? (r.completionDate && !isNaN(new Date(r.completionDate)) ? new Date(r.completionDate).toISOString() : t) : '',
        source: 'reminders', sourceKey: key, reminderList: list,
        createdAt: r.creationDate && !isNaN(new Date(r.creationDate)) ? new Date(r.creationDate).toISOString() : t, updatedAt: t,
      }));
      res.added++;
    });
    save();
    return res;
  }

  // コーチのステップ提案 {"taskTitle": "...", "steps": [...]}
  function applyStepSets(list) {
    const msgs = [];
    list.forEach((t) => {
      if (!t || typeof t !== 'object') return;
      const title = String(t.taskTitle || t.title || t.task || '').trim();
      const steps = Array.isArray(t.steps) ? t.steps : null;
      if (!title || !steps) return;
      const act = state.items.filter((i) => i.status !== 'done');
      const nt = norm(title);
      let it = act.find((i) => norm(i.title) === nt) || act.find((i) => norm(i.title).length > 1 && (norm(i.title).includes(nt) || nt.includes(norm(i.title))));
      let created = false;
      if (!it) { it = addItem({ title, list: 'inbox' }); created = true; }
      const n = addSteps(it, steps.map((s) => (typeof s === 'string' ? s.replace(/^\s*\d+\s*[.)．、]\s*/, '') : s)));
      msgs.push(`${it.title}：ステップ ${n}件 追加${created ? '（新規作成・未整理）' : ''}`);
    });
    return msgs;
  }
  function importCoachSteps(text) {
    const obj = extractJson(text);
    if (!obj) { toast('ステップのJSONが見つかりませんでした'); return; }
    const list = Array.isArray(obj) ? obj : Array.isArray(obj.tasks) ? obj.tasks : [obj];
    const snap = snapshot();
    const msgs = applyStepSets(list);
    if (!msgs.length) { toast('{"taskTitle": "...", "steps": [...]} の形式が見つかりませんでした'); return; }
    save(); rerender();
    openModal(`${modalHead('ステップを取り込みました')}<ul class="plain-list">${msgs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><div class="btn-row end"><button class="btn ghost" id="undoSteps">元に戻す</button><button class="btn primary" data-action="closeModal">OK</button></div>`);
    $('#undoSteps').onclick = () => { closeModal(); restore(snap); toast('取り込みを取り消しました'); };
  }
  const hashStr = (s) => { let h = 5381; for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) >>> 0; return h.toString(36); };
  // coach-inbox.json の取り込み（重複しない）
  function ingestCoachInbox(obj) {
    const msgs = Array.isArray(obj) ? obj : obj && Array.isArray(obj.messages) ? obj.messages : obj && Array.isArray(obj.advice) ? obj.advice : obj ? [obj] : [];
    let added = 0; const newSug = [];
    msgs.forEach((m) => {
      if (!m || typeof m !== 'object') return;
      const text = String(m.text || m.advice || m.message || m.body || '').trim();
      let sets = [];
      if (Array.isArray(m.stepSuggestions)) sets = m.stepSuggestions;
      else if (Array.isArray(m.tasks)) sets = m.tasks;
      else if (m.taskTitle && Array.isArray(m.steps)) sets = [{ taskTitle: m.taskTitle, steps: m.steps }];
      else if (Array.isArray(m.steps) && m.steps.length && typeof m.steps[0] === 'object' && m.steps[0].taskTitle) sets = m.steps;
      const tsug = Array.isArray(m.taskSuggestions) ? m.taskSuggestions : [];
      if (!text && !sets.length && !tsug.length) return;
      const id = 'coach:' + (m.id ? String(m.id) : hashStr((m.date || '') + '|' + text + '|' + JSON.stringify(sets) + (tsug.length ? '|' + JSON.stringify(tsug) : '')));
      if (state.coachNotes.some((c) => c.id === id) || state.deleted[id]) return;
      const result = sets.length ? applyStepSets(sets) : [];
      const date = toDateStr(m.date) || todayStr();
      const sug = tsug.length ? ingestCoachTaskSuggestions(id, tsug, date) : [];
      newSug.push(...sug);
      state.coachNotes.push(normCoach({ id, date, title: text ? String(m.title || '') : (sets.length ? 'ステップの提案' : 'タスクの提案'), text: text || (sets.length ? 'ステップの提案が届きました。' : 'タスクの提案が届きました。'), read: false, source: 'github', stepsResult: result, suggestIds: sug.map((s) => s.id) }));
      added++;
    });
    if (added) { save(); rerenderSoft(); toast(`💬 コーチから新着アドバイスが ${added}件 届きました${newSug.length ? `（AI提案 ${newSug.length}件）` : ''}`); }
    if (newSug.length) setTimeout(() => autoMoveIfOn(newSug), 1600);
    return added;
  }

  // ───────────────────────── 統合（同期・読み込み共通） ─────────────────────────
  const SYNC_COLLECTIONS = ['items', 'lessons', 'journal', 'coachNotes', 'habits', 'aiAnalyses', 'aiSuggestions', 'countdowns', 'gcalDeletes'];
  const canonical = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  function mergeStates(local, remote) {
    const out = normalizeState(JSON.parse(JSON.stringify(local)));
    const del = { ...remote.deleted };
    Object.entries(local.deleted).forEach(([k, v]) => { if (!del[k] || v > del[k]) del[k] = v; });
    const cut = new Date(Date.now() - 180 * 86400000).toISOString();
    Object.keys(del).forEach((k) => { if (del[k] < cut) delete del[k]; });
    SYNC_COLLECTIONS.forEach((key) => {
      const map = new Map();
      remote[key].forEach((x) => map.set(x.id, x));
      out[key].forEach((x) => { const r = map.get(x.id); if (!r || (x.updatedAt || '') >= (r.updatedAt || '')) map.set(x.id, x); });
      out[key] = [...map.values()].filter((x) => !(del[x.id] && del[x.id] >= (x.updatedAt || ''))).sort(canonical);
    });
    if ((remote.categoriesAt || '') > (local.categoriesAt || '')) { out.categories = [...remote.categories]; out.categoriesAt = remote.categoriesAt; }
    out.categories = [...CATEGORIES]; // v1.8.0：カテゴリは2択固定（同期先の古い一覧では戻さない）
    Object.keys(remote.focus).forEach((y) => {
      if (!(y in local.focus) || (remote.focusAt[y] || '') > (local.focusAt[y] || '')) { out.focus[y] = remote.focus[y]; out.focusAt[y] = remote.focusAt[y] || ''; }
    });
    out.deleted = del;
    out.settings = { ...local.settings };
    return out;
  }
  function markDeleted(id) { state.deleted[id] = nowIso(); }

  // ───────────────────────── GitHub 同期 ─────────────────────────
  // データ：{owner}/{repo} の {path}（既定 data/life-plan.json）
  // コーチ受信箱：{inboxPath}（既定 data/coach-inbox.json）… AIコーチが書き、アプリが自動で取り込む
  const SYNC_KEY = 'lifeplan.sync';
  const SYNC_DEFAULTS = { owner: '100nao', repo: 'life-plan-data', branch: 'main', path: 'data/life-plan.json', inboxPath: 'data/coach-inbox.json', token: '', auto: true, connected: false, lastSyncAt: '', lastError: '', dirty: false };
  function loadSync() { try { return { ...SYNC_DEFAULTS, ...JSON.parse(localStorage.getItem(SYNC_KEY) || '{}') }; } catch (e) { return { ...SYNC_DEFAULTS }; } }
  let sync = loadSync();
  function saveSync() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) { /* noop */ } }
  let syncState = sync.connected ? (sync.lastError ? 'error' : 'idle') : 'off';
  let syncTimer = null; let syncing = null; let syncAgain = false;
  const hhmm = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function syncStatusText() {
    if (!sync.connected) return { label: '未接続', detail: '' };
    const last = sync.lastSyncAt ? `最終同期 ${hhmm(sync.lastSyncAt)}` : 'まだ同期していません';
    switch (syncState) {
      case 'syncing': return { label: '同期中…', detail: last };
      case 'ok': return { label: '同期済み', detail: last + (sync.auto ? '・自動同期オン' : '・自動同期オフ') };
      case 'error': return { label: 'エラー', detail: (sync.lastError || '') + '（自動で再試行します）' };
      case 'offline': return { label: 'オフライン', detail: 'オンラインに戻ったら自動で同期します。' + last };
      default: return { label: sync.dirty ? '未保存あり' : '待機中', detail: last };
    }
  }
  function setSyncState(s) {
    syncState = s;
    const dot = $('#syncDot');
    if (dot) {
      dot.hidden = !sync.connected;
      dot.className = 'icon-btn sync-dot st-' + s;
      const t = syncStatusText(); dot.setAttribute('aria-label', '同期：' + t.label); dot.title = '同期：' + t.label + (t.detail ? '（' + t.detail + '）' : '');
    }
    const card = $('#syncCard');
    if (card && sync.connected) {
      const t = syncStatusText();
      const c = $('.card-head .chip', card); if (c) { c.textContent = t.label; c.className = 'chip sync-' + s; }
      const d = $('#syncDetail', card); if (d) d.textContent = t.detail;
    }
  }
  const ghUrl = (p) => `https://api.github.com/repos/${encodeURIComponent(sync.owner)}/${encodeURIComponent(sync.repo)}${p}`;
  const contentsUrl = (p) => ghUrl('/contents/' + String(p).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/'));
  async function gh(url, opts = {}, accept = 'application/vnd.github+json') {
    try {
      return await fetch(url, { ...opts, cache: 'no-store', headers: { Accept: accept, Authorization: 'Bearer ' + sync.token, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch (e) { const err = new Error('GitHub に接続できません（ネットワークを確認）'); err.network = true; throw err; }
  }
  async function ghError(res) {
    let m = ''; try { m = (await res.json()).message || ''; } catch (e) { /* noop */ }
    const msg = {
      401: 'トークンが正しくないか、期限切れです',
      403: /rate limit/i.test(m) ? 'GitHub の利用回数の上限に達しました（しばらく後に自動で再試行）' : '権限がありません（トークンの Contents: Read and write と対象リポジトリを確認）',
      404: `${sync.owner}/${sync.repo}（ブランチ ${sync.branch}）が見つかりません。名前と、トークンの対象リポジトリを確認してください`,
      409: '他の端末と同時に保存されました（再試行します）',
      422: '保存が競合しました（再試行します）',
    }[res.status] || `GitHub エラー（${res.status}）${m}`;
    const e = new Error(msg); e.status = res.status; return e;
  }
  function b64encode(str) { const bytes = new TextEncoder().encode(str); let bin = ''; for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000)); return btoa(bin); }
  function b64decode(b64) { const bin = atob(String(b64).replace(/\s/g, '')); const bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k); return new TextDecoder().decode(bytes); }
  async function ghGetFile(path) {
    const url = contentsUrl(path) + '?ref=' + encodeURIComponent(sync.branch);
    const res = await gh(url);
    if (res.status === 404) return { exists: false };
    if (!res.ok) throw await ghError(res);
    const j = await res.json();
    if (Array.isArray(j)) throw new Error(`${path} はフォルダです。ファイルのパスを指定してください`);
    let text = '';
    if (j.encoding === 'base64' && j.content) text = b64decode(j.content);
    else if (j.size > 0) { const r2 = await gh(url, {}, 'application/vnd.github.raw+json'); if (!r2.ok) throw await ghError(r2); text = await r2.text(); }
    return { exists: true, sha: j.sha, text };
  }
  async function ghPutFile(path, text, sha, message) {
    const res = await gh(contentsUrl(path), { method: 'PUT', body: JSON.stringify({ message, content: b64encode(text), branch: sync.branch, ...(sha ? { sha } : {}) }) });
    if (!res.ok) throw await ghError(res);
    return res.json();
  }
  const syncPayload = (s) => { const { settings, ...rest } = s; return rest; };
  // 並び順の違いだけで無駄なコミットをしないよう、比較は正規化した形で行う
  const syncComparable = (s) => { const o = { ...syncPayload(s) }; SYNC_COLLECTIONS.forEach((k) => { o[k] = [...(o[k] || [])].sort(canonical); }); o.deleted = Object.fromEntries(Object.entries(o.deleted || {}).sort()); return JSON.stringify(o); };
  function parseRemote(text) {
    if (!text || !text.trim()) return null;
    let o;
    try { o = JSON.parse(text); } catch (e) { throw new Error('GitHub 上のデータ（' + sync.path + '）が JSON として読めません'); }
    return normalizeState(o && o.data ? o.data : o);
  }
  async function pullAndMerge() {
    const remote = await ghGetFile(sync.path);
    const remoteState = remote.exists ? parseRemote(remote.text) : null;
    if (remoteState) {
      const before = JSON.stringify(state);
      const merged = mergeStates(state, remoteState);
      if (JSON.stringify(merged) !== before) { state = merged; saveLocal(); rerenderSoft(); }
    }
    return { remote, remoteState };
  }
  async function syncNow(opts = {}) {
    if (!sync.connected || !sync.token) return;
    if (!navigator.onLine) { setSyncState('offline'); return; }
    if (syncing) { syncAgain = true; return syncing; }
    clearTimeout(syncTimer);
    syncing = (async () => {
      setSyncState('syncing');
      try {
        const gen = changeGen;
        for (let attempt = 0; ; attempt++) {
          const { remote, remoteState } = await pullAndMerge();
          if (opts.pullOnly) break;
          if (!remoteState || syncComparable(remoteState) !== syncComparable(state)) {
            const body = JSON.stringify({ app: 'lifeplan', schema: 2, version: APP_VERSION, savedAt: nowIso(), data: syncPayload(state) }, null, 1);
            try {
              await ghPutFile(sync.path, body, remote.exists ? remote.sha : undefined, `ライフプラン自動保存 ${hhmm(nowIso())}`);
            } catch (e) {
              if ((e.status === 409 || e.status === 422) && attempt < 3) continue;
              throw e;
            }
          }
          break;
        }
        if (!opts.pullOnly) {
          if (changeGen === gen) sync.dirty = false; else syncAgain = true;
        }
        await pullCoachInbox();
        await pullCalendar().catch((e) => { calUi.error = e.message || String(e); });
        sync.lastSyncAt = nowIso(); sync.lastError = ''; saveSync(); setSyncState('ok');
        photoSyncSoon(400);
      } catch (e) {
        sync.lastError = e.message || String(e); saveSync();
        setSyncState(e.network || !navigator.onLine ? 'offline' : 'error');
        if (e.status !== 401 && e.status !== 404) scheduleSync(60000);
      } finally {
        syncing = null;
        if (syncAgain) { syncAgain = false; scheduleSync(800); }
      }
    })();
    return syncing;
  }
  async function pullCoachInbox() {
    if (!sync.inboxPath) return 0;
    const f = await ghGetFile(sync.inboxPath);
    if (!f.exists || !f.text.trim()) return 0;
    let obj; try { obj = JSON.parse(f.text); } catch (e) { obj = extractJson(f.text); }
    if (!obj) throw new Error(sync.inboxPath + ' が JSON として読めません');
    return ingestCoachInbox(obj);
  }
  function scheduleSync(ms = 3000) {
    if (!sync.connected || !sync.token || !sync.auto) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), ms);
  }
  async function testConnection(form) {
    const fd = new FormData(form);
    const msg = $('#syncMsg', form); const btn = $('#syncTestBtn', form);
    const token = String(fd.get('token') || '').trim() || sync.token;
    const vals = {};
    ['owner', 'repo', 'branch', 'path', 'inboxPath'].forEach((k) => { const v = fd.get(k); if (v != null) vals[k] = String(v).trim().replace(/^\/+/, '') || SYNC_DEFAULTS[k]; });
    if (!token) { msg.textContent = 'トークンを貼り付けてください'; return; }
    Object.assign(sync, vals, { token });
    btn.disabled = true; msg.textContent = '接続を確認しています…';
    try {
      const res = await gh(ghUrl(''));
      if (!res.ok) throw await ghError(res);
      const repo = await res.json();
      if (repo.permissions && repo.permissions.push === false) throw new Error('このリポジトリへの書き込み権限がありません');
      sync.connected = true; sync.auto = true; sync.lastError = ''; sync.dirty = true; saveSync();
      msg.textContent = '接続できました。同期しています…';
      await syncNow();
      if (sync.lastError) throw new Error(sync.lastError);
      render(true);
      toast('GitHub と接続しました。これからは自動で同期します ✓');
    } catch (e) {
      sync.connected = false; sync.lastError = e.message || String(e); saveSync(); setSyncState('off');
      msg.textContent = '⚠️ ' + sync.lastError;
      btn.disabled = false;
    }
  }

  // ───────────────────────── AIに相談（Gemini） ─────────────────────────
  // APIキー・会話履歴はこの端末の localStorage（lifeplan.ai / lifeplan.aiChat）だけに保存。
  // state（同期・バックアップの対象）には一切入れない。
  const AI_KEY = 'lifeplan.ai';
  const AI_HIST_KEY = 'lifeplan.aiChat';
  const AI_HIST_MAX = 50;
  const AI_MODELS = { 'gemini-flash-lite-latest': '軽量Flash（速い・おすすめ）', 'gemini-flash-latest': '最新のFlash（賢いが遅め）', 'gemini-3.8-flash': 'gemini-3.8-flash（高性能）', 'gemini-3.6-flash': 'gemini-3.6-flash（標準）', 'gemini-3.5-flash-lite': 'gemini-3.5-flash-lite（軽量・速い）' };
  const AI_DEFAULT_MODEL = 'gemini-flash-lite-latest';
  const AI_FALLBACKS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.8-flash'];
  const AI_ENDPOINT = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const AI_CHIPS = ['今週何から手をつける？', '停滞タスクの原因を一緒に考えて', 'このタスクをステップに分けて', 'ジャーナルを振り返って'];
  function loadAi() {
    try { const o = JSON.parse(localStorage.getItem(AI_KEY) || '{}'); return { key: String(o.key || ''), model: (o.mv === 2 && AI_MODELS[o.model]) ? o.model : AI_DEFAULT_MODEL, share: o.share !== false, daily: o.daily !== false, autoMove: o.autoMove === true, mv: 2 }; } catch (e) { return { key: '', model: AI_DEFAULT_MODEL, share: true, mv: 2 }; }
  }
  let ai = loadAi();
  function saveAi() { try { localStorage.setItem(AI_KEY, JSON.stringify(ai)); } catch (e) { /* noop */ } }
  function loadAiHist() { try { const a = JSON.parse(localStorage.getItem(AI_HIST_KEY) || '[]'); return Array.isArray(a) ? a.filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string') : []; } catch (e) { return []; } }
  let aiHist = loadAiHist();
  function saveAiHist() {
    if (aiHist.length > AI_HIST_MAX) aiHist = aiHist.slice(-AI_HIST_MAX);
    try { localStorage.setItem(AI_HIST_KEY, JSON.stringify(aiHist)); } catch (e) { /* noop */ }
  }
  const aiUi = { busy: false, draft: '', showKey: false };

  // ユーザーデータの小さな要約（システムプロンプト用）
  function aiContext() {
    const L = [];
    const act = activeItems();
    const focus = state.focus[thisYear()] || '';
    L.push(`今日：${fmtDate(todayStr())}`);
    L.push(`${thisYear()}年のフォーカス：${focus || '（未設定）'}`);
    const qOrder = { q1: 0, q2: 1, q3: 2, q4: 3, '': 4 };
    const items = [...act].sort((a, b) => qOrder[a.quadrant] - qOrder[b.quadrant] || (isStuck(b) - isStuck(a)) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40);
    L.push('', `## 進行中・未完了の項目（${act.length}件${act.length > items.length ? `、上位${items.length}件のみ` : ''}）`);
    if (!items.length) L.push('- なし');
    items.forEach((i) => {
      const meta = [i.quadrant ? `${i.quadrant} ${QUADRANTS[i.quadrant].label}` : '未分類', LISTS[i.list], STATUS[i.status], `重要度${IMPORTANCE[i.importance]}`, i.targetDate ? `期限${i.targetDate}` : '', i.steps.length ? `ステップ${stepsDone(i)}/${i.steps.length}` : '', isStuck(i) ? `停滞${idleDays(i)}日` : ''].filter(Boolean).join('・');
      const next = (i.steps.find((s) => !s.done) || {}).text;
      L.push(`- ${trunc(i.title, 40)}［${meta}］${next ? ` 次：${trunc(next, 30)}` : ''}`);
    });
    const stuck = act.filter(isStuck).sort((a, b) => idleDays(b) - idleDays(a)).slice(0, 10);
    L.push('', `## 停滞している項目（${STUCK_DAYS}日以上進捗なし）`);
    if (!stuck.length) L.push('- なし');
    stuck.forEach((i) => L.push(`- ${trunc(i.title, 40)}：${idleDays(i)}日／理由：${i.stuck.tags.length ? i.stuck.tags.join('、') : '未記入'}${i.stuck.text ? `／メモ：${trunc(i.stuck.text, 60)}` : ''}`));
    L.push('', '## 習い事');
    if (!state.lessons.length) L.push('- なし');
    state.lessons.slice(0, 10).forEach((l) => L.push(`- ${trunc(l.name, 30)}：${LESSON_STATUS[l.status]}${l.frequency ? '・' + l.frequency : ''}・${fmtYen(l.monthlyCost)}/月・今月${sessionsThisMonth(l)}回`));
    const j = [...state.journal].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 10).reverse();
    L.push('', `## 最近のジャーナル（${j.length}件）`);
    if (!j.length) L.push('- なし');
    j.forEach((e) => L.push(`- ${e.date}${e.mood ? ` 気分${e.mood}/5` : ''}：${trunc(e.text.replace(/\s*\n\s*/g, ' ／ '), 160)}`));
    const s = L.join('\n');
    return s.length > 7000 ? s.slice(0, 7000) + '\n…（以下省略）' : s;
  }
  function aiSystemPrompt() {
    const P = [
      'あなたは「ライフプラン」アプリの中にいる、あたたかく誠実なパーソナルコーチです。ユーザーは日本語話者です。必ず日本語で、やさしく・具体的に・簡潔に答えてください（長くても400〜600字程度。箇条書き歓迎）。',
      'ユーザーはタスクを「緊急度×重要度」のマトリクスで整理しています：q1＝緊急かつ重要（今すぐやる）、q2＝重要だが緊急でない（計画してやる）、q3＝緊急だが重要でない（任せる・手早く）、q4＝どちらでもない（やめる・あとで）。q2 を大事に育てる視点を持ってください。',
      '責めずに共感し、「次の小さな一歩」（5〜30分でできること）を必ず1つ以上提案してください。データにないことは決めつけず、必要なら1つだけ質問してください。',
      'タスクをステップに分けてほしいと頼まれたら、説明のあとに必ず次の形式のJSONをコードブロックで付けてください（タスク名はデータの表記どおり。ステップは3〜7個、1つ30分〜1日でできる大きさ）：',
      '```json\n{"taskTitle": "タスク名", "steps": ["ステップ1", "ステップ2"]}\n```',
      '医療・法律・お金の重大な判断は専門家への相談もすすめてください。',
    ];
    if (ai.share) P.push('', '以下はユーザーの現在のデータ（アプリから自動作成した要約）です。', '---', aiContext(), '---');
    else P.push('', '（ユーザーはタスクやジャーナルのデータを共有しない設定にしています。会話の内容だけをもとに答えてください。）');
    return P.join('\n');
  }
  const isStepRequest = (t) => /ステップ|分け|分解|細かく|手順/.test(t);
  function aiErrorMessage(status, body) {
    const err = (body && body.error) || {};
    const reason = JSON.stringify(err.details || '') + ' ' + (err.message || '') + ' ' + (err.status || '');
    if (/API_KEY_INVALID|API key not valid|API_KEY/i.test(reason) || status === 401) return 'APIキーが正しくありません。設定の「AI連携（Gemini）」でキーを確認してください。';
    if (status === 403) return 'このAPIキーでは利用できません（権限がないか、キーが無効です）。Google AI Studio でキーを確認してください。';
    if (status === 429) return '無料枠の上限に達しました。少し待ってから（1分〜しばらく）再度お試しください。';
    if (status === 404) return 'モデルが見つかりません。設定でモデルを変更してください。';
    if (status === 400) return 'リクエストが受け付けられませんでした（' + trunc(String(err.message || '400'), 80) + '）';
    if (status >= 500) return 'Gemini が混み合っているようです。少し待ってから再度お試しください。';
    return `エラーが発生しました（${status}）${err.message ? '：' + trunc(String(err.message), 80) : ''}`;
  }
  function cleanAiKey(k) { return String(k || '').replace(/[\s\u200B-\u200D\uFEFF\u3000]+/g, ''); }
  async function callGemini(contents, opts = {}) {
    const key = cleanAiKey(opts.key || ai.key);
    const model = opts.model || ai.model;
    if (!key) throw new Error('APIキーが設定されていません。設定の「AI連携（Gemini）」で登録してください。');
    if (/[^\x21-\x7E]/.test(key) || /[…]/.test(key)) throw new Error('APIキーに使えない文字（「…」や全角文字など）が含まれています。Google AI Studio のコピーボタンでキーをコピーし直して貼り付けてください。');
    if (!navigator.onLine) throw new Error('オフラインです。インターネットに接続してから送信してください。');
    const body = { contents, generationConfig: { maxOutputTokens: opts.maxTokens || 8192 } };
    if (opts.thinking !== false) body.generationConfig.thinkingConfig = { thinkingLevel: 'low' }; // 考える時間を短くして速く返す
    if (opts.json) body.generationConfig.responseMimeType = 'application/json';
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    const tryModels = [model, ...AI_FALLBACKS.filter((m) => m !== model)];
    let res, j = null;
    for (let i = 0; i < tryModels.length; i++) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const tmr = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs || 90000) : null;
      try {
        res = await fetch(AI_ENDPOINT(tryModels[i]), { method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
      } catch (e) {
        if (tmr) clearTimeout(tmr);
        if (e && e.name === 'AbortError') throw new Error('Gemini からの返事が時間内に届きませんでした。通信状況を確認して、少し待ってからもう一度お試しください。');
        throw new Error('Gemini に接続できません。オフラインか、通信が不安定なようです。');
      }
      if (tmr) clearTimeout(tmr);
      j = null; try { j = await res.json(); } catch (e) { j = null; }
      if (res.status === 400 && body.generationConfig.thinkingConfig && /thinking/i.test(JSON.stringify(j || ''))) { delete body.generationConfig.thinkingConfig; i--; continue; } // 考える設定に未対応のモデル → 外して再送
      if (res.status === 404 && i < tryModels.length - 1) continue; // モデルが使えない → 次の候補へ自動で切り替え
      if (res.ok && tryModels[i] !== ai.model && AI_MODELS[tryModels[i]] && !opts.key) { ai.model = tryModels[i]; try { saveAi(); } catch (e) {} }
      break;
    }
    if (!res.ok) throw new Error(aiErrorMessage(res.status, j));
    const cand = j && Array.isArray(j.candidates) ? j.candidates[0] : null;
    const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.filter((p) => !p.thought).map((p) => p.text || '').join('').trim() : '';
    if (!text && opts.allowEmpty) return '';
    if (!text) {
      if (cand && cand.finishReason === 'MAX_TOKENS') throw new Error('回答が長くなりすぎて途中で止まりました。質問を短くしてもう一度お試しください。');
      const block = (j && j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason);
      throw new Error(block === 'SAFETY' || (block && /SAFETY|BLOCK/.test(block)) ? '安全上の理由で回答が止められました。言い方を変えてもう一度お試しください。' : '回答が空でした。もう一度お試しください。');
    }
    return text;
  }
  // 返事からステップ提案（{"taskTitle", "steps"}）を取り出す
  function aiExtractSteps(text) {
    if (!/"steps"\s*:/.test(text)) return null;
    const obj = extractJson(text);
    if (!obj) return null;
    const list = (Array.isArray(obj) ? obj : Array.isArray(obj.tasks) ? obj.tasks : [obj])
      .filter((t) => t && typeof t === 'object' && String(t.taskTitle || t.title || t.task || '').trim() && Array.isArray(t.steps) && t.steps.length)
      .map((t) => ({ taskTitle: String(t.taskTitle || t.title || t.task).trim(), steps: t.steps.map((s) => String(typeof s === 'object' && s ? s.text || s.title || '' : s).trim()).filter(Boolean).slice(0, 15) }));
    return list.length ? list : null;
  }
  const aiDisplayText = (m) => (m.steps ? m.text.replace(/```(?:json)?\s*[\s\S]*?"steps"[\s\S]*?```/gi, '').trim() : m.text);
  function aiFormat(text) {
    return esc(text)
      .replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/^(\s*)[*-]\s+/gm, '$1・')
      .replace(/```(?:\w+)?\n?/g, '');
  }
  async function aiSend(text) {
    text = String(text || '').trim();
    if (!text || aiUi.busy) return;
    if (!ai.key) { toast('先に設定でGeminiのAPIキーを登録してください'); go('#settings/ai'); return; }
    const userMsg = { id: uid(), role: 'user', text, at: nowIso() };
    aiHist.push(userMsg); saveAiHist();
    aiUi.busy = true; aiUi.draft = '';
    if (route().name === 'ai') { rerender(); aiScrollBottom(); }
    const history = aiHist.filter((m) => !m.error).slice(-20);
    const contents = history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
    if (isStepRequest(text)) contents[contents.length - 1].parts[0].text += '\n\n（アプリへの取り込み用に、回答の最後に {"taskTitle": "…", "steps": ["…"]} 形式のJSONをコードブロックで付けてください）';
    try {
      const reply = await callGemini(contents, { system: aiSystemPrompt() });
      aiHist.push({ id: uid(), role: 'model', text: reply, at: nowIso(), steps: aiExtractSteps(reply) || undefined });
    } catch (e) {
      aiHist.push({ id: uid(), role: 'model', text: e.message || String(e), at: nowIso(), error: true });
    } finally {
      aiUi.busy = false; saveAiHist();
      if (route().name === 'ai' && backdrop.hidden) {
        const a = document.activeElement; const typing = a && a.matches && a.matches('form[data-form=aiChat] textarea');
        rerender(); aiScrollBottom();
        if (typing) { const t = $('form[data-form=aiChat] textarea'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
      } else if (route().name === 'ai') pendingRender = true;
      else toast('🤖 AIから返事が届きました', { label: '開く', run: () => go('#ai') });
    }
  }
  function aiScrollBottom() { setTimeout(() => { const c = $('#aiChatEnd'); if (c) c.scrollIntoView({ block: 'end' }); }, 30); }
  function aiBubble(m) {
    if (m.role === 'user') return `<div class="bubble-row me"><div class="bubble me"><p class="pre">${esc(m.text)}</p></div></div>`;
    const tools = m.error ? '' : `<div class="bubble-tools">
        ${m.steps ? `<button class="btn small ${m.stepsAdded ? 'soft' : 'primary'}" data-action="aiAddSteps" data-id="${m.id}" ${m.stepsAdded ? 'disabled' : ''}>${m.stepsAdded ? '✓ ステップに追加済み' : '＋ ステップに追加'}</button>` : ''}
        <button class="btn small soft" data-action="aiSaveJournal" data-id="${m.id}" ${m.savedJournal ? 'disabled' : ''}>${m.savedJournal ? '✓ ジャーナルに保存済み' : '📓 ジャーナルに保存'}</button>
        <button class="btn small ghost" data-action="aiCopy" data-id="${m.id}">コピー</button></div>`;
    const stepsBox = m.steps ? `<div class="steps-result">${m.steps.map((t) => `<b>${esc(t.taskTitle)}</b><ol>${t.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`).join('')}</div>` : '';
    return `<div class="bubble-row ai"><div class="bubble ai ${m.error ? 'error' : ''}">${m.error ? '<b>⚠️ </b>' : ''}<div class="pre">${aiFormat(aiDisplayText(m))}</div>${stepsBox}${tools}</div></div>`;
  }
  function viewAI() {
    const out = [sectionHead('AIに相談（Gemini）', ai.share ? 'タスク・ジャーナルの要約を添えて Google Gemini に相談します。' : 'データは共有せず、会話だけで相談します。',
      aiHist.length ? '<button class="btn ghost small" data-action="aiClear">会話をクリア</button>' : '')];
    if (!ai.key) {
      out.push(`<section class="card ai-setup"><h2>🔑 はじめに APIキーを登録</h2>
        <p class="small">Google AI Studio で無料の Gemini APIキーを作り、設定に貼り付けるだけで使えます（無料枠の範囲で利用できます）。</p>
        <div class="btn-row"><a class="btn primary" href="#settings/ai">設定を開く</a><a class="btn soft" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">APIキーを作る ↗</a></div></section>`);
    }
    out.push(`<div class="chat" id="aiChat" aria-live="polite">${aiHist.length ? aiHist.map(aiBubble).join('') : `<div class="chat-empty muted small">今の状況をふまえて、AIコーチがいっしょに考えます。下のボタンから気軽にどうぞ。</div>`}
      ${aiUi.busy ? '<div class="bubble-row ai"><div class="bubble ai loading" role="status"><span class="dots"><i></i><i></i><i></i></span> 考えています…</div></div>' : ''}<div id="aiChatEnd"></div></div>`);
    out.push(`<div class="chat-dock">
      <div class="seg-scroll chips-row">${AI_CHIPS.map((c) => `<button class="pill" data-action="aiChip" data-v="${esc(c)}" ${aiUi.busy ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>
      <form class="chat-form" data-form="aiChat">
        <textarea name="text" rows="1" placeholder="AIに相談したいことを入力…" data-input="aiDraft" aria-label="メッセージ" enterkeyhint="send">${esc(aiUi.draft)}</textarea>
        <button class="btn primary send" type="submit" ${aiUi.busy ? 'disabled' : ''} aria-label="送信">送信</button>
      </form>
      <label class="switch-line small"><input type="checkbox" data-change="aiShare" ${ai.share ? 'checked' : ''}> タスクとジャーナルを共有する</label>
    </div>`);
    return out.join('');
  }
  function aiCard() {
    return `<section class="card ai-card" id="aiCard">
      <div class="card-head"><h2>🤖 AI連携（Gemini）</h2><span class="chip ${ai.key ? 'sync-ok' : ''}">${ai.key ? 'キー登録済み' : '未設定'}</span></div>
      <p class="small">Google の Gemini に、アプリの中から直接相談できます（<a class="link" href="#ai">AIに相談</a>）。</p>
      <form data-form="aiSetup" class="ai-form">
        <label class="field"><span class="field-label">Gemini APIキー</span>
          <span class="key-row"><input name="key" id="aiKeyInput" type="${aiUi.showKey ? 'text' : 'password'}" placeholder="${ai.key ? '••••••（保存済み）' : 'AIza…'}" value="${esc(ai.key)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
          <button type="button" class="btn soft small" data-action="aiToggleKey">${aiUi.showKey ? '隠す' : '表示'}</button></span></label>
        <label class="field"><span class="field-label">モデル</span><select name="model">${options(AI_MODELS, ai.model)}</select></label>
        <div class="btn-row"><button class="btn primary small" type="submit">保存</button><button type="button" class="btn soft small" data-action="aiTest" id="aiTestBtn">接続テスト</button>${ai.key ? '<button type="button" class="btn ghost danger small" data-action="aiDeleteKey">キーを削除</button>' : ''}</div>
        <p class="sync-msg small" id="aiMsg"></p>
      </form>
      <ul class="small muted note-list">
        <li>キーはこの端末だけに保存され、GitHubには送られません（バックアップにも含まれません）。</li>
        <li>無料枠の範囲で使えます（上限を超えると少し待つ必要があります）。無料枠では、送った内容が Google のサービス改善に使われることがあります。</li>
        <li>キーの作成：<a class="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio（aistudio.google.com/apikey）↗</a></li>
      </ul>
    </section>`;
  }
  async function aiTest() {
    const inp = $('#aiKeyInput'); const msg = $('#aiMsg'); const btn = $('#aiTestBtn');
    const key = cleanAiKey((inp && inp.value) || '') || ai.key;
    const sel = $('form[data-form=aiSetup] select[name=model]');
    const model = (sel && sel.value) || ai.model;
    if (!key) { msg.textContent = 'APIキーを貼り付けてください'; return; }
    btn.disabled = true; msg.textContent = '接続を確認しています…';
    try {
      await callGemini([{ role: 'user', parts: [{ text: '接続テストです。「OK」とだけ返してください。' }] }], { key, model: 'gemini-flash-lite-latest', maxTokens: 256, allowEmpty: true, timeoutMs: 30000 });
      ai.key = key; ai.model = model; saveAi();
      msg.textContent = '✓ 接続できました（キーを保存しました）';
      toast('Gemini と接続できました ✓');
    } catch (e) { msg.textContent = '⚠️ ' + (e.message || e); }
    btn.disabled = false;
  }
  function openAiStepPicker() {
    const act = activeItems().sort((a, b) => (isStuck(b) - isStuck(a)) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
    openModal(`${modalHead('どのタスクを分けますか？')}
      <p class="muted small">選ぶと、AIがステップを提案します。「ステップに追加」でそのタスクに取り込めます。</p>
      <ul class="plain-list pick-list">${act.map((i) => `<li><button class="pick-task" data-action="aiPickTask" data-v="${esc(i.title)}"><span class="grow">${esc(i.title)}</span><span class="muted small">${i.quadrant ? QUADRANTS[i.quadrant].label : LISTS[i.list]}${i.steps.length ? `・${stepsDone(i)}/${i.steps.length}` : ''}${isStuck(i) ? '・停滞' : ''}</span></button></li>`).join('') || '<li class="muted small">未完了のタスクがありません</li>'}</ul>
      <button class="btn ghost wide" data-action="aiPickCustom">自分で入力する</button>`);
  }

  // ───────────────────────── ジャーナル：写真（手書き）から追加 ─────────────────────────
  // 画像はこの画面の中（メモリ）でだけ扱い、state・同期・バックアップには保存しない。保存するのは文字だけ（source:'photo'）。
  const photo = { queue: [], cur: null, total: 0, busy: false };
  const PHOTO_PROMPT = [
    'この写真は、日本語で手書きされたジャーナル（日記・メモ）のページです。',
    '書かれている文字を、意味を変えずに一字一句できるだけ忠実に書き起こしてください。改行・箇条書き・段落はそのまま残し、要約・言い換え・補足はしないでください。',
    '読めない部分は ［判読不能］ と書いてください。',
    'ページに日付が書かれていれば date に YYYY-MM-DD 形式で入れてください（年が書かれていなければ、今日 TODAY に最も近い過去の年を補ってください）。書かれていなければ null。',
    '文中に出てくる「やること・やりたいこと・タスク」を tasksMentioned に短い名前で入れてください（なければ空配列）。',
    '緊急度×重要度のマトリクス（4つの枠）が描かれていれば、各枠に書かれた項目を quadrantHints の q1（緊急かつ重要）・q2（重要だが緊急でない）・q3（緊急だが重要でない）・q4（どちらでもない）に入れてください。マトリクスがなければ quadrantHints は null。',
    '次のJSONだけを返してください：{"date": "YYYY-MM-DD" または null, "text": "書き起こし全文", "tasksMentioned": ["…"], "quadrantHints": {"q1": [], "q2": [], "q3": [], "q4": []} または null}',
  ].join('\n');
  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve({ img, done: () => URL.revokeObjectURL(url) }); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('この画像は読み込めませんでした（形式に未対応の可能性があります。iPhoneの写真なら、そのまま「写真ライブラリ」から選ぶと自動で変換されます）')); };
      img.decoding = 'async';
      img.src = url; // 画像の向き（EXIF）はブラウザが自動で補正（image-orientation: from-image）
    });
  }
  function drawScaled(img, max, quality) {
    const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('画像のサイズを読み取れませんでした');
    const r = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * r)); c.height = Math.max(1, Math.round(h * r));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  }
  async function compressImage(file) {
    const { img, done } = await loadImageFile(file);
    try { return { full: drawScaled(img, 1600, 0.8), thumb: drawScaled(img, 480, 0.7) }; } finally { done(); }
  }
  const normDetectedDate = (s) => {
    const m = String(s || '').match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
    if (!m) return '';
    const d = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    return isDateStr(d) && !isNaN(new Date(d + 'T00:00:00')) ? d : '';
  };
  function parsePhotoResult(text) {
    let o = null;
    try { o = JSON.parse(text); } catch (e) { o = extractJson(text); }
    if (Array.isArray(o)) o = o[0];
    if (!o || typeof o !== 'object') o = { text };
    const list = (a) => (Array.isArray(a) ? a.map((x) => String(typeof x === 'object' && x ? x.title || x.text || '' : x).trim()).filter(Boolean).slice(0, 30) : []);
    const qh = o.quadrantHints && typeof o.quadrantHints === 'object' ? o.quadrantHints : null;
    const quads = qh ? { q1: list(qh.q1), q2: list(qh.q2), q3: list(qh.q3), q4: list(qh.q4) } : null;
    return { date: normDetectedDate(o.date), text: String(o.text || '').trim(), tasks: list(o.tasksMentioned), quads: quads && Object.values(quads).some((a) => a.length) ? quads : null };
  }
  function pickPhoto() {
    if (!ai.key) {
      openModal(`${modalHead('写真から追加')}<p>手書きの読み取りには Gemini（無料枠あり）を使います。先に設定で APIキーを登録してください。</p>
        <div class="btn-row end"><button class="btn ghost" data-action="closeModal">閉じる</button><button class="btn primary" data-action="goAiSettings">設定を開く</button></div>`);
      return;
    }
    const inp = $('#photoInput'); if (inp) { inp.value = ''; inp.click(); }
  }
  function startPhotoQueue(files) {
    files = [...files].filter((f) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) { toast('画像ファイルを選んでください'); return; }
    photo.queue = files.slice(0, 10); photo.total = photo.queue.length;
    if (files.length > 10) toast('一度に読み取れるのは10枚までです');
    nextPhoto();
  }
  function photoStepLabel() { return photo.total > 1 ? `（${photo.total - photo.queue.length}/${photo.total}枚目）` : ''; }
  async function nextPhoto() {
    const file = photo.queue.shift();
    if (!file) { photo.cur = null; closeModal(); return; }
    photo.cur = null; photo.busy = true;
    openModal(`${modalHead('手書きを読み取り中' + photoStepLabel())}<div class="photo-loading"><div class="photo-thumb skeleton"></div><p class="muted"><span class="dots"><i></i><i></i><i></i></span> Gemini で文字を書き起こしています…</p></div>`, { onClose: () => { photo.queue = []; photo.cur = null; } });
    let thumb = '';
    try {
      const img = await compressImage(file);
      thumb = img.thumb;
      const t = $('.photo-loading .photo-thumb'); if (t) t.outerHTML = `<img class="photo-thumb" src="${img.thumb}" alt="選んだ写真">`;
      const reply = await callGemini([{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: img.full.split(',')[1] } }, { text: PHOTO_PROMPT.replace('TODAY', todayStr()) }] }], { json: true, temperature: 0.1, maxTokens: 4096 });
      if (backdrop.hidden) return; // 途中で閉じた
      photo.cur = { thumb, name: file.name, file, ...parsePhotoResult(reply) };
      photo.busy = false;
      openPhotoReview();
    } catch (e) {
      photo.busy = false;
      if (backdrop.hidden) return;
      openModal(`${modalHead('読み取れませんでした' + photoStepLabel())}${thumb ? `<img class="photo-thumb" src="${thumb}" alt="選んだ写真">` : ''}<p class="error-text">⚠️ ${esc(e.message || e)}</p>
        <div class="btn-row end">${photo.queue.length ? '<button class="btn ghost" data-action="photoSkip">次の写真へ</button>' : '<button class="btn ghost" data-action="closeModal">閉じる</button>'}</div>`, { onClose: () => { photo.queue = []; } });
    }
  }
  function openPhotoReview() {
    const c = photo.cur; if (!c) return;
    const existing = new Set(state.items.map((i) => norm(i.title)));
    const quadHtml = c.quads ? `<div class="field photo-quads"><span class="field-label">マトリクスを検出しました</span>
        <div class="quad-mini">${['q1', 'q2', 'q3', 'q4'].map((q) => `<div class="qm ${q}"><b>${QUADRANTS[q].label}</b>${c.quads[q].length ? `<ul>${c.quads[q].map((t) => `<li class="${existing.has(norm(t)) ? 'exists' : ''}">${esc(t)}${existing.has(norm(t)) ? '<small>（登録済み）</small>' : ''}</li>`).join('')}</ul>` : '<p class="muted small">なし</p>'}</div>`).join('')}</div>
        <button type="button" class="btn soft small" data-action="photoApplyMatrix" ${c.quadsApplied ? 'disabled' : ''}>${c.quadsApplied ? '✓ マトリクスに反映済み' : '▦ マトリクスに反映'}</button></div>` : '';
    const newTasks = c.tasks.filter((t) => !existing.has(norm(t)) && !(c.quads && Object.values(c.quads).some((a) => a.some((x) => norm(x) === norm(t)))));
    const taskHtml = newTasks.length ? `<div class="field"><span class="field-label">文中のタスク（チェックしたものを「未整理」に追加）</span><div class="link-list">${newTasks.map((t) => `<label class="link-opt"><input type="checkbox" name="task" value="${esc(t)}"><span>${esc(t)}</span></label>`).join('')}</div></div>` : '';
    openModal(`${modalHead('読み取り結果を確認' + photoStepLabel())}
      <form data-form="photoJournal" class="photo-review">
        <img class="photo-thumb" src="${c.thumb}" alt="読み取った写真" data-action="photoZoom">
        <p class="muted small">内容を確認・修正してから保存してください。写真は、下のチェックを入れたときだけジャーナルに添付します。</p>
        <label class="check-line"><input type="checkbox" name="keepPhoto" value="1"> <span>この写真もジャーナルに添付する</span></label>
        <label class="field"><span class="field-label">日付${c.date ? '<small class="ok-text">（ページの日付を検出）</small>' : ''}</span><input type="date" name="date" value="${esc(c.date || todayStr())}" required></label>
        <div class="field"><span class="field-label">気分（任意）</span><div class="mood-pick">${[1, 2, 3, 4, 5].map((n) => `<label title="${MOOD_LABEL[n]}"><input type="radio" name="mood" value="${n}"><span>${MOODS[n]}<small>${n}</small></span></label>`).join('')}</div></div>
        <label class="field"><span class="field-label">書き起こし</span><textarea name="text" rows="10">${esc(c.text)}</textarea></label>
        ${quadHtml}${taskHtml}
        <div class="btn-row between"><button type="button" class="btn ghost" data-action="${photo.queue.length ? 'photoSkip' : 'closeModal'}">${photo.queue.length ? 'この写真はスキップ' : 'キャンセル'}</button><button class="btn primary" type="submit">保存${photo.queue.length ? 'して次へ' : ''}</button></div>
      </form>`, { onClose: () => { photo.queue = []; photo.cur = null; } });
  }
  function photoApplyMatrix() {
    const c = photo.cur; if (!c || !c.quads) return;
    const snap = snapshot();
    const existing = new Set(state.items.map((i) => norm(i.title)));
    let added = 0; let skipped = 0; const t = nowIso();
    ['q1', 'q2', 'q3', 'q4'].forEach((q) => c.quads[q].forEach((title) => {
      if (existing.has(norm(title))) { skipped++; return; }
      existing.add(norm(title));
      state.items.unshift(normItem({ title: trunc(title, 120), list: 'task', quadrant: q, importance: q === 'q1' || q === 'q2' ? 'high' : 'mid', source: 'photo', createdAt: t, updatedAt: t }));
      added++;
    }));
    save(); c.quadsApplied = true;
    // フォームの入力内容を保ったまま、ボタンだけ更新
    const b = $('[data-action=photoApplyMatrix]'); if (b) { b.disabled = true; b.textContent = '✓ マトリクスに反映済み'; }
    toast(`マトリクスに ${added}件 追加${skipped ? `（登録済み ${skipped}件 はスキップ）` : ''}`, added ? { label: '元に戻す', run: () => { restore(snap); c.quadsApplied = false; if (b) { b.disabled = false; b.textContent = '▦ マトリクスに反映'; } rerender(); } } : undefined);
  }
  function submitPhotoJournal(form) {
    const fd = new FormData(form);
    const text = String(fd.get('text') || '').trim();
    if (!text) { toast('内容が空です'); return; }
    const date = isDateStr(String(fd.get('date'))) ? String(fd.get('date')) : todayStr();
    const dup = state.journal.some((e) => e.date === date && e.text.trim() === text);
    const entry = dup ? null : normJournal({ date, text, mood: Number(fd.get('mood')) || 0, source: 'photo' });
    if (entry) state.journal.push(entry);
    const file = photo.cur && photo.cur.file;
    if (entry && file && fd.get('keepPhoto')) {
      makePhotoRecord(file).then((rec) => photoPut(rec).then(() => {
        const e = state.journal.find((x) => x.id === entry.id); if (!e) { photoDel(rec.id).catch(() => {}); return; }
        e.photos = [...e.photos, rec.id]; e.updatedAt = nowIso(); save(); rerenderSoft();
      })).catch((err) => toast('⚠️ 写真を添付できませんでした：' + (err.message || err)));
    }
    const t = nowIso(); let nt = 0;
    fd.getAll('task').map(String).forEach((title) => { if (!state.items.some((i) => norm(i.title) === norm(title))) { state.items.unshift(normItem({ title: trunc(title, 120), list: 'inbox', source: 'photo', createdAt: t, updatedAt: t })); nt++; } });
    save(); rerender();
    toast(dup ? '同じ内容のジャーナルが既にあるため、保存しませんでした' : `ジャーナルを保存しました${nt ? `（未整理に ${nt}件 追加）` : ''}`);
    if (photo.queue.length) nextPhoto(); else { photo.cur = null; closeModal(); }
  }

  // ───────────────────────── ジャーナルの写真（v1.3.1） ─────────────────────────
  // 画像本体はこの端末の IndexedDB（lifeplan-photos）に保存し、state のジャーナルには写真の id だけを持たせる。
  // GitHub 同期中は、非公開のデータリポジトリの data/photos/<id>.jpg に1枚ずつ保存（公開リポジトリには保存しない）。
  // 他の端末では、id はあるのに本体が無い写真を GitHub から読み込む。削除は「photo:<id>」の削除記録で全端末に伝える。
  const PHOTO_MAX = 1280; const PHOTO_Q = 0.7; const PHOTO_THUMB = 360; const PHOTO_LIMIT = 12;
  const PHOTO_GRACE = 120000; // 削除してから実際に消すまでの猶予（「元に戻す」のため）
  let photoDbP = null;
  function photoDb() {
    if (photoDbP) return photoDbP;
    photoDbP = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('この端末では写真を保存できません')); return; }
      const rq = indexedDB.open('lifeplan-photos', 1);
      rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' }); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error || new Error('写真の保存領域を開けませんでした'));
    });
    photoDbP.catch(() => { photoDbP = null; });
    return photoDbP;
  }
  async function idbDo(mode, fn) {
    const db = await photoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', mode); const rq = fn(tx.objectStore('photos')); let val;
      if (rq) rq.onsuccess = () => { val = rq.result; };
      tx.oncomplete = () => resolve(val);
      tx.onerror = () => reject(tx.error || new Error('写真を保存できませんでした'));
      tx.onabort = () => reject(tx.error || new Error('写真を保存できませんでした（容量不足の可能性）'));
    });
  }
  const photoGet = (id) => idbDo('readonly', (st) => st.get(id));
  const photoPut = (rec) => idbDo('readwrite', (st) => st.put(rec));
  const photoDel = (id) => idbDo('readwrite', (st) => st.delete(id));
  const photoAll = () => idbDo('readonly', (st) => st.getAll());
  function dataUrlBytes(u) { const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length); for (let k = 0; k < b.length; k++) a[k] = b.charCodeAt(k); return a; }
  function bytesB64(bytes) { let bin = ''; for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000)); return btoa(bin); }
  function b64Bytes(b64) { const bin = atob(String(b64).replace(/\s/g, '')); const a = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k); return a; }
  // 長い辺 1280px・JPEG 品質 0.7 に縮小（手書き読み取りと同じ loadImageFile / drawScaled を使う）
  async function makePhotoRecord(file, id = uid()) {
    const { img, done } = await loadImageFile(file);
    try {
      return { id, full: dataUrlBytes(drawScaled(img, PHOTO_MAX, PHOTO_Q)).buffer, thumb: dataUrlBytes(drawScaled(img, PHOTO_THUMB, 0.72)).buffer, createdAt: nowIso(), synced: false };
    } finally { done(); }
  }
  async function recordFromBytes(id, bytes) {
    const { img, done } = await loadImageFile(new Blob([bytes], { type: 'image/jpeg' }));
    try { return { id, full: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), thumb: dataUrlBytes(drawScaled(img, PHOTO_THUMB, 0.72)).buffer, createdAt: nowIso(), synced: true }; } finally { done(); }
  }
  const photoUrls = new Map(); // id → { thumb, full }（blob: URL）
  function photoUrl(rec, kind) {
    let c = photoUrls.get(rec.id); if (!c) { c = {}; photoUrls.set(rec.id, c); }
    if (!c[kind]) c[kind] = URL.createObjectURL(new Blob([rec[kind]], { type: 'image/jpeg' }));
    return c[kind];
  }
  function forgetPhotoUrl(id) { const c = photoUrls.get(id); if (c) { Object.values(c).forEach((u) => URL.revokeObjectURL(u)); photoUrls.delete(id); } }
  const cachedThumb = (id) => (photoUrls.get(id) || {}).thumb || '';
  // サムネイルの並び（editable：編集画面の「外す」ボタン付き）
  function photoThumbs(ids, entryId, editable) {
    if (!ids || !ids.length) return '';
    return `<div class="j-photos">${ids.map((id) => `<div class="j-photo${cachedThumb(id) ? '' : ' loading'}"><button type="button" class="j-photo-view" data-action="viewPhoto" data-photo-id="${id}" data-entry="${editable ? '' : entryId || ''}" aria-label="写真を大きく表示"><img data-photo="${id}" alt="" ${cachedThumb(id) ? `src="${cachedThumb(id)}"` : ''}></button>${editable ? `<button type="button" class="j-photo-del" data-action="removeEditorPhoto" data-photo-id="${id}" aria-label="この写真を外す">×</button>` : ''}</div>`).join('')}</div>`;
  }
  async function hydratePhotos(root = document) {
    const imgs = $$('img[data-photo]:not([src])', root);
    if (!imgs.length) return;
    let missing = 0;
    for (const im of imgs) {
      const box = im.closest('.j-photo');
      try {
        const rec = await photoGet(im.dataset.photo);
        if (rec) { im.src = photoUrl(rec, 'thumb'); if (box) box.classList.remove('loading', 'missing'); } else { missing++; if (box) { box.classList.remove('loading'); box.classList.add('missing'); } }
      } catch (e) { if (box) { box.classList.remove('loading'); box.classList.add('missing'); } }
    }
    if (missing && sync.connected && sync.token && navigator.onLine) photoSyncSoon(300);
  }
  const referencedPhotos = () => new Set(state.journal.flatMap((e) => e.photos || []));
  function tombPhoto(id) { state.deleted['photo:' + id] = nowIso(); }

  // 拡大表示
  async function viewPhoto(id, entryId) {
    let rec = null; try { rec = await photoGet(id); } catch (e) { /* noop */ }
    if (!rec) {
      if (sync.connected && sync.token) { toast('写真を GitHub から読み込んでいます…'); await syncPhotos(); try { rec = await photoGet(id); } catch (e) { /* noop */ } }
      if (!rec) { toast(sync.connected ? '写真を読み込めませんでした。少し待ってからもう一度お試しください' : 'この端末には写真がありません（GitHub 同期をすると他の端末の写真も見られます）'); return; }
    }
    const old = $('#photoViewer'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'photoViewer'; el.className = 'photo-viewer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '写真');
    el.innerHTML = `<img class="pv-img" src="${photoUrl(rec, 'full')}" alt="ジャーナルの写真"><div class="pv-bar"><button type="button" class="btn soft small" data-pv="close">閉じる</button>${entryId ? '<button type="button" class="btn danger small" data-pv="del">🗑 この写真を削除</button>' : ''}</div>`;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-pv]'); close(); if (b && b.dataset.pv === 'del') deleteEntryPhoto(entryId, id); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
  }
  async function deleteEntryPhoto(entryId, id) {
    const e = state.journal.find((x) => x.id === entryId);
    if (!e || !e.photos.includes(id)) return;
    if (!(await confirmDialog('この写真をジャーナルから削除しますか？（GitHub 同期中は他の端末からも消えます）', '削除する', true))) return;
    const snap = snapshot();
    e.photos = e.photos.filter((p) => p !== id); e.updatedAt = nowIso(); tombPhoto(id);
    save(); rerender(); undoable('写真を削除しました', snap);
    setTimeout(() => photoGc(), PHOTO_GRACE + 1000);
  }

  // 編集画面の写真（保存するまでは確定しない）
  const jEdit = { photos: [], added: [], saved: false, busy: 0 };
  function startJournalEdit(e) { jEdit.photos = e ? [...e.photos] : []; jEdit.added = []; jEdit.saved = false; jEdit.busy = 0; }
  function endJournalEdit() {
    if (!jEdit.saved) jEdit.added.forEach((id) => { photoDel(id).catch(() => {}); forgetPhotoUrl(id); });
    jEdit.added = [];
  }
  function refreshEditorPhotos() {
    const box = $('#jPhotoBox', modalBox); if (!box) return;
    box.innerHTML = photoThumbs(jEdit.photos, '', true) + (jEdit.busy ? `<p class="muted small"><span class="dots"><i></i><i></i><i></i></span> 写真を縮小しています…（${jEdit.busy}枚）</p>` : '');
    const c = $('#jPhotoCount', modalBox); if (c) c.textContent = jEdit.photos.length ? `${jEdit.photos.length}枚` : '';
    hydratePhotos(box);
  }
  async function addEditorPhotos(files) {
    files = [...files].filter((f) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) { toast('画像ファイルを選んでください'); return; }
    const room = PHOTO_LIMIT - jEdit.photos.length;
    if (room <= 0) { toast(`写真は1件につき${PHOTO_LIMIT}枚までです`); return; }
    if (files.length > room) { toast(`写真は1件につき${PHOTO_LIMIT}枚までです（${room}枚だけ追加します）`); files = files.slice(0, room); }
    jEdit.busy += files.length; refreshEditorPhotos();
    let failed = '';
    for (const f of files) {
      try {
        const rec = await makePhotoRecord(f);
        await photoPut(rec);
        if (backdrop.hidden || !$('#jPhotoBox', modalBox)) { photoDel(rec.id).catch(() => {}); continue; } // 途中で閉じた
        photoUrl(rec, 'thumb');
        jEdit.photos.push(rec.id); jEdit.added.push(rec.id);
      } catch (e) { failed = e.message || String(e); }
      jEdit.busy--; refreshEditorPhotos();
    }
    if (failed) toast('⚠️ ' + failed);
  }
  function removeEditorPhoto(id) { jEdit.photos = jEdit.photos.filter((p) => p !== id); refreshEditorPhotos(); }
  // 保存時に呼ぶ：外した写真に削除記録をつけ、新しい写真の削除記録は消す
  function commitEditorPhotos(prev) {
    jEdit.saved = true;
    const now = new Set(jEdit.photos);
    (prev || []).forEach((id) => { if (!now.has(id)) tombPhoto(id); });
    jEdit.photos.forEach((id) => { delete state.deleted['photo:' + id]; });
    return [...jEdit.photos];
  }

  // GitHub（非公開データリポジトリ）との写真の同期
  const PHOTO_SYNC_KEY = 'lifeplan.photoSync';
  function loadPs() { try { return { repo: '', private: null, gone: [], lastError: '', lastAt: '', ...JSON.parse(localStorage.getItem(PHOTO_SYNC_KEY) || '{}') }; } catch (e) { return { repo: '', private: null, gone: [], lastError: '', lastAt: '' }; } }
  const ps = loadPs();
  function savePs() { ps.gone = ps.gone.slice(-500); try { localStorage.setItem(PHOTO_SYNC_KEY, JSON.stringify(ps)); } catch (e) { /* noop */ } }
  function photoPath(id) { const p = sync.path.split('/'); p.pop(); return (p.length ? p.join('/') + '/' : '') + 'photos/' + id + '.jpg'; }
  async function photoRepoIsPrivate() {
    const key = `${sync.owner}/${sync.repo}`;
    if (ps.repo === key && ps.private != null) return ps.private;
    const res = await gh(ghUrl(''));
    if (!res.ok) throw await ghError(res);
    const j = await res.json();
    ps.repo = key; ps.private = j.private === true; savePs();
    return ps.private;
  }
  async function ghGetBinary(path) {
    const url = contentsUrl(path) + '?ref=' + encodeURIComponent(sync.branch);
    const res = await gh(url);
    if (res.status === 404) return null;
    if (!res.ok) throw await ghError(res);
    const j = await res.json();
    if (j.encoding === 'base64' && j.content) return b64Bytes(j.content);
    const r2 = await gh(url, {}, 'application/vnd.github.raw+json');
    if (!r2.ok) throw await ghError(r2);
    return new Uint8Array(await r2.arrayBuffer());
  }
  async function ghPutBinary(path, bytes, message) {
    const res = await gh(contentsUrl(path), { method: 'PUT', body: JSON.stringify({ message, content: bytesB64(bytes), branch: sync.branch }) });
    if (res.status === 422) return; // すでにある（他の端末が保存済み）
    if (!res.ok) throw await ghError(res);
  }
  async function ghDeleteFile(path, message) {
    const res = await gh(contentsUrl(path) + '?ref=' + encodeURIComponent(sync.branch));
    if (res.status === 404) return;
    if (!res.ok) throw await ghError(res);
    const j = await res.json();
    const d = await gh(contentsUrl(path), { method: 'DELETE', body: JSON.stringify({ message, sha: j.sha, branch: sync.branch }) });
    if (!d.ok && d.status !== 404) throw await ghError(d);
  }
  // 使われなくなった写真（削除記録あり・猶予後）を端末から消す
  async function photoGc() {
    try {
      const refs = referencedPhotos(); const t = Date.now();
      for (const r of await photoAll()) {
        const del = state.deleted['photo:' + r.id];
        if (del && !refs.has(r.id) && t - new Date(del).getTime() >= PHOTO_GRACE) { await photoDel(r.id); forgetPhotoUrl(r.id); }
      }
    } catch (e) { /* noop */ }
  }
  let photoSyncing = null; let photoTimer = null;
  function photoSyncSoon(ms = 1500) { if (!sync.connected || !sync.token) return; clearTimeout(photoTimer); photoTimer = setTimeout(() => { syncPhotos(); }, ms); }
  async function syncPhotos() {
    if (photoSyncing) return photoSyncing;
    photoSyncing = (async () => {
      const r = { up: 0, down: 0, del: 0, error: '' };
      if (!sync.connected || !sync.token || !navigator.onLine) return r;
      try {
        const refs = referencedPhotos(); const t = Date.now();
        const local = new Map((await photoAll()).map((x) => [x.id, x]));
        // 1) 削除記録のある写真を消す（猶予後）
        for (const [k, at] of Object.entries(state.deleted)) {
          if (!k.startsWith('photo:')) continue;
          const id = k.slice(6);
          if (refs.has(id) || t - new Date(at).getTime() < PHOTO_GRACE || !PHOTO_ID_RE.test(id)) continue;
          if (local.has(id)) { await photoDel(id); forgetPhotoUrl(id); local.delete(id); }
          if (!ps.gone.includes(id)) { await ghDeleteFile(photoPath(id), 'ライフプラン：写真を削除'); ps.gone.push(id); savePs(); r.del++; }
        }
        // 2) まだ送っていない写真を送る（非公開リポジトリのときだけ）
        const up = [...local.values()].filter((x) => !x.synced && refs.has(x.id));
        if (up.length) {
          if (!(await photoRepoIsPrivate())) r.error = `${sync.owner}/${sync.repo} は公開リポジトリのため、写真は GitHub に保存しません（この端末にだけ保存）`;
          else for (const x of up) { await ghPutBinary(photoPath(x.id), new Uint8Array(x.full), `ライフプラン：写真 ${hhmm(nowIso())}`); x.synced = true; await photoPut(x); r.up++; }
        }
        // 3) この端末に無い写真を読み込む
        for (const id of refs) {
          if (local.has(id) || state.deleted['photo:' + id]) continue;
          const bytes = await ghGetBinary(photoPath(id));
          if (!bytes) continue;
          await photoPut(await recordFromBytes(id, bytes)); r.down++;
        }
        if (r.down) hydratePhotos();
      } catch (e) { r.error = e.message || String(e); }
      ps.lastError = r.error; ps.lastAt = nowIso(); savePs();
      return r;
    })();
    try { return await photoSyncing; } finally { photoSyncing = null; }
  }

  // ───────────────────────── ジャーナル：Obsidian（.md / .txt）から取り込み ─────────────────────────
  function parseNote(raw, fileName = '', lastModified = 0) {
    let text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    let date = '';
    const fm = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    if (fm) {
      const m = fm[1].match(/^\s*(?:date|created|day|日付)\s*:\s*["']?([^"'\n]+)/im);
      if (m) date = normDetectedDate(m[1]);
      text = text.slice(fm[0].length);
    }
    const fromMeta = !!date;
    if (!date && fileName) date = normDetectedDate(fileName.replace(/\.(md|txt|markdown)$/i, '')) || (() => { const m = fileName.match(/(\d{4})(\d{2})(\d{2})/); return m ? normDetectedDate(`${m[1]}-${m[2]}-${m[3]}`) : ''; })();
    if (!date && lastModified) date = todayStr(new Date(lastModified));
    text = text.trim();
    // 先頭の見出しが日付だけなら省く（例：# 2026-11-01）
    const h = text.match(/^#{1,6}\s*([^\n]*)\n?/);
    if (h && normDetectedDate(h[1]) && h[1].replace(/[\d\s\-/.年月日()（）月火水木金土日曜]/g, '') === '') text = text.slice(h[0].length).trim();
    return { date: date || todayStr(), text, fromMeta };
  }
  function importNotes(notes) {
    const snap = snapshot();
    let added = 0; let dup = 0; let empty = 0;
    notes.forEach((n) => {
      if (!n.text) { empty++; return; }
      if (state.journal.some((e) => e.date === n.date && e.text.trim() === n.text.trim())) { dup++; return; }
      state.journal.push(normJournal({ date: n.date, text: n.text, mood: 0, source: 'obsidian' }));
      added++;
    });
    if (added) save();
    const msg = `${added}件 取り込みました${dup ? `・重複 ${dup}件 はスキップ` : ''}${empty ? `・空のファイル ${empty}件` : ''}`;
    return { added, dup, empty, msg, snap };
  }
  function openObsidianImport() {
    openModal(`${modalHead('Obsidianから取り込む')}
      <p class="small">Obsidian のノート（<b>.md</b> / <b>.txt</b>）を選ぶと、1ファイル＝1件のジャーナルとして取り込みます。複数選択できます。</p>
      <ul class="small muted note-list"><li>日付は「フロントマターの date:」→「ファイル名（例：2026-11-01.md）」→「ファイルの更新日」の順に決めます。</li><li>フロントマター（--- で囲まれた部分）は取り除きます。同じ日付・同じ内容は重複として飛ばします。</li></ul>
      <div class="btn-row"><button type="button" class="btn primary" data-action="obsidianPick">📂 ファイルを選ぶ</button></div>
      <input type="file" id="obsidianInput" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple hidden data-change="obsidianFiles">
      <hr class="sep">
      <form data-form="obsidianPaste">
        <label class="field"><span class="field-label">または、ノートの本文を貼り付け</span><textarea name="text" rows="6" placeholder="Obsidian でコピーした本文（フロントマター付きでもOK）"></textarea></label>
        <label class="field"><span class="field-label">日付（フロントマターに date があればそちらを優先）</span><input type="date" name="date" value="${todayStr()}"></label>
        <div class="btn-row end"><button type="button" class="btn ghost" data-action="closeModal">閉じる</button><button class="btn primary" type="submit">取り込む</button></div>
      </form>`);
  }
  async function importObsidianFiles(files) {
    files = [...files].filter((f) => /\.(md|markdown|txt)$/i.test(f.name) || /^text\//.test(f.type));
    if (!files.length) { toast('.md / .txt ファイルを選んでください'); return; }
    const notes = [];
    for (const f of files) { try { notes.push(parseNote(await f.text(), f.name, f.lastModified)); } catch (e) { /* 読めないファイルは飛ばす */ } }
    const r = importNotes(notes);
    closeModal(); rerender();
    toast('📝 ' + r.msg, r.added ? { label: '元に戻す', run: () => { restore(r.snap); rerender(); } } : undefined);
  }
  function submitObsidianPaste(form) {
    const fd = new FormData(form);
    const raw = String(fd.get('text') || '');
    if (!raw.trim()) { toast('本文を貼り付けてください'); return; }
    const n = parseNote(raw);
    if (!n.fromMeta) n.date = isDateStr(String(fd.get('date'))) ? String(fd.get('date')) : todayStr();
    const r = importNotes([n]);
    closeModal(); rerender();
    toast('📝 ' + r.msg, r.added ? { label: '元に戻す', run: () => { restore(r.snap); rerender(); } } : undefined);
  }

  // ───────────────────────── v1.4.0：毎日の AI 分析と「AI提案」 ─────────────────────────
  // ・分析（state.aiAnalyses）は1日1件（id 'ana:YYYY-MM-DD'）。同期して AIコーチも読めるようにする
  // ・提案（state.aiSuggestions）は自分のタスクとは別のリスト。Gemini（source 'gemini'）とコーチ受信箱（source 'coach'）の両方が入る
  //   自分のリストへ移すのはユーザーが「→ 自分のリストへ」を押したとき（設定でオンにしたときだけ自動）
  // ・APIキーは localStorage（lifeplan.ai）だけ。送り先は Google の Gemini API だけ
  const AI_DAILY_KEY = 'lifeplan.aiDaily';
  const AI_MANUAL_MAX = 3; // 「もう一度分析」は1日3回まで
  const AI_SUG_MAX = 3;
  const AI_ANALYSIS_KEEP = 30;
  function loadAiDaily() { try { const o = JSON.parse(localStorage.getItem(AI_DAILY_KEY) || '{}'); return { autoDate: String(o.autoDate || ''), runDate: String(o.runDate || ''), runs: Number(o.runs) || 0, collapsed: !!o.collapsed }; } catch (e) { return { autoDate: '', runDate: '', runs: 0, collapsed: false }; } }
  let aiDaily = loadAiDaily();
  function saveAiDaily() { try { localStorage.setItem(AI_DAILY_KEY, JSON.stringify(aiDaily)); } catch (e) { /* noop */ } }
  const aiDailyOn = () => ai.daily !== false; // 既定オン
  const aiAutoMoveOn = () => ai.autoMove === true; // 既定オフ
  const manualLeft = () => AI_MANUAL_MAX - (aiDaily.runDate === todayStr() ? aiDaily.runs : 0);
  const anaUi = { busy: false, error: '' };
  const openSuggestions = () => state.aiSuggestions.filter((s) => s.status === 'open');
  const latestAnalysis = () => [...state.aiAnalyses].sort((a, b) => b.date.localeCompare(a.date))[0] || null;

  // 分析用の小さな要約（トークンを節約）
  function analysisContext() {
    const L = [];
    const t = todayStr();
    L.push(`今日：${t}（${'日月火水木金土'[new Date().getDay()]}）`);
    const focus = state.focus[thisYear()] || '';
    if (focus) L.push(`今年のフォーカス：${trunc(focus, 60)}`);
    const act = activeItems().filter((i) => i.list !== 'inbox' || i.title);
    const qOrder = { q1: 0, q2: 1, q3: 2, q4: 3, '': 4 };
    const items = [...act].sort((a, b) => qOrder[a.quadrant] - qOrder[b.quadrant] || (isStuck(b) - isStuck(a)) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
    L.push(`## 未完了（${act.length}件）`);
    items.forEach((i) => {
      const meta = [i.quadrant || '-', i.list, i.status, `${idleDays(i)}日前に更新`, isStuck(i) ? '停滞' : '', i.steps.length ? `ステップ${stepsDone(i)}/${i.steps.length}` : '', i.targetDate ? `期限${i.targetDate}` : ''].filter(Boolean).join(',');
      const next = (i.steps.find((s) => !s.done) || {}).text;
      L.push(`- ${trunc(i.title, 36)}[${meta}]${next ? ` 次:${trunc(next, 24)}` : ''}`);
    });
    const doneRecent = state.items.filter((i) => i.status === 'done' && i.completedAt && daysSince(i.completedAt) <= 7).slice(0, 8);
    if (doneRecent.length) L.push(`## 直近7日の完了：${doneRecent.map((i) => trunc(i.title, 20)).join('、')}`);
    if (state.habits.length) {
      L.push('## 習慣スタンプ');
      state.habits.slice(0, 8).forEach((h) => {
        const p = pomuInfo(h); const w = addDays(t, -14);
        const o = h.done.filter((d) => d >= w && d < t).length; const x = (h.missed || []).filter((d) => d >= w && d < t).length;
        L.push(`- ${trunc(h.name, 20)}：累計${p.total}日・連続${p.streak}日・直近14日 〇${o}×${x}・今日${p.doneToday ? '〇' : p.missedToday ? '×' : '未'}`);
      });
    }
    const ls = state.lessons.filter((l) => l.status === 'active' || l.status === 'considering').slice(0, 6);
    if (ls.length) { L.push('## 習い事'); ls.forEach((l) => L.push(`- ${trunc(l.name, 20)}：${LESSON_STATUS[l.status]}・今月${sessionsThisMonth(l)}回`)); }
    const since = addDays(t, -14);
    const j = state.journal.filter((e) => e.date >= since && e.text.trim()).sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt)).slice(-12);
    if (j.length) { L.push('## 直近14日のジャーナル'); j.forEach((e) => L.push(`- ${e.date}${e.mood ? ` 気分${e.mood}` : ''}：${trunc(e.text.replace(/\s+/g, ' '), 110)}`)); }
    const cdc = countdownContext(); if (cdc) L.splice(1, 0, cdc);
    const s = L.join('\n');
    return s.length > 4500 ? s.slice(0, 4500) + '\n…' : s;
  }
  const ANALYSIS_SYSTEM = [
    'あなたは「ライフプラン」アプリの毎日の分析を担当する、あたたかく誠実なパーソナルコーチです。日本語で答えます。',
    'ユーザーのデータ（要約）を読み、今日の分析を次の JSON だけで返してください（コードブロックや説明文は不要）：',
    '{"summary": "2〜4文。やさしいコーチの口調で、今の状況と今日の一歩", "insights": ["気づき（最大3つ・各60字以内）"], "taskSuggestions": [{"title": "新しいタスク名（30字以内）", "quadrant": "q1|q2|q3|q4", "why": "なぜ今これか（60字以内）", "steps": ["5〜30分でできるステップ", "…"]}]}',
    'quadrant は必ず q1（緊急かつ重要）・q2（重要だが緊急でない）・q3（緊急だが重要でない）・q4（どちらでもない）のどれか。taskSuggestions は最大3件、steps は2〜5個。',
    '既存のタスクと同じ・ほぼ同じものは提案しないでください（既存タスクの次の一歩は steps ではなく summary で触れてください）。責めずに、小さく始められる提案を。',
  ].join('\n');
  function normSuggestion(s, extra = {}) {
    if (!s || typeof s !== 'object') return null;
    const title = trunc(String(s.title || s.taskTitle || s.task || '').replace(/\s+/g, ' ').trim(), 80);
    if (!title) return null;
    const q = String(s.quadrant || '').trim().toLowerCase();
    return {
      title, quadrant: QUADRANTS[q] ? q : 'q2', why: trunc(String(s.why || s.reason || '').trim(), 240),
      steps: (Array.isArray(s.steps) ? s.steps : []).map((x) => trunc(String(typeof x === 'object' && x ? x.text || x.title || '' : x).replace(/^\s*\d+\s*[.)．、]\s*/, '').trim(), 100)).filter(Boolean).slice(0, 10),
      ...extra,
    };
  }
  // Gemini の返事を読み取る（コードブロックを外す／読めなければ文章だけ）
  function parseAnalysis(text) {
    const raw = String(text || '').trim();
    const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let o = null;
    try { o = JSON.parse(unfenced); } catch (e) { o = extractJson(raw); }
    if (o && Array.isArray(o)) o = o[0];
    if (o && typeof o === 'object' && (o.summary || o.insights || o.taskSuggestions)) {
      return {
        ok: true, summary: trunc(String(o.summary || '').trim(), 600),
        insights: (Array.isArray(o.insights) ? o.insights : []).map((x) => trunc(String(x || '').trim(), 160)).filter(Boolean).slice(0, 3),
        suggestions: (Array.isArray(o.taskSuggestions) ? o.taskSuggestions : []).map((x) => normSuggestion(x)).filter(Boolean),
      };
    }
    const plain = unfenced.replace(/[{}[\]"]/g, ' ').replace(/\s+/g, ' ').trim();
    return { ok: false, summary: trunc(plain || '（分析を読み取れませんでした）', 600), insights: [], suggestions: [] };
  }
  // 既存のタスク・まだ開いている提案と同じものは入れない
  function dedupeSuggestions(list) {
    const seen = new Set([...state.items.filter((i) => i.status !== 'done').map((i) => norm(i.title)), ...openSuggestions().map((s) => norm(s.title))]);
    const out = [];
    list.forEach((s) => {
      const n = norm(s.title);
      if (!n || seen.has(n)) return;
      if ([...seen].some((x) => x.length > 3 && n.length > 3 && (x.includes(n) || n.includes(x)))) return;
      seen.add(n); out.push(s);
    });
    return out;
  }
  // 提案を AI提案リストに入れる（自動で移す設定なら、自分のリストへ）
  function addSuggestions(list, meta) {
    const fresh = dedupeSuggestions(list.map((s, k) => ({ ...s, _id: meta.idPrefix ? `${meta.idPrefix}:${k}` : uid() })));
    const now = nowIso();
    const made = fresh.map((s) => normAiSuggestion({ ...s, id: s._id, source: meta.source, ref: meta.ref || '', date: meta.date || todayStr(), status: 'open', createdAt: now, updatedAt: now }));
    const newOnes = made.filter((s) => !state.aiSuggestions.some((x) => x.id === s.id) && !state.deleted[s.id]);
    state.aiSuggestions.push(...newOnes);
    return newOnes;
  }
  function autoMoveIfOn(list) {
    if (!aiAutoMoveOn() || !list.length) return 0;
    const ids = new Set(list.map((s) => s.id));
    list = state.aiSuggestions.filter((s) => ids.has(s.id) && s.status === 'open');
    if (!list.length) return 0;
    const snap = snapshot(); // 元に戻すと「🤖 AI提案」に残る
    list.forEach((s) => moveSuggestionData(s, true));
    save(); rerenderSoft();
    toast(`🤖 AIが ${list.length}件 を自分のリストに移しました`, { label: '元に戻す', run: () => restore(snap) });
    return list.length;
  }
  async function runAnalysis(manual) {
    if (anaUi.busy) return null;
    if (!ai.key) { toast('Gemini の APIキーを設定すると、毎日の分析が使えます'); return null; }
    const t = todayStr();
    if (manual) {
      if (manualLeft() <= 0) { toast(`「もう一度分析」は1日${AI_MANUAL_MAX}回までです。また明日！`); return null; }
      if (aiDaily.runDate !== t) { aiDaily.runDate = t; aiDaily.runs = 0; }
      aiDaily.runs++;
    }
    aiDaily.autoDate = t; saveAiDaily();
    anaUi.busy = true; anaUi.error = ''; rerenderSoft();
    try {
      const text = await callGemini([{ role: 'user', parts: [{ text: '## 毎日の分析\n' + analysisContext() }] }], { system: ANALYSIS_SYSTEM, json: true, maxTokens: 2048, timeoutMs: 60000 });
      const p = parseAnalysis(text);
      const id = 'ana:' + t; const now = nowIso();
      const prev = state.aiAnalyses.find((a) => a.id === id);
      const added = addSuggestions(p.suggestions.slice(0, AI_SUG_MAX), { source: 'gemini', ref: id, date: t });
      const rec = normAnalysis({ id, date: t, summary: p.summary, insights: p.insights, suggestionIds: added.map((s) => s.id), parsed: p.ok, model: ai.model, runs: (prev ? prev.runs : 0) + 1, createdAt: prev ? prev.createdAt : now, updatedAt: now });
      state.aiAnalyses = [...state.aiAnalyses.filter((a) => a.id !== id), rec].sort((a, b) => b.date.localeCompare(a.date)).slice(0, AI_ANALYSIS_KEEP);
      delete state.deleted[id];
      anaUi.busy = false;
      save();
      if (!autoMoveIfOn(added)) { rerenderSoft(); toast(added.length ? `✨ 今日の分析ができました（AI提案 ${added.length}件）` : '✨ 今日の分析ができました'); }
      return rec;
    } catch (e) {
      anaUi.busy = false; anaUi.error = e.message || String(e); rerenderSoft();
      return null;
    }
  }
  // 1日1回（その日に最初に開いたとき）。他の端末で今日の分析が済んでいれば行わない
  async function maybeDailyAnalysis() {
    const t = todayStr();
    if (!ai.key || !aiDailyOn() || !navigator.onLine || aiDaily.autoDate === t || anaUi.busy) return false;
    if (syncing) { try { await syncing; } catch (e) { /* noop */ } }
    if (aiDaily.autoDate === t) return false;
    if (state.aiAnalyses.some((a) => a.date === t)) { aiDaily.autoDate = t; saveAiDaily(); return false; }
    await runAnalysis(false);
    return true;
  }
  // 自分のリストへ（タスク・その象限・ステップつき。source 'ai'）
  function moveSuggestionData(s, auto) {
    const it = addItem({ title: s.title, list: 'task', quadrant: s.quadrant, importance: s.quadrant === 'q1' || s.quadrant === 'q2' ? 'high' : 'mid', notes: s.why ? `🤖 AI提案：${s.why}` : '🤖 AI提案から', steps: s.steps, source: 'ai', sourceKey: s.id });
    s.status = 'moved'; s.itemId = it.id; s.auto = !!auto; s.updatedAt = nowIso();
    return it;
  }
  function moveSuggestion(id) {
    const s = state.aiSuggestions.find((x) => x.id === id);
    if (!s || s.status !== 'open') return;
    const snap = snapshot();
    moveSuggestionData(s, false); save(); rerender();
    toast(`→ 「${trunc(s.title, 18)}」を自分のリスト（${QUADRANTS[s.quadrant].label}）へ移しました`, { label: '元に戻す', run: () => restore(snap) });
  }
  function moveAllSuggestions() {
    const list = openSuggestions();
    if (!list.length) return;
    const snap = snapshot();
    list.forEach((s) => moveSuggestionData(s, false)); save(); rerender();
    toast(`→ ${list.length}件 を自分のリストへ移しました`, { label: '元に戻す', run: () => restore(snap) });
  }
  function dismissSuggestion(id) {
    const s = state.aiSuggestions.find((x) => x.id === id);
    if (!s || s.status !== 'open') return;
    const snap = snapshot();
    s.status = 'dismissed'; s.updatedAt = nowIso(); save(); rerender();
    toast('× 見送りました', { label: '元に戻す', run: () => restore(snap) });
  }
  function reopenSuggestion(id) {
    const s = state.aiSuggestions.find((x) => x.id === id);
    if (!s || s.status !== 'dismissed') return;
    s.status = 'open'; s.updatedAt = nowIso(); save(); rerender(); toast('AI提案に戻しました');
  }
  function setSuggestionQuadrant(id, q) {
    const s = state.aiSuggestions.find((x) => x.id === id);
    if (!s || !QUADRANTS[q]) return;
    s.quadrant = q; s.updatedAt = nowIso(); save(); rerender();
  }
  const SUG_SRC = { gemini: '✨ Gemini', coach: '💬 コーチ' };
  function suggestionCard(s) {
    return `<article class="card sug-card q-${s.quadrant}" data-sug="${s.id}">
      <div class="sug-head"><h3 class="sug-title">${esc(s.title)}</h3><span class="chip src-chip">${SUG_SRC[s.source] || '🤖 AI'}</span></div>
      <label class="sug-q"><span class="muted small">象限</span><select data-change="aiSugQuadrant" data-id="${s.id}" aria-label="象限">${options(Object.fromEntries(Object.entries(QUADRANTS).map(([k, v]) => [k, v.label])), s.quadrant)}</select></label>
      ${s.why || s.steps.length ? `<details class="sug-more"><summary>${s.why ? esc(trunc(s.why, 46)) : 'くわしく'}${s.steps.length ? `<span class="muted small">・ステップ ${s.steps.length}</span>` : ''}</summary>
        ${s.why ? `<p class="sug-why">${esc(s.why)}</p>` : ''}${s.steps.length ? `<ol class="sug-steps">${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}</details>` : ''}
      <div class="btn-row sug-actions"><button class="btn primary small" data-action="aiSugMove" data-id="${s.id}">→ 自分のリストへ</button><button class="icon-btn small" data-action="aiSugDismiss" data-id="${s.id}" aria-label="見送る（×）">×</button></div>
    </article>`;
  }
  function analysisBody(a) {
    return `<p class="ana-summary">${esc(a.summary)}</p>${a.insights.length ? `<ul class="ana-insights">${a.insights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
  }
  // ホームの「✨ 今日の分析」
  // 画面：🤖 AI提案
  function viewAiSuggest() {
    const open = openSuggestions().sort((a, b) => b.date.localeCompare(a.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const out = [sectionHead('🤖 AI提案', `${open.length}件・自分のリストとは別です`, open.length > 1 ? '<button class="btn soft small" data-action="aiSugMoveAll">すべて移動</button>' : '')];
    out.push('<p class="muted small sug-lead">Gemini の毎日の分析と、コーチからの提案がここに届きます。「→ 自分のリストへ」を押したものだけが、あなたのタスク（選んだ象限・ステップつき）になります。</p>');
    const a = latestAnalysis();
    if (a) out.push(`<section class="card ana-mini"><div class="card-head"><h2>✨ ${a.date === todayStr() ? '今日' : fmtShort(a.date)}の分析</h2></div>${analysisBody(a)}</section>`);
    if (!open.length) out.push(emptyState('いまAI提案はありません', ai.key ? '毎日の分析やコーチからの提案が届くと、ここに並びます。' : '設定で Gemini の APIキーを登録すると、毎日の分析とタスクの提案が届きます。', ai.key ? `<button class="btn soft" data-action="anaRerun" ${manualLeft() <= 0 || anaUi.busy ? 'disabled' : ''}>✨ 分析する</button>` : '<a class="btn soft" href="#settings/ai">設定を開く</a>'));
    const byDate = new Map();
    open.forEach((s) => { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); });
    byDate.forEach((list, d) => out.push(`<h3 class="month-head">${fmtDate(d)}<span class="muted small">（${list.length}件）</span></h3>${list.map(suggestionCard).join('')}`));
    const past = state.aiSuggestions.filter((s) => s.status !== 'open').sort((x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || '')).slice(0, 15);
    if (past.length) {
      out.push(`<details class="card sug-past"><summary>これまでの提案（${past.length}件）</summary><ul class="plain-list">${past.map((s) => `<li class="sug-past-row"><span class="chip ${s.status === 'moved' ? 'sync-ok' : ''}">${s.status === 'moved' ? (s.auto ? 'AIが移動' : '移動済み') : '見送り'}</span><span class="grow">${esc(s.title)}</span>${s.status === 'moved' && getItem(s.itemId) ? `<a class="link small" href="#item/${s.itemId}">開く</a>` : ''}${s.status === 'dismissed' ? `<button class="btn ghost small" data-action="aiSugReopen" data-id="${s.id}">戻す</button>` : ''}</li>`).join('')}</ul></details>`);
    }
    return out.join('');
  }
  // 設定（AI連携カードの下）
  function aiDailySettings() {
    return `<div class="ai-daily-set">
      <label class="check-line"><input type="checkbox" data-change="aiDaily" ${aiDailyOn() ? 'checked' : ''}> 毎日の自動分析<span class="muted small">（その日はじめて開いたときに1回）</span></label>
      <label class="check-line"><input type="checkbox" data-change="aiAutoMove" ${aiAutoMoveOn() ? 'checked' : ''}> AI提案を自動で自分のリストに移す<span class="muted small">（オフなら「🤖 AI提案」に並ぶだけ）</span></label>
    </div>`;
  }
  // コーチ受信箱の taskSuggestions（note の id から決まる id なので、どの端末で取り込んでも同じ）
  function ingestCoachTaskSuggestions(noteId, list, date) {
    const norm1 = (Array.isArray(list) ? list : []).map((x) => normSuggestion(x)).filter(Boolean).slice(0, 10);
    return addSuggestions(norm1, { source: 'coach', ref: noteId, date, idPrefix: 'sug:' + noteId });
  }

  // ───────────────────────── ⏳ カウントダウン（v1.5.0） ─────────────────────────
  // 日数は端末のローカル日付（日本なら JST）で数え、0時に切り替わる。
  const CD_EMOJIS = ['🎤', '🎯', '✈️', '🎂', '💍', '🏃', '📝', '🎓', '💼', '🏠', '🎉', '⭐'];
  const getCountdown = (id) => state.countdowns.find((c) => c.id === id);
  const cdDays = (c) => daysUntil(c.date);

  // ── Googleカレンダー直接連携（v1.6.0）：アプリが Google Calendar API を直接読み書きする ──
  // クライアントID・アクセストークンはこの端末の localStorage（lifeplan.gcal）だけに保存し、
  // GitHub 同期・バックアップには含めない（Gemini の APIキーと同じ扱い）。
  // v1.5.0 の中継ファイル（data/calendar.json / calendar-links.json）読みは、未連携時のフォールバックとして残す。
  const CAL_KEY = 'lifeplan.calendar';
  const calUi = { error: '', open: false };
  let cal = (() => { try { const o = JSON.parse(localStorage.getItem(CAL_KEY) || '{}'); return { calendar: o.calendar || null, links: o.links || null, fetchedAt: o.fetchedAt || '', calendars: Array.isArray(o.calendars) ? o.calendars : [], calendarsFetchedAt: o.calendarsFetchedAt || '', listError: o.listError || '', extraEvents: Array.isArray(o.extraEvents) ? o.extraEvents : [], extraRanges: Array.isArray(o.extraRanges) ? o.extraRanges : [], poolFrom: o.poolFrom || '', poolTo: o.poolTo || '' }; } catch (e) { return { calendar: null, links: null, fetchedAt: '', calendars: [], calendarsFetchedAt: '', listError: '', extraEvents: [], extraRanges: [], poolFrom: '', poolTo: '' }; } })();
  const saveCal = () => { try { localStorage.setItem(CAL_KEY, JSON.stringify(cal)); } catch (e) { /* noop */ } };
  const GCAL_KEY = 'lifeplan.gcal';
  // calendar.events（予定の読み書き）＋ calendarlist.readonly（カレンダー一覧：v1.7.0 のカレンダータブ用）
  const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
  const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';
  const GCAL_API = GCAL_BASE + '/calendars/primary/events';
  const GCAL_LIST_API = GCAL_BASE + '/users/me/calendarList';
  const gcalEventsUrl = (cid) => `${GCAL_BASE}/calendars/${encodeURIComponent(cid || 'primary')}/events`;
  let gcal = (() => { try { const o = JSON.parse(localStorage.getItem(GCAL_KEY) || '{}'); return { clientId: String(o.clientId || ''), token: String(o.token || ''), expiresAt: Number(o.expiresAt || 0) }; } catch (e) { return { clientId: '', token: '', expiresAt: 0 }; } })();
  const saveGcal = () => { try { localStorage.setItem(GCAL_KEY, JSON.stringify(gcal)); } catch (e) { /* noop */ } };
  const gcalHasClient = () => !!gcal.clientId;
  const gcalTokenValid = () => !!gcal.token && Date.now() < gcal.expiresAt - 60000;
  const gcalConnected = () => gcalTokenValid();
  let gcalTokenClient = null; let gcalTokenClientFor = ''; let gcalTokenWaiters = [];
  function gcalFlushWaiters(token) { const w = gcalTokenWaiters; gcalTokenWaiters = []; w.forEach((fn) => fn(token || null)); }
  function loadGis() {
    return new Promise((resolve) => {
      const ok = () => !!(window.google && google.accounts && google.accounts.oauth2);
      if (ok()) return resolve(true);
      const started = Date.now();
      const t = setInterval(() => { if (ok()) { clearInterval(t); resolve(true); } else if (Date.now() - started > 8000) { clearInterval(t); resolve(false); } }, 100);
    });
  }
  async function gcalEnsureToken(interactive) {
    if (gcalTokenValid()) return gcal.token;
    if (!gcal.clientId) return null;
    if (!(await loadGis())) { if (interactive) throw new Error('Googleの連携ライブラリを読み込めませんでした（通信状態を確認してください）'); return null; }
    return new Promise((resolve) => {
      gcalTokenWaiters.push(resolve);
      if (gcalTokenWaiters.length > 1) return; // 取得中なら相乗りする
      try {
        if (!gcalTokenClient || gcalTokenClientFor !== gcal.clientId) {
          gcalTokenClientFor = gcal.clientId;
          gcalTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: gcal.clientId, scope: GCAL_SCOPE,
            callback: (resp) => { if (resp && resp.access_token) { gcal.token = resp.access_token; gcal.expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000; saveGcal(); gcalFlushWaiters(gcal.token); } else gcalFlushWaiters(null); },
            error_callback: () => gcalFlushWaiters(null),
          });
        }
        gcalTokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      } catch (e) { gcalFlushWaiters(null); }
    });
  }
  async function gcalApi(url, opts = {}) {
    const token = await gcalEnsureToken(false);
    if (!token) throw new Error('Googleカレンダーと連携していません（設定 → Googleカレンダー連携）');
    let res;
    try { res = await fetch(url, { ...opts, cache: 'no-store', headers: { Authorization: 'Bearer ' + token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } }); }
    catch (e) { const err = new Error('Googleカレンダーに接続できません（ネットワークを確認）'); err.network = true; throw err; }
    if (res.status === 401) { gcal.token = ''; gcal.expiresAt = 0; saveGcal(); throw new Error('Google連携の有効期限が切れました。設定で「Googleと連携する」を押し直してください'); }
    if (!res.ok && res.status !== 404) { let m = ''; try { m = ((await res.json()).error || {}).message || ''; } catch (e) { /* noop */ } throw new Error(`Googleカレンダーエラー（${res.status}）${m}`); }
    return res;
  }
  const gcalEventToLocal = (e, meta = {}) => {
    if (!e || !e.id || e.status === 'cancelled') return null;
    const allDay = !!(e.start && e.start.date);
    const start = allDay ? e.start.date : (e.start && e.start.dateTime) || '';
    const end = allDay ? (e.end && e.end.date) || '' : (e.end && e.end.dateTime) || '';
    if (!start) return null;
    return { id: String(e.id), calendarId: String(meta.calendarId || 'primary'), color: String(meta.color || ''), title: String(e.summary || '（無題の予定）'), start: String(start), end: String(end), allDay, location: String(e.location || ''), description: String(e.description || '') };
  };
  async function gcalListEventsFor(calendarId, timeMin, timeMax, q, meta = {}) {
    const out = []; let pageToken = '';
    for (let page = 0; page < 5; page++) {
      const u = new URL(gcalEventsUrl(calendarId));
      u.searchParams.set('timeMin', timeMin); u.searchParams.set('timeMax', timeMax);
      u.searchParams.set('singleEvents', 'true'); u.searchParams.set('orderBy', 'startTime'); u.searchParams.set('maxResults', '250');
      if (q) u.searchParams.set('q', q);
      if (pageToken) u.searchParams.set('pageToken', pageToken);
      const res = await gcalApi(u.toString());
      if (res.status === 404) break;
      const j = await res.json();
      (j.items || []).forEach((e) => { const l = gcalEventToLocal(e, { calendarId, color: meta.color }); if (l) out.push(l); });
      pageToken = j.nextPageToken || '';
      if (!pageToken) break;
    }
    return out;
  }
  async function gcalListEvents(timeMin, timeMax, q) { return gcalListEventsFor('primary', timeMin, timeMax, q); }
  // カレンダー一覧（calendarList）。失敗したら null（呼び出し側で primary だけにフォールバック）。失敗理由は gcalListErrorMsg に残す
  let gcalListErrorMsg = '';
  async function gcalFetchCalendars() {
    try {
      const out = []; let pageToken = '';
      for (let page = 0; page < 5; page++) {
        const u = new URL(GCAL_LIST_API);
        u.searchParams.set('maxResults', '250');
        if (pageToken) u.searchParams.set('pageToken', pageToken);
        const res = await gcalApi(u.toString());
        if (res.status === 404) break;
        const j = await res.json();
        (j.items || []).forEach((c) => {
          if (!c || !c.id || c.deleted) return;
          out.push({ id: String(c.id), summary: String(c.summaryOverride || c.summary || c.id), color: String(c.backgroundColor || ''), accessRole: String(c.accessRole || 'reader'), primary: !!c.primary, selected: c.selected !== false }); // v1.8.4：色が無いカレンダーは '' のまま保持し、表示時に gevCalColor がパレットから割り当てる
        });
        pageToken = j.nextPageToken || '';
        if (!pageToken) break;
      }
      return out;
    } catch (e) { gcalListErrorMsg = e.message || String(e); return null; }
  }
  const gcalCalendarById = (cid) => (Array.isArray(cal.calendars) ? cal.calendars : []).find((c) => c.id === cid) || null;
  const gcalWritableCal = (c) => !!c && (c.accessRole === 'owner' || c.accessRole === 'writer');
  async function gcalDeleteEvent(gid) {
    if (!gid) return null;
    return gcalApi(GCAL_API + '/' + encodeURIComponent(gid), { method: 'DELETE' }); // 404（すでに無い）は成功扱い
  }
  let calPullTimer = null;
  function pullCalendarSoon() { clearTimeout(calPullTimer); calPullTimer = setTimeout(() => { pullCalendar().catch(() => {}); }, 600); }
  async function gcalUpsertCountdown(c) {
    if (!c || !c.gcal || c.source === 'google') return false;
    const body = { summary: '⏳ ' + c.title, description: c.memo || '', start: { date: c.date }, end: { date: addDays(c.date, 1) } };
    const existing = cdGcalId(c); // v1.5.0 のリンク経由でつながっているものも拾う
    let res;
    if (existing) {
      res = await gcalApi(GCAL_API + '/' + encodeURIComponent(existing), { method: 'PATCH', body: JSON.stringify(body) });
      if (res.status === 404) res = await gcalApi(GCAL_API, { method: 'POST', body: JSON.stringify(body) }); // Google側で消えていたら作り直す
    } else {
      res = await gcalApi(GCAL_API, { method: 'POST', body: JSON.stringify(body) });
    }
    const j = await res.json();
    if (j && j.id && c.gcalId !== String(j.id)) { c.gcalId = String(j.id); save(); rerenderSoft(); }
    pullCalendarSoon();
    return true;
  }
  // v1.5.0 で「コーチに消してもらう」として溜まった削除依頼を、直接連携で自分で処理する
  async function flushGcalDeletes() {
    if (!state.gcalDeletes.length) return;
    const doneIds = [];
    for (const g of [...state.gcalDeletes]) { try { await gcalDeleteEvent(g.gcalId); doneIds.push(g.id); } catch (e) { /* 次回に再試行 */ } }
    if (doneIds.length) { state.gcalDeletes = state.gcalDeletes.filter((g) => !doneIds.includes(g.id)); doneIds.forEach((id) => markDeleted(id)); save(); }
  }
  async function pullCalendarDirect(forceList) {
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const tPast = new Date(t0.getTime() - 30 * 86400000);
    const t180 = new Date(t0.getTime() + 180 * 86400000);
    const t2y = new Date(t0.getTime() + 731 * 86400000);
    // カレンダー一覧は10分キャッシュ（毎回の取得を軽くする）。ただし手動の取得（forceList）では必ず取り直す
    // （購読カレンダーを追加した直後でもすぐ反映されるように）。失敗したら前回分、無ければ primary のみで続行し、失敗は cal.listError に残して見える化する
    let calendars = Array.isArray(cal.calendars) ? cal.calendars : [];
    let listError = cal.listError || '';
    if (forceList || !calendars.length || !cal.calendarsFetchedAt || Date.now() - new Date(cal.calendarsFetchedAt).getTime() > 600000) {
      const fetched = await gcalFetchCalendars();
      if (fetched) {
        listError = '';
        if (fetched.length) { calendars = fetched; cal.calendarsFetchedAt = nowIso(); }
      } else {
        listError = gcalListErrorMsg || 'カレンダー一覧を取得できませんでした';
      }
      cal.listError = listError; saveCal(); // 後段で失敗して中断しても、注意表示が残るように先に永続化
    }
    if (!calendars.length) calendars = [{ id: 'primary', summary: 'メインカレンダー', color: '#039be5', accessRole: 'owner', primary: true, selected: true }];
    const primaryCal = calendars.find((c) => c.primary) || calendars.find((c) => c.id === 'primary') || calendars[0];
    // カレンダータブ用：選択中（selected）の全カレンダーから 過去30日〜未来180日
    const jobs = calendars.filter((c) => c.selected).map((c) => gcalListEventsFor(c.id, tPast.toISOString(), t180.toISOString(), '', c));
    // カウントダウン／ホーム用：primary の「⏳」は2年先まで（従来通り。primary の通常予定は上の範囲に含まれる）
    jobs.push(gcalListEventsFor(primaryCal.id, t0.toISOString(), t2y.toISOString(), '⏳', primaryCal));
    const settled = await Promise.allSettled(jobs);
    const ok = settled.filter((s) => s.status === 'fulfilled');
    if (!ok.length) throw (settled[0] && settled[0].reason) || new Error('Googleカレンダーを取得できませんでした');
    const byKey = new Map();
    ok.forEach((s) => s.value.forEach((e) => byKey.set(e.calendarId + '\n' + e.id, e)));
    const events = [...byKey.values()].sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const before = JSON.stringify(cal.calendar);
    // v1.8.0：基本範囲（poolFrom〜poolTo）を記録。範囲外を追加取得した分（extraEvents/extraRanges）は
    // 基本範囲に取り込まれた分だけ掃除して残す（基本範囲の内容が正で、追加分はその外側だけを持つ）
    const poolFrom = todayStr(tPast); const poolTo = todayStr(t180);
    const extraRanges = (cal.extraRanges || []).filter((r) => r.to < poolFrom || r.from > poolTo);
    const extraEvents = (cal.extraEvents || []).filter((e) => { const d = evDate(e.start); return d && (d < poolFrom || d > poolTo); });
    cal = { calendar: { updatedAt: nowIso(), events }, calendars, calendarsFetchedAt: cal.calendarsFetchedAt, links: cal.links, fetchedAt: nowIso(), listError, extraEvents, extraRanges, poolFrom, poolTo };
    calUi.error = ''; saveCal();
    await flushGcalDeletes();
    if (before !== JSON.stringify(cal.calendar)) rerenderSoft();
    return true;
  }
  function gcalCard() {
    const chip = gcalConnected() ? '<span class="chip sync-ok">連携済み</span>' : gcalHasClient() ? '<span class="chip">クライアントID設定済み・未接続</span>' : '<span class="chip">未設定</span>';
    return `<section class="card" id="gcalCard">
      <div class="card-head"><h2>📅 Googleカレンダー連携</h2>${chip}</div>
      ${cal.listError ? `<p class="cal-alert small" role="alert">⚠️ カレンダー一覧を取得できませんでした（${esc(cal.listError)}）。購読カレンダーなどが表示されていない可能性があります。「Googleと連携する」を押し直すか、「今すぐ取得」を試してください。</p>` : ''}
      <p class="small">アプリが Googleカレンダーを<b>直接</b>読み書きします（中継ファイルやAIコーチは使いません）。Googleカレンダーで予定を追加・変更すると、アプリに戻ったその場で反映され、表示中は30秒ごとに自動で取り直します。カウントダウンで「Googleカレンダーにも入れる」をオンにすると、保存した瞬間に終日予定「⏳ 予定名」が作られます。</p>
      <form data-form="gcalSetup" class="ai-form">
        <label class="field"><span class="field-label">OAuth クライアントID（ウェブアプリケーション）</span>
          <input name="clientId" type="text" placeholder="xxxxx.apps.googleusercontent.com" value="${esc(gcal.clientId)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <div class="btn-row"><button class="btn primary small" type="submit">クライアントIDを保存</button>${gcalHasClient() ? '<button type="button" class="btn soft small" data-action="gcalConnect">Googleと連携する</button><button type="button" class="btn soft small" data-action="gcalRefresh">今すぐ取得</button><button type="button" class="btn ghost danger small" data-action="gcalDisconnect">連携を解除</button>' : ''}</div>
        <p class="sync-msg small" id="gcalMsg"></p>
      </form>
      <ul class="small muted note-list">
        <li>メニューの「📅 カレンダー」タブでは、全カレンダーの予定を見て、その場で追加・編集・削除できます（読み取り専用のカレンダーは表示のみ）。カレンダー一覧の許可が足りないときは「Googleと連携する」を押し直してください。</li>
        <li>クライアントIDの作り方：<a class="link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console ↗</a> で Google Calendar API を有効化し、「OAuth クライアントID（ウェブアプリケーション）」を作成。承認済みの JavaScript 生成元に <b>${esc(location.origin)}</b> を登録してください。</li>
        <li>クライアントIDとアクセストークンはこの端末だけに保存され、GitHub 同期・バックアップには含まれません。トークンの有効期限が切れたら「Googleと連携する」を押し直してください。</li>
        <li>連携は端末ごとです。使う端末ごとに、クライアントIDの保存と連携が必要です（同じクライアントIDで大丈夫です）。</li>
      </ul>
    </section>`;
  }
  async function gcalConnectInteractive() {
    const msg = $('#gcalMsg');
    if (!gcalHasClient()) { if (msg) msg.textContent = '先にクライアントIDを保存してください'; toast('先にクライアントIDを保存してください'); return; }
    try {
      if (msg) msg.textContent = 'Googleの画面で許可してください…';
      const token = await gcalEnsureToken(true);
      if (!token) throw new Error('連携できませんでした（ポップアップがブロックされた場合は許可してください）');
      await pullCalendar(true); // 連携し直しではカレンダー一覧も必ず取り直す（追加した購読カレンダーをすぐ拾う）
      toast('Googleカレンダーと連携しました ✓');
      rerender();
    } catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); toast('⚠️ ' + (e.message || e)); }
  }
  const dataDir = () => (sync.path || 'data/life-plan.json').replace(/[^/]*$/, '');
  const calPath = () => dataDir() + 'calendar.json';
  const calLinksPath = () => dataDir() + 'calendar-links.json';
  const evDate = (v) => { const t = String(v || ''); if (isDateStr(t)) return t; if (isDateStr(t.slice(0, 10)) && !/[T ]\d/.test(t)) return t.slice(0, 10); const d = new Date(t); return isNaN(d) ? '' : todayStr(d); };
  const evTime = (ev) => { if (ev.allDay || isDateStr(String(ev.start || ''))) return ''; const d = new Date(ev.start); return isNaN(d) ? '' : `${d.getHours()}:${pad(d.getMinutes())}`; };
  function normEvent(e) {
    if (!e || typeof e !== 'object' || !e.id) return null;
    const date = evDate(e.start); if (!date) return null;
    return { id: String(e.id), calendarId: String(e.calendarId || 'primary'), color: String(e.color || ''), title: String(e.title || e.summary || '（無題の予定）'), start: String(e.start), end: String(e.end || ''), date, allDay: e.allDay === true || isDateStr(String(e.start)), location: String(e.location || ''), description: String(e.description || '') };
  }
  const calEvents = () => {
    const base = (cal.calendar && Array.isArray(cal.calendar.events)) ? cal.calendar.events : [];
    const extra = Array.isArray(cal.extraEvents) ? cal.extraEvents : [];
    let all = base;
    if (extra.length) { // v1.8.0：範囲外を追加取得した分をマージ（基本範囲側を正として重複排除）
      const m = new Map();
      extra.forEach((e) => { if (e && e.id) m.set(String(e.calendarId || 'primary') + '\n' + e.id, e); });
      base.forEach((e) => { if (e && e.id) m.set(String(e.calendarId || 'primary') + '\n' + e.id, e); });
      all = [...m.values()];
    }
    return all.map(normEvent).filter(Boolean).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  };
  const calLinks = () => (cal.links && cal.links.links && typeof cal.links.links === 'object' ? cal.links.links : {});
  const calLinkDeleted = () => (cal.links && cal.links.deleted && typeof cal.links.deleted === 'object' ? cal.links.deleted : {});
  const HOURGLASS = /⏳/;
  const stripHourglass = (t) => t.replace(/⏳\uFE0F?/g, '').trim() || t;
  // このカウントダウンにつながっている Google の予定 id（Google から作った → gcalId、アプリから送った → calendar-links.json）
  const cdGcalId = (c) => c.gcalId || (calLinks()[c.id] && calLinks()[c.id].gcalId) || '';
  function cdGcalStatus(c) {
    if (c.source === 'google' && c.gcalId) return { cls: 'g-linked', text: 'Googleカレンダーの予定から' };
    if (!c.gcal) return null;
    if (cdGcalId(c)) return { cls: 'g-ok', text: '📅 Googleカレンダーと同期済み' };
    if (!gcalHasClient()) return { cls: 'g-pending', text: '📅 Googleカレンダー未連携（設定で連携すると即時同期します）' };
    if (!gcalConnected()) return { cls: 'g-pending', text: '📅 Google連携の有効期限切れ（設定で連携し直してください）' };
    return { cls: 'g-pending', text: '📅 Googleカレンダーへ送信待ち' };
  }
  async function pullCalendar(forceList) {
    // 直接連携できる場合は Google から直接読む。できない場合だけ v1.5.0 の中継ファイルにフォールバック
    // forceList=true（手動の「今すぐ取得」・連携し直し・ヘッダーの更新ボタン）ではカレンダー一覧のキャッシュを使わず必ず取り直す
    if (gcalHasClient()) {
      const token = await gcalEnsureToken(false);
      if (token) return pullCalendarDirect(forceList);
    }
    return pullCalendarLegacy();
  }
  async function pullCalendarLegacy() {
    const [f1, f2] = await Promise.all([ghGetFile(calPath()), ghGetFile(calLinksPath())]);
    const parse = (f) => { if (!f.exists || !f.text.trim()) return null; try { return JSON.parse(f.text); } catch (e) { return extractJson(f.text); } };
    const c1 = parse(f1); const c2 = parse(f2);
    const before = JSON.stringify([cal.calendar, cal.links]);
    cal = { calendar: c1 && typeof c1 === 'object' ? c1 : null, links: c2 && typeof c2 === 'object' ? c2 : null, fetchedAt: nowIso(), calendars: cal.calendars, calendarsFetchedAt: cal.calendarsFetchedAt, listError: cal.listError, extraEvents: cal.extraEvents || [], extraRanges: cal.extraRanges || [], poolFrom: cal.poolFrom || '', poolTo: cal.poolTo || '' };
    calUi.error = ''; saveCal();
    // コーチが Google から消した予定は、削除の依頼リストから外す
    const dels = calLinkDeleted();
    const done = state.gcalDeletes.filter((g) => dels[g.gcalId]);
    if (done.length) { state.gcalDeletes = state.gcalDeletes.filter((g) => !dels[g.gcalId]); done.forEach((g) => markDeleted(g.id)); save(); }
    if (before !== JSON.stringify([cal.calendar, cal.links]) || done.length) rerenderSoft();
    return true;
  }
  // ⏳ を含む Google の予定は、自動でカウントダウンに（読み取り専用・保存しない）
  function googleCountdowns() {
    const t = todayStr();
    const linked = new Set(state.countdowns.map(cdGcalId).filter(Boolean));
    return calEvents().filter((e) => HOURGLASS.test(e.title) && e.date >= t && !linked.has(e.id))
      .map((e) => ({ id: 'gcal:' + e.id, title: stripHourglass(e.title), emoji: '⏳', date: e.date, memo: e.location ? '📍 ' + e.location : '', taskId: '', source: 'google', gcalId: e.id, readOnly: true, createdAt: (cal.calendar && cal.calendar.updatedAt) || nowIso(), updatedAt: '' }));
  }
  function sortedCountdowns() {
    const all = [...state.countdowns, ...googleCountdowns()];
    const up = all.filter((c) => cdDays(c) >= 0).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const past = all.filter((c) => cdDays(c) < 0).sort((a, b) => b.date.localeCompare(a.date));
    return { up, past };
  }
  function countdownFromEvent(gid) {
    const e = calEvents().find((x) => x.id === gid); if (!e) return;
    const ex = state.countdowns.find((c) => cdGcalId(c) === gid);
    if (ex) { toast('もうカウントダウンになっています'); return; }
    const snap = snapshot();
    const nc = normCountdown({ title: stripHourglass(e.title), date: e.date, emoji: '📅', memo: e.location ? '📍 ' + e.location : '', source: 'google', gcalId: gid });
    calUi.open = true; state.countdowns.push(nc); save(); rerender();
    undoable(`⏳ 「${trunc(nc.title, 16)}」まで ${cdText(cdDays(nc))}`, snap);
  }
  function queueGcalDelete(c, reason) {
    const gid = cdGcalId(c);
    if (!gid || c.source === 'google') return; // Google から作ったものは Google 側を消さない
    const ex = state.gcalDeletes.find((g) => g.gcalId === gid);
    if (!ex) state.gcalDeletes.push(normGcalDelete({ gcalId: gid, countdownId: c.id, title: c.title, date: c.date, reason }));
    delete state.deleted['gdel:' + gid];
  }

  function cdLabel(n) {
    if (n === 0) return '<b class="cd-num today">今日！</b>';
    if (n > 0) return `<span class="cd-pre">あと</span><b class="cd-num">${n.toLocaleString('ja-JP')}</b><span class="cd-unit">日</span>`;
    return `<b class="cd-num past">${(-n).toLocaleString('ja-JP')}</b><span class="cd-unit">日経過</span>`;
  }
  const cdText = (n) => (n === 0 ? '今日！' : n > 0 ? `あと${n}日` : `${-n}日経過`);
  // ── ドットグリッド（v1.8.1）：作成日→対象日を 1マス＝1日で並べる。経過（作成日〜今日）＝グレー、
  // 残り（明日〜前日）＝水色、対象日＝オレンジ。総日数が 210 を超えたら 1マス＝1週間に切り替える。
  // 作成日が無い/対象日より後などの不整合時は「残りのみ」等に倒して壊れないようにする。
  function cdGridModel(c) {
    const target = c.date;
    if (!isDateStr(target)) return null;
    const today = todayStr();
    const created = isoToDate(c.createdAt);
    let start = isDateStr(created) ? created : '';
    if (!start || start > target) start = today < target ? addDays(today, 1) : target; // 欠落・不整合時：残りのみ（対象が過ぎていれば当日マスのみ）
    if (start > target) start = target;
    const span = daysUntil(target) - daysUntil(start); // 開始日→対象日の日数（0以上）
    const weekly = span + 1 > 210;
    const cells = [];
    if (!weekly) {
      for (let i = 0; i <= span; i++) {
        const d = addDays(start, i);
        cells.push(d === target ? 'goal' : d <= today ? 'done' : 'left');
      }
    } else {
      const weeks = Math.ceil((span + 1) / 7);
      for (let w = 0; w < weeks; w++) {
        if (w === weeks - 1) { cells.push('goal'); continue; } // 最終マス（対象日を含む週）はオレンジ
        cells.push(addDays(start, w * 7 + 6) <= today ? 'done' : 'left'); // まるごと経過した週だけグレー
      }
    }
    return { cells, weekly };
  }
  function cdGridHtml(c) {
    const m = cdGridModel(c);
    if (!m) return '';
    const done = m.cells.filter((x) => x === 'done').length;
    const left = m.cells.filter((x) => x === 'left').length;
    return `<div class="cd-grid ${m.weekly ? 'weekly' : ''}" role="img" aria-label="作成日から対象日まで${m.weekly ? `（1マス＝1週間・全${m.cells.length}マス）` : `（全${m.cells.length}日）`}：経過 ${done}・残り ${left}・対象日 1">${m.cells.map((k) => `<span class="cd-dot ${k}"></span>`).join('')}</div>`;
  }
  function countdownCard(c) {
    const n = cdDays(c); const t = c.taskId ? getItem(c.taskId) : null; const gs = c.readOnly ? null : cdGcalStatus(c);
    return `<article class="card cd-card ${n === 0 ? 'is-today' : n < 0 ? 'is-past' : ''} ${c.readOnly ? 'is-google' : ''}" data-cd="${c.id}">
      <div class="cd-top"><span class="cd-emoji" aria-hidden="true">${esc(c.emoji || '⏳')}</span>
        <div class="cd-main"><h3 class="cd-title">${esc(c.title)}${c.readOnly ? ' <span class="chip g-badge">Google</span>' : ''}</h3><p class="cd-date">${fmtDate(c.date)}</p></div>
        <div class="cd-count" aria-label="${cdText(n)}">${cdLabel(n)}</div></div>
      ${cdGridHtml(c)}
      ${c.memo ? `<p class="cd-memo">${esc(c.memo)}</p>` : ''}
      ${t ? `<a class="cd-link small" href="#item/${t.id}">🔗 ${esc(trunc(t.title, 30))}</a>` : ''}
      ${gs ? `<p class="cd-gcal ${gs.cls} small">${gs.text}</p>` : ''}
      ${c.readOnly ? '<p class="muted small cd-ro">Googleカレンダーの「⏳」つきの予定（変更は Google カレンダーで）</p>' : c.cdTaskId ? '<p class="muted small cd-ro">📝 タスクの期限（〆切日）から自動作成（変更はタスクの編集から）</p>' : `<div class="btn-row end cd-actions"><button class="btn ghost small" data-action="cdEdit" data-id="${c.id}">編集</button><button class="btn ghost small danger" data-action="cdDelete" data-id="${c.id}">削除</button></div>`}
    </article>`;
  }
  const fmtStamp = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`; };
  function calSyncLine() {
    if (cal.calendar && cal.calendar.updatedAt) return `<p class="cal-sync muted small">📅 Googleカレンダー最終取得: ${esc(fmtStamp(cal.calendar.updatedAt))}${calUi.error ? `<span class="error-text">（読み込みエラー：${esc(calUi.error)}）</span>` : ''}</p>`;
    return `<p class="cal-sync muted small">📅 Googleカレンダーはまだ連携していません（設定 → Googleカレンダー連携で接続すると、その場で反映されます）</p>`;
  }
  function viewCountdown() {
    const { up, past } = sortedCountdowns();
    const out = [sectionHead('⏳ カウントダウン', up.length ? `${up.length}件・近い順` : '大きな予定や目標の日まで', '<button class="btn primary small" data-action="cdNew">＋ 追加</button>')];
    out.push(calSyncLine());
    if (!up.length && !past.length) out.push(emptyState('まだカウントダウンはありません', '発表・旅行・試験など、大きな予定や目標の日を選ぶと、その日まで「あと何日」を毎日数えます。Googleカレンダーで予定名に「⏳」を入れると、ここに自動で並びます。', '<button class="btn primary" data-action="cdNew">＋ カウントダウンをつくる</button>'));
    out.push(up.map(countdownCard).join(''));
    const evs = calEvents().filter((e) => e.date >= todayStr() && !HOURGLASS.test(e.title)).slice(0, 40);
    if (evs.length) {
      const linked = new Set(state.countdowns.map(cdGcalId).filter(Boolean));
      out.push(`<details class="card cal-events" ${calUi.open ? 'open' : ''}><summary><b>📅 Googleカレンダーの予定</b><span class="muted small">（${evs.length}件）カウントダウンにできます</span></summary><ul class="plain-list">${evs.map((e) => `<li class="cal-ev" data-gev="${esc(e.id)}"><span class="cal-ev-d">${fmtShort(e.date)}<small>${'日月火水木金土'[new Date(e.date + 'T00:00').getDay()]}</small></span><span class="grow"><b>${esc(trunc(e.title, 28))}</b>${evTime(e) ? `<span class="muted small"> ${evTime(e)}</span>` : ''}</span>${linked.has(e.id) ? '<span class="chip sync-ok">カウントダウン中</span>' : `<button class="btn soft small" data-action="cdFromEvent" data-id="${esc(e.id)}">→ カウントダウンにする</button>`}</li>`).join('')}</ul></details>`);
    }
    if (past.length) out.push(`<details class="cd-past-wrap"><summary class="month-head">終わった予定（${past.length}件）</summary>${past.map(countdownCard).join('')}</details>`);
    return out.join('');
  }
  // ───────────────────────── 📅 カレンダータブ（v1.7.0／v1.8.0 で月・週・日表示に作り替え） ─────────────────────────
  // 全カレンダーの予定を見て、その場で追加・編集・削除する（Google Calendar API 直接）。
  // 予定データは cal.calendar.events（基本範囲：過去30日〜未来180日・全カレンダー分・calendarId と色つき）
  // ＋ cal.extraEvents（表示範囲が基本範囲の外に出たときに追加取得した分）。
  const gtab = { month: '', day: '', view: 'month', lastTap: null, tgKey: '', tgPos: null }; // view: 'month' | 'week' | 'day'（既定は月）。lastTap はダブルタップ判定、tgKey/tgPos はタイムグリッドのスクロール位置管理
  function gtabInit() { const t = todayStr(); if (!gtab.day) gtab.day = t; if (!gtab.month) gtab.month = t.slice(0, 7); }
  const gtabEvents = () => calEvents();
  function mondayOf(ds) { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return todayStr(d); }
  function gevOnDay(e, day) {
    if (e.allDay) { const endEx = e.end && e.end > e.date ? e.end : addDays(e.date, 1); return day >= e.date && day < endEx; }
    return e.date === day;
  }
  const gevTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getHours()}:${pad(d.getMinutes())}`; };
  function gevTimeLabel(e) {
    if (e.allDay) return '終日';
    const s = gevTime(e.start); const en = e.end ? gevTime(e.end) : '';
    return en && en !== s ? `${s}–${en}` : s;
  }
  const gevSort = (a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : a.allDay ? -1 : 1);
  // v1.8.4：チップの色はカレンダーごとに決める。予定に付いた色（取得時にカレンダーの
  // backgroundColor を写したもの）→ カレンダー一覧の色 の順で解決し、どちらも無い
  // カレンダー（ICS購読など色情報が無いもの）は ID のハッシュで落ち着いたパレットから割り当てる。
  // 描画側はこの色を CSS 変数 --evc として渡し、背景はその tint・文字は濃淡を付けた色にする（styles.css）。
  const GEV_PALETTE = ['#5b8def', '#66a182', '#b08968', '#7986cb', '#9575cd', '#4db6ac', '#90a4ae', '#a3b18a'];
  const gevHexOk = (s) => /^#[0-9a-fA-F]{6}$/.test(String(s || ''));
  function gevCalColor(cid) {
    const cm = gcalCalendarById(cid);
    if (cm && gevHexOk(cm.color)) return cm.color;
    const key = String(cid || 'primary');
    let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return GEV_PALETTE[h % GEV_PALETTE.length];
  }
  const gevColor = (e) => (e && gevHexOk(e.color) ? e.color : gevCalColor(e && e.calendarId));
  function gtabDayListHtml(day, evs) {
    const list = evs.filter((e) => gevOnDay(e, day)).sort(gevSort);
    if (!list.length) return '<p class="muted small">この日の予定はありません</p>';
    return `<ul class="plain-list">${list.map((e) => { const cm = gcalCalendarById(e.calendarId); const ro = !gcalWritableCal(cm); return `<li><button type="button" class="gtab-ev" data-action="gevOpen" data-cid="${esc(e.calendarId)}" data-eid="${esc(e.id)}"><span class="gtab-dot" style="background:${esc(gevColor(e))}"></span><span class="gtab-time">${esc(gevTimeLabel(e))}</span><span class="grow"><b>${esc(trunc(e.title, 40))}</b><span class="muted small"> ${esc(cm ? cm.summary : '')}${e.location ? '・' + esc(trunc(e.location, 20)) : ''}</span></span>${ro ? '<span class="chip">閲覧のみ</span>' : ''}</button></li>`; }).join('')}</ul>`;
  }
  // ── 週・日表示のタイムグリッド（v1.8.1：Google カレンダーの週表示と同じ時間軸形式）──
  // 週＝7列・日＝1列で描画を共用する。上に曜日・日付ヘッダー（今日は丸くハイライト）と終日の帯、
  // 下に 0:00–24:00 の時間軸グリッド（縦スクロール）。予定は開始〜終了に応じた位置・長さのブロックで、
  // 重なる場合は横並びに割り当てる。週の日見出しタップは従来通り gtabDayView でその日の日表示へ。
  const TG_H = 48; // 1時間の高さ(px)
  const tgMinOf = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d.getHours() * 60 + d.getMinutes(); };
  function tgBlocksHtml(day, evs) {
    const timed = [];
    evs.forEach((e) => {
      if (e.allDay || !gevOnDay(e, day)) return;
      const s = tgMinOf(e.start); if (s == null) return;
      let en = e.end ? tgMinOf(e.end) : null;
      if (en == null) en = s + 60;
      if (e.end && String(e.end).slice(0, 10) > day) en = 1440; // 日をまたぐ予定はその日の終わりまで
      if (en <= s) en = s + 30;
      timed.push({ e, s, en: Math.min(en, 1440) });
    });
    timed.sort((a, b) => a.s - b.s || (b.en - b.s) - (a.en - a.s));
    // 重なりの塊ごとに列を割り当てる（簡易レイアウト）
    const placed = [];
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      if (!cluster.length) return;
      const ends = [];
      cluster.forEach((it) => { let ci = ends.findIndex((x) => x <= it.s); if (ci < 0) { ends.push(it.en); ci = ends.length - 1; } else ends[ci] = it.en; it.col = ci; });
      cluster.forEach((it) => { it.cols = ends.length; placed.push(it); });
      cluster = []; clusterEnd = -1;
    };
    timed.forEach((it) => { if (cluster.length && it.s >= clusterEnd) flush(); cluster.push(it); clusterEnd = Math.max(clusterEnd, it.en); });
    flush();
    return placed.map(({ e, s, en, col, cols }) => {
      const top = (s / 60) * TG_H, h = Math.max(16, ((en - s) / 60) * TG_H - 2);
      return `<button type="button" class="gtab-tgev" data-action="gevOpen" data-cid="${esc(e.calendarId)}" data-eid="${esc(e.id)}" style="top:${top}px;height:${h}px;left:${(col * 100) / cols}%;width:${100 / cols}%;--evc:${esc(gevColor(e))}" aria-label="${esc(e.title)} ${esc(gevTimeLabel(e))}"><b>${esc(e.title)}</b><span>${esc(gevTimeLabel(e))}</span></button>`;
    }).join('');
  }
  function gtabTimeGridHtml(days, evs) {
    const today = todayStr();
    const n = days.length;
    const heads = days.map((ds) => {
      const wd = '月火水木金土日'[(new Date(ds + 'T00:00:00').getDay() + 6) % 7];
      const inner = `<span class="gtab-tg-wd">${wd}</span><span class="gtab-tg-dn ${ds === today ? 'today' : ''}">${Number(ds.slice(8, 10))}</span>`;
      return n > 1
        ? `<button type="button" class="gtab-tg-head" data-action="gtabDayView" data-date="${ds}" aria-label="${ds}の日表示">${inner}</button>`
        : `<div class="gtab-tg-head">${inner}</div>`;
    }).join('');
    const ads = days.map((ds) => {
      const list = evs.filter((e) => e.allDay && gevOnDay(e, ds)).sort(gevSort);
      return `<div class="gtab-tg-adcol">${list.map((e) => `<button type="button" class="gtab-tg-ad" data-action="gevOpen" data-cid="${esc(e.calendarId)}" data-eid="${esc(e.id)}" style="--evc:${esc(gevColor(e))}">${esc(trunc(e.title, n > 1 ? 10 : 30))}</button>`).join('')}</div>`;
    }).join('');
    const hours = Array.from({ length: 24 }, (_, h) => `<span class="gtab-tg-hour" style="top:${h * TG_H + 2}px">${h}:00</span>`).join('');
    const now = new Date(); const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * TG_H;
    const cols = days.map((ds) => `<div class="gtab-tg-col" data-action="gtabCol" data-date="${ds}">${ds === today ? `<span class="gtab-nowline" style="top:${nowTop}px"></span>` : ''}${tgBlocksHtml(ds, evs)}</div>`).join('');
    return `<div class="gtab-tg ${n > 1 ? 'week' : 'day'}">
      <div class="gtab-tg-headrow"><div class="gtab-tg-gut"></div><div class="gtab-tg-heads" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${heads}</div></div>
      <div class="gtab-tg-adrow"><div class="gtab-tg-gut"><span>終日</span></div><div class="gtab-tg-ads" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${ads}</div></div>
      <div class="gtab-tg-scroll"><div class="gtab-tg-body"><div class="gtab-tg-gutcol">${hours}</div><div class="gtab-tg-cols" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${cols}</div></div></div>
    </div>`;
  }
  // タイムグリッドの初期スクロール：表示期間が変わったときは 8時付近（今日を含む表示では現在時刻付近）へ。
  // render()（p4）からカレンダー表示のたびに呼ばれる。再描画でスクロール要素が差し替わっても、
  // 同じ期間なら直前のスクロール位置（下のリスナーが記録）を復元し、ユーザーのスクロールを邪魔しない
  // v1.8.4：見出し行（期間タイトル＋前後ボタン）が sticky な上部バーの下に「半分だけ」
  // 隠れた状態で再描画されると、そのままでは操作しづらい。半分隠れのときだけ行全体が
  // 見える位置まで少し戻す（大きくスクロールして見出しが完全に上にあるときは触らない）。
  function ensureGtabNavVisible() {
    const nav = document.querySelector('.gtab-nav');
    const tb = document.querySelector('.topbar');
    if (!nav || !tb) return;
    const nr = nav.getBoundingClientRect(), tr = tb.getBoundingClientRect();
    if (nr.top < tr.bottom && nr.bottom > tr.bottom + 2) window.scrollBy(0, nr.top - tr.bottom - 4);
  }
  function positionTgScroll() {
    ensureGtabNavVisible();
    const sc = document.querySelector('.gtab-tg-scroll');
    if (!sc) return;
    const key = gtab.view + '|' + (gtab.view === 'week' ? mondayOf(gtab.day) : gtab.day);
    if (gtab.tgKey !== key) {
      gtab.tgKey = key;
      const today = todayStr();
      const hasToday = gtab.view === 'week' ? (mondayOf(gtab.day) <= today && today <= addDays(mondayOf(gtab.day), 6)) : gtab.day === today;
      let target = 8 * TG_H - 4;
      if (hasToday) { const n = new Date(); target = ((n.getHours() * 60 + n.getMinutes()) / 60) * TG_H - 110; }
      gtab.tgPos = Math.max(0, Math.min(target, Math.max(0, sc.scrollHeight - sc.clientHeight)));
    }
    if (gtab.tgPos != null) sc.scrollTop = gtab.tgPos;
  }
  document.addEventListener('scroll', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('gtab-tg-scroll')) gtab.tgPos = e.target.scrollTop;
  }, true);
  // 前へ／次へ／今日：表示単位（月・週・日）に連動する。スワイプ（下記）とボタンで共用
  function gtabMove(dir) {
    gtabInit();
    if (dir === 0) { const t = todayStr(); gtab.day = t; gtab.month = t.slice(0, 7); }
    else if (gtab.view === 'week') { gtab.day = addDays(gtab.day, dir * 7); gtab.month = gtab.day.slice(0, 7); }
    else if (gtab.view === 'day') { gtab.day = addDays(gtab.day, dir); gtab.month = gtab.day.slice(0, 7); }
    else { const [y, m] = gtab.month.split('-').map(Number); gtab.month = monthKey(new Date(y, m - 1 + dir, 1)); }
    rerender();
  }
  // ── 表示範囲のオンデマンド追加取得（v1.8.0）──
  // 取得済み範囲 = 基本範囲（cal.poolFrom〜poolTo）＋ cal.extraRanges。表示がその外に出たら不足分だけ取る。
  // ⏳ 用の2年取得（pullCalendarDirect 内）には触らない。失敗しても画面は壊さず、理由を calUi.error に残す。
  let gtabFetching = false;
  let gtabFetchFailKey = '';
  function gtabFirstGap(from, to) {
    const ivs = [];
    if (cal.poolFrom && cal.poolTo) ivs.push([cal.poolFrom, cal.poolTo]);
    (Array.isArray(cal.extraRanges) ? cal.extraRanges : []).forEach((r) => ivs.push([r.from, r.to]));
    ivs.sort((a, b) => a[0].localeCompare(b[0]));
    let cur = from;
    for (const [a, b] of ivs) {
      if (b < cur) continue;
      if (a > cur) return [cur, addDays(a, -1) < to ? addDays(a, -1) : to];
      cur = addDays(b, 1);
      if (cur > to) return null;
    }
    return cur <= to ? [cur, to] : null;
  }
  async function gtabFetchRange(from, to) {
    const calendars = (Array.isArray(cal.calendars) ? cal.calendars : []).filter((c) => c.selected);
    const tMin = new Date(from + 'T00:00:00').toISOString();
    const tMax = new Date(addDays(to, 1) + 'T00:00:00').toISOString();
    const settled = await Promise.allSettled(calendars.map((c) => gcalListEventsFor(c.id, tMin, tMax, '', c)));
    const ok = settled.filter((s) => s.status === 'fulfilled');
    if (!ok.length && settled.length) throw (settled[0] && settled[0].reason) || new Error('Googleカレンダーを取得できませんでした');
    const byKey = new Map((Array.isArray(cal.extraEvents) ? cal.extraEvents : []).map((e) => [String(e.calendarId || 'primary') + '\n' + e.id, e]));
    ok.forEach((s) => s.value.forEach((e) => byKey.set(e.calendarId + '\n' + e.id, e)));
    cal.extraEvents = [...byKey.values()];
    cal.extraRanges = [...(Array.isArray(cal.extraRanges) ? cal.extraRanges : []), { from, to }];
    saveCal();
  }
  async function gtabEnsureRange(from, to) {
    if (!gcalConnected() || gtabFetching) return;
    if (!cal.poolFrom || !cal.poolTo) return; // 基本範囲がまだ無い（初回取得前）は基本取得に任せる
    const key = from + '..' + to;
    if (gtabFetchFailKey === key) return; // 同じ範囲で失敗を繰り返さない（次の手動取得などで回復する）
    if (!gtabFirstGap(from, to)) return;
    gtabFetching = true;
    try {
      let gap = gtabFirstGap(from, to);
      for (let n = 0; n < 4 && gap; n++) { await gtabFetchRange(gap[0], gap[1]); gap = gtabFirstGap(from, to); }
      gtabFetchFailKey = '';
      rerenderSoft();
    } catch (e) { gtabFetchFailKey = key; calUi.error = e.message || String(e); rerenderSoft(); }
    finally { gtabFetching = false; }
  }
  function viewCalendar() {
    gtabInit();
    const out = [];
    if (!gcalHasClient()) {
      out.push(sectionHead('📅 カレンダー', 'Googleカレンダーの予定'));
      out.push(emptyState('Googleカレンダーと連携すると予定が見られます', '設定 →「📅 Googleカレンダー連携」でクライアントIDを保存して「Googleと連携する」を押すと、このタブに全カレンダーの予定が出て、その場で追加・編集・削除もできます。', '<a class="btn primary" href="#settings/gcal">設定を開く</a>'));
      return out.join('');
    }
    if (!gcalConnected()) {
      out.push(sectionHead('📅 カレンダー', 'Googleカレンダーの予定'));
      out.push(emptyState('連携の有効期限が切れています', '設定 →「📅 Googleカレンダー連携」で「Googleと連携する」を押し直してください。', '<a class="btn primary" href="#settings/gcal">設定を開く</a>'));
      if (cal.calendar) out.push(calSyncLine());
      return out.join('');
    }
    // 開いたとき、取得が古ければ取り直す（表示中30秒ごと・画面復帰時の自動取得も既にある）
    if (!cal.fetchedAt || Date.now() - new Date(cal.fetchedAt).getTime() > 20000) pullCalendarSoon();
    out.push(sectionHead('📅 カレンダー', 'Googleカレンダーの予定', '<button class="btn primary small" data-action="gevNew">＋ 追加</button>'));
    if (cal.listError) out.push(`<p class="cal-alert small" role="alert">⚠️ カレンダー一覧を取得できませんでした（${esc(cal.listError)}）。購読カレンダーなどが表示されていない可能性があります。設定 → Googleカレンダー連携で「Googleと連携する」を押し直してください。</p>`);
    const evs = gtabEvents();
    const view = gtab.view;
    const today = todayStr();
    // 表示範囲（追加取得の判定にも使う）とタイトル
    let title = ''; let needFrom = ''; let needTo = '';
    let gridStart = null;
    if (view === 'month') {
      const [gy, gm] = gtab.month.split('-').map(Number);
      title = `${gy}年${gm}月`;
      const first = new Date(gy, gm - 1, 1);
      gridStart = new Date(gy, gm - 1, 1 - ((first.getDay() + 6) % 7)); // 月曜始まり
      needFrom = todayStr(gridStart);
      needTo = todayStr(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 41));
    } else if (view === 'week') {
      const mon = mondayOf(gtab.day); const sun = addDays(mon, 6);
      title = mon.slice(0, 7) === sun.slice(0, 7)
        ? `${Number(mon.slice(5, 7))}月${Number(mon.slice(8, 10))}日〜${Number(sun.slice(8, 10))}日`
        : `${Number(mon.slice(5, 7))}月${Number(mon.slice(8, 10))}日〜${Number(sun.slice(5, 7))}月${Number(sun.slice(8, 10))}日`;
      needFrom = mon; needTo = sun;
    } else {
      const d = gtab.day;
      title = `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日（${'日月火水木金土'[new Date(d + 'T00:00:00').getDay()]}）`;
      needFrom = d; needTo = d;
    }
    gtabEnsureRange(needFrom, needTo);
    const unit = view === 'month' ? '月' : view === 'week' ? '週' : '日';
    let bodyHtml = '';
    if (view === 'month') {
      let cells = '';
      for (let i = 0; i < 42; i++) {
        const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        const ds = todayStr(d);
        const dayEvs = evs.filter((e) => gevOnDay(e, ds)).sort(gevSort);
        // v1.8.4：終日・複数日は tint の帯、時間指定は「色ドット＋時刻＋タイトル」の細い1行にする
        const chips = dayEvs.slice(0, 3).map((e) => {
          const col = esc(gevColor(e));
          if (e.allDay) return `<span class="gtab-chip band" style="--evc:${col}">${esc(trunc(e.title, 12))}</span>`;
          return `<span class="gtab-chip timed" style="--evc:${col}"><i class="gtab-cdot"></i><span class="gtab-ctime">${esc(gevTime(e.start))}</span><span class="gtab-ctitle">${esc(trunc(e.title, 12))}</span></span>`;
        }).join('');
        const more = dayEvs.length > 3 ? `<span class="gtab-more">他${dayEvs.length - 3}件</span>` : '';
        cells += `<button type="button" class="gtab-cell ${ds.slice(0, 7) !== gtab.month ? 'other' : ''} ${ds === today ? 'today' : ''} ${ds === gtab.day ? 'sel' : ''}" data-action="gtabDay" data-date="${ds}" aria-label="${ds}"><span class="gtab-d">${d.getDate()}</span><span class="gtab-chips">${chips}${more}</span></button>`;
      }
      const legend = (cal.calendars || []).filter((c) => c.selected).map((c) => `<span class="gtab-cal"><i style="background:${esc(gevCalColor(c.id))}"></i>${esc(trunc(c.summary, 14))}</span>`).join('');
      bodyHtml = `<div class="gtab-grid dow">${'月火水木金土日'.split('').map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="gtab-grid">${cells}</div>
      ${legend ? `<div class="gtab-legend">${legend}</div>` : ''}`;
    } else if (view === 'week') {
      const mon = mondayOf(gtab.day);
      const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
      bodyHtml = `<div class="gtab-week">${gtabTimeGridHtml(days, evs)}</div>`;
    } else {
      bodyHtml = `<div class="gtab-dayview">${gtabTimeGridHtml([gtab.day], evs)}</div>`;
    }
    out.push(`<div class="gtab-view"><section class="card gtab-card">
      <div class="gtab-nav"><button type="button" class="btn ghost small" data-action="gtabNav" data-dir="-1" aria-label="前の${unit}">‹</button><h2>${esc(title)}</h2><span class="btn-row"><button type="button" class="btn ghost small" data-action="gtabNav" data-dir="0">今日</button><button type="button" class="btn ghost small" data-action="gtabNav" data-dir="1" aria-label="次の${unit}">›</button></span></div>
      <div class="gtab-seg" role="group" aria-label="表示の切り替え">${[['month', '月'], ['week', '週'], ['day', '日']].map(([v, l]) => `<button type="button" class="pill ${view === v ? 'on' : ''}" data-action="gtabView" data-v="${v}" aria-pressed="${view === v}">${l}</button>`).join('')}</div>
      ${bodyHtml}
    </section>
    ${view === 'month' ? `<section class="card"><div class="card-head"><h2>${fmtDate(gtab.day)}</h2><span class="muted small">${evs.filter((e) => gevOnDay(e, gtab.day)).length}件</span></div>${gtabDayListHtml(gtab.day, evs)}</section>` : ''}
    </div>`);
    out.push(calSyncLine());
    return out.join('');
  }
  // カレンダー表示の左右スワイプで前／次の期間へ（v1.8.0）。横移動が縦より大きく 60px を超えたときだけ。
  // ジェスチャの所有権（v1.8.1）：(1) ドロワーのドラッグ追随は p4 の swipeBlocked が .gtab-view 内の
  // タッチを最初から受け付けない。(2) ブラウザの横パンは CSS の touch-action: pan-y で抑え、さらに
  // 横スワイプと確定した時点で touchmove を preventDefault してネイティブのパンに渡さない。
  // (3) スワイプ直後の click（セル選択など）は飲み込んで誤作動を防ぐ
  const gSwipe = { on: false, x: 0, y: 0, until: 0 };
  document.addEventListener('touchstart', (e) => {
    gSwipe.on = false;
    if (e.touches.length !== 1 || !e.target.closest) return;
    if (!e.target.closest('.gtab-view') || e.target.closest('input, textarea, select')) return;
    gSwipe.on = true; gSwipe.x = e.touches[0].clientX; gSwipe.y = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!gSwipe.on) return;
    const p = e.touches && e.touches[0]; if (!p) return;
    const dx = p.clientX - gSwipe.x, dy = p.clientY - gSwipe.y;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) e.preventDefault(); // 横スワイプ確定：ブラウザの横パン・ラバーバンドに渡さない
  }, { passive: false });
  document.addEventListener('touchend', (e) => {
    if (!gSwipe.on) return;
    gSwipe.on = false;
    const p = e.changedTouches && e.changedTouches[0]; if (!p) return;
    const dx = p.clientX - gSwipe.x, dy = p.clientY - gSwipe.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { gSwipe.until = Date.now() + 350; gtabMove(dx < 0 ? 1 : -1); }
  }, { passive: true });
  document.addEventListener('click', (e) => {
    if (Date.now() < gSwipe.until && e.target.closest && e.target.closest('.gtab-view')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  function openGcalEventEditor(cid, eid) {
    const ev = eid ? gtabEvents().find((e) => e.id === eid && e.calendarId === cid) : null;
    if (eid && !ev) { toast('予定が見つかりませんでした（再取得してください）'); return; }
    const meta = ev ? gcalCalendarById(ev.calendarId) : null;
    const ro = ev ? !gcalWritableCal(meta) : false;
    const writable = (cal.calendars || []).filter(gcalWritableCal);
    if (!ev && !writable.length) { toast('書き込めるカレンダーがありません'); return; }
    const defCal = (writable.find((c) => c.primary) || writable[0] || {}).id || 'primary';
    const v = ev ? {
      title: ev.title, calendarId: ev.calendarId, date: ev.date, allDay: ev.allDay,
      startTime: ev.allDay ? '10:00' : (gevTime(ev.start) || '10:00'),
      endTime: ev.allDay ? '11:00' : (ev.end ? gevTime(ev.end) : ''),
      location: ev.location || '', description: ev.description || '',
    } : { title: '', calendarId: defCal, date: gtab.day, allDay: false, startTime: '10:00', endTime: '11:00', location: '', description: '' };
    const dis = ro ? 'disabled' : '';
    // v1.8.0：カレンダー側からカウントダウンに追加（読み取り専用カレンダーの予定でも可。⏳ はプライマリ側に作る既存仕様）
    const cdLinked = ev ? state.countdowns.some((c) => cdGcalId(c) === ev.id) : false;
    const cdBtn = ev ? (cdLinked ? '<span class="chip sync-ok">カウントダウン中</span>' : `<button type="button" class="btn soft small" data-action="gevCountdown" data-cid="${esc(ev.calendarId)}" data-eid="${esc(ev.id)}" data-id="${esc(ev.id)}">⏳ カウントダウンにする</button>`) : '';
    openModal(`${modalHead(ev ? (ro ? '予定の詳細' : '予定を編集') : '予定を追加')}
      <form data-form="gcalEvent" data-cid="${esc(ev ? ev.calendarId : '')}" data-eid="${esc(ev ? ev.id : '')}">
        <label class="field"><span class="field-label">タイトル</span><input name="title" value="${esc(v.title)}" required autocomplete="off" placeholder="例：会議、通院" ${ev ? '' : 'autofocus'} ${dis}></label>
        <label class="field"><span class="field-label">カレンダー</span><select name="calendarId" ${ev || ro ? 'disabled' : ''}>${(ev ? [meta || { id: v.calendarId, summary: v.calendarId }] : writable).map((c) => `<option value="${esc(c.id)}" ${c.id === v.calendarId ? 'selected' : ''}>${esc(c.summary)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">日付</span><input type="date" name="date" value="${esc(v.date)}" required ${dis}></label>
        <label class="check-line"><input type="checkbox" name="allDay" data-change="gevAllDay" ${v.allDay ? 'checked' : ''} ${dis}> 終日</label>
        <div class="gtab-times">
          <label class="field"><span class="field-label">開始</span><input type="time" name="startTime" value="${esc(v.startTime)}" ${v.allDay || ro ? 'disabled' : ''}></label>
          <label class="field"><span class="field-label">終了</span><input type="time" name="endTime" value="${esc(v.endTime)}" ${v.allDay || ro ? 'disabled' : ''}></label>
        </div>
        <label class="field"><span class="field-label">場所（任意）</span><input name="location" value="${esc(v.location)}" autocomplete="off" ${dis}></label>
        <label class="field"><span class="field-label">メモ（任意）</span><textarea name="description" rows="3" ${dis}>${esc(v.description)}</textarea></label>
        ${ro ? '<p class="muted small">このカレンダーは読み取り専用です。変更・削除は Google カレンダーで行ってください。</p>' : ''}
        <div class="btn-row between"><span class="btn-row">${ev && !ro ? `<button type="button" class="btn ghost danger" data-action="gevDelete" data-cid="${esc(ev.calendarId)}" data-eid="${esc(ev.id)}">削除</button>` : ''}${cdBtn}</span>
          <span class="btn-row"><button type="button" class="btn ghost" data-action="closeModal">${ro ? '閉じる' : 'キャンセル'}</button>${ro ? '' : `<button class="btn primary" type="submit">${ev ? '保存' : '追加'}</button>`}</span></div>
      </form>`);
  }
  async function submitGcalEvent(form) {
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    if (!title) { toast('タイトルを入れてください'); return; }
    const date = String(fd.get('date') || '');
    if (!isDateStr(date)) { toast('日付を選んでください'); return; }
    const eid = form.dataset.eid || '';
    const cid = eid ? form.dataset.cid : String(fd.get('calendarId') || '');
    if (!cid) { toast('カレンダーを選んでください'); return; }
    const allDay = fd.get('allDay') === 'on';
    const body = { summary: title, location: String(fd.get('location') || '').trim(), description: String(fd.get('description') || '').trim() };
    if (allDay) {
      let days = 1; // 終日の複数日予定は、編集でも日数を保つ
      if (eid) { const old = gtabEvents().find((e) => e.id === eid && e.calendarId === cid); if (old && old.allDay && old.end && old.end > old.date) days = Math.max(1, Math.round((new Date(old.end + 'T00:00:00Z') - new Date(old.date + 'T00:00:00Z')) / 86400000)); }
      body.start = { date }; body.end = { date: addDays(date, days) };
    } else {
      const st = String(fd.get('startTime') || '10:00');
      let en = String(fd.get('endTime') || '');
      if (!en) { const [h, m] = st.split(':').map(Number); en = `${pad(Math.min(23, h + 1))}:${pad(m || 0)}`; if (en <= st) en = '23:59'; }
      if (en <= st) { toast('終了は開始より後にしてください'); return; }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
      body.start = { dateTime: `${date}T${st}:00`, timeZone: tz };
      body.end = { dateTime: `${date}T${en}:00`, timeZone: tz };
    }
    try {
      if (eid) await gcalApi(gcalEventsUrl(cid) + '/' + encodeURIComponent(eid), { method: 'PATCH', body: JSON.stringify(body) });
      else await gcalApi(gcalEventsUrl(cid), { method: 'POST', body: JSON.stringify(body) });
      closeModal();
      gtab.day = date; gtab.month = date.slice(0, 7);
      toast(eid ? '予定を更新しました ✓' : '予定を追加しました ✓');
      await pullCalendar().catch(() => {});
      rerender();
    } catch (e) { toast('⚠️ ' + (e.message || e)); }
  }
  async function deleteGcalEvent(cid, eid) {
    try {
      await gcalApi(gcalEventsUrl(cid) + '/' + encodeURIComponent(eid), { method: 'DELETE' });
      closeModal(); toast('予定を削除しました');
      await pullCalendar().catch(() => {});
      rerender();
    } catch (e) { toast('⚠️ ' + (e.message || e)); }
  }
  function addMonthsStr(base, m) { const [y, mo, d] = base.split('-').map(Number); const dt = new Date(y, mo - 1 + m, 1); const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate(); dt.setDate(Math.min(d, last)); return todayStr(dt); }
  function cdPreviewText(v) { return isDateStr(v) ? `${fmtDate(v)} ・ ${cdText(daysUntil(v))}` : '日付を選んでください'; }
  function openCountdownEditor(id) {
    const c = id ? getCountdown(id) : null;
    if (c && c.cdTaskId) { toast('このカウントダウンはタスクの期限と連動しています。変更はタスクの編集から行ってください'); return; } // v1.8.3：タスク由来はタスク側で管理
    const v = c || { emoji: '🎯', title: '', date: '', memo: '', taskId: '', gcal: false, source: '' };
    const items = state.items.filter((i) => i.status !== 'done' || i.id === v.taskId);
    const fromGoogle = v.source === 'google' && v.gcalId;
    openModal(`${modalHead(c ? 'カウントダウンを編集' : 'カウントダウンをつくる')}
      <form data-form="countdown" data-id="${c ? c.id : ''}">
        <div class="habit-name-row"><label class="field emoji-field"><span class="field-label">絵文字</span><input name="emoji" value="${esc(v.emoji)}" maxlength="8" autocomplete="off" aria-label="絵文字"></label>
          <label class="field grow"><span class="field-label">予定・目標</span><input name="title" value="${esc(v.title)}" required autocomplete="off" placeholder="例：役員発表、ハワイ旅行" ${c ? '' : 'autofocus'}></label></div>
        <div class="emoji-pick" role="group" aria-label="絵文字を選ぶ">${CD_EMOJIS.map((e) => `<button type="button" class="emoji-opt" data-action="cdEmoji" data-v="${e}">${e}</button>`).join('')}</div>
        <div class="field cd-date-field"><span class="field-label">日付</span>
          <label class="cd-date-pick"><span class="cd-cal" aria-hidden="true">📅</span><input type="date" name="date" value="${esc(v.date)}" ${c ? '' : `min="${todayStr()}"`} required aria-label="日付"></label>
          <div class="cd-quick" role="group" aria-label="かんたん選択">${[[1, '1か月後'], [3, '3か月後'], [6, '半年後'], [12, '1年後']].map(([m, l]) => `<button type="button" class="chip-btn" data-action="cdQuick" data-m="${m}">${l}</button>`).join('')}</div>
          <p class="cd-preview" id="cdPreview">${cdPreviewText(v.date)}</p></div>
        <label class="field"><span class="field-label">メモ（任意）</span><textarea name="memo" rows="2" placeholder="例：資料は2週間前に完成">${esc(v.memo)}</textarea></label>
        <label class="field"><span class="field-label">関連するタスク・目標（任意）</span><select name="taskId"><option value="">（なし）</option>${items.map((i) => `<option value="${i.id}" ${i.id === v.taskId ? 'selected' : ''}>${esc(trunc(i.title, 40))}</option>`).join('')}</select></label>
        ${fromGoogle ? '<p class="muted small">📅 Googleカレンダーの予定から作ったカウントダウンです（ここで変えても Google の予定は変わりません）</p>' : `<label class="check-line cd-gcal-toggle"><input type="checkbox" name="gcal" ${v.gcal ? 'checked' : ''}> 📅 Googleカレンダーにも入れる<span class="muted small">（保存した瞬間に「⏳ 予定名」の終日予定を作ります）</span></label>`}
        <div class="btn-row between">${c ? `<button type="button" class="btn ghost danger" data-action="cdDelete" data-id="${c.id}">削除</button>` : '<span></span>'}
          <span class="btn-row"><button type="button" class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" type="submit">${c ? '保存' : 'つくる'}</button></span></div>
      </form>`);
  }
  async function submitCountdown(form) {
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim(); const date = String(fd.get('date') || '');
    if (!title) return;
    if (!isDateStr(date)) { toast('日付を選んでください'); return; }
    const c = getCountdown(form.dataset.id);
    if (c && c.cdTaskId) { toast('このカウントダウンはタスクの期限と連動しています。変更はタスクの編集から行ってください'); return; } // v1.8.3
    const data = { title, date, emoji: String(fd.get('emoji') || '').trim() || '⏳', memo: String(fd.get('memo') || '').trim(), taskId: String(fd.get('taskId') || '') };
    if (!(c && c.source === 'google' && c.gcalId)) data.gcal = fd.get('gcal') === 'on';
    if (!c && date < todayStr()) { toast('今日以降の日付を選んでください'); return; }
    const snap = snapshot();
    if (c) {
      const oldGid = c.gcal ? cdGcalId(c) : '';
      const turnedOff = !!c.gcal && data.gcal === false && !!oldGid && c.source !== 'google';
      Object.assign(c, normCountdown({ ...c, ...data }), { updatedAt: nowIso() });
      if (turnedOff) c.gcalId = ''; // Google側はこのあと直接消す（失敗したら削除依頼に残して次回再試行）
      save(); closeModal(); rerender(); undoable('保存しました', snap);
      if (turnedOff) {
        try { await gcalDeleteEvent(oldGid); pullCalendarSoon(); toast('Googleカレンダーの予定も削除しました'); }
        catch (e) { state.gcalDeletes.push(normGcalDelete({ gcalId: oldGid, countdownId: c.id, title: c.title, date: c.date, reason: 'off' })); save(); toast('⚠️ Google側の削除に失敗しました（次回取得時に再試行します）'); }
      } else if (data.gcal) {
        try { await gcalUpsertCountdown(c); toast('Googleカレンダーにも反映しました ✓'); }
        catch (e) { toast('⚠️ ' + (e.message || e)); }
      }
    } else {
      const nc = normCountdown(data); state.countdowns.push(nc); save(); closeModal(); if (route().name !== 'countdown') go('#countdown'); else rerender();
      toast(`${nc.emoji} 「${nc.title}」まで ${cdText(cdDays(nc))}${nc.gcal ? '（Googleカレンダーへ送信中…）' : ''}`);
      if (nc.gcal) {
        try { await gcalUpsertCountdown(nc); toast('Googleカレンダーにも追加しました ✓'); }
        catch (e) { toast('⚠️ ' + (e.message || e)); }
      }
    }
  }
  async function deleteCountdown(id) {
    const c = getCountdown(id); if (!c) return;
    if (c.cdTaskId) { toast('このカウントダウンはタスクの期限と連動しています。消すにはタスクの期限を外すか、タスクを完了・削除してください'); return; } // v1.8.3
    const snap = snapshot();
    const gid = c.gcal ? cdGcalId(c) : '';
    const fromGoogle = c.source === 'google';
    state.countdowns = state.countdowns.filter((x) => x.id !== id);
    markDeleted(id); save(); if (!backdrop.hidden) closeModal(); rerender(); undoable(`「${trunc(c.title, 16)}」を削除しました`, snap);
    if (gid && !fromGoogle) { // Googleから作ったものは Google側を消さない（従来通り）
      try { await gcalDeleteEvent(gid); pullCalendarSoon(); }
      catch (e) { state.gcalDeletes.push(normGcalDelete({ gcalId: gid, countdownId: id, title: c.title, date: c.date, reason: 'deleted' })); save(); }
    }
  }
  function countdownContext() {
    const { up } = sortedCountdowns();
    if (!up.length) return '';
    return '## カウントダウン（大きな予定・目標の日）\n' + up.slice(0, 8).map((c) => `- ${c.emoji} ${trunc(c.title, 24)}：${c.date}（${cdText(cdDays(c))}）${c.taskId && getItem(c.taskId) ? `・関連タスク「${trunc(getItem(c.taskId).title, 20)}」` : ''}`).join('\n');
  }
  // 0時をまたいだら数え直す
  let cdDay = todayStr();
  function checkDayRollover() {
    const t = todayStr();
    if (t === cdDay) return false;
    cdDay = t;
    if (backdrop.hidden) rerenderSoft();
    return true;
  }
  setInterval(checkDayRollover, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDayRollover(); });
  // Googleカレンダー直接連携：表示中は30秒ごとに取り直し、画面に戻ったときもすぐ取り直す（Google側の追加・変更をその場で反映）
  setInterval(() => { if (document.visibilityState === 'visible' && gcalConnected()) pullCalendar().catch(() => {}); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && gcalConnected()) pullCalendar().catch(() => {}); });
  document.addEventListener('input', (e) => {
    if (e.target.matches && e.target.matches('form[data-form=countdown] input[name=date]')) { const p = $('#cdPreview'); if (p) p.textContent = cdPreviewText(e.target.value); }
  });
