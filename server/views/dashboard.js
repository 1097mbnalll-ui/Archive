const { html } = require('../html');
const { admin } = require('./layout');

module.exports = (locals) => admin({
  ...locals,
  title: 'الرئيسية',
  active: 'home',
  body: html`<h1>أهلًا ${locals.user.displayName}</h1>`
});
