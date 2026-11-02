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
        self.bins = {}  # 写真（バイナリ）path -> (bytes, sha)
        self.private = True
        self.deletes = []
    def set(self, path, text):
        self.files[path] = (text, hashlib.sha1((text + str(time.time())).encode()).hexdigest())
    def get_json(self, path):
        return json.loads(self.files[path][0]) if path in self.files else None
    def handle(self, route, request):
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS', 'Content-Type': 'application/json'}
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
            return route.fulfill(status=200, headers=cors, body=json.dumps({'full_name': '100nao/life-plan-data', 'private': self.private, 'default_branch': 'main', 'permissions': {'push': True}}))
        if path.endswith('.jpg'):
            cur = self.bins.get(path)
            if request.method == 'GET':
                if not cur: return route.fulfill(status=404, headers=cors, body='{"message":"Not Found"}')
                return route.fulfill(status=200, headers=cors, body=json.dumps({'type': 'file', 'path': path, 'sha': cur[1], 'size': len(cur[0]), 'encoding': 'base64', 'content': base64.b64encode(cur[0]).decode()}))
            if request.method == 'PUT':
                body = json.loads(request.post_data)
                if cur and body.get('sha') != cur[1]:
                    return route.fulfill(status=422, headers=cors, body='{"message":"sha wasn\'t supplied"}')
                raw = base64.b64decode(body['content'])
                self.bins[path] = (raw, hashlib.sha1(raw).hexdigest())
                self.puts.append((path, body['message']))
                return route.fulfill(status=201, headers=cors, body=json.dumps({'content': {'path': path, 'sha': self.bins[path][1]}}))
            if request.method == 'DELETE':
                body = json.loads(request.post_data or '{}')
                if not cur: return route.fulfill(status=404, headers=cors, body='{"message":"Not Found"}')
                if body.get('sha') != cur[1]: return route.fulfill(status=409, headers=cors, body='{"message":"sha mismatch"}')
                del self.bins[path]; self.deletes.append(path)
                return route.fulfill(status=200, headers=cors, body='{"commit":{}}')
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
ANA_JSON = {'summary': '英会話が2週間止まっています。今週は小さく再開するのが良さそうです。習慣スタンプは順調です。',
            'insights': ['「緊急かつ重要」が3件たまっています', '日記は5日連続でついています', '英会話のステップが止まっています', '4つ目は表示されない'],
            'taskSuggestions': [
                {'title': '英会話の体験レッスン', 'quadrant': 'q2', 'why': '既存と重複', 'steps': ['x']},
                {'title': 'オンライン英会話の無料体験を予約する', 'quadrant': 'q2', 'why': '止まっている英会話を、まず15分の体験で再開するため。', 'steps': ['サービスを2つ比べる', '体験枠を予約する', '前日にアプリを入れる']},
                {'title': 'パスポートの写真を撮る', 'quadrant': 'q9', 'why': '申請の前準備として。', 'steps': ['証明写真機の場所を調べる']},
                {'title': '4件目は入らない', 'quadrant': 'q4', 'why': '', 'steps': []}]}
class FakeGemini:
    def __init__(self):
        self.reqs = []   # (url, headers, body)
        self.mode = 'ok'
        self.images = []
        self.ana_reqs = []
        self.ana_mode = 'json'
        self.ana_json = ANA_JSON
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
        if '## 毎日の分析' in last:
            self.ana_reqs.append(body)
            obj = self.ana_json
            if self.ana_mode == 'garbage':
                text = 'すみません、今日はうまく整理できませんでした。英会話を少しだけ進めましょう。'
            elif self.ana_mode == 'fenced':
                text = '分析結果です：\n```json\n' + json.dumps(obj, ensure_ascii=False) + '\n```'
            else:
                text = json.dumps(obj, ensure_ascii=False)
            return route.fulfill(status=200, headers=cors, body=json.dumps({'candidates': [{'content': {'parts': [{'text': text}], 'role': 'model'}, 'finishReason': 'STOP'}], 'modelVersion': 'gemini-2.5-flash'}, ensure_ascii=False))
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
    check('v2：ドロワーを開く', pg.evaluate("document.body.classList.contains('drawer-open')") and pg.locator('#drawer .drawer-nav a').count() == 12 and pg.get_attribute('#menuBtn', 'aria-expanded') == 'true')
    check('v2：ドロワーで現在地を表示', pg.locator('#drawer a.active[data-nav=later]').count() == 1)
    shot(pg, 'sp_drawer_v2.png')
    pg.click('#drawer a[data-nav=lessons]'); wait_idle(pg, 550)
    check('v2：ドロワーから移動して閉じる', '習い事' in pg.title() and not pg.evaluate("document.body.classList.contains('drawer-open')") and pg.is_hidden('#drawerBackdrop'))
    pg.click('#menuBtn'); wait_idle(pg, 450); pg.mouse.click(20, 400); wait_idle(pg, 450)
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

    # ── v1.3.0：毎日の目標スタンプ（習慣）・ぽむ ──
    JST = datetime.timezone(datetime.timedelta(hours=9))
    TD = datetime.datetime.now(JST).date()
    def dd(n): return (TD - datetime.timedelta(days=n)).isoformat()
    def pomu(done, start, today=None):
        return pg.evaluate("([d, s, t]) => LifePlan.pomu({id: 'x', name: 't', startDate: s, done: d}, t)", [done, start, today or TD.isoformat()])
    check('バージョン 1.4.0', S(pg, 'LifePlan.version') == '1.4.0')
    check('習慣：state.habits が配列', S(pg, 'Array.isArray(LifePlan.state.habits)'))
    # ぽむのルール
    r = pomu([], dd(0)); check('ぽむ：0日はたまご（stage-1）', r['key'] == 'stage-1' and r['lv'] == 1, r)
    r = pomu([dd(i) for i in range(3)], dd(2)); check('ぽむ：3日で stage-2', r['key'] == 'stage-2' and r['lv'] == 2, r)
    r = pomu([dd(i) for i in range(7)], dd(6)); check('ぽむ：7日で stage-3', r['key'] == 'stage-3' and r['lv'] == 3 and r['streak'] == 7, r)
    r = pomu([dd(i) for i in range(14)], dd(13)); check('ぽむ：14日・休みなしで rich-1', r['key'] == 'rich-1' and r['route'] == 'rich', r)
    r = pomu([dd(i) for i in range(30)], dd(29)); check('ぽむ：30日・休みなしで rich-2', r['key'] == 'rich-2', r)
    r = pomu([dd(i) for i in range(60)], dd(59)); check('ぽむ：60日・休みなしで rich-3', r['key'] == 'rich-3', r)
    r = pomu([dd(i) for i in range(1, 100) if i not in (3, 5)], dd(99)); check('ぽむ：休み2日の14日以上は main（stage-6）', r['key'] == 'stage-6' and r['M'] == 2, r)
    r = pomu([dd(i) for i in range(20, 40)], dd(39)); check('ぽむ：直近14日に10日以上休みで villain-3', r['key'] == 'villain-3' and r['M'] >= 10, r)
    r = pomu([dd(i) for i in range(1, 8)] + [dd(i) for i in range(20, 30)], dd(29)); check('ぽむ：7日連続で改心（villain 無効）', r['route'] != 'villain' and r['streak'] == 7, r)
    r = pomu([dd(i) for i in range(1, 15) if i not in (2, 4, 6, 8)] + [dd(i) for i in range(15, 40)], dd(39)); check('ぽむ：休み4日で villain-1', r['key'] == 'villain-1' and r['M'] == 4, r)
    r = pomu([dd(i) for i in range(1, 15) if i not in (2, 4, 6, 8, 10, 12, 13)] + [dd(i) for i in range(15, 40)], dd(39)); check('ぽむ：休み7日で villain-2', r['key'] == 'villain-2', r)
    r = pomu([dd(i) for i in range(1, 104) if i not in (2, 5, 9)], dd(103)); check('ぽむ：100日以上・休み3日以下で stage-7', r['key'] == 'stage-7' and r['lv'] == 7, r)
    r = pomu([dd(i) for i in range(1, 3)], dd(2)); check('ぽむ：はじめたばかりは休みに数えない', r['M'] == 0, r)
    r = pomu([dd(1), dd(2)], dd(5)); check('ぽむ：今日は休みに数えない', r['M'] == 3, r)
    cm = pg.evaluate("[LifePlan.pomuChangeMsg('stage-2','stage-3'), LifePlan.pomuChangeMsg('stage-3','rich-1'), LifePlan.pomuChangeMsg('villain-1','stage-3'), LifePlan.pomuChangeMsg('stage-3','villain-1')].map(m => m && m.text)")
    check('ぽむ：お祝いメッセージ', cm[0] == '進化した！' and cm[1] == 'お金持ちルートへ！' and cm[2] == '改心した！' and cm[3] == 'わるぽむになっちゃった…', cm)
    # 一覧が空 → 作成
    pg.evaluate("location.hash = '#habits'"); wait_idle(pg, 500)
    check('習慣：画面タイトル', '習慣スタンプ' in pg.title())
    n0 = S(pg, 'LifePlan.state.habits.length')
    if n0 == 0: check('習慣：空のときの案内', pg.locator('.habit-empty').count() == 1)
    pg.locator('[data-action=editHabit]').first.click(); wait_idle(pg, 400)
    check('習慣：作成フォーム（開始日は今日）', pg.locator('#modal form[data-form=habit]').count() == 1 and pg.input_value('#modal [name=startDate]') == TD.isoformat())
    pg.click('#modal [data-action=pickEmoji][data-v="📚"]') if pg.locator('#modal [data-action=pickEmoji][data-v="📚"]').count() else None
    pg.fill('#modal [name=name]', '英語5分'); pg.fill('#modal [name=startDate]', dd(9))
    pg.click('#modal button[type=submit]'); wait_idle(pg, 600)
    hid = S(pg, "LifePlan.state.habits.find(h => h.name === '英語5分').id")
    check('習慣：作成して詳細へ', hid and pg.evaluate("location.hash") == f'#habits/{hid}' and pg.locator('.habit-title').count() == 1)
    check('習慣：ぽむの画像が表示（512）', pg.evaluate("(() => { const i = document.querySelector('.pomu-card img'); return !!i && i.complete && i.naturalWidth > 0 && /stage-1\\.webp$/.test(i.src); })()"))
    pg.click('.stamp-big'); wait_idle(pg, 500)
    check('習慣：今日のスタンプを押す', TD.isoformat() in S(pg, f"LifePlan.state.habits.find(h => h.id === '{hid}').done") and pg.locator('.hc-day.today.done').count() == 1)
    pg.click('.stamp-big'); wait_idle(pg, 500)
    check('習慣：もう一度押すと取り消し', TD.isoformat() not in S(pg, f"LifePlan.state.habits.find(h => h.id === '{hid}').done"))
    # 過去日をタップ（開始日より前・未来は押せない）
    pg.evaluate(f"""(() => {{ const h = LifePlan.state.habits.find(h => h.id === '{hid}'); h.done = {json.dumps([dd(i) for i in (1, 2, 3, 5, 6, 7)])}; h.seen = 'stage-2'; h.unlocked = ['stage-1','stage-2']; localStorage.setItem('lifeplan.v1', JSON.stringify(LifePlan.state)); }})()""")
    pg.reload(); wait_idle(pg, 900)
    pg.evaluate("document.getElementById('pomuCelebrate') && document.getElementById('pomuCelebrate').remove()")
    cal = pg.evaluate("(() => { const q = (s) => document.querySelectorAll('.habit-cal ' + s).length; return {done: q('.hc-day.done'), missed: q('.hc-day.missed'), futureBtn: document.querySelectorAll('.hc-day.future button, .hc-day.before button').length}; })()")
    vis = lambda d: datetime.date.fromisoformat(d).month == TD.month
    exp_done = sum(1 for i in (1, 2, 3, 5, 6, 7) if vis(dd(i))); exp_miss = sum(1 for i in (4, 8, 9) if vis(dd(i)))
    check('習慣：カレンダーに〇と×', cal['done'] == exp_done and cal['missed'] == exp_miss and cal['futureBtn'] == 0, cal)
    check('習慣：×の印（SVG）', pg.locator('.hc-day.missed svg').count() == exp_miss)
    stats = pg.inner_text('.habit-stats')
    check('習慣：統計（累計・今月・連続・最長）', '累計日数' in stats and '6' in stats and '現在の連続日数' in stats and '最長連続' in stats and f'/ {__import__("calendar").monthrange(TD.year, TD.month)[1]}' in stats, stats.replace('\n', ' '))
    st = pomu([dd(i) for i in (1, 2, 3, 5, 6, 7)], dd(9))
    check('習慣：連続は昨日から数える', st['streak'] == 3 and st['best'] == 3 and st['total'] == 6, st)
    # 月の切り替え
    lbl0 = pg.inner_text('.hc-title')
    pg.click('[data-action=habitMonth][data-dir="-1"]'); wait_idle(pg, 300)
    lbl1 = pg.inner_text('.hc-title')
    check('習慣：前の月へ', lbl0 != lbl1)
    pg.click('[data-action=habitMonth][data-dir="1"]'); wait_idle(pg, 300)
    check('習慣：今月にもどる・次へは無効', pg.inner_text('.hc-title') == lbl0 and pg.locator('[data-action=habitMonth][data-dir="1"]').is_disabled())
    # 今日を押して Lv.3（7日）→ 進化のお祝い
    pg.locator('button.hc-day.today').click(); wait_idle(pg, 900)
    check('習慣：7日目で「進化した！」のお祝い', pg.locator('#pomuCelebrate').count() == 1 and '進化した' in pg.inner_text('#pomuCelebrate'))
    pg.wait_for_timeout(500); shot(pg, 'sp_habit_celebrate.png')
    pg.click('#pomuCelebrate'); wait_idle(pg, 600)
    check('習慣：お祝いを閉じる', pg.locator('#pomuCelebrate').count() == 0)
    check('習慣：Lv.3 ぽむりん', 'ぽむりん' in pg.inner_text('.pomu-card') and 'Lv.3' in pg.inner_text('.pomu-card'))
    check('習慣：ルートのヒント', pg.locator('.pomu-hint').count() >= 1 and 'お金持ちルート' in pg.inner_text('.pomu-card'))
    pg.evaluate('window.scrollTo(0,0)'); wait_idle(pg, 200); shot(pg, 'sp_habit.png'); shot(pg, 'sp_habit_full.png', True)
    # 2つ目（ホームから押す）
    pg.evaluate(f"""(() => {{ LifePlan.state.habits.push({{id: 'hb-villain', emoji: '🏃', name: 'ストレッチ', startDate: '{dd(30)}', done: {json.dumps([dd(i) for i in range(15, 31)])}, seen: 'villain-3', unlocked: ['villain-3'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()}}); localStorage.setItem('lifeplan.v1', JSON.stringify(LifePlan.state)); }})()""")
    pg.evaluate("location.hash = '#home'"); pg.reload(); wait_idle(pg, 900)
    check('習慣：ホームに今日のスタンプカード', pg.locator('.habits-home .habit-row').count() == 2 and '1/2' in pg.inner_text('.habits-home'))
    check('習慣：ホームのサムネイル（256）', pg.evaluate("[...document.querySelectorAll('.habits-home .hr-pomu img')].every(i => /-256\\.webp$/.test(i.src) && i.complete && i.naturalWidth > 0)"))
    pg.evaluate("window.scrollTo(0, document.querySelector('.habits-home').getBoundingClientRect().top + scrollY - 70)"); wait_idle(pg, 300)
    shot(pg, 'sp_home_habits.png')
    pg.click('.habits-home .habit-row:has-text("ストレッチ") [data-action=habitToggle]'); wait_idle(pg, 600)
    check('習慣：ホームからタップでスタンプ', TD.isoformat() in S(pg, "LifePlan.state.habits.find(h => h.id === 'hb-villain').done") and '2/2' in pg.inner_text('.habits-home'))
    pg.evaluate("document.getElementById('pomuCelebrate') && document.getElementById('pomuCelebrate').remove()")
    # 図鑑
    pg.evaluate("location.hash = '#habits/zukan'"); wait_idle(pg, 700)
    zk = pg.evaluate("[document.querySelectorAll('.zk-tile').length, document.querySelectorAll('.zk-tile.on').length, document.querySelectorAll('.zk-tile.locked').length]")
    check('図鑑：13種類・発見済みと未発見', zk[0] == 13 and zk[1] >= 3 and zk[1] + zk[2] == 13, zk)
    check('図鑑：未発見は ？？？ とシルエット', '？？？' in pg.inner_text('.zk-tile.locked >> nth=0') and pg.locator('.zk-tile.on:has-text("ぽむりん")').count() == 1 and pg.locator('.zk-tile.on:has-text("わるぽむ")').count() >= 1)
    check('図鑑：画像がすべて読み込める', pg.evaluate("Promise.all([...document.querySelectorAll('.zk-tile img')].map(i => i.decode().then(() => i.naturalWidth > 0, () => false))).then(a => a.every(Boolean))"))
    pg.evaluate('window.scrollTo(0,0)'); shot(pg, 'sp_zukan.png'); shot(pg, 'sp_zukan_full.png', True)
    # 一覧
    pg.evaluate("location.hash = '#habits'"); wait_idle(pg, 600)
    check('習慣：一覧に2件', pg.locator('.habit-list .habit-row, .habit-row').count() >= 2)
    shot(pg, 'sp_habits_list.png')
    # 編集
    pg.evaluate(f"location.hash = '#habits/{hid}'"); wait_idle(pg, 500)
    pg.click('[data-action=editHabit]'); wait_idle(pg, 400)
    pg.fill('#modal [name=name]', '英語10分'); pg.click('#modal button[type=submit]'); wait_idle(pg, 500)
    check('習慣：名前を編集', S(pg, f"LifePlan.state.habits.find(h => h.id === '{hid}').name") == '英語10分' and '英語10分' in pg.inner_text('.habit-title'))
    # 同期に含まれる
    if S(pg, 'LifePlan.sync.connected'):
        pg.evaluate('LifePlan.syncNow()'); wait_idle(pg, 1500)
        rem = gh.get_json('data/life-plan.json')
        check('習慣：GitHub 同期データに習慣が入る', any(h.get('name') == '英語10分' for h in rem['data'].get('habits', [])))
    # 削除（確認つき）
    pg.evaluate("location.hash = '#habits/hb-villain'"); wait_idle(pg, 500)
    pg.evaluate("document.getElementById('pomuCelebrate') && document.getElementById('pomuCelebrate').remove()")
    pg.click('[data-action=editHabit]'); wait_idle(pg, 400)
    pg.click('#modal [data-action=deleteHabit]'); wait_idle(pg, 400)
    check('習慣：削除の確認', '削除しますか' in pg.inner_text('#modal'))
    pg.click('#confirmOk'); wait_idle(pg, 600)
    check('習慣：削除できる', S(pg, "LifePlan.state.habits.some(h => h.id === 'hb-villain')") is False and pg.evaluate('location.hash') == '#habits' and S(pg, "!!LifePlan.state.deleted['hb-villain']"))
    # 古いデータ（habits なし）を読み込んでも壊れない（同期なしの別コンテキスト）
    mc = browser.new_context(viewport={'width': 390, 'height': 844}, locale='ja-JP', timezone_id='Asia/Tokyo', service_workers='block')
    mp = mc.new_page(); mp.on('pageerror', lambda e: errors.append('MIG ' + str(e)))
    old = json.loads(pg.evaluate("localStorage.getItem('lifeplan.v1')")); old.pop('habits', None)
    mp.goto(URL); mp.evaluate("(s) => localStorage.setItem('lifeplan.v1', s)", json.dumps(old, ensure_ascii=False)); mp.reload(); wait_idle(mp, 700)
    check('移行：habits がない古いデータも読める', S(mp, 'Array.isArray(LifePlan.state.habits) && LifePlan.state.habits.length === 0 && LifePlan.state.items.length > 0') and mp.locator('.tabbar').count() == 1)
    mp.evaluate("location.hash = '#habits'"); wait_idle(mp, 400)
    check('移行：古いデータで習慣画面（空の案内）', mp.locator('.habit-empty').count() == 1)
    old['habits'] = [{'name': '壊れた', 'done': ['2026-13-40', 'x', '2026-01-02', '2026-01-02'], 'emoji': ''}, None, 3]
    mp.evaluate("(s) => localStorage.setItem('lifeplan.v1', s)", json.dumps(old, ensure_ascii=False)); mp.reload(); wait_idle(mp, 700)
    hh = S(mp, 'LifePlan.state.habits')
    check('移行：壊れた習慣データを補正', len(hh) == 1 and hh[0]['id'] and hh[0]['done'] == ['2026-01-02'] and hh[0]['emoji'] and hh[0]['startDate'] == '2026-01-02', hh)
    check('移行：missed がない古い習慣は空配列', hh and hh[0].get('missed') == [], hh)
    old['habits'] = [{'name': '×つき', 'done': ['2026-01-02'], 'missed': ['2026-01-02', '2026-01-03', '2026-01-03', 'bad']}]
    mp.evaluate("(s) => localStorage.setItem('lifeplan.v1', s)", json.dumps(old, ensure_ascii=False)); mp.reload(); wait_idle(mp, 700)
    hh = S(mp, 'LifePlan.state.habits')
    check('移行：〇と×が同じ日なら〇を優先・重複と不正な日付は除く', hh[0]['missed'] == ['2026-01-03'] and hh[0]['done'] == ['2026-01-02'], hh)
    mc.close()
    check('習慣：ドロワーに「習慣スタンプ」', pg.locator('#drawer a[data-nav=habits]').count() == 1)

    # ════════ v1.3.1 ════════
    def wait_js(p_, expr, timeout=10000):
        t0 = time.time()
        while time.time() - t0 < timeout / 1000:
            if p_.evaluate(expr): return True
            p_.wait_for_timeout(150)
        return False
    def rm_celebrate(p_=None):
        (p_ or pg).evaluate("document.getElementById('pomuCelebrate') && document.getElementById('pomuCelebrate').remove()")
    def hb(): return S(pg, f"LifePlan.state.habits.find(h => h.id === '{hid}')")
    # ── 1) できなかった（×）スタンプ ──
    pg.evaluate(f"location.hash = '#habits/{hid}'"); wait_idle(pg, 600); rm_celebrate()
    check('×：今日の「できた」「できなかった」の2つのボタン', pg.locator('.stamp-pair .stamp-big').count() == 1 and pg.locator('.stamp-pair .stamp-miss').count() == 1 and 'できなかった' in pg.inner_text('.stamp-pair'))
    if TD.isoformat() not in hb()['done']: pg.click('.stamp-pair .stamp-big'); wait_idle(pg, 500); rm_celebrate()
    pg.click('.stamp-pair .stamp-miss'); wait_idle(pg, 600); rm_celebrate()
    h1 = hb()
    check('×：「できなかった」で今日が × になる（〇は外れる）', TD.isoformat() in h1['missed'] and TD.isoformat() not in h1['done'], h1['missed'])
    check('×：ボタンが押された状態・カレンダーに ×', pg.locator('.stamp-miss.on').count() == 1 and pg.locator('button.hc-day.today.marked-x .st-xm').count() == 1 and pg.locator('.stamp-big.on').count() == 0)
    check('×：統計に「できなかった日」', pg.locator('.hs-missed').count() == 1 and pg.inner_text('#missedCount').startswith('1'), pg.inner_text('.hs-missed') if pg.locator('.hs-missed').count() else '')
    pg.click('.stamp-pair .stamp-miss'); wait_idle(pg, 500); rm_celebrate()
    h1 = hb()
    check('×：もう一度押すと取り消し', TD.isoformat() not in h1['missed'] and TD.isoformat() not in h1['done'] and pg.locator('.stamp-miss.on').count() == 0)
    pg.click('.stamp-pair .stamp-big'); wait_idle(pg, 600); rm_celebrate()
    check('×：「できた」で 〇 に戻せる', TD.isoformat() in hb()['done'] and pg.locator('.stamp-big.on').count() == 1)
    # カレンダーのタップ：〇 → × → なし → 〇
    tgt = dd(1)
    if tgt[:7] != TD.isoformat()[:7]: pg.click('[data-action=habitMonth][data-dir="-1"]'); wait_idle(pg, 400)
    cell = f'button.hc-day[data-date="{tgt}"]'
    st0 = 'done' if tgt in hb()['done'] else 'none'
    pg.click(cell); wait_idle(pg, 500); rm_celebrate()
    h1 = hb(); st1 = 'done' if tgt in h1['done'] else 'missed' if tgt in h1['missed'] else 'none'
    pg.click(cell); wait_idle(pg, 500); rm_celebrate()
    h2 = hb(); st2 = 'done' if tgt in h2['done'] else 'missed' if tgt in h2['missed'] else 'none'
    pg.click(cell); wait_idle(pg, 500); rm_celebrate()
    h3 = hb(); st3 = 'done' if tgt in h3['done'] else 'missed' if tgt in h3['missed'] else 'none'
    exp = {'done': ['missed', 'none', 'done'], 'none': ['done', 'missed', 'none']}[st0]
    check('×：カレンダーをタップで 〇→×→なし の順に切り替え', [st1, st2, st3] == exp, [st0, st1, st2, st3])
    check('×：〇と×は同じ日に重ならない', all(not (set(h['done']) & set(h['missed'])) for h in [h1, h2, h3]))
    # 〇の日を × にしてスクリーンショット（〇と×が並ぶ）
    while ('missed' if tgt in hb()['missed'] else 'x') != 'missed':
        pg.click(cell); wait_idle(pg, 450); rm_celebrate()
    check('×：カレンダーの × は自分で押した印（marked-x）と、押していない日（auto-x）で区別', pg.locator(f'{cell}.marked-x .st-xm').count() == 1 and pg.locator('button.hc-day.marked-x').count() >= 1)
    # 進化のルールは「スタンプなし」と同じ
    dn = [dd(i) for i in range(2, 9)]
    a = pg.evaluate("([d, s, t]) => LifePlan.pomu({id: 'x', name: 't', startDate: s, done: d}, t)", [dn, dd(10), TD.isoformat()])
    b = pg.evaluate("([d, m, s, t]) => LifePlan.pomu({id: 'x', name: 't', startDate: s, done: d, missed: m}, t)", [dn, [dd(1), dd(9), dd(10)], dd(10), TD.isoformat()])
    check('×：進化の判定は × とスタンプなしが同じ扱い', a == b and a['M'] == 3, [a, b])
    pg.evaluate("document.querySelector('.habit-cal').scrollIntoView({block: 'start'}); window.scrollBy(0, -70)"); wait_idle(pg, 300)
    shot(pg, 'v131_habit.png')
    if S(pg, 'LifePlan.sync.connected'):
        pg.evaluate('LifePlan.syncNow()'); wait_idle(pg, 1500)
        rem = gh.get_json('data/life-plan.json')
        rh = next((h for h in rem['data'].get('habits', []) if h.get('id') == hid), {})
        check('×：GitHub 同期データに missed が入る', tgt in rh.get('missed', []) and tgt not in rh.get('done', []), rh.get('missed'))
    pg.click(cell); wait_idle(pg, 450); pg.click(cell); wait_idle(pg, 450); rm_celebrate()  # × → なし → 〇 に戻す
    check('×：元に戻した', tgt in hb()['done'])

    # ── 2) トップバーのぽむ ──
    pg.evaluate("location.hash = '#home'"); wait_idle(pg, 700); pg.evaluate('window.scrollTo(0,0)'); wait_idle(pg, 200)
    tp = S(pg, 'LifePlan.topPomu()')
    tsrc = pg.get_attribute('#topPomu', 'src')
    check('ぽむ（上部バー）：今の姿を表示（-256.webp）', tsrc == f"images/monster/{tp['key']}-256.webp" and tp['id'] == hid, [tsrc, tp])
    check('ぽむ（上部バー）：画像が読み込める', pg.evaluate("(() => { const i = document.getElementById('topPomu'); return i.complete && i.naturalWidth > 0; })()"))
    bb = pg.locator('.brand-pomu').bounding_box()
    check('ぽむ（上部バー）：小さく丸い・中央', bb and 36 <= bb['width'] <= 48 and abs((bb['x'] + bb['width'] / 2) - 195) <= 3 and pg.evaluate("getComputedStyle(document.querySelector('.brand-pomu')).borderRadius") == '50%', bb)
    shot(pg, 'v131_topbar.png')
    pg.click('.brand-pomu'); wait_idle(pg, 500); rm_celebrate()
    check('ぽむ（上部バー）：タップで習慣スタンプへ', pg.evaluate('location.hash') == '#habits')
    # いちばん育った ぽむ／同じレベルなら最近スタンプした目標／目標なしは stage-1（別コンテキスト）
    tc = browser.new_context(viewport={'width': 390, 'height': 844}, locale='ja-JP', timezone_id='Asia/Tokyo', service_workers='block')
    tpg = tc.new_page(); tpg.on('pageerror', lambda e: errors.append('TOP ' + str(e)))
    tpg.goto(URL); wait_idle(tpg, 500)
    check('ぽむ（上部バー）：目標がないときは ぽむたま（stage-1）', tpg.get_attribute('#topPomu', 'src') == 'images/monster/stage-1-256.webp')
    def put_habits(p_, hs):
        p_.evaluate("(hs) => { const s = JSON.parse(localStorage.getItem('lifeplan.v1') || '{}'); s.habits = hs; localStorage.setItem('lifeplan.v1', JSON.stringify(s)); }", hs); p_.reload(); wait_idle(p_, 600)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    HA = {'id': 'ha', 'name': 'A', 'emoji': '📚', 'startDate': dd(20), 'done': [dd(i) for i in range(5, 9)], 'createdAt': now, 'updatedAt': now}  # Lv.2・最後 dd(5)
    HB = {'id': 'hb', 'name': 'B', 'emoji': '🏃', 'startDate': dd(20), 'done': [dd(i) for i in range(2, 6)], 'createdAt': now, 'updatedAt': now}  # Lv.2・最後 dd(2)
    HC = {'id': 'hc', 'name': 'C', 'emoji': '💧', 'startDate': dd(20), 'done': [dd(1)], 'createdAt': now, 'updatedAt': now}  # Lv.1・最後 dd(1)
    put_habits(tpg, [HA, HB, HC])
    t1 = S(tpg, 'LifePlan.topPomu()')
    check('ぽむ（上部バー）：同じレベルなら最近スタンプした目標', t1['id'] == 'hb' and t1['lv'] == 2 and tpg.get_attribute('#topPomu', 'src') == f"images/monster/{t1['key']}-256.webp", t1)
    HA2 = dict(HA, done=[dd(i) for i in range(5, 13)])  # Lv.3
    put_habits(tpg, [HA2, HB, HC])
    t2 = S(tpg, 'LifePlan.topPomu()')
    check('ぽむ（上部バー）：いちばんレベルの高い目標', t2['id'] == 'ha' and t2['lv'] == 3 and tpg.get_attribute('#topPomu', 'src') == f"images/monster/{t2['key']}-256.webp", t2)
    tc.close()


    # ── v1.3.2：付け忘れをさかのぼって記入・スタンプの色分け ──
    bc = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='ja-JP', timezone_id='Asia/Tokyo', service_workers='block')
    bp = bc.new_page(); bp.on('pageerror', lambda e: errors.append('BACK ' + str(e)))
    bp.goto(URL); wait_idle(bp, 400)
    HN = {'id': 'hback', 'name': '日記を書く', 'emoji': '✍️', 'startDate': TD.isoformat(), 'done': [], 'createdAt': now, 'updatedAt': now}
    put_habits(bp, [HN])
    bp.evaluate("location.hash = '#habits/hback'"); wait_idle(bp, 600); rm_celebrate(bp)
    bh = lambda: S(bp, "LifePlan.state.habits.find(h => h.id === 'hback')")
    check('さかのぼり：付け忘れのヒント', '付け忘れた日は、日付をタップすると〇・×を付けられます' in bp.inner_text('.habit-cal'))
    check('さかのぼり：凡例（できた・できなかった・未記入）', bp.locator('.hc-legend .lg-o').count() == 1 and bp.locator('.hc-legend .lg-x').count() == 1 and 'できなかった' in bp.inner_text('.hc-legend'))
    check('さかのぼり：未来の日は押せない', bp.locator('span.hc-day.future').count() >= 1 and bp.locator('button.hc-day.future').count() == 0) if TD.day < 28 else None
    check('さかのぼり：前の月へ移動できる（開始日が今日でも）', bp.locator('[data-action=habitMonth][data-dir="-1"]').is_enabled())
    # 今月の、開始日より前の日（今日が1日なら前の月に回す）
    if TD.day > 1:
        d1 = dd(1)
        check('さかのぼり：開始日より前の日も押せる', bp.locator(f'button.hc-day.before[data-date="{d1}"]').count() == 1)
        bp.click(f'button.hc-day[data-date="{d1}"]'); wait_idle(bp, 400)
        check('さかのぼり：開始日より前に〇 → 開始日がその日に', d1 in bh()['done'] and bh()['startDate'] == d1, bh()['startDate'])
        bp.click(f'button.hc-day[data-date="{d1}"]'); wait_idle(bp, 300); bp.click(f'button.hc-day[data-date="{d1}"]'); wait_idle(bp, 300)
        check('さかのぼり：取り消しても開始日は戻さない', d1 not in bh()['done'] and d1 not in bh()['missed'] and bh()['startDate'] == d1)
    # 前の月：続けて付ける（ぽむのお祝いは最後の姿で1回だけ）
    bp.evaluate("window.__cele = 0; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.id === 'pomuCelebrate') window.__cele++; }))).observe(document.body, {childList: true})")
    bp.click('[data-action=habitMonth][data-dir="-1"]'); wait_idle(bp, 400)
    pm = (TD.replace(day=1) - datetime.timedelta(days=1))
    pdays = [pm.replace(day=k).isoformat() for k in range(pm.day - 13, pm.day + 1)]
    check('さかのぼり：前の月の日付も押せる', all(bp.locator(f'button.hc-day[data-date="{x}"]').count() == 1 for x in pdays))
    xs = {pdays[4], pdays[9]}
    for x in pdays:
        bp.click(f'button.hc-day[data-date="{x}"]'); bp.wait_for_timeout(120)
        if x in xs: bp.click(f'button.hc-day[data-date="{x}"]'); bp.wait_for_timeout(120)
    h4 = bh()
    check('さかのぼり：前の月に〇と×を記入', all(x in h4['done'] for x in pdays if x not in xs) and all(x in h4['missed'] for x in xs), [h4['done'], h4['missed']])
    check('さかのぼり：開始日はいちばん前の記入日に', h4['startDate'] == pdays[0], h4['startDate'])
    check('さかのぼり：続けて押している間はお祝いを出さない', bp.evaluate('window.__cele') == 0)
    wait_js(bp, "window.__cele > 0", 4000); bp.wait_for_timeout(600)
    info = S(bp, "LifePlan.pomu(LifePlan.state.habits.find(h => h.id === 'hback'))")
    check('さかのぼり：ぽむは記入した日で育つ（累計に入る）', info['total'] == 12 and info['lv'] == 3, info)
    check('さかのぼり：お祝いは最後の姿で1回だけ', bp.evaluate('window.__cele') == 1 and info['key'] in (bp.get_attribute('#pomuCelebrate .pc-img', 'src') or ''), [bp.evaluate('window.__cele'), info['key']])
    bp.wait_for_timeout(4800); rm_celebrate(bp)
    check('さかのぼり：見た姿として記録（あとで二重に出ない）', bh()['seen'] == info['key'] and info['key'] in bh()['unlocked'])
    # 色分け：〇＝緑・×＝青・未記入の×＝薄いグレー
    col = lambda sel, prop: bp.evaluate(f"(() => {{ const e = document.querySelector('{sel}'); return e ? getComputedStyle(e).{prop} : ''; }})()")
    check('色分け：カレンダーの〇は緑', col('.hc-day.done .st-o circle', 'stroke') == 'rgb(63, 166, 107)' and col('.hc-day.done .hc-mark', 'backgroundColor') == 'rgb(230, 244, 234)', col('.hc-day.done .st-o circle', 'stroke'))
    check('色分け：カレンダーの×は青', col('.hc-day.marked-x .st-xm path', 'stroke') == 'rgb(59, 125, 216)' and col('.hc-day.marked-x .hc-mark', 'backgroundColor') == 'rgb(229, 238, 251)')
    check('色分け：未記入の×は薄いグレー', bp.locator('.hc-day.auto-x').count() == 0 or col('.hc-day.auto-x .st-x path', 'stroke') == 'rgb(128, 134, 139)')
    check('色分け：「できた」ボタンは緑・「できなかった」ボタンは青', col('.stamp-big', 'color') == 'rgb(63, 166, 107)' and col('.stamp-miss', 'color') == 'rgb(59, 125, 216)')
    check('色分け：統計（できなかった日）は青', col('.hsm-n', 'color') == 'rgb(59, 125, 216)')
    bp.evaluate("document.querySelector('.habit-cal').scrollIntoView({block: 'start'}); window.scrollBy(0, -70)"); wait_idle(bp, 300)
    shot(bp, 'v132_habit.png')
    bp.evaluate("location.hash = '#home'"); wait_idle(bp, 600); rm_celebrate(bp)
    if bp.locator('.stamp-btn').count(): bp.click('.stamp-btn >> nth=0')
    wait_idle(bp, 500); rm_celebrate(bp)
    check('色分け：ホームの今日のスタンプも緑', bp.locator('.stamp-btn.on').count() == 0 or col('.stamp-btn.on', 'backgroundColor') == 'rgb(230, 244, 234)')
    # 2年より前には戻れない（開始日がそれより新しいとき）
    for _ in range(30):
        b = bp.locator('[data-action=habitMonth][data-dir="-1"]')
        if not b.count(): bp.evaluate("location.hash = '#habits/hback'"); wait_idle(bp, 400); continue
        if not b.is_enabled(): break
        b.click(); bp.wait_for_timeout(60)
    check('さかのぼり：前の月は最大24か月前まで', S(bp, "(() => { const t = new Date(); const m = (t.getFullYear() * 12 + t.getMonth()) - 24; return document.querySelector('.hc-title').textContent.replace(/\\s/g, '') === Math.floor(m / 12) + '.' + (m % 12 + 1); })()"), bp.inner_text('.hc-title'))
    bc.close()
    # ── 3) スワイプでメニュー（右から出る）──
    cdp = ctx.new_cdp_session(pg)
    def swipe(x0, y0, x1, y1, steps=8, ms=16):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
        for k in range(1, steps + 1):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + (x1 - x0) * k / steps, 'y': y0 + (y1 - y0) * k / steps}]}); pg.wait_for_timeout(ms)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(550)
    is_open = lambda: pg.evaluate("document.body.classList.contains('drawer-open')")
    pg.evaluate("location.hash = '#home'"); wait_idle(pg, 600); pg.evaluate('window.scrollTo(0,0)')
    swipe(340, 520, 110, 528)
    db = pg.locator('#drawer').bounding_box()
    check('スワイプ：右から左へなぞるとメニューが開く', is_open() and pg.is_visible('#drawerBackdrop'))
    check('スワイプ：メニューは右側から出る', db and abs(db['x'] + db['width'] - 390) <= 2 and db['x'] > 30, db)
    check('メニュー：「アップデート」ボタン', pg.locator('#drawer [data-action=forceUpdate]').is_visible() and 'アップデート' in pg.inner_text('#drawer [data-action=forceUpdate]') and '1.4.0' in pg.inner_text('#drawer [data-action=forceUpdate]'))
    shot(pg, 'v131_menu.png')
    swipe(90, 500, 330, 505)
    check('スワイプ：左から右へで閉じる', not is_open())
    swipe(200, 650, 215, 300)
    check('スワイプ：縦のスクロールでは開かない', not is_open())
    swipe(340, 520, 300, 522, steps=30, ms=25)
    check('スワイプ：短いなぞりでは開かない', not is_open())
    pg.evaluate("""(() => { const d = document.createElement('div'); d.id = 'hscroll'; d.style.cssText = 'overflow-x:auto;width:300px;height:80px;position:fixed;top:300px;left:40px;z-index:50;background:#eee'; d.innerHTML = '<div style="width:1200px;height:60px">横スクロール</div>'; document.body.appendChild(d); })()""")
    swipe(320, 340, 80, 342)
    check('スワイプ：横スクロールする場所では開かない', not is_open())
    pg.evaluate("document.getElementById('hscroll').remove()")
    pg.evaluate("location.hash = '#journal'"); wait_idle(pg, 500)
    sb = pg.locator('[data-input=journalSearch]').bounding_box()
    swipe(sb['x'] + sb['width'] - 20, sb['y'] + sb['height'] / 2, sb['x'] + 30, sb['y'] + sb['height'] / 2 + 2)
    check('スワイプ：入力欄から始めたときは開かない', not is_open())
    pg.click('#menuBtn'); wait_idle(pg, 550)
    check('スワイプ：☰ ボタンでも開ける', is_open())
    pg.mouse.click(20, 400); wait_idle(pg, 500)
    check('スワイプ：背景タップで閉じる', not is_open())
    pg.evaluate(f"location.hash = '#habits/{hid}'"); wait_idle(pg, 600); rm_celebrate()
    before = hb()['done'][:]
    pg.locator('button.hc-day.today').tap(); wait_idle(pg, 600); rm_celebrate()
    after = hb()
    check('スワイプ：カレンダーのタップは今まで通り', (TD.isoformat() in before) != (TD.isoformat() in after['done']) or TD.isoformat() in after['missed'])
    while TD.isoformat() not in hb()['done']:
        pg.locator('button.hc-day.today').click(); wait_idle(pg, 450); rm_celebrate()

    # ── 5) ジャーナル：日付ごとに折りたたみ・写真 ──
    pg.reload(); wait_idle(pg, 800)
    pg.evaluate("location.hash = '#journal'"); wait_idle(pg, 700)
    nd = pg.locator('#journalList .jday').count()
    check('ジャーナル：日付ごとにまとめる', nd >= 2 and pg.locator('#journalList .jday-head').count() == nd, nd)
    check('ジャーナル：最初はすべて折りたたみ', pg.locator('#journalList .jday.open').count() == 0 and pg.evaluate("[...document.querySelectorAll('.jday-body')].every(b => b.getBoundingClientRect().height < 2)"))
    h0 = pg.inner_text('#journalList .jday-head >> nth=0')
    check('ジャーナル：見出しに日付・件数・1行のプレビュー', '件' in h0 and pg.locator('#journalList .jday-head >> nth=0 >> .jd-preview').inner_text().strip() != '' and pg.evaluate("(() => { const p = document.querySelector('.jd-preview'); return getComputedStyle(p).whiteSpace === 'nowrap' && getComputedStyle(p).textOverflow === 'ellipsis'; })()"), h0)
    pg.click('#journalList .jday-head >> nth=0'); wait_idle(pg, 600)
    check('ジャーナル：タップで開く（アニメーション）', pg.locator('#journalList .jday.open').count() == 1 and pg.get_attribute('#journalList .jday-head >> nth=0', 'aria-expanded') == 'true' and pg.evaluate("document.querySelector('.jday.open .jday-body').getBoundingClientRect().height > 40") and 'grid-template-rows' in pg.evaluate("getComputedStyle(document.querySelector('.jday-body')).transitionProperty"))
    pg.click('#journalList .jday-head >> nth=0'); wait_idle(pg, 600)
    check('ジャーナル：もう一度タップで閉じる', pg.locator('#journalList .jday.open').count() == 0)
    # 写真を追加
    def mkjpg(w, h, color):
        im = Image.new('RGB', (w, h), color)
        from PIL import ImageDraw
        dr = ImageDraw.Draw(im); dr.ellipse((w * .2, h * .2, w * .8, h * .8), fill=(255, 255, 255)); dr.rectangle((0, 0, w // 3, h // 6), fill=(30, 30, 30))
        b = io.BytesIO(); im.save(b, 'JPEG', quality=90); return b.getvalue()
    p1 = mkjpg(2400, 1600, (236, 143, 134)); p2 = mkjpg(1200, 1800, (111, 167, 176)); p3 = mkjpg(900, 900, (214, 169, 63))
    pg.click('.view-head [data-action=editJournal]'); wait_idle(pg, 400)
    check('写真：編集画面に「写真を追加」', pg.locator('#modal #jPhotoInput').count() == 1 and pg.get_attribute('#modal #jPhotoInput', 'accept') == 'image/*' and pg.get_attribute('#modal #jPhotoInput', 'multiple') is not None)
    pg.fill('#modal textarea[name=text]', '公園で散歩。写真つきのテスト日記')
    pg.fill('#modal input[name=date]', dd(2))
    pg.set_input_files('#modal #jPhotoInput', files=[{'name': 'p1.jpg', 'mimeType': 'image/jpeg', 'buffer': p1}, {'name': 'p2.jpg', 'mimeType': 'image/jpeg', 'buffer': p2}])
    wait_js(pg, "document.querySelectorAll('#jPhotoBox .j-photo img[src]').length === 2")
    check('写真：サムネイルを表示', pg.locator('#jPhotoBox .j-photo img[src^="blob:"]').count() == 2 and '2枚' in pg.inner_text('#jPhotoCount'))
    pg.click('#modal button[type=submit]'); wait_idle(pg, 700)
    je = S(pg, "LifePlan.state.journal.find(e => e.text.includes('写真つきのテスト日記'))")
    pids = je['photos'] if je else []
    check('写真：ジャーナルには写真の id だけを保存', len(pids) == 2 and all(re.match(r'^[A-Za-z0-9_-]{6,64}$', x) for x in pids), pids)
    lsv = pg.evaluate("localStorage.getItem('lifeplan.v1')")
    check('写真：localStorage に画像データは入らない', 'data:image' not in lsv and 'base64' not in lsv and len(lsv) < 200000)
    dims = [pg.evaluate("(id) => LifePlan.photoDims(id)", x) for x in pids]
    check('写真：長い辺 1280px に縮小（JPEG）して IndexedDB に保存', dims[0] and max(dims[0][:2]) == 1280 and dims[0][0] > dims[0][1] and dims[1] and max(dims[1][:2]) == 1280 and dims[1][1] > dims[1][0] and all(d[2] < 400000 for d in dims), dims)
    check('写真：保存した日付は開いた状態で、サムネイルが出る', pg.locator(f'.jday.open .j-photo img[data-photo="{pids[0]}"][src]').count() == 1 and pg.locator('.jday.open .j-photo img[src]').count() >= 2)
    check('写真：選んだ日付のグループに入る', je['date'] == dd(2))
    pg.evaluate(f"(() => {{ const g = document.querySelector('.jday[data-date=\"{dd(2)}\"]'); window.scrollBy(0, g.getBoundingClientRect().top - 330); }})()"); wait_idle(pg, 400)
    shot(pg, 'v131_journal.png')
    pg.click(f'.jday.open .j-photo-view[data-photo-id="{pids[0]}"]'); wait_idle(pg, 500)
    check('写真：タップで大きく表示', pg.locator('#photoViewer').count() == 1 and pg.evaluate("(() => { const i = document.querySelector('#photoViewer .pv-img'); return i && i.complete && i.naturalWidth === 1280; })()"))
    shot(pg, 'v131_photo_view.png')
    pg.click('#photoViewer [data-pv=close]'); wait_idle(pg, 400)
    check('写真：閉じる', pg.locator('#photoViewer').count() == 0)
    # GitHub（非公開データリポジトリ）に1枚ずつ保存
    pg.evaluate('LifePlan.syncNow()')
    for _ in range(30):
        if all(f'data/photos/{x}.jpg' in gh.bins for x in pids): break
        pg.wait_for_timeout(300)
    check('写真：GitHub の data/photos/<id>.jpg に保存', all(f'data/photos/{x}.jpg' in gh.bins and gh.bins[f'data/photos/{x}.jpg'][0][:2] == b'\xff\xd8' for x in pids), list(gh.bins))
    rem = gh.get_json('data/life-plan.json')
    rj = next((e for e in rem['data']['journal'] if e['id'] == je['id']), {})
    check('写真：同期データ（JSON）には id だけ', rj.get('photos') == pids and 'base64' not in json.dumps(rem) and '/9j/' not in json.dumps(rem))
    pg.wait_for_timeout(400)
    check('写真：送信済みの印', all(pg.evaluate("(id) => LifePlan.photoInfo(id)", x)['synced'] for x in pids))
    # 編集：外してキャンセルなら残る／追加してキャンセルなら消える
    n_idb = len(pg.evaluate('LifePlan.photoIds()'))
    pg.click(f'.jday.open article.journal[data-id="{je["id"]}"] .journal-head'); wait_idle(pg, 500)
    check('写真：編集画面に保存済みの写真', pg.locator('#jPhotoBox .j-photo').count() == 2)
    pg.click(f'#jPhotoBox .j-photo-del[data-photo-id="{pids[1]}"]'); wait_idle(pg, 200)
    pg.set_input_files('#modal #jPhotoInput', files=[{'name': 'p3.jpg', 'mimeType': 'image/jpeg', 'buffer': p3}])
    wait_js(pg, "document.querySelectorAll('#jPhotoBox .j-photo img[src]').length === 2")
    pg.click('#modal [data-action=closeModal] >> nth=-1'); wait_idle(pg, 500)
    check('写真：キャンセルすると元のまま（追加分は破棄）', S(pg, f"LifePlan.state.journal.find(e => e.id === '{je['id']}').photos") == pids and len(pg.evaluate('LifePlan.photoIds()')) == n_idb)
    # 別の端末：id だけ届いて、写真は GitHub から読み込む
    oc = browser.new_context(viewport={'width': 390, 'height': 844}, locale='ja-JP', timezone_id='Asia/Tokyo', service_workers='block')
    oc.route('https://api.github.com/**', gh.handle)
    op = oc.new_page(); op.on('pageerror', lambda e: errors.append('OTHER ' + str(e)))
    op.goto(URL); wait_idle(op, 300)
    op.evaluate("localStorage.setItem('lifeplan.sync', JSON.stringify({owner: '100nao', repo: 'life-plan-data', branch: 'main', path: 'data/life-plan.json', inboxPath: 'data/coach-inbox.json', token: 'github_pat_TEST', auto: true, connected: true}))")
    op.reload(); wait_idle(op, 1500)
    for _ in range(30):
        if all(x in op.evaluate('LifePlan.photoIds()') for x in pids): break
        op.wait_for_timeout(300)
    check('写真（別の端末）：GitHub から写真を読み込む', all(x in op.evaluate('LifePlan.photoIds()') for x in pids))
    op.evaluate("location.hash = '#journal'"); wait_idle(op, 600)
    jd = je['date']
    op.click(f'.jday[data-date="{jd}"] .jday-head'); wait_idle(op, 800)
    check('写真（別の端末）：サムネイルが表示される', op.evaluate(f"[...document.querySelectorAll('.jday.open .j-photo img')].filter(i => ['{pids[0]}','{pids[1]}'].includes(i.dataset.photo)).every(i => i.complete && i.naturalWidth > 0)") and op.locator('.jday.open .j-photo img[src]').count() >= 2)
    # 公開リポジトリには写真を保存しない
    gh.private = False
    op.evaluate("localStorage.removeItem('lifeplan.photoSync')"); op.reload(); wait_idle(op, 1200)
    op.evaluate("location.hash = '#journal'"); wait_idle(op, 400)
    op.click('.view-head [data-action=editJournal]'); wait_idle(op, 400)
    op.fill('#modal textarea[name=text]', '公開リポジトリのテスト')
    op.set_input_files('#modal #jPhotoInput', files=[{'name': 'p3.jpg', 'mimeType': 'image/jpeg', 'buffer': p3}])
    wait_js(op, "document.querySelectorAll('#jPhotoBox .j-photo img[src]').length === 1")
    op.click('#modal button[type=submit]'); wait_idle(op, 500)
    nb = len(gh.bins)
    rr = op.evaluate('LifePlan.syncPhotos()')
    check('写真：公開リポジトリには保存しない', len(gh.bins) == nb and '公開リポジトリ' in (rr.get('error') or ''), rr)
    gh.private = True
    # 削除（確認つき・元に戻せる・GitHub からも消える）
    pg.click(f'.jday.open .j-photo-view[data-photo-id="{pids[1]}"]'); wait_idle(pg, 500)
    pg.click('#photoViewer [data-pv=del]'); wait_idle(pg, 400)
    check('写真：削除の確認', '削除しますか' in pg.inner_text('#modal'))
    pg.click('#confirmOk'); wait_idle(pg, 500)
    check('写真：ジャーナルから外れる', S(pg, f"LifePlan.state.journal.find(e => e.id === '{je['id']}').photos") == [pids[0]] and S(pg, f"!!LifePlan.state.deleted['photo:{pids[1]}']"))
    pg.click('#toast .toast-btn'); wait_idle(pg, 500)
    check('写真：元に戻せる', S(pg, f"LifePlan.state.journal.find(e => e.id === '{je['id']}').photos") == pids and not S(pg, f"!!LifePlan.state.deleted['photo:{pids[1]}']"))
    pg.click(f'.jday.open .j-photo-view[data-photo-id="{pids[1]}"]'); wait_idle(pg, 500)
    pg.click('#photoViewer [data-pv=del]'); wait_idle(pg, 400); pg.click('#confirmOk'); wait_idle(pg, 500)
    pg.evaluate('LifePlan.syncNow().then(() => LifePlan.syncPhotos())'); pg.wait_for_timeout(1500)
    check('写真：削除してすぐは（元に戻せるよう）残しておく', f'data/photos/{pids[1]}.jpg' in gh.bins and pids[1] in pg.evaluate('LifePlan.photoIds()'))
    TT = "window.__realNow = window.__realNow || Date.now; Date.now = () => window.__realNow.call(Date) + 180000"  # 猶予（2分）を過ぎたことにする
    pg.evaluate(TT); pg.evaluate('LifePlan.syncPhotos()'); pg.wait_for_timeout(800)
    check('写真：削除は GitHub と端末からも消える', f'data/photos/{pids[1]}.jpg' not in gh.bins and f'data/photos/{pids[0]}.jpg' in gh.bins and pids[1] not in pg.evaluate('LifePlan.photoIds()'), [list(gh.bins), gh.deletes])
    pg.evaluate("Date.now = window.__realNow")
    op.evaluate('LifePlan.syncNow()'); op.wait_for_timeout(1200); op.evaluate(TT); op.evaluate('LifePlan.syncPhotos()'); op.wait_for_timeout(800)
    check('写真（別の端末）：削除が伝わる', pids[1] not in op.evaluate('LifePlan.photoIds()') and pids[1] not in S(op, f"LifePlan.state.journal.find(e => e.id === '{je['id']}').photos"))
    oc.close()
    # 古いジャーナル（photos なし）も読める
    check('写真：古いジャーナルは photos が空配列', S(pg, "LifePlan.state.journal.every(e => Array.isArray(e.photos))"))
    # ホームの最近のジャーナルもそのまま
    pg.evaluate("location.hash = '#home'"); wait_idle(pg, 500)
    # ── v1.4.0：Gemini の毎日の分析・🤖 AI提案（別画面）──
    ac = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='ja-JP', timezone_id='Asia/Tokyo', service_workers='block')
    ac.route('https://generativelanguage.googleapis.com/**', gem.handle)
    ap = ac.new_page(); ap.on('pageerror', lambda e: errors.append('ANA ' + str(e)))
    ap.goto(URL); wait_idle(ap, 500)
    seed = {'items': [
        {'id': 'eng', 'list': 'task', 'title': '英会話の体験レッスン', 'quadrant': 'q2', 'status': 'doing', 'steps': [{'text': '候補を探す'}], 'createdAt': '2026-10-01T00:00:00.000Z', 'updatedAt': '2026-10-01T00:00:00.000Z', 'lastProgressAt': '2026-10-01T00:00:00.000Z'},
        {'id': 'pp', 'list': 'task', 'title': 'パスポート申請', 'quadrant': 'q1', 'createdAt': now, 'updatedAt': now}],
        'journal': [{'id': 'j1', 'date': TD.isoformat(), 'text': '今日は英会話のことを考えた。テスト用の日記。', 'mood': 4, 'createdAt': now, 'updatedAt': now}],
        'habits': [{'id': 'hd', 'name': '日記を書く', 'emoji': '✍️', 'startDate': dd(1) if TD.day > 1 else TD.isoformat(), 'done': [TD.isoformat()], 'createdAt': now, 'updatedAt': now}],
        'lessons': [{'id': 'l1', 'name': 'ピアノ', 'status': 'active', 'createdAt': now, 'updatedAt': now}]}
    ap.evaluate(f"localStorage.setItem('lifeplan.v1', JSON.stringify({json.dumps(seed, ensure_ascii=False)}))")
    # 毎日の自動分析：オフなら呼ばない
    ap.evaluate(f"localStorage.setItem('lifeplan.ai', JSON.stringify({{key: '{GKEY}', model: 'gemini-2.5-flash', share: true, mv: 2, daily: false}}))")
    gem.ana_mode = 'json'; gem.ana_json = ANA_JSON
    na = len(gem.ana_reqs)
    ap.reload(); wait_idle(ap, 2200)
    check('分析：自動分析オフなら呼ばない', len(gem.ana_reqs) == na and S(ap, 'LifePlan.state.aiAnalyses.length') == 0)
    check('分析：ホームに案内カード', ap.locator('#anaCard').count() == 1 and '自動分析はオフ' in ap.inner_text('#anaCard'))
    # 設定でオン → その場で分析
    ap.evaluate("location.hash = '#settings'"); wait_idle(ap, 500)
    check('設定：「毎日の自動分析」「AI提案を自動で自分のリストに移す」', ap.locator('[data-change=aiDaily]').count() == 1 and ap.locator('[data-change=aiAutoMove]').count() == 1
          and not ap.locator('[data-change=aiDaily]').is_checked() and not ap.locator('[data-change=aiAutoMove]').is_checked() and 'AI提案を自動で自分のリストに移す' in ap.inner_text('.ai-daily-set'))
    ap.locator('[data-change=aiDaily]').check(); wait_js(ap, "LifePlan.state.aiAnalyses.length === 1", 8000)
    check('設定：オンにすると分析が走る', len(gem.ana_reqs) == na + 1 and json.loads(ap.evaluate("localStorage.getItem('lifeplan.ai')"))['daily'] is True)
    rq = gem.reqs[-1]; body = gem.ana_reqs[-1]; sent = json.dumps(body, ensure_ascii=False)
    check('分析：キーはヘッダーのみ（Google の API だけ）', rq[1].get('x-goog-api-key') == GKEY and GKEY not in sent and GKEY not in rq[0] and rq[0].startswith('https://generativelanguage.googleapis.com/'))
    check('分析：要約を送る（タスク・日記・習慣・習い事）', all(w in sent for w in ['英会話の体験レッスン', 'テスト用の日記', '日記を書く', 'ピアノ']) and 'inline_data' not in sent and 'inlineData' not in sent)
    check('分析：JSON 指定・thinking low', body.get('generationConfig', {}).get('responseMimeType') == 'application/json' and 'low' in json.dumps(body.get('generationConfig', {})).lower(), json.dumps(body.get('generationConfig', {}))[:200])
    check('分析：送る量は控えめ（6000字以下）', len(body['contents'][-1]['parts'][0]['text']) < 6000)
    an = S(ap, 'LifePlan.state.aiAnalyses[0]')
    check('分析：1日1件の記録（id=ana:日付）', an['id'] == 'ana:' + TD.isoformat() and an['parsed'] is True and len(an['insights']) == 3)
    sg = S(ap, 'LifePlan.state.aiSuggestions')
    check('AI提案：最大3件＋既存タスクと重複しない', len(sg) == 2 and all(s['title'] != '英会話の体験レッスン' for s in sg) and all(s['title'] != '4件目は入らない' for s in sg), [s['title'] for s in sg])
    check('AI提案：不正な象限は q2', next(s for s in sg if s['title'] == 'パスポートの写真を撮る')['quadrant'] == 'q2')
    check('AI提案：自分のタスクには入らない', S(ap, 'LifePlan.state.items.length') == 2 and all(s['status'] == 'open' and s['source'] == 'gemini' for s in sg))
    ap.evaluate("location.hash = '#home'"); wait_idle(ap, 500)
    hc = ap.inner_text('#anaCard')
    check('ホーム：要約・気づき・プレビュー・「AI提案を見る（2件）」', '英会話が2週間止まっています' in hc and ap.locator('#anaCard .ana-insights li').count() == 3 and ap.locator('#anaCard .ana-preview li').count() == 2 and 'AI提案を見る（2件）' in hc)
    check('ホーム：追加ボタンは置かない', ap.locator('#anaCard [data-action=aiSugMove]').count() == 0 and ap.locator('#anaCard [data-action=aiSugMoveAll]').count() == 0)
    check('ホーム：もう一度分析（あと3回）', 'あと3回' in ap.inner_text('#anaCard [data-action=anaRerun]'))
    ap.evaluate('window.scrollTo(0,0)'); wait_idle(ap, 200)
    shot(ap, 'v140_home_analysis.png')
    # 1日1回：開き直しても呼ばない
    ap.reload(); wait_idle(ap, 2200)
    check('分析：同じ日に開き直しても再分析しない', len(gem.ana_reqs) == na + 1 and S(ap, 'LifePlan.aiDaily().autoDate') == TD.isoformat())
    ap.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); wait_idle(ap, 1200)
    check('分析：画面に戻っても再分析しない', len(gem.ana_reqs) == na + 1)
    # たたむ
    ap.click('[data-action=anaCollapse]'); wait_idle(ap, 200)
    check('ホーム：分析カードをたためる', ap.locator('#anaCard.collapsed').count() == 1 and ap.locator('#anaCard .ana-summary').count() == 0 and ap.locator('#anaCard .ana-link').count() == 1)
    ap.reload(); wait_idle(ap, 600)
    check('ホーム：たたんだ状態を覚える', ap.locator('#anaCard.collapsed').count() == 1)
    ap.click('[data-action=anaCollapse]'); wait_idle(ap, 200)
    # 解析：コードフェンス・壊れた応答
    pf = ap.evaluate("LifePlan.parseAnalysis('はい\\n```json\\n' + JSON.stringify({summary: 'S', insights: ['a'], taskSuggestions: [{title: 'T', quadrant: 'q3', steps: ['s1']}]}) + '\\n```')")
    check('解析：コードフェンス付き JSON', pf['ok'] and pf['summary'] == 'S' and pf['suggestions'][0]['quadrant'] == 'q3' and pf['suggestions'][0]['steps'] == ['s1'], pf)
    pgb = ap.evaluate("LifePlan.parseAnalysis('ただの文章です。JSONではありません')")
    check('解析：壊れた応答は要約だけ', not pgb['ok'] and 'ただの文章' in pgb['summary'] and pgb['suggestions'] == [], pgb)
    # もう一度分析（1日3回まで）：壊れた応答 → 要約だけ表示
    gem.ana_mode = 'garbage'
    ap.click('#anaCard [data-action=anaRerun]'); wait_js(ap, "!LifePlan.aiDaily().busy && LifePlan.aiDaily().manualLeft === 2", 8000); wait_idle(ap, 300)
    check('もう一度分析：壊れた応答でも落ちず要約を表示', 'うまく整理できませんでした' in ap.inner_text('#anaCard') and S(ap, 'LifePlan.state.aiAnalyses.length') == 1 and S(ap, 'LifePlan.state.aiAnalyses[0].runs') == 2)
    check('もう一度分析：提案は消えない', S(ap, "LifePlan.state.aiSuggestions.filter(s => s.status === 'open').length") == 2)
    gem.ana_mode = 'fenced'
    ap.click('#anaCard [data-action=anaRerun]'); wait_js(ap, "!LifePlan.aiDaily().busy && LifePlan.aiDaily().manualLeft === 1", 8000); wait_idle(ap, 300)
    check('もう一度分析：フェンス付き JSON も読める・提案は重複しない', '英会話が2週間止まっています' in ap.inner_text('#anaCard') and S(ap, 'LifePlan.state.aiSuggestions.length') == 2)
    ap.click('#anaCard [data-action=anaRerun]'); wait_js(ap, "!LifePlan.aiDaily().busy && LifePlan.aiDaily().manualLeft === 0", 8000); wait_idle(ap, 300)
    n3 = len(gem.ana_reqs)
    check('もう一度分析：3回使うとボタンが押せない', ap.locator('#anaCard [data-action=anaRerun]').is_disabled() and 'あと0回' in ap.inner_text('#anaCard'))
    ap.evaluate('LifePlan.runAnalysis()'); wait_idle(ap, 500)
    check('もう一度分析：4回目は呼ばない', len(gem.ana_reqs) == n3 and '3回まで' in ap.inner_text('#toast'))
    # 🤖 AI提案の画面
    ap.evaluate("location.hash = '#home'"); wait_idle(ap, 300)
    ap.click('#anaCard .ana-link'); wait_idle(ap, 500)
    check('AI提案：ホームからリンクで開く', S(ap, 'location.hash') == '#aisuggest' and ap.locator('.sug-card').count() == 2 and '🤖 AI提案' in ap.inner_text('#main'))
    ap.click('#menuBtn'); wait_idle(ap, 400)
    check('メニュー：AI提案（件数バッジ）', ap.locator('#drawer a[href="#aisuggest"]').count() == 1 and ap.inner_text('#drawer a[href="#aisuggest"] .sug-badge') == '2')
    ap.mouse.click(20, 400); wait_idle(ap, 500)
    check('メニュー：閉じる', not ap.evaluate("document.body.classList.contains('drawer-open')"))
    sid = next(s['id'] for s in S(ap, 'LifePlan.state.aiSuggestions') if s['title'].startswith('オンライン英会話'))
    card = ap.locator(f'.sug-card[data-sug="{sid}"]')
    card.locator('details.sug-more summary').click(); wait_idle(ap, 200)
    check('AI提案：理由とステップを開ける', '15分の体験' in card.inner_text() and card.locator('.sug-steps li').count() == 3)
    ap.evaluate('window.scrollTo(0,0)'); shot(ap, 'v140_ai_screen.png')
    # 象限を変えてから移す
    card.locator('select[data-change=aiSugQuadrant]').select_option('q1'); wait_idle(ap, 300)
    check('AI提案：移す前に象限を変えられる', S(ap, f"LifePlan.state.aiSuggestions.find(s => s.id === '{sid}').quadrant") == 'q1')
    ap.click(f'.sug-card[data-sug="{sid}"] [data-action=aiSugMove]'); wait_idle(ap, 400)
    it = S(ap, "LifePlan.state.items.find(i => i.title === 'オンライン英会話の無料体験を予約する')")
    check('→ 自分のリストへ：タスク（象限・ステップ・AI由来）', it and it['list'] == 'task' and it['quadrant'] == 'q1' and [x['text'] for x in it['steps']] == ['サービスを2つ比べる', '体験枠を予約する', '前日にアプリを入れる'] and it['source'] == 'ai' and it['sourceKey'] == sid, it)
    check('→ 自分のリストへ：提案は「移動済み」', S(ap, f"LifePlan.state.aiSuggestions.find(s => s.id === '{sid}').status") == 'moved' and ap.locator(f'.sug-card[data-sug="{sid}"]').count() == 0)
    ap.click('#toast .toast-btn'); wait_idle(ap, 400)
    check('→ 自分のリストへ：元に戻せる', not S(ap, "LifePlan.state.items.some(i => i.title === 'オンライン英会話の無料体験を予約する')") and S(ap, f"LifePlan.state.aiSuggestions.find(s => s.id === '{sid}').status") == 'open')
    ap.click(f'.sug-card[data-sug="{sid}"] [data-action=aiSugMove]'); wait_idle(ap, 400)
    ap.evaluate(f"location.hash = '#item/' + LifePlan.state.items.find(i => i.sourceKey === '{sid}').id"); wait_idle(ap, 400)
    check('移したタスク：「🤖 AI提案から」', 'AI提案から' in ap.inner_text('#main'))
    ap.evaluate("location.hash = '#aisuggest'"); wait_idle(ap, 400)
    pid2 = next(s['id'] for s in S(ap, 'LifePlan.state.aiSuggestions') if s['title'] == 'パスポートの写真を撮る')
    ap.click(f'.sug-card[data-sug="{pid2}"] [data-action=aiSugDismiss]'); wait_idle(ap, 400)
    check('× 見送り', S(ap, f"LifePlan.state.aiSuggestions.find(s => s.id === '{pid2}').status") == 'dismissed' and ap.locator('.sug-card').count() == 0 and S(ap, 'LifePlan.state.items.length') == 3)
    ap.click('#toast .toast-btn'); wait_idle(ap, 400)
    check('× 見送り：元に戻せる', S(ap, f"LifePlan.state.aiSuggestions.find(s => s.id === '{pid2}').status") == 'open' and ap.locator('.sug-card').count() == 1)
    ap.click(f'.sug-card[data-sug="{pid2}"] [data-action=aiSugDismiss]'); wait_idle(ap, 400)
    check('これまでの提案（移動済み・見送り）', '移動済み' in ap.text_content('.sug-past') and '見送り' in ap.text_content('.sug-past'))
    ap.click('.sug-past summary'); ap.click(f'.sug-past [data-action=aiSugReopen][data-id="{pid2}"]'); wait_idle(ap, 400)
    check('見送りを戻せる', ap.locator('.sug-card').count() == 1)
    # すべて移動
    ap.evaluate("(() => { const s = LifePlan.state.aiSuggestions; s.push({...s[0], id: 'extra1', title: '追加の提案', status: 'open', quadrant: 'q3', steps: []}); localStorage.setItem('lifeplan.v1', JSON.stringify(LifePlan.state)); })()"); ap.reload(); wait_idle(ap, 600)
    ap.click('[data-action=aiSugMoveAll]'); wait_idle(ap, 400)
    check('すべて移動', S(ap, "LifePlan.state.aiSuggestions.filter(s => s.status === 'open').length") == 0 and S(ap, "LifePlan.state.items.filter(i => i.source === 'ai').length") == 3 and S(ap, "LifePlan.state.items.find(i => i.title === '追加の提案').quadrant") == 'q3')
    ap.click('#toast .toast-btn'); wait_idle(ap, 400)
    check('すべて移動：元に戻せる', S(ap, "LifePlan.state.items.filter(i => i.source === 'ai').length") == 1 and S(ap, "LifePlan.state.aiSuggestions.filter(s => s.status === 'open').length") == 2)
    ac.close()

    # 自動で自分のリストに移す（オン → 元に戻す／オフ）
    xc = browser.new_context(viewport={'width': 390, 'height': 844}, locale='ja-JP', timezone_id='Asia/Tokyo', service_workers='block')
    xc.route('https://generativelanguage.googleapis.com/**', gem.handle)
    xp = xc.new_page(); xp.on('pageerror', lambda e: errors.append('AUTO ' + str(e)))
    xp.goto(URL); wait_idle(xp, 400)
    xp.evaluate(f"localStorage.setItem('lifeplan.v1', JSON.stringify({json.dumps(seed, ensure_ascii=False)}))")
    xp.evaluate(f"localStorage.setItem('lifeplan.ai', JSON.stringify({{key: '{GKEY}', model: 'gemini-2.5-flash', share: true, mv: 2, autoMove: true}}))")
    gem.ana_mode = 'json'; na = len(gem.ana_reqs)
    xp.reload(); wait_js(xp, "LifePlan.state.aiAnalyses.length === 1 && LifePlan.state.items.length === 4", 8000); wait_idle(xp, 300)
    check('自動移動オン：毎日の分析（初回起動で1回）', len(gem.ana_reqs) == na + 1)
    check('自動移動オン：提案が自分のリストへ（象限・ステップ）', S(xp, "LifePlan.state.items.filter(i => i.source === 'ai').length") == 2 and S(xp, "LifePlan.state.aiSuggestions.every(s => s.status === 'moved' && s.auto)")
          and S(xp, "LifePlan.state.items.find(i => i.title === 'パスポートの写真を撮る').steps.length") == 1)
    check('自動移動オン：お知らせ＋元に戻す', 'AIが 2件 を自分のリストに移しました' in xp.inner_text('#toast'))
    xp.click('#toast .toast-btn'); wait_idle(xp, 400)
    check('自動移動：元に戻すとAI提案に残る', S(xp, "LifePlan.state.items.filter(i => i.source === 'ai').length") == 0 and S(xp, "LifePlan.state.aiSuggestions.filter(s => s.status === 'open').length") == 2 and S(xp, 'LifePlan.state.aiAnalyses.length') == 1)
    xp.evaluate("location.hash = '#settings'"); wait_idle(xp, 400)
    check('設定：自動移動オンが表示される', xp.locator('[data-change=aiAutoMove]').is_checked())
    xp.locator('[data-change=aiAutoMove]').uncheck(); wait_idle(xp, 300)
    check('設定：自動移動オフを保存', json.loads(xp.evaluate("localStorage.getItem('lifeplan.ai')"))['autoMove'] is False)
    xp.evaluate("(() => { const d = JSON.parse(localStorage.getItem('lifeplan.aiDaily')); d.runs = 0; localStorage.setItem('lifeplan.aiDaily', JSON.stringify(d)); })()")
    gem.ana_json = {'summary': '別の日の分析', 'insights': [], 'taskSuggestions': [{'title': '歯医者に電話する', 'quadrant': 'q1', 'why': '', 'steps': []}]}
    xp.reload(); wait_idle(xp, 500); xp.evaluate("location.hash = '#home'"); wait_idle(xp, 300)
    xp.click('#anaCard [data-action=anaRerun]'); wait_js(xp, "LifePlan.state.aiSuggestions.length === 3", 8000); wait_idle(xp, 300)
    check('自動移動オフ：AI提案に並ぶだけ', S(xp, "LifePlan.state.items.filter(i => i.source === 'ai').length") == 0 and S(xp, "LifePlan.state.aiSuggestions.find(s => s.title === '歯医者に電話する').status") == 'open')
    gem.ana_json = ANA_JSON
    xc.close()

    # コーチ受信箱の taskSuggestions（同期で取り込み → AI提案へ）
    inbox2 = json.loads(gh.files['data/coach-inbox.json'][0])
    inbox2['messages'].append({'id': '2026-11-02-t', 'date': TD.isoformat(), 'title': '今週の提案', 'text': '止まっているものを小さく動かしましょう。',
        'taskSuggestions': [{'title': '区役所の受付時間を調べる', 'quadrant': 'q1', 'why': 'パスポート申請の前に。', 'steps': ['サイトを見る', 'カレンダーに入れる']},
                            {'title': '本棚を片付ける', 'quadrant': 'q4', 'why': '気分転換に。', 'steps': []}]})
    inbox2['messages'].append({'id': '2026-11-02-u', 'date': TD.isoformat(), 'taskSuggestions': [{'title': '週末の散歩コースを決める', 'quadrant': 'q2', 'why': '', 'steps': ['地図を見る']}]})
    gh.set('data/coach-inbox.json', json.dumps(inbox2, ensure_ascii=False))
    nit = S(pg, 'LifePlan.state.items.length')
    pg.evaluate("location.hash = '#home'"); pg.evaluate('LifePlan.syncNow()'); wait_js(pg, "LifePlan.state.aiSuggestions.filter(s => s.source === 'coach').length === 3", 10000); wait_idle(pg, 500)
    cs = S(pg, "LifePlan.state.aiSuggestions.filter(s => s.source === 'coach')")
    check('コーチ：taskSuggestions は AI提案へ（自分のタスクには入らない）', len(cs) == 3 and S(pg, 'LifePlan.state.items.length') == nit and all(s['status'] == 'open' for s in cs))
    check('コーチ：id は決まった形（端末間で同じ）', all(s['id'].startswith('sug:coach:') for s in cs) and any(s['id'] == 'sug:coach:2026-11-02-t:0' for s in cs), [s['id'] for s in cs])
    check('コーチ：taskSuggestions だけのメッセージも受け取る', S(pg, "LifePlan.state.coachNotes.find(c => c.id === 'coach:2026-11-02-u').title") == 'タスクの提案')
    check('コーチ：アドバイスに「AI提案に n件」', pg.locator('.coach-new').count() == 1 and 'AI提案に 2件' in pg.inner_text('.coach-new'))
    pg.evaluate("document.querySelector('.coach-new').scrollIntoView({block: 'start'})"); wait_idle(pg, 200)
    shot(pg, 'v140_coach.png')
    pg.evaluate("LifePlan.syncNow()"); wait_idle(pg, 1500)
    check('コーチ：もう一度読んでも重複しない', S(pg, "LifePlan.state.aiSuggestions.filter(s => s.source === 'coach').length") == 3)
    pg.evaluate("location.hash = '#aisuggest'"); wait_idle(pg, 500)
    check('コーチ：AI提案の画面に出る（コーチ印）', pg.locator('.sug-card[data-sug="sug:coach:2026-11-02-t:0"]').count() == 1 and 'コーチ' in pg.inner_text('.sug-card[data-sug="sug:coach:2026-11-02-t:0"]'))
    pg.click('.sug-card[data-sug="sug:coach:2026-11-02-t:0"] [data-action=aiSugMove]'); wait_idle(pg, 400)
    ci = S(pg, "LifePlan.state.items.find(i => i.title === '区役所の受付時間を調べる')")
    check('コーチ：自分のリストへ移せる', ci and ci['quadrant'] == 'q1' and len(ci['steps']) == 2 and ci['source'] == 'ai')
    pg.wait_for_timeout(4000)
    rem = gh.get_json('data/life-plan.json')['data']
    check('同期：aiSuggestions・aiAnalyses も保存', any(s['id'] == 'sug:coach:2026-11-02-t:0' and s['status'] == 'moved' for s in rem.get('aiSuggestions', [])) and 'aiAnalyses' in rem)
    pg.evaluate("location.hash = '#home'"); wait_idle(pg, 300)
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
    sp.evaluate("location.hash = '#habits/' + (LifePlan.state.habits[0] || {}).id"); wait_idle(sp, 900)
    check('SW：ぽむ画像を実行時キャッシュ', sp.evaluate("caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys())))).then(a => a.flat().some(r => /images\\/monster\\/.+\\.webp$/.test(r.url)))"))
    sp.evaluate("location.hash = '#home'"); wait_idle(sp, 300)
    # アップデート：キャッシュを消して ?v= つきで読み込み直す
    sp.evaluate("caches.open('lifeplan-old-test').then(c => c.put('/dummy', new Response('x')))"); wait_idle(sp, 200)
    sp.evaluate("sessionStorage.setItem('navMark', '1'); window.__beforeUpdate = 1")
    sp.click('#menuBtn'); wait_idle(sp, 500)
    with sp.expect_navigation(timeout=15000):
        sp.click('#drawer [data-action=forceUpdate]')
        sp.wait_for_timeout(150)
        check('アップデート：「最新版を確認しています…」', '最新版を確認しています' in sp.inner_text('#toast'))
    wait_idle(sp, 1200)
    nav = sp.evaluate("performance.getEntriesByType('navigation')[0].name")
    check('アップデート：?v=<時刻> で読み込み直す', re.search(r'[?&]v=\d{10,}', nav) is not None and sp.evaluate('window.__beforeUpdate') is None, nav)
    check('アップデート：古いキャッシュを削除', 'lifeplan-old-test' not in sp.evaluate('caches.keys()'))
    check('アップデート：読み込み後は URL から ?v= を消してバージョンを表示', 'v=' not in sp.evaluate('location.search') and '1.4.0' in sp.inner_text('#toast') and sp.evaluate('LifePlan.state.items.length') > 0, sp.inner_text('#toast'))
    check('アップデート：Service Worker は引き続き有効', sp.evaluate("navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))"))
    swc.set_offline(True)
    sp.reload(); wait_idle(sp, 1200)
    check('オフラインで起動', sp.locator('.tabbar').count() == 1 and sp.evaluate('LifePlan.state.items.length') > 0)
    sp.evaluate("location.hash = '#matrix'"); wait_idle(sp, 300)
    check('オフラインでも画面遷移', 'マトリックス' in sp.title())
    hid_sw = sp.evaluate("LifePlan.state.habits[0] && LifePlan.state.habits[0].id")
    sp.evaluate(f"location.hash = '#habits/{hid_sw}'"); wait_idle(sp, 800)
    check('オフライン：ぽむ画像（実行時キャッシュ）', sp.evaluate("(() => { const i = document.querySelector('.pomu-card img'); return !!i && i.complete && i.naturalWidth > 0; })()"))
    swc.set_offline(False); swc.close()

    pc = browser.new_context(viewport={'width': 1280, 'height': 800}, locale='ja-JP', timezone_id='Asia/Tokyo')
    pc.route('https://api.github.com/**', gh.handle)
    pc.route('https://generativelanguage.googleapis.com/**', gem.handle)
    pp = pc.new_page(); pp.on('pageerror', lambda e: errors.append('PC ' + str(e)))
    pp.goto(URL); pp.evaluate("(s) => localStorage.setItem('lifeplan.v1', s)", state_dump); pp.reload(); wait_idle(pp, 800)
    shot(pp, 'pc_home.png')
    check('PC：サイドバーに「アップデート」', pp.locator('.tabbar [data-action=forceUpdate]').is_visible() and 'アップデート' in pp.inner_text('.tabbar [data-action=forceUpdate]'))
    check('PC：上部バーに ぽむ', pp.locator('#topPomu').is_visible() and '-256.webp' in pp.get_attribute('#topPomu', 'src'))
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
