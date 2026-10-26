// بيانات الموقع: اللي دخل بكلمة سر الزوار يشوف "الكل" بس، وأصحاب الحسابات يشوفون كل شي.
const express = require('express');
const auth = require('../auth');

module.exports = function archiveApi(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const restricted = req.user.shared === 'visitor';
    const items = db.prepare(`
      SELECT i.id, i.kind, i.title, i.date_text, i.year, i.place, i.story, o.name AS occasion
      FROM items i LEFT JOIN collections o ON o.id = i.occasion_id AND o.deleted_at IS NULL
      WHERE i.deleted_at IS NULL ${restricted ? "AND i.privacy = 'public'" : ''}
      ORDER BY i.year IS NULL, i.year, i.id`).all();
    const visible = new Set(items.map((i) => i.id));

    const links = db.prepare('SELECT item_id, person_id FROM item_people').all().filter((l) => visible.has(l.item_id));
    const peopleOf = new Map();
    for (const l of links) {
      if (!peopleOf.has(l.item_id)) peopleOf.set(l.item_id, []);
      peopleOf.get(l.item_id).push(String(l.person_id));
    }
    const mentioned = new Set(links.map((l) => l.person_id));
    // اللي دخل بكلمة سر الزوار يشوف أسماء الأشخاص اللي لهم صور يقدر يشوفها بس.
    const people = db.prepare('SELECT id, name FROM people WHERE deleted_at IS NULL ORDER BY id').all()
      .filter((p) => !restricted || mentioned.has(p.id));
    const livePeople = new Set(people.map((p) => String(p.id)));

    res.set('Cache-Control', 'private, no-store');
    res.json({
      familyName: 'عائلتنا',
      viewer: { name: req.user.displayName, code: req.user.code, canEdit: auth.hasRole(req.user, 'editor') },
      csrf: req.csrf,
      people: people.map((p) => ({ id: String(p.id), name: p.name, image: null, born: '', bio: '' })),
      items: items.map((i) => ({
        id: String(i.id),
        type: i.kind,
        title: i.title || 'بدون عنوان',
        date: i.date_text,
        year: i.year,
        place: i.place,
        occasion: i.occasion || '',
        people: (peopleOf.get(i.id) || []).filter((id) => livePeople.has(id)),
        caption: '',
        story: i.story,
        image: '/media/' + i.id + '/display',
        thumb: '/media/' + i.id + '/thumb'
      }))
    });
  });

  return router;
};
