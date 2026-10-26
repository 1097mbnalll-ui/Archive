(function () {
  const data = window.ARCHIVE;
  const app = document.getElementById('app');
  const topbar = document.getElementById('topbar');
  const crumbs = document.getElementById('crumbs');
  const AUTH_KEY = 'archive-auth';

  const personById = Object.fromEntries(data.people.map((p) => [p.id, p]));
  const itemById = Object.fromEntries(data.items.map((i) => [i.id, i]));
  const byYear = (a, b) => (a.year || 0) - (b.year || 0);

  // ---------- أدوات صغيرة ----------

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'style') Object.assign(node.style, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children || [])) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(child));
    }
    return node;
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function isAuthed() {
    try { return localStorage.getItem(AUTH_KEY) === data.passwordHash; } catch (e) { return false; }
  }

  function itemsOf(personId) {
    return data.items.filter((i) => i.people.includes(personId)).sort(byYear);
  }

  function decadeOf(year) {
    return Math.floor(year / 10) * 10;
  }

  function decadeName(decade) {
    const names = { 1940: 'الأربعينات', 1950: 'الخمسينات', 1960: 'الستينات', 1970: 'السبعينات', 1980: 'الثمانينات', 1990: 'التسعينات', 2000: 'الألفينات', 2010: 'العشرينات الأولى' };
    return names[decade] || String(decade);
  }

  // ---------- هندسة الخلية ----------

  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

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
    const total = fullRingCount(cells.length);
    const coords = spiral(total);
    const W = 150;
    const H = W * 1.1547;
    const GAP = 6;

    const points = coords.map(({ q, r }) => ({
      x: (W + GAP) * (q + r / 2),
      y: (H * 0.75 + GAP) * r
    }));
    const minX = Math.min(...points.map((p) => p.x)) - W / 2;
    const maxX = Math.max(...points.map((p) => p.x)) + W / 2;
    const minY = Math.min(...points.map((p) => p.y)) - H / 2;
    const maxY = Math.max(...points.map((p) => p.y)) + H / 2;
    const boxW = maxX - minX;
    const boxH = maxY - minY;

    const wrap = el('div', {
      class: 'hive',
      style: { maxWidth: Math.round(boxW * 1.05) + 'px', aspectRatio: boxW + ' / ' + boxH }
    });
    // عرض الخلية كنسبة من عرض الخلية الكاملة، عشان حجم الخط يتناسب معها.
    wrap.style.setProperty('--cw', W / boxW * 100);

    coords.forEach((c, i) => {
      const cell = cells[i] || { kind: 'deco' };
      const node = cell.node || el('div', { class: 'cell deco', 'aria-hidden': 'true' });
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

  // ---------- أنواع الخلايا ----------

  function centerCell(label, sub, image) {
    return {
      node: el('div', { class: 'cell center' }, [
        image !== undefined ? avatar(image) : null,
        el('span', { class: 'label' }, label),
        sub ? el('span', { class: 'sub' }, sub) : null
      ])
    };
  }

  function avatar(image) {
    return el('span', {
      class: 'avatar', 'aria-hidden': 'true',
      style: image ? { backgroundImage: 'url("' + image + '")' } : null
    }, image ? null : '[صورة]');
  }

  function personCell(person) {
    const count = itemsOf(person.id).length;
    return {
      node: el('a', { class: 'cell person', href: '#/person/' + person.id }, [
        avatar(person.image),
        el('span', { class: 'label' }, person.name),
        el('span', { class: 'sub' }, count + ' ذكرى')
      ])
    };
  }

  function navCell(label, href, sub) {
    return {
      node: el('a', { class: 'cell nav', href }, [
        el('span', { class: 'label' }, label),
        sub ? el('span', { class: 'sub' }, sub) : null
      ])
    };
  }

  function itemCell(item, from) {
    const hasImage = Boolean(item.image);
    return {
      node: el('a', {
        class: 'cell ' + item.type + (hasImage ? ' has-image' : ''),
        href: '#/item/' + item.id + (from ? '?from=' + from : ''),
        'aria-label': item.title + '، ' + item.date,
        style: hasImage ? { backgroundImage: 'url("' + item.image + '")' } : null
      }, [
        hasImage ? null : el('span', { class: 'thumb-label' }, item.type === 'document' ? '[مستند]' : '[صورة]'),
        el('span', { class: 'sub' }, item.date)
      ])
    };
  }

  // ---------- الصفحات ----------

  function setCrumbs(parts) {
    crumbs.replaceChildren();
    parts.forEach((part, i) => {
      if (i > 0) crumbs.append(el('span', { 'aria-hidden': 'true' }, '‹'));
      crumbs.append(part.href
        ? el('a', { href: part.href }, part.label)
        : el('span', { class: 'current', 'aria-current': 'page' }, part.label));
    });
  }

  function view(hint, content) {
    return el('section', { class: 'view' }, [el('p', { class: 'hint' }, hint), content]);
  }

  function renderLogin() {
    topbar.hidden = true;
    const error = el('p', { class: 'error', role: 'alert' });
    const input = el('input', { id: 'pw', type: 'password', autocomplete: 'current-password', placeholder: 'اكتب كلمة السر', required: true });
    const form = el('form', {
      onsubmit: async (event) => {
        event.preventDefault();
        if (await sha256(input.value) === data.passwordHash) {
          try { localStorage.setItem(AUTH_KEY, data.passwordHash); } catch (e) { /* يكمّل بدون حفظ */ }
          location.hash = '#/';
          route(true);
        } else {
          error.textContent = 'كلمة السر غير صحيحة';
          input.select();
        }
      }
    }, [
      el('label', { for: 'pw' }, 'كلمة السر'),
      input,
      el('button', { class: 'btn', type: 'submit' }, 'ادخل الأرشيف'),
      error
    ]);
    app.replaceChildren(el('section', { class: 'login' }, el('div', { class: 'login-card' }, [
      el('h1', null, 'أرشيف العائلة'),
      el('p', null, 'ذكرياتنا وصورنا القديمة في مكان واحد. الموقع خاص بالعائلة فقط.'),
      form
    ])));
    input.focus();
  }

  function renderHome() {
    setCrumbs([{ label: 'العائلة' }]);
    const docs = data.items.filter((i) => i.type === 'document').length;
    const cells = [centerCell(data.familyName, data.items.length + ' ذكرى')];
    data.people.forEach((p) => cells.push(personCell(p)));
    cells.push(navCell('حسب السنة', '#/years'));
    cells.push(navCell('المناسبات', '#/occasions'));
    cells.push(navCell('المستندات', '#/documents', docs + ' مستند'));
    app.replaceChildren(view('اضغط على أي خلية وتدخل على ذكرياته', hive(cells)));
  }

  function renderPerson(id) {
    const person = personById[id];
    if (!person) return renderNotFound();
    setCrumbs([{ label: 'العائلة', href: '#/' }, { label: person.name }]);
    const cells = [centerCell(person.name, person.born, person.image), navCell('→ رجوع للعائلة', '#/')];
    itemsOf(id).forEach((item) => cells.push(itemCell(item, 'person:' + id)));
    const hint = person.bio || ('كل خلية حول ' + person.name + ' صورة أو مستند');
    app.replaceChildren(view(hint, hive(cells)));
  }

  function renderGroups(kind) {
    const isYears = kind === 'years';
    const title = isYears ? 'حسب السنة' : 'المناسبات';
    setCrumbs([{ label: 'العائلة', href: '#/' }, { label: title }]);
    const groups = new Map();
    data.items.slice().sort(byYear).forEach((item) => {
      const key = isYears ? (item.year ? decadeOf(item.year) : null) : item.occasion;
      if (!key) return;
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    const cells = [centerCell(title), navCell('→ رجوع للعائلة', '#/')];
    groups.forEach((count, key) => {
      const label = isYears ? decadeName(key) : key;
      cells.push(navCell(label, '#/' + kind + '/' + encodeURIComponent(key), count + ' ذكرى'));
    });
    app.replaceChildren(view('اختر ' + (isYears ? 'فترة' : 'مناسبة'), hive(cells)));
  }

  function renderGroup(kind, key) {
    const isYears = kind === 'years';
    const items = data.items.filter((i) => isYears ? (i.year && decadeOf(i.year) === Number(key)) : i.occasion === key).sort(byYear);
    const label = isYears ? decadeName(Number(key)) : key;
    const parent = isYears ? 'حسب السنة' : 'المناسبات';
    setCrumbs([{ label: 'العائلة', href: '#/' }, { label: parent, href: '#/' + kind }, { label }]);
    const cells = [centerCell(label, items.length + ' ذكرى'), navCell('→ رجوع', '#/' + kind)];
    items.forEach((item) => cells.push(itemCell(item, kind + ':' + key)));
    app.replaceChildren(view('اضغط على أي خلية وتفتح قصتها', hive(cells)));
  }

  function renderDocuments() {
    setCrumbs([{ label: 'العائلة', href: '#/' }, { label: 'المستندات' }]);
    const items = data.items.filter((i) => i.type === 'document').sort(byYear);
    const cells = [centerCell('المستندات', items.length + ' مستند'), navCell('→ رجوع للعائلة', '#/')];
    items.forEach((item) => cells.push(itemCell(item, 'documents')));
    app.replaceChildren(view('الأوراق والشهادات والرسائل', hive(cells)));
  }

  // يرجع قائمة الذكريات اللي جاء منها الزائر، عشان السابق والتالي.
  function contextList(from) {
    if (!from) return { list: data.items.slice().sort(byYear), back: { label: 'العائلة', href: '#/' } };
    const [kind, key] = from.split(':');
    if (kind === 'person' && personById[key]) {
      return { list: itemsOf(key), back: { label: personById[key].name, href: '#/person/' + key } };
    }
    if (kind === 'documents') {
      return { list: data.items.filter((i) => i.type === 'document').sort(byYear), back: { label: 'المستندات', href: '#/documents' } };
    }
    if (kind === 'years' || kind === 'occasions') {
      const isYears = kind === 'years';
      const list = data.items.filter((i) => isYears ? (i.year && decadeOf(i.year) === Number(key)) : i.occasion === key).sort(byYear);
      return { list, back: { label: isYears ? decadeName(Number(key)) : key, href: '#/' + kind + '/' + encodeURIComponent(key) } };
    }
    return contextList(null);
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

    const details = [
      ['التاريخ', item.date],
      ['المكان', item.place],
      ['المناسبة', item.occasion],
      ['النوع', item.type === 'document' ? 'مستند' : 'صورة']
    ].filter(([, value]) => value);

    app.replaceChildren(el('section', { class: 'view' }, el('div', { class: 'item' }, [
      el('figure', null, [
        item.image
          ? el('a', { href: item.image, target: '_blank', rel: 'noopener' }, el('img', { src: item.image, alt: item.title }))
          : el('div', { class: 'placeholder' }, item.type === 'document' ? '[المستند]' : '[الصورة]'),
        item.caption ? el('figcaption', null, item.caption) : null
      ]),
      el('article', null, [
        el('h1', null, item.title),
        el('dl', null, details.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, v)])),
        item.people.length ? el('div', null, [
          el('p', { style: { margin: '0 0 8px', color: 'var(--muted)' } }, 'في الصورة'),
          el('div', { class: 'chips' }, item.people.filter((p) => personById[p]).map((p) =>
            el('a', { class: 'chip', href: '#/person/' + p }, personById[p].name)))
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
    app.replaceChildren(view('ما لقينا هذي الصفحة', el('a', { class: 'btn', href: '#/', style: { display: 'inline-flex', alignItems: 'center', textDecoration: 'none' } }, 'رجوع للعائلة')));
  }

  // ---------- التنقل ----------

  function route(fromLogin) {
    if (!isAuthed()) return renderLogin();
    topbar.hidden = false;
    const [path, query] = location.hash.replace(/^#/, '').split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const from = new URLSearchParams(query || '').get('from');

    if (parts.length === 0) renderHome();
    else if (parts[0] === 'person') renderPerson(parts[1]);
    else if (parts[0] === 'item') renderItem(parts[1], from);
    else if (parts[0] === 'documents') renderDocuments();
    else if ((parts[0] === 'years' || parts[0] === 'occasions') && parts[1]) renderGroup(parts[0], parts[1]);
    else if (parts[0] === 'years' || parts[0] === 'occasions') renderGroups(parts[0]);
    else renderNotFound();

    if (!fromLogin) window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', () => route(false));
  route(false);
})();
