// محاولات كسر اللوحة: إدخالات متطرفة، وصلاحيات ناقصة، وروابط غريبة.
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { startServer, Client } = require('./helpers');

test('محاولات كسر اللوحة', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  s.addUser('boss', 'admin');
  s.addUser('ed', 'editor');
  s.addUser('guest', 'viewer');
  const boss = new Client(s.base); await boss.login('boss');
  const ed = new Client(s.base); await ed.login('ed');
  const guest = new Client(s.base); await guest.login('guest');
  const csrf = await boss.csrf('/admin');
  const edCsrf = await ed.csrf('/admin');
  const guestCsrf = s.db.prepare('SELECT csrf FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.username = ?').get('guest').csrf;
  const addItem = (title = 'x', extra = {}) => Number(s.db.prepare(`INSERT INTO items (title, file_name, mime, size, album_id, privacy) VALUES (?, 'x.jpg', 'image/jpeg', 1, ?, ?)`).run(title, extra.album || null, extra.privacy || 'family').lastInsertRowid);

  await t.test('أسماء طويلة: 80 حرف مقبول، 81 مرفوض', async () => {
    const ok = 'ع'.repeat(80);
    assert.equal((await boss.post('/admin/users', { _csrf: csrf, username: 'long1', display_name: ok, role: 'viewer', password: 'password-123' })).status, 302);
    const bad = await boss.post('/admin/users', { _csrf: csrf, username: 'long2', display_name: ok + 'ع', role: 'viewer', password: 'password-123' });
    assert.equal(bad.status, 400);
    assert.match(bad.text_, /الاسم طويل/);
    assert.match((await boss.get('/admin/users')).text_, new RegExp(ok));
  });

  await t.test('اسم كله مسافات أو رموز اتجاه ما يمر كاسم فاضي', async () => {
    assert.match((await boss.post('/admin/users', { _csrf: csrf, username: 'blank', display_name: '     ', role: 'viewer', password: 'password-123' })).text_, /اكتب اسم الشخص/);
    const weird = await boss.post('/admin/users', { _csrf: csrf, username: 'bidi', display_name: '‮مقلوب', role: 'viewer', password: 'password-123' });
    assert.equal(weird.status, 302);
    assert.match((await boss.get('/admin/users')).text_, /<bdi|clip/);
  });

  await t.test('عنوان 200 حرف وقصة 10000 حرف ينحفظون، وأكثر ينرفض', async () => {
    const id = addItem();
    assert.equal((await ed.post('/admin/items/' + id, { _csrf: edCsrf, title: 'ت'.repeat(200), story: 'ق'.repeat(10000) })).status, 302);
    assert.equal(s.db.prepare('SELECT length(story) AS n FROM items WHERE id = ?').get(id).n, 10000);
    assert.equal((await ed.post('/admin/items/' + id, { _csrf: edCsrf, story: 'ق'.repeat(10001) })).status, 400);
    assert.equal((await ed.get('/admin/items')).status, 200);
  });

  await t.test('ألبوم فاضي: صفحته وفلتره ما يخربون', async () => {
    const album = Number(s.db.prepare("INSERT INTO collections (kind, name) VALUES ('album', 'فاضي')").run().lastInsertRowid);
    assert.match((await ed.get('/admin/collections')).text_, /ما فيه صور/);
    assert.match((await ed.get('/admin/items?album=' + album)).text_, /ما فيه نتائج/);
    assert.match((await ed.get('/admin/collections/' + album + '/delete')).text_, /فاضي/);
  });

  await t.test('صور كثيرة: الصفحات تتقسم صح، وأرقام الصفحات الغريبة ما تكسرها', async () => {
    for (let i = 0; i < 130; i++) addItem('كثير ' + i);
    const count = (text) => (text.match(/class="tile"/g) || []).length;
    assert.equal(count((await ed.get('/admin/items?q=' + encodeURIComponent('كثير'))).text_), 48);
    const last = await ed.get('/admin/items?q=' + encodeURIComponent('كثير') + '&page=3');
    assert.equal(count(last.text_), 34);
    assert.match(last.text_, /صفحة 3 من 3/);
    for (const page of ['999', '-5', 'abc', '1e9', '']) {
      const res = await ed.get('/admin/items?page=' + page);
      assert.equal(res.status, 200, 'page=' + page);
    }
    assert.match((await ed.get('/admin/items?page=999')).text_, /صفحة \d+ من \d+/);
    assert.equal((await ed.get('/admin')).status, 200);
  });

  await t.test('روابط غريبة ترجع "غير موجود" بدل خطأ', async () => {
    for (const url of ['/admin/items/abc/edit', '/admin/items/1.5/edit', '/admin/items/-1/delete', '/admin/users/0/edit', '/admin/collections/abc/edit', '/media/-1/thumb', '/media/abc/display', '/media/1/huge', '/media/1/..%2F..%2Fdb']) {
      const res = await boss.get(url);
      assert.equal(res.status, 404, url);
    }
  });

  await t.test('محاولات بصلاحية ناقصة: الزائر', async () => {
    const id = addItem('خاص');
    const attempts = [
      ['/admin/items/' + id, { title: 'hacked' }],
      ['/admin/items/' + id + '/delete', {}],
      ['/admin/collections', { kind: 'album', name: 'hack' }],
      ['/admin/trash/restore', { type: 'item', id: String(id) }],
      ['/admin/users', { username: 'hacker', display_name: 'h', role: 'admin', password: 'password-123' }]
    ];
    for (const [url, body] of attempts) {
      const res = await guest.post(url, { _csrf: guestCsrf, ...body });
      assert.equal(res.status, 403, url);
    }
    assert.equal(s.db.prepare('SELECT title, deleted_at FROM items WHERE id = ?').get(id).title, 'خاص');
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM users WHERE username = 'hacker'").get().n, 0);
  });

  await t.test('محاولات بصلاحية ناقصة: بدون دخول', async () => {
    const anon = new Client(s.base);
    const res = await anon.post('/admin/collections', { kind: 'album', name: 'anon' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /^\/login/);
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM collections WHERE name = 'anon'").get().n, 0);
    assert.equal((await anon.get('/api/archive')).status, 401);
  });

  await t.test('المحرر يحاول يرفع نفسه مدير', async () => {
    const me = s.db.prepare("SELECT id FROM users WHERE username = 'ed'").get().id;
    assert.equal((await ed.post('/admin/users/' + me, { _csrf: edCsrf, display_name: 'ed', role: 'admin' })).status, 403);
    assert.equal(s.db.prepare('SELECT role FROM users WHERE id = ?').get(me).role, 'editor');
  });

  await t.test('المدير يرسل صلاحية مو موجودة', async () => {
    const res = await boss.post('/admin/users', { _csrf: csrf, username: 'odd', display_name: 'o', role: 'owner', password: 'password-123' });
    assert.equal(res.status, 400);
  });

  await t.test('جلسة منتهية ترجع لصفحة الدخول', async () => {
    const c = new Client(s.base); await c.login('ed');
    s.db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 minute')").run();
    assert.equal((await c.get('/admin')).status, 302);
  });

  await t.test('رمز حماية من جلسة ثانية ما يشتغل', async () => {
    const a = new Client(s.base); await a.login('boss');
    const b = new Client(s.base); await b.login('boss');
    const bCsrf = await b.csrf();
    assert.equal((await a.post('/admin/collections', { _csrf: bCsrf, kind: 'album', name: 'cross' })).status, 403);
  });

  await t.test('نفس الاسم الجديد مكرر في نفس الخانة ينضاف مرة وحدة', async () => {
    const c = new Client(s.base); await c.login('ed');
    const tok = await c.csrf('/admin/upload');
    const img = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#000' } }).png().toBuffer();
    const form = new FormData();
    form.append('meta', JSON.stringify([{ new_people: 'نوره، نوره ,  نوره', people: ['99999', 'abc', '1'] }]));
    form.append('files', new Blob([img], { type: 'image/png' }), 'p.png');
    const res = await c.request('/admin/upload', { method: 'POST', body: form, headers: { accept: 'application/json', 'x-csrf-token': tok } });
    const id = JSON.parse(res.text_).results[0].id;
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM people WHERE name = 'نوره'").get().n, 1);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM item_people WHERE item_id = ?').get(id).n, 2);
  });

  await t.test('صورة أكبر من 25 ميجا تنرفض برسالة واضحة', async () => {
    const c = new Client(s.base); await c.login('ed');
    const tok = await c.csrf('/admin/upload');
    const form = new FormData();
    form.append('meta', JSON.stringify([{}]));
    form.append('files', new Blob([Buffer.alloc(25 * 1024 * 1024 + 1)], { type: 'image/jpeg' }), 'big.jpg');
    const res = await c.request('/admin/upload', { method: 'POST', body: form, headers: { accept: 'application/json', 'x-csrf-token': tok } });
    assert.equal(res.status, 400);
    assert.match(JSON.parse(res.text_).error, /أكبر من 25 ميجا/);
  });

  await t.test('صورة ضخمة الأبعاد (قنبلة بكسلات) ما توقف السيرفر', async () => {
    const c = new Client(s.base); await c.login('ed');
    const tok = await c.csrf('/admin/upload');
    const svgLike = await sharp({ create: { width: 20000, height: 20000, channels: 3, background: '#fff' }, limitInputPixels: false }).png({ compressionLevel: 9 }).toBuffer();
    const form = new FormData();
    form.append('meta', JSON.stringify([{}]));
    form.append('files', new Blob([svgLike], { type: 'image/png' }), 'bomb.png');
    const res = await c.request('/admin/upload', { method: 'POST', body: form, headers: { accept: 'application/json', 'x-csrf-token': tok } });
    assert.equal(res.status, 200);
    const r = JSON.parse(res.text_).results[0];
    assert.match(r.error, /كبيرة جدًا/);
    assert.equal((await c.get('/admin')).status, 200, 'server still alive');
  });
});
