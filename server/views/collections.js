const { html } = require('../html');
const { admin } = require('./layout');

function group(kind, rows, kinds) {
  const k = kinds[kind];
  return html`
  <section class="section" aria-labelledby="h-${kind}">
    <div class="page-head">
      <h2 id="h-${kind}">${k.many} <span class="note">(${rows.length})</span></h2>
      <a class="btn secondary" href="/admin/collections/new?kind=${kind}">${kind === 'album' ? 'ألبوم جديد' : 'مناسبة جديدة'}</a>
    </div>
    ${rows.length === 0 ? html`
      <div class="empty"><p>ما فيه ${k.many} بعد.</p></div>` : html`
      <ul class="grid wide" role="list">
        ${rows.map((c) => html`
        <li class="tile">
          ${c.cover ? html`<img src="/media/${c.cover}/thumb" alt="" loading="lazy">` : html`<span class="noimg">فاضي</span>`}
          <span class="meta">
            <span class="title" title="${c.name}">${c.name}</span>
            <span class="sub">${c.count === 0 ? 'ما فيه صور' : c.count + ' صورة'}</span>
            <span class="actions">
              ${c.count ? html`<a class="btn small secondary" href="/admin/items?${kind === 'album' ? 'album' : 'occasion'}=${c.id}">الصور<span class="sr-only"> في ${c.name}</span></a>` : ''}
              <a class="btn small secondary" href="/admin/collections/${c.id}/edit">تعديل<span class="sr-only"> ${c.name}</span></a>
              <a class="btn small danger" href="/admin/collections/${c.id}/delete">حذف<span class="sr-only"> ${c.name}</span></a>
            </span>
          </span>
        </li>`)}
      </ul>`}
  </section>`;
}

module.exports = (locals) => admin({
  ...locals,
  title: 'الألبومات والمناسبات',
  active: 'collections',
  body: html`
  <div class="page-head">
    <div>
      <h1>الألبومات والمناسبات</h1>
      <p>الألبوم مجموعة صور تختارها أنت. المناسبة يوم معيّن مثل عرس أو عيد. الصورة الوحدة تقدر تكون في ألبوم ومناسبة مع بعض.</p>
    </div>
  </div>
  ${group('album', locals.groups.album, locals.kinds)}
  ${group('occasion', locals.groups.occasion, locals.kinds)}`
});
