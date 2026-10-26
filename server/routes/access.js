// كلمات السر المشتركة: وحدة للزوار ووحدة للمدير. للمدير فقط.
const express = require('express');
const auth = require('../auth');

const WHICH = {
  visitor: { label: 'كلمة سر الزوار', help: 'أي أحد يدخل بها يشوف الأرشيف بس، وما يدخل لوحة الإدارة.' },
  admin: { label: 'كلمة سر المدير', help: 'أي أحد يدخل بها يصير مدير: يرفع ويعدّل ويحذف ويغيّر كلمات السر. لا تعطيها إلا لشخص تثق فيه.' }
};

module.exports = function accessRouter(db) {
  const router = express.Router();
  router.use(auth.requireRole('admin'));

  const shared = db.prepare('SELECT id, shared, password_hash FROM users WHERE shared = ?');
  const devices = db.prepare(`
    SELECT s.token_hash, s.created_at, s.ip, s.user_agent FROM sessions s
    WHERE s.user_id = ? AND s.expires_at > datetime('now') ORDER BY s.created_at DESC LIMIT 50`);

  function state() {
    return Object.keys(WHICH).map((key) => {
      const row = shared.get(key);
      return {
        key, ...WHICH[key],
        isSet: row.password_hash !== 'disabled',
        devices: devices.all(row.id).map((d) => ({ code: auth.sessionCode(d.token_hash), created_at: d.created_at, ip: d.ip, device: describeDevice(d.user_agent) }))
      };
    });
  }

  router.get('/', (req, res) => res.render('access', { groups: state(), errors: {} }));

  router.post('/:which', (req, res, next) => {
    const which = req.params.which;
    if (!WHICH[which]) return next();
    const row = shared.get(which);
    const other = shared.get(which === 'visitor' ? 'admin' : 'visitor');

    if (req.body.action === 'disable') {
      db.prepare("UPDATE users SET password_hash = 'disabled' WHERE id = ?").run(row.id);
      auth.endUserSessions(db, row.id);
      return res.redirect('/admin/access?msg=access-disabled');
    }

    const password = String(req.body.password || '');
    const errors = {};
    const problem = auth.passwordProblem(password);
    if (problem) errors[which] = problem;
    else if (password !== String(req.body.confirm || '')) errors[which] = 'الكلمتين مو متطابقة. اكتبها مرة ثانية.';
    else if (auth.verifyPassword(password, other.password_hash)) errors[which] = 'لازم تكون مختلفة عن ' + WHICH[other.shared].label + '.';
    if (Object.keys(errors).length) return res.status(400).render('access', { groups: state(), errors });

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), row.id);
    // كل اللي دخلوا بالكلمة القديمة يطلعون.
    auth.endUserSessions(db, row.id);
    if (req.user.id === row.id) auth.setSessionCookie(req, res, auth.createSession(db, row.id, req));
    res.redirect('/admin/access?msg=access-saved');
  });

  return router;
};

// وصف مختصر للجهاز من بيانات المتصفح.
function describeDevice(ua) {
  const text = String(ua);
  const os = /iPhone|iPad/.test(text) ? 'آيفون/آيباد' : /Android/.test(text) ? 'أندرويد' : /Windows/.test(text) ? 'ويندوز' : /Mac OS/.test(text) ? 'ماك' : /Linux/.test(text) ? 'لينكس' : 'جهاز';
  const browser = /Edg\//.test(text) ? 'Edge' : /Chrome\//.test(text) ? 'Chrome' : /Firefox\//.test(text) ? 'Firefox' : /Safari\//.test(text) ? 'Safari' : '';
  return browser ? os + '، ' + browser : os;
}
