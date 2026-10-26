// إدارة أفراد العائلة (حسابات الدخول). للمدير فقط.
const express = require('express');
const auth = require('../auth');

module.exports = function usersRouter(db) {
  const router = express.Router();
  router.use(auth.requireRole('admin'));

  const listUsers = db.prepare(`
    SELECT id, username, display_name, role, created_at FROM users
    WHERE deleted_at IS NULL ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, display_name`);

  router.get('/', (req, res) => res.render('users', { users: listUsers.all() }));

  return router;
};
