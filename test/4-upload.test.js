const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { startServer, Client } = require('./helpers');
const { yearFrom } = require('../server/items');

// صورة تجريبية فيها معلومات موقع جغرافي (GPS)، عشان نتأكد إنها تنشال من نسخ العرض.
async function photo(color = '#a0522d', width = 1200, height = 900) {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Make: 'TestPhone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '21/1 25/1 0/1' } })
    .toBuffer();
}

async function upload(client, csrf, files, meta) {
  const form = new FormData();
  if (meta) form.append('meta', JSON.stringify(meta));
  for (const f of files) form.append('files', new Blob([f.data], { type: f.type || 'image/jpeg' }), f.name);
  const headers = { accept: 'application/json' };
  if (csrf) headers['x-csrf-token'] = csrf;
  const res = await client.request('/admin/upload', { method: 'POST', body: form, headers });
  try { res.json_ = JSON.parse(res.text_); } catch (e) { res.json_ = null; }
  return res;
}

test('السنة تنفهم من التاريخ المكتوب', () => {
  assert.equal(yearFrom('1985'), 1985);
  assert.equal(yearFrom('تقريبًا ١٩٧٤'), 1974);
  assert.equal(yearFrom('صيف 1400هـ'), 1980);
  assert.equal(yearFrom('الثمانينات'), null);
  assert.equal(yearFrom('12345'), null);
});

test('النقطة 4: رفع الصور', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  s.addUser('ed', 'editor');
  s.addUser('guest', 'viewer');
  const albumId = Number(s.db.prepare("INSERT INTO collections (kind, name) VALUES ('album', 'ألبوم العرس')").run().lastInsertRowid);
  const c = new Client(s.base);
  await c.login('ed');
  const csrf = await c.csrf('/admin/upload');
  const tmpCount = () => fs.readdirSync(path.join(s.dataDir, 'uploads', 'tmp')).length;
  const img = await photo();

  await t.test('صفحة الرفع تفتح للمحرر', async () => {
    const page = await c.get('/admin/upload');
    assert.equal(page.status, 200);
    assert.match(page.text_, /ألبوم العرس/);
    assert.match(page.text_, /الجد/);
  });

  await t.test('رفع عدة صور مرة وحدة، ولكل صورة بياناتها', async () => {
    const res = await upload(c, csrf, [
      { name: 'a.jpg', data: img }, { name: 'b.jpg', data: await photo('#336699') }, { name: 'c.jpg', data: await photo('#999933') }
    ], [
      { title: 'عرس عمي', date_text: 'تقريبًا ١٩٧٤', place: 'الطائف', album_id: String(albumId), people: ['1', '2'], new_people: 'سعد، أم فهد', story: 'قصة' },
      { title: 'العيد', date_text: '1400هـ', kind: 'document' },
      {}
    ]);
    assert.equal(res.status, 200, res.text_);
    assert.equal(res.json_.saved, 3);
    const first = s.db.prepare('SELECT * FROM items WHERE id = ?').get(res.json_.results[0].id);
    assert.equal(first.title, 'عرس عمي');
    assert.equal(first.year, 1974);
    assert.equal(first.album_id, albumId);
    assert.equal(first.privacy, 'family', 'default is family-only');
    const names = s.db.prepare('SELECT p.name FROM item_people ip JOIN people p ON p.id = ip.person_id WHERE ip.item_id = ? ORDER BY p.id').all(first.id).map((r) => r.name);
    assert.deepEqual(names, ['الجد', 'الجدة', 'سعد', 'أم فهد']);
    const second = s.db.prepare('SELECT * FROM items WHERE id = ?').get(res.json_.results[1].id);
    assert.equal(second.kind, 'document');
    assert.equal(second.year, 1980);
    assert.equal(tmpCount(), 0, 'temp files cleaned');
  });

  await t.test('الاسم الجديد ما يتكرر لو انكتب مرة ثانية', async () => {
    await upload(c, csrf, [{ name: 'd.jpg', data: img }], [{ new_people: 'سعد' }]);
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM people WHERE name = 'سعد'").get().n, 1);
  });

  await t.test('الصور المصغرة تنعرض، ومعلومات الموقع الجغرافي تنشال منها', async () => {
    const id = s.db.prepare('SELECT id FROM items ORDER BY id LIMIT 1').get().id;
    for (const size of ['thumb', 'display']) {
      const res = await fetch(s.base + '/media/' + id + '/' + size, { headers: { cookie: 'sid=' + c.cookies.get('sid') } });
      assert.equal(res.status, 200, size);
      assert.equal(res.headers.get('content-type'), 'image/webp');
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      assert.equal(meta.exif, undefined, size + ' has no EXIF');
      if (size === 'thumb') assert.ok(meta.width <= 480);
    }
  });

  await t.test('ملف مو صورة ينرفض برسالة، والباقي ينحفظ', async () => {
    const before = s.db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
    const res = await upload(c, csrf, [
      { name: 'virus.jpg', data: Buffer.from('<?php echo 1; ?>'), type: 'image/jpeg' },
      { name: 'ok.jpg', data: img }
    ], [{}, {}]);
    assert.equal(res.json_.saved, 1);
    assert.match(res.json_.results[0].error, /مو صورة/);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM items').get().n, before + 1);
    assert.equal(tmpCount(), 0);
  });

  await t.test('خانة طويلة أو ألبوم غير موجود يرجع خطأ لهذي الصورة بس', async () => {
    const res = await upload(c, csrf, [{ name: 'x.jpg', data: img }, { name: 'y.jpg', data: img }], [
      { title: 'ع'.repeat(500) }, { album_id: '99999' }
    ]);
    assert.equal(res.json_.saved, 0);
    assert.match(res.json_.results[0].errors.title, /طويل/);
    assert.match(res.json_.results[1].errors.album_id, /غير موجود/);
    assert.equal(tmpCount(), 0);
  });

  await t.test('أكثر من 20 صورة في طلب واحد ينرفض', async () => {
    const files = Array.from({ length: 21 }, (_, i) => ({ name: i + '.jpg', data: img }));
    const res = await upload(c, csrf, files, files.map(() => ({})));
    assert.equal(res.status, 400);
    assert.match(res.json_.error, /20/);
    assert.equal(tmpCount(), 0);
  });

  await t.test('بدون رمز الحماية ينرفض وما يبقى ملف', async () => {
    const before = s.db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
    const res = await upload(c, null, [{ name: 'a.jpg', data: img }], [{}]);
    assert.equal(res.status, 403);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM items').get().n, before);
    assert.equal(tmpCount(), 0);
  });

  await t.test('الزائر ما يقدر يرفع، واللي ما دخل ما يقدر يرفع', async () => {
    const guest = new Client(s.base);
    await guest.login('guest');
    assert.equal((await upload(guest, 'x', [{ name: 'a.jpg', data: img }], [{}])).status, 403);
    const anon = await upload(new Client(s.base), 'x', [{ name: 'a.jpg', data: img }], [{}]);
    assert.equal(anon.status, 401);
    assert.match(anon.json_.error, /انتهت جلستك/);
    assert.equal(tmpCount(), 0);
  });

  await t.test('الرفع بدون جافاسكربت: كل الصور تاخذ نفس البيانات', async () => {
    const form = new FormData();
    form.append('_csrf', csrf);
    form.append('title', 'بدون سكربت');
    form.append('people', '3');
    form.append('files', new Blob([img], { type: 'image/jpeg' }), 'n1.jpg');
    form.append('files', new Blob([img], { type: 'image/jpeg' }), 'n2.jpg');
    const res = await c.request('/admin/upload', { method: 'POST', body: form });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin/items?msg=uploaded');
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM items WHERE title = 'بدون سكربت'").get().n, 2);
  });

  await t.test('قائمة الصور والبحث فيها', async () => {
    const all = await c.get('/admin/items');
    assert.equal(all.status, 200);
    assert.match(all.text_, /عرس عمي/);
    const found = await c.get('/admin/items?q=' + encodeURIComponent('عرس'));
    assert.match(found.text_, /عرس عمي/);
    assert.ok(!found.text_.includes('بدون سكربت'));
    const none = await c.get('/admin/items?q=' + encodeURIComponent('%_'));
    assert.match(none.text_, /ما فيه نتائج/);
    const byAlbum = await c.get('/admin/items?album=' + albumId);
    assert.match(byAlbum.text_, /عرس عمي/);
  });

  await t.test('تعديل بيانات صورة', async () => {
    const id = s.db.prepare("SELECT id FROM items WHERE title = 'عرس عمي'").get().id;
    const page = await c.get('/admin/items/' + id + '/edit');
    assert.equal(page.status, 200);
    const res = await c.post('/admin/items/' + id, { _csrf: csrf, title: 'عرس عمي سعد', date_text: '1975', place: 'جدة', story: 'جديد', kind: 'photo', people: '1' });
    assert.equal(res.status, 302);
    const item = s.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    assert.equal(item.title, 'عرس عمي سعد');
    assert.equal(item.year, 1975);
    assert.equal(item.album_id, null);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM item_people WHERE item_id = ?').get(id).n, 1);
    const bad = await c.post('/admin/items/' + id, { _csrf: csrf, title: 'x'.repeat(300) });
    assert.equal(bad.status, 400);
    assert.match(bad.text_, /النص طويل/);
  });

  await t.test('حذف صورة ينقلها للمحذوفات، والاسترجاع يرجعها مع بياناتها', async () => {
    const id = s.db.prepare("SELECT id FROM items WHERE title = 'عرس عمي سعد'").get().id;
    await c.post('/admin/items/' + id + '/delete', { _csrf: csrf });
    assert.ok(s.db.prepare('SELECT deleted_at FROM items WHERE id = ?').get(id).deleted_at);
    assert.ok(!(await c.get('/admin/items')).text_.includes('عرس عمي سعد'));
    assert.match((await c.get('/admin/trash')).text_, /عرس عمي سعد/);
    assert.equal((await new Client(s.base).get('/media/' + id + '/thumb')).status, 404, 'hidden from public');
    await c.post('/admin/trash/restore', { _csrf: csrf, type: 'item', id: String(id) });
    assert.equal(s.db.prepare('SELECT deleted_at FROM items WHERE id = ?').get(id).deleted_at, null);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM item_people WHERE item_id = ?').get(id).n, 1);
  });

  await t.test('الملف الأصلي للمحرر بس، والزائر ما يشوف صور العائلة الخاصة بدون دخول', async () => {
    const id = s.db.prepare('SELECT id FROM items ORDER BY id LIMIT 1').get().id;
    assert.equal((await c.get('/media/' + id + '/original')).status, 200);
    const guest = new Client(s.base);
    await guest.login('guest');
    assert.equal((await guest.get('/media/' + id + '/display')).status, 200, 'family member sees family photo');
    assert.equal((await guest.get('/media/' + id + '/original')).status, 404);
    assert.equal((await new Client(s.base).get('/media/' + id + '/display')).status, 404, 'stranger sees nothing');
    assert.equal((await c.get('/media/' + id + '/../../etc')).status, 404);
  });
});
