// لوحة الإدارة: رفع الصور، وتعديلها، والألبومات والمناسبات، والمحذوفات، وكلمات السر.
// كل حفظ يتشفّر هنا في المتصفح، وبعدها ينرسل لـ GitHub.
import { el, byYear, yearFrom } from './dom.js';
import { randomId } from './crypto.js';
import { GitHub } from './github.js';
import { PATHS } from './vault.js';

const LIMITS = { title: 200, story: 10000, date: 60, place: 120, personName: 80, newPeople: 20, collectionName: 100, description: 1000 };
const MAX_FILE_MB = 40;
const MAX_PIXELS = 100 * 1000 * 1000;
const PER_COMMIT = 20;
const PAGE_SIZE = 48;
const SIZES = { thumb: { max: 480, quality: 0.75 }, display: { max: 1800, quality: 0.85 } };
const TOKEN_KEY = 'archive-github-token';

export const savedToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
const saveToken = (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* لا شي */ } };
const forgetToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* لا شي */ } };

// العدد بالعربي: صورة وحدة، صورتين، 3 صور، 11 صورة.
function countText(n) {
  if (n === 1) return 'صورة وحدة';
  if (n === 2) return 'صورتين';
  return n + (n >= 3 && n <= 10 ? ' صور' : ' صورة');
}

const clean = (v, max) => String(v === undefined || v === null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max + 1);

// ---------- معالجة الصورة في المتصفح ----------
// نصغّرها ونحوّلها JPEG. الرسم على canvas يشيل معلومات الموقع الجغرافي (GPS) من الصورة.

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function resize(img, { max, quality }) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  canvas.width = canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

async function prepareImage(file) {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error('الصورة أكبر من ' + MAX_FILE_MB + ' ميجا');
  let img;
  try {
    img = await loadImage(file);
  } catch (e) {
    throw new Error(/heic|heif/i.test(file.type + file.name) ? 'المتصفح هذا ما يقرأ صور الآيفون (HEIC). ارفعها من الآيفون نفسه أو حوّلها JPG.' : 'الملف هذا مو صورة، أو نوعه غير مدعوم');
  }
  if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) throw new Error('أبعاد الصورة كبيرة جدًا. صغّرها وجرّب مرة ثانية.');
  return { thumb: await resize(img, SIZES.thumb), display: await resize(img, SIZES.display) };
}

// ---------- خانات بيانات الصورة ----------

function field(id, label, hint, control, key) {
  const hintId = id + '-hint';
  control.id = id;
  if (hint) control.setAttribute('aria-describedby', hintId + ' ' + id + '-error');
  else control.setAttribute('aria-describedby', id + '-error');
  return el('div', { class: 'field', 'data-field': key }, [
    el('label', { for: id }, label),
    control,
    hint ? el('span', { class: 'hint', id: hintId }, hint) : null,
    el('span', { class: 'error field-error', id: id + '-error', hidden: true })
  ]);
}

const PRIVACY_HINT = {
  public: 'كل من يدخل الموقع بكلمة سر الزوار.',
  family: 'المدير بس. اللي يدخلون بكلمة سر الزوار ما يشوفونها.'
};

function metaFields(prefix, values, catalog, { compact } = {}) {
  const live = (kind) => catalog.collections.filter((c) => c.kind === kind && !c.deleted);
  const options = (list, selected, empty) => [el('option', { value: '' }, empty)].concat(list.map((c) => el('option', { value: c.id, selected: c.id === selected }, c.name)));
  const chosen = new Set(values.people || []);

  const privacySelect = el('select', { name: 'privacy' }, [
    el('option', { value: 'public', selected: values.privacy !== 'family' }, 'كل العائلة'),
    el('option', { value: 'family', selected: values.privacy === 'family' }, 'خاصة: المدير بس')
  ]);
  const privacyField = field(prefix + 'privacy', 'مين يشوفها؟', PRIVACY_HINT[values.privacy === 'family' ? 'family' : 'public'], privacySelect, 'privacy');
  privacySelect.addEventListener('change', () => { privacyField.querySelector('.hint').textContent = PRIVACY_HINT[privacySelect.value]; });

  const top = el('div', { class: 'form-grid' }, [
    field(prefix + 'title', 'العنوان', 'مثل: عرس عمي سعد', el('input', { name: 'title', maxlength: LIMITS.title, value: values.title || '' }), 'title'),
    field(prefix + 'date', 'التاريخ', 'اكتبه زي ما تعرفه: 1985، أو تقريبًا 1400هـ، أو صيف الثمانينات', el('input', { name: 'date', maxlength: LIMITS.date, value: values.date || '' }), 'date'),
    privacyField
  ]);
  const people = el('fieldset', { class: 'field', 'data-field': 'people' }, [
    el('legend', { class: 'legend' }, 'مين في الصورة؟'),
    el('div', { class: 'choices' }, catalog.people.filter((p) => !p.deleted).map((p) =>
      el('label', { class: 'choice' }, [el('input', { type: 'checkbox', name: 'people', value: p.id, checked: chosen.has(p.id) }), el('span', { title: p.name }, p.name)])))
  ]);
  const kind = el('select', { name: 'kind' }, [
    el('option', { value: 'photo', selected: values.kind !== 'document' }, 'صورة'),
    el('option', { value: 'document', selected: values.kind === 'document' }, 'مستند (ورقة، شهادة، رسالة)')
  ]);
  const albums = live('album');
  const occasions = live('occasion');
  const rest = el('div', { class: 'form' }, [
    el('div', { class: 'form-grid' }, [
      field(prefix + 'place', 'المكان', 'مثل: بيت جدي في الطائف', el('input', { name: 'place', maxlength: LIMITS.place, value: values.place || '' }), 'place'),
      field(prefix + 'kind', 'النوع', '', kind, 'kind'),
      field(prefix + 'album', 'الألبوم', albums.length ? '' : 'ما فيه ألبومات بعد.', el('select', { name: 'album' }, options(albums, values.album, 'بدون ألبوم')), 'album'),
      field(prefix + 'occasion', 'المناسبة', occasions.length ? '' : 'ما فيه مناسبات بعد.', el('select', { name: 'occasion' }, options(occasions, values.occasion, 'بدون مناسبة')), 'occasion')
    ]),
    field(prefix + 'newPeople', 'أسماء ما هي في القائمة', 'اكتبها وافصل بينها بفاصلة، وبتنضاف للقائمة. مثل: سعد، أم فهد', el('input', { name: 'newPeople', value: values.newPeople || '' }), 'newPeople'),
    field(prefix + 'story', 'القصة', 'وش صار ذاك اليوم؟ مين صوّرها؟ أي شي تبغى العائلة تتذكره.', el('textarea', { name: 'story', maxlength: LIMITS.story }, values.story || ''), 'story')
  ]);
  if (compact) {
    return el('div', { class: 'form' }, [top, people, el('details', { class: 'more' }, [el('summary', null, 'تفاصيل أكثر: المكان، الألبوم، المناسبة، القصة'), rest])]);
  }
  return el('div', { class: 'form' }, [top, people, rest]);
}

function readMetaFrom(root) {
  const get = (name) => { const node = root.querySelector('[name="' + name + '"]'); return node ? node.value : ''; };
  return {
    title: get('title'), date: get('date'), place: get('place'), kind: get('kind'), privacy: get('privacy'),
    album: get('album'), occasion: get('occasion'), newPeople: get('newPeople'), story: get('story'),
    people: [...root.querySelectorAll('[name="people"]:checked')].map((n) => n.value)
  };
}

function writeMetaTo(root, values) {
  for (const name of ['title', 'date', 'place', 'kind', 'privacy', 'album', 'occasion', 'newPeople', 'story']) {
    const node = root.querySelector('[name="' + name + '"]');
    if (node && values[name] !== undefined) { node.value = values[name]; node.dispatchEvent(new Event('change')); }
  }
  const people = new Set(values.people || []);
  root.querySelectorAll('[name="people"]').forEach((n) => { n.checked = people.has(n.value); });
}

// يتحقق من البيانات ويرجع نسخة نظيفة منها، أو أخطاء لكل خانة.
function validateMeta(input, catalog) {
  const errors = {};
  const values = {
    title: clean(input.title, LIMITS.title), date: clean(input.date, LIMITS.date).replace(/\s+/g, ' '),
    place: clean(input.place, LIMITS.place).replace(/\s+/g, ' '), story: clean(input.story, LIMITS.story),
    kind: input.kind === 'document' ? 'document' : 'photo', privacy: input.privacy === 'family' ? 'family' : 'public',
    album: input.album || null, occasion: input.occasion || null,
    people: (input.people || []).filter((id) => catalog.people.some((p) => p.id === id && !p.deleted)),
    newPeople: String(input.newPeople || '').split(/[،,\n]/).map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean)
  };
  for (const key of ['title', 'date', 'place', 'story']) if (values[key].length > LIMITS[key]) errors[key] = 'النص طويل. الحد ' + LIMITS[key] + ' حرف.';
  if (values.album && !catalog.collections.some((c) => c.id === values.album && c.kind === 'album' && !c.deleted)) errors.album = 'الألبوم هذا غير موجود';
  if (values.occasion && !catalog.collections.some((c) => c.id === values.occasion && c.kind === 'occasion' && !c.deleted)) errors.occasion = 'المناسبة هذي غير موجودة';
  if (values.newPeople.length > LIMITS.newPeople) errors.newPeople = 'كثير أسماء مرة وحدة. الحد ' + LIMITS.newPeople + '.';
  if (values.newPeople.some((n) => n.length > LIMITS.personName)) errors.newPeople = 'فيه اسم طويل. الحد ' + LIMITS.personName + ' حرف للاسم.';
  values.year = yearFrom(values.date);
  return { values, errors };
}

// يضيف الأسماء الجديدة لقائمة الأشخاص (بدون تكرار)، ويرجع كل الأشخاص في الصورة.
function resolvePeople(catalog, values) {
  const ids = new Set(values.people);
  for (const name of values.newPeople) {
    let person = catalog.people.find((p) => p.name === name && !p.deleted);
    if (!person) { person = { id: randomId(), name }; catalog.people.push(person); }
    ids.add(person.id);
  }
  return [...ids];
}

function showFieldErrors(root, errors) {
  root.querySelectorAll('.field-error').forEach((n) => { n.hidden = true; n.textContent = ''; });
  root.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  for (const [key, message] of Object.entries(errors)) {
    const f = root.querySelector('[data-field="' + key + '"]');
    if (!f) continue;
    const err = f.querySelector('.field-error');
    if (err) { err.textContent = message; err.hidden = false; }
    const control = f.querySelector('input, select, textarea');
    if (control) control.setAttribute('aria-invalid', 'true');
    const more = f.closest('details');
    if (more) more.open = true;
  }
}

// ---------- اللوحة ----------

export function createAdmin({ root, vault, config, getCatalog, setCatalog, onLogout, onLeave }) {
  let message = null;

  const NAV = [
    ['#/admin', 'الرئيسية'], ['#/admin/upload', 'رفع صور'], ['#/admin/items', 'الصور'],
    ['#/admin/collections', 'الألبومات والمناسبات'], ['#/admin/trash', 'المحذوفات'], ['#/admin/passwords', 'كلمات السر']
  ];

  function frame(active, title, content) {
    document.title = title + ' · أرشيف العائلة';
    const flash = message;
    message = null;
    root.replaceChildren(
      el('a', { class: 'skip', href: '#main' }, 'تخطَّ إلى المحتوى'),
      el('header', { class: 'bar' }, el('div', { class: 'bar-inner' }, [
        el('a', { class: 'brand', href: '#/admin' }, 'أرشيف العائلة'),
        el('nav', { class: 'nav', 'aria-label': 'القائمة الرئيسية' }, NAV.map(([href, label]) =>
          el('a', { href, 'aria-current': href === active ? 'page' : null }, label))),
        el('div', { class: 'who' }, [
          el('span', { class: 'role role-admin' }, 'مدير'),
          el('a', { href: '#/' }, 'الموقع'),
          el('button', { type: 'button', class: 'link', onclick: onLogout }, 'خروج')
        ])
      ])),
      el('main', { id: 'main', class: 'page' }, [
        flash ? el('p', { class: flash.error ? 'error' : 'flash', role: 'status' }, flash.text) : null,
        ...[].concat(content)
      ])
    );
    window.scrollTo(0, 0);
  }

  const pageHead = (title, sub, action) => el('div', { class: 'page-head' }, [el('div', null, [el('h1', null, title), sub ? el('p', null, sub) : null]), action || null]);
  const flash = (text, error) => { message = { text, error }; };

  // كل تعديل: نجيب آخر نسخة من GitHub، نعدّل، ونحفظ.
  async function mutate(change, messageText, extraFiles = {}, onProgress) {
    const catalog = await vault.loadCatalog();
    const result = await change(catalog);
    const files = typeof extraFiles === 'function' ? await extraFiles(catalog, result) : extraFiles;
    await vault.save(catalog, files, messageText, onProgress);
    setCatalog(catalog);
    return result;
  }

  // زر يتعطل وقت الحفظ، ويرجع لو صار خطأ.
  async function busy(button, task) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'جاري الحفظ…';
    try { return await task(); } finally { button.disabled = false; button.textContent = label; }
  }

  function errorBox(error) {
    return el('p', { class: 'error', role: 'alert' }, error.message || String(error));
  }

  const thumb = (item, cls = '') => {
    const img = el('img', { alt: '', class: cls, loading: 'lazy' });
    vault.mediaUrl(item, 'thumb').then((url) => { if (url) img.src = url; });
    return img;
  };

  const tile = (item, extra) => el('a', { class: 'tile', href: '#/admin/items/' + item.id }, [
    thumb(item),
    el('span', { class: 'meta' }, [
      el('span', { class: 'title', title: item.title || '' }, item.title || 'بدون عنوان'),
      el('span', { class: 'sub' }, [
        el('span', { class: 'privacy privacy-' + item.privacy }, item.privacy === 'family' ? 'خاصة' : 'الكل'),
        item.date ? el('span', null, item.date) : null,
        extra || null
      ])
    ])
  ]);

  // ---------- الرئيسية ----------

  function dashboard() {
    const c = getCatalog();
    const items = c.items.filter((i) => !i.deleted);
    const stat = (num, what, href) => el('a', { class: 'stat', href }, [el('span', { class: 'num' }, num.toLocaleString('ar-SA')), el('span', { class: 'what' }, what)]);
    const latest = items.slice().sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 8);
    frame('#/admin', 'الرئيسية', [
      pageHead('أهلًا', 'نظرة سريعة على الأرشيف.', el('a', { class: 'btn', href: '#/admin/upload' }, 'رفع صور')),
      el('div', { class: 'stats' }, [
        stat(items.filter((i) => i.kind === 'photo').length, 'صورة', '#/admin/items'),
        stat(items.filter((i) => i.kind === 'document').length, 'مستند', '#/admin/items'),
        stat(items.filter((i) => i.privacy === 'family').length, 'خاصة بالمدير', '#/admin/items?privacy=family'),
        stat(c.collections.filter((x) => x.kind === 'album' && !x.deleted).length, 'ألبوم', '#/admin/collections'),
        stat(c.collections.filter((x) => x.kind === 'occasion' && !x.deleted).length, 'مناسبة', '#/admin/collections')
      ]),
      el('section', { class: 'section' }, [
        el('div', { class: 'page-head' }, [el('h2', null, 'آخر الإضافات'), latest.length ? el('a', { href: '#/admin/items' }, 'كل الصور') : null]),
        latest.length
          ? el('ul', { class: 'grid', role: 'list' }, latest.map((i) => el('li', null, tile(i))))
          : el('div', { class: 'empty' }, [el('h3', null, 'الأرشيف فاضي'), el('p', { class: 'note' }, 'ارفع أول صور، وبتطلع هنا.'), el('a', { class: 'btn', href: '#/admin/upload' }, 'رفع صور')])
      ])
    ]);
  }

  // ---------- رفع الصور ----------

  function upload() {
    const catalog = getCatalog();
    const entries = [];
    let working = false;
    let counter = 0;

    const status = el('p', { class: 'note', role: 'status', 'aria-live': 'polite' });
    const progress = el('progress', { class: 'progress', max: 100, value: 0, hidden: true });
    const save = el('button', { class: 'btn', type: 'button' }, 'احفظ الصور');
    const list = el('div', { class: 'previews' });
    const count = el('span', { class: 'note' });
    const input = el('input', { class: 'sr-only', id: 'files', type: 'file', accept: 'image/*', multiple: true });
    const shared = metaFields('shared-', { privacy: 'public' }, catalog);
    const drop = el('label', { class: 'drop', for: 'files', tabindex: '0', role: 'button' }, [
      el('strong', null, 'اختر صور من جهازك'),
      el('span', { class: 'note' }, 'أو اسحبها وأفلتها هنا. تقدر تختار أكثر من صورة مرة وحدة.'),
      el('span', { class: 'note' }, 'الصور تتصغّر وتتشفّر في جهازك قبل ما تنرفع. احتفظ بالأصلية عندك.')
    ]);

    function refresh() {
      const ready = entries.filter((e) => !e.problem).length;
      count.textContent = entries.length ? '(' + entries.length + ')' : '';
      save.textContent = ready ? 'احفظ ' + countText(ready) : 'احفظ الصور';
      save.disabled = working || !ready;
    }

    function cardError(entry, text, errors) {
      entry.card.classList.add('bad');
      const box = entry.card.querySelector('.card-error');
      box.textContent = text;
      box.hidden = false;
      showFieldErrors(entry.card, errors || {});
    }

    function remove(entry, focus) {
      const i = entries.indexOf(entry);
      if (i < 0) return;
      entries.splice(i, 1);
      if (entry.url) URL.revokeObjectURL(entry.url);
      entry.card.remove();
      refresh();
      if (focus) { const next = entries[i] || entries[i - 1]; (next ? next.card.querySelector('.remove') : drop).focus(); }
    }

    function add(files) {
      const defaults = readMetaFrom(shared);
      for (const file of [...files].slice(0, 500 - entries.length)) {
        const id = 'c' + (++counter) + '-';
        const entry = { file, problem: file.type && !file.type.startsWith('image/') ? 'الملف هذا مو صورة' : null };
        const img = el('img', { class: 'thumb', alt: 'معاينة ' + file.name, loading: 'lazy' });
        if (!entry.problem) { entry.url = URL.createObjectURL(file); img.src = entry.url; img.onerror = () => { img.hidden = true; }; }
        const fields = metaFields(id, defaults, catalog, { compact: true });
        entry.card = el('article', { class: 'preview' }, [
          el('div', { class: 'side' }, [img, el('span', { class: 'file-name' }, file.name),
            el('button', { type: 'button', class: 'btn small secondary remove', onclick: () => remove(entry, true) }, 'شيلها من القائمة')]),
          el('div', { class: 'form' }, [el('p', { class: 'error card-error', role: 'alert', hidden: true }), fields])
        ]);
        writeMetaTo(entry.card, defaults);
        if (entry.problem) cardError(entry, entry.problem);
        entries.push(entry);
        list.append(entry.card);
      }
      refresh();
    }

    input.addEventListener('change', () => { add(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer) add(e.dataTransfer.files); });
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });

    save.addEventListener('click', async () => {
      const ready = entries.filter((e) => !e.problem);
      if (!ready.length || working) return;
      working = true;
      refresh();
      progress.hidden = false;
      progress.value = 0;
      let saved = 0;
      let failed = 0;
      for (let start = 0; start < ready.length; start += PER_COMMIT) {
        const batch = ready.slice(start, start + PER_COMMIT);
        const prepared = [];
        // نجهّز الصور (تصغير وتشفير) وحدة وحدة عشان ما نثقّل الجوال.
        for (const entry of batch) {
          status.textContent = 'نجهّز الصور… ' + (saved + prepared.length + 1) + ' من ' + ready.length;
          const { values, errors } = validateMeta(readMetaFrom(entry.card), getCatalog());
          if (Object.keys(errors).length) { failed++; cardError(entry, 'فيه خانات تحتاج تصحيح', errors); continue; }
          try {
            const images = await prepareImage(entry.file);
            prepared.push({ entry, values, images });
          } catch (err) {
            failed++;
            cardError(entry, err.message);
          }
        }
        if (!prepared.length) continue;
        status.textContent = 'نرفع ' + countText(prepared.length) + ' لـ GitHub…';
        try {
          await mutate((cat) => {
            for (const p of prepared) {
              p.item = {
                id: randomId(), media: randomId(), kind: p.values.kind, title: p.values.title, story: p.values.story,
                date: p.values.date, year: p.values.year, place: p.values.place, album: p.values.album, occasion: p.values.occasion,
                privacy: p.values.privacy, people: resolvePeople(cat, p.values), created: new Date().toISOString()
              };
              cat.items.push(p.item);
            }
          }, 'رفع ' + countText(prepared.length), async () => {
            const files = {};
            for (const p of prepared) {
              files[PATHS.media(p.item.media, 'thumb')] = await vault.encryptMedia(p.item.privacy, p.images.thumb);
              files[PATHS.media(p.item.media, 'display')] = await vault.encryptMedia(p.item.privacy, p.images.display);
            }
            return files;
          }, (ratio) => { progress.value = Math.round(((start + ratio * prepared.length) / ready.length) * 100); });
          saved += prepared.length;
          prepared.forEach((p) => remove(p.entry, false));
        } catch (err) {
          failed += prepared.length;
          prepared.forEach((p) => cardError(p.entry, err.message));
        }
      }
      working = false;
      progress.hidden = true;
      refresh();
      if (!failed && !entries.length) {
        flash('انحفظت ' + countText(saved) + '. بتظهر للزوار خلال دقيقة أو دقيقتين.');
        location.hash = '#/admin/items';
        return;
      }
      status.textContent = (saved ? 'انحفظت ' + countText(saved) + '. ' : 'ما انحفظ شي. ') + (failed ? 'فيه ' + countText(failed) + ' ما انحفظت، وهي باقية تحت.' : '');
    });

    const apply = el('button', { type: 'button', class: 'btn secondary', onclick: () => {
      const values = readMetaFrom(shared);
      entries.forEach((e) => writeMetaTo(e.card, values));
      status.textContent = 'طبّقنا البيانات المشتركة على ' + countText(entries.length) + '.';
    } }, 'طبّق على كل الصور اللي تحت');

    frame('#/admin/upload', 'رفع صور', [
      pageHead('رفع صور', 'اختر الصور، اكتب بياناتها، وبعدها اضغط حفظ. ما ينحفظ شي قبل ما تضغط حفظ.'),
      drop, input,
      el('section', { class: 'panel', 'aria-labelledby': 'shared-heading' }, [
        el('div', null, [el('h2', { id: 'shared-heading' }, 'بيانات مشتركة'), el('p', { class: 'note' }, 'اللي تكتبه هنا ينطبق على كل الصور الجديدة. وبعدها تقدر تعدّل كل صورة لحالها.')]),
        shared, el('div', { class: 'actions' }, apply)
      ]),
      el('section', { class: 'section' }, [el('h2', null, ['الصور المختارة ', count]), list]),
      el('div', { class: 'sticky-save' }, [status, el('div', { class: 'actions' }, [progress, save])])
    ]);
    refresh();
  }

  // ---------- قائمة الصور ----------

  function itemsPage(query) {
    const c = getCatalog();
    const q = new URLSearchParams(query || '');
    const filters = { q: (q.get('q') || '').trim(), album: q.get('album') || '', occasion: q.get('occasion') || '', person: q.get('person') || '', privacy: q.get('privacy') || '' };
    let items = c.items.filter((i) => !i.deleted);
    if (filters.q) { const t = filters.q.toLowerCase(); items = items.filter((i) => [i.title, i.story, i.place, i.date].some((v) => (v || '').toLowerCase().includes(t))); }
    if (filters.album) items = items.filter((i) => i.album === filters.album);
    if (filters.occasion) items = items.filter((i) => i.occasion === filters.occasion);
    if (filters.person) items = items.filter((i) => (i.people || []).includes(filters.person));
    if (filters.privacy) items = items.filter((i) => i.privacy === filters.privacy);
    items.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, Number(q.get('page')) || 1));
    const shown = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const filtered = Object.values(filters).some(Boolean);
    const link = (p) => { const s = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)); if (p > 1) s.set('page', p); const t = s.toString(); return '#/admin/items' + (t ? '?' + t : ''); };
    const select = (id, label, name, list, value) => el('div', { class: 'field' }, [el('label', { for: id }, label),
      el('select', { id, name }, [el('option', { value: '' }, 'الكل')].concat(list.map(([v, l]) => el('option', { value: v, selected: v === value }, l))))]);
    const live = (kind) => c.collections.filter((x) => x.kind === kind && !x.deleted).map((x) => [x.id, x.name]);
    const form = el('form', { class: 'filters', role: 'search', onsubmit: (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const s = new URLSearchParams([...data.entries()].filter(([, v]) => v));
      location.hash = '#/admin/items' + (s.toString() ? '?' + s : '');
    } }, [
      el('div', { class: 'field' }, [el('label', { for: 'q' }, 'بحث'), el('input', { id: 'q', name: 'q', type: 'search', value: filters.q, placeholder: 'عنوان، قصة، مكان، تاريخ' })]),
      select('f-album', 'الألبوم', 'album', live('album'), filters.album),
      select('f-occasion', 'المناسبة', 'occasion', live('occasion'), filters.occasion),
      select('f-person', 'الشخص', 'person', c.people.filter((p) => !p.deleted).map((p) => [p.id, p.name]), filters.person),
      select('f-privacy', 'مين يشوفها', 'privacy', [['public', 'كل العائلة'], ['family', 'خاصة']], filters.privacy),
      el('div', { class: 'actions' }, [el('button', { class: 'btn secondary', type: 'submit' }, 'اعرض'), filtered ? el('a', { href: '#/admin/items' }, 'مسح البحث') : null])
    ]);
    frame('#/admin/items', 'الصور', [
      pageHead('الصور', items.length + (filtered ? ' نتيجة' : ' صورة ومستند في الأرشيف') + '. اضغط على أي صورة وتعدّل بياناتها.', el('a', { class: 'btn', href: '#/admin/upload' }, 'رفع صور')),
      form,
      shown.length
        ? el('ul', { class: 'grid', role: 'list' }, shown.map((i) => el('li', null, tile(i))))
        : el('div', { class: 'empty' }, [el('h2', null, filtered ? 'ما فيه نتائج' : 'ما فيه صور بعد'), el('p', { class: 'note' }, filtered ? 'جرّب كلمة ثانية أو امسح البحث.' : 'ابدأ برفع أول صور للأرشيف.')]),
      pages > 1 ? el('nav', { class: 'pager', 'aria-label': 'الصفحات' }, [
        page > 1 ? el('a', { class: 'btn small secondary', href: link(page - 1) }, '→ السابقة') : null,
        el('span', null, 'صفحة ' + page + ' من ' + pages),
        page < pages ? el('a', { class: 'btn small secondary', href: link(page + 1) }, 'التالية ←') : null
      ]) : null
    ]);
  }

  // ---------- تعديل صورة ----------

  function itemEdit(id) {
    const c = getCatalog();
    const item = c.items.find((i) => i.id === id && !i.deleted);
    if (!item) return notFound();
    const fields = metaFields('e-', item, c);
    const photo = el('img', { alt: item.title || 'الصورة' });
    vault.mediaUrl(item, 'display').then((url) => { if (url) photo.src = url; });
    const errorSlot = el('div');
    const saveBtn = el('button', { class: 'btn', type: 'submit' }, 'حفظ التعديلات');
    const form = el('form', { class: 'form panel', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      errorSlot.replaceChildren();
      const { values, errors } = validateMeta(readMetaFrom(form), getCatalog());
      showFieldErrors(form, errors);
      if (Object.keys(errors).length) { errorSlot.append(el('p', { class: 'error', role: 'alert' }, 'فيه خانات تحتاج تصحيح.')); return; }
      try {
        await busy(saveBtn, () => mutate(async (cat) => {
          const target = cat.items.find((i) => i.id === id);
          if (!target) throw new Error('الصورة هذي ما عادت موجودة');
          let files = {};
          if (target.privacy !== values.privacy) {
            const moved = await vault.reencryptMedia(target, values.privacy);
            files = moved.files;
            target.media = moved.media;
          }
          Object.assign(target, {
            kind: values.kind, title: values.title, story: values.story, date: values.date, year: values.year,
            place: values.place, album: values.album, occasion: values.occasion, privacy: values.privacy,
            people: resolvePeople(cat, values), updated: new Date().toISOString()
          });
          return files;
        }, 'تعديل صورة', (cat, files) => files));
        flash('تم حفظ التعديلات');
        itemEdit(id);
      } catch (err) {
        errorSlot.append(errorBox(err));
      }
    } }, [fields, el('div', { class: 'actions' }, [saveBtn, el('a', { class: 'btn danger', href: '#/admin/items/' + id + '/delete' }, 'حذف الصورة')])]);
    frame('#/admin/items', 'تعديل صورة', [
      pageHead(item.title || 'صورة بدون عنوان', null, el('a', { href: '#/admin/items' }, 'رجوع للصور')),
      errorSlot,
      el('div', { class: 'edit' }, [el('figure', { class: 'photo' }, photo), form])
    ]);
  }

  // تأكيد قبل الحذف. الحذف ينقل للمحذوفات بس.
  function confirmDelete({ title, text, back, run, done }) {
    const errorSlot = el('div');
    const yes = el('button', { class: 'btn danger', type: 'button' }, 'نعم، انقله للمحذوفات');
    yes.addEventListener('click', async () => {
      errorSlot.replaceChildren();
      try { await busy(yes, run); flash(done); location.hash = back; } catch (err) { errorSlot.append(errorBox(err)); }
    });
    frame(null, title, el('div', { class: 'panel confirm' }, [
      el('h1', null, title), el('p', null, text),
      el('p', null, ['الحذف ', el('strong', null, 'مو نهائي'), ': ينتقل إلى المحذوفات وتقدر ترجعه.']),
      errorSlot, el('div', { class: 'actions' }, [yes, el('a', { class: 'btn secondary', href: back }, 'لا، رجوع')])
    ]));
  }

  function itemDelete(id) {
    const item = getCatalog().items.find((i) => i.id === id && !i.deleted);
    if (!item) return notFound();
    confirmDelete({
      title: 'حذف ' + (item.title || 'الصورة') + '؟', text: 'بتختفي من الأرشيف والموقع.', back: '#/admin/items',
      done: 'انتقلت الصورة إلى المحذوفات. تقدر ترجعها من هناك.',
      run: () => mutate((cat) => { const t = cat.items.find((i) => i.id === id); if (t) t.deleted = new Date().toISOString(); }, 'نقل صورة للمحذوفات')
    });
  }

  // ---------- الألبومات والمناسبات ----------

  function collections() {
    const c = getCatalog();
    const live = c.items.filter((i) => !i.deleted);
    const group = (kind, title, add) => {
      const rows = c.collections.filter((x) => x.kind === kind && !x.deleted);
      return el('section', { class: 'section' }, [
        el('div', { class: 'page-head' }, [el('h2', null, [title + ' ', el('span', { class: 'note' }, '(' + rows.length + ')')]), el('a', { class: 'btn secondary', href: '#/admin/collections/new?kind=' + kind }, add)]),
        rows.length ? el('ul', { class: 'grid wide', role: 'list' }, rows.map((x) => {
          const mine = live.filter((i) => i.album === x.id || i.occasion === x.id);
          return el('li', { class: 'tile' }, [
            mine.length ? thumb(mine[mine.length - 1]) : el('span', { class: 'noimg' }, 'فاضي'),
            el('span', { class: 'meta' }, [
              el('span', { class: 'title', title: x.name }, x.name),
              el('span', { class: 'sub' }, mine.length ? countText(mine.length) : 'ما فيه صور'),
              el('span', { class: 'actions' }, [
                mine.length ? el('a', { class: 'btn small secondary', href: '#/admin/items?' + kind + '=' + x.id }, 'الصور') : null,
                el('a', { class: 'btn small secondary', href: '#/admin/collections/' + x.id }, 'تعديل'),
                el('a', { class: 'btn small danger', href: '#/admin/collections/' + x.id + '/delete' }, 'حذف')
              ])
            ])
          ]);
        })) : el('div', { class: 'empty' }, el('p', null, 'ما فيه ' + title + ' بعد.'))
      ]);
    };
    frame('#/admin/collections', 'الألبومات والمناسبات', [
      pageHead('الألبومات والمناسبات', 'الألبوم مجموعة صور تختارها أنت. المناسبة يوم معيّن مثل عرس أو عيد.'),
      group('album', 'الألبومات', 'ألبوم جديد'), group('occasion', 'المناسبات', 'مناسبة جديدة')
    ]);
  }

  function collectionForm(id, query) {
    const c = getCatalog();
    const existing = id ? c.collections.find((x) => x.id === id && !x.deleted) : null;
    if (id && !existing) return notFound();
    const kind = existing ? existing.kind : (new URLSearchParams(query || '').get('kind') === 'occasion' ? 'occasion' : 'album');
    const one = kind === 'album' ? 'ألبوم' : 'مناسبة';
    const name = el('input', { name: 'name', maxlength: LIMITS.collectionName, value: existing ? existing.name : '' });
    const description = el('textarea', { name: 'description', maxlength: LIMITS.description }, existing ? existing.description || '' : '');
    const errorSlot = el('div');
    const saveBtn = el('button', { class: 'btn', type: 'submit' }, existing ? 'حفظ التعديلات' : 'إضافة');
    const form = el('form', { class: 'form panel confirm', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const value = name.value.trim().replace(/\s+/g, ' ');
      const errors = {};
      if (!value) errors.name = 'اكتب الاسم';
      else if (value.length > LIMITS.collectionName) errors.name = 'الاسم طويل. الحد ' + LIMITS.collectionName + ' حرف.';
      else if (getCatalog().collections.some((x) => x.kind === kind && x.name === value && !x.deleted && x.id !== id)) errors.name = 'فيه ' + one + ' بنفس الاسم';
      if (description.value.trim().length > LIMITS.description) errors.description = 'الوصف طويل.';
      showFieldErrors(form, errors);
      if (Object.keys(errors).length) return;
      errorSlot.replaceChildren();
      try {
        await busy(saveBtn, () => mutate((cat) => {
          if (existing) Object.assign(cat.collections.find((x) => x.id === id), { name: value, description: description.value.trim() });
          else cat.collections.push({ id: randomId(), kind, name: value, description: description.value.trim() });
        }, existing ? 'تعديل ' + one : one + ' جديد'));
        flash(existing ? 'تم حفظ التعديلات' : 'تمت الإضافة');
        location.hash = '#/admin/collections';
      } catch (err) { errorSlot.append(errorBox(err)); }
    } }, [
      field('c-name', 'الاسم', kind === 'album' ? 'مثل: صور الطائف القديمة' : 'مثل: عرس عمي سعد ١٤٠٠هـ', name, 'name'),
      field('c-description', 'وصف (اختياري)', '', description, 'description'),
      errorSlot,
      el('div', { class: 'actions' }, [saveBtn, el('a', { class: 'btn secondary', href: '#/admin/collections' }, 'إلغاء')])
    ]);
    frame('#/admin/collections', existing ? 'تعديل ' + one : one + ' جديد', [pageHead(existing ? 'تعديل: ' + existing.name : (kind === 'album' ? 'ألبوم جديد' : 'مناسبة جديدة'), null, el('a', { href: '#/admin/collections' }, 'رجوع')), form]);
  }

  function collectionDelete(id) {
    const c = getCatalog();
    const x = c.collections.find((y) => y.id === id && !y.deleted);
    if (!x) return notFound();
    const n = c.items.filter((i) => !i.deleted && (i.album === id || i.occasion === id)).length;
    confirmDelete({
      title: 'حذف ' + x.name + '؟', back: '#/admin/collections',
      text: n ? 'فيه ' + countText(n) + '. الصور ما تنحذف، بس ما تكون مربوطة فيه لين ترجعه.' : 'فاضي.',
      done: 'انتقل إلى المحذوفات. الصور اللي فيه ما انحذفت.',
      run: () => mutate((cat) => { const t = cat.collections.find((y) => y.id === id); if (t) t.deleted = new Date().toISOString(); }, 'نقل للمحذوفات')
    });
  }

  // ---------- المحذوفات ----------

  function trash() {
    const c = getCatalog();
    const items = c.items.filter((i) => i.deleted);
    const cols = c.collections.filter((x) => x.deleted);
    const restoreBtn = (label, run) => {
      const b = el('button', { class: 'btn small secondary', type: 'button' }, 'استرجاع');
      b.setAttribute('aria-label', 'استرجاع ' + label);
      b.addEventListener('click', async () => {
        try { await busy(b, run); flash('تم الاسترجاع'); trash(); } catch (err) { flash(err.message, true); trash(); }
      });
      return b;
    };
    const table = (rows) => el('div', { class: 'table-wrap' }, el('table', { class: 'stack' }, [
      el('thead', null, el('tr', null, [el('th', { scope: 'col' }, 'الاسم'), el('th', { scope: 'col' }, 'انحذف في'), el('th', { scope: 'col' }, el('span', { class: 'sr-only' }, 'إجراءات'))])),
      el('tbody', null, rows)
    ]));
    frame('#/admin/trash', 'المحذوفات', [
      pageHead('المحذوفات', 'أي شي تحذفه يجي هنا، وتقدر ترجعه بضغطة. ما فيه شي ينحذف نهائيًا.'),
      !items.length && !cols.length ? el('div', { class: 'empty' }, [el('h2', null, 'السلة فاضية'), el('p', { class: 'note' }, 'ما فيه شي محذوف.')]) : null,
      items.length ? el('section', { class: 'section' }, [el('h2', null, 'الصور والمستندات (' + items.length + ')'), table(items.map((i) => el('tr', null, [
        el('td', { class: 'trash-name' }, [thumb(i, 'trash-thumb'), el('span', { class: 'clip' }, i.title || 'بدون عنوان')]),
        el('td', null, el('span', { class: 'ltr' }, (i.deleted || '').slice(0, 10))),
        el('td', null, restoreBtn(i.title || 'الصورة', () => mutate((cat) => { const t = cat.items.find((x) => x.id === i.id); if (t) delete t.deleted; }, 'استرجاع صورة')))
      ])))]) : null,
      cols.length ? el('section', { class: 'section' }, [el('h2', null, 'الألبومات والمناسبات (' + cols.length + ')'), table(cols.map((x) => el('tr', null, [
        el('td', null, el('span', { class: 'clip' }, x.name + (x.kind === 'album' ? ' (ألبوم)' : ' (مناسبة)'))),
        el('td', null, el('span', { class: 'ltr' }, (x.deleted || '').slice(0, 10))),
        el('td', null, restoreBtn(x.name, () => mutate((cat) => {
          const t = cat.collections.find((y) => y.id === x.id);
          if (cat.collections.some((y) => y.kind === t.kind && y.name === t.name && !y.deleted && y.id !== t.id)) throw new Error('ما قدرنا نسترجعه: فيه واحد بنفس الاسم الحين.');
          delete t.deleted;
        }, 'استرجاع')))
      ])))]) : null
    ]);
  }

  // ---------- كلمات السر ----------

  function passwords() {
    const section = (which, title, help) => {
      const pw = el('input', { type: 'password', name: 'password', autocomplete: 'new-password', maxlength: 200 });
      const again = el('input', { type: 'password', name: 'confirm', autocomplete: 'new-password', maxlength: 200 });
      const errorSlot = el('div');
      const btn = el('button', { class: 'btn', type: 'submit' }, 'غيّر كلمة السر');
      return el('section', { class: 'panel' }, [
        el('div', null, [el('h2', null, title), el('p', { class: 'note' }, help)]),
        el('form', { class: 'form', novalidate: true, onsubmit: async (e) => {
          e.preventDefault();
          errorSlot.replaceChildren();
          const fail = (t) => errorSlot.append(el('p', { class: 'error', role: 'alert' }, t));
          if (pw.value.length < 8) return fail('كلمة السر لازم تكون 8 أحرف أو أكثر');
          if (pw.value !== again.value) return fail('الكلمتين مو متطابقة. اكتبها مرة ثانية.');
          try {
            await busy(btn, async () => {
              if (await vault.isOtherPassword(which, pw.value)) throw new Error('لازم تكون مختلفة عن ' + (which === 'visitor' ? 'كلمة سر المدير' : 'كلمة سر الزوار') + '.');
              await vault.changePassword(which, pw.value);
            });
            flash('تم حفظ ' + title + '. الجديدة تشتغل خلال دقيقة أو دقيقتين.');
            passwords();
          } catch (err) { fail(err.message); }
        } }, [
          el('div', { class: 'form-grid' }, [field('p-' + which, 'كلمة سر جديدة', '8 أحرف أو أكثر', pw, 'password'), field('p-' + which + '-2', 'اكتبها مرة ثانية', '', again, 'confirm')]),
          errorSlot, el('div', { class: 'actions' }, btn)
        ])
      ]);
    };
    const forget = el('button', { class: 'btn danger', type: 'button', onclick: () => { forgetToken(); onLogout(); } }, 'افصل هذا الجهاز عن GitHub');
    frame('#/admin/passwords', 'كلمات السر', [
      pageHead('كلمات السر', 'الموقع كامل مقفول ومشفّر. أي أحد يبغى يدخل لازم يكتب وحدة من هذي الكلمات.'),
      section('visitor', 'كلمة سر الزوار', 'أي أحد يدخل بها يشوف الأرشيف بس.'),
      section('admin', 'كلمة سر المدير', 'تفتح كل شي، بما فيها الصور الخاصة. لا تعطيها إلا لشخص تثق فيه.'),
      el('section', { class: 'panel' }, [
        el('h2', null, 'تنبيه مهم'),
        el('p', null, 'تغيير كلمة السر يمنع الدخول بالقديمة من الموقع. بس اللي كان عنده الكلمة القديمة ونسخ ملفات الأرشيف المشفرة من GitHub قبل التغيير، يقدر يفكها. فلا تعطي كلمة السر إلا للعائلة.')
      ]),
      el('section', { class: 'panel' }, [
        el('h2', null, 'ربط هذا الجهاز بـ GitHub'),
        el('p', { class: 'note' }, 'مفتاح GitHub محفوظ في هذا الجهاز بس. لو الجهاز مو لك، افصله بعد ما تخلص.'),
        el('div', { class: 'actions' }, forget)
      ])
    ]);
  }

  // ---------- ربط الجهاز بـ GitHub ----------

  function connect(next) {
    const token = el('input', { type: 'password', name: 'token', autocomplete: 'off', dir: 'ltr' });
    const errorSlot = el('div');
    const btn = el('button', { class: 'btn', type: 'submit' }, 'اربط');
    frame(null, 'ربط الجهاز', el('div', { class: 'panel confirm' }, [
      el('h1', null, 'اربط هذا الجهاز بـ GitHub'),
      el('p', null, 'عشان تحفظ صور من هذا الجهاز، يحتاج مفتاح GitHub. تسويه مرة وحدة لكل جهاز. الخطوات في ملف README.'),
      el('form', { class: 'form', onsubmit: async (e) => {
        e.preventDefault();
        errorSlot.replaceChildren();
        try {
          await busy(btn, async () => {
            const gh = new GitHub(config, token.value.trim());
            await gh.check();
            saveToken(token.value.trim());
            vault.github = gh;
          });
          next();
        } catch (err) { errorSlot.append(errorBox(err)); }
      } }, [field('token', 'مفتاح GitHub', 'يبدأ بـ github_pat_', token, 'token'), errorSlot, el('div', { class: 'actions' }, [btn, el('a', { class: 'btn secondary', href: '#/' }, 'رجوع للموقع')])])
    ]));
  }

  function notFound() {
    frame(null, 'غير موجود', el('div', { class: 'empty' }, [el('h1', null, 'ما لقينا هذي الصفحة'), el('a', { class: 'btn', href: '#/admin' }, 'رجوع')]));
  }

  return function route(parts, query) {
    if (!vault.github) {
      const token = savedToken();
      if (!token) return connect(() => route(parts, query));
      vault.github = new GitHub(config, token);
    }
    const [, page, id, action] = parts;
    if (!page) dashboard();
    else if (page === 'upload') upload();
    else if (page === 'items' && !id) itemsPage(query);
    else if (page === 'items' && action === 'delete') itemDelete(id);
    else if (page === 'items') itemEdit(id);
    else if (page === 'collections' && !id) collections();
    else if (page === 'collections' && id === 'new') collectionForm(null, query);
    else if (page === 'collections' && action === 'delete') collectionDelete(id);
    else if (page === 'collections') collectionForm(id);
    else if (page === 'trash') trash();
    else if (page === 'passwords') passwords();
    else notFound();
  };
}
