
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
  // カテゴリは「プライベート」「仕事」の2択固定（v1.8.0）。emptyLabel=null のときは空の選択肢を出さない（編集フォーム用）
  const catOptions = (cur, emptyLabel = '（なし）') => (emptyLabel != null ? opt('', emptyLabel, cur) : '') + CATEGORIES.map((c) => opt(c, c, cur)).join('');
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
  const estLabel = (m) => (m === 240 ? '半日' : m === 480 ? '1日' : m % 60 === 0 ? `${m / 60}時間` : `${m}分`); // v1.8.2：目安時間の表示
  function itemChips(i, o = {}) {
    const c = [];
    if (o.showList) c.push(chip(LISTS[i.list], 'list'));
    if (i.source === 'ai') c.push(chip('🤖 AI提案から', 'ai-chip'));
    if (i.quadrant && !o.hideQuadrant) c.push(chip(QUADRANTS[i.quadrant].label, 'qchip ' + i.quadrant));
    if (i.category) c.push(chip(i.category, 'cat'));
    if (i.estimate) c.push(chip('⏱ ' + estLabel(i.estimate), 'est'));
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
          ${total ? `<div class="mini-steps">${progressBar(done, total, 'thin')}<span>ステップ ${done}/${total}（${Math.round((done / total) * 100)}%）</span></div>` : ''}
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

  // ───────────────────────── 画面: マトリックス ─────────────────────────
  function viewMatrix() {
    const f = ui.matrixFilter; // v1.8.1：種別（タスク/やりたい事/…）ではなくカテゴリ（仕事/プライベート）で切り替える
    const pool = activeItems().filter((i) => (f === 'all' ? true : i.category === f));
    const filters = [['all', 'すべて'], ['仕事', '仕事'], ['プライベート', 'プライベート']];
    const unclassified = pool.filter((i) => !i.quadrant);
    const out = [];
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

  // ───────────────────────── 画面: TASK（v1.7.0 で旧「やりたい事」を全件表示に改名） ─────────────────────────
  // 分類（タスク／やりたい事／後回し／未整理）は問わず出す。状態の既定は未完了のみ（v1.7.1。完了済みは
  // 状態フィルターで「すべて／完了」を選べば見られる）。絞り込みはフィルターで行う。
  // v1.8.0：分類フィルターは廃止し、期限（targetDate＝〆切日）フィルターに置き換えた。未整理の項目も既定表示
  // （期限：すべて・未完了のみ）に出るので、そこから届く。行は左スワイプで「削除」ボタンが出る
  // （v1.7.1。実処理は p6 のスワイプ処理＋既存 deleteItem アクション）。
  const DUE_FILTERS = { today: '今日中', week: '今週中', month: '1ヶ月以内', over: '1ヶ月以上' };
  function dueMatch(i, f) {
    if (!f) return true;
    const d = i.targetDate;
    if (!isDateStr(d)) return false; // 期限なしは「すべて」のときだけ
    const t = todayStr();
    if (f === 'today') return d <= t; // 期限切れ（過去）も「今日中」に含める
    if (f === 'week') return d <= addDays(mondayOf(t), 6); // 今週の日曜日まで（月曜始まり）
    if (f === 'month') return d <= addDays(t, 30);
    if (f === 'over') return d > addDays(t, 30);
    return true;
  }
  function viewWish() {
    const w = ui.wish;
    const all = state.items;
    const list = all.filter((i) => dueMatch(i, w.due) && (!w.cat || i.category === w.cat) && (!w.imp || i.importance === w.imp) && (!w.tf || i.timeframe === w.tf)
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
    const out = [sectionHead('TASK', `すべてのタスク・${all.length}件中 ${done}件 完了`, `<button class="btn primary small" data-action="quickAdd" data-list="task">＋ 追加</button>`)];
    if (all.length) out.push(progressBar(done, all.length));
    out.push(`<div class="filters">
      <select data-change="wishFilter" data-k="due" aria-label="期限">${options(DUE_FILTERS, w.due, '期限: すべて')}</select>
      <select data-change="wishFilter" data-k="cat" aria-label="カテゴリ">${catOptions(w.cat, 'カテゴリ: すべて')}</select>
      <select data-change="wishFilter" data-k="imp" aria-label="重要度">${options(IMPORTANCE, w.imp, '重要度: すべて')}</select>
      <select data-change="wishFilter" data-k="tf" aria-label="時期">${options(TIMEFRAME, w.tf, '時期: すべて')}</select>
      <select data-change="wishFilter" data-k="status" aria-label="状態">${opt('all', '状態: すべて', w.status)}${opt('open', '未完了のみ', w.status)}${options(STATUS, w.status)}</select>
      <select data-change="wishFilter" data-k="sort" aria-label="並び替え">${opt('updated', '並び: 更新順', w.sort)}${opt('created', '並び: 作成順', w.sort)}${opt('importance', '並び: 重要度', w.sort)}${opt('timeframe', '並び: 時期', w.sort)}${opt('date', '並び: 期限', w.sort)}${opt('title', '並び: 名前', w.sort)}</select>
    </div>`);
    if (!all.length) {
      out.push(emptyState('タスクはまだありません', 'やるべきこと、行ってみたい場所、挑戦したいこと…。思いついたら「＋」から追加しましょう。',
        `<button class="btn primary" data-action="quickAdd" data-list="task">＋ タスクを追加</button><button class="btn soft" data-action="addSamples">サンプルを追加</button>`));
    } else if (!list.length) out.push('<p class="muted center pad">条件に合う項目はありません。</p>');
    else out.push(`<div class="list">${list.map((i) => `<div class="task-row-wrap" data-task-wrap="${i.id}"><button type="button" class="task-row-del" data-action="deleteItem" data-id="${i.id}" tabindex="-1" aria-label="削除">削除</button><details class="task-row" data-task-row="${i.id}"><summary><span class="task-row-ico" aria-hidden="true">${itemIcon(i)}</span><span class="grow"><b>${esc(trunc(i.title, 42))}</b></span>${chip(LISTS[i.list], 'list')}${i.status === 'done' ? chip('完了', 'doing') : ''}<span class="task-row-chev" aria-hidden="true">›</span></summary><div class="task-row-body">${itemCard(i, 'wish')}</div></details></div>`).join('')}</div>`);
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
