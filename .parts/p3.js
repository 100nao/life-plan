
  // ───────────────────────── 画面: 未整理 ─────────────────────────
  function viewInbox() {
    const list = state.items.filter((i) => i.list === 'inbox' && i.status !== 'done').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const out = [sectionHead('未整理（インボックス）', 'とりあえず書いて、あとでワンタップで振り分け。')];
    out.push(`<form class="capture card" data-form="capture">
      <input name="title" type="text" placeholder="思いついたことを入力…" autocomplete="off" enterkeyhint="done" aria-label="未整理に追加">
      <button class="btn primary" type="submit">追加</button>
    </form>
    <div class="btn-row"><button class="btn soft small" data-action="remindersImport">📥 リマインダーから読み込み</button></div>`);
    if (!list.length) out.push(emptyState('未整理の項目はありません', 'すっきり！ 頭に浮かんだことは、まずここに入れておきましょう。'));
    else out.push(`<div class="list">${list.map((i) => itemCard(i, 'inbox')).join('')}</div>`);
    return out.join('');
  }

  // ───────────────────────── 画面: ジャーナル ─────────────────────────
  // 日付ごとにまとめて、最初は折りたたみ。タップで開く（開いた日付は ui.journalOpen に覚えておく）
  const SRC_LABEL = { photo: '📷 手書き', obsidian: '📝 Obsidian', ai: '🤖 AI' };
  function journalEntry(e) {
    return `<article class="card journal" data-action="editJournal" data-id="${e.id}" role="button" tabindex="0">
        <div class="journal-head"><span class="mood" title="${MOOD_LABEL[e.mood] || ''}">${MOODS[e.mood] || '📝'}</span><b>${e.mood ? `気分 ${e.mood}/5` : 'メモ'}</b><span class="muted small">${e.createdAt ? pad(new Date(e.createdAt).getHours()) + ':' + pad(new Date(e.createdAt).getMinutes()) : ''}</span>${e.source ? `<span class="chip src-chip">${SRC_LABEL[e.source]}</span>` : ''}</div>
        ${e.text ? `<p class="pre">${esc(e.text)}</p>` : ''}
        ${photoThumbs(e.photos, e.id, false)}
        ${e.linked.length ? `<div class="chips">${e.linked.map((id) => { const it = getItem(id); return it ? `<button class="chip link-chip" data-action="openItem" data-id="${it.id}">🔗 ${esc(trunc(it.title, 20))}</button>` : ''; }).join('')}</div>` : ''}
      </article>`;
  }
  function journalList(q) {
    const nq = q.trim().toLowerCase();
    const list = state.journal.filter((e) => !nq || e.text.toLowerCase().includes(nq) || e.date.includes(nq) || e.linked.some((id) => { const it = getItem(id); return it && it.title.toLowerCase().includes(nq); }))
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    if (!state.journal.length) return emptyState('ジャーナルはまだありません', 'その日の出来事、気分、考えたことを短く残しておきましょう。タスクと結びつけることもできます。', '<button class="btn primary" data-action="editJournal">＋ 今日を書く</button><button class="btn soft" data-action="pickPhoto">📷 写真から追加</button><button class="btn soft" data-action="openObsidian">📝 Obsidianから取り込む</button>');
    if (!list.length) return '<p class="muted center pad">見つかりませんでした。</p>';
    const days = [];
    list.forEach((e) => { const g = days[days.length - 1]; if (g && g.date === e.date) g.list.push(e); else days.push({ date: e.date, list: [e] }); });
    let html = ''; let cur = '';
    days.forEach(({ date, list: es }) => {
      const m = date.slice(0, 7);
      if (m !== cur) { cur = m; html += `<h3 class="month-head">${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月</h3>`; }
      const open = !!nq || ui.journalOpen.has(date);
      const first = es.find((e) => e.text.trim()) || es[0];
      const preview = first.text.replace(/\s+/g, ' ').trim() || '（写真のみ）';
      const nPhotos = es.reduce((a, e) => a + e.photos.length, 0);
      const moods = [...new Set(es.map((e) => MOODS[e.mood]).filter(Boolean))].slice(0, 3).join('');
      const srcs = [...new Set(es.map((e) => e.source).filter(Boolean))].map((x) => `<span class="chip src-chip">${SRC_LABEL[x]}</span>`).join('');
      html += `<section class="jday${open ? ' open' : ''}" data-date="${date}">
        <button type="button" class="jday-head card" data-action="toggleJDay" data-date="${date}" aria-expanded="${open}">
          <span class="jd-date"><b>${fmtDate(date)}</b><span class="jd-meta"><span class="jd-count">${es.length}件</span>${nPhotos ? `<span class="jd-photos">📷 ${nPhotos}</span>` : ''}${moods ? `<span class="jd-moods">${moods}</span>` : ''}${srcs}</span></span>
          <span class="jd-preview">${esc(trunc(preview, 80))}</span>
          <svg class="jd-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="jday-body"${open ? '' : ' inert'}><div class="jday-in">${es.map(journalEntry).join('')}</div></div>
      </section>`;
    });
    return html;
  }
  function toggleJournalDay(date, btn) {
    const sec = btn ? btn.closest('.jday') : $(`.jday[data-date="${date}"]`);
    if (!sec) return;
    const open = !sec.classList.contains('open');
    sec.classList.toggle('open', open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
    const body = $('.jday-body', sec); if (body) body.toggleAttribute('inert', !open);
    if (open) { ui.journalOpen.add(date); hydratePhotos(sec); } else ui.journalOpen.delete(date);
  }
  function viewJournal() {
    const recent = state.journal.filter((e) => e.mood && daysUntil(e.date) >= -13);
    const avg = recent.length ? (recent.reduce((a, e) => a + e.mood, 0) / recent.length).toFixed(1) : '';
    const out = [sectionHead('ジャーナル', `${state.journal.length}件${avg ? `・直近14日の気分 平均 ${avg}` : ''}`, '<button class="btn primary small" data-action="editJournal">＋ 書く</button>')];
    out.push(`<div class="journal-tools"><button class="btn soft small" data-action="pickPhoto">📷 写真から追加</button><button class="btn soft small" data-action="openObsidian">📝 Obsidianから取り込む</button></div>
      <input type="file" id="photoInput" accept="image/*" multiple hidden data-change="journalPhoto">`);
    out.push(`<div class="search-box"><input type="search" placeholder="ジャーナルを検索" value="${esc(ui.journalQuery)}" data-input="journalSearch" aria-label="ジャーナルを検索"></div>`);
    out.push(`<div id="journalList">${journalList(ui.journalQuery)}</div>`);
    return out.join('');
  }

  // ───────────────────────── 画面: 完了履歴 ─────────────────────────
  function viewDone() {
    const list = state.items.filter((i) => i.status === 'done').sort((a, b) => (b.completedAt || b.updatedAt).localeCompare(a.completedAt || a.updatedAt));
    const year = thisYear();
    const thisYearCount = list.filter((i) => isoToDate(i.completedAt).startsWith(year)).length;
    const out = [sectionHead('完了履歴', `これまでに ${list.length}件 完了・${year}年は ${thisYearCount}件 🎉`)];
    if (!list.length) { out.push(emptyState('まだ完了した項目はありません', '項目の ○ をタップすると完了になり、ここに記録されます。')); return out.join(''); }
    let cur = '';
    list.forEach((i) => {
      const d = isoToDate(i.completedAt || i.updatedAt);
      const m = d.slice(0, 7);
      if (m !== cur) { cur = m; out.push(`<h3 class="month-head">${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月</h3>`); }
      out.push(`<div class="card done-row"><span class="done-mark">${ICON.check}</span><div class="grow" data-action="openItem" data-id="${i.id}" role="button" tabindex="0"><b>${esc(i.title)}</b><div class="muted small">${fmtShort(d)} 完了・${LISTS[i.list]}${i.category ? '・' + esc(i.category) : ''}</div></div>
        <button class="btn small soft" data-action="toggleDone" data-id="${i.id}">戻す</button></div>`);
    });
    return out.join('');
  }

  // ───────────────────────── 画面: 検索 ─────────────────────────
  function searchResults(q) {
    const nq = q.trim().toLowerCase();
    if (!nq) return '<p class="muted center pad">タイトル・メモ・ステップ・習い事・ジャーナルを横断して検索します。</p>';
    const has = (s) => String(s || '').toLowerCase().includes(nq);
    const items = state.items.filter((i) => has(i.title) || has(i.notes) || has(i.category) || i.tags.some(has) || i.steps.some((s) => has(s.text)));
    const lessons = state.lessons.filter((l) => has(l.name) || has(l.notes) || l.logs.some((g) => has(g.memo)));
    const journal = state.journal.filter((e) => has(e.text));
    const coach = state.coachNotes.filter((c) => has(c.text) || has(c.title));
    if (!items.length && !lessons.length && !journal.length && !coach.length) return '<p class="muted center pad">見つかりませんでした。</p>';
    let h = '';
    if (items.length) h += `<h3 class="month-head">項目（${items.length}）</h3><div class="list">${items.map((i) => itemCard(i, 'search')).join('')}</div>`;
    if (lessons.length) h += `<h3 class="month-head">習い事（${lessons.length}）</h3>${lessons.map((l) => `<div class="card row" data-action="editLesson" data-id="${l.id}" role="button" tabindex="0"><b>${esc(l.name)}</b> ${chip(LESSON_STATUS[l.status], 'ls-' + l.status)}</div>`).join('')}`;
    if (journal.length) h += `<h3 class="month-head">ジャーナル（${journal.length}）</h3>${journal.map((e) => `<div class="card row" data-action="editJournal" data-id="${e.id}" role="button" tabindex="0"><span class="muted small">${fmtDate(e.date)}</span><p>${esc(trunc(e.text, 80))}</p></div>`).join('')}`;
    if (coach.length) h += `<h3 class="month-head">コーチのアドバイス（${coach.length}）</h3>${coach.map((c) => `<a class="card row" href="#coach"><span class="muted small">${fmtDate(c.date)}</span><p>${esc(trunc(c.text, 80))}</p></a>`).join('')}`;
    return h;
  }
  function viewSearch() {
    return sectionHead('検索') + `<div class="search-box"><input id="searchInput" type="search" placeholder="キーワードを入力" value="${esc(ui.searchQuery)}" data-input="search" aria-label="検索キーワード" enterkeyhint="search"></div><div id="searchResults">${searchResults(ui.searchQuery)}</div>`;
  }

  // ───────────────────────── 画面: 項目の詳細（ステップ） ─────────────────────────
  function viewItem(id) {
    const i = getItem(id);
    if (!i) return sectionHead('見つかりません') + '<p class="muted">この項目は削除されたようです。</p><a class="btn soft" href="#home">ホームへ</a>';
    const total = i.steps.length; const done = stepsDone(i);
    const nextIdx = i.steps.findIndex((s) => !s.done);
    const stuck = isStuck(i);
    const related = state.journal.filter((e) => e.linked.includes(i.id)).sort((a, b) => b.date.localeCompare(a.date));
    const out = [];
    out.push(`<div class="detail-top"><button class="btn ghost small" data-action="back">${ICON.back} 戻る</button>
      <div class="btn-row"><button class="btn soft small" data-action="editItem" data-id="${i.id}">${ICON.edit} 編集</button><button class="btn soft small" data-action="moveSheet" data-id="${i.id}">${ICON.move} 象限</button></div></div>`);
    out.push(`<section class="card detail ${i.status === 'done' ? 'is-done' : ''}">
      <div class="item-row"><button class="check big ${i.status === 'done' ? 'on' : ''}" data-action="toggleDone" data-id="${i.id}" aria-label="${i.status === 'done' ? '未完了に戻す' : '完了にする'}">${ICON.check}</button>
      <div class="grow"><h1 class="detail-title">${esc(i.title)}</h1>${itemChips(i, { showList: true })}</div></div>
      ${i.notes ? `<p class="pre notes">${esc(i.notes)}</p>` : ''}
      <div class="meta-grid">
        <div><span class="muted small">作成</span><b>${isoToDate(i.createdAt).replace(/-/g, '/')}</b><span class="muted small">${daysSince(i.createdAt)}日前</span></div>
        <div><span class="muted small">最後の進捗</span><b>${i.lastProgressAt ? isoToDate(i.lastProgressAt).replace(/-/g, '/') : 'まだなし'}</b><span class="muted small">${idleDays(i)}日経過</span></div>
        <div><span class="muted small">状態</span><b>${STATUS[i.status]}</b><span class="muted small">${stuck ? '⚠️ 停滞中' : i.status === 'done' ? '🎉' : '順調'}</span></div>
      </div>
    </section>`);

    out.push(`<section class="card">
      <div class="card-head"><h2>ステップ</h2><span class="muted small">${done}/${total} 完了${total ? `（${Math.round((done / total) * 100)}%）` : ''}</span></div>
      ${progressBar(done, total)}
      ${total ? `<ol class="stepper">${i.steps.map((s, idx) => `<li class="step ${s.done ? 'done' : ''} ${idx === nextIdx ? 'next' : ''}" data-step="${s.id}">
          <button class="dot" data-action="toggleStep" data-id="${i.id}" data-step="${s.id}" aria-label="${s.done ? '未完了に戻す' : '完了にする'}">${s.done ? ICON.check : idx + 1}</button>
          <div class="step-body">
            ${idx === nextIdx ? '<span class="next-label">次の一歩</span>' : ''}
            <input class="step-text" value="${esc(s.text)}" data-change="stepText" data-id="${i.id}" data-step="${s.id}" aria-label="ステップ${idx + 1}の内容">
            <div class="step-tools">
              <label class="due-input">期限 <input type="date" value="${esc(s.due)}" data-change="stepDue" data-id="${i.id}" data-step="${s.id}" aria-label="ステップ${idx + 1}の期限"></label>
              ${s.due && !s.done ? `<span class="chip due ${daysUntil(s.due) < 0 ? 'over' : daysUntil(s.due) <= 7 ? 'soon' : ''}">${dueText(s.due)}</span>` : ''}
              <span class="grow"></span>
              <button class="icon-btn small" data-action="stepUp" data-id="${i.id}" data-step="${s.id}" aria-label="上へ" ${idx === 0 ? 'disabled' : ''}>${ICON.up}</button>
              <button class="icon-btn small" data-action="stepDown" data-id="${i.id}" data-step="${s.id}" aria-label="下へ" ${idx === total - 1 ? 'disabled' : ''}>${ICON.down}</button>
              <button class="icon-btn small danger" data-action="stepDelete" data-id="${i.id}" data-step="${s.id}" aria-label="削除">${ICON.trash}</button>
            </div>
          </div></li>`).join('')}</ol>` : '<p class="muted small">大きな事は小さなステップに分けると進めやすくなります。下から追加するか、ヒントのテンプレートを使ってみましょう。</p>'}
      <form class="add-step" data-form="addStep" data-id="${i.id}"><input name="text" placeholder="ステップを追加…" autocomplete="off" enterkeyhint="done" aria-label="ステップを追加"><button class="btn primary small" type="submit">追加</button></form>
      <div class="btn-row"><button class="btn soft small" data-action="stepTemplates" data-id="${i.id}">💡 ステップのヒント</button><button class="btn soft small" data-action="pasteSteps" data-id="${i.id}">📋 番号付きリストから貼り付け</button></div>
    </section>`);

    if (i.status !== 'done' && !stuck && !i.stuck.tags.length && !i.stuck.text) {
      out.push(`<details class="card reason-collapsed"><summary>できていない理由を記録する（任意）</summary>
        <p class="muted small">なぜ進まないのかを書いておくと、次の一歩やコーチへの相談に役立ちます。</p>${reasonForm(i)}</details>`);
    } else if (i.status !== 'done') {
      out.push(`<section class="card ${stuck ? 'stuck-card' : ''}">
        <div class="card-head"><h2>できていない理由</h2>${stuck ? `<span class="chip stuck">停滞 ${idleDays(i)}日</span>` : ''}</div>
        <p class="muted small">${stuck ? `${STUCK_DAYS}日以上進んでいません。` : ''}なぜ進まないのかを書いておくと、次の一歩やコーチへの相談に役立ちます。</p>
        ${reasonForm(i)}
      </section>`);
    }
    if (related.length) {
      out.push(`<section class="card"><div class="card-head"><h2>関連するジャーナル</h2></div>${related.map((e) => `<div class="journal-mini" data-action="editJournal" data-id="${e.id}" role="button" tabindex="0"><span class="mood">${MOODS[e.mood] || '📝'}</span><div><div class="muted small">${fmtDate(e.date)}</div><p>${esc(trunc(e.text, 100))}</p></div></div>`).join('')}</section>`);
    }
    out.push(`<div class="btn-row center"><button class="btn ghost danger small" data-action="deleteItem" data-id="${i.id}">${ICON.trash} この項目を削除</button></div>`);
    return out.join('');
  }
  function reasonForm(i) {
    return `<form data-form="reason" data-id="${i.id}" class="reason-form">
      <div class="tag-picks">${STUCK_REASONS.map((r) => `<label class="tag-pick"><input type="checkbox" name="tags" value="${esc(r)}" ${i.stuck.tags.includes(r) ? 'checked' : ''}><span>${esc(r)}</span></label>`).join('')}</div>
      <textarea name="text" rows="2" placeholder="自由メモ（例：何から始めればいいか分からない）">${esc(i.stuck.text)}</textarea>
      <div class="btn-row"><button class="btn primary small" type="submit">理由を保存</button>${i.stuck.updatedAt ? `<span class="muted small">最終更新 ${isoToDate(i.stuck.updatedAt).replace(/-/g, '/')}</span>` : ''}</div>
    </form>`;
  }

  // ───────────────────────── 画面: コーチに相談 ─────────────────────────
  function viewCoach() {
    if (!ui.coachText) ui.coachText = coachText(ui.coachDays);
    const notes = sortedCoach();
    const out = [sectionHead('コーチに相談', sync.connected ? 'GitHub 同期中：AIコーチはデータを直接読み、アドバイスは自動でホームに届きます。下のコピーは予備の方法です。' : '今の状況をまとめたテキストを作り、AIアシスタントに貼り付けて相談できます。アプリから自動送信はしません。')];
    out.push(`<a class="card ai-entry" href="#ai"><span class="ai-emoji" aria-hidden="true">🤖</span><span class="grow"><b>AIに相談（Gemini）</b><span class="muted small">コピー＆貼り付けなしで、アプリの中でそのまま相談できます</span></span><span class="chev" aria-hidden="true">›</span></a>`);
    out.push(`<section class="card"><div class="card-head"><h2>コーチからのアドバイス（${notes.length}）</h2>${notes.some((c) => !c.read) ? '<button class="btn small soft" data-action="markAllRead">すべて既読</button>' : ''}</div>
      ${notes.length ? notes.map((c) => adviceCard(c, false)).join('') : `<p class="muted small">まだありません。${sync.connected ? 'コーチが coach-inbox.json に書くと、こことホームに表示されます。' : ''}</p>`}
    </section>`);
    out.push(`<section class="card">
      <div class="card-head"><h2>相談用サマリーを作る</h2></div>
      <div class="seg" role="group" aria-label="ジャーナルの期間">
        ${[14, 30].map((n) => `<button class="pill ${ui.coachDays === n ? 'on' : ''}" data-action="coachDays" data-v="${n}">直近${n}日</button>`).join('')}
      </div>
      <textarea id="coachText" class="mono" rows="10" readonly aria-label="相談用サマリー">${esc(ui.coachText)}</textarea>
      <div class="btn-row">
        <button class="btn primary" data-action="coachCopy">📋 コピー</button>
        ${navigator.share ? '<button class="btn soft" data-action="coachShare">共有</button>' : ''}
        <button class="btn soft" data-action="coachRefresh">更新</button>
        <button class="btn soft" data-action="coachJson">JSONをダウンロード</button>
        <button class="btn soft" data-action="coachJsonCopy">JSONをコピー</button>
      </div>
    </section>`);
    out.push(`<section class="card">
      <div class="card-head"><h2>コーチの返事を手動で取り込む</h2></div>
      <p class="muted small">AIの返事を貼り付けて「アドバイスとして保存」。ステップ提案のJSON（<code>{"taskTitle": "…", "steps": ["…"]}</code>）が含まれていれば「ステップを取り込む」で該当タスクに追加できます。</p>
      <textarea id="coachInput" rows="5" placeholder="ここにコーチ（AI）からの返事を貼り付け"></textarea>
      <div class="btn-row">
        <button class="btn primary" data-action="coachSaveAdvice">アドバイスとして保存</button>
        <button class="btn soft" data-action="coachImportSteps">ステップを取り込む</button>
      </div>
    </section>`);
    return out.join('');
  }

  // ───────────────────────── 画面: 設定 ─────────────────────────
  let swStatus = 'serviceWorker' in navigator ? '確認中…' : 'このブラウザは非対応';
  function syncCard() {
    const st = syncStatusText();
    const adv = `<details class="adv" ${sync.connected ? '' : ''}><summary>詳細設定（通常は変更不要）</summary>
        <div class="grid2">
          <label class="field"><span class="field-label">オーナー</span><input name="owner" value="${esc(sync.owner)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
          <label class="field"><span class="field-label">リポジトリ</span><input name="repo" value="${esc(sync.repo)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
          <label class="field"><span class="field-label">ブランチ</span><input name="branch" value="${esc(sync.branch)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
          <label class="field"><span class="field-label">データのパス</span><input name="path" value="${esc(sync.path)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
          <label class="field"><span class="field-label">コーチ受信箱のパス</span><input name="inboxPath" value="${esc(sync.inboxPath)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        </div></details>`;
    const help = `<details class="adv"><summary>トークンの作り方（初回のみ）</summary><ol class="small">
        <li>GitHub → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token</li>
        <li>Repository access：<b>Only select repositories</b> → <code>${esc(sync.owner)}/${esc(sync.repo)}</code></li>
        <li>Permissions → Repository permissions → <b>Contents: Read and write</b>（それ以外は不要）</li>
        <li>作成されたトークン（github_pat_…）をコピーして上に貼り付け</li></ol>
        <p class="muted small">トークンはこの端末のブラウザ内だけに保存され、バックアップJSONにも含まれません。</p></details>`;
    if (!sync.connected) {
      return `<section class="card sync-card" id="syncCard">
        <div class="card-head"><h2>🔗 GitHub 同期（AIコーチ連携）</h2><span class="chip">未接続</span></div>
        <p class="small">トークンを貼り付けて「接続テスト」を押すだけ。以後はアプリを開くと自動で読み込み、変更すると自動で保存し、コーチのアドバイスも自動で届きます。</p>
        <form data-form="syncSetup" class="sync-form">
          <label class="field"><span class="field-label">GitHub トークン</span><input name="token" type="password" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(sync.token)}"></label>
          <p class="muted small">保存先：<code>${esc(sync.owner)}/${esc(sync.repo)}</code> の <code>${esc(sync.path)}</code>（${esc(sync.branch)}）</p>
          ${adv}
          <div class="btn-row"><button class="btn primary" type="submit" id="syncTestBtn">接続テスト</button></div>
          <p class="sync-msg small" id="syncMsg">${sync.lastError ? '⚠️ ' + esc(sync.lastError) : ''}</p>
        </form>
        ${help}
      </section>`;
    }
    return `<section class="card sync-card" id="syncCard">
      <div class="card-head"><h2>🔗 GitHub 同期（AIコーチ連携）</h2><span class="chip sync-${syncState}">${esc(st.label)}</span></div>
      <p class="small"><code>${esc(sync.owner)}/${esc(sync.repo)}</code> / <code>${esc(sync.path)}</code></p>
      <p class="muted small" id="syncDetail">${esc(st.detail)}</p>
      <label class="switch-line"><input type="checkbox" data-change="syncAuto" ${sync.auto ? 'checked' : ''}> 自動同期（開いたとき読み込み・変更後に自動保存・コーチ受信箱を自動取り込み）</label>
      <div class="btn-row"><button class="btn primary small" data-action="syncNow">今すぐ同期</button></div>
      <details class="adv"><summary>手動操作・接続設定</summary>
        <div class="btn-row"><button class="btn soft small" data-action="syncPullOnly">GitHubから読み込み</button><button class="btn soft small" data-action="syncNow">GitHubへ保存</button><button class="btn soft small" data-action="syncInboxNow">コーチ受信箱を確認</button></div>
        <form data-form="syncSetup" class="sync-form">
          <label class="field"><span class="field-label">GitHub トークン（変更する場合のみ）</span><input name="token" type="password" placeholder="••••••（保存済み）" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
          ${adv}
          <div class="btn-row"><button class="btn soft small" type="submit" id="syncTestBtn">設定を保存して接続テスト</button><button type="button" class="btn ghost danger small" data-action="syncDisconnect">接続を解除</button></div>
          <p class="sync-msg small" id="syncMsg"></p>
        </form>
      </details>
    </section>`;
  }
  function viewSettings(arg) {
    const bytes = new Blob([localStorage.getItem(STORE_KEY) || '']).size;
    const out = [sectionHead('設定・バックアップ')];
    out.push(syncCard());
    out.push(aiCard().replace('<ul class="small muted note-list">', aiDailySettings() + '<ul class="small muted note-list">'));
    out.push(gcalCard());
    out.push(`<section class="card">
      <div class="card-head"><h2>ファイルでバックアップ</h2></div>
      <p class="muted small">データはこの端末のブラウザ内（localStorage）に保存されています。${sync.connected ? 'GitHub にも自動で保存されています。' : '機種変更やブラウザのデータ削除に備えて、ときどき書き出してください。'}</p>
      <div class="btn-row">
        <button class="btn primary" data-action="exportJson">⬇ JSONで書き出す</button>
        ${navigator.share ? '<button class="btn soft" data-action="shareJson">共有して保存</button>' : ''}
        <button class="btn soft" data-action="copyJson">コピー</button>
        <button class="btn soft" data-action="importJson">⬆ 読み込む</button>
      </div>
      <div class="btn-row"><button class="btn soft" data-action="remindersImport">📥 リマインダーから読み込み</button><a class="btn soft" href="#coach">🧭 コーチに相談</a></div>
    </section>`);
    out.push(`<section class="card">
      <div class="card-head"><h2>カテゴリ</h2></div>
      <ul class="cat-edit">${state.categories.map((c, idx) => `<li><input value="${esc(c)}" data-change="renameCat" data-idx="${idx}" aria-label="カテゴリ名"><button class="icon-btn small danger" data-action="deleteCat" data-idx="${idx}" aria-label="${esc(c)}を削除">${ICON.trash}</button></li>`).join('')}</ul>
      <form class="add-step" data-form="addCat"><input name="name" placeholder="新しいカテゴリ" autocomplete="off"><button class="btn primary small" type="submit">追加</button></form>
    </section>`);
    out.push(`<section class="card">
      <div class="card-head"><h2>表示</h2></div>
      <div class="seg" role="group" aria-label="テーマ">${[['auto', '🌗 自動'], ['light', '☀️ ライト'], ['dark', '🌙 ダーク']].map(([k, l]) => `<button class="pill ${state.settings.theme === k ? 'on' : ''}" data-action="theme" data-v="${k}">${l}</button>`).join('')}</div>
      <p class="field-label" style="margin-top:14px">背景（ホームの上部）</p>
      <div class="bg-pick" role="group" aria-label="背景">${Object.entries(BACKGROUNDS).map(([k, l]) => `<button class="bg-opt ${state.settings.bg === k ? 'on' : ''}" data-action="setBg" data-v="${k}" aria-pressed="${state.settings.bg === k}"><span class="bg-sw bg-sw-${k}"></span><span>${l}</span></button>`).join('')}</div>
    </section>`);
    out.push(`<section class="card">
      <div class="card-head"><h2>サンプル</h2></div>
      <div class="btn-row">
        <button class="btn soft small" data-action="addSamples">サンプルを追加</button>
        <button class="btn soft small" data-action="addMemoSamples">サンプルを追加（手書きメモから）</button>
        <button class="btn soft small" data-action="removeSamples">（サンプル）を削除</button>
      </div>
    </section>`);
    out.push(`<section class="card">
      <div class="card-head"><h2>アプリについて</h2></div>
      <dl class="about">
        <dt>バージョン</dt><dd>${APP_VERSION}</dd>
        <dt>オフライン対応</dt><dd id="swStatus">${esc(swStatus)}</dd>
        <dt>保存データ</dt><dd>${(bytes / 1024).toFixed(1)} KB（項目 ${state.items.length}・習い事 ${state.lessons.length}・ジャーナル ${state.journal.length}・習慣 ${state.habits.length}）</dd>
        <dt>表示モード</dt><dd>${isStandalone() ? 'ホーム画面アプリ' : 'ブラウザ'}</dd>
      </dl>
      ${!isStandalone() ? '<p class="muted small">iPhone: Safariの共有ボタン →「ホーム画面に追加」でアプリとして使えます（HTTPSで公開されている必要があります）。</p>' : ''}
      <div class="btn-row"><button class="btn ghost danger small" data-action="wipeAll">すべてのデータを削除</button></div>
    </section>`);
    if (arg === 'sync' || arg === 'ai' || arg === 'gcal') setTimeout(() => { const c = $(arg === 'ai' ? '#aiCard' : arg === 'gcal' ? '#gcalCard' : '#syncCard'); if (c) c.scrollIntoView({ block: 'start' }); }, 0);
    return out.join('');
  }
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  // ───────────────────────── 習慣スタンプ（毎日の目標）とぽむ ─────────────────────────
  // レベル＝スタンプの累計日数。ルート（ふつう／お金持ち／わるぽむ）は直近14日の休み日数と連続日数で決まる。
  const POMU_LV = [0, 3, 7, 14, 30, 60, 100]; // Lv1〜Lv7 に必要な累計日数
  const POMU = {
    'stage-1': { name: 'ぽむたま', route: 'main', desc: 'たまごから顔を出したばかりの赤ちゃん' },
    'stage-2': { name: 'ぽむ', route: 'main', desc: '殻をぬけて、ちょこちょこ歩きだした' },
    'stage-3': { name: 'ぽむりん', route: 'main', desc: 'くまみみとしっぽが生えて、頭のつぼみがふくらんだ' },
    'stage-4': { name: 'はなぽむ', route: 'main', desc: '頭のお花がさいて、葉っぱスカーフでおめかし' },
    'stage-5': { name: 'ふわぽむ', route: 'main', desc: 'すきとおった羽で、ふわっと浮かべるように' },
    'stage-6': { name: 'ようせいぽむ', route: 'main', desc: '花かんむりと星のステッキで、願いをかなえる妖精に' },
    'stage-7': { name: 'おうさまぽむ', route: 'main', desc: '雲の上の王さま。100日つづけたあかし' },
    'rich-1': { name: 'こばんぽむ', route: 'rich', desc: '金の葉っぱと小判、コツコツが実をむすぶ' },
    'rich-2': { name: 'おかねもちぽむ', route: 'rich', desc: 'ベストと蝶ネクタイでちょっぴりセレブ' },
    'rich-3': { name: 'だいふごうぽむ', route: 'rich', desc: '金貨と宝石の山の上、うちでの小づちを持つ' },
    'villain-1': { name: 'いじけぽむ', route: 'villain', desc: '葉っぱがしおれて、ぷんぷん腕ぐみ' },
    'villain-2': { name: 'いたずらぽむ', route: 'villain', desc: 'ツノが生えてニヤリ、らくがきでいたずら' },
    'villain-3': { name: 'わるぽむ', route: 'villain', desc: 'マントをひるがえす、かわいい悪の親玉' },
  };
  const POMU_COND = { 'stage-1': 'Lv.1・0日〜', 'stage-2': 'Lv.2・3日〜', 'stage-3': 'Lv.3・7日〜', 'stage-4': 'Lv.4・14日〜', 'stage-5': 'Lv.5・30日〜', 'stage-6': 'Lv.6・60日〜', 'stage-7': 'Lv.7・100日',
    'rich-1': '累計14〜29日', 'rich-2': '累計30〜59日', 'rich-3': '累計60〜99日', 'villain-1': '休み4〜6日', 'villain-2': '休み7〜9日', 'villain-3': '休み10日〜' };
  const POMU_ROUTE = { main: 'すくすくルート', rich: 'お金持ちルート', villain: 'わるぽむルート' };
  const HABIT_EMOJIS = ['📚', '🏃', '💧', '🧘', '✍️', '🎹', '🌱', '💤', '🥗', '🧹', '💰', '🦷', '🚶', '🙏', '💊', '🇬🇧'];
  const pomuImg = (key, small) => `images/monster/${key}${small ? '-256' : ''}.webp`;
  function addDays(str, n) { const [y, m, d] = str.split('-').map(Number); return todayStr(new Date(y, m - 1, d + n)); }
  function dayDiff(a, b) { const p = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 86400000); }
  const getHabit = (id) => state.habits.find((h) => h.id === id);

  function habitStats(h, today = todayStr()) {
    const set = new Set(h.done.filter((d) => d >= h.startDate && d <= today));
    const total = set.size;
    let streak = 0;
    for (let d = set.has(today) ? today : addDays(today, -1); set.has(d); d = addDays(d, -1)) streak++;
    let best = 0; let run = 0; let prev = '';
    [...set].sort().forEach((x) => { run = prev && addDays(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; });
    // 直近14日（今日は含めない：今日が終わるまでは「休み」にしない）。開始日より前は数えない。
    const w = addDays(today, -14);
    const missed = [];
    for (let x = h.startDate > w ? h.startDate : w; x < today; x = addDays(x, 1)) if (!set.has(x)) missed.push(x);
    // ×（できなかった）を明示した日。進化の判定では「スタンプなし」と同じ扱い（missed に含まれる）
    const xset = new Set((h.missed || []).filter((d) => d >= h.startDate && d <= today && !set.has(d)));
    return { set, xset, total, streak, best, missed, M: missed.length, xTotal: xset.size, doneToday: set.has(today), missedToday: xset.has(today), today };
  }
  function pomuInfo(h, today = todayStr()) {
    const st = habitStats(h, today);
    const { total, M, streak } = st;
    const lv = POMU_LV.filter((t) => total >= t).length;
    let key;
    if (total >= 100 && M <= 3) key = 'stage-7';
    else if (streak < 7 && total >= 3 && M >= 4) key = M >= 10 ? 'villain-3' : M >= 7 ? 'villain-2' : 'villain-1';
    else if (total >= 14 && M <= 1) key = total >= 60 ? 'rich-3' : total >= 30 ? 'rich-2' : 'rich-1';
    else key = 'stage-' + lv;
    const next = POMU_LV[lv];
    const pct = next ? Math.round(((total - POMU_LV[lv - 1]) / (next - POMU_LV[lv - 1])) * 100) : 100;
    const info = { ...st, lv, key, ...POMU[key], next: next || 0, toNext: next ? next - total : 0, pct };
    info.hints = pomuHints(info);
    return info;
  }
  function pomuHints(i) {
    const { route, total, M, streak, missed, today, key } = i;
    if (!total) return ['スタンプを押すと、ぽむが育っていくよ'];
    const out = [];
    if (route === 'villain') {
      out.push(streak > 0 ? `あと${7 - streak}日連続で改心できるよ` : '7日連続でスタンプすると改心できるよ');
      return out;
    }
    if (key === 'stage-7') out.push('100日達成！ 雲の上の王さまだよ 👑');
    if (total >= 3 && streak < 7 && M >= 1 && M < 4) out.push(`あと${4 - M}日休むとわるぽむルート…`);
    if (route === 'rich') out.push(M >= 1 ? 'あと1日休むとお金持ちルートからはずれちゃう' : 'お金持ちルート中！ この調子でコツコツ 💰');
    else if (key !== 'stage-7' && total < 100) {
      if (M <= 1) out.push(`あと${14 - total}日、休まずに続けるとお金持ちルート`);
      else { const n = Math.max(dayDiff(today, addDays(missed[M - 2], 15)), 14 - total); out.push(`あと${n}日休まなければお金持ちルート`); }
    }
    return out.slice(0, 2);
  }
  // 段階が変わったときのお祝いメッセージ（下がったときは静かに）
  function pomuChangeMsg(a, b) {
    if (!a || a === b || !POMU[a] || !POMU[b]) return null;
    const ra = POMU[a].route; const rb = POMU[b].route;
    const lvOf = (k) => (k.startsWith('stage-') ? Number(k.slice(6)) : k.startsWith('rich-') ? 3 + Number(k.slice(5)) : 0);
    if (rb === 'villain') return ra !== 'villain' || b > a ? { text: ra !== 'villain' ? 'わるぽむになっちゃった…' : `${POMU[b].name}になっちゃった…`, big: true } : null;
    if (ra === 'villain') return { text: '改心した！', big: true };
    if (rb === 'rich' && ra !== 'rich') return { text: 'お金持ちルートへ！', big: true };
    if (lvOf(b) > lvOf(a)) return { text: '進化した！', big: true };
    if (ra === 'rich' && rb !== 'rich') return { text: 'お金持ちルートからはずれちゃった…', big: false };
    return null;
  }
  // 今の段階を記録（図鑑の解放も）。変化があればメッセージを返す。
  function updatePomu(h) {
    const info = pomuInfo(h);
    let changed = false;
    if (!h.unlocked.includes(info.key)) { h.unlocked.push(info.key); changed = true; }
    const msg = h.seen !== info.key ? pomuChangeMsg(h.seen, info.key) : null;
    if (h.seen !== info.key) { h.seen = info.key; changed = true; }
    return { info, msg, changed };
  }
  // 日付が進んでルートが変わった場合など、画面を開いたときに確認する
  function checkPomuChanges() {
    let changed = false; let first = null;
    state.habits.forEach((h) => { const r = updatePomu(h); if (r.changed) changed = true; if (r.msg && !first) first = { h, ...r }; });
    if (changed) save();
    if (first) setTimeout(() => showPomuMsg(first.h, first.info, first.msg), 450);
  }
  function showPomuMsg(h, info, msg) {
    if (!msg) return;
    if (!msg.big) { toast(`${h.emoji} ${msg.text}`); return; }
    const old = $('#pomuCelebrate'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'pomuCelebrate'; el.className = 'pomu-celebrate route-' + info.route; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', msg.text);
    const bits = info.route === 'villain' ? ['💢', '🌀', '💧', '⚡', '💢', '🌀'] : info.route === 'rich' ? ['🪙', '✨', '💰', '🪙', '✨', '💎'] : ['✨', '🌸', '⭐', '✨', '🌸', '💫'];
    el.innerHTML = `<div class="pc-card"><div class="pc-burst" aria-hidden="true">${bits.map((b, k) => `<i style="--k:${k}">${b}</i>`).join('')}</div>
      <img class="pc-img" src="${pomuImg(info.key)}" alt="" width="512" height="512">
      <p class="pc-text">${esc(msg.text)}</p>
      <p class="pc-name">${esc(h.emoji)} ${esc(h.name)}<br><b>${esc(info.name)}</b>（Lv.${info.lv}）</p>
      <button type="button" class="btn primary">${info.route === 'villain' ? 'がんばる…' : 'やったね！'}</button></div>`;
    document.body.appendChild(el);
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
    el.addEventListener('click', close);
    setTimeout(() => { if (el.isConnected) close(); }, 4200);
  }

  const STAMP_O = '<svg class="st-o" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14.5"/></svg>';
  const STAMP_X = '<svg class="st-x" viewBox="0 0 40 40" aria-hidden="true"><path d="M9 9l22 22M31 9L9 31"/></svg>';
  // 自分で押した「できなかった」の × スタンプ（〇とは別の色・太さ）
  const STAMP_XM = '<svg class="st-xm" viewBox="0 0 40 40" aria-hidden="true"><path d="M11 11l18 18M29 11L11 29"/></svg>';
  function habitRow(h) {
    const i = pomuInfo(h);
    return `<div class="habit-row ${i.doneToday ? 'is-done' : ''}" data-habit="${h.id}">
      <a class="hr-main" href="#habits/${h.id}"><span class="hr-pomu"><img src="${pomuImg(i.key, true)}" alt="${esc(i.name)}" width="256" height="256" loading="lazy"></span>
        <span class="grow"><b class="hr-title">${esc(h.emoji)} ${esc(h.name)}</b><span class="hr-sub"><span class="hr-lv">Lv.${i.lv}</span> ${esc(i.name)}</span><span class="hr-sub">連続 ${i.streak}日・累計 ${i.total}日</span></span></a>
      <button class="stamp-btn ${i.doneToday ? 'on' : i.missedToday ? 'is-x' : ''}" data-action="habitToggle" data-id="${h.id}" aria-pressed="${i.doneToday}" aria-label="${esc(h.name)}：${i.doneToday ? '今日のスタンプを取り消す' : '今日のスタンプを押す'}">${i.missedToday ? STAMP_XM : STAMP_O}<span>${i.doneToday ? '済' : i.missedToday ? '' : '押す'}</span></button>
    </div>`;
  }
  function homeHabitsCard() {
    if (!state.habits.length) {
      return `<a class="card habit-invite" href="#habits"><img src="${pomuImg('stage-1', true)}" alt="" width="256" height="256" loading="lazy"><span class="grow"><b>毎日の目標スタンプ</b><span class="muted small">毎日つづけるほど、ぽむが育ちます。タップして始める</span></span></a>`;
    }
    const n = state.habits.filter((h) => habitStats(h).doneToday).length;
    return `<section class="card habits-home">
      <div class="card-head"><h2>🐣 今日のスタンプ <span class="count ${n === state.habits.length ? 'all' : ''}">${n}/${state.habits.length}</span></h2><a class="link" href="#habits">すべて見る</a></div>
      <div class="habit-list">${state.habits.map(habitRow).join('')}</div>
    </section>`;
  }
  function viewHabits(arg) {
    checkPomuChanges();
    if (arg === 'zukan') return viewZukan();
    if (arg) return viewHabit(arg);
    const out = [sectionHead('習慣スタンプ', '毎日の目標に〇をつけよう。続けるほど、ぽむが育ちます。', '<button class="btn primary small" data-action="editHabit">＋ 追加</button>')];
    if (!state.habits.length) {
      out.push(`<section class="card habit-empty"><img src="${pomuImg('stage-1')}" alt="ぽむたま" width="512" height="512"><h3>まだ目標がありません</h3>
        <p class="muted">「英語5分」「ストレッチ」など、毎日つづけたいことを1つ決めましょう。スタンプを押すたびに、たまごの「ぽむ」が育っていきます。</p>
        <div class="btn-row center"><button class="btn primary" data-action="editHabit">＋ 目標をつくる</button><a class="btn soft" href="#habits/zukan">📖 ぽむ図鑑</a></div></section>`);
      return out.join('');
    }
    out.push(`<section class="card"><div class="habit-list">${state.habits.map(habitRow).join('')}</div></section>`);
    out.push(`<a class="card zukan-entry" href="#habits/zukan"><span class="ze-imgs">${['stage-3', 'rich-1', 'villain-1'].map((k) => `<img src="${pomuImg(k, true)}" alt="" width="256" height="256" loading="lazy">`).join('')}</span><span class="grow"><b>📖 ぽむ図鑑</b><span class="muted small">${new Set(state.habits.flatMap((h) => h.unlocked)).size}/13 発見・進化のしかたを見る</span></span>${ICON.back.replace('<svg', '<svg style="transform:rotate(180deg)"')}</a>`);
    return out.join('');
  }
  function habitCalendar(h, st, ym) {
    const [y, m] = ym.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const lead = new Date(y, m - 1, 1).getDay();
    const cells = [];
    const prevDays = new Date(y, m - 1, 0).getDate();
    for (let k = lead - 1; k >= 0; k--) cells.push(`<span class="hc-day other"><span class="hc-num">${prevDays - k}</span></span>`);
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${pad(m)}-${pad(d)}`;
      const dow = (lead + d - 1) % 7;
      const done = st.set.has(ds); const future = ds > st.today; const before = ds < h.startDate;
      const marked = !done && !before && !future && st.xset.has(ds); // 自分で × を押した日
      const missed = !done && !before && (ds < st.today || marked);
      const cls = [done ? 'done' : '', missed ? 'missed' : '', marked ? 'marked-x' : missed ? 'auto-x' : '', ds === st.today ? 'today' : '', future ? 'future' : '', before ? 'before' : '', dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''].join(' ');
      const inner = `<span class="hc-num">${d}</span><span class="hc-mark">${done ? STAMP_O : marked ? STAMP_XM : missed ? STAMP_X : ''}</span>`;
      if (future) cells.push(`<span class="hc-day ${cls}">${inner}</span>`);
      else cells.push(`<button class="hc-day ${cls}" data-action="habitCycle" data-id="${h.id}" data-date="${ds}" aria-pressed="${done}" aria-label="${m}月${d}日${done ? '（できた）' : marked ? '（できなかった）' : missed ? '（スタンプなし）' : ''}・タップで 〇→×→なし">${inner}</button>`);
    }
    for (let k = 1; cells.length % 7; k++) cells.push(`<span class="hc-day other"><span class="hc-num">${k}</span></span>`);
    return cells.join('');
  }
  function viewHabit(id) {
    const h = getHabit(id);
    if (!h) return sectionHead('見つかりません') + '<p class="muted">この目標は削除されたようです。</p><a class="btn soft" href="#habits">習慣スタンプへ</a>';
    const i = pomuInfo(h);
    const curYm = i.today.slice(0, 7);
    let ym = ui.habitMonth[h.id] || curYm;
    if (ym > curYm) ym = curYm;
    const [y, m] = ym.split('-').map(Number);
    const mDays = new Date(y, m, 0).getDate();
    const mDone = [...i.set].filter((d) => d.startsWith(ym)).length;
    const size = 132 + (i.lv - 1) * 20;
    const out = [];
    out.push(`<div class="detail-top"><a class="btn ghost small" href="#habits">${ICON.back} 一覧</a>
      <div class="btn-row"><a class="btn soft small" href="#habits/zukan">📖 図鑑</a><button class="btn soft small" data-action="editHabit" data-id="${h.id}">${ICON.edit} 編集</button></div></div>`);
    out.push(`<h1 class="habit-title"><span class="ht-emoji" aria-hidden="true">${esc(h.emoji)}</span>${esc(h.name)}</h1>`);
    out.push(`<section class="card pomu-card route-${i.route}">
      <div class="pomu-stage" style="--pomu-size:${size}px"><img class="pomu-img" src="${pomuImg(i.key)}" alt="${esc(i.name)}" width="512" height="512"></div>
      <div class="pomu-meta"><span class="pomu-lv">Lv.${i.lv}</span><span class="chip route-chip">${POMU_ROUTE[i.route]}</span></div>
      <h2 class="pomu-name">${esc(i.name)}</h2>
      <p class="pomu-desc">${esc(i.desc)}</p>
      <div class="pomu-next"><span>${i.next ? `Lv.${i.lv + 1}まで あと <b>${i.toNext}</b>日` : '最高レベル！'}</span><span class="muted small">累計 ${i.total}日</span></div>
      ${progressBar(i.next ? i.total - POMU_LV[i.lv - 1] : 1, i.next ? i.next - POMU_LV[i.lv - 1] : 1, 'pomu-progress')}
      ${i.hints.map((t) => `<p class="pomu-hint">${esc(t)}</p>`).join('')}
      <p class="stamp-q">今日はどうだった？</p>
      <div class="stamp-pair">
        <button class="stamp-big ${i.doneToday ? 'on' : ''}" data-action="habitMark" data-mark="done" data-id="${h.id}" aria-pressed="${i.doneToday}">${STAMP_O}<span>${i.doneToday ? 'できた！' : 'できた'}</span>${i.doneToday ? '<small>タップで取り消し</small>' : ''}</button>
        <button class="stamp-miss ${i.missedToday ? 'on' : ''}" data-action="habitMark" data-mark="missed" data-id="${h.id}" aria-pressed="${i.missedToday}">${STAMP_XM}<span>できなかった</span>${i.missedToday ? '<small>タップで取り消し</small>' : ''}</button>
      </div>
      <p class="stamp-note">カレンダーの日付をタップすると 〇 → × → なし の順に切り替わります</p>
    </section>`);
    out.push(`<section class="card habit-cal">
      <div class="hc-head"><button class="icon-btn" data-action="habitMonth" data-id="${h.id}" data-dir="-1" aria-label="前の月" ${ym <= habitMinYm(h) ? 'disabled' : ''}>${ICON.back}</button>
        <h2 class="hc-title">${y}.<b>${m}</b></h2>
        <button class="icon-btn" data-action="habitMonth" data-id="${h.id}" data-dir="1" aria-label="次の月" ${ym >= curYm ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>
      <div class="hc-grid hc-week">${'日月火水木金土'.split('').map((w, k) => `<span class="${k === 0 ? 'sun' : k === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
      <div class="hc-grid">${habitCalendar(h, i, ym)}</div>
      <div class="hc-legend" aria-label="凡例"><span class="lg lg-o">${STAMP_O}できた</span><span class="lg lg-x">${STAMP_XM}できなかった</span><span class="lg lg-auto">${STAMP_X}未記入</span></div>
      <p class="hc-hint">付け忘れた日は、日付をタップすると〇・×を付けられます</p>
      ${ym !== curYm ? `<div class="center"><button class="btn ghost small" data-action="habitMonth" data-id="${h.id}" data-dir="0">今月にもどる</button></div>` : ''}
    </section>`);
    const ring = (pct) => `style="--p:${Math.max(0, Math.min(100, pct))}"`;
    out.push(`<section class="habit-stats">
      <div class="hs-circle total"><span class="hs-n">${i.total}<small>日</small></span><span class="hs-s">${h.startDate.replace(/-/g, '.')}〜</span><span class="hs-l">累計日数</span></div>
      <div class="hs-circle month" ${ring((mDone / mDays) * 100)}><span class="hs-n">${mDone}<small>日</small></span><span class="hs-s">/ ${mDays}日</span><span class="hs-l">${m}月</span></div>
      <div class="hs-circle streak"><span class="hs-n">${i.streak}<small>日</small></span><span class="hs-s">${i.doneToday || !i.streak ? '' : '今日押すと +1'}</span><span class="hs-l">現在の連続日数</span></div>
      <div class="hs-circle best"><span class="hs-n">${i.best}<small>日</small></span><span class="hs-s">${i.best && i.best === i.streak ? '記録更新中！' : ''}</span><span class="hs-l">最長連続</span></div>
    </section>`);
    const mX = [...i.xset].filter((d) => d.startsWith(ym)).length;
    out.push(`<section class="card hs-missed"><span class="hsm-mark">${STAMP_XM}</span><span class="grow"><b>できなかった日</b><span class="muted small">${m}月 ${mX}日・直近14日のお休み ${i.M}日（×とスタンプなし）</span></span><span class="hsm-n" id="missedCount">${i.xTotal}<small>日</small></span></section>`);
    return out.join('');
  }
  function viewZukan() {
    const un = new Set(state.habits.flatMap((h) => h.unlocked));
    const groups = [['main', '7つの段階。スタンプの累計日数で育ちます。', ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7']],
      ['rich', '累計14日以上で、直近14日のお休みが1日以下だと…', ['rich-1', 'rich-2', 'rich-3']],
      ['villain', '直近14日で4日以上お休みすると…。7日連続スタンプで改心します。', ['villain-1', 'villain-2', 'villain-3']]];
    const out = [`<div class="detail-top"><a class="btn ghost small" href="#habits">${ICON.back} 習慣スタンプ</a></div>`,
      sectionHead('ぽむ図鑑', `${un.size}/13 発見・目標ごとに1匹ずつ育ちます`)];
    groups.forEach(([route, note, keys]) => {
      out.push(`<section class="card zukan-group route-${route}"><div class="card-head"><h2>${POMU_ROUTE[route]}</h2><span class="muted small">${keys.filter((k) => un.has(k)).length}/${keys.length}</span></div>
        <p class="muted small">${note}</p>
        <div class="zk-grid">${keys.map((k) => { const on = un.has(k); return `<div class="zk-tile ${on ? 'on' : 'locked'}" data-key="${k}">
          <span class="zk-img"><img src="${pomuImg(k, true)}" alt="${on ? esc(POMU[k].name) : ''}" width="256" height="256" loading="lazy"></span>
          <span class="zk-cond">${POMU_COND[k]}</span><b class="zk-name">${on ? esc(POMU[k].name) : '？？？'}</b>
          <span class="zk-desc">${on ? esc(POMU[k].desc) : 'まだ見つけていません'}</span></div>`; }).join('')}</div></section>`);
    });
    out.push('<p class="muted small center">レベルはスタンプの「累計日数」で決まります（連続でなくてもOK）。今日はまだ「お休み」にはなりません。</p>');
    return out.join('');
  }
  // 付け忘れの記入はさかのぼれる（開始日より前でも OK・最大 HABIT_BACK_MONTHS か月前、開始月がもっと前ならそこまで）
  const HABIT_BACK_MONTHS = 24;
  function habitMinYm(h) {
    const t = new Date(); const back = monthKey(new Date(t.getFullYear(), t.getMonth() - HABIT_BACK_MONTHS, 1));
    const s = h.startDate.slice(0, 7);
    return s < back ? s : back;
  }
  // さかのぼって付けたときのぽむの変化は、続けて押し終わってから最後の姿で1回だけお知らせ
  const pomuBatch = new Map(); // id -> { from, timer }
  function queuePomuMsg(h) {
    const b = pomuBatch.get(h.id);
    clearTimeout(b.timer);
    b.timer = setTimeout(() => {
      pomuBatch.delete(h.id);
      const cur = getHabit(h.id); if (!cur) return;
      const info = pomuInfo(cur);
      const msg = b.from !== info.key ? pomuChangeMsg(b.from, info.key) : null;
      if (msg) showPomuMsg(cur, info, msg);
    }, POMU_BATCH_MS);
  }
  const POMU_BATCH_MS = 1400;
  // 日付の状態：'done'（〇）/ 'missed'（×）/ ''（なし）
  const habitDayState = (h, ds) => (h.done.includes(ds) ? 'done' : (h.missed || []).includes(ds) ? 'missed' : '');
  function setHabitDay(id, date, to) {
    const h = getHabit(id);
    if (!h) return;
    const today = todayStr();
    const ds = isDateStr(date) ? date : today;
    if (ds > today || ds < habitMinYm(h) + '-01') return;
    const from = habitDayState(h, ds);
    if (from === to) return;
    const backfill = ds !== today || pomuBatch.has(h.id);
    if (backfill && !pomuBatch.has(h.id)) pomuBatch.set(h.id, { from: h.seen || pomuInfo(h).key, timer: null });
    // 開始日より前に付けたら、開始日をその日までさかのぼる（取り消しても開始日は戻さない）
    const moved = to && ds < h.startDate;
    if (moved) h.startDate = ds;
    h.done = h.done.filter((d) => d !== ds);
    h.missed = (h.missed || []).filter((d) => d !== ds);
    if (to === 'done') h.done = [...h.done, ds].sort();
    if (to === 'missed') h.missed = [...h.missed, ds].sort();
    h.updatedAt = nowIso();
    const r = updatePomu(h);
    save(); rerender();
    const day = ds === today ? '今日' : fmtShort(ds);
    if (backfill) { queuePomuMsg(h); if (moved) { toast(`${to === 'done' ? '〇' : '×'} ${day}を付けました（開始日を ${fmtShort(ds)} にしました）`); return; } }
    else if (r.msg && r.msg.big) { showPomuMsg(h, r.info, r.msg); return; }
    else if (r.msg) { toast(`${h.emoji} ${r.msg.text}`); return; }
    if (to === 'done') toast(`〇 ${day}のスタンプ！（累計 ${r.info.total}日）`);
    else if (to === 'missed') toast(`× ${day}は「できなかった」にしました。また明日から！`);
    else toast(from === 'done' ? 'スタンプを取り消しました' : '× を取り消しました');
  }
  // 〇 の付け外し（ホームの「押す」ボタンなど）
  function toggleHabitDay(id, date) {
    const h = getHabit(id); if (!h) return;
    const ds = isDateStr(date) ? date : todayStr();
    setHabitDay(id, ds, habitDayState(h, ds) === 'done' ? '' : 'done');
  }
  // 「できた」「できなかった」ボタン：同じものをもう一度押すと取り消し
  function markHabitDay(id, mark, date) {
    const h = getHabit(id); if (!h) return;
    const ds = isDateStr(date) ? date : todayStr();
    const to = mark === 'missed' ? 'missed' : 'done';
    setHabitDay(id, ds, habitDayState(h, ds) === to ? '' : to);
  }
  // カレンダーの日付：なし → 〇 → × → なし
  function cycleHabitDay(id, date) {
    const h = getHabit(id); if (!h) return;
    const cur = habitDayState(h, date);
    setHabitDay(id, date, cur === '' ? 'done' : cur === 'done' ? 'missed' : '');
  }
  function openHabitEditor(id) {
    const h = id ? getHabit(id) : null;
    const v = h || { emoji: '📚', name: '', startDate: todayStr() };
    openModal(`${modalHead(h ? '目標を編集' : '毎日の目標をつくる')}
      <form data-form="habit" data-id="${h ? h.id : ''}">
        <div class="habit-name-row"><label class="field emoji-field"><span class="field-label">絵文字</span><input name="emoji" value="${esc(v.emoji)}" maxlength="8" autocomplete="off" aria-label="絵文字"></label>
          <label class="field grow"><span class="field-label">目標</span><input name="name" value="${esc(v.name)}" required autocomplete="off" placeholder="例：英語5分、ストレッチ" ${h ? '' : 'autofocus'}></label></div>
        <div class="emoji-pick" role="group" aria-label="絵文字を選ぶ">${HABIT_EMOJIS.map((e) => `<button type="button" class="emoji-opt" data-action="pickEmoji" data-v="${e}">${e}</button>`).join('')}</div>
        <label class="field"><span class="field-label">開始日</span><input type="date" name="startDate" value="${esc(v.startDate)}" max="${todayStr()}" required></label>
        <p class="muted small">開始日より前の日は「お休み」になりません。${h ? '' : 'ぽむのたまごが1つ届きます 🥚'}</p>
        <div class="btn-row between">${h ? `<button type="button" class="btn ghost danger" data-action="deleteHabit" data-id="${h.id}">削除</button>` : '<span></span>'}
          <span class="btn-row"><button type="button" class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" type="submit">${h ? '保存' : 'はじめる'}</button></span></div>
      </form>`);
  }
  function submitHabit(form) {
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) return;
    const data = { emoji: String(fd.get('emoji') || ''), name, startDate: isDateStr(fd.get('startDate')) ? fd.get('startDate') : todayStr() };
    if (data.startDate > todayStr()) data.startDate = todayStr();
    const h = getHabit(form.dataset.id);
    if (h) {
      Object.assign(h, normHabit({ ...h, ...data }), { updatedAt: nowIso() });
      updatePomu(h); save(); closeModal(); rerender(); toast('保存しました');
    } else {
      const nh = normHabit(data);
      updatePomu(nh); state.habits.push(nh); save(); closeModal(); go('#habits/' + nh.id); toast(`${nh.emoji} 「${nh.name}」をはじめました`);
    }
  }
  async function deleteHabit(id) {
    const h = getHabit(id);
    if (!h) return;
    if (!(await confirmDialog(`「${h.emoji} ${h.name}」を削除しますか？\nスタンプの記録と、育てたぽむ（${pomuInfo(h).name}）も消えます。`, '削除する', true))) return;
    const snap = snapshot();
    state.habits = state.habits.filter((x) => x.id !== id);
    markDeleted(id); save(); go('#habits'); undoable('削除しました', snap);
  }
