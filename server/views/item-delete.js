const { html } = require('../html');
const { admin } = require('./layout');

module.exports = (locals) => {
  const { item } = locals;
  return admin({
    ...locals,
    title: 'حذف صورة',
    active: 'items',
    body: html`
    <div class="panel confirm">
      <h1>حذف ${item.title ? html`<bdi>${item.title}</bdi>` : 'الصورة'}؟</h1>
      <img class="confirm-thumb" src="/media/${item.id}/thumb" alt="">
      <p>بتختفي من الأرشيف والموقع. الحذف <strong>مو نهائي</strong>: الصورة تنتقل إلى المحذوفات وتقدر ترجعها مع كل بياناتها.</p>
      <form method="post" action="/admin/items/${item.id}/delete" class="actions">
        <input type="hidden" name="_csrf" value="${locals.csrf}">
        <button class="btn danger" type="submit">نعم، انقلها للمحذوفات</button>
        <a class="btn secondary" href="/admin/items/${item.id}/edit">لا، رجوع</a>
      </form>
    </div>`
  });
};
