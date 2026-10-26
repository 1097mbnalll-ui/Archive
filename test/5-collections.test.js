const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client } = require('./helpers');

test('النقطة 5: الألبومات والمناسبات', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  s.addUser('ed', 'editor');
  s.addUser('guest', 'viewer');
  const c = new Client(s.base);
  await c.login('ed');
  const csrf = await c.csrf('/admin/collections');
  const find = (name) => s.db.prepare('SELECT * FROM collections WHERE name = ?').get(name);
  const addItem = (fields) => Number(s.db.prepare(`INSERT INTO items (file_name, mime, size, album_id, occasion_id) VALUES ('x.jpg', 'image/jpeg', 1, ?, ?)`).run(fields.album || null, fields.occasion || null).lastInsertRowid);

  await t.test('الصفحة فاضية في البداية وواضحة', async () => {
    const page = await c.get('/admin/collections');
    assert.equal(page.status, 200);
    assert.match(page.text_, /ما فيه الألبومات بعد/);
    assert.match(page.text_, /ما فيه المناسبات بعد/);
  });

  await t.test('إنشاء ألبوم ومناسبة', async () => {
    assert.equal((await c.post('/admin/collections', { _csrf: csrf, kind: 'album', name: '  صور   الطائف ', description: 'من أيام جدي' })).status, 302);
    assert.equal((await c.post('/admin/collections', { _csrf: csrf, kind: 'occasion', name: 'عرس عمي سعد' })).status, 302);
    assert.equal(find('صور الطائف').kind, 'album', 'spaces cleaned');
    assert.equal(find('عرس عمي سعد').kind, 'occasion');
  });

  await t.test('الألبوم الفاضي ينعرض بدون مشاكل', async () => {
    const page = await c.get('/admin/collections');
    assert.match(page.text_, /ما فيه صور/);
    assert.match(page.text_, /فاضي/);
  });

  await t.test('اسم فاضي أو مكرر أو طويل ينرفض', async () => {
    assert.match((await c.post('/admin/collections', { _csrf: csrf, kind: 'album', name: '   ' })).text_, /اكتب اسم/);
    assert.match((await c.post('/admin/collections', { _csrf: csrf, kind: 'album', name: 'صور الطائف' })).text_, /بنفس الاسم/);
    assert.match((await c.post('/admin/collections', { _csrf: csrf, kind: 'album', name: 'س'.repeat(101) })).text_, /الاسم طويل/);
    assert.equal((await c.post('/admin/collections', { _csrf: csrf, kind: 'occasion', name: 'صور الطائف' })).status, 302, 'same name allowed for a different kind');
  });

  await t.test('تعديل الاسم', async () => {
    const id = find('صور الطائف').id;
    await c.post('/admin/collections/' + id, { _csrf: csrf, name: 'الطائف القديمة', description: '' });
    assert.equal(s.db.prepare('SELECT name FROM collections WHERE id = ?').get(id).name, 'الطائف القديمة');
  });

  await t.test('حذف ألبوم فيه صور: الصور تبقى، والاسترجاع يرجّع الربط', async () => {
    const album = find('الطائف القديمة');
    const itemId = addItem({ album: album.id });
    const confirm = await c.get('/admin/collections/' + album.id + '/delete');
    assert.match(confirm.text_, /الصور ما تنحذف/);
    await c.post('/admin/collections/' + album.id + '/delete', { _csrf: csrf });
    assert.ok(find('الطائف القديمة').deleted_at);
    assert.equal(s.db.prepare('SELECT deleted_at FROM items WHERE id = ?').get(itemId).deleted_at, null, 'photo kept');
    assert.ok(!(await c.get('/admin/collections')).text_.includes('الطائف القديمة'));
    assert.match((await c.get('/admin/trash')).text_, /الطائف القديمة \(ألبوم\)/);
    await c.post('/admin/trash/restore', { _csrf: csrf, type: 'collection', id: String(album.id) });
    assert.equal(find('الطائف القديمة').deleted_at, null);
    assert.equal(s.db.prepare('SELECT album_id FROM items WHERE id = ?').get(itemId).album_id, album.id);
  });

  await t.test('الاسترجاع ما يسوي تكرار لو فيه واحد جديد بنفس الاسم', async () => {
    const old = find('عرس عمي سعد');
    await c.post('/admin/collections/' + old.id + '/delete', { _csrf: csrf });
    await c.post('/admin/collections', { _csrf: csrf, kind: 'occasion', name: 'عرس عمي سعد' });
    const res = await c.post('/admin/trash/restore', { _csrf: csrf, type: 'collection', id: String(old.id) });
    assert.equal(res.headers.get('location'), '/admin/trash?msg=restore-failed');
    assert.ok(s.db.prepare('SELECT deleted_at FROM collections WHERE id = ?').get(old.id).deleted_at);
    assert.match((await c.get('/admin/trash?msg=restore-failed')).text_, /فيه واحد بنفس الاسم/);
  });

  await t.test('الزائر ما يقدر يدير الألبومات', async () => {
    const g = new Client(s.base);
    await g.login('guest');
    assert.equal((await g.get('/admin/collections')).status, 403);
    assert.equal((await g.post('/admin/collections', { kind: 'album', name: 'x' })).status, 403);
  });
});
