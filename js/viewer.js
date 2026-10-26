// صفحات العرض: الخلية، وصفحة كل شخص، وصفحة كل صورة. الصور تنفك من التشفير داخل المتصفح.
import { el, byYear } from './dom.js';

const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function decadeOf(year) { return Math.floor(year / 10) * 10; }

function decadeName(decade) {
  const names = { 1940: 'الأربعينات', 1950: 'الخمسينات', 1960: 'الستينات', 1970: 'السبعينات', 1980: 'الثمانينات', 1990: 'التسعينات', 2000: 'الألفينات', 2010: 'العشرينات الأولى' };
  return names[decade] || String(decade);
}

// يرجع إحداثيات الخلايا حلقة بعد حلقة، والأولى هي النص.
function spiral(count) {
  const coords = [{ q: 0, r: 0, ring: 0 }];
  for (let k = 1; coords.length < count; k++) {
    let q = DIRS[4][0] * k;
    let r = DIRS[4][1] * k;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < k; step++) {
        coords.push({ q, r, ring: k });
        q += DIRS[side][0];
        r += DIRS[side][1];
      }
    }
  }
  return coords;
}

// يكمّل آخر حلقة بخلايا فاضية عشان شكل الخلية يكون كامل.
function fullRingCount(count) {
  let total = 1;
  for (let k = 1; total < count; k++) total += 6 * k;
  return total;
}

function hive(cells) {
  const coords = spiral(fullRingCount(cells.length));
  const W = 150;
  const H = W * 1.1547;
  const GAP = 6;
  const points = coords.map(({ q, r }) => ({ x: (W + GAP) * (q + r / 2), y: (H * 0.75 + GAP) * r }));
  const minX = Math.min(...points.map((p) => p.x)) - W / 2;
  const maxX = Math.max(...points.map((p) => p.x)) + W / 2;
  const minY = Math.min(...points.map((p) => p.y)) - H / 2;
  const maxY = Math.max(...points.map((p) => p.y)) + H / 2;
  const boxW = maxX - minX;
  const boxH = maxY - minY;

  const wrap = el('div', { class: 'hive', style: { maxWidth: Math.round(boxW * 1.05) + 'px', aspectRatio: boxW + ' / ' + boxH } });
  // عرض الخلية كنسبة من عرض الخلية الكاملة، عشان حجم الخط يتناسب معها.
  wrap.style.setProperty('--cw', W / boxW * 100);
  coords.forEach((c, i) => {
    const node = (cells[i] && cells[i].node) || el('div', { class: 'cell deco', 'aria-hidden': 'true' });
    Object.assign(node.style, {
      left: ((points[i].x - minX) / boxW * 100) + '%',
      top: ((points[i].y - minY) / boxH * 100) + '%',
      width: (W / boxW * 100) + '%',
      height: (H / boxH * 100) + '%',
      animationDelay: (c.ring * 110 + (i % 12) * 25) + 'ms'
    });
    wrap.append(node);
  });
  return wrap;
}

export function createViewer({ app, crumbs, vault, catalog }) {
  // نعرض بس اللي مو محذوف.
  const people = catalog.people.filter((p) => !p.deleted);
  const collectionName = Object.fromEntries(catalog.collections.filter((c) => !c.deleted).map((c) => [c.id, c.name]));
  const items = catalog.items.filter((i) => !i.deleted).map((i) => ({
    ...i, type: i.kind, date: i.date || '', occasionName: collectionName[i.occasion] || '',
    title: i.title || 'بدون عنوان', people: i.people || []
  }));
  const personById = Object.fromEntries(people.map((p) => [p.id, p]));
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const itemsOf = (personId) => items.filter((i) => i.people.includes(personId)).sort(byYear);

  // الصورة تنفك من التشفير، وبعدها تنحط خلفية للعنصر.
  function showImage(node, item, size, onLoad) {
    vault.mediaUrl(item, size).then((url) => {
      if (!url || !node.isConnected) return;
      node.style.backgroundImage = 'url("' + url + '")';
      if (onLoad) onLoad();
    });
  }

  // ---------- أنواع الخلايا ----------

  const centerCell = (label, sub) => ({ node: el('div', { class: 'cell center' }, [el('span', { class: 'label' }, label), sub ? el('span', { class: 'sub' }, sub) : null]) });

  function personCell(person) {
    const mine = itemsOf(person.id);
    const avatar = el('span', { class: 'avatar', 'aria-hidden': 'true' }, '[صورة]');
    const cover = mine.find((i) => i.kind === 'photo');
    if (cover) showImage(avatar, cover, 'thumb', () => { avatar.textContent = ''; });
    return {
      node: el('a', { class: 'cell person', href: '#/person/' + person.id }, [
        avatar, el('span', { class: 'label' }, person.name), el('span', { class: 'sub' }, mine.length + ' ذكرى')
      ])
    };
  }

  const navCell = (label, href, sub) => ({
    node: el('a', { class: 'cell nav', href }, [el('span', { class: 'label' }, label), sub ? el('span', { class: 'sub' }, sub) : null])
  });

  function itemCell(item, from) {
    const label = el('span', { class: 'thumb-label' }, item.type === 'document' ? '[مستند]' : '[صورة]');
    const node = el('a', {
      class: 'cell ' + item.type,
      href: '#/item/' + item.id + (from ? '?from=' + from : ''),
      'aria-label': item.title + (item.date ? '، ' + item.date : '')
    }, [label, item.date ? el('span', { class: 'sub' }, item.date) : null]);
    showImage(node, item, 'thumb', () => { node.classList.add('has-image'); label.remove(); });
    return { node };
  }

  // ---------- الصفحات ----------

  function setCrumbs(parts) {
    crumbs.replaceChildren();
    parts.forEach((part, i) => {
      if (i > 0) crumbs.append(el('span', { 'aria-hidden': 'true' }, '‹'));
      crumbs.append(part.href ? el('a', { href: part.href }, part.label) : el('span', { class: 'current', 'aria-current': 'page' }, part.label));
    });
  }

  const view = (hint, content) => el('section', { class: 'view' }, [el('p', { class: 'hint' }, hint), content]);

  function renderHome() {
    setCrumbs([{ label: 'العائلة' }]);
    const docs = items.filter((i) => i.type === 'document').length;
    const cells = [centerCell('عائلتنا', items.length + ' ذكرى')];
    // نعرض بس الأشخاص اللي لهم صور، عشان الخلية ما تزدحم بخانات فاضية.
    people.filter((p) => itemsOf(p.id).length).forEach((p) => cells.push(personCell(p)));
    cells.push(navCell('حسب السنة', '#/years'));
    cells.push(navCell('المناسبات', '#/occasions'));
    cells.push(navCell('المستندات', '#/documents', docs + ' مستند'));
    app.replaceChildren(view(items.length ? 'اضغط على أي خلية وتدخل على ذكرياته' : 'ما فيه صور في الأرشيف بعد.', hive(cells)));
  }

  function renderPerson(id) {
    const person = personById[id];
    if (!person) return renderNotFound();
    setCrumbs([{ label: 'العائلة', href: '#/' }, { label: person.name }]);
    const cells = [centerCell(person.name), navCell('→ رجوع للعائلة', '#/')];
    itemsOf(id).forEach((item) => cells.push(itemCell(item, 'person:' + id)));
    app.replaceChildren(view('كل خلية حول ' + person.name + ' صورة أو مستند', hive(cells)));
  }

  function groupItems(kind, key) {
    return items.filter((i) => kind === 'years' ? (i.year && decadeOf(i.year) === Number(key)) : i.occasion === key).sort(byYear);
  }

  function renderGroups(kind) {
    const isYears = kind === 'years';
    const title = isYears ? 'حسب السنة' : 'المناسبات';
    setCrumbs([{ label: 'العائلة', href: '#/' }, { label: title }]);
    const groups = new Map();
    items.slice().sort(byYear).forEach((item) => {
      const key = isYears ? (item.year ? decadeOf(item.year) : null) : (item.occasionName ? item.occasion : null);
      if (key !== null) groups.set(key, (groups.get(key) || 0) + 1);
    });
    const cells = [centerCell(title), navCell('→ رجوع للعائلة', '#/')];
    groups.forEach((count, key) => {
      cells.push(navCell(isYears ? decadeName(key) : collectionName[key], '#/' + kind + '/' + encodeURIComponent(key), count + ' ذكرى'));
    });
    app.replaceChildren(view(groups.size ? 'اختر ' + (isYears ? 'فترة' : 'مناسبة') : 'ما فيه شي هنا بعد.', hive(cells)));
  }

  function groupLabel(kind, key) {
    return kind === 'years' ? decadeName(Number(key)) : (collectionName[key] || '');
  }

  function renderGroup(kind, key) {
    const list = groupItems(kind, key);
    const label = groupLabel(kind, key);
    setCrumbs([{ label: 'العائلة', href: '#/' }, { label: kind === 'years' ? 'حسب السنة' : 'المناسبات', href: '#/' + kind }, { label }]);
    const cells = [centerCell(label, list.length + ' ذكرى'), navCell('→ رجوع', '#/' + kind)];
    list.forEach((item) => cells.push(itemCell(item, kind + ':' + key)));
    app.replaceChildren(view('اضغط على أي خلية وتفتح قصتها', hive(cells)));
  }

  function renderDocuments() {
    setCrumbs([{ label: 'العائلة', href: '#/' }, { label: 'المستندات' }]);
    const list = items.filter((i) => i.type === 'document').sort(byYear);
    const cells = [centerCell('المستندات', list.length + ' مستند'), navCell('→ رجوع للعائلة', '#/')];
    list.forEach((item) => cells.push(itemCell(item, 'documents')));
    app.replaceChildren(view('الأوراق والشهادات والرسائل', hive(cells)));
  }

  // يرجع قائمة الذكريات اللي جاء منها الزائر، عشان السابق والتالي.
  function contextList(from) {
    if (from) {
      const [kind, key] = from.split(':');
      if (kind === 'person' && personById[key]) return { list: itemsOf(key), back: { label: personById[key].name, href: '#/person/' + key } };
      if (kind === 'documents') return { list: items.filter((i) => i.type === 'document').sort(byYear), back: { label: 'المستندات', href: '#/documents' } };
      if (kind === 'years' || kind === 'occasions') return { list: groupItems(kind, key), back: { label: groupLabel(kind, key), href: '#/' + kind + '/' + encodeURIComponent(key) } };
    }
    return { list: items.slice().sort(byYear), back: { label: 'العائلة', href: '#/' } };
  }

  function renderItem(id, from) {
    const item = itemById[id];
    if (!item) return renderNotFound();
    const ctx = contextList(from);
    setCrumbs([{ label: 'العائلة', href: '#/' }].concat(ctx.back.href === '#/' ? [] : [ctx.back], [{ label: item.title }]));
    const index = ctx.list.findIndex((i) => i.id === id);
    const prev = ctx.list[index - 1];
    const next = ctx.list[index + 1];
    const suffix = from ? '?from=' + from : '';
    const details = [['التاريخ', item.date], ['المكان', item.place], ['المناسبة', item.occasionName], ['النوع', item.type === 'document' ? 'مستند' : 'صورة']].filter(([, v]) => v);

    // الصورة خلفية بدل <img>، عشان ما تطلع لها قائمة "حفظ الصورة".
    const photo = el('div', { class: 'photo', role: 'img', 'aria-label': item.title });
    showImage(photo, item, 'display');
    app.replaceChildren(el('section', { class: 'view' }, el('div', { class: 'item' }, [
      el('figure', null, [photo]),
      el('article', null, [
        el('h1', null, item.title),
        el('dl', null, details.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, v)])),
        item.people.some((p) => personById[p]) ? el('div', null, [
          el('p', { class: 'in-photo' }, 'في الصورة'),
          el('div', { class: 'chips' }, item.people.filter((p) => personById[p]).map((p) => el('a', { class: 'chip', href: '#/person/' + p }, personById[p].name)))
        ]) : null,
        item.story ? el('div', { class: 'story' }, [el('h2', null, 'القصة'), el('p', null, item.story)]) : null,
        el('nav', { class: 'pager', 'aria-label': 'التنقل بين الذكريات' }, [
          prev ? el('a', { href: '#/item/' + prev.id + suffix }, '→ السابقة') : el('span'),
          next ? el('a', { href: '#/item/' + next.id + suffix }, 'التالية ←') : el('span')
        ])
      ])
    ])));
  }

  function renderNotFound() {
    setCrumbs([{ label: 'العائلة', href: '#/' }]);
    app.replaceChildren(view('ما لقينا هذي الصفحة', el('a', { class: 'btn', href: '#/' }, 'رجوع للعائلة')));
  }

  return function route(parts, query) {
    const from = new URLSearchParams(query || '').get('from');
    if (parts.length === 0) renderHome();
    else if (parts[0] === 'person') renderPerson(parts[1]);
    else if (parts[0] === 'item') renderItem(parts[1], from);
    else if (parts[0] === 'documents') renderDocuments();
    else if ((parts[0] === 'years' || parts[0] === 'occasions') && parts[1]) renderGroup(parts[0], parts[1]);
    else if (parts[0] === 'years' || parts[0] === 'occasions') renderGroups(parts[0]);
    else renderNotFound();
  };
}
