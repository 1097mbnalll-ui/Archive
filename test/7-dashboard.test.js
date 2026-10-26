const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client } = require('./helpers');

test('النقطة 7: اللوحة الرئيسية', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  const adminId = s.addUser('boss', 'admin', 'password-123', 'أبو محمد');
  s.addUser('ed', 'editor');

  await t.test('الأرشيف الفاضي يعرض أصفار ودعوة للرفع', async () => {
    const c = new Client(s.base);
    await c.login('boss');
    const page = await c.get('/admin');
    assert.match(page.text_, /الأرشيف فاضي/);
    assert.match(page.text_, /<span class="num">٠<\/span><span class="what">صورة<\/span>/);
  });

  await t.test('الأرقام صحيحة وما تحسب المحذوف', async () => {
    const add = (kind, privacy, deleted) => s.db.prepare(`INSERT INTO items (kind, privacy, title, file_name, mime, size, uploaded_by, deleted_at) VALUES (?, ?, ?, 'x.jpg', 'image/jpeg', 1, ?, ?)`)
      .run(kind, privacy, kind + '-' + privacy, adminId, deleted ? '2026-01-01' : null);
    add('photo', 'public'); add('photo', 'family'); add('photo', 'family'); add('document', 'family'); add('photo', 'public', true);
    s.db.prepare("INSERT INTO collections (kind, name) VALUES ('album', 'أ'), ('album', 'ب'), ('occasion', 'ج')").run();
    s.db.prepare("INSERT INTO collections (kind, name, deleted_at) VALUES ('album', 'محذوف', '2026-01-01')").run();
    const c = new Client(s.base);
    await c.login('boss');
    const text = (await c.get('/admin')).text_;
    const stat = (what) => text.match(new RegExp('<span class="num">([^<]+)</span><span class="what">' + what))[1];
    assert.equal(stat('صورة'), '٣');
    assert.equal(stat('مستند'), '١');
    assert.equal(stat('عامة'), '١');
    assert.equal(stat('ألبوم'), '٢');
    assert.equal(stat('مناسبة'), '١');
    assert.equal(stat('فرد'), '٢');
  });

  await t.test('آخر الإضافات بالترتيب، ومين رفعها', async () => {
    const c = new Client(s.base);
    await c.login('boss');
    const text = (await c.get('/admin')).text_;
    assert.match(text, /رفعها أبو محمد/);
    const order = [...text.matchAll(/<span class="title">([^<]+)<\/span>/g)].map((m) => m[1]);
    assert.deepEqual(order, ['document-family', 'photo-family', 'photo-family', 'photo-public']);
  });

  await t.test('المحرر ما يشوف عدد الحسابات', async () => {
    const c = new Client(s.base);
    await c.login('ed');
    const text = (await c.get('/admin')).text_;
    assert.ok(!text.includes('فرد له حساب'));
  });
});
