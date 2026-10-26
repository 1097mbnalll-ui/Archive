const { html } = require('../html');
const { plain } = require('./layout');

module.exports = ({ error, username, next }) => plain({
  title: 'الدخول',
  body: html`
  <section class="login" aria-labelledby="login-title">
    <h1 id="login-title">أرشيف العائلة</h1>
    <p>ادخل باسمك وكلمة السر اللي أعطاك إياها مدير الأرشيف.</p>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <form method="post" action="/login" class="form">
      <input type="hidden" name="next" value="${next || ''}">
      <div class="field">
        <label for="username">اسم المستخدم</label>
        <input id="username" name="username" autocomplete="username" required maxlength="60" value="${username || ''}" dir="auto" autofocus>
      </div>
      <div class="field">
        <label for="password">كلمة السر</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="200">
      </div>
      <button class="btn" type="submit">ادخل</button>
    </form>
    <a href="/">تصفّح الصور العامة بدون دخول</a>
  </section>`
});
