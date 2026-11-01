/* ライフプラン — 個人用ライフプランニング PWA
   データはすべてこのブラウザの localStorage にのみ保存されます（サーバー送信なし）。 */
'use strict';
(() => {
  // ───────────────────────── 定数 ─────────────────────────
  const STORE_KEY = 'lifeplan.v1';
  const APP_VERSION = '1.2.0';
  const DEFAULT_CATEGORIES = ['旅行', '仕事/キャリア', '健康', '家族', '趣味', '学び', 'お金', 'その他'];
  const IMPORTANCE = { high: '高', mid: '中', low: '低' };
  const IMPORTANCE_ORDER = { high: 0, mid: 1, low: 2 };
  const TIMEFRAME = { thisYear: '今年', y1_3: '1〜3年', y5: '5年以内', someday: 'いつか' };
  const TIMEFRAME_ORDER = { thisYear: 0, y1_3: 1, y5: 2, someday: 3, '': 4 };
  const STATUS = { todo: '未着手', doing: '進行中', done: '完了' };
  const LESSON_STATUS = { considering: '検討中', active: '継続中', paused: '休止', ended: '終了' };
  const BACKGROUNDS = { mist: 'かすみ', sunrise: '朝焼け', forest: '森', ocean: '海', none: 'なし（無地）' };
  const VIEW_ICON = { 'ホーム': '🏠', 'マトリックス': '🧭', 'やりたい事': '⭐', '後回しでいい事': '🕰️', '習い事': '🎹', 'コーチに相談': '💬', 'ジャーナル': '📔', '完了履歴': '🏆', '未整理（インボックス）': '📥', '検索': '🔍', '設定・バックアップ': '⚙️', 'AIに相談（Gemini）': '🤖', '見つかりません': '🫥' };
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
    return { schema: 2, categories: [...DEFAULT_CATEGORIES], categoriesAt: '', items: [], lessons: [], journal: [], coachNotes: [], focus: {}, focusAt: {}, deleted: {}, settings: { theme: 'auto', bg: 'mist' } };
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
    return { id: j.id || uid(), date: isDateStr(j.date) ? j.date : todayStr(), text: String(j.text || ''), mood: [1, 2, 3, 4, 5].includes(Number(j.mood)) ? Number(j.mood) : 0, linked: Array.isArray(j.linked) ? j.linked.map(String) : [], source: ['photo', 'obsidian', 'ai'].includes(j.source) ? j.source : '', createdAt: j.createdAt || t, updatedAt: j.updatedAt || t };
  }
  function normCoach(c) {
    const t = nowIso();
    return { id: c.id || uid(), date: isDateStr(c.date) ? c.date : todayStr(), title: String(c.title || ''), text: String(c.text || ''), read: c.read !== false, source: c.source || '', stepsResult: Array.isArray(c.stepsResult) ? c.stepsResult.map(String) : [], createdAt: c.createdAt || t, updatedAt: c.updatedAt || t };
  }
  function normalizeState(raw) {
    const s = defaultState();
    if (!raw || typeof raw !== 'object') return s;
    if (Array.isArray(raw.categories) && raw.categories.length) s.categories = [...new Set(raw.categories.map(String).filter(Boolean))];
    s.items = (raw.items || []).map(normItem);
    s.lessons = (raw.lessons || []).map(normLesson);
    s.journal = (raw.journal || []).map(normJournal);
    s.coachNotes = (raw.coachNotes || []).map(normCoach);
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
    ['items', 'lessons', 'journal', 'coachNotes'].forEach((k) => {
      const prevMap = new Map(prev[k].map((x) => [x.id, JSON.stringify(x)]));
      const nextIds = new Set(next[k].map((x) => x.id));
      next[k].forEach((x) => { if (prevMap.get(x.id) !== JSON.stringify(x)) { x.updatedAt = now; delete next.deleted[x.id]; } });
      prev[k].forEach((x) => { if (!nextIds.has(x.id)) next.deleted[x.id] = now; });
    });
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
    searchQuery: '',
    randomId: null,
    coachDays: 14,
    coachText: '',
    lastRoute: '',
  };
