// خانات بيانات الصورة. نفس الخانات في صفحة الرفع وصفحة التعديل.
const { html } = require('../html');
const { LIMITS } = require('../items');

function field(p, id, label, errors, hint, input) {
  const fid = p + id;
  const described = [hint ? fid + '-hint' : '', errors[id] ? fid + '-error' : ''].filter(Boolean).join(' ');
  return html`
  <div class="field" data-field="${id}">
    <label for="${fid}">${label}</label>
    ${input(fid, described, Boolean(errors[id]))}
    ${hint ? html`<span class="hint" id="${fid}-hint">${hint}</span>` : ''}
    <span class="error field-error" id="${fid}-error" ${errors[id] ? '' : 'hidden'}>${errors[id] || ''}</span>
  </div>`;
}

const select = (name, items, selected, emptyLabel) => (fid, d, bad) => html`
  <select id="${fid}" name="${name}" aria-describedby="${d}" aria-invalid="${bad}">
    <option value="">${emptyLabel}</option>
    ${items.map((c) => html`<option value="${c.id}" ${Number(selected) === c.id ? 'selected' : ''}>${c.name}</option>`)}
  </select>`;

module.exports = function itemFields({ values = {}, errors = {}, people = [], albums = [], occasions = [], prefix = '', compact = false }) {
  const p = prefix;
  const chosen = new Set((values.people || []).map(Number));

  const title = field(p, 'title', 'العنوان', errors, 'مثل: عرس عمي سعد',
    (fid, d, bad) => html`<input id="${fid}" name="title" maxlength="${LIMITS.title}" value="${values.title || ''}" aria-describedby="${d}" aria-invalid="${bad}">`);
  const date = field(p, 'date_text', 'التاريخ', errors, 'اكتبه زي ما تعرفه: 1985، أو تقريبًا 1400هـ، أو صيف الثمانينات',
    (fid, d, bad) => html`<input id="${fid}" name="date_text" maxlength="${LIMITS.date_text}" value="${values.date_text || ''}" aria-describedby="${d}" aria-invalid="${bad}">`);
  const peopleField = html`
  <fieldset class="field" data-field="people">
    <legend class="legend">مين في الصورة؟</legend>
    <div class="choices">
      ${people.map((person) => html`
      <label class="choice"><input type="checkbox" name="people" value="${person.id}" ${chosen.has(person.id) ? 'checked' : ''}><span title="${person.name}">${person.name}</span></label>`)}
    </div>
  </fieldset>`;
  const rest = html`
  <div class="form-grid">
    ${field(p, 'place', 'المكان', errors, 'مثل: بيت جدي في الطائف',
      (fid, d, bad) => html`<input id="${fid}" name="place" maxlength="${LIMITS.place}" value="${values.place || ''}" aria-describedby="${d}" aria-invalid="${bad}">`)}
    ${field(p, 'kind', 'النوع', errors, '',
      (fid, d) => html`<select id="${fid}" name="kind" aria-describedby="${d}">
        <option value="photo" ${values.kind !== 'document' ? 'selected' : ''}>صورة</option>
        <option value="document" ${values.kind === 'document' ? 'selected' : ''}>مستند (ورقة، شهادة، رسالة)</option>
      </select>`)}
    ${field(p, 'album_id', 'الألبوم', errors, albums.length ? '' : 'ما فيه ألبومات بعد. تقدر تسويها من صفحة الألبومات.',
      select('album_id', albums, values.album_id, 'بدون ألبوم'))}
    ${field(p, 'occasion_id', 'المناسبة', errors, occasions.length ? '' : 'ما فيه مناسبات بعد.',
      select('occasion_id', occasions, values.occasion_id, 'بدون مناسبة'))}
  </div>
  ${field(p, 'new_people', 'أسماء ما هي في القائمة', errors, 'اكتبها وافصل بينها بفاصلة، وبتنضاف للقائمة. مثل: سعد، أم فهد',
    (fid, d, bad) => html`<input id="${fid}" name="new_people" value="${Array.isArray(values.new_people) ? values.new_people.join('، ') : (values.new_people || '')}" aria-describedby="${d}" aria-invalid="${bad}">`)}
  ${field(p, 'story', 'القصة', errors, 'وش صار ذاك اليوم؟ مين صوّرها؟ أي شي تبغى العائلة تتذكره.',
    (fid, d, bad) => html`<textarea id="${fid}" name="story" maxlength="${LIMITS.story}" aria-describedby="${d}" aria-invalid="${bad}">${values.story || ''}</textarea>`)}`;

  // في بطاقات الرفع نختصر: العنوان والتاريخ والأسماء ظاهرة، والباقي تحت "تفاصيل أكثر".
  if (compact) {
    return html`
    <div class="form-grid">${title}${date}</div>
    ${peopleField}
    <details class="more">
      <summary>تفاصيل أكثر: المكان، الألبوم، المناسبة، القصة</summary>
      <div class="form">${rest}</div>
    </details>`;
  }
  return html`<div class="form-grid">${title}${date}</div>${peopleField}${rest}`;
};
