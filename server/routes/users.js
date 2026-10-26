// إدارة أفراد العائلة (حسابات الدخول). للمدير فقط.
const express = require('express');
const auth = require('../auth');

const USERNAME = /^[\p{L}\p{N}._-]{3,40}$/u;

module.exports = function usersRouter(db) {
  const router = express.Router();
  router.use(auth.requireRole('admin'));

  const listUsers = db.prepare(`
    SELECT id, username, display_name, role, created_at FROM users
    WHERE deleted_at IS NULL ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, display_name`);
  const getUser = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ? AND deleted_at IS NULL');
  const usernameTaken = db.prepare('SELECT deleted_at FROM users WHERE username = ? AND id != ?');
  const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND deleted_at IS NULL");

  // يفحص النموذج ويرجع الأخطاء لكل خانة.
  function validate(body, { isNew, id }) {
    const values = {
      username: String(body.username || '').trim(),
      display_name: String(body.display_name || '').trim().replace(/\s+/g, ' '),
      role: String(body.role || ''),
      password: String(body.password || '')
    };
    const errors = {};
    if (isNew) {
      if (!USERNAME.test(values.username)) {
        errors.username = 'من 3 إلى 40 حرف، بدون مسافات. مسموح الحروف والأرقام والنقطة والشرطة.';
      } else {
        const taken = usernameTaken.get(values.username, id || 0);
        if (taken) errors.username = taken.deleted_at ? 'الاسم هذا لحساب في المحذوفات. استرجعه من هناك أو اختر اسم ثاني.' : 'الاسم هذا مستخدم. اختر اسم ثاني.';
      }
    }
    if (!values.display_name) errors.display_name = 'اكتب اسم الشخص';
    else if (values.display_name.length > 80) errors.display_name = 'الاسم طويل. خلّه 80 حرف أو أقل.';
    if (!auth.ROLES[values.role]) errors.role = 'اختر صلاحية';
    if (isNew || values.password) {
      const problem = auth.passwordProblem(values.password);
      if (problem) errors.password = problem;
    }
    return { values, errors };
  }

  const isLastAdmin = (user) => user.role === 'admin' && adminCount.get().n <= 1;

  router.get('/', (req, res) => res.render('users', { users: listUsers.all() }));

  router.get('/new', (req, res) => res.render('user-form', { isNew: true, values: { role: 'viewer' }, errors: {} }));

  router.post('/', (req, res) => {
    const { values, errors } = validate(req.body, { isNew: true });
    if (Object.keys(errors).length) return res.status(400).render('user-form', { isNew: true, values, errors });
    db.prepare('INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(values.username, values.display_name, auth.hashPassword(values.password), values.role);
    res.redirect('/admin/users?msg=user-added');
  });

  router.get('/:id/edit', (req, res, next) => {
    const user = getUser.get(Number(req.params.id));
    if (!user) return next();
    res.render('user-form', { isNew: false, target: user, values: user, errors: {}, isSelf: user.id === req.user.id });
  });

  router.post('/:id', (req, res, next) => {
    const user = getUser.get(Number(req.params.id));
    if (!user) return next();
    const isSelf = user.id === req.user.id;
    const { values, errors } = validate(req.body, { isNew: false, id: user.id });
    if (values.role !== user.role && isLastAdmin(user)) errors.role = 'هذا آخر مدير. لازم يكون فيه مدير واحد على الأقل.';
    if (Object.keys(errors).length) {
      return res.status(400).render('user-form', { isNew: false, target: user, values: { ...values, username: user.username }, errors, isSelf });
    }
    db.prepare("UPDATE users SET display_name = ?, role = ?, updated_at = datetime('now') WHERE id = ?")
      .run(values.display_name, values.role, user.id);
    let msg = 'user-saved';
    if (values.password) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(values.password), user.id);
      msg = 'password-changed';
    }
    // أي تغيير في الصلاحية أو كلمة السر يطلّع الشخص من أجهزته، عشان يطبّق فورًا.
    if (values.password || values.role !== user.role) {
      auth.endUserSessions(db, user.id);
      if (isSelf) {
        auth.setSessionCookie(req, res, auth.createSession(db, user.id));
        if (values.role !== 'admin') return res.redirect(values.role === 'editor' ? '/admin?msg=user-saved' : '/');
      }
    }
    res.redirect('/admin/users?msg=' + msg);
  });

  router.get('/:id/delete', (req, res, next) => {
    const user = getUser.get(Number(req.params.id));
    if (!user) return next();
    res.render('user-delete', { target: user, blocked: deleteBlocked(user, req.user) });
  });

  function deleteBlocked(user, me) {
    if (user.id === me.id) return 'ما تقدر تحذف حسابك أنت.';
    if (isLastAdmin(user)) return 'هذا آخر مدير. لازم يكون فيه مدير واحد على الأقل.';
    return null;
  }

  router.post('/:id/delete', (req, res, next) => {
    const user = getUser.get(Number(req.params.id));
    if (!user) return next();
    const blocked = deleteBlocked(user, req.user);
    if (blocked) return res.status(400).render('user-delete', { target: user, blocked });
    db.prepare("UPDATE users SET deleted_at = datetime('now') WHERE id = ?").run(user.id);
    auth.endUserSessions(db, user.id);
    res.redirect('/admin/users?msg=user-deleted');
  });

  return router;
};
