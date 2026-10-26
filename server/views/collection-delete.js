const { html } = require('../html');
const { admin } = require('./layout');

module.exports = (locals) => {
  const { kinds, target, count } = locals;
  const k = kinds[target.kind];
  return admin({
    ...locals,
    title: 'حذف ' + k.one,
    active: 'collections',
    body: html`
    <div class="panel confirm">
      <h1>حذف <bdi>${target.name}</bdi>؟</h1>
      <p>${count
        ? html`فيه ${count} صورة. <strong>الصور ما تنحذف</strong>، بس ما تكون مربوطة بهذا ال${k.one} لين ترجعه.`
        : html`ال${k.one} فاضي.`}</p>
      <p>الحذف <strong>مو نهائي</strong>: ينتقل إلى المحذوفات وتقدر ترجعه مع ربط صوره.</p>
      <form method="post" action="/admin/collections/${target.id}/delete" class="actions">
        <input type="hidden" name="_csrf" value="${locals.csrf}">
        <button class="btn danger" type="submit">نعم، انقله للمحذوفات</button>
        <a class="btn secondary" href="/admin/collections">لا، رجوع</a>
      </form>
    </div>`
  });
};
