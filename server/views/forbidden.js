const { html } = require('../html');
const { plain } = require('./layout');

module.exports = ({ reason, user }) => plain({
  title: 'غير مسموح',
  body: html`
  <section class="login" aria-labelledby="t">
    <h1 id="t">هذي الصفحة مو لك</h1>
    <p>${reason || 'صلاحيتك ما تسمح بفتح هذي الصفحة. لو تحتاجها، كلّم مدير الأرشيف.'}</p>
    <a class="btn" href="${user && user.role !== 'viewer' ? '/admin' : '/'}">رجوع</a>
  </section>`
});
