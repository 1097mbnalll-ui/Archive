const { html } = require('../html');
const { admin } = require('./layout');
const { ROLES } = require('../auth');

// خانة واحدة مع رسالة الخطأ والتوضيح مربوطة فيها، عشان قارئ الشاشة يقرأها.
function field({ id, label, errors, hint, input }) {
  const described = [hint ? id + '-hint' : '', errors[id] ? id + '-error' : ''].filter(Boolean).join(' ');
  return html`
  <div class="field">
    <label for="${id}">${label}</label>
    ${input(described, Boolean(errors[id]))}
    ${hint ? html`<span class="hint" id="${id}-hint">${hint}</span>` : ''}
    ${errors[id] ? html`<span class="error" id="${id}-error">${errors[id]}</span>` : ''}
  </div>`;
}

module.exports = (locals) => {
  const { isNew, values, errors, target, isSelf } = locals;
  const ROLE_HELP = require('./users').ROLE_HELP;
  return admin({
    ...locals,
    title: isNew ? 'إضافة فرد' : 'تعديل فرد',
    active: 'users',
    body: html`
    <div class="page-head">
      <div>
        <h1>${isNew ? 'إضافة فرد للعائلة' : html`تعديل: <bdi>${target.display_name}</bdi>`}</h1>
        <p>${isNew ? 'اعطِ الشخص اسم المستخدم وكلمة السر بعد ما تحفظ.' : 'غيّر الاسم أو الصلاحية، أو اكتب كلمة سر جديدة.'}</p>
      </div>
      <a href="/admin/users">رجوع للقائمة</a>
    </div>

    ${Object.keys(errors).length ? html`<p class="error" role="alert">فيه خانات تحتاج تصحيح. شوف الرسائل تحت كل خانة.</p>` : ''}

    <form method="post" action="${isNew ? '/admin/users' : '/admin/users/' + target.id}" class="form panel" novalidate>
      <input type="hidden" name="_csrf" value="${locals.csrf}">
      <div class="form-grid">
        ${field({
          id: 'display_name', label: 'الاسم الظاهر', errors, hint: 'مثل: أم محمد، أو خالد',
          input: (d, bad) => html`<input id="display_name" name="display_name" required maxlength="80" value="${values.display_name || ''}" aria-describedby="${d}" aria-invalid="${bad}">`
        })}
        ${isNew ? field({
          id: 'username', label: 'اسم المستخدم (للدخول)', errors, hint: 'بدون مسافات، مثل: khaled أو خالد_1',
          input: (d, bad) => html`<input id="username" name="username" required maxlength="40" autocomplete="off" dir="auto" value="${values.username || ''}" aria-describedby="${d}" aria-invalid="${bad}">`
        }) : html`
        <div class="field">
          <span class="legend">اسم المستخدم</span>
          <span class="ltr">${target.username}</span>
          <span class="hint">اسم المستخدم ما يتغير.</span>
        </div>`}
        ${field({
          id: 'password', label: isNew ? 'كلمة السر' : 'كلمة سر جديدة (اختياري)', errors,
          hint: isNew ? '8 أحرف أو أكثر' : 'اتركها فاضية لو ما تبغى تغيّرها. لو غيّرتها بيطلع الشخص من كل أجهزته.',
          input: (d, bad) => html`<input id="password" name="password" type="password" autocomplete="new-password" maxlength="200" aria-describedby="${d}" aria-invalid="${bad}">`
        })}
      </div>

      <fieldset aria-describedby="${errors.role ? 'role-error' : ''}">
        <legend class="legend">الصلاحية</legend>
        <div class="form-grid">
          ${Object.keys(ROLES).map((r) => html`
          <label class="role-option">
            <input type="radio" name="role" value="${r}" ${values.role === r ? 'checked' : ''}>
            <span><strong>${ROLES[r].label}</strong><span class="hint">${ROLE_HELP[r]}</span></span>
          </label>`)}
        </div>
        ${errors.role ? html`<span class="error" id="role-error">${errors.role}</span>` : ''}
        ${isSelf ? html`<p class="hint">انتبه: هذا حسابك. لو نزّلت صلاحيتك ما بتقدر ترجعها بنفسك.</p>` : ''}
      </fieldset>

      <div class="actions">
        <button class="btn" type="submit">${isNew ? 'إضافة' : 'حفظ التعديلات'}</button>
        <a class="btn secondary" href="/admin/users">إلغاء</a>
      </div>
    </form>`
  });
};
