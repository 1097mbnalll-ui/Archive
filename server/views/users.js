const { html } = require('../html');
const { admin } = require('./layout');
const { ROLES } = require('../auth');

const ROLE_HELP = {
  admin: 'يسوي كل شي: يضيف أفراد العائلة ويغيّر صلاحياتهم، ويرفع ويعدّل ويحذف.',
  editor: 'يرفع الصور ويعدّلها، ويدير الألبومات والمناسبات.',
  viewer: 'يتفرج بس على صور العائلة في الموقع. ما يدخل لوحة الإدارة.'
};

module.exports = (locals) => admin({
  ...locals,
  title: 'أفراد العائلة',
  active: 'users',
  body: html`
  <div class="page-head">
    <div>
      <h1>أفراد العائلة</h1>
      <p>كل شخص يدخل الأرشيف له حساب هنا.</p>
    </div>
    <a class="btn" href="/admin/users/new">إضافة فرد</a>
  </div>

  <div class="table-wrap">
    <table class="stack">
      <thead><tr><th scope="col">الاسم</th><th scope="col">اسم المستخدم</th><th scope="col">الصلاحية</th><th scope="col"><span class="sr-only">إجراءات</span></th></tr></thead>
      <tbody>
        ${locals.users.map((u) => html`
        <tr>
          <td><span class="clip" title="${u.display_name}">${u.display_name}</span>${u.id === locals.user.id ? html` <span class="note">(أنت)</span>` : ''}</td>
          <td><span class="clip ltr" title="${u.username}">${u.username}</span></td>
          <td><span class="role role-${u.role}">${ROLES[u.role].label}</span></td>
          <td>
            <div class="actions">
              <a class="btn small secondary" href="/admin/users/${u.id}/edit">تعديل<span class="sr-only"> ${u.display_name}</span></a>
              ${u.id === locals.user.id ? '' : html`<a class="btn small danger" href="/admin/users/${u.id}/delete">حذف<span class="sr-only"> ${u.display_name}</span></a>`}
            </div>
          </td>
        </tr>`)}
      </tbody>
    </table>
  </div>

  <section class="section" aria-labelledby="roles-title">
    <h2 id="roles-title">وش تعني كل صلاحية</h2>
    <dl class="form-grid">
      ${Object.keys(ROLES).map((r) => html`
      <div class="panel"><dt><span class="role role-${r}">${ROLES[r].label}</span></dt><dd>${ROLE_HELP[r]}</dd></div>`)}
    </dl>
  </section>`
});

module.exports.ROLE_HELP = ROLE_HELP;
