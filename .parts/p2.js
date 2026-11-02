
  // ───────────────────────── 小さなHTML部品 ─────────────────────────
  const ICON = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4L18 8"/></svg>',
    move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l-3 3 3 3M4 7h12M17 14l3 3-3 3M20 17H8"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14l5-5 5 5"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };
  const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  const options = (map, cur, emptyLabel) => (emptyLabel != null ? opt('', emptyLabel, cur) : '') + Object.entries(map).map(([k, v]) => opt(k, v, cur)).join('');
  const catOptions = (cur, emptyLabel = '（なし）') => opt('', emptyLabel, cur) + state.categories.map((c) => opt(c, c, cur)).join('') + (cur && !state.categories.includes(cur) ? opt(cur, cur, cur) : '');
  function progressBar(done, total, cls = '') {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `<div class="progress ${cls}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
  }
  function emptyState(title, body, buttons = '') {
    return `<div class="empty"><div class="empty-art" aria-hidden="true">🌱</div><h3>${esc(title)}</h3><p>${body}</p>${buttons ? `<div class="btn-row center">${buttons}</div>` : ''}</div>`;
  }
  function sectionHead(title, sub = '', right = '') {
    return `<div class="view-head"><div><h1>${VIEW_ICON[title] ? `<span class="h-ico" aria-hidden="true">${VIEW_ICON[title]}</span>` : ''}${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${right}</div>`;
  }
  function itemChips(i, o = {}) {
    const c = [];
    if (o.showList) c.push(chip(LISTS[i.list], 'list'));
    if (i.source === 'ai') c.push(chip('🤖 AI提案から', 'ai-chip'));
    if (i.quadrant && !o.hideQuadrant) c.push(chip(QUADRANTS[i.quadrant].label, 'qchip ' + i.quadrant));
    if (i.category) c.push(chip(i.category, 'cat'));
    if (i.list !== 'inbox' || i.importance !== 'mid') c.push(chip('重要度 ' + IMPORTANCE[i.importance], 'imp-' + i.importance));
    if (i.timeframe) c.push(chip(TIMEFRAME[i.timeframe], 'tf'));
    if (i.targetDate && i.status !== 'done') {
      const n = daysUntil(i.targetDate);
      c.push(chip(`${fmtShort(i.targetDate)}・${dueText(i.targetDate)}`, n < 0 ? 'due over' : n <= 7 ? 'due soon' : 'due'));
    }
    if (i.status === 'doing') c.push(chip('進行中', 'doing'));
    if (isStuck(i)) c.push(chip(`停滞 ${idleDays(i)}日`, 'stuck'));
    if (i.reminderList) c.push(chip('リマインダー: ' + i.reminderList, 'src'));
    i.tags.slice(0, 3).forEach((t) => c.push(chip('#' + t, 'tag')));
    return `<div class="chips">${c.join('')}</div>`;
  }
  function itemCard(i, ctx = '') {
    const total = i.steps.length;
    const done = stepsDone(i);
    let actions = '';
    if (ctx === 'later') actions = `<button class="btn small soft" data-action="promote" data-id="${i.id}">やりたい事へ ↑</button>`;
    if (ctx === 'inbox') actions = `<div class="move-row">
        <button class="btn small soft" data-action="moveTo" data-list="task" data-id="${i.id}">タスク</button>
        <button class="btn small soft" data-action="moveTo" data-list="wish" data-id="${i.id}">やりたい事</button>
        <button class="btn small soft" data-action="moveTo" data-list="later" data-id="${i.id}">後回し</button>
        <button class="btn small soft" data-action="moveTo" data-list="lesson" data-id="${i.id}">習い事</button>
        <button class="icon-btn small danger" data-action="deleteItem" data-id="${i.id}" aria-label="削除">${ICON.trash}</button></div>`;
    if (ctx === 'matrix') actions = `<button class="icon-btn small" data-action="moveSheet" data-id="${i.id}" aria-label="象限を移動">${ICON.move}</button>`;
    const showList = ctx === 'search' || (ctx === 'matrix' && ui.matrixFilter === 'all' && i.list !== 'task');
    return `<article class="card item ${i.status === 'done' ? 'is-done' : ''} ${ctx === 'matrix' ? 'compact' : ''} ${isStuck(i) ? 'is-stuck' : ''}" data-id="${i.id}" ${ctx === 'matrix' ? 'draggable="true"' : ''}>
      <div class="item-row">
        <button class="check ${i.status === 'done' ? 'on' : ''}" data-action="toggleDone" data-id="${i.id}" aria-label="${i.status === 'done' ? '未完了に戻す' : '完了にする'}">${ICON.check}</button>
        <span class="item-ico" aria-hidden="true">${itemIcon(i)}</span>
        <div class="item-main" data-action="openItem" data-id="${i.id}" role="button" tabindex="0">
          ${ctx === 'matrix' ? actions : ''}<h3 class="item-title">${esc(i.title)}</h3>
          ${i.notes && ctx !== 'matrix' ? `<p class="item-notes">${esc(trunc(i.notes, 90))}</p>` : ''}
          ${itemChips(i, { showList, hideQuadrant: ctx === 'matrix' })}
          ${total ? `<div class="mini-steps">${progressBar(done, total, 'thin')}<span>ステップ ${done}/${total}</span></div>` : ''}
        </div>
      </div>
      ${ctx !== 'matrix' && actions ? `<div class="item-actions">${actions}</div>` : ''}
    </article>`;
  }
  const sortedCoach = () => [...state.coachNotes].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  function adviceCard(c, prominent) {
    const long = c.text.length > 400;
    return `<article class="advice ${c.read ? '' : 'unread'}">
      <div class="advice-head"><div>${c.read ? '' : '<span class="new-badge">NEW</span>'}<b>${esc(c.title || fmtDate(c.date))}</b>${c.title ? `<span class="muted small"> ${fmtDate(c.date)}</span>` : ''}</div>
        ${prominent ? '' : `<button class="icon-btn small danger" data-action="deleteCoach" data-id="${c.id}" aria-label="削除">${ICON.trash}</button>`}</div>
      <p class="pre">${esc(prominent && long ? trunc(c.text, 400) : c.text)}</p>
      ${c.suggestIds && c.suggestIds.length ? `<div class="steps-result coach-sug"><b>🤖 AI提案に ${c.suggestIds.length}件</b><ul>${c.suggestIds.map((id) => state.aiSuggestions.find((s) => s.id === id)).filter(Boolean).map((s) => `<li>${esc(s.title)}<span class="muted small">（${QUADRANTS[s.quadrant].label}${s.status === 'moved' ? '・移動済み' : s.status === 'dismissed' ? '・見送り' : ''}）</span></li>`).join('')}</ul><a class="btn soft small" href="#aisuggest">AI提案を見る</a></div>` : ''}
      ${c.stepsResult && c.stepsResult.length ? `<div class="steps-result"><b>追加されたステップ</b><ul>${c.stepsResult.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      ${prominent ? `<div class="btn-row"><button class="btn primary small" data-action="markRead" data-id="${c.id}">✓ 読んだ</button>${long ? '<a class="btn soft small" href="#coach">全文を見る</a>' : ''}</div>` : ''}
    </article>`;
  }

  // ───────────────────────── 画面: ホーム ─────────────────────────
  function viewHome() {
    const items = state.items;
    const wish = items.filter((i) => i.list === 'wish');
    const wishDone = wish.filter((i) => i.status === 'done').length;
    const tasks = activeItems().filter((i) => i.list === 'task');
    const later = activeItems().filter((i) => i.list === 'later');
    const inbox = activeItems().filter((i) => i.list === 'inbox');
    const activeLessons = state.lessons.filter((l) => l.status === 'active');
    const isEmpty = !items.length && !state.lessons.length && !state.journal.length;
    const out = [];
    const d = new Date();
    const hr = d.getHours();
    const greet = hr < 5 ? 'こんばんは' : hr < 11 ? 'おはようございます' : hr < 18 ? 'こんにちは' : 'こんばんは';
    const nStuck = activeItems().filter(isStuck).length;
    out.push(`<section class="hero" aria-label="ホーム">
      <div class="hero-in">
        <img class="avatar hero-avatar" src="images/avatar-256.png" alt="" width="72" height="72">
        <div class="grow"><p class="hero-date">${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）</p>
          <h1 class="hero-title">${greet}</h1>
          <p class="hero-sub">${isEmpty ? 'やりたい事を、一歩ずつ。' : `未完了のタスク ${tasks.length}件${nStuck ? `・停滞 ${nStuck}件` : ''}・やりたい事 ${wish.length - wishDone}件`}</p></div>
      </div>
      <div class="hero-links"><a class="hero-pill" href="#ai">🤖 AIに相談</a><a class="hero-pill" href="#habits">🐣 スタンプ</a><a class="hero-pill" href="#matrix">🧭 マトリクス</a><a class="hero-pill" href="#journal">📔 今日を書く</a></div>
    </section>`);

    // コーチからの新着アドバイス（いちばん目立つ場所に）
    const unread = sortedCoach().filter((c) => !c.read);
    if (unread.length) {
      out.push(`<section class="card coach-new">
        <div class="card-head"><h2>💬 コーチからの新着アドバイス <span class="count new">${unread.length}</span></h2>${unread.length > 1 ? '<button class="btn small soft" data-action="markAllRead">すべて既読</button>' : ''}</div>
        ${unread.slice(0, 3).map((c) => adviceCard(c, true)).join('')}
        ${unread.length > 3 ? `<a class="link" href="#coach">ほか ${unread.length - 3} 件を見る</a>` : ''}
      </section>`);
    }

    // ✨ 今日の分析（Gemini）
    out.push(homeCountdownCard());
    out.push(homeScheduleCard());
    out.push(homeAnalysisCard());

    if (isEmpty) {
      out.push(`<section class="card welcome">
        <h2>ようこそ 🌿</h2>
        <p>やりたい事、後回しでいい事、習い事、日々のタスクをひとつにまとめる自分専用のノートです。データはこの端末のブラウザの中（と、設定すればあなたの GitHub リポジトリ）だけに保存されます。</p>
        <p class="muted">まずは右下の「＋」から思いついたことを書いてみましょう。使い方を見たいときはサンプルを追加できます（あとから削除できます）。</p>
        <div class="btn-row">
          <button class="btn primary" data-action="quickAdd">＋ 追加する</button>
          <button class="btn soft" data-action="addSamples">サンプルを追加</button>
          <button class="btn soft" data-action="addMemoSamples">サンプルを追加（手書きメモから）</button>
        </div>
      </section>`);
    }
    if (!sync.connected) {
      out.push(`<a class="card hint-card" href="#settings/sync"><b>🔗 AIコーチと自動でつなぐ</b><span class="muted small">設定でトークンを1回貼るだけ。以後は自動で保存・読み込みされ、コーチのアドバイスもここに届きます。</span></a>`);
    }

    // 習慣スタンプ（今日のスタンプとぽむ）
    if (state.habits.length || !isEmpty) { checkPomuChanges(); out.push(homeHabitsCard()); }

    // 今年のフォーカス
    const focus = state.focus[thisYear()] || '';
    out.push(`<section class="card focus" data-action="editFocus" role="button" tabindex="0">
      <div class="label">${thisYear()}年のフォーカス</div>
      ${focus ? `<p class="focus-text">${esc(focus)}</p>` : '<p class="muted">タップして今年いちばん大事にしたいことを書く</p>'}
    </section>`);

    // AIに相談（Gemini）
    out.push(`<a class="card ai-entry" href="#ai"><span class="ai-emoji" aria-hidden="true">🤖</span><span class="grow"><b>AIに相談（Gemini）</b><span class="muted small">今週何から？ 停滞の原因は？ その場でコーチに聞けます</span></span><span class="chev" aria-hidden="true">›</span></a>`);

    // 数字
    out.push(`<section class="stats">
      <a class="stat" href="#matrix"><span class="n">${tasks.length}</span><span class="l">タスク</span></a>
      <a class="stat" href="#wish"><span class="n">${wish.length - wishDone}<small>/${wish.length}</small></span><span class="l">やりたい事</span></a>
      <a class="stat" href="#later"><span class="n">${later.length}</span><span class="l">後回し</span></a>
      <a class="stat" href="#inbox"><span class="n">${inbox.length}</span><span class="l">未整理</span></a>
      <a class="stat" href="#lessons"><span class="n">${activeLessons.length}</span><span class="l">習い事 ${fmtYen(activeLessonCost())}/月</span></a>
    </section>`);

    // マトリックスの概要
    const act = activeItems();
    if (act.some((i) => i.quadrant)) {
      out.push(`<section class="card">
        <div class="card-head"><h2>マトリックス</h2><a class="link" href="#matrix">開く</a></div>
        <div class="mini-matrix">${QUADRANT_LAYOUT.map((q) => {
          const list = act.filter((i) => i.quadrant === q);
          return `<a href="#matrix" class="mm ${q}"><b>${list.length}</b><span>${QUADRANTS[q].label}</span><em>${list.slice(0, 2).map((i) => esc(trunc(i.title, 12))).join('・')}</em></a>`;
        }).join('')}</div>
      </section>`);
    }

    // 停滞
    const stuck = act.filter(isStuck).sort((a, b) => idleDays(b) - idleDays(a));
    if (stuck.length) {
      out.push(`<section class="card">
        <div class="card-head"><h2>ずっとできていない事 <span class="count stuck">${stuck.length}</span></h2></div>
        <p class="muted small">${STUCK_DAYS}日以上進んでいない項目です。理由を書くと次の一歩が見つけやすくなります。</p>
        <ul class="plain-list">${stuck.slice(0, 6).map((i) => `<li class="stuck-row">
          <div class="grow" data-action="openItem" data-id="${i.id}" role="button" tabindex="0"><b>${esc(i.title)}</b>
            <div class="muted small">${idleDays(i)}日進捗なし・作成から${daysSince(i.createdAt)}日${i.stuck.tags.length ? '・理由: ' + esc(i.stuck.tags.join('、')) : ''}</div></div>
          <button class="btn small soft" data-action="stuckReason" data-id="${i.id}">${i.stuck.tags.length || i.stuck.text ? '理由を編集' : '理由を記録'}</button>
        </li>`).join('')}</ul>
        ${stuck.length > 6 ? `<p class="muted small">ほか ${stuck.length - 6} 件</p>` : ''}
      </section>`);
    }

    // 期限が近い
    const soon = act.filter((i) => i.targetDate && daysUntil(i.targetDate) <= 30).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
    const soonSteps = [];
    act.forEach((i) => i.steps.forEach((s) => { if (!s.done && s.due && daysUntil(s.due) <= 14) soonSteps.push({ i, s }); }));
    if (soon.length || soonSteps.length) {
      out.push(`<section class="card">
        <div class="card-head"><h2>期限が近いもの</h2></div>
        <ul class="plain-list">
          ${soon.slice(0, 6).map((i) => `<li data-action="openItem" data-id="${i.id}" role="button" tabindex="0"><span class="grow">${esc(i.title)}</span><span class="chip due ${daysUntil(i.targetDate) < 0 ? 'over' : 'soon'}">${fmtShort(i.targetDate)}・${dueText(i.targetDate)}</span></li>`).join('')}
          ${soonSteps.slice(0, 6).map(({ i, s }) => `<li data-action="openItem" data-id="${i.id}" role="button" tabindex="0"><span class="grow">${esc(s.text)}<span class="muted small">（${esc(trunc(i.title, 16))}）</span></span><span class="chip due ${daysUntil(s.due) < 0 ? 'over' : 'soon'}">${fmtShort(s.due)}・${dueText(s.due)}</span></li>`).join('')}
        </ul>
      </section>`);
    }

    // ランダムピック
    const pool = wish.filter((i) => i.status !== 'done');
    if (pool.length) {
      let pick = pool.find((i) => i.id === ui.randomId);
      if (!pick) { pick = pool[Math.floor(Math.random() * pool.length)]; ui.randomId = pick.id; }
      out.push(`<section class="card pick">
        <div class="card-head"><h2>今日のやりたい事ピック 🎲</h2><button class="btn small soft" data-action="reroll">別のを引く</button></div>
        <div class="pick-body" data-action="openItem" data-id="${pick.id}" role="button" tabindex="0"><h3>${esc(pick.title)}</h3>${itemChips(pick)}</div>
      </section>`);
    }

    // カテゴリ別
    const cats = {};
    wish.forEach((i) => { const c = i.category || '未分類'; cats[c] = cats[c] || { t: 0, d: 0 }; cats[c].t++; if (i.status === 'done') cats[c].d++; });
    const catKeys = Object.keys(cats);
    if (catKeys.length) {
      out.push(`<section class="card">
        <div class="card-head"><h2>カテゴリ別（やりたい事）</h2><span class="muted small">全体 ${wishDone}/${wish.length} 完了</span></div>
        ${progressBar(wishDone, wish.length)}
        <ul class="cat-list">${catKeys.map((c) => `<li><span class="cat-name">${esc(c)}</span>${progressBar(cats[c].d, cats[c].t, 'thin')}<span class="muted small">${cats[c].d}/${cats[c].t}</span></li>`).join('')}</ul>
      </section>`);
    }

    // 既読のコーチアドバイス（最新1件）
    const lastRead = sortedCoach().find((c) => c.read);
    if (lastRead) {
      out.push(`<section class="card coach-note"><div class="card-head"><h2>前回のアドバイス</h2><a class="link" href="#coach">すべて見る</a></div>
        <div class="muted small">${fmtDate(lastRead.date)}</div><p class="pre">${esc(trunc(lastRead.text, 160))}</p></section>`);
    }

    // 最近のジャーナル
    const j = [...state.journal].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 2);
    if (j.length) {
      out.push(`<section class="card">
        <div class="card-head"><h2>最近のジャーナル</h2><a class="link" href="#journal">開く</a></div>
        ${j.map((e) => `<div class="journal-mini" data-action="editJournal" data-id="${e.id}" role="button" tabindex="0"><span class="mood">${MOODS[e.mood] || '📝'}</span><div><div class="muted small">${fmtDate(e.date)}</div><p>${esc(trunc(e.text, 80))}</p></div></div>`).join('')}
      </section>`);
    }

    if (!isEmpty) out.push(`<div class="btn-row center muted-links"><a class="link" href="#ai">🤖 AIに相談（Gemini）</a><a class="link" href="#coach">🧭 コーチに相談する</a><a class="link" href="#done">✓ 完了履歴</a></div>`);
    return out.join('');
  }

  // ───────────────────────── 画面: マトリックス ─────────────────────────
  function viewMatrix() {
    const f = ui.matrixFilter;
    const pool = activeItems().filter((i) => (f === 'all' ? true : i.list === f));
    const filters = [['all', 'すべて'], ['task', 'タスク'], ['wish', 'やりたい事'], ['later', '後回し'], ['inbox', '未整理']];
    const unclassified = pool.filter((i) => !i.quadrant);
    const out = [sectionHead('マトリックス', '緊急度 × 重要度で整理。⇄ をタップして象限を移動（PCはドラッグも可）。')];
    out.push(`<div class="seg-scroll">${filters.map(([k, l]) => `<button class="pill ${f === k ? 'on' : ''}" data-action="matrixFilter" data-v="${k}">${l}</button>`).join('')}</div>`);
    if (!state.items.length) {
      out.push(emptyState('まだタスクがありません', '紙のマトリックスに書いている内容をここに移せます。手書きメモのサンプルを入れて試すこともできます。',
        `<button class="btn primary" data-action="quickAdd" data-list="task">＋ タスクを追加</button><button class="btn soft" data-action="addMemoSamples">サンプルを追加（手書きメモから）</button>`));
      return out.join('');
    }
    if (unclassified.length) {
      out.push(`<section class="tray" data-drop="none"><div class="tray-head">未分類 <span class="count">${unclassified.length}</span><span class="muted small">⇄ で象限を選んでください</span></div>${unclassified.map((i) => itemCard(i, 'matrix')).join('')}</section>`);
    }
    out.push(`<div class="matrix-wrap">
      <div class="axis-top"><span>重要</span><span>重要でない</span></div>
      <div class="axis-side"><span>緊急</span><span>緊急でない</span></div>
      <div class="matrix">${QUADRANT_LAYOUT.map((q) => {
        const list = pool.filter((i) => i.quadrant === q).sort((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance] || (a.targetDate || '9').localeCompare(b.targetDate || '9') || a.createdAt.localeCompare(b.createdAt));
        return `<section class="quad ${q}" data-drop="${q}" aria-label="${QUADRANTS[q].label}">
          <header><div><h2>${QUADRANTS[q].label}</h2><span class="hint">${QUADRANTS[q].hint}</span></div>
            <div class="quad-tools"><span class="count">${list.length}</span><button class="icon-btn small" data-action="quickAdd" data-quadrant="${q}" data-list="task" aria-label="${QUADRANTS[q].label}に追加">${ICON.plus}</button></div></header>
          <div class="quad-body">${list.length ? list.map((i) => itemCard(i, 'matrix')).join('') : '<p class="muted small quad-empty">ここに移動するとこの象限に入ります</p>'}</div>
        </section>`;
      }).join('')}</div>
    </div>`);
    return out.join('');
  }

  // ───────────────────────── 画面: やりたい事 ─────────────────────────
  function viewWish() {
    const w = ui.wish;
    const all = state.items.filter((i) => i.list === 'wish');
    const list = all.filter((i) => (!w.cat || i.category === w.cat) && (!w.imp || i.importance === w.imp) && (!w.tf || i.timeframe === w.tf)
      && (w.status === 'all' ? true : w.status === 'open' ? i.status !== 'done' : i.status === w.status));
    const sorters = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      importance: (a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance] || b.updatedAt.localeCompare(a.updatedAt),
      timeframe: (a, b) => TIMEFRAME_ORDER[a.timeframe] - TIMEFRAME_ORDER[b.timeframe] || (a.targetDate || '9').localeCompare(b.targetDate || '9'),
      date: (a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'),
      title: (a, b) => a.title.localeCompare(b.title, 'ja'),
    };
    list.sort(sorters[w.sort] || sorters.updated);
    const done = all.filter((i) => i.status === 'done').length;
    const out = [sectionHead('やりたい事', `人生でやりたい事・${all.length}件中 ${done}件 完了`, `<button class="btn primary small" data-action="quickAdd" data-list="wish">＋ 追加</button>`)];
    if (all.length) out.push(progressBar(done, all.length));
    out.push(`<div class="filters">
      <select data-change="wishFilter" data-k="cat" aria-label="カテゴリ">${catOptions(w.cat, 'カテゴリ: すべて')}</select>
      <select data-change="wishFilter" data-k="imp" aria-label="重要度">${options(IMPORTANCE, w.imp, '重要度: すべて')}</select>
      <select data-change="wishFilter" data-k="tf" aria-label="時期">${options(TIMEFRAME, w.tf, '時期: すべて')}</select>
      <select data-change="wishFilter" data-k="status" aria-label="状態">${opt('open', '未完了のみ', w.status)}${opt('all', '状態: すべて', w.status)}${options(STATUS, w.status)}</select>
      <select data-change="wishFilter" data-k="sort" aria-label="並び替え">${opt('updated', '並び: 更新順', w.sort)}${opt('created', '並び: 作成順', w.sort)}${opt('importance', '並び: 重要度', w.sort)}${opt('timeframe', '並び: 時期', w.sort)}${opt('date', '並び: 目標日', w.sort)}${opt('title', '並び: 名前', w.sort)}</select>
    </div>`);
    if (!all.length) {
      out.push(emptyState('やりたい事はまだありません', '行ってみたい場所、挑戦したいこと、身につけたいこと…。思いついたら「＋」から追加しましょう。',
        `<button class="btn primary" data-action="quickAdd" data-list="wish">＋ やりたい事を追加</button><button class="btn soft" data-action="addSamples">サンプルを追加</button>`));
    } else if (!list.length) out.push('<p class="muted center pad">条件に合う項目はありません。</p>');
    else out.push(`<div class="list">${list.map((i) => itemCard(i, 'wish')).join('')}</div>`);
    return out.join('');
  }

  // ───────────────────────── 画面: 後回しでいい事 ─────────────────────────
  function viewLater() {
    const list = state.items.filter((i) => i.list === 'later' && i.status !== 'done');
    if (ui.laterSort === 'importance') list.sort((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance]);
    else if (ui.laterSort === 'created') list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const out = [sectionHead('後回しでいい事', 'いつかやる。急がないけど忘れたくない事。', `<button class="btn primary small" data-action="quickAdd" data-list="later">＋ 追加</button>`)];
    out.push(`<div class="filters"><select data-change="laterSort" aria-label="並び替え">${opt('updated', '並び: 更新順', ui.laterSort)}${opt('created', '並び: 作成順', ui.laterSort)}${opt('importance', '並び: 重要度', ui.laterSort)}</select></div>`);
    if (!list.length) out.push(emptyState('後回しリストは空です', '今はやらないけど、いつかやりたい事をここに置いておきましょう。やる気になったら「やりたい事へ ↑」で昇格できます。', `<button class="btn primary" data-action="quickAdd" data-list="later">＋ 追加</button>`));
    else out.push(`<div class="list">${list.map((i) => itemCard(i, 'later')).join('')}</div>`);
    return out.join('');
  }

  // ───────────────────────── 画面: 習い事 ─────────────────────────
  function viewLessons() {
    const order = { active: 0, considering: 1, paused: 2, ended: 3 };
    const list = [...state.lessons].sort((a, b) => order[a.status] - order[b.status] || b.updatedAt.localeCompare(a.updatedAt));
    const totalSessions = state.lessons.reduce((a, l) => a + sessionsThisMonth(l), 0);
    const out = [sectionHead('習い事', '続けていること・検討中のこと', `<button class="btn primary small" data-action="editLesson">＋ 追加</button>`)];
    out.push(`<section class="stats two">
      <div class="stat"><span class="n">${fmtYen(activeLessonCost())}</span><span class="l">月額合計（継続中）</span></div>
      <div class="stat"><span class="n">${totalSessions}<small>回</small></span><span class="l">今月の記録</span></div>
    </section>`);
    if (!list.length) {
      out.push(emptyState('習い事はまだありません', '英会話、ジム、楽器など。月謝と練習の記録をまとめて見られます。', `<button class="btn primary" data-action="editLesson">＋ 習い事を追加</button><button class="btn soft" data-action="addSamples">サンプルを追加</button>`));
      return out.join('');
    }
    out.push(`<div class="list">${list.map((l) => {
      const last = [...l.logs].sort((a, b) => b.date.localeCompare(a.date))[0];
      return `<article class="card lesson st-${l.status}">
        <div class="item-main" data-action="editLesson" data-id="${l.id}" role="button" tabindex="0">
          <div class="lesson-head"><h3 class="item-title">${esc(l.name)}</h3>${chip(LESSON_STATUS[l.status], 'ls-' + l.status)}</div>
          <div class="lesson-meta">
            ${l.frequency ? `<span>📅 ${esc(l.frequency)}</span>` : ''}
            <span>💴 ${fmtYen(l.monthlyCost)}/月</span>
            ${l.startDate ? `<span>開始 ${esc(l.startDate.replace(/-/g, '/'))}</span>` : ''}
            <span>今月 <b>${sessionsThisMonth(l)}</b>回</span>
          </div>
          ${last ? `<p class="muted small">最終記録 ${fmtShort(last.date)}${last.memo ? '：' + esc(trunc(last.memo, 40)) : ''}</p>` : ''}
        </div>
        <div class="item-actions"><button class="btn small soft" data-action="addLog" data-id="${l.id}">＋ 練習を記録</button></div>
      </article>`;
    }).join('')}</div>`);
    return out.join('');
  }
