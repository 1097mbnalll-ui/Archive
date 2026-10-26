const { html } = require('../html');
const { admin } = require('./layout');

module.exports = (locals) => admin({
  ...locals,
  title: 'كلمات السر',
  active: 'access',
  body: html`
  <div class="page-head">
    <div>
      <h1>كلمات السر المشتركة</h1>
      <p>الموقع كامل مقفول. أي أحد يبغى يدخل لازم يكتب وحدة من هذي الكلمات، أو يدخل بحسابه الخاص.</p>
    </div>
  </div>
  ${locals.groups.map((g) => html`
  <section class="panel" aria-labelledby="h-${g.key}">
    <div class="page-head">
      <div>
        <h2 id="h-${g.key}">${g.label}</h2>
        <p class="note">${g.help}</p>
      </div>
      <span class="status ${g.isSet ? 'status-on' : 'status-off'}">${g.isSet ? 'شغّالة' : 'غير محددة: ما أحد يقدر يدخل بها'}</span>
    </div>
    <form method="post" action="/admin/access/${g.key}" class="form" novalidate>
      <input type="hidden" name="_csrf" value="${locals.csrf}">
      <div class="form-grid">
        <div class="field">
          <label for="${g.key}-password">${g.isSet ? 'كلمة سر جديدة' : 'كلمة السر'}</label>
          <input id="${g.key}-password" name="password" type="password" autocomplete="new-password" maxlength="200"
            aria-describedby="${g.key}-hint${locals.errors[g.key] ? ' ' + g.key + '-error' : ''}" aria-invalid="${Boolean(locals.errors[g.key])}">
          <span class="hint" id="${g.key}-hint">8 أحرف أو أكثر. لما تغيّرها، كل اللي دخلوا بالقديمة يطلعون.</span>
        </div>
        <div class="field">
          <label for="${g.key}-confirm">اكتبها مرة ثانية</label>
          <input id="${g.key}-confirm" name="confirm" type="password" autocomplete="new-password" maxlength="200">
        </div>
      </div>
      ${locals.errors[g.key] ? html`<p class="error" id="${g.key}-error" role="alert">${locals.errors[g.key]}</p>` : ''}
      <div class="actions">
        <button class="btn" type="submit">${g.isSet ? 'غيّر كلمة السر' : 'حدد كلمة السر'}</button>
        ${g.isSet ? html`<button class="btn danger" type="submit" name="action" value="disable" formnovalidate>أوقفها</button>` : ''}
      </div>
    </form>

    <details class="more">
      <summary>الأجهزة الداخلة بها الحين (${g.devices.length})</summary>
      ${g.devices.length ? html`
      <p class="note">الرمز يطلع في العلامة المائية على الصور. لو انتشرت صورة، طابق الرمز اللي فيها مع هذي القائمة.</p>
      <div class="table-wrap">
        <table class="stack">
          <thead><tr><th scope="col">الرمز</th><th scope="col">الجهاز</th><th scope="col">العنوان</th><th scope="col">دخل في</th></tr></thead>
          <tbody>
          ${g.devices.map((d) => html`<tr><td><span class="ltr"><strong>${d.code}</strong></span></td><td>${d.device}</td><td><span class="ltr">${d.ip}</span></td><td><span class="ltr">${d.created_at}</span></td></tr>`)}
          </tbody>
        </table>
      </div>` : html`<p class="note">ما فيه أحد داخل بها.</p>`}
    </details>
  </section>`)}`
});
