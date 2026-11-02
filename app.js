/* ライフプラン — 個人用ライフプランニング PWA
   データはすべてこのブラウザの localStorage にのみ保存されます（サーバー送信なし）。 */
'use strict';
(() => {
  // ───────────────────────── 定数 ─────────────────────────
  const STORE_KEY = 'lifeplan.v1';
  const APP_VERSION = '1.5.0';
  const DEFAULT_CATEGORIES = ['旅行', '仕事/キャリア', '健康', '家族', '趣味', '学び', 'お金', 'その他'];
  const IMPORTANCE = { high: '高', mid: '中', low: '低' };
  const IMPORTANCE_ORDER = { high: 0, mid: 1, low: 2 };
  const TIMEFRAME = { thisYear: '今年', y1_3: '1〜3年', y5: '5年以内', someday: 'いつか' };
  const TIMEFRAME_ORDER = { thisYear: 0, y1_3: 1, y5: 2, someday: 3, '': 4 };
  const STATUS = { todo: '未着手', doing: '進行中', done: '完了' };
  const LESSON_STATUS = { considering: '検討中', active: '継続中', paused: '休止', ended: '終了' };
  const BACKGROUNDS = { mist: 'かすみ', sunrise: '朝焼け', forest: '森', ocean: '海', none: 'なし（無地）' };
  const VIEW_ICON = { 'ホーム': '🏠', 'マトリックス': '🧭', 'やりたい事': '⭐', '後回しでいい事': '🕰️', '習い事': '🎹', 'コーチに相談': '💬', 'ジャーナル': '📔', '完了履歴': '🏆', '未整理（インボックス）': '📥', '検索': '🔍', '設定・バックアップ': '⚙️', 'AIに相談（Gemini）': '🤖', '見つかりません': '🫥', '習慣スタンプ': '🐣', 'ぽむ図鑑': '📖' };
  const QUAD_ICON = { q1: '🔥', q2: '🌱', q3: '⚡', q4: '🍃' };
  const LIST_ICON = { task: '📌', wish: '⭐', later: '🕰️', inbox: '📥' };
  const CAT_ICONS = [[/旅|旅行|トラベル/, '✈️'], [/仕事|キャリア|職/, '💼'], [/健康|運動|体|医/, '🏃'], [/家族|子|親|恋|友/, '👨‍👩‍👧'], [/趣味|遊/, '🎨'], [/学|勉強|資格|英/, '📚'], [/お金|家計|貯|投資/, '💰'], [/家|住|引っ越|部屋/, '🏡'], [/買|ショッピング/, '🛍️'], [/料理|食/, '🍳'], [/音楽|ピアノ/, '🎵']];
  const TITLE_ICONS = [[/旅行|旅|ツアー|オーロラ|パリ|ハワイ|USJ/, '✈️'], [/パスポート|申請|手続|書類|契約|解約/, '📄'], [/予約|病院|歯医者|眼科|ICL|検査|クリニック/, '🏥'], [/マラソン|ラン|ジョギング|ジム|筋トレ|ヨガ/, '🏃'], [/英会話|英語|勉強|資格|試験|講座|本|読/, '📚'], [/会議|資料|仕事|メール|プレゼン|パリティ/, '💼'], [/買|購入|ショッピング/, '🛍️'], [/料理|ご飯|ランチ|ディナー/, '🍳'], [/陶芸|絵|写真|カメラ|手芸/, '🎨'], [/ピアノ|ギター|歌|音楽/, '🎵'], [/引っ越|掃除|片付|部屋|家具/, '🏡'], [/お金|貯金|投資|保険|税/, '💰'], [/電話|連絡/, '📞'], [/誕生日|プレゼント|記念/, '🎁']];
  const itemIcon = (i) => { for (const [re, e] of TITLE_ICONS) if (re.test(i.title)) return e; for (const [re, e] of CAT_ICONS) if (re.test(i.category || '')) return e; return i.quadrant ? QUAD_ICON[i.quadrant] : LIST_ICON[i.list] || '📌'; };
  const LISTS = { task: 'タスク', wish: 'やりたい事', later: '後回しでいい事', inbox: '未整理' };
  const QUADRANTS = {
    q1: { label: '緊急かつ重要', hint: '今すぐやる' },
    q2: { label: '重要だが緊急でない', hint: '計画してやる' },
    q3: { label: '緊急だが重要でない', hint: '任せる・手早く' },
    q4: { label: 'どちらでもない', hint: 'やめる・あとで' },
  };
  const QUADRANT_LAYOUT = ['q1', 'q3', 'q2', 'q4']; // 上段=緊急、左列=重要
  const STUCK_DAYS = 14;
  const STUCK_REASONS = ['時間がない', '優先度が低い', '気が重い', '次の一歩が不明', 'お金', '他人待ち', 'その他'];
  const MOODS = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };
  const MOOD_LABEL = { 1: 'とても低い', 2: '低め', 3: 'ふつう', 4: '良い', 5: 'とても良い' };
  const STEP_TEMPLATES = {
    '引っ越し': ['希望条件（エリア・予算・広さ）を決める', '物件を探して内見を予約する', '内見して申し込む', '契約・初期費用の支払い', '引っ越し業者を比較して予約する', '不用品の処分・荷造り', '役所の手続き（転出・転入）', '電気・ガス・水道・ネットの手続き', '住所変更（銀行・カード・会社など）'],
    '資格取得': ['取る資格と目的を決める', '試験日・申込期限を調べる', '教材・講座を選ぶ', '学習計画を立てる（週あたりの時間）', '受験を申し込む', '基礎をひと通り学ぶ', '過去問・模試を解く', '弱点を復習する', '受験する'],
    '旅行計画': ['行き先と時期を決める', '同行者と予算を決める', '航空券・交通手段を予約する', '宿を予約する', '行きたい場所・お店をリストアップ', '大まかな日程表を作る', '持ち物・書類（パスポート等）を確認', '出発！'],
    '買い物': ['欲しい理由と予算を決める', '候補を3つほど調べる', 'レビュー・価格を比較する', '実物を見る（必要なら）', '購入する', '届いたら確認・不要品を処分'],
    '習慣づくり': ['目的を一言で書く', '最小の行動を決める（例：5分だけ）', 'やる時間と場所を決める', '2週間続けて記録する', '振り返って調整する'],
    '人に相談・依頼': ['相談内容を3行でまとめる', '相手と期限を決める', '連絡する', 'リマインドする日を決めて待つ', '結果を反映する'],
  };

  // サンプル（ボタンを押したときだけ追加。自動では入れない）
  const GENERIC_SAMPLES = [
    { list: 'wish', title: '（サンプル）オーロラを見に行く', category: '旅行', importance: 'mid', timeframe: 'y5', quadrant: 'q2', notes: 'サンプルです。不要なら削除してください。' },
    { list: 'wish', title: '（サンプル）フルマラソンを完走する', category: '健康', importance: 'high', timeframe: 'y1_3', quadrant: 'q2', steps: ['10kmを走れるようになる', 'ハーフマラソンに出る', 'フルマラソンにエントリー', '完走する'] },
    { list: 'task', title: '（サンプル）来週の会議資料を作る', category: '仕事/キャリア', importance: 'high', quadrant: 'q1' },
    { list: 'later', title: '（サンプル）陶芸体験に行く', category: '趣味', importance: 'low', timeframe: 'someday', quadrant: 'q4' },
    { list: 'inbox', title: '（サンプル）気になったことをとりあえずメモ' },
  ];
  const GENERIC_LESSON_SAMPLE = { name: '（サンプル）英会話レッスン', status: 'considering', frequency: '週1', monthlyCost: 10000, notes: 'サンプルです。不要なら削除してください。' };
  // 手書きメモ（紙のマトリックス）から書き起こした項目
  const MEMO_SAMPLES = {
    q1: ['チームの戦略を考える', '9hoursパリティ解消', '総経結日程決める'],
    q3: ['家探し（社宅に申告のため続いたふり）', 'あやの大阪旅行計画'],
    q2: ['英会話', '読書', '運動', 'TBの日を決める', '引っ越しする'],
    q4: ['ボトックス打つ', 'AIと戦略作成', 'ICL予約する', 'スーツを買う', 'ふるさと納税'],
  };

  // ───────────────────────── ユーティリティ ─────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const nowIso = () => new Date().toISOString();
  const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
  const fmtYen = (n) => '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP');
  const isDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  function daysSince(iso) {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }
  function daysUntil(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const t = new Date(y, m - 1, d);
    const n = new Date(); n.setHours(0, 0, 0, 0);
    return Math.round((t - n) / 86400000);
  }
  function fmtDate(dateStr) {
    if (!isDateStr(dateStr)) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
    return `${y}年${m}月${d}日（${w}）`;
  }
  const fmtShort = (dateStr) => (isDateStr(dateStr) ? `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}` : '');
  const isoToDate = (iso) => (iso ? todayStr(new Date(iso)) : '');
  function dueText(dateStr) {
    const n = daysUntil(dateStr);
    if (n < 0) return `${-n}日超過`;
    if (n === 0) return '今日まで';
    return `あと${n}日`;
  }
  const norm = (s) => String(s || '').replace(/（サンプル）/g, '').replace(/[\s　]/g, '').toLowerCase();

  // ───────────────────────── 保存 ─────────────────────────
  function defaultState() {
    return { schema: 2, categories: [...DEFAULT_CATEGORIES], categoriesAt: '', items: [], lessons: [], journal: [], coachNotes: [], habits: [], aiAnalyses: [], aiSuggestions: [], countdowns: [], gcalDeletes: [], focus: {}, focusAt: {}, deleted: {}, settings: { theme: 'auto', bg: 'mist' } };
  }
  function normStep(s) {
    if (typeof s === 'string') s = { text: s };
    return { id: s.id || uid(), text: String(s.text || s.title || '').trim(), due: isDateStr(s.due) ? s.due : (isDateStr(s.dueDate) ? s.dueDate : ''), done: !!(s.done || s.isCompleted), doneAt: s.doneAt || '' };
  }
  function normItem(i) {
    const t = nowIso();
    const stuck = i.stuck && typeof i.stuck === 'object' ? i.stuck : {};
    return {
      id: i.id || uid(),
      list: LISTS[i.list] ? i.list : 'inbox',
      title: String(i.title || '').trim() || '（無題）',
      notes: String(i.notes || ''),
      category: String(i.category || ''),
      importance: IMPORTANCE[i.importance] ? i.importance : 'mid',
      timeframe: TIMEFRAME[i.timeframe] ? i.timeframe : '',
      targetDate: isDateStr(i.targetDate) ? i.targetDate : '',
      status: STATUS[i.status] ? i.status : 'todo',
      quadrant: QUADRANTS[i.quadrant] ? i.quadrant : '',
      steps: (Array.isArray(i.steps) ? i.steps : Array.isArray(i.subtasks) ? i.subtasks : []).map(normStep).filter((s) => s.text),
      tags: Array.isArray(i.tags) ? i.tags.map(String) : [],
      stuck: { tags: Array.isArray(stuck.tags) ? stuck.tags.filter((x) => STUCK_REASONS.includes(x)) : [], text: String(stuck.text || ''), updatedAt: stuck.updatedAt || '' },
      createdAt: i.createdAt || t,
      updatedAt: i.updatedAt || t,
      lastProgressAt: i.lastProgressAt || '',
      completedAt: i.completedAt || '',
      source: i.source || '',
      sourceKey: i.sourceKey || '',
      reminderList: i.reminderList || '',
      sample: i.sample || '',
    };
  }
  function normLesson(l) {
    const t = nowIso();
    return {
      id: l.id || uid(), name: String(l.name || '').trim() || '（無題）', status: LESSON_STATUS[l.status] ? l.status : 'considering',
      frequency: String(l.frequency || ''), monthlyCost: Math.max(0, Number(l.monthlyCost) || 0), startDate: isDateStr(l.startDate) ? l.startDate : '',
      notes: String(l.notes || ''), logs: (Array.isArray(l.logs) ? l.logs : []).filter((g) => isDateStr(g.date)).map((g) => ({ id: g.id || uid(), date: g.date, memo: String(g.memo || '') })),
      createdAt: l.createdAt || t, updatedAt: l.updatedAt || t, sample: l.sample || '',
    };
  }
  function normJournal(j) {
    const t = nowIso();
    return { id: j.id || uid(), date: isDateStr(j.date) ? j.date : todayStr(), text: String(j.text || ''), mood: [1, 2, 3, 4, 5].includes(Number(j.mood)) ? Number(j.mood) : 0, linked: Array.isArray(j.linked) ? j.linked.map(String) : [], photos: normPhotoIds(j.photos), source: ['photo', 'obsidian', 'ai'].includes(j.source) ? j.source : '', createdAt: j.createdAt || t, updatedAt: j.updatedAt || t };
  }
  // ジャーナルの写真は id だけを持つ（画像本体は IndexedDB と非公開データリポジトリの data/photos/<id>.jpg）
  const PHOTO_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
  function normPhotoIds(a) { return Array.isArray(a) ? [...new Set(a.map(String).filter((x) => PHOTO_ID_RE.test(x)))].slice(0, 30) : []; }
  function normCoach(c) {
    const t = nowIso();
    return { id: c.id || uid(), date: isDateStr(c.date) ? c.date : todayStr(), title: String(c.title || ''), text: String(c.text || ''), read: c.read !== false, source: c.source || '', stepsResult: Array.isArray(c.stepsResult) ? c.stepsResult.map(String) : [], suggestIds: Array.isArray(c.suggestIds) ? c.suggestIds.map(String) : [], createdAt: c.createdAt || t, updatedAt: c.updatedAt || t };
  }
  // 習慣スタンプ（毎日の目標）。done は押した日の 'YYYY-MM-DD' の配列（昇順・重複なし）
  function isRealDay(s) {
    if (!isDateStr(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }
  function normHabit(h) {
    const t = nowIso();
    const done = [...new Set((Array.isArray(h.done) ? h.done : []).filter(isRealDay))].sort();
    const start = isRealDay(h.startDate) ? h.startDate : (done[0] || todayStr());
    // missed は「できなかった（×）」を明示した日。同じ日に〇があれば〇を優先（排他的）
    const doneSet = new Set(done);
    const missed = [...new Set((Array.isArray(h.missed) ? h.missed : []).filter((d) => isRealDay(d) && !doneSet.has(d)))].sort();
    return {
      id: h.id || uid(), emoji: Array.from(String(h.emoji || '').trim()).slice(0, 4).join('') || '🌱', name: String(h.name || '').trim() || '（無題）',
      startDate: start, done, missed, seen: String(h.seen || ''), unlocked: Array.isArray(h.unlocked) ? [...new Set(h.unlocked.map(String))] : [],
      createdAt: h.createdAt || t, updatedAt: h.updatedAt || t,
    };
  }
  // v1.4.0：毎日の AI 分析と AI提案（自分のタスクとは別のリスト）
  const SUG_STATUS = ['open', 'moved', 'dismissed'];
  function normAiSuggestion(s) {
    const t = nowIso(); const q = String(s.quadrant || '');
    return {
      id: String(s.id || uid()), title: String(s.title || '').trim() || '（無題）', quadrant: QUADRANTS[q] ? q : 'q2', why: String(s.why || ''),
      steps: (Array.isArray(s.steps) ? s.steps : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 10),
      source: s.source === 'coach' ? 'coach' : 'gemini', ref: String(s.ref || ''), date: isDateStr(s.date) ? s.date : todayStr(),
      status: SUG_STATUS.includes(s.status) ? s.status : 'open', itemId: String(s.itemId || ''), auto: !!s.auto, createdAt: s.createdAt || t, updatedAt: s.updatedAt || t,
    };
  }
  function normAnalysis(a) {
    const t = nowIso(); const date = isDateStr(a.date) ? a.date : todayStr();
    return {
      id: 'ana:' + date, date, summary: String(a.summary || ''), insights: (Array.isArray(a.insights) ? a.insights : []).map(String).slice(0, 3),
      suggestionIds: (Array.isArray(a.suggestionIds) ? a.suggestionIds : []).map(String), parsed: a.parsed !== false, model: String(a.model || ''), runs: Math.max(1, Number(a.runs) || 1),
      createdAt: a.createdAt || t, updatedAt: a.updatedAt || t,
    };
  }
  // v1.5.0：⏳ カウントダウン。source は将来のカレンダー連携用（'' | 'google' | 'apple'）
  function normCountdown(c) {
    const t = nowIso();
    const o = { id: String(c.id || uid()), title: String(c.title || '').trim() || '（無題）', emoji: String(c.emoji || '⏳'), date: isDateStr(c.date) ? c.date : todayStr(),
      memo: String(c.memo || ''), taskId: String(c.taskId || ''), gcal: !!c.gcal, gcalId: String(c.gcalId || ''), source: ['google', 'apple'].includes(c.source) ? c.source : '',
      createdAt: c.createdAt || t, updatedAt: c.updatedAt || t };
    return o;
  }
  // Googleカレンダーから消してほしい予定（コーチが処理して calendar-links.json の deleted に書く）
  function normGcalDelete(g) {
    const t = nowIso();
    return { id: 'gdel:' + String(g.gcalId || ''), gcalId: String(g.gcalId || ''), countdownId: String(g.countdownId || ''), title: String(g.title || ''), date: isDateStr(g.date) ? g.date : '', reason: g.reason === 'off' ? 'off' : 'deleted', createdAt: g.createdAt || t, updatedAt: g.updatedAt || t };
  }
  function normalizeState(raw) {
    const s = defaultState();
    if (!raw || typeof raw !== 'object') return s;
    if (Array.isArray(raw.categories) && raw.categories.length) s.categories = [...new Set(raw.categories.map(String).filter(Boolean))];
    s.items = (raw.items || []).map(normItem);
    s.lessons = (raw.lessons || []).map(normLesson);
    s.journal = (raw.journal || []).map(normJournal);
    s.coachNotes = (raw.coachNotes || []).map(normCoach);
    s.habits = (Array.isArray(raw.habits) ? raw.habits : []).filter((h) => h && typeof h === 'object').map(normHabit); // v1.3.0〜（古いデータには無い）
    s.aiAnalyses = (Array.isArray(raw.aiAnalyses) ? raw.aiAnalyses : []).filter((a) => a && typeof a === 'object').map(normAnalysis); // v1.4.0〜
    s.aiSuggestions = (Array.isArray(raw.aiSuggestions) ? raw.aiSuggestions : []).filter((a) => a && typeof a === 'object' && a.title).map(normAiSuggestion);
    s.countdowns = (Array.isArray(raw.countdowns) ? raw.countdowns : []).filter((c) => c && typeof c === 'object' && c.title).map(normCountdown); // v1.5.0〜
    s.gcalDeletes = (Array.isArray(raw.gcalDeletes) ? raw.gcalDeletes : []).filter((g) => g && g.gcalId).map(normGcalDelete);
    s.focus = raw.focus && typeof raw.focus === 'object' ? { ...raw.focus } : {};
    s.focusAt = raw.focusAt && typeof raw.focusAt === 'object' ? { ...raw.focusAt } : {};
    s.deleted = raw.deleted && typeof raw.deleted === 'object' ? { ...raw.deleted } : {};
    s.categoriesAt = String(raw.categoriesAt || '');
    s.settings = { theme: ['auto', 'light', 'dark'].includes(raw.settings && raw.settings.theme) ? raw.settings.theme : 'auto', bg: BACKGROUNDS[raw.settings && raw.settings.bg] ? raw.settings.bg : 'mist' };
    return s;
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : defaultState();
    } catch (e) {
      console.error(e);
      return defaultState();
    }
  }
  let state = load();
  function saveLocal() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('保存できませんでした（容量不足の可能性）。バックアップを取ってください。');
    }
  }
  let changeGen = 0;
  // ユーザーの変更を保存（GitHub 接続時は数秒後に自動で同期）
  function save() {
    saveLocal();
    changeGen++;
    if (sync.connected && sync.token) { sync.dirty = true; saveSync(); scheduleSync(3000); }
  }
  const snapshot = () => JSON.stringify(state);
  // 「元に戻す」：戻した項目は更新日時を今にして、同期でも確実に反映されるようにする
  function restore(snap) {
    const prev = state;
    const next = normalizeState(JSON.parse(snap));
    const now = nowIso();
    next.deleted = { ...next.deleted, ...prev.deleted };
    ['items', 'lessons', 'journal', 'coachNotes', 'habits', 'aiAnalyses', 'aiSuggestions', 'countdowns', 'gcalDeletes'].forEach((k) => {
      const prevMap = new Map(prev[k].map((x) => [x.id, JSON.stringify(x)]));
      const nextIds = new Set(next[k].map((x) => x.id));
      next[k].forEach((x) => { if (prevMap.get(x.id) !== JSON.stringify(x)) { x.updatedAt = now; delete next.deleted[x.id]; } });
      prev[k].forEach((x) => { if (!nextIds.has(x.id)) next.deleted[x.id] = now; });
    });
    // 元に戻したジャーナルの写真は削除扱いを取り消す
    next.journal.forEach((e) => e.photos.forEach((p) => { delete next.deleted['photo:' + p]; }));
    if (JSON.stringify(next.categories) !== JSON.stringify(prev.categories)) next.categoriesAt = now;
    Object.keys(next.focus).forEach((y) => { if (next.focus[y] !== prev.focus[y]) next.focusAt[y] = now; });
    next.settings = prev.settings;
    state = next; save(); rerender();
  }

  // ───────────────────────── 状態の便利関数 ─────────────────────────
  const getItem = (id) => state.items.find((i) => i.id === id);
  const getLesson = (id) => state.lessons.find((l) => l.id === id);
  const activeItems = () => state.items.filter((i) => i.status !== 'done');
  const lastProgress = (i) => i.lastProgressAt || i.createdAt;
  const idleDays = (i) => daysSince(lastProgress(i));
  const isStuck = (i) => i.status !== 'done' && i.list !== 'later' && idleDays(i) >= STUCK_DAYS;
  const stepsDone = (i) => i.steps.filter((s) => s.done).length;
  function touch(i, progress) {
    i.updatedAt = nowIso();
    if (progress) i.lastProgressAt = i.updatedAt;
  }
  function addItem(data) {
    const it = normItem({ ...data, id: uid(), createdAt: nowIso(), updatedAt: nowIso() });
    state.items.unshift(it);
    save();
    return it;
  }
  function setStatus(it, status) {
    it.status = status;
    it.completedAt = status === 'done' ? nowIso() : '';
    touch(it, true);
  }
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const sessionsThisMonth = (l) => l.logs.filter((g) => g.date.startsWith(monthKey())).length;
  const activeLessonCost = () => state.lessons.filter((l) => l.status === 'active').reduce((a, l) => a + l.monthlyCost, 0);
  const thisYear = () => String(new Date().getFullYear());

  // ───────────────────────── UI の一時状態 ─────────────────────────
  const ui = {
    wish: { cat: '', imp: '', tf: '', status: 'open', sort: 'updated' },
    laterSort: 'updated',
    matrixFilter: 'all',
    journalQuery: '',
    journalOpen: new Set(), // 開いている日付（ジャーナル一覧）
    searchQuery: '',
    randomId: null,
    coachDays: 14,
    coachText: '',
    habitMonth: {},
    lastRoute: '',
  };

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
    if (arg === 'sync' || arg === 'ai') setTimeout(() => { const c = $(arg === 'ai' ? '#aiCard' : '#syncCard'); if (c) c.scrollIntoView({ block: 'start' }); }, 0);
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
  const VIEWS = { home: viewHome, matrix: viewMatrix, wish: viewWish, later: viewLater, lessons: viewLessons, inbox: viewInbox, journal: viewJournal, done: viewDone, search: viewSearch, settings: viewSettings, coach: viewCoach, item: viewItem, ai: viewAI, habits: viewHabits, aisuggest: viewAiSuggest, countdown: viewCountdown };
  const TITLES = { home: 'ホーム', matrix: 'マトリックス', wish: 'やりたい事', later: '後回しでいい事', lessons: '習い事', inbox: '未整理', journal: 'ジャーナル', done: '完了履歴', search: '検索', settings: '設定', coach: 'コーチに相談', item: '詳細', ai: 'AIに相談', habits: '習慣スタンプ', aisuggest: 'AI提案', countdown: 'カウントダウン' };
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
    updateTopPomu();
    hydratePhotos(main);
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.name));
    const n = state.items.filter((i) => i.list === 'inbox' && i.status !== 'done').length;
    const badge = $('#inboxBadge'); badge.hidden = !n; badge.textContent = n > 99 ? '99+' : n;
    const unread = state.coachNotes.filter((c) => !c.read).length;
    const cb = $('#coachBadge'); if (cb) { cb.hidden = !unread; cb.textContent = unread; }
    const ns = state.aiSuggestions.filter((s) => s.status === 'open').length;
    $$('.sug-badge').forEach((b) => { b.hidden = !ns; b.textContent = ns > 99 ? '99+' : ns; });
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
  // トップバーの中央：いちばん育っている ぽむ（同じレベルなら最近スタンプした目標）
  function topPomu() {
    let best = null;
    state.habits.forEach((h) => {
      const i = pomuInfo(h);
      const last = h.done.length ? h.done[h.done.length - 1] : '';
      if (!best || i.lv > best.lv || (i.lv === best.lv && last > best.last)) best = { h, lv: i.lv, last, key: i.key, name: i.name };
    });
    return best || { h: null, lv: 1, last: '', key: 'stage-1', name: POMU['stage-1'].name };
  }
  function updateTopPomu() {
    const img = $('#topPomu'); if (!img) return;
    const p = topPomu();
    const src = pomuImg(p.key, true);
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    img.dataset.key = p.key;
    const a = img.closest('a');
    if (a) { a.setAttribute('aria-label', p.h ? `${p.name}（Lv.${p.lv}・${p.h.name}）：習慣スタンプへ` : 'ぽむたま：習慣スタンプへ'); a.title = p.h ? `${p.name} Lv.${p.lv}` : 'ぽむたま'; }
    img.alt = p.name;
  }
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
  // スワイプ：右から左へなぞるとメニューが出る／左から右へで閉じる（指に合わせて動く）
  const isDrawerOpen = () => document.body.classList.contains('drawer-open');
  function swipeBlocked(t) {
    if (!t || !t.closest) return true;
    if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .modal-backdrop:not([hidden]), .photo-viewer, .pomu-celebrate')) return true;
    if (!backdrop.hidden) return true;
    for (let el = t; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 2) { const ox = getComputedStyle(el).overflowX; if (ox === 'auto' || ox === 'scroll') return true; }
    }
    return false;
  }
  const sw = { on: false, x: 0, y: 0, t: 0, lock: '', open: false, w: 0 };
  function swipeReset() { drawer.style.transform = ''; drawer.style.transition = ''; drawerBd.style.opacity = ''; drawerBd.style.transition = ''; document.body.classList.remove('drawer-dragging'); }
  document.addEventListener('touchstart', (e) => {
    sw.on = false;
    if (e.touches.length !== 1 || window.matchMedia('(min-width: 960px)').matches) return;
    const open = isDrawerOpen();
    if (!open && swipeBlocked(e.target)) return;
    const p = e.touches[0];
    Object.assign(sw, { on: true, x: p.clientX, y: p.clientY, t: Date.now(), lock: '', open, w: drawer.offsetWidth || 300 });
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!sw.on) return;
    const p = e.touches[0]; const dx = p.clientX - sw.x; const dy = p.clientY - sw.y;
    if (!sw.lock) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      sw.lock = Math.abs(dx) > Math.abs(dy) * 1.5 && (sw.open ? dx > 0 : dx < 0) ? 'h' : 'v';
      if (sw.lock === 'h') {
        if (!sw.open) { drawerBd.hidden = false; drawer.removeAttribute('inert'); }
        drawer.style.transition = 'none'; drawerBd.style.transition = 'none'; document.body.classList.add('drawer-dragging');
      }
    }
    if (sw.lock !== 'h') return;
    const off = sw.open ? Math.max(0, Math.min(sw.w, dx)) : Math.max(0, Math.min(sw.w, sw.w + dx)); // 0 = 全開
    drawer.style.transform = `translateX(${off}px)`;
    drawerBd.style.opacity = String(1 - off / sw.w);
  }, { passive: true });
  function swipeEnd(e) {
    if (!sw.on) return;
    sw.on = false;
    const p = (e.changedTouches && e.changedTouches[0]) || { clientX: sw.x, clientY: sw.y };
    const dx = p.clientX - sw.x; const dy = p.clientY - sw.y;
    const horiz = Math.abs(dx) > Math.abs(dy) * 1.5;
    const fast = Date.now() - sw.t < 300 && Math.abs(dx) > 30;
    const dragged = sw.lock === 'h';
    let act = '';
    if (e.type !== 'touchcancel') {
      if (!sw.open && horiz && (dx < -60 || (fast && dx < 0) || (dragged && dx < -sw.w / 3))) act = 'open';
      else if (sw.open && horiz && (dx > 60 || (fast && dx > 0) || (dragged && dx > sw.w / 3))) act = 'close';
    }
    if (act === 'open') { document.body.classList.add('drawer-open'); openDrawer(); }
    if (act === 'close') closeDrawer();
    if (dragged) swipeReset(); // 指を離した位置から、続きをアニメーション
    if (dragged && !sw.open && act !== 'open') { drawer.setAttribute('inert', ''); setTimeout(() => { if (!isDrawerOpen()) drawerBd.hidden = true; }, 320); }
  }
  document.addEventListener('touchend', swipeEnd, { passive: true });
  document.addEventListener('touchcancel', swipeEnd, { passive: true });
  // 「アップデート」：最新版を取りに行き、キャッシュを消して読み込み直す（データは localStorage にあるので消えない）
  let updating = false;
  async function forceUpdate() {
    if (updating) return;
    updating = true;
    toast('最新版を確認しています…');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      if (sync.connected && sync.dirty && navigator.onLine) await Promise.race([syncNow(), wait(4000)]); // 未送信の変更を先に保存
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(async (reg) => {
          try { await reg.update(); } catch (e) { /* オフラインなど */ }
          const w = reg.waiting || reg.installing;
          if (w) w.postMessage('skipWaiting');
        }));
      }
      if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
    } catch (e) { /* 失敗しても読み込み直す */ }
    try { sessionStorage.setItem('lifeplan.updated', APP_VERSION); } catch (e) { /* noop */ }
    await wait(500);
    const u = new URL(location.href);
    u.searchParams.set('v', String(Date.now()));
    location.replace(u.toString());
  }
  // アップデート後：URL の ?v= を消して、バージョンを知らせる
  function afterUpdate() {
    let prev = null; try { prev = sessionStorage.getItem('lifeplan.updated'); sessionStorage.removeItem('lifeplan.updated'); } catch (e) { /* noop */ }
    if (/[?&]v=/.test(location.search)) {
      const u = new URL(location.href); u.searchParams.delete('v');
      try { history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* noop */ }
    }
    if (prev) setTimeout(() => toast(prev === APP_VERSION ? `最新版です（バージョン ${APP_VERSION}）` : `バージョン ${APP_VERSION} に更新しました ✓`), 300);
  }
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
    startJournalEdit(e);
    const candidates = state.items.filter((i) => i.status !== 'done' || v.linked.includes(i.id)).sort((a, b) => (v.linked.includes(b.id) - v.linked.includes(a.id)) || b.updatedAt.localeCompare(a.updatedAt));
    openModal(`${modalHead(e ? 'ジャーナルを編集' : 'ジャーナルを書く')}
      <form data-form="journal" data-id="${e ? e.id : ''}">
        <label class="field"><span class="field-label">日付</span><input type="date" name="date" value="${esc(v.date)}" required></label>
        <div class="field"><span class="field-label">気分</span><div class="mood-pick">${[1, 2, 3, 4, 5].map((n) => `<label title="${MOOD_LABEL[n]}"><input type="radio" name="mood" value="${n}" ${Number(v.mood) === n ? 'checked' : ''}><span>${MOODS[n]}<small>${n}</small></span></label>`).join('')}</div></div>
        <label class="field"><span class="field-label">内容</span><textarea name="text" rows="6" placeholder="今日あったこと、考えたこと、気づいたこと…" ${e ? '' : 'autofocus'}>${esc(v.text)}</textarea></label>
        <div class="field j-photo-field"><span class="field-label">写真（任意）<small class="muted" id="jPhotoCount">${jEdit.photos.length ? jEdit.photos.length + '枚' : ''}</small></span>
          <div id="jPhotoBox">${photoThumbs(jEdit.photos, '', true)}</div>
          <label class="btn soft small photo-add">📷 写真を追加<input type="file" id="jPhotoInput" accept="image/*" multiple hidden data-change="journalEntryPhoto"></label>
          <p class="muted small">長い辺1280pxに縮小してこの端末に保存します。GitHub 同期中は非公開のデータリポジトリにも保存し、他の端末でも見られます。</p></div>
        ${candidates.length ? `<div class="field"><span class="field-label">関連するタスク（任意）</span>
          <input class="link-filter" placeholder="絞り込み" data-input="linkFilter" aria-label="タスクを絞り込み">
          <div class="link-list">${candidates.map((i) => `<label class="link-opt" data-title="${esc(i.title.toLowerCase())}"><input type="checkbox" name="linked" value="${i.id}" ${v.linked.includes(i.id) ? 'checked' : ''}><span>${esc(i.title)}</span><small>${LISTS[i.list]}</small></label>`).join('')}</div></div>` : ''}
        <div class="btn-row between">${e ? `<button type="button" class="btn ghost danger" data-action="deleteJournal" data-id="${e.id}">削除</button>` : '<span></span>'}
          <span class="btn-row"><button type="button" class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" type="submit">保存</button></span></div>
      </form>`, { onOpen: (box) => hydratePhotos(box), onClose: () => endJournalEdit() });
  }
  function submitJournal(form) {
    const fd = new FormData(form);
    const text = String(fd.get('text') || '').trim();
    if (jEdit.busy) { toast('写真を処理しています。少し待ってから保存してください'); return; }
    if (!text && !jEdit.photos.length) { toast('内容を入力してください'); return; }
    const e = state.journal.find((x) => x.id === form.dataset.id);
    const data = { date: isDateStr(String(fd.get('date'))) ? String(fd.get('date')) : todayStr(), text, mood: Number(fd.get('mood')) || 0, linked: fd.getAll('linked').map(String) };
    data.photos = commitEditorPhotos(e ? e.photos : []);
    if (e) Object.assign(e, data, { updatedAt: nowIso() });
    else state.journal.push(normJournal(data));
    ui.journalOpen.add(data.date);
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
  function homeAnalysisCard() {
    if (!ai.key && !state.aiAnalyses.length && !openSuggestions().length) return '';
    const a = latestAnalysis(); const open = openSuggestions(); const t = todayStr();
    const left = manualLeft();
    const head = `<div class="card-head"><h2>✨ 今日の分析${a && a.date !== t ? `<span class="muted small"> ${fmtShort(a.date)}</span>` : ''}</h2>
      <button class="icon-btn small" data-action="anaCollapse" aria-expanded="${!aiDaily.collapsed}" aria-label="${aiDaily.collapsed ? '開く' : 'たたむ'}">${aiDaily.collapsed ? '▾' : '▴'}</button></div>`;
    const link = `<a class="btn soft small ana-link" href="#aisuggest">🤖 AI提案を見る（${open.length}件）</a>`;
    if (aiDaily.collapsed) return `<section class="card ana-card collapsed" id="anaCard">${head}<div class="btn-row">${link}</div></section>`;
    let body = '';
    if (anaUi.busy) body = '<p class="ana-busy"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> Gemini が分析しています…</p>';
    else if (a) body = analysisBody(a) + (open.length ? `<ul class="ana-preview">${open.slice(0, 2).map((s) => `<li><span class="qdot ${s.quadrant}" aria-hidden="true"></span>${esc(s.title)}</li>`).join('')}${open.length > 2 ? `<li class="muted small">ほか ${open.length - 2}件</li>` : ''}</ul>` : '');
    else body = `<p class="muted small">${ai.key ? (aiDailyOn() ? '今日の分析はまだです。' : '毎日の自動分析はオフです。') : 'Gemini の APIキーを設定すると、毎日の分析が届きます。'}</p>`;
    if (anaUi.error) body += `<p class="error-text small">⚠️ ${esc(anaUi.error)}</p>`;
    return `<section class="card ana-card" id="anaCard">${head}${body}
      <div class="btn-row">${link}${ai.key ? `<button class="btn ghost small" data-action="anaRerun" ${anaUi.busy || left <= 0 ? 'disabled' : ''}>🔁 もう一度分析<span class="muted small">（あと${Math.max(0, left)}回）</span></button>` : ''}</div>
    </section>`;
  }
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

  // ── Googleカレンダー（読むだけ）：data/calendar.json と data/calendar-links.json は毎朝コーチが書く ──
  const CAL_KEY = 'lifeplan.calendar';
  const calUi = { error: '', open: false };
  let cal = (() => { try { const o = JSON.parse(localStorage.getItem(CAL_KEY) || '{}'); return { calendar: o.calendar || null, links: o.links || null, fetchedAt: o.fetchedAt || '' }; } catch (e) { return { calendar: null, links: null, fetchedAt: '' }; } })();
  const saveCal = () => { try { localStorage.setItem(CAL_KEY, JSON.stringify(cal)); } catch (e) { /* noop */ } };
  const dataDir = () => (sync.path || 'data/life-plan.json').replace(/[^/]*$/, '');
  const calPath = () => dataDir() + 'calendar.json';
  const calLinksPath = () => dataDir() + 'calendar-links.json';
  const evDate = (v) => { const t = String(v || ''); if (isDateStr(t)) return t; if (isDateStr(t.slice(0, 10)) && !/[T ]\d/.test(t)) return t.slice(0, 10); const d = new Date(t); return isNaN(d) ? '' : todayStr(d); };
  const evTime = (ev) => { if (ev.allDay || isDateStr(String(ev.start || ''))) return ''; const d = new Date(ev.start); return isNaN(d) ? '' : `${d.getHours()}:${pad(d.getMinutes())}`; };
  function normEvent(e) {
    if (!e || typeof e !== 'object' || !e.id) return null;
    const date = evDate(e.start); if (!date) return null;
    return { id: String(e.id), title: String(e.title || e.summary || '（無題の予定）'), start: String(e.start), end: String(e.end || ''), date, allDay: e.allDay === true || isDateStr(String(e.start)), location: String(e.location || '') };
  }
  const calEvents = () => ((cal.calendar && Array.isArray(cal.calendar.events)) ? cal.calendar.events : []).map(normEvent).filter(Boolean).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const calLinks = () => (cal.links && cal.links.links && typeof cal.links.links === 'object' ? cal.links.links : {});
  const calLinkDeleted = () => (cal.links && cal.links.deleted && typeof cal.links.deleted === 'object' ? cal.links.deleted : {});
  const HOURGLASS = /⏳/;
  const stripHourglass = (t) => t.replace(/⏳\uFE0F?/g, '').trim() || t;
  // このカウントダウンにつながっている Google の予定 id（Google から作った → gcalId、アプリから送った → calendar-links.json）
  const cdGcalId = (c) => c.gcalId || (calLinks()[c.id] && calLinks()[c.id].gcalId) || '';
  function cdGcalStatus(c) {
    if (c.source === 'google' && c.gcalId) return { cls: 'g-linked', text: 'Googleカレンダーの予定から' };
    if (!c.gcal) return null;
    const l = calLinks()[c.id];
    if (!l || !l.gcalId) return { cls: 'g-pending', text: '📅 明日の朝に同期されます' };
    if (l.syncedAt && c.updatedAt > l.syncedAt) return { cls: 'g-pending', text: '📅 同期済み・変更は明日の朝に反映されます' };
    return { cls: 'g-ok', text: '📅 同期済み' };
  }
  async function pullCalendar() {
    const [f1, f2] = await Promise.all([ghGetFile(calPath()), ghGetFile(calLinksPath())]);
    const parse = (f) => { if (!f.exists || !f.text.trim()) return null; try { return JSON.parse(f.text); } catch (e) { return extractJson(f.text); } };
    const c1 = parse(f1); const c2 = parse(f2);
    const before = JSON.stringify([cal.calendar, cal.links]);
    cal = { calendar: c1 && typeof c1 === 'object' ? c1 : null, links: c2 && typeof c2 === 'object' ? c2 : null, fetchedAt: nowIso() };
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
  function cdProgress(c) {
    const start = isoToDate(c.createdAt) || todayStr();
    const total = -daysUntil(start) + cdDays(c); // 作成日 → 目標日
    const done = -daysUntil(start);
    const pct = total <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((done / total) * 100)));
    return { pct, start };
  }
  function countdownCard(c) {
    const n = cdDays(c); const pr = cdProgress(c); const t = c.taskId ? getItem(c.taskId) : null; const gs = c.readOnly ? null : cdGcalStatus(c);
    return `<article class="card cd-card ${n === 0 ? 'is-today' : n < 0 ? 'is-past' : ''} ${c.readOnly ? 'is-google' : ''}" data-cd="${c.id}">
      <div class="cd-top"><span class="cd-emoji" aria-hidden="true">${esc(c.emoji || '⏳')}</span>
        <div class="cd-main"><h3 class="cd-title">${esc(c.title)}${c.readOnly ? ' <span class="chip g-badge">Google</span>' : ''}</h3><p class="cd-date">${fmtDate(c.date)}</p></div>
        <div class="cd-count" aria-label="${cdText(n)}">${cdLabel(n)}</div></div>
      ${n >= 0 && !c.readOnly ? `<div class="cd-bar" role="progressbar" aria-valuenow="${pr.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="作成日からの進み具合"><span style="width:${pr.pct}%"></span></div>
      <div class="cd-bar-meta muted small"><span>${fmtShort(pr.start)} から</span><span>${pr.pct}%</span></div>` : ''}
      ${c.memo ? `<p class="cd-memo">${esc(c.memo)}</p>` : ''}
      ${t ? `<a class="cd-link small" href="#item/${t.id}">🔗 ${esc(trunc(t.title, 30))}</a>` : ''}
      ${gs ? `<p class="cd-gcal ${gs.cls} small">${gs.text}</p>` : ''}
      ${c.readOnly ? '<p class="muted small cd-ro">Googleカレンダーの「⏳」つきの予定（変更は Google カレンダーで）</p>' : `<div class="btn-row end cd-actions"><button class="btn ghost small" data-action="cdEdit" data-id="${c.id}">編集</button><button class="btn ghost small danger" data-action="cdDelete" data-id="${c.id}">削除</button></div>`}
    </article>`;
  }
  const fmtStamp = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`; };
  function calSyncLine() {
    if (cal.calendar && cal.calendar.updatedAt) return `<p class="cal-sync muted small">📅 Googleカレンダー最終同期: ${esc(fmtStamp(cal.calendar.updatedAt))}${calUi.error ? `<span class="error-text">（読み込みエラー：${esc(calUi.error)}）</span>` : ''}</p>`;
    return `<p class="cal-sync muted small">📅 Googleカレンダーはまだ届いていません${sync.connected ? '（毎朝7時ごろコーチが更新します）' : '（GitHub 同期をつなぐと届きます）'}</p>`;
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
  function homeCountdownCard() {
    const { up } = sortedCountdowns();
    if (!up.length) return '';
    return `<section class="card cd-home"><div class="card-head"><h2>⏳ カウントダウン</h2><a class="link small" href="#countdown">すべて見る</a></div>
      <ul class="cd-mini">${up.slice(0, 3).map((c) => { const n = cdDays(c); return `<li><a href="#countdown" class="cd-mini-row"><span class="cd-emoji sm" aria-hidden="true">${esc(c.emoji || '⏳')}</span><span class="grow"><b>${esc(trunc(c.title, 22))}</b><span class="muted small"> ${fmtShort(c.date)}</span></span><span class="cd-mini-n ${n === 0 ? 'today' : ''}">${n === 0 ? '今日！' : `あと<b>${n}</b>日`}</span></a></li>`; }).join('')}</ul></section>`;
  }
  // ホーム：これからの予定（7日間・Googleカレンダー）
  function homeScheduleCard() {
    const t = todayStr(); const end = addDays(t, 7);
    const evs = calEvents().filter((e) => e.date >= t && e.date <= end);
    if (!cal.calendar) return '';
    const rows = evs.slice(0, 6).map((e) => { const n = daysUntil(e.date); return `<li class="sched-row"><span class="sched-d ${n === 0 ? 'today' : ''}">${n === 0 ? '今日' : n === 1 ? '明日' : fmtShort(e.date)}<small>${'日月火水木金土'[new Date(e.date + 'T00:00').getDay()]}</small></span><span class="grow"><b>${esc(trunc(stripHourglass(e.title), 26))}</b><span class="muted small">${evTime(e) ? ' ' + evTime(e) : ' 終日'}${e.location ? '・' + esc(trunc(e.location, 14)) : ''}</span></span></li>`; }).join('');
    return `<section class="card sched-home"><div class="card-head"><h2>📅 これからの予定</h2><a class="link small" href="#countdown">カウントダウン</a></div>
      ${rows ? `<ul class="sched-list">${rows}</ul>${evs.length > 6 ? `<p class="muted small">ほか ${evs.length - 6}件</p>` : ''}` : '<p class="muted small">この7日間の予定はありません</p>'}
      <p class="muted small cal-sync">Googleカレンダー最終同期: ${esc(fmtStamp(cal.calendar.updatedAt || cal.fetchedAt))}</p></section>`;
  }
  function addMonthsStr(base, m) { const [y, mo, d] = base.split('-').map(Number); const dt = new Date(y, mo - 1 + m, 1); const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate(); dt.setDate(Math.min(d, last)); return todayStr(dt); }
  function cdPreviewText(v) { return isDateStr(v) ? `${fmtDate(v)} ・ ${cdText(daysUntil(v))}` : '日付を選んでください'; }
  function openCountdownEditor(id) {
    const c = id ? getCountdown(id) : null;
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
        ${fromGoogle ? '<p class="muted small">📅 Googleカレンダーの予定から作ったカウントダウンです（ここで変えても Google の予定は変わりません）</p>' : `<label class="check-line cd-gcal-toggle"><input type="checkbox" name="gcal" ${v.gcal ? 'checked' : ''}> 📅 Googleカレンダーにも入れる<span class="muted small">（毎朝7時ごろコーチが「⏳ 予定名」の終日予定を作ります）</span></label>`}
        <div class="btn-row between">${c ? `<button type="button" class="btn ghost danger" data-action="cdDelete" data-id="${c.id}">削除</button>` : '<span></span>'}
          <span class="btn-row"><button type="button" class="btn ghost" data-action="closeModal">キャンセル</button><button class="btn primary" type="submit">${c ? '保存' : 'つくる'}</button></span></div>
      </form>`);
  }
  function submitCountdown(form) {
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim(); const date = String(fd.get('date') || '');
    if (!title) return;
    if (!isDateStr(date)) { toast('日付を選んでください'); return; }
    const c = getCountdown(form.dataset.id);
    const data = { title, date, emoji: String(fd.get('emoji') || '').trim() || '⏳', memo: String(fd.get('memo') || '').trim(), taskId: String(fd.get('taskId') || '') };
    if (!(c && c.source === 'google' && c.gcalId)) data.gcal = fd.get('gcal') === 'on';
    if (!c && date < todayStr()) { toast('今日以降の日付を選んでください'); return; }
    const snap = snapshot();
    if (c) {
      if (c.gcal && data.gcal === false) queueGcalDelete(c, 'off'); // オフにした → Google の予定を消してもらう
      if (data.gcal) { const gid = cdGcalId(c); if (gid) { state.gcalDeletes = state.gcalDeletes.filter((g) => { if (g.gcalId !== gid) return true; markDeleted(g.id); return false; }); } }
      Object.assign(c, normCountdown({ ...c, ...data }), { updatedAt: nowIso() }); save(); closeModal(); rerender(); undoable('保存しました', snap);
    } else { const nc = normCountdown(data); state.countdowns.push(nc); save(); closeModal(); if (route().name !== 'countdown') go('#countdown'); else rerender(); toast(`${nc.emoji} 「${nc.title}」まで ${cdText(cdDays(nc))}${nc.gcal ? '（Googleカレンダーへは明日の朝）' : ''}`); }
  }
  function deleteCountdown(id) {
    const c = getCountdown(id); if (!c) return;
    const snap = snapshot();
    if (c.gcal) queueGcalDelete(c, 'deleted');
    state.countdowns = state.countdowns.filter((x) => x.id !== id);
    markDeleted(id); save(); if (!backdrop.hidden) closeModal(); rerender(); undoable(`「${trunc(c.title, 16)}」を削除しました`, snap);
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
  document.addEventListener('input', (e) => {
    if (e.target.matches && e.target.matches('form[data-form=countdown] input[name=date]')) { const p = $('#cdPreview'); if (p) p.textContent = cdPreviewText(e.target.value); }
  });

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
    cdNew: () => openCountdownEditor(),
    cdEdit: (d) => openCountdownEditor(d.id),
    cdDelete: (d) => deleteCountdown(d.id),
    cdFromEvent: (d) => countdownFromEvent(d.id),
    cdEmoji: (d) => { const inp = $('form[data-form=countdown] input[name=emoji]', modalBox); if (inp) inp.value = d.v; },
    cdQuick: (d) => { const inp = $('form[data-form=countdown] input[name=date]', modalBox); if (!inp) return; inp.value = addMonthsStr(todayStr(), Number(d.m) || 1); const p = $('#cdPreview'); if (p) p.textContent = cdPreviewText(inp.value); },
    aiSugMove: (d) => moveSuggestion(d.id),
    aiSugDismiss: (d) => dismissSuggestion(d.id),
    aiSugReopen: (d) => reopenSuggestion(d.id),
    aiSugMoveAll: () => moveAllSuggestions(),
    anaRerun: () => runAnalysis(true),
    anaCollapse: () => { aiDaily.collapsed = !aiDaily.collapsed; saveAiDaily(); rerender(); },
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
      case 'aiSugQuadrant': setSuggestionQuadrant(d.id, el.value); break;
      case 'aiDaily': ai.daily = el.checked; saveAi(); toast(el.checked ? '毎日の自動分析をオンにしました' : '毎日の自動分析をオフにしました'); if (el.checked) maybeDailyAnalysis(); break;
      case 'aiAutoMove': ai.autoMove = el.checked; saveAi(); toast(el.checked ? 'AI提案を自動で自分のリストに移します' : 'AI提案は「🤖 AI提案」に並べるだけにします'); break;
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
      case 'countdown': submitCountdown(f); break;
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
  setTimeout(() => maybeDailyAnalysis(), 1200);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => maybeDailyAnalysis(), 800); });

  // テスト・デバッグ用（読み取りのみ）
  window.LifePlan = { get state() { return state; }, get sync() { return { ...sync, token: sync.token ? '(保存済み)' : '' }; }, get syncState() { return syncState; }, get swStatus() { return swStatus; }, version: APP_VERSION, get ai() { return { hasKey: !!ai.key, model: ai.model, share: ai.share, history: aiHist.map((m) => ({ ...m })) }; }, aiSystemPrompt: () => aiSystemPrompt(), parseNote, parseStepLines, extractJson, pomu: (h, today) => { const i = pomuInfo(normHabit(h), today); return { key: i.key, name: i.name, route: i.route, lv: i.lv, total: i.total, M: i.M, streak: i.streak, best: i.best, hints: i.hints }; }, pomuChangeMsg, syncNow: () => syncNow(), topPomu: () => { const p = topPomu(); return { key: p.key, lv: p.lv, id: p.h ? p.h.id : '' }; }, photoIds: async () => (await photoAll()).map((r) => r.id).sort(), photoInfo: async (id) => { const r = await photoGet(id); return r ? { id: r.id, bytes: r.full.byteLength, synced: !!r.synced } : null; }, syncPhotos: () => syncPhotos(), photoGc: () => photoGc(), aiDaily: () => ({ ...aiDaily, manualLeft: manualLeft(), busy: anaUi.busy, error: anaUi.error, daily: aiDailyOn(), autoMove: aiAutoMoveOn() }), analysisContext: () => analysisContext(), checkDayRollover: () => checkDayRollover(), get calendar() { return cal; }, pullCalendar: () => pullCalendar(), parseAnalysis, maybeDailyAnalysis: () => maybeDailyAnalysis(), runAnalysis: () => runAnalysis(true), photoDims: async (id) => { const r = await photoGet(id); if (!r) return null; const b = await createImageBitmap(new Blob([r.full], { type: 'image/jpeg' })); return [b.width, b.height, r.full.byteLength]; } };
})();
