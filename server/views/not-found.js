const { html } = require('../html');
const { plain } = require('./layout');

module.exports = () => plain({
  title: 'غير موجود',
  body: html`
  <section class="login" aria-labelledby="t">
    <h1 id="t">ما لقينا هذي الصفحة</h1>
    <p>يمكن انحذفت أو الرابط فيه غلط.</p>
    <a class="btn" href="/admin">رجوع</a>
  </section>`
});
