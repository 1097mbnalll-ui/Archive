// رفع الصور وتعديل بياناتها. للمحرر والمدير.
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');
const auth = require('../auth');
const { transaction } = require('../db');
const { uploadDirs, readMeta, liveCollections, setPeople, storeImage, UserError } = require('../items');

const MAX_FILE_MB = 25;
const FILES_PER_REQUEST = 20;
const PAGE_SIZE = 48;

module.exports = function itemsRouter(db, dataDir) {
  const router = express.Router();
  const dirs = uploadDirs(dataDir);
  const upload = multer({
    dest: dirs.tmp,
    limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: FILES_PER_REQUEST, fields: 400, fieldSize: 1024 * 1024 }
  });

  const people = db.prepare('SELECT id, name FROM people WHERE deleted_at IS NULL ORDER BY name');
  const collections = db.prepare('SELECT id, kind, name FROM collections WHERE deleted_at IS NULL ORDER BY name');
  const options = () => {
    const all = collections.all();
    return { people: people.all(), albums: all.filter((c) => c.kind === 'album'), occasions: all.filter((c) => c.kind === 'occasion') };
  };

  const insertItem = db.prepare(`
    INSERT INTO items (kind, title, story, date_text, year, place, album_id, occasion_id, privacy, file_name, original_name, mime, width, height, size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  // ---------- الرفع ----------

  router.get('/upload', (req, res) => res.render('upload', { ...options(), maxFileMb: MAX_FILE_MB, perRequest: FILES_PER_REQUEST }));

  router.post('/upload', (req, res, next) => {
    upload.array('files', FILES_PER_REQUEST)(req, res, (err) => {
      const files = req.files || [];
      const cleanup = () => files.forEach((f) => fs.rmSync(f.path, { force: true }));
      const wantsJson = (req.headers.accept || '').includes('application/json');
      const fail = (status, message) => {
        cleanup();
        return wantsJson ? res.status(status).json({ error: message }) : res.status(status).render('upload', { ...options(), maxFileMb: MAX_FILE_MB, perRequest: FILES_PER_REQUEST, error: message });
      };

      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'فيه صورة أكبر من ' + MAX_FILE_MB + ' ميجا'
          : err.code === 'LIMIT_FILE_COUNT' ? 'الحد ' + FILES_PER_REQUEST + ' صورة في كل دفعة'
          : 'صار خطأ في الرفع';
        return fail(400, message);
      }
      if (!auth.csrfValid(req)) return fail(403, auth.CSRF_MESSAGE);
      (async () => {
        if (!files.length) return fail(400, 'اختر صورة وحدة على الأقل');

        // كل صورة لها بياناتها (من الصفحة)، أو كلها تاخذ نفس البيانات (بدون جافاسكربت).
        let metas;
        try {
          metas = req.body.meta ? JSON.parse(req.body.meta) : files.map(() => req.body);
        } catch (e) {
          return fail(400, 'بيانات الصور فيها خطأ');
        }
        if (!Array.isArray(metas) || metas.length !== files.length) return fail(400, 'بيانات الصور ما تطابق عددها');

        const known = liveCollections(db);
        const results = [];
        for (let i = 0; i < files.length; i++) {
          const { values, errors } = readMeta(metas[i] || {}, { collections: known });
          if (Object.keys(errors).length) {
            fs.rmSync(files[i].path, { force: true });
            results.push({ index: i, errors });
            continue;
          }
          try {
            const stored = await storeImage(files[i], dirs);
            const id = transaction(db, () => {
              const newId = Number(insertItem.run(values.kind, values.title, values.story, values.date_text, values.year, values.place,
                values.album_id, values.occasion_id, values.privacy, stored.fileName, files[i].originalname.slice(0, 255),
                stored.mime, stored.width, stored.height, stored.size, req.user.id).lastInsertRowid);
              setPeople(db, newId, values);
              return newId;
            });
            results.push({ index: i, id });
          } catch (e) {
            fs.rmSync(files[i].path, { force: true });
            if (!(e instanceof UserError)) console.error(e);
            results.push({ index: i, error: e instanceof UserError ? e.message : 'صار خطأ وما انحفظت' });
          }
        }
        const saved = results.filter((r) => r.id).length;
        if (wantsJson) return res.json({ saved, results });
        if (saved === files.length) return res.redirect('/admin/items?msg=uploaded');
        res.status(400).render('upload', {
          ...options(), maxFileMb: MAX_FILE_MB, perRequest: FILES_PER_REQUEST,
          error: 'انحفظت ' + saved + ' من ' + files.length + '. الباقي فيه مشكلة: ' +
            results.filter((r) => !r.id).map((r) => files[r.index].originalname + ' (' + (r.error || Object.values(r.errors)[0]) + ')').join('، ')
        });
      })().catch(next);
    });
  });

  // ---------- قائمة الصور ----------

  router.get('/items', (req, res) => {
    const where = ['i.deleted_at IS NULL'];
    const params = [];
    const filters = {
      q: String(req.query.q || '').trim().slice(0, 100),
      album: Number(req.query.album) || null,
      person: Number(req.query.person) || null,
      privacy: ['public', 'family'].includes(req.query.privacy) ? req.query.privacy : ''
    };
    if (filters.q) {
      where.push("(i.title LIKE ? ESCAPE '\\' OR i.story LIKE ? ESCAPE '\\' OR i.place LIKE ? ESCAPE '\\' OR i.date_text LIKE ? ESCAPE '\\')");
      const like = '%' + filters.q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
      params.push(like, like, like, like);
    }
    if (filters.album) { where.push('i.album_id = ?'); params.push(filters.album); }
    if (filters.person) { where.push('EXISTS (SELECT 1 FROM item_people ip WHERE ip.item_id = i.id AND ip.person_id = ?)'); params.push(filters.person); }
    if (filters.privacy) { where.push('i.privacy = ?'); params.push(filters.privacy); }

    const total = db.prepare('SELECT COUNT(*) AS n FROM items i WHERE ' + where.join(' AND ')).get(...params).n;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
    const items = db.prepare(`
      SELECT i.id, i.kind, i.title, i.date_text, i.privacy, c.name AS album
      FROM items i LEFT JOIN collections c ON c.id = i.album_id AND c.deleted_at IS NULL
      WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`)
      .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    res.render('items', { ...options(), items, total, page, pages, filters });
  });

  // ---------- تعديل صورة ----------

  const getItem = db.prepare('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL');
  const itemPeople = db.prepare('SELECT person_id FROM item_people WHERE item_id = ?');

  router.get('/items/:id/edit', (req, res, next) => {
    const item = getItem.get(Number(req.params.id));
    if (!item) return next();
    const values = { ...item, people: itemPeople.all(item.id).map((r) => r.person_id) };
    res.render('item-edit', { ...options(), item, values, errors: {} });
  });

  router.post('/items/:id', (req, res, next) => {
    const item = getItem.get(Number(req.params.id));
    if (!item) return next();
    const { values, errors } = readMeta(req.body, { collections: liveCollections(db) });
    if (Object.keys(errors).length) {
      return res.status(400).render('item-edit', { ...options(), item, values: { ...values, new_people: req.body.new_people }, errors });
    }
    transaction(db, () => {
      db.prepare(`UPDATE items SET kind = ?, title = ?, story = ?, date_text = ?, year = ?, place = ?, album_id = ?, occasion_id = ?, privacy = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(values.kind, values.title, values.story, values.date_text, values.year, values.place, values.album_id, values.occasion_id, values.privacy, item.id);
      setPeople(db, item.id, values);
    });
    res.redirect('/admin/items/' + item.id + '/edit?msg=item-saved');
  });

  router.get('/items/:id/delete', (req, res, next) => {
    const item = getItem.get(Number(req.params.id));
    if (!item) return next();
    res.render('item-delete', { item });
  });

  router.post('/items/:id/delete', (req, res, next) => {
    const item = getItem.get(Number(req.params.id));
    if (!item) return next();
    db.prepare("UPDATE items SET deleted_at = datetime('now') WHERE id = ?").run(item.id);
    res.redirect('/admin/items?msg=item-deleted');
  });

  return router;
};
