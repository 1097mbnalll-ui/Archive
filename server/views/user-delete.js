const { html } = require('../html');
const { admin } = require('./layout');

module.exports = (locals) => {
  const { target, blocked } = locals;
  return admin({
    ...locals,
    title: 'حذف فرد',
    active: 'users',
    body: html`
    <div class="panel confirm">
      <h1>حذف <bdi>${target.display_name}</bdi>؟</h1>
      ${blocked
        ? html`<p class="error" role="alert">${blocked}</p>
               <div class="actions"><a class="btn secondary" href="/admin/users">رجوع</a></div>`
        : html`
        <p>بيطلع من الأرشيف فورًا وما يقدر يدخل. الحذف <strong>مو نهائي</strong>: الحساب ينتقل إلى المحذوفات وتقدر ترجعه متى ما بغيت.</p>
        <form method="post" action="/admin/users/${target.id}/delete" class="actions">
          <input type="hidden" name="_csrf" value="${locals.csrf}">
          <button class="btn danger" type="submit">نعم، انقله للمحذوفات</button>
          <a class="btn secondary" href="/admin/users">لا، رجوع</a>
        </form>`}
    </div>`
  });
};
