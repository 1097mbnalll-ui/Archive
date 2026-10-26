const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client } = require('./helpers');

test('النقطة 1: الدخول المحمي', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  s.addUser('admin', 'admin');

  await t.test('كلمة السر محفوظة مشفرة، مو نص عادي', () => {
    const row = s.db.prepare("SELECT password_hash FROM users WHERE username = 'admin'").get();
    assert.match(row.password_hash, /^scrypt\$32768\$8\$1\$/);
    assert.ok(!row.password_hash.includes('password-123'));
  });

  await t.test('اللوحة ما تفتح بدون دخول', async () => {
    const c = new Client(s.base);
    for (const url of ['/admin', '/admin/', '/admin/users', '/admin/upload', '/admin/anything']) {
      const res = await c.get(url);
      assert.equal(res.status, 302, url);
      assert.match(res.headers.get('location'), /^\/login\?next=/);
    }
  });

  await t.test('كلمة سر غلط ترجع رسالة واضحة', async () => {
    const c = new Client(s.base);
    const res = await c.login('admin', 'wrong-password');
    assert.equal(res.status, 401);
    assert.match(res.text_, /اسم المستخدم أو كلمة السر غلط/);
    assert.equal(c.cookies.size, 0);
  });

  await t.test('اسم مستخدم غير موجود يرجع نفس الرسالة', async () => {
    const res = await new Client(s.base).login('nobody', 'whatever-123');
    assert.equal(res.status, 401);
    assert.match(res.text_, /اسم المستخدم أو كلمة السر غلط/);
  });

  await t.test('الدخول الصحيح يفتح اللوحة، والكوكي محمي', async () => {
    const c = new Client(s.base);
    const res = await c.login('ADMIN');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin?msg=logged-in');
    const cookie = res.headers.getSetCookie()[0];
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    const page = await c.get('/admin');
    assert.equal(page.status, 200);
    assert.match(page.text_, /أهلًا admin/);
  });

  await t.test('الجلسة محفوظة كبصمة، مو الرمز نفسه', async () => {
    const c = new Client(s.base);
    await c.login('admin');
    const token = c.cookies.get('sid');
    const rows = s.db.prepare('SELECT token_hash FROM sessions').all();
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.token_hash !== token && r.token_hash.length === 64));
  });

  await t.test('الخروج يقفل الجلسة فعلًا', async () => {
    const c = new Client(s.base);
    await c.login('admin');
    const oldToken = c.cookies.get('sid');
    const csrf = await c.csrf();
    const res = await c.post('/logout', { _csrf: csrf });
    assert.equal(res.status, 302);
    const replay = new Client(s.base);
    replay.cookies.set('sid', oldToken);
    assert.equal((await replay.get('/admin')).status, 302);
  });

  await t.test('الخروج بدون رمز الحماية مرفوض', async () => {
    const c = new Client(s.base);
    await c.login('admin');
    const res = await c.post('/logout', {});
    assert.equal(res.status, 403);
  });

  await t.test('طلب من موقع ثاني مرفوض', async () => {
    const c = new Client(s.base);
    const res = await c.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' },
      body: 'username=admin&password=password-123'
    });
    assert.equal(res.status, 403);
  });

  await t.test('بعد 5 محاولات غلط يتقفل الدخول مؤقتًا', async () => {
    s.addUser('target', 'editor');
    const c = new Client(s.base);
    for (let i = 0; i < 5; i++) assert.equal((await c.login('target', 'nope-nope')).status, 401);
    const locked = await c.login('target');
    assert.equal(locked.status, 429);
    assert.match(locked.text_, /محاولات كثيرة/);
  });

  await t.test('رابط التحويل بعد الدخول ما يطلع لموقع ثاني', async () => {
    const c = new Client(s.base);
    const res = await c.post('/login', { username: 'admin', password: 'password-123', next: '//evil.example' });
    assert.equal(res.headers.get('location'), '/admin?msg=logged-in');
  });

  await t.test('الصفحات فيها حماية المتصفح', async () => {
    const res = await new Client(s.base).get('/login');
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });
});
