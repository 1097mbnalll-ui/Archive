// الألبومات والمناسبات: إنشاء وتعديل وحذف (قابل للاسترجاع).
const express = require('express');

const KINDS = {
  album: { one: 'ألبوم', many: 'الألبومات', example: 'مثل: صور الطائف القديمة' },
  occasion: { one: 'مناسبة', many: 'المناسبات', example: 'مثل: عرس عمي سعد ١٤٠٠هـ' }
};
const LIMITS = { name: 100, description: 1000 };

module.exports = function collectionsRouter(db) {
  const router = express.Router();

  const list = db.prepare(`
    SELECT c.id, c.kind, c.name, c.description,
      (SELECT COUNT(*) FROM items i WHERE i.deleted_at IS NULL AND (i.album_id = c.id OR i.occasion_id = c.id)) AS count,
      (SELECT i.id FROM items i WHERE i.deleted_at IS NULL AND (i.album_id = c.id OR i.occasion_id = c.id) ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS cover
    FROM collections c WHERE c.deleted_at IS NULL ORDER BY c.name`);
  const get = db.prepare('SELECT * FROM collections WHERE id = ? AND deleted_at IS NULL');
  const nameTaken = db.prepare('SELECT 1 FROM collections WHERE kind = ? AND name = ? AND id != ? AND deleted_at IS NULL');
  const countItems = db.prepare('SELECT COUNT(*) AS n FROM items WHERE deleted_at IS NULL AND (album_id = ? OR occasion_id = ?)');

  function validate(body, kind, id) {
    const values = {
      name: String(body.name || '').trim().replace(/\s+/g, ' '),
      description: String(body.description || '').replace(/\r\n/g, '\n').trim()
    };
    const errors = {};
    if (!values.name) errors.name = 'اكتب اسم ال' + KINDS[kind].one;
    else if (values.name.length > LIMITS.name) errors.name = 'الاسم طويل. الحد ' + LIMITS.name + ' حرف.';
    else if (nameTaken.get(kind, values.name, id || 0)) errors.name = 'فيه ' + KINDS[kind].one + ' بنفس الاسم';
    if (values.description.length > LIMITS.description) errors.description = 'الوصف طويل. الحد ' + LIMITS.description + ' حرف.';
    return { values, errors };
  }

  router.get('/', (req, res) => {
    const all = list.all();
    res.render('collections', { kinds: KINDS, groups: { album: all.filter((c) => c.kind === 'album'), occasion: all.filter((c) => c.kind === 'occasion') } });
  });

  router.get('/new', (req, res) => {
    const kind = KINDS[req.query.kind] ? req.query.kind : 'album';
    res.render('collection-form', { kinds: KINDS, kind, isNew: true, values: {}, errors: {}, limits: LIMITS });
  });

  router.post('/', (req, res) => {
    const kind = KINDS[req.body.kind] ? req.body.kind : 'album';
    const { values, errors } = validate(req.body, kind);
    if (Object.keys(errors).length) return res.status(400).render('collection-form', { kinds: KINDS, kind, isNew: true, values, errors, limits: LIMITS });
    db.prepare('INSERT INTO collections (kind, name, description) VALUES (?, ?, ?)').run(kind, values.name, values.description);
    res.redirect('/admin/collections?msg=collection-added');
  });

  router.get('/:id/edit', (req, res, next) => {
    const c = get.get(Number(req.params.id));
    if (!c) return next();
    res.render('collection-form', { kinds: KINDS, kind: c.kind, isNew: false, target: c, values: c, errors: {}, limits: LIMITS });
  });

  router.post('/:id', (req, res, next) => {
    const c = get.get(Number(req.params.id));
    if (!c) return next();
    const { values, errors } = validate(req.body, c.kind, c.id);
    if (Object.keys(errors).length) return res.status(400).render('collection-form', { kinds: KINDS, kind: c.kind, isNew: false, target: c, values, errors, limits: LIMITS });
    db.prepare("UPDATE collections SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?").run(values.name, values.description, c.id);
    res.redirect('/admin/collections?msg=collection-saved');
  });

  router.get('/:id/delete', (req, res, next) => {
    const c = get.get(Number(req.params.id));
    if (!c) return next();
    res.render('collection-delete', { kinds: KINDS, target: c, count: countItems.get(c.id, c.id).n });
  });

  router.post('/:id/delete', (req, res, next) => {
    const c = get.get(Number(req.params.id));
    if (!c) return next();
    db.prepare("UPDATE collections SET deleted_at = datetime('now') WHERE id = ?").run(c.id);
    res.redirect('/admin/collections?msg=collection-deleted');
  });

  return router;
};

module.exports.KINDS = KINDS;
