// سلة المحذوفات: كل شي ينحذف يجي هنا، ويرجع بضغطة. ما فيه حذف نهائي من اللوحة.
const express = require('express');
const auth = require('../auth');

// كل نوع ينحذف له تعريف هنا: من يقدر يشوفه، وكيف نجيبه، وكيف نرجعه.
function trashTypes(db) {
  return {
    item: {
      label: 'الصور والمستندات',
      role: 'editor',
      list: db.prepare(`SELECT id, CASE WHEN title = '' THEN original_name ELSE title END AS name, deleted_at FROM items WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`),
      restore: db.prepare(`UPDATE items SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL`),
      thumb: true
    },
    collection: {
      label: 'الألبومات والمناسبات',
      role: 'editor',
      list: db.prepare(`SELECT id, name || CASE kind WHEN 'album' THEN ' (ألبوم)' ELSE ' (مناسبة)' END AS name, deleted_at FROM collections WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`),
      restore: db.prepare(`UPDATE collections SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM collections o WHERE o.kind = collections.kind AND o.name = collections.name AND o.deleted_at IS NULL)`)
    },
    user: {
      label: 'أفراد العائلة',
      role: 'admin',
      list: db.prepare(`SELECT id, display_name AS name, role AS extra, deleted_at FROM users WHERE deleted_at IS NOT NULL AND shared IS NULL ORDER BY deleted_at DESC`),
      restore: db.prepare(`UPDATE users SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL AND shared IS NULL`)
    }
  };
}

module.exports = function trashRouter(db) {
  const router = express.Router();
  const types = trashTypes(db);

  router.get('/', (req, res) => {
    const groups = Object.entries(types)
      .filter(([, t]) => auth.hasRole(req.user, t.role))
      .map(([key, t]) => ({ key, label: t.label, rows: t.list.all() }));
    res.render('trash', { groups });
  });

  router.post('/restore', (req, res) => {
    const type = types[req.body.type];
    if (!type) return res.status(400).render('forbidden', { reason: 'نوع غير معروف' });
    if (!auth.hasRole(req.user, type.role)) return res.status(403).render('forbidden');
    const result = type.restore.run(Number(req.body.id));
    res.redirect('/admin/trash?msg=' + (result.changes ? 'restored' : 'restore-failed'));
  });

  return router;
};

module.exports.trashTypes = trashTypes;
