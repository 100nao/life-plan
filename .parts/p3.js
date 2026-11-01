
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
  function journalList(q) {
    const nq = q.trim().toLowerCase();
    const list = state.journal.filter((e) => !nq || e.text.toLowerCase().includes(nq) || e.date.includes(nq) || e.linked.some((id) => { const it = getItem(id); return it && it.title.toLowerCase().includes(nq); }))
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    if (!state.journal.length) return emptyState('ジャーナルはまだありません', 'その日の出来事、気分、考えたことを短く残しておきましょう。タスクと結びつけることもできます。', '<button class="btn primary" data-action="editJournal">＋ 今日を書く</button><button class="btn soft" data-action="pickPhoto">📷 写真から追加</button><button class="btn soft" data-action="openObsidian">📝 Obsidianから取り込む</button>');
    if (!list.length) return '<p class="muted center pad">見つかりませんでした。</p>';
    let html = ''; let cur = '';
    list.forEach((e) => {
      const m = e.date.slice(0, 7);
      if (m !== cur) { cur = m; html += `<h3 class="month-head">${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月</h3>`; }
      html += `<article class="card journal" data-action="editJournal" data-id="${e.id}" role="button" tabindex="0">
        <div class="journal-head"><span class="mood" title="${MOOD_LABEL[e.mood] || ''}">${MOODS[e.mood] || '📝'}</span><b>${fmtDate(e.date)}</b>${e.mood ? `<span class="muted small">気分 ${e.mood}/5</span>` : ''}${e.source ? `<span class="chip src-chip">${{ photo: '📷 手書き', obsidian: '📝 Obsidian', ai: '🤖 AI' }[e.source]}</span>` : ''}</div>
        <p class="pre">${esc(e.text)}</p>
        ${e.linked.length ? `<div class="chips">${e.linked.map((id) => { const it = getItem(id); return it ? `<button class="chip link-chip" data-action="openItem" data-id="${it.id}">🔗 ${esc(trunc(it.title, 20))}</button>` : ''; }).join('')}</div>` : ''}
      </article>`;
    });
    return html;
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
    out.push(aiCard());
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
        <dt>保存データ</dt><dd>${(bytes / 1024).toFixed(1)} KB（項目 ${state.items.length}・習い事 ${state.lessons.length}・ジャーナル ${state.journal.length}）</dd>
        <dt>表示モード</dt><dd>${isStandalone() ? 'ホーム画面アプリ' : 'ブラウザ'}</dd>
      </dl>
      ${!isStandalone() ? '<p class="muted small">iPhone: Safariの共有ボタン →「ホーム画面に追加」でアプリとして使えます（HTTPSで公開されている必要があります）。</p>' : ''}
      <div class="btn-row"><button class="btn ghost danger small" data-action="wipeAll">すべてのデータを削除</button></div>
    </section>`);
    if (arg === 'sync' || arg === 'ai') setTimeout(() => { const c = $(arg === 'ai' ? '#aiCard' : '#syncCard'); if (c) c.scrollIntoView({ block: 'start' }); }, 0);
    return out.join('');
  }
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
