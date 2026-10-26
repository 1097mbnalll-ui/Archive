// أدوات مشتركة للصور: قراءة بياناتها، وحفظ الملفات، واستخراج السنة من التاريخ.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const SIZES = {
  thumb: { width: 480, height: 480, quality: 72 },
  display: { width: 2000, height: 2000, quality: 82 }
};
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'tiff', 'avif']);
const LIMITS = { title: 200, story: 10000, date_text: 60, place: 120, personName: 80, newPeople: 20 };

function uploadDirs(dataDir) {
  const root = path.join(dataDir, 'uploads');
  const dirs = { tmp: path.join(root, 'tmp'), original: path.join(root, 'original'), display: path.join(root, 'display'), thumb: path.join(root, 'thumb') };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  return dirs;
}

// يحوّل الأرقام العربية (١٩٨٥) إلى أرقام عادية (1985).
function westernDigits(text) {
  return String(text).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0);
}

// يطلع سنة تقريبية من التاريخ المكتوب، عشان نرتب الصور. يفهم الميلادي والهجري.
function yearFrom(dateText) {
  const text = westernDigits(dateText);
  const gregorian = text.match(/(?:^|\D)(1[89]\d\d|20\d\d)(?!\d)/);
  if (gregorian) return Number(gregorian[1]);
  const hijri = text.match(/(?:^|\D)(1[34]\d\d)(?!\d)/);
  if (hijri) return Math.round(Number(hijri[1]) * 0.970229 + 621.5643);
  return null;
}

const clean = (value, max) => String(value === undefined || value === null ? '' : value).replace(/\r\n/g, '\n').trim().slice(0, max);

// يقرأ بيانات صورة من النموذج ويتحقق منها.
function readMeta(input, { collections }) {
  const errors = {};
  const values = {
    kind: input.kind === 'document' ? 'document' : 'photo',
    title: clean(input.title, LIMITS.title + 1),
    story: clean(input.story, LIMITS.story + 1),
    date_text: clean(input.date_text, LIMITS.date_text + 1).replace(/\s+/g, ' '),
    place: clean(input.place, LIMITS.place + 1).replace(/\s+/g, ' '),
    privacy: input.privacy === 'public' ? 'public' : 'family',
    album_id: input.album_id ? Number(input.album_id) : null,
    occasion_id: input.occasion_id ? Number(input.occasion_id) : null,
    people: [].concat(input.people || []).map(Number).filter((n) => Number.isInteger(n) && n > 0),
    new_people: String(input.new_people || '').split(/[،,\n]/).map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean)
  };
  for (const key of ['title', 'story', 'date_text', 'place']) {
    if (values[key].length > LIMITS[key]) errors[key] = 'النص طويل. الحد ' + LIMITS[key] + ' حرف.';
  }
  if (values.album_id && !collections.has('album:' + values.album_id)) errors.album_id = 'الألبوم هذا غير موجود';
  if (values.occasion_id && !collections.has('occasion:' + values.occasion_id)) errors.occasion_id = 'المناسبة هذي غير موجودة';
  if (values.new_people.length > LIMITS.newPeople) errors.new_people = 'كثير أسماء مرة وحدة. الحد ' + LIMITS.newPeople + '.';
  if (values.new_people.some((n) => n.length > LIMITS.personName)) errors.new_people = 'فيه اسم طويل. الحد ' + LIMITS.personName + ' حرف للاسم.';
  values.year = yearFrom(values.date_text);
  return { values, errors };
}

// مجموعة الألبومات والمناسبات الموجودة، للتحقق السريع.
function liveCollections(db) {
  const rows = db.prepare('SELECT id, kind FROM collections WHERE deleted_at IS NULL').all();
  return new Set(rows.map((r) => r.kind + ':' + r.id));
}

// يحفظ أسماء الأشخاص في الصورة، ويضيف الأسماء الجديدة لقائمة الأشخاص.
function setPeople(db, itemId, values) {
  const ids = new Set(values.people.filter((id) => db.prepare('SELECT 1 FROM people WHERE id = ? AND deleted_at IS NULL').get(id)));
  for (const name of values.new_people) {
    const existing = db.prepare('SELECT id FROM people WHERE name = ? AND deleted_at IS NULL').get(name);
    ids.add(existing ? existing.id : Number(db.prepare('INSERT INTO people (name) VALUES (?)').run(name).lastInsertRowid));
  }
  db.prepare('DELETE FROM item_people WHERE item_id = ?').run(itemId);
  const insert = db.prepare('INSERT INTO item_people (item_id, person_id) VALUES (?, ?)');
  for (const id of ids) insert.run(itemId, id);
}

// يفحص الملف المرفوع، ويسوي نسخة للعرض ونسخة مصغّرة. الملف الأصلي يبقى كما هو.
async function storeImage(file, dirs) {
  let meta;
  try {
    meta = await sharp(file.path, { animated: false }).metadata();
  } catch (err) {
    throw new UserError('الملف هذا مو صورة، أو نوعه غير مدعوم');
  }
  if (!ACCEPTED_FORMATS.has(meta.format)) {
    throw new UserError(meta.format === 'heif' ? 'صور الآيفون (HEIC) غير مدعومة. حوّلها إلى JPG أولًا.' : 'نوع الصورة غير مدعوم. المدعوم: JPG و PNG و WEBP و GIF.');
  }
  const base = crypto.randomBytes(16).toString('hex');
  const ext = meta.format === 'jpeg' ? 'jpg' : meta.format;
  const fileName = base + '.' + ext;
  const out = { thumb: path.join(dirs.thumb, base + '.webp'), display: path.join(dirs.display, base + '.webp') };
  try {
    // rotate() يعدّل اتجاه صور الجوال، والنسخ الجديدة ما تحمل معلومات الموقع الجغرافي.
    const info = await sharp(file.path).rotate()
      .resize({ width: SIZES.display.width, height: SIZES.display.height, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: SIZES.display.quality }).toFile(out.display);
    await sharp(file.path).rotate()
      .resize({ width: SIZES.thumb.width, height: SIZES.thumb.height, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: SIZES.thumb.quality }).toFile(out.thumb);
    fs.renameSync(file.path, path.join(dirs.original, fileName));
    return { fileName, base, mime: 'image/' + meta.format, width: info.width, height: info.height, size: file.size };
  } catch (err) {
    for (const p of Object.values(out)) fs.rmSync(p, { force: true });
    throw new UserError('ما قدرنا نقرأ الصورة. يمكن الملف خربان.');
  }
}

class UserError extends Error {}

function mediaPath(dirs, item, size) {
  const base = item.file_name.replace(/\.[^.]+$/, '');
  if (size === 'original') return path.join(dirs.original, item.file_name);
  return path.join(dirs[size], base + '.webp');
}

module.exports = { uploadDirs, yearFrom, westernDigits, readMeta, liveCollections, setPeople, storeImage, mediaPath, UserError, LIMITS };
