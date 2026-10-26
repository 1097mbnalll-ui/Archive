const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { startServer, Client } = require('./helpers');

test('النقطة 6: خصوصية كل صورة', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  s.addUser('ed', 'editor');
  s.addUser('guest', 'viewer');
  const ed = new Client(s.base);
  await ed.login('ed');
  const csrf = await ed.csrf('/admin/upload');
  const img = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#884422' } }).jpeg().toBuffer();

  const form = new FormData();
  form.append('meta', JSON.stringify([
    { title: 'صورة عامة', privacy: 'public', people: ['1'] },
    { title: 'صورة خاصة', people: ['2'] },
    { title: 'صورة خاصة صريحة', privacy: 'family', people: ['1'] }
  ]));
  for (const n of ['a', 'b', 'c']) form.append('files', new Blob([img], { type: 'image/jpeg' }), n + '.jpg');
  const up = await ed.request('/admin/upload', { method: 'POST', body: form, headers: { accept: 'application/json', 'x-csrf-token': csrf } });
  const ids = JSON.parse(up.text_).results.map((r) => r.id);
  const [publicId, privateId, explicitId] = ids;

  await t.test('الخصوصية تنحفظ، والافتراضي "العائلة فقط"', () => {
    const rows = s.db.prepare('SELECT id, privacy FROM items ORDER BY id').all();
    assert.deepEqual(rows.map((r) => r.privacy), ['public', 'family', 'family']);
  });

  await t.test('الغريب يشوف الصور العامة بس، وأسماء أصحابها بس', async () => {
    const res = await new Client(s.base).get('/api/archive');
    const data = JSON.parse(res.text_);
    assert.deepEqual(data.items.map((i) => i.title), ['صورة عامة']);
    assert.deepEqual(data.people.map((p) => p.name), ['الجد']);
    assert.equal(data.viewer, null);
    assert.equal(data.csrf, null);
    assert.match(res.headers.get('cache-control'), /no-store/);
  });

  await t.test('الغريب ما يقدر يفتح ملف صورة خاصة حتى لو عرف الرابط', async () => {
    const stranger = new Client(s.base);
    assert.equal((await stranger.get('/media/' + publicId + '/display')).status, 200);
    for (const id of [privateId, explicitId]) {
      for (const size of ['thumb', 'display', 'original']) assert.equal((await stranger.get('/media/' + id + '/' + size)).status, 404);
    }
  });

  await t.test('فرد العائلة (زائر بحساب) يشوف كل الصور', async () => {
    const g = new Client(s.base);
    await g.login('guest');
    const data = JSON.parse((await g.get('/api/archive')).text_);
    assert.equal(data.items.length, 3);
    assert.equal(data.viewer.canEdit, false);
    assert.ok(data.people.length >= 8);
    assert.equal((await g.get('/media/' + privateId + '/display')).status, 200);
  });

  await t.test('تغيير الخصوصية من صفحة التعديل يطبّق فورًا', async () => {
    await ed.post('/admin/items/' + publicId, { _csrf: csrf, title: 'صورة عامة', privacy: 'family' });
    const stranger = new Client(s.base);
    assert.equal(JSON.parse((await stranger.get('/api/archive')).text_).items.length, 0);
    assert.equal((await stranger.get('/media/' + publicId + '/thumb')).status, 404);
    await ed.post('/admin/items/' + privateId, { _csrf: csrf, title: 'صورة خاصة', privacy: 'public' });
    assert.deepEqual(JSON.parse((await stranger.get('/api/archive')).text_).items.map((i) => i.title), ['صورة خاصة']);
  });

  await t.test('قيمة غريبة للخصوصية تصير "العائلة فقط"', async () => {
    await ed.post('/admin/items/' + explicitId, { _csrf: csrf, title: 'x', privacy: 'everyone' });
    assert.equal(s.db.prepare('SELECT privacy FROM items WHERE id = ?').get(explicitId).privacy, 'family');
  });

  await t.test('الصورة العامة المحذوفة تختفي من الموقع', async () => {
    await ed.post('/admin/items/' + privateId + '/delete', { _csrf: csrf });
    const stranger = new Client(s.base);
    assert.equal(JSON.parse((await stranger.get('/api/archive')).text_).items.length, 0);
    assert.equal((await stranger.get('/media/' + privateId + '/display')).status, 404);
  });

  await t.test('قائمة الصور فيها علامة الخصوصية وفلتر لها', async () => {
    const page = await ed.get('/admin/items?privacy=family');
    assert.match(page.text_, /privacy-family/);
    assert.ok(!page.text_.includes('privacy privacy-public'));
  });
});
