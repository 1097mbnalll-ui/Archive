const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client } = require('./helpers');
const { bootstrapSharedPasswords } = require('../server/index');

test('النشر: كلمات السر من إعدادات الاستضافة', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  await t.test('أول تشغيل ياخذ كلمات السر من الإعدادات', async () => {
    bootstrapSharedPasswords(s.db, { VISITOR_PASSWORD: 'from-env-visitor', ADMIN_PASSWORD: 'from-env-admin' });
    assert.equal((await new Client(s.base).loginShared('from-env-visitor')).headers.get('location'), '/');
    assert.equal((await new Client(s.base).loginShared('from-env-admin')).headers.get('location'), '/admin?msg=logged-in');
  });

  await t.test('بعدها الإعدادات ما تغطي على التغيير من اللوحة', async () => {
    s.setShared('visitor', 'changed-in-panel');
    bootstrapSharedPasswords(s.db, { VISITOR_PASSWORD: 'from-env-visitor' });
    assert.equal((await new Client(s.base).loginShared('from-env-visitor')).status, 401);
    assert.equal((await new Client(s.base).loginShared('changed-in-panel')).status, 302);
  });

  await t.test('كلمة سر قصيرة في الإعدادات تنتجاهل', () => {
    s.db.prepare("UPDATE users SET password_hash = 'disabled' WHERE shared = 'admin'").run();
    bootstrapSharedPasswords(s.db, { ADMIN_PASSWORD: '123' });
    assert.equal(s.db.prepare("SELECT password_hash FROM users WHERE shared = 'admin'").get().password_hash, 'disabled');
  });
});
