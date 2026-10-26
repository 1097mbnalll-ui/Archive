const { html } = require('../html');
const { admin } = require('./layout');

function pageLink(filters, page) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  if (page > 1) params.set('page', page);
  const query = params.toString();
  return '/admin/items' + (query ? '?' + query : '');
}

module.exports = (locals) => {
  const { items, total, page, pages, filters, albums, occasions, people } = locals;
  const filtered = Object.values(filters).some(Boolean);
  return admin({
    ...locals,
    title: 'الصور',
    active: 'items',
    body: html`
    <div class="page-head">
      <div>
        <h1>الصور</h1>
        <p>${total} ${filtered ? 'نتيجة' : 'صورة ومستند في الأرشيف'}. اضغط على أي صورة وتعدّل بياناتها.</p>
      </div>
      <a class="btn" href="/admin/upload">رفع صور</a>
    </div>

    <form class="filters" method="get" action="/admin/items" role="search">
      <div class="field"><label for="q">بحث</label><input id="q" name="q" type="search" value="${filters.q}" placeholder="عنوان، قصة، مكان، تاريخ"></div>
      <div class="field"><label for="f-album">الألبوم</label>
        <select id="f-album" name="album"><option value="">الكل</option>
          ${albums.map((a) => html`<option value="${a.id}" ${filters.album === a.id ? 'selected' : ''}>${a.name}</option>`)}
        </select></div>
      <div class="field"><label for="f-occasion">المناسبة</label>
        <select id="f-occasion" name="occasion"><option value="">الكل</option>
          ${occasions.map((o) => html`<option value="${o.id}" ${filters.occasion === o.id ? 'selected' : ''}>${o.name}</option>`)}
        </select></div>
      <div class="field"><label for="f-person">الشخص</label>
        <select id="f-person" name="person"><option value="">الكل</option>
          ${people.map((p) => html`<option value="${p.id}" ${filters.person === p.id ? 'selected' : ''}>${p.name}</option>`)}
        </select></div>
      <div class="actions"><button class="btn secondary" type="submit">اعرض</button>
        ${filtered ? html`<a href="/admin/items">مسح البحث</a>` : ''}</div>
    </form>

    ${items.length === 0 ? html`
      <div class="empty">
        <h2>${filtered ? 'ما فيه نتائج' : 'ما فيه صور بعد'}</h2>
        <p class="note">${filtered ? 'جرّب كلمة ثانية أو امسح البحث.' : 'ابدأ برفع أول صور للأرشيف.'}</p>
        ${filtered ? '' : html`<a class="btn" href="/admin/upload">رفع صور</a>`}
      </div>` : html`
      <ul class="grid" role="list">
        ${items.map((it) => html`
        <li>
          <a class="tile" href="/admin/items/${it.id}/edit">
            <img src="/media/${it.id}/thumb" alt="" loading="lazy" decoding="async">
            <span class="meta">
              <span class="title">${it.title || 'بدون عنوان'}</span>
              <span class="sub">
                ${it.date_text ? html`<span>${it.date_text}</span>` : ''}
                ${it.kind === 'document' ? html`<span>مستند</span>` : ''}
                ${it.album ? html`<span class="clip">${it.album}</span>` : ''}
              </span>
            </span>
          </a>
        </li>`)}
      </ul>`}

    ${pages > 1 ? html`
    <nav class="pager" aria-label="الصفحات">
      ${page > 1 ? html`<a class="btn small secondary" href="${pageLink(filters, page - 1)}">→ السابقة</a>` : ''}
      <span>صفحة ${page} من ${pages}</span>
      ${page < pages ? html`<a class="btn small secondary" href="${pageLink(filters, page + 1)}">التالية ←</a>` : ''}
    </nav>` : ''}`
  });
};
