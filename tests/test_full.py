"""ライフプラン E2E テスト（GitHub API・Gemini API はモック。実際の GitHub / Google には接続しない）"""
import json, base64, hashlib, re, os, time, datetime
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8792/'
SHOTS = '/workspace/life-plan-app/screens'
os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))

# ── 偽の GitHub Contents API ──
class FakeGH:
    def __init__(self):
        self.files = {}  # path -> (text, sha)
        self.puts = []
        self.calls = []
        self.auth = []
    def set(self, path, text):
        self.files[path] = (text, hashlib.sha1((text + str(time.time())).encode()).hexdigest())
    def get_json(self, path):
        return json.loads(self.files[path][0]) if path in self.files else None
    def handle(self, route, request):
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS', 'Content-Type': 'application/json'}
        if request.method == 'OPTIONS':
            return route.fulfill(status=204, headers=cors)
        u = request.url
        self.calls.append(request.method + ' ' + u)
        self.auth.append(request.headers.get('authorization', ''))
        if request.headers.get('authorization') != 'Bearer github_pat_TEST':
            return route.fulfill(status=401, headers=cors, body=json.dumps({'message': 'Bad credentials'}))
        m = re.match(r'https://api\.github\.com/repos/100nao/life-plan-data(?:/contents/([^?]+))?', u)
        if not m:
            return route.fulfill(status=404, headers=cors, body='{"message":"Not Found"}')
        path = m.group(1)
        if path is None:
            return route.fulfill(status=200, headers=cors, body=json.dumps({'full_name': '100nao/life-plan-data', 'private': True, 'default_branch': 'main', 'permissions': {'push': True}}))
        if request.method == 'GET':
            if path not in self.files:
                return route.fulfill(status=404, headers=cors, body='{"message":"Not Found"}')
            text, sha = self.files[path]
            b = base64.b64encode(text.encode()).decode()
            b = '\n'.join(b[i:i+60] for i in range(0, len(b), 60))
            return route.fulfill(status=200, headers=cors, body=json.dumps({'type': 'file', 'path': path, 'sha': sha, 'size': len(text), 'encoding': 'base64', 'content': b}))
        if request.method == 'PUT':
            body = json.loads(request.post_data)
            cur = self.files.get(path)
            if cur and body.get('sha') != cur[1]:
                return route.fulfill(status=409, headers=cors, body='{"message":"sha mismatch"}')
            if not cur and body.get('sha'):
                return route.fulfill(status=422, headers=cors, body='{"message":"sha given for new file"}')
            text = base64.b64decode(body['content']).decode()
            self.set(path, text)
            self.puts.append((path, body['message']))
            return route.fulfill(status=201 if not cur else 200, headers=cors, body=json.dumps({'content': {'path': path, 'sha': self.files[path][1]}}))
        return route.fulfill(status=405, headers=cors, body='{}')

gh = FakeGH()

# ── 偽の Gemini API（generativelanguage.googleapis.com）──
GKEY = 'AIzaTEST_fake_key_123'
class FakeGemini:
    def __init__(self):
        self.reqs = []   # (url, headers, body)
        self.mode = 'ok'
        self.images = []
    def handle(self, route, request):
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json'}
        if request.method == 'OPTIONS':
            return route.fulfill(status=204, headers=cors)
        if self.mode == 'abort':
            return route.abort('internetdisconnected')
        body = json.loads(request.post_data or '{}')
        self.reqs.append((request.url, dict(request.headers), body))
        if self.mode == '429':
            return route.fulfill(status=429, headers=cors, body=json.dumps({'error': {'code': 429, 'message': 'Resource has been exhausted (e.g. check quota).', 'status': 'RESOURCE_EXHAUSTED'}}))
        if request.headers.get('x-goog-api-key') != GKEY:
            return route.fulfill(status=400, headers=cors, body=json.dumps({'error': {'code': 400, 'message': 'API key not valid. Please pass a valid API key.', 'status': 'INVALID_ARGUMENT',
                'details': [{'@type': 'type.googleapis.com/google.rpc.ErrorInfo', 'reason': 'API_KEY_INVALID', 'domain': 'googleapis.com'}]}}))
        parts = body['contents'][-1]['parts']
        img = next((x for x in parts if 'inline_data' in x or 'inlineData' in x), None)
        if img:
            self.images.append(img)
            out = {'date': '2026-10-28', 'text': '10/28（火）\n朝から雨。英会話の体験レッスンを予約した。\nICLのことを［判読不能］に相談する。\n来週こそパスポート申請！',
                   'tasksMentioned': ['パスポート申請', '英会話の体験レッスン', '歯医者に電話'],
                   'quadrantHints': {'q1': ['パスポート申請', 'ICL予約する'], 'q2': ['英会話を続ける'], 'q3': ['メール返信'], 'q4': []}}
            return route.fulfill(status=200, headers=cors, body=json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(out, ensure_ascii=False)}], 'role': 'model'}, 'finishReason': 'STOP'}]}, ensure_ascii=False))
        last = next(x['text'] for x in parts if 'text' in x)
        if 'ステップに分けて' in last:
            m = re.search(r'「(.+?)」', last); title = m.group(1) if m else 'AIで新しく作るタスク'
            text = f'いいですね！「{title}」を小さく分けてみましょう。\n\n- **まず5分**：情報を1つ集める\n- 次に予定を決める\n\n```json\n' + json.dumps({'taskTitle': title, 'steps': ['候補を3つ書き出す', '1つに決めて予約する', '前日に持ち物を準備する']}, ensure_ascii=False) + '\n```'
        elif '接続テスト' in last:
            text = 'OK'
        else:
            text = f'**今週は「緊急かつ重要」から**始めましょう。\n- 次の小さな一歩：10分だけ手をつける\n（受け取った履歴：{len(body["contents"])}件）'
        return route.fulfill(status=200, headers=cors, body=json.dumps({'candidates': [{'content': {'parts': [{'text': text}], 'role': 'model'}, 'finishReason': 'STOP'}], 'modelVersion': 'gemini-2.5-flash'}, ensure_ascii=False))

gem = FakeGemini()

def wait_idle(pg, ms=400):
    pg.wait_for_timeout(ms)

def shot(pg, name, full=False):
    pg.evaluate("document.getElementById('toast').hidden = true")
    pg.screenshot(path=f'{SHOTS}/{name}', full_page=full)

def S(pg, js):
    return pg.evaluate(js)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, accept_downloads=True, locale='ja-JP', timezone_id='Asia/Tokyo',
                              user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                              has_touch=True, is_mobile=True, service_workers='block')
    ctx.route('https://api.github.com/**', gh.handle)
    ctx.route('https://generativelanguage.googleapis.com/**', gem.handle)
    errors = []
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.goto(URL); wait_idle(pg, 800)

    # ── 空の状態 ──
    check('空のホームにようこそカード', pg.locator('[data-action=addMemoSamples]').count() == 1 and S(pg, 'LifePlan.state.items.length') == 0)
    check('個人データは自動で入っていない', S(pg, 'LifePlan.state.items.length + LifePlan.state.lessons.length + LifePlan.state.journal.length') == 0)

    # ── クイック追加（FAB）──
    pg.click('.fab'); wait_idle(pg, 300)
    pg.fill('form[data-form=quickAdd] input[name=title]', 'テスト用タスク')
    pg.click('form[data-form=quickAdd] label.pill-radio:has(input[value=task])')
    pg.click('form[data-form=quickAdd] label.qp.q1')
    pg.click('form[data-form=quickAdd] button[type=submit]'); wait_idle(pg)
    it = S(pg, "LifePlan.state.items.find(i => i.title === 'テスト用タスク')")
    check('追加：タスク（緊急かつ重要）', it and it['list'] == 'task' and it['quadrant'] == 'q1')
    tid = it['id']

    # ── 編集 ──
    pg.evaluate(f"location.hash = '#item/{tid}'"); wait_idle(pg)
    pg.click('[data-action=editItem]'); wait_idle(pg, 300)
    pg.fill('form[data-form=item] input[name=title]', '引っ越しの準備')
    pg.fill('form[data-form=item] textarea[name=notes]', '年内に')
    pg.click('form[data-form=item] button[type=submit]'); wait_idle(pg)
    it = S(pg, f"LifePlan.state.items.find(i => i.id === '{tid}')")
    check('編集：タイトルとメモ', it['title'] == '引っ越しの準備' and it['notes'] == '年内に')

    # ── ステップ ──
    pg.fill('form[data-form=addStep] input[name=text]', '不動産サイトで相場を見る')
    pg.press('form[data-form=addStep] input[name=text]', 'Enter'); wait_idle(pg)
    pg.click('[data-action=stepTemplates]'); wait_idle(pg, 300)
    pg.click('details.tpl:has(summary:has-text("引っ越し")) summary'); wait_idle(pg, 200)
    pg.click('details.tpl[open] [data-action=insertTemplate]'); wait_idle(pg)
    n_tpl = S(pg, f"LifePlan.state.items.find(i => i.id === '{tid}').steps.length")
    check('ステップ：テンプレート挿入', n_tpl > 3, f'{n_tpl}件')
    pg.click('[data-action=pasteSteps]'); wait_idle(pg, 300)
    pg.fill('form[data-form=pasteSteps] textarea', '1. 管理会社に退去連絡\n2) 粗大ごみの予約\n③ 住所変更をする\n- 不動産サイトで相場を見る')
    pg.click('form[data-form=pasteSteps] button[type=submit]'); wait_idle(pg)
    steps = S(pg, f"LifePlan.state.items.find(i => i.id === '{tid}').steps.map(s => s.text)")
    check('ステップ：貼り付け（番号除去・重複スキップ）', '管理会社に退去連絡' in steps and '住所変更をする' in steps and steps.count('不動産サイトで相場を見る') == 1, f'{len(steps)}件')
    check('parseStepLines', S(pg, "JSON.stringify(LifePlan.parseStepLines('1. a\\n2．b\\n・c\\n[ ] d\\nSTEP 5: e'))") == '["a","b","c","d","e"]')
    pg.locator('.stepper .dot').nth(0).click(); wait_idle(pg, 200)
    pg.locator('.stepper .dot').nth(1).click(); wait_idle(pg, 200)
    st = S(pg, f"LifePlan.state.items.find(i => i.id === '{tid}')")
    check('ステップ：完了チェックで進行中に', sum(1 for s in st['steps'] if s['done']) == 2 and st['status'] == 'doing')
    check('ステップ：進捗バー表示', pg.locator('#main .progress span').count() >= 1)
    pg.locator('.stepper input[type=date]').nth(2).fill((datetime.date.today() + datetime.timedelta(days=3)).isoformat())
    pg.locator('.stepper input[type=date]').nth(2).dispatch_event('change'); wait_idle(pg)
    check('ステップ：期限の設定', S(pg, f"LifePlan.state.items.find(i => i.id === '{tid}').steps[2].due") != '')
    pg.evaluate("document.querySelector('.stepper').scrollIntoView({block: 'start'}); window.scrollBy(0, -150)"); wait_idle(pg, 200)
    shot(pg, 'sp_steps.png')
    pg.evaluate('window.scrollTo(0,0)')
    shot(pg, 'sp_steps_top.png')

    # ── マトリックス：象限移動（タップ）──
    pg.evaluate("location.hash = '#matrix'"); wait_idle(pg)
    pg.click(f'.card.item[data-id="{tid}"] [data-action=moveSheet]'); wait_idle(pg, 300)
    pg.click('.move-sheet .qbtn.q2'); wait_idle(pg)
    check('マトリックス：タップで移動', S(pg, f"LifePlan.state.items.find(i => i.id === '{tid}').quadrant") == 'q2')
    check('マトリックス：配置（上=緊急・左=重要）', S(pg, "[...document.querySelectorAll('.matrix > .quad')].map(q => [...q.classList].find(c => /^q\\d$/.test(c))).join()") == 'q1,q3,q2,q4')

    # ── 未整理：キャプチャ → 移動 ──
    pg.evaluate("location.hash = '#inbox'"); wait_idle(pg)
    for t in ['ふと思ったこと', '後でいいこと', '消すもの']:
        pg.fill('form[data-form=capture] input', t); pg.press('form[data-form=capture] input', 'Enter'); wait_idle(pg, 200)
    check('未整理：キャプチャ', S(pg, "LifePlan.state.items.filter(i => i.list === 'inbox').length") == 3)
    def idof(t): return S(pg, f"LifePlan.state.items.find(i => i.title === '{t}').id")
    pg.click(f'.card.item[data-id="{idof("ふと思ったこと")}"] [data-action=moveTo][data-list=wish]'); wait_idle(pg)
    pg.click(f'.card.item[data-id="{idof("後でいいこと")}"] [data-action=moveTo][data-list=later]'); wait_idle(pg)
    check('未整理：ワンタップ移動', S(pg, "LifePlan.state.items.find(i => i.title === 'ふと思ったこと').list") == 'wish' and S(pg, "LifePlan.state.items.find(i => i.title === '後でいいこと').list") == 'later')
    did = idof('消すもの')
    pg.click(f'.card.item[data-id="{did}"] [data-action=deleteItem]'); wait_idle(pg)
    check('削除', S(pg, f"!LifePlan.state.items.some(i => i.id === '{did}')"))
    pg.click('#toast .toast-btn'); wait_idle(pg)
    check('削除の取り消し', S(pg, f"LifePlan.state.items.some(i => i.id === '{did}')"))
    pg.evaluate("location.hash = '#later'"); wait_idle(pg)
    pg.click('[data-action=promote]'); wait_idle(pg)
    check('後回し → やりたい事へ昇格', S(pg, "LifePlan.state.items.find(i => i.title === '後でいいこと').list") == 'wish')

    # ── 習い事 ──
    pg.evaluate("location.hash = '#lessons'"); wait_idle(pg)
    pg.click('[data-action=editLesson]'); wait_idle(pg, 300)
    pg.fill('form[data-form=lesson] input[name=name]', '英会話（オンライン）')
    pg.select_option('form[data-form=lesson] select[name=status]', 'active')
    pg.fill('form[data-form=lesson] input[name=monthlyCost]', '6480')
    pg.click('form[data-form=lesson] button[type=submit]'); wait_idle(pg)
    pg.click('[data-action=addLog]'); wait_idle(pg, 300)
    pg.click('form[data-form=log] button[type=submit]'); wait_idle(pg)
    l = S(pg, "LifePlan.state.lessons[0]")
    check('習い事：追加・月額・練習記録', l and l['monthlyCost'] == 6480 and len(l['logs']) == 1)
    check('習い事：合計月額表示', '6,480' in pg.inner_text('#main'))

    # ── ジャーナル ──
    pg.evaluate("location.hash = '#journal'"); wait_idle(pg)
    pg.click('.view-head [data-action=editJournal]'); wait_idle(pg, 300)
    pg.fill('form[data-form=journal] textarea[name=text]', '今日は引っ越しの段取りを少し進めた。気持ちが軽くなった。')
    pg.click('form[data-form=journal] .mood-pick label:nth-child(4)')
    pg.click(f'form[data-form=journal] .link-opt:has(input[value="{tid}"])')
    pg.click('form[data-form=journal] button[type=submit]'); wait_idle(pg)
    j = S(pg, "LifePlan.state.journal[0]")
    check('ジャーナル：日付・気分・関連タスク', j and j['mood'] == 4 and tid in j['linked'])
    pg.fill('[data-input=journalSearch]', '段取り'); wait_idle(pg, 200)
    check('ジャーナル：検索', pg.locator('#journalList .journal').count() == 1)
    pg.fill('[data-input=journalSearch]', 'ありえない語'); wait_idle(pg, 200)
    check('ジャーナル：検索（該当なし）', pg.locator('#journalList .journal').count() == 0)
    pg.fill('[data-input=journalSearch]', ''); wait_idle(pg, 200)

    # ── サンプル（手書きメモ）──
    pg.evaluate("location.hash = '#settings'"); wait_idle(pg)
    pg.click('[data-action=addMemoSamples]'); wait_idle(pg)
    memo = S(pg, "LifePlan.state.items.filter(i => i.sample === 'memo').map(i => [i.title, i.quadrant])")
    qmap = dict(memo)
    check('手書きメモのサンプル 15件', len(memo) == 15 and qmap.get('9hoursパリティ解消') == 'q1' and qmap.get('英会話') == 'q2' and qmap.get('あやの大阪旅行計画') == 'q3' and qmap.get('ふるさと納税') == 'q4')

    # ── 停滞（作成日を古くする）──
    ago = (datetime.datetime.now(datetime.UTC).replace(tzinfo=None) - datetime.timedelta(days=20)).isoformat() + 'Z'
    pg.evaluate("""(ago) => { const s = JSON.parse(localStorage.getItem('lifeplan.v1')); s.items.forEach(i => { if (['英会話','ICL予約する','運動'].includes(i.title)) { i.createdAt = ago; i.lastProgressAt = ago; } }); localStorage.setItem('lifeplan.v1', JSON.stringify(s)); }""", ago)
    pg.reload(); wait_idle(pg, 800)
    pg.evaluate("location.hash = '#home'"); wait_idle(pg)
    check('停滞：ホームに「ずっとできていない事」', pg.locator('.stuck-row').count() >= 3)
    sid = idof('英会話')
    pg.evaluate(f"location.hash = '#item/{sid}'"); wait_idle(pg)
    check('停滞：詳細に経過日数', '20日' in pg.inner_text('#main'))
    pg.click('form[data-form=reason] .tag-pick:has-text("時間がない")')
    pg.click('form[data-form=reason] .tag-pick:has-text("次の一歩が不明")')
    pg.fill('form[data-form=reason] textarea[name=text]', '平日の夜が埋まりがち')
    pg.click('form[data-form=reason] button[type=submit]'); wait_idle(pg)
    stk = S(pg, f"LifePlan.state.items.find(i => i.id === '{sid}').stuck")
    check('停滞：理由タグと自由記述', stk['tags'] == ['時間がない', '次の一歩が不明'] and '平日' in stk['text'])

    # ── コーチに相談（クリップボード・フォールバック）──
    pg.evaluate("location.hash = '#coach'"); wait_idle(pg)
    txt = pg.input_value('#coachText')
    check('コーチ：要約テキスト生成', '緊急かつ重要' in txt and '英会話' in txt and '時間がない' in txt and '"taskTitle"' in txt)
    pg.click('[data-action=coachDays][data-v="30"]'); wait_idle(pg)
    check('コーチ：30日切替', '30日' in pg.input_value('#coachText'))
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL.rstrip('/'))
    pg.click('[data-action=coachCopy]'); wait_idle(pg, 300)
    clip = pg.evaluate('navigator.clipboard.readText()')
    check('コーチ：コピー', '緊急かつ重要' in clip)
    pg.fill('#coachInput', 'まずは「英会話」を週1回15分から。次の一歩を小さく決めましょう。')
    pg.click('[data-action=coachSaveAdvice]'); wait_idle(pg)
    check('コーチ：アドバイス保存', S(pg, "LifePlan.state.coachNotes.length") == 1)
    pg.fill('#coachInput', 'こちらが提案です。\n```json\n{"taskTitle": "英会話", "steps": ["オンライン英会話を3社比較", "無料体験を予約", "週1回の枠をカレンダーに入れる"]}\n```')
    pg.click('[data-action=coachImportSteps]'); wait_idle(pg, 300)
    if pg.locator('.modal [data-action=closeModal]').count(): pg.locator('.modal [data-action=closeModal]').first.click(); wait_idle(pg)
    check('コーチ：ステップJSON取り込み', S(pg, f"LifePlan.state.items.find(i => i.id === '{sid}').steps.length") == 3)
    pg.evaluate("window.scrollTo(0,0)")
    shot(pg, 'sp_coach.png')

    # ── エクスポート / インポート ──
    pg.evaluate("location.hash = '#settings'"); wait_idle(pg)
    with pg.expect_download() as dl:
        pg.click('[data-action=exportJson]')
    path = dl.value.path(); exported = json.load(open(path, encoding='utf-8'))
    check('エクスポート', exported.get('app') == 'lifeplan' and len(exported['data']['items']) == S(pg, 'LifePlan.state.items.length') and 'token' not in json.dumps(exported), dl.value.suggested_filename)
    n_before = S(pg, 'LifePlan.state.items.length')
    pg.evaluate("location.hash = '#home'")
    pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('lifeplan.v1')); s.items = s.items.slice(5); localStorage.setItem('lifeplan.v1', JSON.stringify(s)); }""")
    pg.reload(); wait_idle(pg, 700)
    pg.evaluate("location.hash = '#settings'"); wait_idle(pg)
    pg.click('[data-action=importJson]'); wait_idle(pg, 300)
    pg.fill('#importText', json.dumps(exported, ensure_ascii=False))
    pg.click('[data-action=importRun]'); wait_idle(pg)
    if pg.locator('.modal').count() and pg.locator('.modal .btn.primary').count() and pg.is_visible('#modal'):
        pg.locator('.modal .btn.primary').last.click(); wait_idle(pg)
    check('インポート（マージで復元）', S(pg, 'LifePlan.state.items.length') == n_before, f"{S(pg, 'LifePlan.state.items.length')} / {n_before}")

    # ── リマインダー読み込み ──
    rem = {"reminders": [
        {"title": "パスポート更新", "list": "旅行", "notes": "期限は来年3月", "dueDate": "2026-12-20T09:00:00+09:00", "isCompleted": False, "priority": 1, "flagged": False, "tags": ["手続き"]},
        {"title": "牛乳を買う", "list": "買い物", "isCompleted": False, "priority": 0},
        {"title": "済んだこと", "list": "その他", "isCompleted": True},
        {"title": "歯医者の予約", "list": "健康", "flagged": True, "priority": "low"}]}
    pg.evaluate("location.hash = '#inbox'"); wait_idle(pg)
    pg.click('[data-action=remindersImport]'); wait_idle(pg, 300)
    pg.fill('#remText', json.dumps(rem, ensure_ascii=False))
    pg.click('[data-action=remindersRun]'); wait_idle(pg)
    r = S(pg, "LifePlan.state.items.filter(i => i.source === 'reminders').map(i => ({t: i.title, list: i.list, imp: i.importance, due: i.targetDate, cat: i.category, tags: i.tags}))")
    by = {x['t']: x for x in r}
    check('リマインダー：未整理へ・完了はスキップ', len(r) == 3 and all(x['list'] == 'inbox' for x in r) and '済んだこと' not in by)
    check('リマインダー：優先度・期限・カテゴリ・タグ', by['パスポート更新']['imp'] == 'high' and by['パスポート更新']['due'] == '2026-12-20' and by['パスポート更新']['cat'] == '旅行' and by['パスポート更新']['tags'] == ['手続き'] and by['歯医者の予約']['imp'] == 'high' and by['歯医者の予約']['cat'] == '健康')
    pg.click('[data-action=remindersImport]'); wait_idle(pg, 300)
    pg.fill('#remText', json.dumps(rem['reminders'], ensure_ascii=False))
    pg.click('[data-action=remindersRun]'); wait_idle(pg)
    check('リマインダー：重複は追加しない', S(pg, "LifePlan.state.items.filter(i => i.source === 'reminders').length") == 3)

    # ── GitHub 同期（モック）──
    check('同期前は GitHub へ通信しない', len(gh.calls) == 0)
    pg.evaluate("location.hash = '#settings/sync'"); wait_idle(pg)
    adv_txt = pg.inner_text('#syncCard')
    check('同期設定：既定値が入っている', '100nao/life-plan-data' in adv_txt and 'data/life-plan.json' in adv_txt and 'main' in adv_txt)
    shot(pg, 'sp_settings_sync.png')
    pg.fill('form[data-form=syncSetup] input[name=token]', 'github_pat_WRONG')
    pg.click('#syncTestBtn'); wait_idle(pg, 800)
    check('接続テスト：誤ったトークンはエラー表示', 'トークン' in pg.inner_text('#syncMsg') and not S(pg, 'LifePlan.sync.connected'), pg.inner_text('#syncMsg'))
    pg.fill('form[data-form=syncSetup] input[name=token]', 'github_pat_TEST')
    pg.click('#syncTestBtn'); wait_idle(pg, 1500)
    check('接続テスト：成功で接続済み', S(pg, 'LifePlan.sync.connected') and S(pg, 'LifePlan.sync.auto'))
    remote = gh.get_json('data/life-plan.json')
    check('初回：GitHub へ自動保存', remote and len(remote['data']['items']) == S(pg, 'LifePlan.state.items.length'))
    check('トークンはデータファイルに含まれない', 'github_pat' not in gh.files['data/life-plan.json'][0])
    check('トークンは state に含まれない', 'github_pat' not in pg.evaluate("localStorage.getItem('lifeplan.v1')"))
    puts0 = len(gh.puts)

    # 変更 → 自動保存
    pg.evaluate("location.hash = '#inbox'"); wait_idle(pg)
    pg.fill('form[data-form=capture] input', '同期テスト項目'); pg.press('form[data-form=capture] input', 'Enter')
    pg.wait_for_timeout(5000)
    remote = gh.get_json('data/life-plan.json')
    check('変更後に自動保存（3秒デバウンス）', any(i['title'] == '同期テスト項目' for i in remote['data']['items']) and len(gh.puts) == puts0 + 1, f'puts={len(gh.puts)}')
    pg.evaluate("LifePlan.syncNow()"); wait_idle(pg, 1200)
    check('変更なしなら保存しない（無駄なコミットなし）', len(gh.puts) == puts0 + 1)

    # 別端末（リモート）での変更 + コーチ受信箱
    remote['data']['items'].insert(0, {"id": "remote-1", "list": "wish", "title": "別の端末で追加した項目", "createdAt": "2026-10-31T00:00:00.000Z", "updatedAt": datetime.datetime.now(datetime.UTC).replace(tzinfo=None).isoformat() + 'Z'})
    gh.set('data/life-plan.json', json.dumps(remote, ensure_ascii=False))
    inbox = {"messages": [
        {"id": "2026-11-01-a", "date": "2026-11-01", "title": "今週のフォーカス", "text": "緊急かつ重要の3件のうち「9hoursパリティ解消」を最優先に。英会話は停滞14日超なので、まず無料体験の予約だけでOK。",
         "stepSuggestions": [{"taskTitle": "ICL予約する", "steps": ["クリニックを2つに絞る", "適応検査の予約を入れる"]}]},
        {"id": "2026-11-01-b", "date": "2026-11-01", "text": "ジャーナルの気分が上向きです。この調子で。"}]}
    gh.set('data/coach-inbox.json', json.dumps(inbox, ensure_ascii=False))
    # 開き直し（＝起動時の自動読み込み）
    ncalls = len(gh.calls)
    pg.evaluate("location.hash = '#home'"); pg.reload(); wait_idle(pg, 2500)
    check('起動時に自動読み込み（リモートの変更を反映）', S(pg, "LifePlan.state.items.some(i => i.id === 'remote-1')"))
    check('コーチ受信箱の自動取り込み', S(pg, "LifePlan.state.coachNotes.filter(c => c.source === 'github').length") == 2)
    check('ホームに「コーチからの新着アドバイス」', pg.locator('.coach-new').count() == 1 and 'コーチからの新着アドバイス' in pg.inner_text('.coach-new'))
    check('コーチの提案ステップを自動適用', S(pg, "LifePlan.state.items.find(i => i.title === 'ICL予約する').steps.length") == 2)
    check('未読バッジ', pg.locator('#coachBadge').is_visible() and pg.inner_text('#coachBadge') == '2')
    pg.evaluate('window.scrollTo(0,0)')
    shot(pg, 'sp_home_coach.png')
    pg.wait_for_timeout(4500)
    after = gh.get_json('data/life-plan.json')
    check('取り込んだアドバイスも GitHub に保存', len(after['data']['coachNotes']) >= 3)
    pg.evaluate("location.hash = '#home'"); pg.reload(); wait_idle(pg, 2000)
    check('同じ受信箱を再度読んでも重複しない', S(pg, "LifePlan.state.coachNotes.filter(c => c.source === 'github').length") == 2)
    pg.click('.coach-new [data-action=markAllRead]'); wait_idle(pg)
    check('すべて既読', pg.locator('.coach-new').count() == 0 and not pg.locator('#coachBadge').is_visible())

    # 競合（409）→ 再試行
    rr = gh.get_json('data/life-plan.json'); rr['data']['items'].insert(0, {"id": "remote-2", "list": "later", "title": "競合テスト（リモート）", "createdAt": "2026-10-30T00:00:00.000Z", "updatedAt": datetime.datetime.now(datetime.UTC).replace(tzinfo=None).isoformat() + 'Z'})
    gh.set('data/life-plan.json', json.dumps(rr, ensure_ascii=False))
    pg.evaluate("location.hash = '#inbox'"); wait_idle(pg)
    pg.fill('form[data-form=capture] input', '競合テスト（ローカル）'); pg.press('form[data-form=capture] input', 'Enter')
    pg.wait_for_timeout(5000)
    fin = gh.get_json('data/life-plan.json')
    titles = [i['title'] for i in fin['data']['items']]
    check('両方の変更がマージされて保存', '競合テスト（リモート）' in titles and '競合テスト（ローカル）' in titles)
    check('ローカルにもリモート変更', S(pg, "LifePlan.state.items.some(i => i.id === 'remote-2')"))

    # 削除の同期（トゥームストーン）
    rid = 'remote-1'
    pg.evaluate(f"location.hash = '#item/{rid}'"); wait_idle(pg)
    pg.click('.card.detail ~ * [data-action=deleteItem], [data-action=deleteItem]'); wait_idle(pg, 300)
    if pg.is_visible('#modal'): pg.locator('.modal .btn.danger').last.click()
    pg.wait_for_timeout(5000)
    fin = gh.get_json('data/life-plan.json')
    check('削除も同期（リモートから消える）', not any(i['id'] == rid for i in fin['data']['items']) and rid in fin['data']['deleted'])

    # 同期状態の表示
    pg.evaluate("location.hash = '#settings/sync'"); wait_idle(pg)
    check('同期インジケーター', pg.locator('#syncDot.st-ok').count() == 1)
    shot(pg, 'sp_settings_synced.png')

    ctx.set_offline(True); pg.evaluate("window.dispatchEvent(new Event('offline'))"); wait_idle(pg, 300)
    check('オフライン表示', pg.locator('#syncDot.st-offline').count() == 1)
    ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))"); wait_idle(pg, 1500)

    # ── AIに相談（Gemini・モック）──
    pg.evaluate("location.hash = '#home'"); wait_idle(pg)
    check('ホームに「AIに相談」入口', pg.locator('a.ai-entry[href="#ai"]').count() == 1)
    pg.evaluate("location.hash = '#coach'"); wait_idle(pg)
    check('コーチ画面に「AIに相談」入口', pg.locator('a.ai-entry[href="#ai"]').count() == 1)
    pg.click('a.ai-entry[href="#ai"]'); wait_idle(pg)
    check('AI画面：キー未設定の案内', 'AIに相談' in pg.title() and pg.locator('.ai-setup a[href="#settings/ai"]').count() == 1)
    pg.click('.ai-setup a[href="#settings/ai"]'); wait_idle(pg, 500)
    card = pg.inner_text('#aiCard')
    check('設定：AI連携（Gemini）セクション', 'AI連携（Gemini）' in card and 'GitHubには送られません' in card and '無料枠' in card and pg.locator('#aiCard a[href="https://aistudio.google.com/apikey"]').count() == 1)
    check('設定：モデル選択（既定 gemini-flash-lite-latest）', pg.eval_on_selector('form[data-form=aiSetup] select[name=model]', 'e => e.value') == 'gemini-flash-lite-latest' and pg.locator('form[data-form=aiSetup] option[value="gemini-3.5-flash-lite"]').count() == 1)
    check('設定：キーは伏せ字', pg.get_attribute('#aiKeyInput', 'type') == 'password')
    pg.click('[data-action=aiToggleKey]'); check('設定：キーの表示切替', pg.get_attribute('#aiKeyInput', 'type') == 'text'); pg.click('[data-action=aiToggleKey]')
    pg.fill('#aiKeyInput', 'AIza_WRONG')
    pg.click('#aiTestBtn'); wait_idle(pg, 800)
    check('接続テスト：誤ったキーはエラー', 'キーが正しくありません' in pg.inner_text('#aiMsg') and not S(pg, 'LifePlan.ai.hasKey'), pg.inner_text('#aiMsg'))
    pg.fill('#aiKeyInput', GKEY)
    pg.click('#aiTestBtn'); wait_idle(pg, 800)
    check('接続テスト：成功でキー保存', '接続できました' in pg.inner_text('#aiMsg') and S(pg, 'LifePlan.ai.hasKey'), pg.inner_text('#aiMsg'))
    u, hdr, b = gem.reqs[-1]
    check('API：キーはヘッダー（URLに入れない）', hdr.get('x-goog-api-key') == GKEY and GKEY not in u and 'key=' not in u and u.startswith('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent'), u)
    pg.evaluate('window.scrollTo(0,0)'); pg.evaluate("document.getElementById('aiCard').scrollIntoView({block:'start'})"); wait_idle(pg, 200)
    shot(pg, 'sp_settings_ai.png')
    ls = pg.evaluate("localStorage.getItem('lifeplan.ai')")
    check('キーは lifeplan.ai のみに保存（state には無い）', GKEY in ls and GKEY not in pg.evaluate("localStorage.getItem('lifeplan.v1')") and GKEY not in pg.evaluate("localStorage.getItem('lifeplan.sync')"))

    pg.evaluate("location.hash = '#ai'"); wait_idle(pg)
    check('AI画面：クイック質問4つ', pg.locator('[data-action=aiChip]').count() == 4)
    check('AI画面：共有トグル（既定オン）', pg.is_checked('[data-change=aiShare]'))
    pg.click('[data-action=aiChip][data-v="今週何から手をつける？"]')
    wait_idle(pg, 900)
    u, hdr, b = gem.reqs[-1]
    sys = b['systemInstruction']['parts'][0]['text']
    check('送信：systemInstruction にマトリクスとデータ要約', 'q2＝重要だが緊急でない' in sys and 'ICL予約する' in sys and '停滞' in sys and '最近のジャーナル' in sys and len(sys) < 12000, len(sys))
    check('送信：contents（user）', b['contents'][-1]['role'] == 'user' and b['contents'][-1]['parts'][0]['text'] == '今週何から手をつける？')
    check('返事の吹き出し', pg.locator('.bubble.me').count() == 1 and pg.locator('.bubble.ai:not(.error)').count() == 1 and '緊急かつ重要' in pg.inner_text('.bubble.ai'))
    # 自由入力 → 履歴が model ロールで送られる
    pg.fill('form[data-form=aiChat] textarea', 'ありがとう。もう少し具体的に')
    pg.click('form[data-form=aiChat] .send'); wait_idle(pg, 900)
    u, hdr, b = gem.reqs[-1]
    check('会話の続き：user/model の履歴を送る', [c['role'] for c in b['contents']] == ['user', 'model', 'user'])
    # ステップ分解（タスク選択）
    pg.click('[data-action=aiChip][data-v="このタスクをステップに分けて"]'); wait_idle(pg, 400)
    check('ステップ分解：タスク選択シート', pg.locator('#modal [data-action=aiPickTask]').count() >= 1)
    tgt = 'テスト用タスク（編集済み）' if S(pg, "LifePlan.state.items.some(i => i.title === 'テスト用タスク（編集済み）' && i.status !== 'done')") else pg.get_attribute('#modal [data-action=aiPickTask]', 'data-v')
    n_steps = S(pg, f"LifePlan.state.items.find(i => i.title === {json.dumps(tgt, ensure_ascii=False)}).steps.length")
    pg.click(f'#modal [data-action=aiPickTask][data-v={json.dumps(tgt, ensure_ascii=False)}]'); wait_idle(pg, 900)
    u, hdr, b = gem.reqs[-1]
    check('ステップ分解：JSONでの返答を依頼', '"steps"' in b['contents'][-1]['parts'][0]['text'])
    check('ステップ分解：「ステップに追加」ボタン・JSONは非表示', pg.locator('[data-action=aiAddSteps]').count() == 1 and '```' not in pg.inner_text('.chat') and '"taskTitle"' not in pg.inner_text('.chat'))
    shot(pg, 'sp_ai_chat.png')
    pg.click('[data-action=aiAddSteps]'); wait_idle(pg, 400)
    check('ステップに追加（既存タスクへ）', S(pg, f"LifePlan.state.items.find(i => i.title === {json.dumps(tgt, ensure_ascii=False)}).steps.length") == n_steps + 3, tgt)
    check('追加済み表示', pg.locator('[data-action=aiAddSteps][disabled]').count() == 1)
    nj = S(pg, 'LifePlan.state.journal.length')
    pg.locator('[data-action=aiSaveJournal]').first.click(); wait_idle(pg, 400)
    check('ジャーナルに保存', S(pg, 'LifePlan.state.journal.length') == nj + 1 and 'AIに相談' in S(pg, 'LifePlan.state.journal[LifePlan.state.journal.length-1].text'))
    # 共有オフ
    pg.click('[data-change=aiShare]'); wait_idle(pg, 300)
    pg.fill('form[data-form=aiChat] textarea', '共有なしで質問'); pg.click('form[data-form=aiChat] .send'); wait_idle(pg, 900)
    sys2 = gem.reqs[-1][2]['systemInstruction']['parts'][0]['text']
    check('共有オフ：データ要約を送らない', 'ICL予約する' not in sys2 and '共有しない' in sys2)
    pg.click('[data-change=aiShare]'); wait_idle(pg, 300)
    # エラー：429 / オフライン / ネットワーク切断
    gem.mode = '429'
    pg.fill('form[data-form=aiChat] textarea', '上限テスト'); pg.click('form[data-form=aiChat] .send'); wait_idle(pg, 900)
    check('429：無料枠の上限メッセージ', '無料枠の上限' in pg.locator('.bubble.ai.error').last.inner_text())
    gem.mode = 'abort'
    pg.fill('form[data-form=aiChat] textarea', '切断テスト'); pg.click('form[data-form=aiChat] .send'); wait_idle(pg, 900)
    check('通信失敗：オフライン案内', 'オフライン' in pg.locator('.bubble.ai.error').last.inner_text())
    gem.mode = 'ok'
    ctx.set_offline(True); pg.evaluate("window.dispatchEvent(new Event('offline'))"); wait_idle(pg, 200)
    nreq = len(gem.reqs)
    pg.fill('form[data-form=aiChat] textarea', 'オフラインテスト'); pg.click('form[data-form=aiChat] .send'); wait_idle(pg, 600)
    check('オフライン：送らずに案内', 'オフラインです' in pg.locator('.bubble.ai.error').last.inner_text() and len(gem.reqs) == nreq)
    ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))"); wait_idle(pg, 300)
    # 誤キー（チャットで）
    pg.evaluate("(() => { const a = JSON.parse(localStorage.getItem('lifeplan.ai')); a.key = 'AIza_BAD'; localStorage.setItem('lifeplan.ai', JSON.stringify(a)); })()"); pg.reload(); wait_idle(pg, 700)
    pg.fill('form[data-form=aiChat] textarea', '誤キーテスト'); pg.click('form[data-form=aiChat] .send'); wait_idle(pg, 900)
    check('誤ったキー：日本語エラー', 'キーが正しくありません' in pg.locator('.bubble.ai.error').last.inner_text())
    pg.evaluate(f"(() => {{ const a = JSON.parse(localStorage.getItem('lifeplan.ai')); a.key = '{GKEY}'; localStorage.setItem('lifeplan.ai', JSON.stringify(a)); }})()"); pg.reload(); wait_idle(pg, 700)
    check('APIキーは本文に入れない', all(GKEY not in json.dumps(r[2], ensure_ascii=False) and GKEY not in r[0] for r in gem.reqs))
    pg.fill('form[data-form=aiChat] textarea', 'エラー後の質問'); pg.click('form[data-form=aiChat] .send'); wait_idle(pg, 900)
    sent = json.dumps(gem.reqs[-1][2]['contents'], ensure_ascii=False)
    check('エラーメッセージは履歴として送らない', '無料枠の上限' not in sent and 'オフラインです' not in sent and '接続できません' not in sent and sent.count('"role": "user"') >= 4)
    check('リロード後も会話が残る', pg.locator('.bubble.me').count() >= 5)
    # 履歴は最大50件
    pg.evaluate("(() => { const a = []; for (let i = 0; i < 70; i++) a.push({id: 'x' + i, role: i % 2 ? 'model' : 'user', text: 'msg' + i, at: new Date().toISOString()}); localStorage.setItem('lifeplan.aiChat', JSON.stringify(a)); })()"); pg.reload(); wait_idle(pg, 600)
    pg.fill('form[data-form=aiChat] textarea', '50件テスト'); pg.click('form[data-form=aiChat] .send'); wait_idle(pg, 900)
    check('履歴は最大50件', len(json.loads(pg.evaluate("localStorage.getItem('lifeplan.aiChat')"))) == 50)
    # 同期・エクスポートにキーも会話も入らない
    pg.wait_for_timeout(4500)
    remote_txt = gh.files['data/life-plan.json'][0]
    check('同期データにAPIキー・会話が入らない', GKEY not in remote_txt and '50件テスト' not in remote_txt and '上限テスト' not in remote_txt and '共有なしで質問' not in remote_txt and 'lifeplan.ai' not in remote_txt)
    pg.evaluate("location.hash = '#settings'"); wait_idle(pg)
    with pg.expect_download() as dl:
        pg.click('[data-action=exportJson]')
    ex_txt = open(dl.value.path(), encoding='utf-8').read()
    check('バックアップにAPIキー・会話が入らない', GKEY not in ex_txt and '50件テスト' not in ex_txt and 'AIza' not in ex_txt)
    check('GitHub API にキーを送っていない', all(GKEY not in c for c in gh.calls))
    # 会話をクリア
    pg.evaluate("location.hash = '#ai'"); wait_idle(pg)
    pg.click('[data-action=aiClear]'); wait_idle(pg, 300); pg.locator('#confirmOk').click(); wait_idle(pg, 300)
    check('会話をクリア', pg.locator('.bubble').count() == 0 and pg.evaluate("localStorage.getItem('lifeplan.aiChat')") == '[]')
    # キー削除
    pg.evaluate("location.hash = '#settings/ai'"); wait_idle(pg)
    pg.click('[data-action=aiDeleteKey]'); wait_idle(pg, 300); pg.locator('#confirmOk').click(); wait_idle(pg, 300)
    check('キーを削除', not S(pg, 'LifePlan.ai.hasKey') and GKEY not in (pg.evaluate("localStorage.getItem('lifeplan.ai')") or ''))
    pg.evaluate(f"(() => {{ const a = JSON.parse(localStorage.getItem('lifeplan.ai')); a.key = '{GKEY}'; localStorage.setItem('lifeplan.ai', JSON.stringify(a)); }})()")
    ai_ls = pg.evaluate("localStorage.getItem('lifeplan.ai')")

    # ── ジャーナル：写真（手書き）から追加 ──
    from PIL import Image, ImageDraw
    import io
    im = Image.new('RGB', (3000, 2200), 'white'); dr = ImageDraw.Draw(im)
    for y in range(200, 2000, 120): dr.line([(150, y), (2850, y)], fill=(180, 180, 220), width=4)
    dr.text((200, 220), '2026/10/28 note', fill='black')
    jpg = io.BytesIO(); im.save(jpg, 'JPEG', quality=85); jpg = jpg.getvalue()
    pg.evaluate("location.hash = '#journal'"); wait_idle(pg)
    check('ジャーナル：写真・Obsidian ボタン', pg.locator('.journal-tools [data-action=pickPhoto]').count() == 1 and pg.locator('.journal-tools [data-action=openObsidian]').count() == 1)
    check('写真入力：カメラ/ライブラリ両方（capture なし・複数可）', pg.get_attribute('#photoInput', 'accept') == 'image/*' and pg.get_attribute('#photoInput', 'capture') is None and pg.get_attribute('#photoInput', 'multiple') is not None)
    pg.click('.journal-tools [data-action=pickPhoto]'); wait_idle(pg, 300)
    check('写真：キー未設定なら設定へ案内', '設定' in pg.inner_text('#modal') and pg.locator('#modal [data-action=goAiSettings]').count() == 1)
    pg.click('#modal [data-action=goAiSettings]'); wait_idle(pg, 400)
    check('写真：設定のAI連携へ移動', 'settings/ai' in pg.url and pg.is_hidden('#modal'))
    pg.evaluate("location.hash = '#journal'"); pg.reload(); wait_idle(pg, 700)
    nj = S(pg, 'LifePlan.state.journal.length'); nimg = len(gem.images)
    pg.set_input_files('#photoInput', files=[{'name': 'IMG_0001.jpg', 'mimeType': 'image/jpeg', 'buffer': jpg}])
    pg.wait_for_selector('form[data-form=photoJournal]', timeout=8000); wait_idle(pg, 300)
    sent = gem.reqs[-1][2]; part = gem.images[-1]
    idata = part.get('inline_data') or part.get('inlineData')
    dim = Image.open(io.BytesIO(base64.b64decode(idata['data']))).size
    check('写真：画像を inline_data(JPEG) で送信・1600px以内に縮小', len(gem.images) == nimg + 1 and idata.get('mime_type', idata.get('mimeType')) == 'image/jpeg' and max(dim) == 1600, dim)
    check('写真：JSON 応答を指定・書き起こしの指示', sent['generationConfig'].get('responseMimeType') == 'application/json' and '［判読不能］' in json.dumps(sent, ensure_ascii=False) and 'quadrantHints' in json.dumps(sent, ensure_ascii=False))
    check('写真：キーはヘッダーのみ', gem.reqs[-1][1].get('x-goog-api-key') == GKEY and GKEY not in gem.reqs[-1][0])
    check('写真：確認画面（サムネイル・日付検出・本文）', pg.locator('#modal img.photo-thumb').count() == 1 and pg.input_value('form[data-form=photoJournal] input[name=date]') == '2026-10-28' and '［判読不能］' in pg.input_value('form[data-form=photoJournal] textarea'))
    check('写真：マトリクス検出・登録済み表示', pg.locator('#modal .quad-mini .qm').count() == 4 and pg.locator('#modal .qm li.exists').count() >= 1)
    shot(pg, 'sp_journal_photo.png')
    ni = S(pg, 'LifePlan.state.items.length')
    pg.click('#modal [data-action=photoApplyMatrix]'); wait_idle(pg, 300)
    q = S(pg, "Object.fromEntries(LifePlan.state.items.filter(i => ['パスポート申請','英会話を続ける','メール返信'].includes(i.title)).map(i => [i.title, i.quadrant]))")
    check('マトリクスに反映（登録済みはスキップ）', S(pg, 'LifePlan.state.items.length') == ni + 3 and q == {'パスポート申請': 'q1', '英会話を続ける': 'q2', 'メール返信': 'q3'} and S(pg, "LifePlan.state.items.filter(i => i.title === 'ICL予約する').length") == 1, q)
    pg.fill('form[data-form=photoJournal] textarea', pg.input_value('form[data-form=photoJournal] textarea').replace('［判読不能］', '眼科の先生'))
    pg.locator('form[data-form=photoJournal] label.link-opt:has-text("歯医者に電話") input').check()
    pg.click('form[data-form=photoJournal] button[type=submit]'); wait_idle(pg, 400)
    last = S(pg, 'LifePlan.state.journal[LifePlan.state.journal.length-1]')
    check('写真：編集して保存（source:photo・日付）', S(pg, 'LifePlan.state.journal.length') == nj + 1 and last['source'] == 'photo' and last['date'] == '2026-10-28' and '眼科の先生' in last['text'] and pg.is_hidden('#modal'))
    check('写真：文中タスクを未整理に追加', S(pg, "LifePlan.state.items.some(i => i.title === '歯医者に電話' && i.list === 'inbox')"))
    check('写真：画像は保存しない', 'data:image' not in pg.evaluate("localStorage.getItem('lifeplan.v1')") and 'base64' not in pg.evaluate("localStorage.getItem('lifeplan.v1')"))
    check('写真：一覧に「📷 手書き」', '📷 手書き' in pg.inner_text('#journalList'))
    # 複数枚：1枚目スキップ → 2枚目保存
    pg.set_input_files('#photoInput', files=[{'name': 'a.jpg', 'mimeType': 'image/jpeg', 'buffer': jpg}, {'name': 'b.jpg', 'mimeType': 'image/jpeg', 'buffer': jpg}])
    pg.wait_for_selector('form[data-form=photoJournal]', timeout=8000); wait_idle(pg, 200)
    check('複数枚：枚数表示', '1/2枚目' in pg.inner_text('#modal'))
    pg.click('#modal [data-action=photoSkip]'); pg.wait_for_selector('#modalTitle:has-text("2/2")', timeout=8000); pg.wait_for_selector('form[data-form=photoJournal]', timeout=8000)
    pg.fill('form[data-form=photoJournal] textarea', '2枚目のページ'); pg.click('form[data-form=photoJournal] button[type=submit]'); wait_idle(pg, 400)
    check('複数枚：スキップと保存', S(pg, "LifePlan.state.journal.filter(e => e.source === 'photo').length") == 2 and pg.is_hidden('#modal'))
    # 読み取りエラー（429）
    gem.mode = '429'
    pg.set_input_files('#photoInput', files=[{'name': 'c.jpg', 'mimeType': 'image/jpeg', 'buffer': jpg}]); pg.wait_for_selector('#modal .error-text', timeout=8000)
    check('写真：エラー表示（無料枠）', '無料枠の上限' in pg.inner_text('#modal .error-text'))
    pg.click('#modal [data-action=closeModal]'); gem.mode = 'ok'

    # ── ジャーナル：Obsidian から取り込み ──
    nj = S(pg, 'LifePlan.state.journal.length')
    pg.click('.journal-tools [data-action=openObsidian]'); wait_idle(pg, 300)
    check('Obsidian：取り込み画面', pg.locator('#obsidianInput').count() == 1 and pg.locator('form[data-form=obsidianPaste]').count() == 1)
    md1 = '# 2026-10-20\n今日は早起きできた。\n- [x] ジョギング'
    md2 = '---\ndate: 2026-10-21\ntags: [journal]\n---\nフロントマター付きのノート'
    files = [{'name': '2026-10-20.md', 'mimeType': 'text/markdown', 'buffer': md1.encode()},
             {'name': 'メモ.md', 'mimeType': 'text/markdown', 'buffer': md2.encode()},
             {'name': '日付なし.txt', 'mimeType': 'text/plain', 'buffer': '日付のないメモ'.encode()},
             {'name': '空.md', 'mimeType': 'text/markdown', 'buffer': b'---\ndate: 2026-10-22\n---\n'}]
    pg.set_input_files('#obsidianInput', files=files); wait_idle(pg, 600)
    ob = S(pg, "LifePlan.state.journal.filter(e => e.source === 'obsidian').map(e => ({d: e.date, t: e.text}))")
    byt = {x['t']: x['d'] for x in ob}
    check('Obsidian：1ファイル1件・日付（ファイル名/フロントマター/更新日）', len(ob) == 3 and byt.get('今日は早起きできた。\n- [x] ジョギング') == '2026-10-20' and byt.get('フロントマター付きのノート') == '2026-10-21' and byt.get('日付のないメモ') == S(pg, "(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })()"), ob)
    check('Obsidian：フロントマター除去', not any('tags:' in x['t'] or '---' in x['t'] for x in ob))
    pg.click('.journal-tools [data-action=openObsidian]'); wait_idle(pg, 300)
    pg.set_input_files('#obsidianInput', files=files[:2]); wait_idle(pg, 600)
    check('Obsidian：重複はスキップ', S(pg, "LifePlan.state.journal.filter(e => e.source === 'obsidian').length") == 3)
    pg.click('.journal-tools [data-action=openObsidian]'); wait_idle(pg, 300)
    pg.fill('form[data-form=obsidianPaste] textarea', '---\ndate: 2026-09-30\n---\n貼り付けたノート'); pg.click('form[data-form=obsidianPaste] button[type=submit]'); wait_idle(pg, 400)
    pg.click('.journal-tools [data-action=openObsidian]'); wait_idle(pg, 300)
    pg.fill('form[data-form=obsidianPaste] input[name=date]', '2026-09-15'); pg.fill('form[data-form=obsidianPaste] textarea', '日付指定で貼り付け'); pg.click('form[data-form=obsidianPaste] button[type=submit]'); wait_idle(pg, 400)
    check('Obsidian：貼り付け（フロントマター日付・指定日付）', S(pg, "LifePlan.state.journal.some(e => e.source === 'obsidian' && e.date === '2026-09-30' && e.text === '貼り付けたノート')") and S(pg, "LifePlan.state.journal.some(e => e.date === '2026-09-15' && e.text === '日付指定で貼り付け')"))
    check('Obsidian：一覧に「📝 Obsidian」', '📝 Obsidian' in pg.inner_text('#journalList'))
    pg.evaluate('window.scrollTo(0,0)'); wait_idle(pg, 200); shot(pg, 'sp_journal_import.png')

    # ── スクリーンショット（モバイル）──
    pg.evaluate("location.hash = '#home'"); wait_idle(pg, 500); pg.evaluate('window.scrollTo(0,0)')
    shot(pg, 'sp_home.png')
    shot(pg, 'sp_home_full.png', full=True)
    pg.evaluate("location.hash = '#wish'"); wait_idle(pg, 500); shot(pg, 'sp_wishlist.png')
    pg.evaluate("location.hash = '#matrix'"); wait_idle(pg, 500); shot(pg, 'sp_matrix.png')
    pg.evaluate("location.hash = '#journal'"); wait_idle(pg, 500); shot(pg, 'sp_journal.png')
    pg.evaluate("location.hash = '#lessons'"); wait_idle(pg, 500); shot(pg, 'sp_lessons.png')
    pg.evaluate("location.hash = '#inbox'"); wait_idle(pg, 500); shot(pg, 'sp_inbox.png')
    pg.evaluate(f"location.hash = '#matrix'"); wait_idle(pg, 300)
    pg.locator('.matrix .card.item [data-action=moveSheet]').first.click(); wait_idle(pg, 400); shot(pg, 'sp_matrix_move.png'); pg.click('#modal [data-action=closeModal]')
    # 暗いテーマ
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')"); pg.evaluate("location.hash = '#home'"); wait_idle(pg, 400); shot(pg, 'sp_home_dark.png')
    pg.evaluate("document.documentElement.removeAttribute('data-theme')")

    # ── v2 デザイン：ガラスのタブバー・ドロワー・背景 ──
    pg.evaluate("location.hash = '#home'"); wait_idle(pg, 600); pg.evaluate('window.scrollTo(0,0)')
    check('v2：ホームのヒーロー（キャラクター）', pg.locator('.hero .hero-avatar').count() == 1 and pg.locator('.topbar .avatar').is_visible())
    check('v2：モバイルのタブは5つ', pg.evaluate("[...document.querySelectorAll('.tabbar a')].filter(a => a.offsetParent).length") == 5)
    tb = pg.locator('.tabbar').bounding_box()
    check('v2：タブバーは浮いたピル型', tb['x'] >= 10 and tb['y'] + tb['height'] <= 844 - 8 and pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.tabbar')).borderRadius)") >= 24, tb)
    check('v2：すりガラス（backdrop-filter）', 'blur' in pg.evaluate("(() => { const c = getComputedStyle(document.querySelector('.tabbar')); return c.backdropFilter || c.webkitBackdropFilter; })()"))
    def ind(): return pg.evaluate("(() => { const i = document.querySelector('.tab-indicator'); const a = document.querySelector('.tabbar a.active'); const r = i.getBoundingClientRect(), q = a.getBoundingClientRect(); return [Math.round(r.left), Math.round(q.left), i.classList.contains('off')]; })()")
    a0 = ind()
    check('v2：インジケーターが選択中タブの位置', abs(a0[0] - a0[1]) <= 2 and not a0[2], a0)
    frames = []
    from PIL import Image
    import io
    tclip = {'x': 0, 'y': tb['y'] - 8, 'width': 390, 'height': tb['height'] + 16}
    frames.append(pg.screenshot(clip=tclip))
    pg.click('.tabbar a[data-nav=journal]')
    for ms in (70, 90, 120, 400):
        pg.wait_for_timeout(ms); frames.append(pg.screenshot(clip=tclip))
    mid = Image.open(io.BytesIO(frames[1])); end = Image.open(io.BytesIO(frames[-1]))
    a1 = ind()
    check('v2：タップでインジケーターがスライド', abs(a1[0] - a1[1]) <= 2 and a1[0] > a0[0] + 100 and frames[1] != frames[-1], a1)
    ims = [Image.open(io.BytesIO(f)) for f in frames]
    sheet = Image.new('RGB', (ims[0].width, sum(i.height for i in ims) + 12 * (len(ims) - 1)), (255, 255, 255))
    y = 0
    for im in ims: sheet.paste(im, (0, y)); y += im.height + 12
    sheet.save(f'{SHOTS}/sp_tabbar_anim.png')
    pg.evaluate("location.hash = '#later'"); wait_idle(pg, 500)
    check('v2：タブにない画面ではインジケーターを隠す', ind()[2] if pg.locator('.tabbar a.active').count() == 0 or not pg.evaluate("document.querySelector('.tabbar a.active').offsetParent") else True)
    # ドロワー
    pg.click('#menuBtn'); wait_idle(pg, 550)
    check('v2：ドロワーを開く', pg.evaluate("document.body.classList.contains('drawer-open')") and pg.locator('#drawer .drawer-nav a').count() == 10 and pg.get_attribute('#menuBtn', 'aria-expanded') == 'true')
    check('v2：ドロワーで現在地を表示', pg.locator('#drawer a.active[data-nav=later]').count() == 1)
    shot(pg, 'sp_drawer_v2.png')
    pg.click('#drawer a[data-nav=lessons]'); wait_idle(pg, 550)
    check('v2：ドロワーから移動して閉じる', '習い事' in pg.title() and not pg.evaluate("document.body.classList.contains('drawer-open')") and pg.is_hidden('#drawerBackdrop'))
    pg.click('#menuBtn'); wait_idle(pg, 450); pg.mouse.click(370, 400); wait_idle(pg, 450)
    check('v2：背景タップで閉じる', not pg.evaluate("document.body.classList.contains('drawer-open')"))
    # 背景の選択
    pg.evaluate("location.hash = '#settings'"); wait_idle(pg, 400)
    check('v2：背景の選択肢（4種＋無地）', pg.locator('[data-action=setBg]').count() == 5)
    pg.click('[data-action=setBg][data-v=forest]'); wait_idle(pg, 300)
    check('v2：背景を変更', pg.get_attribute('html', 'data-bg') == 'forest' and S(pg, 'LifePlan.state.settings.bg') == 'forest')
    pg.click('[data-action=setBg][data-v=mist]'); wait_idle(pg, 200)
    imgs_ok = pg.evaluate("Promise.all(['images/bg-mist.jpg','images/bg-forest.jpg','images/bg-sunrise.jpg','images/bg-ocean.jpg','images/avatar-128.png','images/avatar-256.png'].map(u => fetch(u).then(r => r.ok)))")
    check('v2：画像はすべてローカル', all(imgs_ok))
    # スクリーンショット（v2）
    pg.evaluate("location.hash = '#home'"); wait_idle(pg, 700); pg.evaluate('window.scrollTo(0,0)'); wait_idle(pg, 200); shot(pg, 'sp_home_v2.png')
    pg.evaluate("location.hash = '#matrix'"); wait_idle(pg, 700); shot(pg, 'sp_matrix_v2.png')
    pg.evaluate("location.hash = '#journal'"); wait_idle(pg, 700); shot(pg, 'sp_journal_v2.png')
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')"); pg.evaluate("location.hash = '#home'"); wait_idle(pg, 700); shot(pg, 'sp_home_v2_dark.png')
    pg.evaluate("location.hash = '#matrix'"); wait_idle(pg, 600); shot(pg, 'sp_matrix_v2_dark.png')
    pg.evaluate("document.documentElement.removeAttribute('data-theme')")
    # 動きを減らす設定
    pg.emulate_media(reduced_motion='reduce')
    pg.evaluate("location.hash = '#wish'"); wait_idle(pg, 100)
    check('v2：動きを減らす設定ではアニメーションなし', pg.evaluate("getComputedStyle(document.querySelector('.tab-indicator')).transitionDuration.split(',').every(x => parseFloat(x) === 0) && getComputedStyle(document.querySelector('.main')).animationName === 'none'"))
    pg.emulate_media(reduced_motion='no-preference')

    # ── PC ──
    state_dump = pg.evaluate("localStorage.getItem('lifeplan.v1')")
    # ── Service Worker・オフライン（別コンテキスト：同期のモックと分けるため）──
    swc = browser.new_context(viewport={'width': 390, 'height': 844}, locale='ja-JP', timezone_id='Asia/Tokyo')
    sp = swc.new_page(); sp.on('pageerror', lambda e: errors.append('SW ' + str(e)))
    sp.goto(URL); sp.evaluate("(s) => localStorage.setItem('lifeplan.v1', s)", state_dump); sp.reload(); wait_idle(sp, 1200)
    sw = sp.evaluate("navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))")
    check('Service Worker 登録', sw, sp.evaluate('LifePlan.swStatus'))
    sp.reload(); wait_idle(sp, 800)
    check('SW がページを制御', sp.evaluate('!!navigator.serviceWorker.controller'))
    swc.set_offline(True)
    sp.reload(); wait_idle(sp, 1200)
    check('オフラインで起動', sp.locator('.tabbar').count() == 1 and sp.evaluate('LifePlan.state.items.length') > 0)
    sp.evaluate("location.hash = '#matrix'"); wait_idle(sp, 300)
    check('オフラインでも画面遷移', 'マトリックス' in sp.title())
    swc.set_offline(False); swc.close()

    pc = browser.new_context(viewport={'width': 1280, 'height': 800}, locale='ja-JP', timezone_id='Asia/Tokyo')
    pc.route('https://api.github.com/**', gh.handle)
    pc.route('https://generativelanguage.googleapis.com/**', gem.handle)
    pp = pc.new_page(); pp.on('pageerror', lambda e: errors.append('PC ' + str(e)))
    pp.goto(URL); pp.evaluate("(s) => localStorage.setItem('lifeplan.v1', s)", state_dump); pp.reload(); wait_idle(pp, 800)
    shot(pp, 'pc_home.png')
    check('PC：サイドバーに全タブ（後回し・習い事も）', pp.locator('.tabbar a[data-nav=later]').is_visible() and pp.locator('.tabbar a[data-nav=lessons]').is_visible() and not pp.locator('.tab-indicator').is_visible())
    pp.evaluate("location.hash = '#matrix'"); wait_idle(pp, 500)
    # PC：ドラッグ＆ドロップ
    src = pp.locator('.quad.q4 .card.item').first; did2 = src.get_attribute('data-id')
    src.drag_to(pp.locator('.quad.q1 .quad-body')); wait_idle(pp)
    check('PC：ドラッグで象限移動', pp.evaluate(f"LifePlan.state.items.find(i => i.id === '{did2}').quadrant") == 'q1')
    shot(pp, 'pc_matrix.png')
    pp.evaluate("location.hash = '#coach'"); wait_idle(pp, 400); shot(pp, 'pc_coach.png')
    pp.evaluate("(s) => localStorage.setItem('lifeplan.ai', s)", ai_ls)
    pp.evaluate("location.hash = '#ai'"); pp.reload(); wait_idle(pp, 700)
    check('PC：サイドバーに「AIに相談」', pp.locator('.tabbar a[data-nav=ai].active').is_visible())
    pp.fill('form[data-form=aiChat] textarea', 'PCから相談'); pp.press('form[data-form=aiChat] textarea', 'Enter'); wait_idle(pp, 900)
    check('PC：Enterで送信・返事', pp.locator('.bubble.me').count() == 1 and pp.locator('.bubble.ai:not(.error)').count() == 1)
    box = pp.locator('.chat-dock').bounding_box()
    check('PC：入力欄が画面内', box and box['y'] + box['height'] <= 800 and box['x'] > 150, box)
    shot(pp, 'pc_ai_chat.png')
    pp.evaluate("location.hash = '#search'"); wait_idle(pp, 300)
    pp.fill('[data-input=search]', '英会話'); wait_idle(pp, 300)
    check('検索', pp.locator('#searchResults .card').count() >= 1)
    pp.evaluate("location.hash = '#done'"); wait_idle(pp, 300)
    check('完了履歴ページ', '完了履歴' in pp.title())

    check('JS エラーなし', not [e for e in errors if 'favicon' not in e and 'Failed to load resource' not in e], '; '.join(errors[:5]))
    browser.close()

print('\n==== %d / %d PASS ====' % (sum(1 for _, ok in results if ok), len(results)))
for n, ok in results:
    if not ok: print('FAILED:', n)
