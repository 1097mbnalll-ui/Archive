const { html } = require('../html');
const { admin } = require('./layout');
const itemFields = require('./item-fields');

module.exports = (locals) => admin({
  ...locals,
  title: 'رفع صور',
  active: 'upload',
  scripts: ['/admin/assets/upload.js', '/admin/assets/privacy-hint.js'],
  body: html`
  <div class="page-head">
    <div>
      <h1>رفع صور</h1>
      <p>اختر الصور، اكتب بياناتها، وبعدها اضغط حفظ. ما ينحفظ شي قبل ما تضغط حفظ.</p>
    </div>
  </div>

  ${locals.error ? html`<p class="error" role="alert">${locals.error}</p>` : ''}

  <form id="upload-form" method="post" action="/admin/upload" enctype="multipart/form-data" class="form"
        data-max-mb="${locals.maxFileMb}" data-per-request="${locals.perRequest}">
    <input type="hidden" name="_csrf" value="${locals.csrf}">

    <label class="drop" for="files" id="drop">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"></path><path d="M7 9l5-5 5 5"></path><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"></path></svg>
      <strong>اختر صور من جهازك</strong>
      <span class="note">أو اسحبها وأفلتها هنا. تقدر تختار أكثر من صورة مرة وحدة.</span>
      <span class="note">JPG أو PNG أو WEBP أو GIF، وكل صورة أقل من ${locals.maxFileMb} ميجا.</span>
    </label>
    <input class="sr-only" id="files" name="files" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/tiff,image/avif" multiple>

    <section class="panel" aria-labelledby="shared-heading" id="shared">
      <div>
        <h2 id="shared-heading">بيانات مشتركة</h2>
        <p class="note">اللي تكتبه هنا ينطبق على كل الصور الجديدة. وبعدها تقدر تعدّل كل صورة لحالها تحت.</p>
      </div>
      ${itemFields({ values: {}, people: locals.people, albums: locals.albums, occasions: locals.occasions, prefix: 'shared-' })}
      <div class="actions js-only" hidden>
        <button type="button" class="btn secondary" id="apply-all">طبّق على كل الصور اللي تحت</button>
      </div>
    </section>

    <section class="section js-only" aria-labelledby="previews-title" hidden>
      <h2 id="previews-title">الصور المختارة <span class="note" id="count"></span></h2>
      <div class="previews" id="previews"></div>
    </section>

    <div class="sticky-save">
      <p class="note" id="status" role="status" aria-live="polite"></p>
      <div class="actions">
        <progress class="progress" id="progress" max="100" value="0" hidden></progress>
        <button class="btn" type="submit" id="save">احفظ الصور</button>
      </div>
    </div>
  </form>

  <template id="preview-template">
    <article class="preview">
      <div class="side">
        <img class="thumb" alt="">
        <span class="thumb nothumb" hidden>ما نقدر نعرضها</span>
        <span class="file-name"></span>
        <button type="button" class="btn small secondary remove">شيلها من القائمة</button>
      </div>
      <div class="form">
        <p class="error card-error" role="alert" hidden></p>
        ${itemFields({ values: {}, people: locals.people, albums: locals.albums, occasions: locals.occasions, prefix: 'tpl-', compact: true })}
      </div>
    </article>
  </template>`
});
