
  // ───────────────────────── アクション ─────────────────────────
  function stepOf(d) { const i = getItem(d.id); return i ? [i, i.steps.find((s) => s.id === d.step)] : [null, null]; }
  const actions = {
    quickAdd: (d) => openQuickAdd({ list: d.list, quadrant: d.quadrant }),
    quickAddDetail: () => { const f = $('form[data-form=quickAdd]', modalBox); if (f && f.title.value.trim()) submitQuickAdd(f, true); else if (f) f.title.focus(); },
    closeModal: () => closeModal(),
    back: () => { if (history.length > 1) history.back(); else go('#home'); },
    openItem: (d) => { closeModal(); go('#item/' + d.id); },
    editItem: (d) => openItemEditor(d.id),
    toggleDone: (d) => {
      const i = getItem(d.id); if (!i) return;
      const snap = snapshot();
      setStatus(i, i.status === 'done' ? (i.steps.some((s) => s.done) ? 'doing' : 'todo') : 'done');
      save(); rerender();
      if (i.status === 'done') toast('完了！おつかれさまでした 🎉', { label: '元に戻す', run: () => restore(snap) });
    },
    deleteItem: (d) => {
      const i = getItem(d.id); if (!i) return;
      const snap = snapshot();
      state.items = state.items.filter((x) => x.id !== d.id);
      markDeleted(d.id);
      state.journal.forEach((e) => { if (e.linked.includes(d.id)) { e.linked = e.linked.filter((id) => id !== d.id); e.updatedAt = nowIso(); } });
      save(); closeModal();
      if (route().name === 'item') go('#' + ({ task: 'matrix', inbox: 'inbox', later: 'later', wish: 'wish' }[i.list] || 'home')); else rerender();
      undoable('削除しました', snap);
    },
    moveTo: (d) => {
      const i = getItem(d.id); if (!i) return;
      const snap = snapshot();
      if (d.list === 'lesson') {
        state.lessons.unshift(normLesson({ name: i.title, notes: i.notes, status: 'considering' }));
        state.items = state.items.filter((x) => x.id !== i.id); markDeleted(i.id);
      } else { i.list = d.list; touch(i, true); }
      save(); rerender();
      toast(`「${d.list === 'lesson' ? '習い事' : LISTS[d.list]}」に移動しました`, { label: '元に戻す', run: () => restore(snap) });
    },
    promote: (d) => {
      const i = getItem(d.id); if (!i) return;
      const snap = snapshot();
      i.list = 'wish'; touch(i, true); save(); rerender();
      toast('「やりたい事」に昇格しました ↑', { label: '元に戻す', run: () => restore(snap) });
    },
    reroll: () => {
      const pool = state.items.filter((i) => i.list === 'wish' && i.status !== 'done');
      if (pool.length > 1) { let p; do { p = pool[Math.floor(Math.random() * pool.length)]; } while (p.id === ui.randomId); ui.randomId = p.id; }
      rerender();
    },
    editFocus: () => {
      const y = thisYear();
      openModal(`${modalHead(y + '年のフォーカス')}<form data-form="focus"><textarea name="text" rows="4" placeholder="例：健康の土台をつくる／家族との時間を増やす" autofocus>${esc(state.focus[y] || '')}</textarea>
        <div class="btn-row end"><button type="button" class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" type="submit">保存</button></div></form>`);
    },
    addSamples: () => addSamples(),
    addMemoSamples: () => addMemoSamples(),
    removeSamples: () => removeSamples(),
    matrixFilter: (d) => { ui.matrixFilter = d.v; rerender(); },
    moveSheet: (d) => openMoveSheet(d.id),
    setQuadrant: (d) => { closeModal(); setQuadrant(d.id, d.q); },
    stuckReason: (d) => openStuckReason(d.id),
    toggleStep: (d) => {
      const [i, s] = stepOf(d); if (!s) return;
      s.done = !s.done; s.doneAt = s.done ? nowIso() : '';
      if (s.done && i.status === 'todo') i.status = 'doing';
      touch(i, true); save(); rerender();
      if (s.done && i.steps.every((x) => x.done) && i.status !== 'done') {
        toast('すべてのステップが完了しました！', { label: '項目を完了にする', run: () => { setStatus(i, 'done'); save(); rerender(); } });
      }
    },
    stepUp: (d) => { const [i, s] = stepOf(d); if (!s) return; const k = i.steps.indexOf(s); if (k > 0) { [i.steps[k - 1], i.steps[k]] = [i.steps[k], i.steps[k - 1]]; touch(i); save(); rerender(); } },
    stepDown: (d) => { const [i, s] = stepOf(d); if (!s) return; const k = i.steps.indexOf(s); if (k < i.steps.length - 1) { [i.steps[k + 1], i.steps[k]] = [i.steps[k], i.steps[k + 1]]; touch(i); save(); rerender(); } },
    stepDelete: (d) => { const [i, s] = stepOf(d); if (!s) return; const snap = snapshot(); i.steps = i.steps.filter((x) => x !== s); touch(i); save(); rerender(); undoable('ステップを削除しました', snap); },
    stepTemplates: (d) => openStepTemplates(d.id),
    insertTemplate: (d) => { const i = getItem(d.id); if (!i) return; const n = addSteps(i, STEP_TEMPLATES[d.tpl] || []); save(); closeModal(); rerender(); toast(`「${d.tpl}」のステップを ${n}件 追加しました`); },
    pasteSteps: (d) => openPasteSteps(d.id),
    editLesson: (d) => openLessonEditor(d.id),
    deleteLesson: (d) => { const snap = snapshot(); state.lessons = state.lessons.filter((l) => l.id !== d.id); markDeleted(d.id); save(); closeModal(); rerender(); undoable('削除しました', snap); },
    addLog: (d) => openLogAdd(d.id),
    addLogRow: () => { const box = $('#logRows'); box.insertAdjacentHTML('afterbegin', logRow({ id: uid(), date: todayStr(), memo: '' })); const m = $('[name=logMemo]', box); if (m) m.focus(); },
    removeRow: (d, el) => el.closest('.log-row').remove(),
    editJournal: (d) => openJournalEditor(d.id),
    deleteJournal: (d) => { const snap = snapshot(); const j = state.journal.find((e) => e.id === d.id); if (j) j.photos.forEach(tombPhoto); state.journal = state.journal.filter((e) => e.id !== d.id); markDeleted(d.id); save(); closeModal(); rerender(); undoable('削除しました', snap); if (j && j.photos.length) setTimeout(() => photoGc(), PHOTO_GRACE + 1000); },
    coachDays: (d) => { ui.coachDays = Number(d.v); ui.coachText = coachText(ui.coachDays); rerender(); },
    coachRefresh: () => { ui.coachText = coachText(ui.coachDays); rerender(); toast('最新の内容に更新しました'); },
    coachCopy: async () => { toast((await copyText(ui.coachText)) ? 'コピーしました。AIアシスタントに貼り付けてください' : 'コピーできませんでした。テキストを長押しして選択してください'); },
    coachShare: async () => { if (!(await shareText('ライフプラン相談', ui.coachText, false))) toast('共有できませんでした'); },
    coachJson: () => downloadText(`lifeplan-coach-${todayStr().replace(/-/g, '')}.json`, JSON.stringify(coachData(ui.coachDays), null, 2)),
    coachJsonCopy: async () => { toast((await copyText(JSON.stringify(coachData(ui.coachDays), null, 2))) ? 'JSONをコピーしました' : 'コピーできませんでした'); },
    coachSaveAdvice: () => {
      const ta = $('#coachInput'); const text = ta.value.trim();
      if (!text) { toast('アドバイスを貼り付けてください'); return; }
      state.coachNotes.push(normCoach({ text, read: true, source: 'paste' })); save(); ta.value = ''; rerender(); toast('コーチからのアドバイスを保存しました');
    },
    coachImportSteps: () => { const text = $('#coachInput').value.trim(); if (!text) { toast('JSONを貼り付けてください'); return; } importCoachSteps(text); },
    deleteCoach: (d) => { const snap = snapshot(); state.coachNotes = state.coachNotes.filter((c) => c.id !== d.id); markDeleted(d.id); save(); rerender(); undoable('削除しました', snap); },
    markRead: (d) => { const c = state.coachNotes.find((x) => x.id === d.id); if (c) { c.read = true; c.updatedAt = nowIso(); save(); rerender(); } },
    markAllRead: () => { state.coachNotes.forEach((c) => { if (!c.read) { c.read = true; c.updatedAt = nowIso(); } }); save(); rerender(); },
    exportJson: () => { downloadText(backupName(), exportText()); toast('書き出しました'); },
    shareJson: async () => { if (!(await shareText(backupName(), exportText(), true))) toast('共有できませんでした。「JSONで書き出す」を使ってください'); },
    copyJson: async () => { toast((await copyText(exportText())) ? 'バックアップをコピーしました' : 'コピーできませんでした'); },
    importJson: () => openImport(),
    importPickFile: async () => { const t = await pickFile('application/json,.json,text/plain'); if (t != null) { const ta = $('#importText'); if (ta) ta.value = t; toast('ファイルを読み込みました。「読み込む」を押してください'); } },
    importRun: () => { const ta = $('#importText'); const mode = ($('input[name=importMode]:checked') || {}).value || 'merge'; if (!ta.value.trim()) { toast('ファイルを選ぶか貼り付けてください'); return; } runImport(ta.value, mode); },
    remindersImport: () => openRemindersImport(),
    remindersPickFile: async () => { const t = await pickFile('application/json,.json,text/plain'); if (t != null) { const ta = $('#remText'); if (ta) ta.value = t; toast('ファイルを読み込みました。「読み込む」を押してください'); } },
    remindersRun: () => {
      const ta = $('#remText'); if (!ta.value.trim()) { toast('ファイルを選ぶか貼り付けてください'); return; }
      const snap = snapshot();
      const r = importReminders(ta.value, $('#remIncludeDone').checked);
      if (!r) return;
      closeModal(); go('#inbox');
      toast(`未整理に ${r.added}件 追加${r.dup ? `・重複 ${r.dup}件スキップ` : ''}${r.done ? `・完了済み ${r.done}件スキップ` : ''}${r.invalid ? `・不正 ${r.invalid}件` : ''}`, r.added ? { label: '元に戻す', run: () => restore(snap) } : null);
    },
    deleteCat: async (d) => {
      const c = state.categories[Number(d.idx)];
      const used = state.items.filter((i) => i.category === c).length;
      if (used && !(await confirmDialog(`「${c}」は ${used}件 で使われています。削除すると、それらはカテゴリなしになります。`, '削除する', true))) return;
      state.categories.splice(Number(d.idx), 1); state.categoriesAt = nowIso();
      state.items.forEach((i) => { if (i.category === c) { i.category = ''; touch(i); } });
      save(); rerender();
    },
    theme: (d) => { state.settings.theme = d.v; saveLocal(); applyTheme(); rerender(); },
    setBg: (d) => { state.settings.bg = BACKGROUNDS[d.v] ? d.v : 'mist'; saveLocal(); applyTheme(); rerender(); },
    openDrawer: () => openDrawer(),
    closeDrawer: () => closeDrawer(),
    habitToggle: (d) => toggleHabitDay(d.id, d.date),
    habitMark: (d) => markHabitDay(d.id, d.mark, d.date),
    habitCycle: (d) => cycleHabitDay(d.id, d.date),
    forceUpdate: () => { closeDrawer(); forceUpdate(); },
    toggleJDay: (d, el) => toggleJournalDay(d.date, el),
    viewPhoto: (d) => viewPhoto(d.photoId, d.entry),
    removeEditorPhoto: (d) => removeEditorPhoto(d.photoId),
    habitMonth: (d) => {
      const h = getHabit(d.id); if (!h) return;
      const cur = todayStr().slice(0, 7); const base = ui.habitMonth[h.id] || cur;
      if (d.dir === '0') { delete ui.habitMonth[h.id]; rerender(); return; }
      const [y, m] = base.split('-').map(Number); const dt = new Date(y, m - 1 + Number(d.dir), 1);
      const ym = monthKey(dt);
      if (ym > cur || ym < habitMinYm(h)) return;
      ui.habitMonth[h.id] = ym; rerender();
    },
    editHabit: (d) => openHabitEditor(d.id),
    deleteHabit: (d) => deleteHabit(d.id),
    pickEmoji: (d) => { const inp = $('form[data-form=habit] input[name=emoji]', modalBox); if (inp) inp.value = d.v; },
    quickAddFromDrawer: () => { closeDrawer(); openQuickAdd({}); },
    wipeAll: async () => {
      if (!(await confirmDialog(`すべてのデータを削除します。${sync.connected ? 'GitHub 上のデータも空になります。' : ''}先にバックアップを書き出すことをおすすめします。本当に削除しますか？`, 'すべて削除', true))) return;
      const snap = snapshot();
      const del = { ...state.deleted };
      SYNC_COLLECTIONS.forEach((k) => state[k].forEach((x) => { del[x.id] = nowIso(); }));
      const theme = state.settings.theme;
      state = defaultState(); state.deleted = del; state.settings.theme = theme; state.categoriesAt = nowIso();
      save(); applyTheme(); go('#home'); undoable('すべて削除しました', snap);
    },
    syncNow: async () => { if (!navigator.onLine) { toast('オフラインです'); return; } await syncNow(); toast(sync.lastError ? '⚠️ ' + sync.lastError : '同期しました ✓'); },
    syncPullOnly: async () => { await syncNow({ pullOnly: true }); toast(sync.lastError ? '⚠️ ' + sync.lastError : 'GitHub から読み込みました'); },
    syncInboxNow: async () => {
      try { const n = await pullCoachInbox(); toast(n ? `新着 ${n}件` : '新着はありません'); } catch (e) { toast('⚠️ ' + e.message); }
    },
    pickPhoto: () => pickPhoto(),
    goAiSettings: () => { closeModal(); go('#settings/ai'); },
    photoSkip: () => nextPhoto(),
    photoApplyMatrix: () => photoApplyMatrix(),
    photoZoom: (d, el) => { el.classList.toggle('zoom'); },
    openObsidian: () => openObsidianImport(),
    obsidianPick: () => { const i = $('#obsidianInput'); if (i) { i.value = ''; i.click(); } },
    aiChip: (d) => {
      if (d.v === 'このタスクをステップに分けて') return openAiStepPicker();
      aiSend(d.v);
    },
    aiPickTask: (d) => { closeModal(); aiSend(`「${d.v}」をステップに分けて`); },
    aiPickCustom: () => { closeModal(); aiUi.draft = '「」をステップに分けて'; rerender(); const t = $('form[data-form=aiChat] textarea'); if (t) { t.focus(); t.setSelectionRange(1, 1); } },
    aiClear: async () => {
      if (!(await confirmDialog('この端末に保存されているAIとの会話をすべて消します。', 'クリアする', true))) return;
      aiHist = []; saveAiHist(); rerender(); toast('会話をクリアしました');
    },
    aiAddSteps: (d) => {
      const m = aiHist.find((x) => x.id === d.id); if (!m || !m.steps) return;
      const snap = snapshot();
      const msgs = applyStepSets(m.steps);
      if (!msgs.length) { toast('追加できるステップがありませんでした'); return; }
      save(); m.stepsAdded = true; saveAiHist(); rerender();
      toast(msgs.join(' ／ '), { label: '元に戻す', run: () => { restore(snap); m.stepsAdded = false; saveAiHist(); rerender(); } });
    },
    aiSaveJournal: (d) => {
      const m = aiHist.find((x) => x.id === d.id); if (!m) return;
      const q = [...aiHist.slice(0, aiHist.indexOf(m))].reverse().find((x) => x.role === 'user');
      state.journal.push(normJournal({ date: todayStr(), text: `🤖 AIに相談（Gemini）${q ? '\n相談：' + q.text : ''}\n\n${aiDisplayText(m)}`, mood: 0, source: 'ai' }));
      save(); m.savedJournal = true; saveAiHist(); rerender(); toast('ジャーナルに保存しました', { label: '開く', run: () => go('#journal') });
    },
    aiCopy: async (d) => { const m = aiHist.find((x) => x.id === d.id); if (m) toast((await copyText(aiDisplayText(m))) ? 'コピーしました' : 'コピーできませんでした'); },
    aiToggleKey: () => { aiUi.showKey = !aiUi.showKey; const i = $('#aiKeyInput'); if (i) i.type = aiUi.showKey ? 'text' : 'password'; const b = $('[data-action=aiToggleKey]'); if (b) b.textContent = aiUi.showKey ? '隠す' : '表示'; },
    aiTest: () => aiTest(),
    aiDeleteKey: async () => {
      if (!(await confirmDialog('この端末に保存した Gemini APIキーを削除します。', '削除する', true))) return;
      ai.key = ''; saveAi(); aiUi.showKey = false; rerender(); toast('APIキーを削除しました');
    },
    syncDisconnect: async () => {
      if (!(await confirmDialog('この端末の GitHub 接続を解除し、トークンを削除します（GitHub 上のデータとこの端末のデータは残ります）。', '解除する', true))) return;
      sync = { ...SYNC_DEFAULTS, owner: sync.owner, repo: sync.repo, branch: sync.branch, path: sync.path, inboxPath: sync.inboxPath };
      saveSync(); setSyncState('off'); rerender(); toast('接続を解除しました');
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset, el, e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && e.target.matches('form[data-form=aiChat] textarea') && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); e.target.form.requestSubmit(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-action]')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const d = el.dataset;
    switch (d.change) {
      case 'wishFilter': ui.wish[d.k] = el.value; rerender(); break;
      case 'laterSort': ui.laterSort = el.value; rerender(); break;
      case 'stepText': { const [i, s] = stepOf(d); if (s) { const v = el.value.trim(); if (v) { s.text = v; touch(i); save(); } else el.value = s.text; } break; }
      case 'stepDue': { const [i, s] = stepOf(d); if (s) { s.due = el.value || ''; touch(i); save(); rerender(); } break; }
      case 'renameCat': {
        const idx = Number(d.idx); const old = state.categories[idx]; const v = el.value.trim();
        if (!v || (v !== old && state.categories.includes(v))) { el.value = old; toast('同じ名前のカテゴリがあります'); break; }
        state.categories[idx] = v; state.categoriesAt = nowIso();
        state.items.forEach((i) => { if (i.category === old) { i.category = v; touch(i); } });
        save(); toast('カテゴリ名を変更しました'); break;
      }
      case 'journalPhoto': if (el.files && el.files.length) startPhotoQueue(el.files); break;
      case 'journalEntryPhoto': if (el.files && el.files.length) { const fs = [...el.files]; el.value = ''; addEditorPhotos(fs); } break;
      case 'obsidianFiles': if (el.files && el.files.length) importObsidianFiles(el.files); break;
      case 'aiShare': ai.share = el.checked; saveAi(); toast(ai.share ? 'タスクとジャーナルの要約を共有します' : 'データを共有せずに相談します'); rerender(); break;
      case 'syncAuto': sync.auto = el.checked; saveSync(); if (sync.auto) syncNow(); setSyncState(syncState); toast(sync.auto ? '自動同期をオンにしました' : '自動同期をオフにしました'); break;
      default: break;
    }
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    if (el.dataset.input === 'search') { ui.searchQuery = el.value; $('#searchResults').innerHTML = searchResults(el.value); }
    if (el.dataset.input === 'journalSearch') { ui.journalQuery = el.value; const jl = $('#journalList'); jl.innerHTML = journalList(el.value); hydratePhotos(jl); }
    if (el.dataset.input === 'aiDraft') { aiUi.draft = el.value; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
    if (el.dataset.input === 'linkFilter') { const q = el.value.trim().toLowerCase(); $$('.link-opt', modalBox).forEach((o) => { o.hidden = !!q && !o.dataset.title.includes(q); }); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const fd = new FormData(f);
    switch (f.dataset.form) {
      case 'quickAdd': submitQuickAdd(f, false); break;
      case 'item': submitItem(f); break;
      case 'lesson': submitLesson(f); break;
      case 'journal': submitJournal(f); break;
      case 'habit': submitHabit(f); break;
      case 'syncSetup': testConnection(f); break;
      case 'photoJournal': submitPhotoJournal(f); break;
      case 'obsidianPaste': submitObsidianPaste(f); break;
      case 'aiChat': { const t = String(fd.get('text') || ''); if (t.trim()) aiSend(t); break; }
      case 'aiSetup': {
        const k = String(fd.get('key') || '').trim(); const model = String(fd.get('model') || AI_DEFAULT_MODEL);
        if (k) ai.key = k; ai.model = AI_MODELS[model] ? model : AI_DEFAULT_MODEL; saveAi(); rerender();
        toast(k ? '保存しました（この端末だけに保存）' : 'モデルを保存しました'); break;
      }
      case 'capture': {
        const t = String(fd.get('title') || '').trim();
        if (!t) return;
        addItem({ title: t, list: 'inbox' }); rerender();
        const inp = $('form[data-form=capture] input'); if (inp) inp.focus();
        toast('未整理に追加しました'); break;
      }
      case 'log': {
        const l = getLesson(f.dataset.id); if (!l) return;
        l.logs.push({ id: uid(), date: fd.get('date') || todayStr(), memo: String(fd.get('memo') || '').trim() });
        l.updatedAt = nowIso(); save(); closeModal(); rerender(); toast(`記録しました（今月 ${sessionsThisMonth(l)}回目）`); break;
      }
      case 'focus': { const y = thisYear(); state.focus[y] = String(fd.get('text') || '').trim(); state.focusAt[y] = nowIso(); save(); closeModal(); rerender(); toast('保存しました'); break; }
      case 'addStep': {
        const i = getItem(f.dataset.id); const t = String(fd.get('text') || '').trim();
        if (!i || !t) return;
        i.steps.push(normStep(t)); touch(i, true); save(); rerender();
        const inp = $('form[data-form=addStep] input'); if (inp) inp.focus();
        break;
      }
      case 'pasteSteps': {
        const i = getItem(f.dataset.id); if (!i) return;
        const n = addSteps(i, parseStepLines(fd.get('text'))); save(); closeModal(); rerender(); toast(n ? `${n}件のステップを追加しました` : '追加できる行がありませんでした'); break;
      }
      case 'reason': {
        const i = getItem(f.dataset.id); if (!i) return;
        i.stuck = { tags: fd.getAll('tags').map(String), text: String(fd.get('text') || '').trim(), updatedAt: nowIso() };
        touch(i, false); save(); closeModal(); rerender(); toast('理由を保存しました'); break;
      }
      case 'addCat': {
        const n = String(fd.get('name') || '').trim();
        if (!n) return; if (state.categories.includes(n)) { toast('すでにあります'); return; }
        state.categories.push(n); state.categoriesAt = nowIso(); save(); rerender(); break;
      }
      default: break;
    }
  });

  // ドラッグ＆ドロップ（PC向け。iPhoneは ⇄ ボタンで移動）
  let dragId = null;
  document.addEventListener('dragstart', (e) => {
    const c = e.target.closest && e.target.closest('.card.item[draggable=true]');
    if (!c) return;
    dragId = c.dataset.id; c.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* noop */ }
  });
  document.addEventListener('dragend', () => { dragId = null; $$('.dragging, .drop-over').forEach((x) => x.classList.remove('dragging', 'drop-over')); });
  document.addEventListener('dragover', (e) => {
    const z = e.target.closest && e.target.closest('[data-drop]');
    if (!z || !dragId) return;
    e.preventDefault();
    $$('.drop-over').forEach((x) => x !== z && x.classList.remove('drop-over'));
    z.classList.add('drop-over');
  });
  document.addEventListener('drop', (e) => {
    const z = e.target.closest && e.target.closest('[data-drop]');
    if (!z || !dragId) return;
    e.preventDefault();
    const q = z.dataset.drop === 'none' ? '' : z.dataset.drop;
    const id = dragId; dragId = null;
    setQuadrant(id, q);
  });

  // ───────────────────────── テーマ・起動 ─────────────────────────
  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    document.documentElement.setAttribute('data-bg', state.settings.bg || 'mist');
  }
  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) { state = load(); applyTheme(); rerenderSoft(); } });

  if ('serviceWorker' in navigator) {
    if (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)) {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        swStatus = '有効（オフラインでも使えます）';
        const el = $('#swStatus'); if (el) el.textContent = swStatus;
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('新しいバージョンがあります', { label: '再読み込み', run: () => location.reload() }); });
        });
      }).catch((err) => { swStatus = '登録に失敗：' + err.message; const el = $('#swStatus'); if (el) el.textContent = swStatus; });
    } else swStatus = 'HTTPSで開くと有効になります';
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // 自動同期のきっかけ：起動時・画面に戻ったとき・オンライン復帰・定期（表示中のみ）・閉じる直前
  document.addEventListener('visibilitychange', () => {
    if (!sync.connected || !sync.auto) return;
    if (document.visibilityState === 'visible') {
      if (!sync.lastSyncAt || Date.now() - new Date(sync.lastSyncAt).getTime() > 20000 || sync.dirty) syncNow();
    } else if (sync.dirty) syncNow();
  });
  window.addEventListener('online', () => { if (sync.connected && sync.auto) syncNow(); });
  window.addEventListener('offline', () => { if (sync.connected) setSyncState('offline'); });
  setInterval(() => { if (sync.connected && sync.auto && document.visibilityState === 'visible') syncNow(); }, 180000);

  applyTheme();
  render(false);
  afterUpdate();
  $$('.app-version').forEach((el) => { el.textContent = 'v' + APP_VERSION; });
  setTimeout(() => photoGc(), 5000);
  setSyncState(syncState);
  if (sync.connected && sync.auto) syncNow();

  // テスト・デバッグ用（読み取りのみ）
  window.LifePlan = { get state() { return state; }, get sync() { return { ...sync, token: sync.token ? '(保存済み)' : '' }; }, get syncState() { return syncState; }, get swStatus() { return swStatus; }, version: APP_VERSION, get ai() { return { hasKey: !!ai.key, model: ai.model, share: ai.share, history: aiHist.map((m) => ({ ...m })) }; }, aiSystemPrompt: () => aiSystemPrompt(), parseNote, parseStepLines, extractJson, pomu: (h, today) => { const i = pomuInfo(normHabit(h), today); return { key: i.key, name: i.name, route: i.route, lv: i.lv, total: i.total, M: i.M, streak: i.streak, best: i.best, hints: i.hints }; }, pomuChangeMsg, syncNow: () => syncNow(), topPomu: () => { const p = topPomu(); return { key: p.key, lv: p.lv, id: p.h ? p.h.id : '' }; }, photoIds: async () => (await photoAll()).map((r) => r.id).sort(), photoInfo: async (id) => { const r = await photoGet(id); return r ? { id: r.id, bytes: r.full.byteLength, synced: !!r.synced } : null; }, syncPhotos: () => syncPhotos(), photoGc: () => photoGc(), photoDims: async (id) => { const r = await photoGet(id); if (!r) return null; const b = await createImageBitmap(new Blob([r.full], { type: 'image/jpeg' })); return [b.width, b.height, r.full.byteLength]; } };
})();
