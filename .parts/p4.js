
  // ───────────────────────── コーチ用サマリー ─────────────────────────
  function coachData(days) {
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (days - 1));
    const sinceStr = todayStr(since);
    const act = activeItems();
    const brief = (i) => ({
      title: i.title, list: LISTS[i.list], category: i.category || undefined, importance: IMPORTANCE[i.importance],
      timeframe: i.timeframe ? TIMEFRAME[i.timeframe] : undefined, targetDate: i.targetDate || undefined, status: STATUS[i.status],
      steps: i.steps.length ? `${stepsDone(i)}/${i.steps.length}` : undefined, daysSinceCreated: daysSince(i.createdAt), daysSinceProgress: idleDays(i), stuck: isStuck(i) || undefined,
    });
    const matrix = {};
    QUADRANT_LAYOUT.forEach((q) => { matrix[QUADRANTS[q].label] = act.filter((i) => i.quadrant === q).map(brief); });
    matrix['未分類'] = act.filter((i) => !i.quadrant).map(brief);
    return {
      generatedAt: nowIso(), periodDays: days, focus: state.focus[thisYear()] || '',
      matrix,
      stuck: act.filter(isStuck).sort((a, b) => idleDays(b) - idleDays(a)).map((i) => ({ title: i.title, daysSinceProgress: idleDays(i), daysSinceCreated: daysSince(i.createdAt), reasons: i.stuck.tags, reasonNote: i.stuck.text || undefined, nextStep: (i.steps.find((s) => !s.done) || {}).text })),
      steps: act.filter((i) => i.steps.length).map((i) => ({ title: i.title, done: stepsDone(i), total: i.steps.length, steps: i.steps.map((s) => ({ text: s.text, done: s.done, due: s.due || undefined })) })),
      journal: state.journal.filter((e) => e.date >= sinceStr).sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({ date: e.date, mood: e.mood || undefined, text: e.text, linkedTasks: e.linked.map((id) => (getItem(id) || {}).title).filter(Boolean) })),
      lessons: state.lessons.map((l) => ({ name: l.name, status: LESSON_STATUS[l.status], frequency: l.frequency || undefined, monthlyCost: l.monthlyCost, sessionsThisMonth: sessionsThisMonth(l), lastSession: ([...l.logs].sort((a, b) => b.date.localeCompare(a.date))[0] || {}).date })),
      recentlyCompleted: state.items.filter((i) => i.status === 'done' && isoToDate(i.completedAt) >= sinceStr).map((i) => ({ title: i.title, completedAt: isoToDate(i.completedAt) })),
    };
  }
  function coachText(days) {
    const d = coachData(days);
    const L = [];
    L.push(`# ライフプラン相談用サマリー（${todayStr()} 作成・直近${days}日）`, '', '## 今年のフォーカス', d.focus || '（未設定）', '', '## マトリックス（緊急度×重要度）');
    Object.entries(d.matrix).forEach(([q, list]) => {
      if (q === '未分類' && !list.length) return;
      L.push(`### ${q}（${list.length}件）`);
      if (!list.length) L.push('- なし');
      list.forEach((i) => {
        const meta = [i.list, i.category, `重要度${i.importance}`, i.timeframe, i.targetDate ? `目標日${i.targetDate}` : '', i.steps ? `ステップ${i.steps}` : '', i.status === '進行中' ? '進行中' : '', `作成から${i.daysSinceCreated}日`, i.stuck ? `⚠停滞${i.daysSinceProgress}日` : ''].filter(Boolean).join('／');
        L.push(`- ${i.title}［${meta}］`);
      });
    });
    L.push('', `## ずっとできていない事（${STUCK_DAYS}日以上進捗なし）`);
    if (!d.stuck.length) L.push('- なし');
    d.stuck.forEach((s) => L.push(`- ${s.title}：${s.daysSinceProgress}日進捗なし（作成から${s.daysSinceCreated}日）／理由：${s.reasons.length ? s.reasons.join('、') : '未記入'}${s.reasonNote ? `／メモ：${s.reasonNote}` : ''}${s.nextStep ? `／次のステップ：${s.nextStep}` : ''}`));
    L.push('', '## ステップの進捗');
    if (!d.steps.length) L.push('- ステップに分けた項目はまだありません');
    d.steps.forEach((t) => {
      L.push(`- ${t.title}：${t.done}/${t.total} 完了`);
      t.steps.forEach((s, n) => L.push(`  ${n + 1}. ${s.done ? '[済]' : '[ ]'} ${s.text}${s.due ? `（期限 ${s.due}）` : ''}`));
    });
    L.push('', `## ジャーナル（直近${days}日・${d.journal.length}件）`);
    if (!d.journal.length) L.push('- 記録なし');
    d.journal.forEach((e) => L.push(`- ${e.date}${e.mood ? ` 気分${e.mood}/5` : ''}：${e.text.replace(/\s*\n\s*/g, ' ／ ')}${e.linkedTasks.length ? `（関連：${e.linkedTasks.join('、')}）` : ''}`));
    L.push('', '## 習い事');
    if (!d.lessons.length) L.push('- なし');
    d.lessons.forEach((l) => L.push(`- ${l.name}：${l.status}${l.frequency ? '・' + l.frequency : ''}・${fmtYen(l.monthlyCost)}/月・今月${l.sessionsThisMonth}回${l.lastSession ? `・最終 ${l.lastSession}` : ''}`));
    L.push(`- 月額合計（継続中）：${fmtYen(activeLessonCost())}`);
    L.push('', `## 直近${days}日で完了した事`);
    if (!d.recentlyCompleted.length) L.push('- なし');
    d.recentlyCompleted.forEach((c) => L.push(`- ${c.title}（${c.completedAt}）`));
    L.push('', '## お願い',
      '上の状況を踏まえて、(1) 優先順位の見直し、(2) 停滞している事それぞれの「次の小さな一歩」、(3) 大きな事のステップ分解 を日本語で提案してください。',
      'ステップを提案する場合は、アプリに取り込めるよう次のJSON形式も最後に付けてください（複数ある場合は配列）：',
      '{"taskTitle": "タスク名（上のタイトルと同じ）", "steps": ["ステップ1", "ステップ2"]}');
    return L.join('\n');
  }

  // ───────────────────────── ルーティングと描画 ─────────────────────────
  const main = $('#main');
  const VIEWS = { home: viewHome, matrix: viewMatrix, wish: viewWish, later: viewLater, lessons: viewLessons, inbox: viewInbox, journal: viewJournal, done: viewDone, search: viewSearch, settings: viewSettings, coach: viewCoach, item: viewItem, ai: viewAI };
  const TITLES = { home: 'ホーム', matrix: 'マトリックス', wish: 'やりたい事', later: '後回しでいい事', lessons: '習い事', inbox: '未整理', journal: 'ジャーナル', done: '完了履歴', search: '検索', settings: '設定', coach: 'コーチに相談', item: '詳細', ai: 'AIに相談' };
  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const idx = h.indexOf('/');
    const name = idx >= 0 ? h.slice(0, idx) : h;
    return { name: VIEWS[name] ? name : 'home', arg: idx >= 0 ? h.slice(idx + 1) : '' };
  }
  let pendingRender = false;
  function render(keepScroll) {
    pendingRender = false;
    const r = route();
    const y = window.scrollY;
    main.innerHTML = VIEWS[r.name](r.arg);
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.name));
    const n = state.items.filter((i) => i.list === 'inbox' && i.status !== 'done').length;
    const badge = $('#inboxBadge'); badge.hidden = !n; badge.textContent = n > 99 ? '99+' : n;
    const unread = state.coachNotes.filter((c) => !c.read).length;
    const cb = $('#coachBadge'); if (cb) { cb.hidden = !unread; cb.textContent = unread; }
    document.title = `${TITLES[r.name]}｜ライフプラン`;
    const key = r.name + '/' + r.arg;
    if (keepScroll && key === ui.lastRoute) window.scrollTo(0, y); else if (!(r.name === 'settings' && r.arg)) window.scrollTo(0, 0);
    const changed = key !== ui.lastRoute;
    ui.lastRoute = key;
    if (changed && !keepScroll) { main.classList.remove('view-enter'); void main.offsetWidth; main.classList.add('view-enter'); }
    moveTabIndicator(changed);
    if (r.name === 'ai' && !keepScroll) aiScrollBottom();
    document.body.classList.toggle('route-ai', r.name === 'ai');
    if (r.name === 'search' && !keepScroll) setTimeout(() => { const s = $('#searchInput'); if (s) s.focus(); }, 50);
  }
  const rerender = () => render(true);
  // ガラスのタブバー：選択中のタブへ「泡」がスライドする
  const tabInd = $('.tab-indicator');
  function moveTabIndicator(animate) {
    if (!tabInd) return;
    const a = $$('.tabbar a[data-nav]').find((x) => x.classList.contains('active') && x.offsetParent !== null);
    if (!a || getComputedStyle(tabInd).display === 'none') { tabInd.classList.add('off'); return; }
    if (!animate || !tabInd.dataset.ready) tabInd.classList.add('no-anim');
    tabInd.classList.remove('off');
    tabInd.style.width = a.offsetWidth + 'px';
    tabInd.style.transform = `translateX(${a.offsetLeft}px)`;
    if (tabInd.classList.contains('no-anim')) { void tabInd.offsetWidth; requestAnimationFrame(() => tabInd.classList.remove('no-anim')); }
    tabInd.dataset.ready = '1';
  }
  window.addEventListener('resize', () => moveTabIndicator(false));
  window.addEventListener('scroll', () => { document.body.classList.toggle('scrolled', window.scrollY > 8); }, { passive: true });
  // ドロワー（ハンバーガーメニュー）
  const drawer = $('#drawer'); const drawerBd = $('#drawerBackdrop');
  function openDrawer() {
    drawerBd.hidden = false; drawer.removeAttribute('inert'); drawer.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => { document.body.classList.add('drawer-open'); });
    $('#menuBtn').setAttribute('aria-expanded', 'true');
    setTimeout(() => { const f = $('.drawer-nav a.active', drawer) || $('.drawer-nav a', drawer); if (f && window.matchMedia('(pointer: fine)').matches) f.focus(); }, 60);
  }
  function closeDrawer() {
    if (!document.body.classList.contains('drawer-open')) { drawerBd.hidden = true; return; }
    document.body.classList.remove('drawer-open');
    drawer.setAttribute('inert', ''); drawer.setAttribute('aria-hidden', 'true');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!document.body.classList.contains('drawer-open')) drawerBd.hidden = true; }, 320);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) closeDrawer(); });
  drawer.addEventListener('click', (e) => { if (e.target.closest('a[href]')) closeDrawer(); });
  // 同期などバックグラウンドの更新：入力中・モーダル表示中は描画を後回し
  function rerenderSoft() {
    const a = document.activeElement;
    if (!backdrop.hidden || (a && main.contains(a) && a.matches('input, textarea, select'))) { pendingRender = true; return; }
    rerender();
  }
  document.addEventListener('focusout', () => { setTimeout(() => { if (pendingRender && backdrop.hidden) { const a = document.activeElement; if (!(a && main.contains(a) && a.matches('input, textarea, select'))) rerender(); } }, 200); });
  window.addEventListener('hashchange', () => { if (route().name !== 'coach') ui.coachText = ''; closeDrawer(); render(false); });
  const go = (hash) => { if (location.hash === hash) render(false); else location.hash = hash; };

  // ───────────────────────── モーダル・トースト ─────────────────────────
  const backdrop = $('#modal');
  const modalBox = $('.modal', backdrop);
  let modalCtx = null;
  function openModal(html, ctx = {}) {
    modalBox.innerHTML = html;
    backdrop.hidden = false;
    document.body.classList.add('modal-open');
    modalCtx = ctx;
    modalBox.scrollTop = 0;
    const f = $('[autofocus]', modalBox);
    if (f && window.matchMedia('(pointer: fine)').matches) setTimeout(() => f.focus(), 30);
    if (ctx.onOpen) ctx.onOpen(modalBox);
  }
  function closeModal() {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    modalBox.innerHTML = '';
    document.body.classList.remove('modal-open');
    const c = modalCtx; modalCtx = null;
    if (c && c.onClose) c.onClose();
    if (pendingRender) rerender();
  }
  const modalHead = (title) => `<div class="modal-head"><h2 id="modalTitle">${esc(title)}</h2><button type="button" class="icon-btn" data-action="closeModal" aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) closeModal(); });
  function confirmDialog(message, okLabel = 'OK', danger = false) {
    return new Promise((resolve) => {
      openModal(`${modalHead('確認')}<p class="pre">${esc(message)}</p><div class="btn-row end"><button class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn ${danger ? 'danger' : 'primary'}" id="confirmOk">${esc(okLabel)}</button></div>`,
        { onClose: () => resolve(false) });
      $('#confirmOk').addEventListener('click', () => { modalCtx = null; closeModal(); resolve(true); });
    });
  }
  const toastEl = $('#toast');
  let toastTimer = null;
  function toast(msg, action) {
    toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-btn">${esc(action.label)}</button>` : ''}`;
    toastEl.hidden = false;
    toastEl.classList.add('show');
    if (action) $('.toast-btn', toastEl).onclick = () => { hideToast(); action.run(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 5000 : 2600);
  }
  function hideToast() { toastEl.classList.remove('show'); toastEl.hidden = true; }
  function undoable(msg, snap) { toast(msg, { label: '元に戻す', run: () => restore(snap) }); }

  // ───────────────────────── エディタ（モーダル） ─────────────────────────
  function quadSelect(name, cur) {
    return `<div class="quad-pick">${QUADRANT_LAYOUT.map((q) => `<label class="qp ${q}"><input type="radio" name="${name}" value="${q}" ${cur === q ? 'checked' : ''}><span>${QUADRANTS[q].label}</span></label>`).join('')}
      <label class="qp none"><input type="radio" name="${name}" value="" ${!cur ? 'checked' : ''}><span>未分類</span></label></div>`;
  }
  function openQuickAdd(preset = {}) {
    const r = route().name;
    if (r === 'journal' && !preset.list) return openJournalEditor();
    const def = preset.list || ({ wish: 'wish', later: 'later', inbox: 'inbox', matrix: 'task', lessons: 'lesson' }[r]) || 'inbox';
    const dests = [['inbox', '未整理'], ['task', 'タスク'], ['wish', 'やりたい事'], ['later', '後回し'], ['lesson', '習い事']];
    openModal(`${modalHead('すばやく追加')}
      <form data-form="quickAdd">
        <input name="title" class="big-input" placeholder="何をしたい？" required autocomplete="off" autofocus enterkeyhint="done" aria-label="タイトル">
        <div class="field"><span class="field-label">追加先</span><div class="seg wrap">${dests.map(([k, l]) => `<label class="pill-radio"><input type="radio" name="dest" value="${k}" ${def === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
        <div class="field qa-quad"><span class="field-label">緊急度 × 重要度</span>${quadSelect('quadrant', preset.quadrant || '')}</div>
        <div class="field qa-cat"><span class="field-label">カテゴリ</span><select name="category">${catOptions('')}</select></div>
        <div class="btn-row end"><button type="button" class="btn ghost" data-action="quickAddDetail">詳しく入力</button><button class="btn primary" type="submit">追加</button></div>
      </form>`, { onOpen: (box) => {
      const upd = () => { const d = $('input[name=dest]:checked', box).value; $('.qa-quad', box).hidden = d === 'lesson'; $('.qa-cat', box).hidden = d === 'lesson' || d === 'inbox'; };
      $$('input[name=dest]', box).forEach((x) => x.addEventListener('change', upd)); upd();
    } });
  }
  function submitQuickAdd(form, detail) {
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const dest = fd.get('dest');
    if (!title) { form.title.focus(); return; }
    if (dest === 'lesson') {
      const l = normLesson({ name: title, status: 'considering' });
      state.lessons.unshift(l); save(); closeModal(); rerender();
      if (detail) openLessonEditor(l.id); else toast('習い事に追加しました');
      return;
    }
    const it = addItem({ title, list: dest, quadrant: fd.get('quadrant') || '', category: fd.get('category') || '' });
    closeModal(); rerender();
    if (detail) openItemEditor(it.id);
    else toast(`「${LISTS[dest]}」に追加しました`, { label: '開く', run: () => go('#item/' + it.id) });
  }

  function openItemEditor(id) {
    const i = getItem(id);
    if (!i) return;
    openModal(`${modalHead('編集')}
      <form data-form="item" data-id="${i.id}">
        <label class="field"><span class="field-label">タイトル</span><input name="title" value="${esc(i.title)}" required autocomplete="off"></label>
        <label class="field"><span class="field-label">メモ</span><textarea name="notes" rows="3">${esc(i.notes)}</textarea></label>
        <div class="grid2">
          <label class="field"><span class="field-label">リスト</span><select name="list">${options(LISTS, i.list)}</select></label>
          <label class="field"><span class="field-label">状態</span><select name="status">${options(STATUS, i.status)}</select></label>
          <label class="field"><span class="field-label">カテゴリ</span><select name="category">${catOptions(i.category)}</select></label>
          <label class="field"><span class="field-label">重要度</span><select name="importance">${options(IMPORTANCE, i.importance)}</select></label>
          <label class="field"><span class="field-label">目標の時期</span><select name="timeframe">${options(TIMEFRAME, i.timeframe, '（未設定）')}</select></label>
          <label class="field"><span class="field-label">目標日（任意）</span><input type="date" name="targetDate" value="${esc(i.targetDate)}"></label>
        </div>
        <div class="field"><span class="field-label">緊急度 × 重要度</span>${quadSelect('quadrant', i.quadrant)}</div>
        <label class="field"><span class="field-label">タグ（カンマ区切り）</span><input name="tags" value="${esc(i.tags.join(', '))}" autocomplete="off"></label>
        <div class="btn-row between"><button type="button" class="btn ghost danger" data-action="deleteItem" data-id="${i.id}">削除</button>
          <span class="btn-row"><button type="button" class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" type="submit">保存</button></span></div>
      </form>`);
  }
  function submitItem(form) {
    const i = getItem(form.dataset.id);
    if (!i) return closeModal();
    const fd = new FormData(form);
    const title = String(fd.get('title')).trim();
    if (!title) return;
    const newStatus = fd.get('status');
    if (newStatus !== i.status) setStatus(i, newStatus);
    const prevList = i.list;
    Object.assign(i, {
      title, notes: String(fd.get('notes') || ''), list: fd.get('list'), category: fd.get('category') || '', importance: fd.get('importance'),
      timeframe: fd.get('timeframe') || '', targetDate: fd.get('targetDate') || '', quadrant: fd.get('quadrant') || '',
      tags: String(fd.get('tags') || '').split(/[,、]/).map((s) => s.trim()).filter(Boolean),
    });
    touch(i, prevList !== i.list);
    save(); closeModal(); rerender(); toast('保存しました');
  }

  function openLessonEditor(id) {
    const l = id ? getLesson(id) : null;
    const v = l || normLesson({ name: '' });
    const logs = [...v.logs].sort((a, b) => b.date.localeCompare(a.date));
    openModal(`${modalHead(l ? '習い事を編集' : '習い事を追加')}
      <form data-form="lesson" data-id="${l ? l.id : ''}">
        <label class="field"><span class="field-label">名前</span><input name="name" value="${esc(l ? v.name : '')}" required autocomplete="off" ${l ? '' : 'autofocus'} placeholder="例：英会話、ピアノ、ジム"></label>
        <div class="grid2">
          <label class="field"><span class="field-label">状態</span><select name="status">${options(LESSON_STATUS, v.status)}</select></label>
          <label class="field"><span class="field-label">頻度</span><input name="frequency" value="${esc(v.frequency)}" placeholder="例：週1" list="freqList"></label>
          <label class="field"><span class="field-label">月額（円）</span><input name="monthlyCost" type="number" inputmode="numeric" min="0" step="1" value="${v.monthlyCost || ''}" placeholder="0"></label>
          <label class="field"><span class="field-label">開始日</span><input name="startDate" type="date" value="${esc(v.startDate)}"></label>
        </div>
        <datalist id="freqList"><option value="毎日"><option value="週1"><option value="週2"><option value="週3"><option value="隔週"><option value="月1"><option value="月2"></datalist>
        <label class="field"><span class="field-label">メモ</span><textarea name="notes" rows="2">${esc(v.notes)}</textarea></label>
        <div class="field"><span class="field-label">練習の記録（今月 ${sessionsThisMonth(v)}回・合計 ${v.logs.length}回）</span>
          <div id="logRows" class="log-rows">${logs.map((g) => logRow(g)).join('')}</div>
          <button type="button" class="btn soft small" data-action="addLogRow">＋ 今日の記録を追加</button>
        </div>
        <div class="btn-row between">${l ? `<button type="button" class="btn ghost danger" data-action="deleteLesson" data-id="${l.id}">削除</button>` : '<span></span>'}
          <span class="btn-row"><button type="button" class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" type="submit">保存</button></span></div>
      </form>`);
  }
  const logRow = (g) => `<div class="log-row" data-log="${esc(g.id)}"><input type="date" name="logDate" value="${esc(g.date)}" aria-label="日付"><input name="logMemo" value="${esc(g.memo)}" placeholder="メモ" aria-label="メモ"><button type="button" class="icon-btn small danger" data-action="removeRow" aria-label="記録を削除">${ICON.trash}</button></div>`;
  function submitLesson(form) {
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) return;
    const logs = $$('.log-row', form).map((r) => ({ id: r.dataset.log || uid(), date: $('[name=logDate]', r).value, memo: $('[name=logMemo]', r).value.trim() })).filter((g) => isDateStr(g.date));
    const data = { name, status: fd.get('status'), frequency: String(fd.get('frequency') || '').trim(), monthlyCost: Number(fd.get('monthlyCost')) || 0, startDate: fd.get('startDate') || '', notes: String(fd.get('notes') || ''), logs };
    const l = getLesson(form.dataset.id);
    if (l) Object.assign(l, normLesson({ ...l, ...data }), { updatedAt: nowIso() });
    else state.lessons.unshift(normLesson(data));
    save(); closeModal(); rerender(); toast('保存しました');
  }
  function openLogAdd(id) {
    const l = getLesson(id);
    if (!l) return;
    openModal(`${modalHead('練習を記録：' + l.name)}
      <form data-form="log" data-id="${l.id}">
        <label class="field"><span class="field-label">日付</span><input type="date" name="date" value="${todayStr()}" required></label>
        <label class="field"><span class="field-label">メモ（任意）</span><input name="memo" placeholder="例：発音の練習をした" autocomplete="off" autofocus></label>
        <div class="btn-row end"><button type="button" class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" type="submit">記録する</button></div>
      </form>`);
  }

  function openJournalEditor(id) {
    const e = id ? state.journal.find((x) => x.id === id) : null;
    const v = e || { date: todayStr(), text: '', mood: 3, linked: [] };
    const candidates = state.items.filter((i) => i.status !== 'done' || v.linked.includes(i.id)).sort((a, b) => (v.linked.includes(b.id) - v.linked.includes(a.id)) || b.updatedAt.localeCompare(a.updatedAt));
    openModal(`${modalHead(e ? 'ジャーナルを編集' : 'ジャーナルを書く')}
      <form data-form="journal" data-id="${e ? e.id : ''}">
        <label class="field"><span class="field-label">日付</span><input type="date" name="date" value="${esc(v.date)}" required></label>
        <div class="field"><span class="field-label">気分</span><div class="mood-pick">${[1, 2, 3, 4, 5].map((n) => `<label title="${MOOD_LABEL[n]}"><input type="radio" name="mood" value="${n}" ${Number(v.mood) === n ? 'checked' : ''}><span>${MOODS[n]}<small>${n}</small></span></label>`).join('')}</div></div>
        <label class="field"><span class="field-label">内容</span><textarea name="text" rows="6" placeholder="今日あったこと、考えたこと、気づいたこと…" ${e ? '' : 'autofocus'}>${esc(v.text)}</textarea></label>
        ${candidates.length ? `<div class="field"><span class="field-label">関連するタスク（任意）</span>
          <input class="link-filter" placeholder="絞り込み" data-input="linkFilter" aria-label="タスクを絞り込み">
          <div class="link-list">${candidates.map((i) => `<label class="link-opt" data-title="${esc(i.title.toLowerCase())}"><input type="checkbox" name="linked" value="${i.id}" ${v.linked.includes(i.id) ? 'checked' : ''}><span>${esc(i.title)}</span><small>${LISTS[i.list]}</small></label>`).join('')}</div></div>` : ''}
        <div class="btn-row between">${e ? `<button type="button" class="btn ghost danger" data-action="deleteJournal" data-id="${e.id}">削除</button>` : '<span></span>'}
          <span class="btn-row"><button type="button" class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" type="submit">保存</button></span></div>
      </form>`);
  }
  function submitJournal(form) {
    const fd = new FormData(form);
    const text = String(fd.get('text') || '').trim();
    if (!text) { toast('内容を入力してください'); return; }
    const data = { date: fd.get('date') || todayStr(), text, mood: Number(fd.get('mood')) || 0, linked: fd.getAll('linked').map(String) };
    const e = state.journal.find((x) => x.id === form.dataset.id);
    if (e) Object.assign(e, data, { updatedAt: nowIso() });
    else state.journal.push(normJournal(data));
    data.linked.forEach((id) => { const it = getItem(id); if (it) touch(it, true); }); // ジャーナルで触れた＝進捗あり
    save(); closeModal(); rerender(); toast('ジャーナルを保存しました');
  }

  function openMoveSheet(id) {
    const i = getItem(id);
    if (!i) return;
    openModal(`${modalHead('象限を移動')}<p class="muted small">「${esc(i.title)}」をどこに置きますか？</p>
      <div class="move-sheet">${QUADRANT_LAYOUT.map((q) => `<button class="qbtn ${q} ${i.quadrant === q ? 'current' : ''}" data-action="setQuadrant" data-id="${i.id}" data-q="${q}"><b>${QUADRANTS[q].label}</b><small>${QUADRANTS[q].hint}</small></button>`).join('')}</div>
      <button class="btn ghost wide" data-action="setQuadrant" data-id="${i.id}" data-q="">未分類に戻す</button>`);
  }
  function setQuadrant(id, q) {
    const i = getItem(id);
    if (!i || i.quadrant === q) return;
    i.quadrant = q; touch(i, false); save(); rerender();
    toast(q ? `「${QUADRANTS[q].label}」に移動しました` : '未分類に戻しました');
  }
  function openStuckReason(id) {
    const i = getItem(id);
    if (!i) return;
    openModal(`${modalHead('できていない理由')}<p><b>${esc(i.title)}</b></p><p class="muted small">${idleDays(i)}日進捗なし・作成から${daysSince(i.createdAt)}日</p>${reasonForm(i)}`);
  }
  function openStepTemplates(id) {
    openModal(`${modalHead('ステップのヒント')}
      <p class="muted small">テンプレートを選ぶとステップとして追加されます。追加後に自由に書き換え・並び替え・削除できます。</p>
      <div class="tpl-list">${Object.entries(STEP_TEMPLATES).map(([name, steps]) => `<details class="tpl"><summary><b>${esc(name)}</b><span class="muted small">${steps.length}ステップ</span></summary>
        <ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <button class="btn primary small" data-action="insertTemplate" data-id="${id}" data-tpl="${esc(name)}">このステップを追加</button></details>`).join('')}</div>
      <div class="tips"><h3>分け方のコツ</h3><ul><li>1ステップは「30分〜1日」でできる大きさに</li><li>最初のステップは「調べる」「決める」など軽いものに</li><li>他人待ちのステップには期限（リマインド日）を</li></ul></div>`);
  }
  function openPasteSteps(id) {
    openModal(`${modalHead('リストから貼り付け')}
      <form data-form="pasteSteps" data-id="${id}">
        <p class="muted small">1行に1ステップ。「1.」「①」「-」「・」などの記号は自動で取り除きます。メモ帳やAIの回答をそのまま貼り付けられます。</p>
        <textarea name="text" rows="8" placeholder="1. 物件サイトで相場を調べる&#10;2. 内見を3件予約する&#10;3. 申し込む" autofocus></textarea>
        <div class="btn-row end"><button type="button" class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" type="submit">ステップに追加</button></div>
      </form>`);
  }
  function parseStepLines(text) {
    return String(text).split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:\d+\s*[.)．、:：]|\(\d+\)|（\d+）|[①-⑳]|[-*•・●○◯□■☐✓✔]|STEP\s*\d+[:：.]?|ステップ\s*\d+[:：.]?)\s*/i, '').replace(/^\s*\[[ xX]?\]\s*/, '').trim())
      .filter((l) => l && !/^```/.test(l));
  }
  function addSteps(i, texts) {
    const existing = new Set(i.steps.map((s) => norm(s.text)));
    let n = 0;
    texts.forEach((t) => {
      const s = normStep(t);
      if (!s.text || existing.has(norm(s.text))) return;
      existing.add(norm(s.text)); i.steps.push(s); n++;
    });
    if (n) touch(i, true);
    return n;
  }
