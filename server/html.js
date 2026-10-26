// أداة بسيطة لكتابة صفحات HTML بأمان: كل قيمة تنحمى تلقائيًا من الأكواد الخبيثة.

class Raw {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const raw = (value) => new Raw(String(value));

function escape(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(escape).join('');
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += escape(value) + strings[i + 1]; });
  return raw(out);
}

module.exports = { html, raw, escape };
