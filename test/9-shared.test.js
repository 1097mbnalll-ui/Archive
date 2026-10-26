const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client } = require('./helpers');

test('كلمات السر المشتركة والموقع المقفول', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  s.addUser('boss', 'admin');
  const boss = new Client(s.base);
  await boss.login('boss');
  const csrf = await boss.csrf('/admin/access');

  await t.test('الموقع كامل مقفول بدون دخول', async () => {
    const anon = new Client(s.base);
    const home = await anon.get('/');
    assert.equal(home.status, 302);
    assert.equal(home.headers.get('location'), '/login');
    assert.equal((await anon.get('/index.html')).status, 302);
    for (const url of ['/app.js', '/styles.css', '/protect.js', '/data.js']) assert.equal((await anon.get(url)).status, 404, url);
    assert.equal((await anon.get('/api/archive')).status, 401);
    assert.equal((await anon.get('/login')).status, 200, 'login page stays open');
    assert.equal((await anon.get('/admin/assets/admin.css')).status, 200, 'login page styles stay open');
  });

  await t.test('قبل ما تتحدد كلمة السر المشتركة، ما أحد يدخل بها', async () => {
    const res = await new Client(s.base).loginShared('disabled');
    assert.equal(res.status, 401);
    assert.match(res.text_, /كلمة السر غلط/);
  });

  await t.test('المدير يحدد كلمة سر الزوار وكلمة سر المدير', async () => {
    const page = await boss.get('/admin/access');
    assert.equal(page.status, 200);
    assert.match(page.text_, /غير محددة/);
    assert.equal((await boss.post('/admin/access/visitor', { _csrf: csrf, password: 'visitors-123', confirm: 'visitors-123' })).status, 302);
    assert.equal((await boss.post('/admin/access/admin', { _csrf: csrf, password: 'managers-123', confirm: 'managers-123' })).status, 302);
  });

  await t.test('أخطاء كلمة السر المشتركة', async () => {
    assert.match((await boss.post('/admin/access/visitor', { _csrf: csrf, password: 'short', confirm: 'short' })).text_, /8 أحرف/);
    assert.match((await boss.post('/admin/access/visitor', { _csrf: csrf, password: 'one-pass-1', confirm: 'two-pass-2' })).text_, /مو متطابقة/);
    assert.match((await boss.post('/admin/access/visitor', { _csrf: csrf, password: 'managers-123', confirm: 'managers-123' })).text_, /مختلفة عن كلمة سر المدير/);
  });

  await t.test('كلمة سر الزوار: يشوف الموقع، واللوحة مقفولة', async () => {
    const v = new Client(s.base);
    const res = await v.loginShared('visitors-123');
    assert.equal(res.headers.get('location'), '/');
    assert.equal((await v.get('/')).status, 200);
    assert.equal((await v.get('/app.js')).status, 200);
    assert.equal((await v.get('/admin')).status, 403);
  });

  await t.test('كلمة سر المدير: تفتح اللوحة كاملة', async () => {
    const a = new Client(s.base);
    const res = await a.loginShared('managers-123');
    assert.equal(res.headers.get('location'), '/admin?msg=logged-in');
    assert.equal((await a.get('/admin/users')).status, 200);
    assert.equal((await a.get('/admin/access')).status, 200);
  });

  await t.test('الحسابات المشتركة ما تطلع في قائمة الأفراد ولا تنحذف', async () => {
    const list = (await boss.get('/admin/users')).text_;
    assert.ok(!list.includes('~visitor') && !list.includes('زائر العائلة'));
    const id = s.db.prepare("SELECT id FROM users WHERE shared = 'visitor'").get().id;
    assert.equal((await boss.get('/admin/users/' + id + '/edit')).status, 404);
    assert.equal((await boss.post('/admin/users/' + id + '/delete', { _csrf: csrf })).status, 404);
  });

  await t.test('ما أحد يدخل باسم الحساب المشترك', async () => {
    assert.equal((await new Client(s.base).login('~visitor', 'visitors-123')).status, 401);
  });

  await t.test('الحسابات الخاصة لسا تشتغل', async () => {
    assert.equal((await new Client(s.base).login('boss')).status, 302);
  });

  await t.test('لوحة كلمات السر تعرض الأجهزة الداخلة ورموزها', async () => {
    const page = (await boss.get('/admin/access')).text_;
    assert.match(page, /الأجهزة الداخلة بها الحين \(1\)/);
    assert.match(page, /<strong>[0-9A-F]{6}<\/strong>/);
  });

  await t.test('تغيير كلمة سر الزوار يطلّع كل اللي دخلوا بالقديمة', async () => {
    const v = new Client(s.base);
    await v.loginShared('visitors-123');
    assert.equal((await v.get('/')).status, 200);
    await boss.post('/admin/access/visitor', { _csrf: csrf, password: 'visitors-456', confirm: 'visitors-456' });
    assert.equal((await v.get('/')).status, 302);
    assert.equal((await new Client(s.base).loginShared('visitors-123')).status, 401);
    assert.equal((await new Client(s.base).loginShared('visitors-456')).status, 302);
  });

  await t.test('إيقاف كلمة السر', async () => {
    const v = new Client(s.base);
    await v.loginShared('visitors-456');
    await boss.post('/admin/access/visitor', { _csrf: csrf, action: 'disable' });
    assert.equal((await v.get('/')).status, 302);
    assert.equal((await new Client(s.base).loginShared('visitors-456')).status, 401);
  });

  await t.test('المحرر ما يقدر يغيّر كلمات السر', async () => {
    s.addUser('ed', 'editor');
    const e = new Client(s.base);
    await e.login('ed');
    const tok = await e.csrf('/admin');
    assert.equal((await e.get('/admin/access')).status, 403);
    assert.equal((await e.post('/admin/access/admin', { _csrf: tok, password: 'hijack-123', confirm: 'hijack-123' })).status, 403);
  });

  await t.test('الصور والصفحات ما تنحفظ في ذاكرة المتصفح للزائر', async () => {
    s.setShared('visitor', 'visitors-789');
    const v = new Client(s.base);
    await v.loginShared('visitors-789');
    assert.match((await v.get('/app.js')).headers.get('cache-control'), /no-store/);
  });
  await t.test('تخمين كلمة السر المشتركة يتقفل بعد 5 محاولات', async () => {
    const g = new Client(s.base);
    for (let i = 0; i < 5; i++) await g.loginShared('guess-' + i + '-xx');
    assert.equal((await g.loginShared('managers-123')).status, 429);
  });

});
