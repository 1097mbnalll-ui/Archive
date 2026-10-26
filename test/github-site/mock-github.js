// نسخة تجريبية من GitHub للاختبار: تقدّم الموقع زي GitHub Pages، وتقلّد واجهة GitHub للحفظ.
// الاستخدام: node test/github-site/mock-github.js <port>
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SITE = path.join(__dirname, '..', '..', 'github-site');
const TOKEN = 'github_pat_test';
// مثل GitHub الحقيقي: الملفات الأكبر من هذا الحد ما ترجع داخل واجهة الملفات العادية، ولازم تتجاب من blobs.
const INLINE_LIMIT = Number(process.env.MOCK_INLINE_LIMIT || 1024 * 1024);
const API = '/api/repos/1097mbnalll-ui/Archive';

const blobs = new Map();
const trees = new Map();
const commits = new Map();
const sha = () => crypto.randomBytes(20).toString('hex');
let head = sha();
trees.set('t0', new Map());
commits.set(head, { tree: 't0' });
const stats = { commits: 0 };

const currentFiles = () => trees.get(commits.get(head).tree);

function body(req) {
  return new Promise((resolve) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); });
}

const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.bin': 'application/octet-stream' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith(API)) {
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return json(res, 401, { message: 'Bad credentials' });
    const rest = url.pathname.slice(API.length);
    if (rest === '' && req.method === 'GET') return json(res, 200, { permissions: { push: true } });
    if (rest.startsWith('/contents/')) {
      const file = decodeURI(rest.slice('/contents/'.length));
      const blobSha = currentFiles().get(file);
      if (!blobSha) return json(res, 404, { message: 'Not Found' });
      const data = blobs.get(blobSha);
      const wantsRaw = /vnd\.github(\.v3)?\.raw/.test(req.headers.accept || '');
      stats.reads = (stats.reads || 0) + 1;
      // الصيغة الافتراضية JSON. الملف الكبير يرجع بدون محتوى.
      if (wantsRaw && data.length <= INLINE_LIMIT) { res.writeHead(200, { 'Content-Type': 'application/vnd.github.raw' }); return res.end(data); }
      return json(res, 200, { type: 'file', sha: blobSha, path: file, size: data.length, encoding: 'base64', content: data.length <= INLINE_LIMIT ? data.toString('base64').replace(/(.{60})/g, '$1\n') : '' });
    }
    if (rest.startsWith('/git/blobs/') && req.method === 'GET') {
      const data = blobs.get(rest.split('/').pop());
      if (!data) return json(res, 404, { message: 'Not Found' });
      stats.blobReads = (stats.blobReads || 0) + 1;
      return json(res, 200, { sha: rest.split('/').pop(), encoding: 'base64', size: data.length, content: data.toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    if (rest === '/git/blobs' && req.method === 'POST') {
      const { content } = JSON.parse(await body(req));
      const s = sha();
      blobs.set(s, Buffer.from(content, 'base64'));
      return json(res, 201, { sha: s });
    }
    if (rest === '/git/ref/heads/gh-pages') return json(res, 200, { object: { sha: head } });
    if (rest.startsWith('/git/commits/')) return json(res, 200, { tree: { sha: commits.get(rest.split('/').pop()).tree } });
    if (rest === '/git/trees' && req.method === 'POST') {
      const { base_tree, tree } = JSON.parse(await body(req));
      const files = new Map(trees.get(base_tree));
      for (const entry of tree) { if (entry.sha === null) files.delete(entry.path); else files.set(entry.path, entry.sha); }
      const s = sha();
      trees.set(s, files);
      return json(res, 201, { sha: s });
    }
    if (rest === '/git/commits' && req.method === 'POST') {
      const { tree, parents } = JSON.parse(await body(req));
      const s = sha();
      commits.set(s, { tree, parent: parents[0] });
      return json(res, 201, { sha: s });
    }
    if (rest === '/git/refs/heads/gh-pages' && req.method === 'PATCH') {
      const { sha: next } = JSON.parse(await body(req));
      if (commits.get(next).parent !== head) return json(res, 422, { message: 'not fast forward' });
      head = next;
      stats.commits++;
      return json(res, 200, {});
    }
    return json(res, 404, { message: 'Not Found' });
  }
  if (url.pathname === '/__stats') return json(res, 200, { ...stats, files: [...currentFiles().keys()] });
  if (url.pathname === '/__file') {
    const s = currentFiles().get(url.searchParams.get('path'));
    res.writeHead(s ? 200 : 404); return res.end(s ? blobs.get(s) : '');
  }
  // GitHub Pages: الموقع تحت /Archive/
  if (!url.pathname.startsWith('/Archive/')) { res.writeHead(404); return res.end(); }
  let rel = url.pathname.slice('/Archive/'.length) || 'index.html';
  if (rel === 'config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'] });
    return res.end("window.ARCHIVE_CONFIG = { owner: '1097mbnalll-ui', repo: 'Archive', branch: 'gh-pages', apiBase: 'http://" + req.headers.host + "/api' };");
  }
  const stored = currentFiles().get(rel);
  if (stored) { res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream' }); return res.end(blobs.get(stored)); }
  const file = path.join(SITE, rel);
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(Number(process.argv[2]) || 4100, () => console.log('mock github on', server.address().port));
