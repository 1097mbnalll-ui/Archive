// تجربة كاملة لنسخة GitHub المشفّرة في متصفح حقيقي، على النسخة التجريبية من GitHub.
// الاستخدام: node test/github-site/e2e.js <مجلد الصور التجريبية> <مجلد لقطات الشاشة>
const { chromium } = require('playwright');
const fs = require('node:fs');
const BASE = 'http://localhost:4100';
const [samples, shots] = process.argv.slice(2);
const results = [];
const check = (name, ok, extra = '') => { results.push([ok ? 'PASS' : 'FAIL', name, extra]); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));

  // 1) التجهيز أول مرة
  await p.goto(BASE + '/Archive/');
  await p.waitForSelector('#setup-visitor');
  check('setup page shows on first visit', true);
  await p.fill('#setup-visitor', 'family-visit-1');
  await p.fill('#setup-admin', 'family-admin-1');
  await p.fill('#setup-token', 'wrong-token');
  await p.click('button[type=submit]');
  await p.waitForSelector('.error');
  check('wrong GitHub token is refused', /مفتاح GitHub/.test(await p.textContent('.error')), await p.textContent('.error'));
  await p.fill('#setup-token', 'github_pat_test');
  await p.click('button[type=submit]');
  await p.waitForSelector('.stats', { timeout: 30000 });
  check('setup creates archive and opens dashboard', true);
  await p.screenshot({ path: shots + '/gh-dashboard-empty.png', fullPage: true });

  // 2) ألبوم جديد
  await p.goto(BASE + '/Archive/#/admin/collections/new?kind=album');
  await p.fill('#c-name', 'صور الطائف القديمة');
  await p.click('form.panel button[type=submit]');
  await p.waitForSelector('.flash');
  check('album created', (await p.textContent('.grid')).includes('صور الطائف القديمة'));

  // 3) رفع صور: وحدة خاصة، ووحدة للكل، وملف مو صورة
  await p.goto(BASE + '/Archive/#/admin/upload');
  await p.waitForSelector('#files', { state: 'attached' });
  await p.setInputFiles('#files', [samples + '/old-photo-1.jpg', samples + '/old-photo-2.jpg', samples + '/old-photo-3.jpg', samples + '/notes.txt']);
  await p.waitForTimeout(500);
  const cards = p.locator('.preview');
  check('previews shown for 4 files, 1 rejected', (await cards.count()) === 4 && (await p.locator('.preview.bad').count()) === 1);
  await cards.nth(0).locator('[name=title]').fill('عرس عمي سعد');
  await cards.nth(0).locator('[name=date]').fill('تقريبًا ١٩٧٤');
  await cards.nth(0).locator('.choice').first().click();
  await cards.nth(1).locator('[name=title]').fill('صورة خاصة جدًا');
  await cards.nth(1).locator('[name=privacy]').selectOption('family');
  await cards.nth(2).locator('summary').click();
  await cards.nth(2).locator('[name=album]').selectOption({ label: 'صور الطائف القديمة' });
  await cards.nth(2).locator('[name=newPeople]').fill('سعد، أم فهد');
  await p.screenshot({ path: shots + '/gh-upload.png', fullPage: true });
  await p.locator('.preview.bad .remove').click();
  check('save button counts 3', (await p.textContent('.sticky-save .btn')).includes('3 صور'));
  await p.click('.sticky-save .btn');
  await p.waitForSelector('.flash', { timeout: 60000 });
  check('3 photos uploaded', (await p.locator('.grid .tile').count()) === 3, await p.textContent('.flash'));
  await p.screenshot({ path: shots + '/gh-items.png', fullPage: true });

  // 4) الملفات على GitHub مشفّرة
  const stats = await (await fetch(BASE + '/__stats')).json();
  const raw = async (path) => Buffer.from(await (await fetch(BASE + '/__file?path=' + encodeURIComponent(path))).arrayBuffer());
  const catalogAll = await raw('vault/catalog-all.bin');
  const keysJson = (await raw('vault/keys.json')).toString();
  const media = stats.files.filter((f) => f.startsWith('vault/m/'));
  const anyJpeg = (await Promise.all(media.map(raw))).some((buf) => buf[0] === 0xff && buf[1] === 0xd8);
  check('catalog has no readable Arabic', !catalogAll.toString('utf8').includes('عرس') && !catalogAll.toString('utf8').includes('الجد'));
  check('6 encrypted media files, none are plain JPEG', media.length === 6 && !anyJpeg, media.length + ' files');
  check('keys.json holds only wrapped keys', /"iterations": 600000/.test(keysJson) && !/family-/.test(keysJson));
  check('one commit per upload batch', stats.commits === 3, 'commits=' + stats.commits);

  // 5) تعديل: نخلي الصورة الأولى خاصة (تتشفّر من جديد)
  await p.locator('.grid .tile', { hasText: 'عرس عمي سعد' }).click();
  await p.waitForSelector('#e-title');
  await p.selectOption('#e-privacy', 'family');
  await p.fill('#e-story', 'قصة العرس');
  await p.click('form.panel button[type=submit]');
  await p.waitForSelector('.flash', { timeout: 30000 });
  const after = await (await fetch(BASE + '/__stats')).json();
  check('privacy change re-encrypts and removes old media', after.files.filter((f) => f.startsWith('vault/m/')).length === 6 && after.files.join() !== stats.files.join());

  // 6) حذف واسترجاع
  await p.goto(BASE + '/Archive/#/admin/items');
  await p.locator('.grid .tile').last().click();
  await p.waitForSelector('#e-title');
  await p.click('a.btn.danger');
  await p.click('button.btn.danger');
  await p.waitForSelector('.flash', { timeout: 30000 });
  check('item moved to trash', (await p.locator('.grid .tile').count()) === 2);
  await p.goto(BASE + '/Archive/#/admin/trash');
  await p.waitForSelector('.trash-name');
  await p.click('table button');
  await p.waitForSelector('.flash', { timeout: 30000 });
  check('item restored from trash', (await p.textContent('.flash')).includes('الاسترجاع'));

  // 7) الرئيسية
  await p.goto(BASE + '/Archive/#/admin');
  await p.waitForSelector('.stats');
  await p.screenshot({ path: shots + '/gh-dashboard.png', fullPage: true });

  // 8) الزائر بجهاز ثاني
  for (const [name, w] of [['desk', 1280], ['phone', 390]]) {
    const vctx = await b.newContext({ viewport: { width: w, height: 860 } });
    const v = await vctx.newPage();
    v.on('pageerror', (e) => errs.push(e.message));
    await v.goto(BASE + '/Archive/');
    await v.waitForSelector('#password');
    await v.fill('#password', 'wrong-password');
    await v.click('button[type=submit]');
    await v.waitForSelector('.error');
    check(name + ': wrong password message', (await v.textContent('.error')).includes('كلمة السر غلط'));
    await v.fill('#password', 'family-visit-1');
    await v.click('button[type=submit]');
    await v.waitForSelector('.hive', { timeout: 30000 });
    await v.waitForTimeout(1500);
    const people = await v.locator('a.cell.person').allTextContents();
    check(name + ': visitor sees only people with photos', people.some((t) => t.includes('سعد')) && people.every((t) => !/(^|\D)0 ذكرى/.test(t)), people.length + ' people');
    check(name + ': watermark shown', (await v.locator('.watermark').count()) === 1);
    await v.screenshot({ path: shots + '/gh-visitor-' + name + '-home.png' });
    const visibleTitles = await v.evaluate(async () => {
      const out = [];
      for (const a of document.querySelectorAll('a.cell.person')) out.push(a.getAttribute('href'));
      return out;
    });
    // نفتح شخص "سعد" ونتأكد إن الصورة اللي فيه انفكت
    await v.locator('a.cell.person', { hasText: 'سعد' }).click();
    await v.waitForTimeout(1500);
    check(name + ': photo decrypted in cell', (await v.locator('a.cell.has-image').count()) >= 1);
    await v.locator('a.cell.photo').first().click();
    await v.waitForTimeout(1500);
    const bg = await v.evaluate(() => getComputedStyle(document.querySelector('.item .photo')).backgroundImage);
    check(name + ': item photo shown from decrypted blob', bg.startsWith('url("blob:'));
    await v.screenshot({ path: shots + '/gh-visitor-' + name + '-item.png' });
    const titles = await v.evaluate(() => [...document.querySelectorAll('a.cell')].map((a) => a.getAttribute('aria-label')).join('|'));
    await v.goto(BASE + '/Archive/#/');
    await v.waitForTimeout(800);
    const all = await v.evaluate(() => document.body.innerText);
    check(name + ': private photos hidden from visitor', !all.includes('صورة خاصة جدًا'));
    await v.goto(BASE + '/Archive/#/admin');
    await v.waitForTimeout(500);
    check(name + ': visitor blocked from admin', (await v.textContent('h1')).includes('للمدير'));
    const blocked = await v.evaluate(() => { location.hash = '#/'; return true; });
    await vctx.close();
  }

  // 9) تغيير كلمة سر الزوار
  await p.goto(BASE + '/Archive/#/admin/passwords');
  await p.waitForSelector('#p-visitor');
  await p.fill('#p-visitor', 'family-admin-1');
  await p.fill('#p-visitor-2', 'family-admin-1');
  await p.locator('form').first().locator('button').click();
  await p.waitForSelector('.panel p.error[role=alert]');
  check('visitor password cannot equal admin password', (await p.textContent('.panel p.error[role=alert]')).includes('مختلفة'));
  await p.fill('#p-visitor', 'family-visit-2');
  await p.fill('#p-visitor-2', 'family-visit-2');
  await p.locator('form').first().locator('button').click();
  await p.waitForSelector('.flash', { timeout: 30000 });
  for (const [pw, expect] of [['family-visit-1', false], ['family-visit-2', true]]) {
    const c2 = await b.newContext();
    const v = await c2.newPage();
    await v.goto(BASE + '/Archive/');
    await v.waitForSelector('#password');
    await v.fill('#password', pw);
    await v.click('button[type=submit]');
    const ok = await v.waitForSelector('.hive', { timeout: 15000 }).then(() => true).catch(() => false);
    check('after change, ' + pw + (expect ? ' works' : ' refused'), ok === expect);
    await c2.close();
  }

  // 10) قفل التخمين
  const c3 = await b.newContext();
  const g = await c3.newPage();
  await g.goto(BASE + '/Archive/');
  for (let i = 0; i < 6; i++) { await g.waitForSelector('#password'); await g.fill('#password', 'guess-' + i); await g.click('button[type=submit]'); await g.waitForSelector('.error'); }
  check('lockout after 5 wrong tries', (await g.textContent('.error')).includes('15 دقيقة'));
  await c3.close();

  check('no page errors', errs.length === 0, errs.join(' | '));
  for (const r of results) console.log(r.join('  '));
  console.log(results.filter((r) => r[0] === 'FAIL').length ? 'SOME FAILED' : 'ALL PASSED');
  await b.close();
})();
