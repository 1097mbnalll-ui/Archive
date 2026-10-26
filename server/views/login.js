const { html } = require('../html');
const { plain } = require('./layout');

module.exports = ({ error, username, next, withAccount }) => plain({
  title: 'الدخول',
  body: html`
  <section class="login" aria-labelledby="login-title">
    <h1 id="login-title">أرشيف العائلة</h1>
    <p>الأرشيف خاص بالعائلة. اكتب كلمة السر عشان تدخل.</p>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <form method="post" action="/login" class="form">
      <input type="hidden" name="next" value="${next || ''}">
      <input type="hidden" name="mode" value="shared">
      <div class="field">
        <label for="password">كلمة السر</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="200" ${withAccount ? '' : 'autofocus'}>
      </div>
      <button class="btn" type="submit">ادخل</button>
    </form>
    <details class="more" ${withAccount ? 'open' : ''}>
      <summary>عندك حساب خاص؟ ادخل باسمك</summary>
      <form method="post" action="/login" class="form">
        <input type="hidden" name="next" value="${next || ''}">
        <input type="hidden" name="mode" value="account">
        <div class="field">
          <label for="username">اسم المستخدم</label>
          <input id="username" name="username" autocomplete="username" required maxlength="60" value="${username || ''}" dir="auto" ${withAccount ? 'autofocus' : ''}>
        </div>
        <div class="field">
          <label for="account-password">كلمة السر</label>
          <input id="account-password" name="password" type="password" autocomplete="current-password" required maxlength="200">
        </div>
        <button class="btn secondary" type="submit">ادخل بحسابي</button>
      </form>
    </details>
  </section>`
});
