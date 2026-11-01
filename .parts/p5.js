
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
    let added = 0;
    msgs.forEach((m) => {
      if (!m || typeof m !== 'object') return;
      const text = String(m.text || m.advice || m.message || m.body || '').trim();
      let sets = [];
      if (Array.isArray(m.stepSuggestions)) sets = m.stepSuggestions;
      else if (Array.isArray(m.tasks)) sets = m.tasks;
      else if (m.taskTitle && Array.isArray(m.steps)) sets = [{ taskTitle: m.taskTitle, steps: m.steps }];
      else if (Array.isArray(m.steps) && m.steps.length && typeof m.steps[0] === 'object' && m.steps[0].taskTitle) sets = m.steps;
      if (!text && !sets.length) return;
      const id = 'coach:' + (m.id ? String(m.id) : hashStr((m.date || '') + '|' + text + '|' + JSON.stringify(sets)));
      if (state.coachNotes.some((c) => c.id === id) || state.deleted[id]) return;
      const result = sets.length ? applyStepSets(sets) : [];
      state.coachNotes.push(normCoach({ id, date: toDateStr(m.date) || todayStr(), title: text ? String(m.title || '') : 'ステップの提案', text: text || 'ステップの提案が届きました。', read: false, source: 'github', stepsResult: result }));
      added++;
    });
    if (added) { save(); rerenderSoft(); toast(`💬 コーチから新着アドバイスが ${added}件 届きました`); }
    return added;
  }

  // ───────────────────────── 統合（同期・読み込み共通） ─────────────────────────
  const SYNC_COLLECTIONS = ['items', 'lessons', 'journal', 'coachNotes'];
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
        sync.lastSyncAt = nowIso(); sync.lastError = ''; saveSync(); setSyncState('ok');
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
  const AI_MODELS = { 'gemini-flash-latest': '最新のFlash（自動・おすすめ）', 'gemini-3.8-flash': 'gemini-3.8-flash（高性能）', 'gemini-3.6-flash': 'gemini-3.6-flash（標準）', 'gemini-3.5-flash-lite': 'gemini-3.5-flash-lite（軽量・速い）' };
  const AI_DEFAULT_MODEL = 'gemini-flash-latest';
  const AI_FALLBACKS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
  const AI_ENDPOINT = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const AI_CHIPS = ['今週何から手をつける？', '停滞タスクの原因を一緒に考えて', 'このタスクをステップに分けて', 'ジャーナルを振り返って'];
  function loadAi() {
    try { const o = JSON.parse(localStorage.getItem(AI_KEY) || '{}'); return { key: String(o.key || ''), model: AI_MODELS[o.model] ? o.model : AI_DEFAULT_MODEL, share: o.share !== false }; } catch (e) { return { key: '', model: AI_DEFAULT_MODEL, share: true }; }
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
      const meta = [i.quadrant ? `${i.quadrant} ${QUADRANTS[i.quadrant].label}` : '未分類', LISTS[i.list], STATUS[i.status], `重要度${IMPORTANCE[i.importance]}`, i.targetDate ? `目標日${i.targetDate}` : '', i.steps.length ? `ステップ${stepsDone(i)}/${i.steps.length}` : '', isStuck(i) ? `停滞${idleDays(i)}日` : ''].filter(Boolean).join('・');
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
      await callGemini([{ role: 'user', parts: [{ text: '接続テストです。「OK」とだけ返してください。' }] }], { key, model, maxTokens: 256, allowEmpty: true, timeoutMs: 25000 });
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
      photo.cur = { thumb, name: file.name, ...parsePhotoResult(reply) };
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
        <p class="muted small">写真そのものは保存されません（文字だけ保存）。内容を確認・修正してから保存してください。</p>
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
    if (!dup) state.journal.push(normJournal({ date, text, mood: Number(fd.get('mood')) || 0, source: 'photo' }));
    const t = nowIso(); let nt = 0;
    fd.getAll('task').map(String).forEach((title) => { if (!state.items.some((i) => norm(i.title) === norm(title))) { state.items.unshift(normItem({ title: trunc(title, 120), list: 'inbox', source: 'photo', createdAt: t, updatedAt: t })); nt++; } });
    save(); rerender();
    toast(dup ? '同じ内容のジャーナルが既にあるため、保存しませんでした' : `ジャーナルを保存しました${nt ? `（未整理に ${nt}件 追加）` : ''}`);
    if (photo.queue.length) nextPhoto(); else { photo.cur = null; closeModal(); }
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
