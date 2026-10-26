const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client } = require('./helpers');

test('النقطة 2: الصلاحيات الثلاث', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  s.addUser('boss', 'admin');
  s.addUser('ed', 'editor');
  s.addUser('guest', 'viewer');

  const as = async (username) => { const c = new Client(s.base); await c.login(username); return c; };

  await t.test('الزائر يدخل الموقع بس، واللوحة مقفولة عليه', async () => {
    const c = new Client(s.base);
    const res = await c.login('guest');
    assert.equal(res.headers.get('location'), '/');
    for (const url of ['/admin', '/admin/users', '/admin/upload', '/admin/items', '/admin/collections', '/admin/trash']) {
      const page = await c.get(url);
      assert.equal(page.status, 403, url);
      assert.match(page.text_, /صلاحيتك ما تسمح/);
    }
  });

  await t.test('المحرر يدخل اللوحة، بس صفحة أفراد العائلة مقفولة عليه', async () => {
    const c = await as('ed');
    assert.equal((await c.get('/admin')).status, 200);
    assert.equal((await c.get('/admin/users')).status, 403);
  });

  await t.test('المحرر ما يشوف رابط أفراد العائلة في القائمة', async () => {
    const c = await as('ed');
    const page = await c.get('/admin');
    assert.ok(!page.text_.includes('href="/admin/users"'));
    assert.match(page.text_, /role-editor/);
  });

  await t.test('المدير يفتح كل شي', async () => {
    const c = await as('boss');
    assert.equal((await c.get('/admin')).status, 200);
    const users = await c.get('/admin/users');
    assert.equal(users.status, 200);
    assert.match(users.text_, /href="\/admin\/users"/);
    for (const name of ['boss', 'ed', 'guest']) assert.ok(users.text_.includes(name));
  });

  await t.test('تغيير الصلاحية في قاعدة البيانات يطبّق فورًا', async () => {
    const c = await as('ed');
    s.db.prepare("UPDATE users SET role = 'viewer' WHERE username = 'ed'").run();
    assert.equal((await c.get('/admin')).status, 403);
    s.db.prepare("UPDATE users SET role = 'editor' WHERE username = 'ed'").run();
  });

  await t.test('القاعدة ترفض أي صلاحية غير الثلاث', () => {
    assert.throws(() => s.addUser('weird', 'superuser'));
  });
});
