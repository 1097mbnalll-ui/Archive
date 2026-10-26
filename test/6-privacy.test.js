const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { startServer, Client } = require('./helpers');

test('النقطة 6: خصوصية كل صورة (كل العائلة أو أصحاب الحسابات بس)', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  s.addUser('ed', 'editor');
  s.addUser('guest', 'viewer');
  s.setShared('visitor', 'family-pass-1');
  const ed = new Client(s.base);
  await ed.login('ed');
  const csrf = await ed.csrf('/admin/upload');
  const img = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#884422' } }).jpeg().toBuffer();

  const form = new FormData();
  form.append('meta', JSON.stringify([
    { title: 'صورة للكل', people: ['1'] },
    { title: 'صورة خاصة', privacy: 'family', people: ['2'] },
    { title: 'صورة للكل صريحة', privacy: 'public', people: ['1'] }
  ]));
  for (const n of ['a', 'b', 'c']) form.append('files', new Blob([img], { type: 'image/jpeg' }), n + '.jpg');
  const up = await ed.request('/admin/upload', { method: 'POST', body: form, headers: { accept: 'application/json', 'x-csrf-token': csrf } });
  const [allId, privateId] = JSON.parse(up.text_).results.map((r) => r.id);
  const visitor = new Client(s.base);
  await visitor.loginShared('family-pass-1');

  await t.test('الافتراضي "كل العائلة"، والخاص ينحفظ', () => {
    assert.deepEqual(s.db.prepare('SELECT privacy FROM items ORDER BY id').all().map((r) => r.privacy), ['public', 'family', 'public']);
  });

  await t.test('اللي دخل بكلمة سر الزوار ما يشوف الخاصة، ولا أسماء أصحابها', async () => {
    const data = JSON.parse((await visitor.get('/api/archive')).text_);
    assert.deepEqual(data.items.map((i) => i.title).sort(), ['صورة للكل', 'صورة للكل صريحة']);
    assert.deepEqual(data.people.map((p) => p.name), ['الجد']);
    assert.equal(data.viewer.name, 'زائر العائلة');
    assert.match(data.viewer.code, /^[0-9A-F]{6}$/);
    assert.equal((await visitor.get('/media/' + privateId + '/thumb')).status, 404);
    assert.equal((await visitor.get('/media/' + allId + '/thumb')).status, 200);
  });

  await t.test('صاحب الحساب يشوف كل شي', async () => {
    const g = new Client(s.base);
    await g.login('guest');
    const data = JSON.parse((await g.get('/api/archive')).text_);
    assert.equal(data.items.length, 3);
    assert.equal((await g.get('/media/' + privateId + '/display')).status, 200);
  });

  await t.test('تغيير الخصوصية يطبّق فورًا', async () => {
    await ed.post('/admin/items/' + allId, { _csrf: csrf, title: 'صورة للكل', privacy: 'family' });
    assert.equal(JSON.parse((await visitor.get('/api/archive')).text_).items.length, 1);
    assert.equal((await visitor.get('/media/' + allId + '/thumb')).status, 404);
  });

  await t.test('قيمة غريبة للخصوصية تصير "كل العائلة"', async () => {
    await ed.post('/admin/items/' + privateId, { _csrf: csrf, title: 'x', privacy: 'everyone' });
    assert.equal(s.db.prepare('SELECT privacy FROM items WHERE id = ?').get(privateId).privacy, 'public');
  });

  await t.test('الصورة المحذوفة تختفي من الموقع', async () => {
    await ed.post('/admin/items/' + privateId + '/delete', { _csrf: csrf });
    assert.ok(JSON.parse((await visitor.get('/api/archive')).text_).items.every((i) => i.id !== String(privateId)));
    assert.equal((await visitor.get('/media/' + privateId + '/display')).status, 404);
  });

  await t.test('قائمة الصور فيها علامة الخصوصية وفلتر لها', async () => {
    const page = await ed.get('/admin/items?privacy=family');
    assert.match(page.text_, /privacy-family/);
    assert.ok(!page.text_.includes('privacy privacy-public'));
  });
});
