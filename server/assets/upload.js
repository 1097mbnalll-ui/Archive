// صفحة الرفع: معاينة الصور قبل الحفظ، وبيانات لكل صورة، ورفعها على دفعات.
(function () {
  const form = document.getElementById('upload-form');
  if (!form || !window.FormData || !window.URL) return;

  const input = document.getElementById('files');
  const drop = document.getElementById('drop');
  const list = document.getElementById('previews');
  const template = document.getElementById('preview-template');
  const shared = document.getElementById('shared');
  const status = document.getElementById('status');
  const progress = document.getElementById('progress');
  const saveButton = document.getElementById('save');
  const countLabel = document.getElementById('count');
  const csrf = form.querySelector('input[name="_csrf"]').value;
  const maxBytes = Number(form.dataset.maxMb) * 1024 * 1024;
  const perRequest = Number(form.dataset.perRequest);
  const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/avif'];
  const MAX_SELECTED = 500;

  const entries = [];
  let counter = 0;
  let busy = false;

  document.querySelectorAll('.js-only').forEach((el) => { el.hidden = false; });

  // ---------- قراءة البيانات وكتابتها ----------

  function readFields(root) {
    const get = (name) => { const el = root.querySelector('[name="' + name + '"]'); return el ? el.value : ''; };
    return {
      title: get('title'), date_text: get('date_text'), place: get('place'), kind: get('kind'),
      album_id: get('album_id'), occasion_id: get('occasion_id'), new_people: get('new_people'), story: get('story'),
      privacy: get('privacy'),
      people: [...root.querySelectorAll('[name="people"]:checked')].map((el) => el.value)
    };
  }

  function writeFields(root, values) {
    for (const name of ['title', 'date_text', 'place', 'kind', 'album_id', 'occasion_id', 'new_people', 'story', 'privacy']) {
      const el = root.querySelector('[name="' + name + '"]');
      if (el && values[name] !== undefined) el.value = values[name];
    }
    const privacyHint = root.querySelector('[name="privacy"]');
    if (privacyHint) privacyHint.dispatchEvent(new Event('change', { bubbles: true }));
    const people = new Set(values.people || []);
    root.querySelectorAll('[name="people"]').forEach((el) => { el.checked = people.has(el.value); });
  }

  // ---------- البطاقات ----------

  function describe(file) {
    if (!ACCEPTED.includes(file.type)) {
      if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) return 'صور الآيفون (HEIC) غير مدعومة. حوّلها إلى JPG أولًا.';
      return 'الملف هذا مو صورة مدعومة';
    }
    if (file.size > maxBytes) return 'الصورة أكبر من ' + form.dataset.maxMb + ' ميجا';
    return null;
  }

  function addFiles(files) {
    const room = MAX_SELECTED - entries.length;
    const chosen = [...files].slice(0, Math.max(0, room));
    if (files.length > chosen.length) say('اخترت أكثر من ' + MAX_SELECTED + ' صورة. أضفنا أول ' + chosen.length + '، واحفظها وبعدها كمّل الباقي.');
    const defaults = readFields(shared);
    const fragment = document.createDocumentFragment();
    for (const file of chosen) {
      const id = 'c' + (++counter) + '-';
      const card = template.content.firstElementChild.cloneNode(true);
      card.querySelectorAll('[id]').forEach((el) => { el.id = el.id.replace('tpl-', id); });
      card.querySelectorAll('[for]').forEach((el) => { el.htmlFor = el.htmlFor.replace('tpl-', id); });
      card.querySelectorAll('[aria-describedby]').forEach((el) => {
        el.setAttribute('aria-describedby', el.getAttribute('aria-describedby').replace(/tpl-/g, id));
      });
      const entry = { id, file, card, url: null, problem: describe(file) };
      const img = card.querySelector('.thumb');
      img.alt = 'معاينة ' + file.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      if (!entry.problem) {
        entry.url = URL.createObjectURL(file);
        img.src = entry.url;
      } else {
        img.hidden = true;
        card.querySelector('.nothumb').hidden = false;
      }
      card.querySelector('.file-name').textContent = file.name;
      writeFields(card, defaults);
      if (entry.problem) showCardError(entry, entry.problem);
      card.querySelector('.remove').addEventListener('click', () => removeEntry(entry, true));
      entries.push(entry);
      fragment.append(card);
    }
    const added = [...fragment.children];
    list.append(fragment);
    added.forEach((card) => writeFields(card, readFields(card)));
    refresh();
  }

  function removeEntry(entry, focusNext) {
    const index = entries.indexOf(entry);
    if (index === -1) return;
    entries.splice(index, 1);
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.card.remove();
    refresh();
    if (focusNext) {
      const next = entries[index] || entries[index - 1];
      (next ? next.card.querySelector('.remove') : drop).focus();
    }
  }

  function showCardError(entry, message, fieldErrors) {
    entry.card.classList.add('bad');
    const box = entry.card.querySelector('.card-error');
    box.textContent = message;
    box.hidden = false;
    entry.card.querySelectorAll('.field-error').forEach((el) => { el.hidden = true; });
    for (const [name, text] of Object.entries(fieldErrors || {})) {
      const field = entry.card.querySelector('[data-field="' + name + '"]');
      if (!field) continue;
      const err = field.querySelector('.field-error');
      if (err) { err.textContent = text; err.hidden = false; }
      const control = field.querySelector('input, select, textarea');
      if (control) control.setAttribute('aria-invalid', 'true');
      const more = field.closest('details');
      if (more) more.open = true;
    }
  }

  function refresh() {
    const ready = entries.filter((e) => !e.problem).length;
    countLabel.textContent = entries.length ? '(' + entries.length + ')' : '';
    saveButton.textContent = ready ? 'احفظ ' + ready + (ready === 1 ? ' صورة' : ' صور') : 'احفظ الصور';
    saveButton.disabled = busy || ready === 0;
    if (!busy) say(entries.length ? '' : 'ما اخترت صور بعد.');
  }

  function say(text) { status.textContent = text; }

  // ---------- الاختيار والسحب ----------

  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (event) => { event.preventDefault(); if (event.dataTransfer) addFiles(event.dataTransfer.files); });
  drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });
  drop.tabIndex = 0;
  drop.setAttribute('role', 'button');

  document.getElementById('apply-all').addEventListener('click', () => {
    const values = readFields(shared);
    entries.forEach((e) => writeFields(e.card, values));
    say('طبّقنا البيانات المشتركة على ' + entries.length + ' صورة.');
  });

  window.addEventListener('beforeunload', (event) => {
    if (entries.length && !form.dataset.done) { event.preventDefault(); event.returnValue = ''; }
  });

  // ---------- الحفظ ----------

  function send(batch, onProgress) {
    return new Promise((resolve) => {
      const data = new FormData();
      data.append('meta', JSON.stringify(batch.map((e) => readFields(e.card))));
      batch.forEach((e) => data.append('files', e.file, e.file.name));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', form.action);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('X-CSRF-Token', csrf);
      xhr.upload.addEventListener('progress', (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); });
      xhr.addEventListener('load', () => {
        let body = null;
        try { body = JSON.parse(xhr.responseText); } catch (e) { /* رد غير متوقع */ }
        if (xhr.status === 403) resolve({ fatal: 'انتهت جلستك أو صلاحيتك ما تسمح. حدّث الصفحة وادخل من جديد.' });
        else if (body && body.results) resolve(body);
        else resolve({ fatal: (body && body.error) || 'صار خطأ في السيرفر' });
      });
      xhr.addEventListener('error', () => resolve({ fatal: 'انقطع الاتصال. تأكد من الإنترنت وجرّب مرة ثانية.' }));
      xhr.send(data);
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const ready = entries.filter((e) => !e.problem);
    if (!ready.length) { say('اختر صورة وحدة على الأقل.'); return; }

    busy = true;
    refresh();
    progress.hidden = false;
    progress.value = 0;
    const totalBytes = ready.reduce((n, e) => n + e.file.size, 0) || 1;
    let doneBytes = 0;
    let saved = 0;
    let failed = 0;

    for (let i = 0; i < ready.length; i += perRequest) {
      const batch = ready.slice(i, i + perRequest);
      const batchBytes = batch.reduce((n, e) => n + e.file.size, 0);
      say('جاري الحفظ… ' + saved + ' من ' + ready.length);
      const result = await send(batch, (ratio) => { progress.value = Math.round((doneBytes + ratio * batchBytes) / totalBytes * 100); });
      doneBytes += batchBytes;
      if (result.fatal) {
        batch.forEach((e) => showCardError(e, result.fatal));
        failed += batch.length;
        if (/جلستك/.test(result.fatal)) break;
        continue;
      }
      for (const r of result.results) {
        const entry = batch[r.index];
        if (r.id) { saved++; removeEntry(entry, false); }
        else { failed++; showCardError(entry, r.error || 'فيه خانات تحتاج تصحيح', r.errors); }
      }
    }

    busy = false;
    progress.hidden = true;
    refresh();
    if (!failed && !entries.length) {
      form.dataset.done = '1';
      location.href = '/admin/items?msg=uploaded';
      return;
    }
    say('انحفظت ' + saved + ' صورة. ' + (failed ? failed + ' تحتاج تصحيح، وهي باقية تحت.' : ''));
    const firstBad = entries.find((e) => e.card.classList.contains('bad'));
    if (firstBad) firstBad.card.querySelector('.card-error').scrollIntoView({ block: 'center' });
  });

  refresh();
})();
