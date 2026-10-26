const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client } = require('./helpers');

test('النقطة 3: إدارة أفراد العائلة', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  s.addUser('boss', 'admin');
  const c = new Client(s.base);
  await c.login('boss');
  const csrf = await c.csrf('/admin/users');
  const byName = (u) => s.db.prepare('SELECT * FROM users WHERE username = ?').get(u);

  await t.test('إضافة فرد جديد', async () => {
    const res = await c.post('/admin/users', { _csrf: csrf, username: 'sara', display_name: 'سارة', role: 'viewer', password: 'sara-pass-1' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin/users?msg=user-added');
    const u = byName('sara');
    assert.equal(u.role, 'viewer');
    assert.equal(u.display_name, 'سارة');
    const login = await new Client(s.base).login('sara', 'sara-pass-1');
    assert.equal(login.headers.get('location'), '/');
  });

  await t.test('اسم مستخدم عربي مسموح', async () => {
    const res = await c.post('/admin/users', { _csrf: csrf, username: 'خالد_1', display_name: 'خالد', role: 'editor', password: 'khaled-pass' });
    assert.equal(res.status, 302);
    assert.ok(byName('خالد_1'));
  });

  await t.test('أخطاء النموذج تطلع تحت كل خانة، والقيم ما تضيع', async () => {
    const res = await c.post('/admin/users', { _csrf: csrf, username: 'a b', display_name: '', role: 'king', password: '123' });
    assert.equal(res.status, 400);
    assert.match(res.text_, /بدون مسافات/);
    assert.match(res.text_, /اكتب اسم الشخص/);
    assert.match(res.text_, /اختر صلاحية/);
    assert.match(res.text_, /8 أحرف أو أكثر/);
    assert.match(res.text_, /value="a b"/);
  });

  await t.test('ما يتكرر اسم المستخدم، حتى لو اختلفت الحروف الكبيرة', async () => {
    const res = await c.post('/admin/users', { _csrf: csrf, username: 'SARA', display_name: 'ثانية', role: 'viewer', password: 'another-pass' });
    assert.equal(res.status, 400);
    assert.match(res.text_, /الاسم هذا مستخدم/);
  });

  await t.test('تغيير الصلاحية يطلّع الشخص من جلساته القديمة', async () => {
    const sara = new Client(s.base);
    await sara.login('sara', 'sara-pass-1');
    const id = byName('sara').id;
    const res = await c.post('/admin/users/' + id, { _csrf: csrf, display_name: 'سارة أحمد', role: 'editor', password: '' });
    assert.equal(res.status, 302);
    assert.equal(byName('sara').role, 'editor');
    assert.equal(byName('sara').display_name, 'سارة أحمد');
    assert.equal((await sara.get('/admin')).status, 302, 'old session ended');
    const fresh = new Client(s.base);
    await fresh.login('sara', 'sara-pass-1');
    assert.equal((await fresh.get('/admin')).status, 200, 'new role works');
  });

  await t.test('تغيير كلمة السر يشتغل، والقديمة ما تشتغل', async () => {
    const id = byName('sara').id;
    await c.post('/admin/users/' + id, { _csrf: csrf, display_name: 'سارة أحمد', role: 'editor', password: 'new-sara-pass' });
    assert.equal((await new Client(s.base).login('sara', 'sara-pass-1')).status, 401);
    assert.equal((await new Client(s.base).login('sara', 'new-sara-pass')).status, 302);
  });

  await t.test('الحذف يحتاج تأكيد، وينقل للمحذوفات بدل ما يمسح', async () => {
    const id = byName('sara').id;
    const confirm = await c.get('/admin/users/' + id + '/delete');
    assert.equal(confirm.status, 200);
    assert.match(confirm.text_, /مو نهائي/);
    assert.ok(byName('sara').deleted_at === null, 'opening the confirm page deletes nothing');
    const res = await c.post('/admin/users/' + id + '/delete', { _csrf: csrf });
    assert.equal(res.status, 302);
    assert.ok(byName('sara').deleted_at, 'soft deleted');
    assert.equal((await new Client(s.base).login('sara', 'new-sara-pass')).status, 401, 'cannot log in');
    const list = await c.get('/admin/users');
    assert.ok(!list.text_.includes('سارة أحمد'));
    const trash = await c.get('/admin/trash');
    assert.match(trash.text_, /سارة أحمد/);
  });

  await t.test('الاسترجاع يرجّع الحساب ويقدر يدخل', async () => {
    const id = byName('sara').id;
    const res = await c.post('/admin/trash/restore', { _csrf: csrf, type: 'user', id: String(id) });
    assert.equal(res.headers.get('location'), '/admin/trash?msg=restored');
    assert.equal(byName('sara').deleted_at, null);
    assert.equal((await new Client(s.base).login('sara', 'new-sara-pass')).status, 302);
  });

  await t.test('ما تقدر تحذف نفسك', async () => {
    const me = byName('boss').id;
    const res = await c.post('/admin/users/' + me + '/delete', { _csrf: csrf });
    assert.equal(res.status, 400);
    assert.match(res.text_, /ما تقدر تحذف حسابك/);
    assert.equal(byName('boss').deleted_at, null);
  });

  await t.test('ما تقدر تنزّل صلاحية آخر مدير', async () => {
    const me = byName('boss').id;
    const res = await c.post('/admin/users/' + me, { _csrf: csrf, display_name: 'boss', role: 'viewer', password: '' });
    assert.equal(res.status, 400);
    assert.match(res.text_, /آخر مدير/);
    assert.equal(byName('boss').role, 'admin');
  });

  await t.test('المحرر ما يقدر يضيف أو يعدّل أو يحذف أو يسترجع حسابات', async () => {
    const ed = new Client(s.base);
    await ed.login('خالد_1', 'khaled-pass');
    const edCsrf = await ed.csrf('/admin');
    const target = byName('sara').id;
    assert.equal((await ed.post('/admin/users', { _csrf: edCsrf, username: 'hack', display_name: 'x', role: 'admin', password: 'hack-hack-1' })).status, 403);
    assert.equal((await ed.post('/admin/users/' + target, { _csrf: edCsrf, display_name: 'x', role: 'viewer' })).status, 403);
    assert.equal((await ed.post('/admin/users/' + target + '/delete', { _csrf: edCsrf })).status, 403);
    assert.equal((await ed.post('/admin/trash/restore', { _csrf: edCsrf, type: 'user', id: String(target) })).status, 403);
    assert.equal(byName('hack'), undefined);
  });

  await t.test('رابط لحساب غير موجود يرجع "غير موجود"', async () => {
    assert.equal((await c.get('/admin/users/99999/edit')).status, 404);
    assert.equal((await c.post('/admin/users/99999', { _csrf: csrf, display_name: 'x', role: 'viewer' })).status, 404);
  });

  await t.test('اسم فيه أكواد ينعرض كنص، ما ينفّذ', async () => {
    await c.post('/admin/users', { _csrf: csrf, username: 'xss', display_name: '<script>alert(1)</script>', role: 'viewer', password: 'xss-pass-1' });
    const list = await c.get('/admin/users');
    assert.ok(!list.text_.includes('<script>alert(1)</script>'));
    assert.match(list.text_, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });
});
