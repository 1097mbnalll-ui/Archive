const { html } = require('../html');
const { admin } = require('./layout');

module.exports = (locals) => {
  const { kinds, kind, isNew, target, values, errors, limits } = locals;
  const k = kinds[kind];
  const d = (id, hint) => [hint ? id + '-hint' : '', errors[id] ? id + '-error' : ''].filter(Boolean).join(' ');
  return admin({
    ...locals,
    title: isNew ? k.one + ' جديد' : 'تعديل ' + k.one,
    active: 'collections',
    body: html`
    <div class="page-head">
      <h1>${isNew ? (kind === 'album' ? 'ألبوم جديد' : 'مناسبة جديدة') : html`تعديل: <bdi>${target.name}</bdi>`}</h1>
      <a href="/admin/collections">رجوع</a>
    </div>
    ${Object.keys(errors).length ? html`<p class="error" role="alert">فيه خانات تحتاج تصحيح.</p>` : ''}
    <form method="post" action="${isNew ? '/admin/collections' : '/admin/collections/' + target.id}" class="form panel confirm" novalidate>
      <input type="hidden" name="_csrf" value="${locals.csrf}">
      <input type="hidden" name="kind" value="${kind}">
      <div class="field">
        <label for="name">الاسم</label>
        <input id="name" name="name" required maxlength="${limits.name}" value="${values.name || ''}" aria-describedby="${d('name', true)}" aria-invalid="${Boolean(errors.name)}">
        <span class="hint" id="name-hint">${k.example}</span>
        ${errors.name ? html`<span class="error" id="name-error">${errors.name}</span>` : ''}
      </div>
      <div class="field">
        <label for="description">وصف (اختياري)</label>
        <textarea id="description" name="description" maxlength="${limits.description}" aria-describedby="${d('description')}" aria-invalid="${Boolean(errors.description)}">${values.description || ''}</textarea>
        ${errors.description ? html`<span class="error" id="description-error">${errors.description}</span>` : ''}
      </div>
      <div class="actions">
        <button class="btn" type="submit">${isNew ? 'إضافة' : 'حفظ التعديلات'}</button>
        <a class="btn secondary" href="/admin/collections">إلغاء</a>
      </div>
    </form>`
  });
};
