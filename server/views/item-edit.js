const { html } = require('../html');
const { admin } = require('./layout');
const itemFields = require('./item-fields');

module.exports = (locals) => {
  const { item, values, errors } = locals;
  return admin({
    ...locals,
    title: 'تعديل صورة',
    active: 'items',
    body: html`
    <div class="page-head">
      <div>
        <h1>${item.title ? html`<bdi>${item.title}</bdi>` : 'صورة بدون عنوان'}</h1>
        <p class="note">انرفعت في <span class="ltr">${item.created_at}</span></p>
      </div>
      <a href="/admin/items">رجوع للصور</a>
    </div>
    ${Object.keys(errors).length ? html`<p class="error" role="alert">فيه خانات تحتاج تصحيح. شوف الرسائل تحت كل خانة.</p>` : ''}
    <div class="edit">
      <figure class="photo">
        <a href="/media/${item.id}/display" target="_blank" rel="noopener"><img src="/media/${item.id}/display" alt="${item.title || 'الصورة'}" width="${item.width}" height="${item.height}"></a>
        <figcaption class="note"><a href="/media/${item.id}/original" download>تحميل الملف الأصلي</a></figcaption>
      </figure>
      <form method="post" action="/admin/items/${item.id}" class="form panel" novalidate>
        <input type="hidden" name="_csrf" value="${locals.csrf}">
        ${itemFields({ values, errors, people: locals.people, albums: locals.albums, occasions: locals.occasions })}
        <div class="actions">
          <button class="btn" type="submit">حفظ التعديلات</button>
          <a class="btn danger" href="/admin/items/${item.id}/delete">حذف الصورة</a>
        </div>
      </form>
    </div>`
  });
};
