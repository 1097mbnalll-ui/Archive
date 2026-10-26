const { html } = require('../html');
const { admin } = require('./layout');

module.exports = (locals) => {
  const total = locals.groups.reduce((n, g) => n + g.rows.length, 0);
  return admin({
    ...locals,
    title: 'المحذوفات',
    active: 'trash',
    body: html`
    <div class="page-head">
      <div>
        <h1>المحذوفات</h1>
        <p>أي شي تحذفه يجي هنا، وتقدر ترجعه بضغطة. ما فيه شي ينحذف نهائيًا.</p>
      </div>
    </div>
    ${total === 0 ? html`<div class="empty"><h2>السلة فاضية</h2><p class="note">ما فيه شي محذوف.</p></div>` : ''}
    ${locals.groups.filter((g) => g.rows.length).map((g) => html`
    <section class="section" aria-labelledby="g-${g.key}">
      <h2 id="g-${g.key}">${g.label} <span class="note">(${g.rows.length})</span></h2>
      <div class="table-wrap">
        <table class="stack">
          <thead><tr><th scope="col">الاسم</th><th scope="col">انحذف في</th><th scope="col"><span class="sr-only">إجراءات</span></th></tr></thead>
          <tbody>
          ${g.rows.map((r) => html`
            <tr>
              <td><span class="clip" title="${r.name}">${r.name || '(بدون عنوان)'}</span></td>
              <td><span class="ltr">${r.deleted_at}</span></td>
              <td>
                <form method="post" action="/admin/trash/restore">
                  <input type="hidden" name="_csrf" value="${locals.csrf}">
                  <input type="hidden" name="type" value="${g.key}">
                  <input type="hidden" name="id" value="${r.id}">
                  <button class="btn small secondary" type="submit">استرجاع<span class="sr-only"> ${r.name}</span></button>
                </form>
              </td>
            </tr>`)}
          </tbody>
        </table>
      </div>
    </section>`)}`
  });
};
