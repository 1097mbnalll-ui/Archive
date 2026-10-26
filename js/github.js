// الحفظ على GitHub: نكتب الملفات في الفرع اللي ينعرض منه الموقع، كلها في "حفظ" (commit) واحد.
import { toBase64, fromBase64 } from './crypto.js';

export class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export class GitHub {
  constructor({ owner, repo, branch, apiBase = 'https://api.github.com' }, token) {
    this.base = apiBase.replace(/\/$/, '') + '/repos/' + owner + '/' + repo;
    this.branch = branch;
    this.token = token;
  }

  async call(path, options = {}) {
    const res = await fetch(this.base + path, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + this.token,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      const message = res.status === 401 ? 'مفتاح GitHub غلط أو انتهت صلاحيته'
        : res.status === 403 || res.status === 404 ? 'مفتاح GitHub ما عنده صلاحية الكتابة على المستودع'
        : res.status === 409 || res.status === 422 ? 'تعارض في الحفظ'
        : 'GitHub رجّع خطأ (' + res.status + ')';
      throw new GitHubError(message, res.status);
    }
    return res;
  }

  // يتأكد إن المفتاح يقدر يكتب على المستودع.
  async check() {
    const repo = await (await this.call('')).json();
    if (!repo.permissions || !repo.permissions.push) throw new GitHubError('مفتاح GitHub ما عنده صلاحية الكتابة على المستودع', 403);
    return repo;
  }

  // يقرأ ملف من الفرع مباشرة (أحدث نسخة، بدون انتظار تحديث الموقع). يرجع null لو ما موجود.
  // نقرأ بصيغة JSON (base64) لأنها تشتغل دايمًا. الملفات الكبيرة (فوق 1 ميجا) نجيبها من واجهة الملفات الخام (blobs).
  async readFile(path) {
    let info;
    try {
      info = await (await this.call('/contents/' + encodeURI(path) + '?ref=' + encodeURIComponent(this.branch) + '&t=' + Date.now(), { cache: 'no-store' })).json();
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
    if (Array.isArray(info) || info.type !== 'file') throw new GitHubError('المسار ' + path + ' مو ملف', 500);
    if (info.encoding === 'base64' && info.content) return fromBase64(info.content.replace(/\s/g, ''));
    const blob = await (await this.call('/git/blobs/' + info.sha, { cache: 'no-store' })).json();
    return fromBase64(blob.content.replace(/\s/g, ''));
  }

  // يحفظ مجموعة ملفات (bytes) ويشيل ملفات (null) في حفظ واحد.
  // لو أحد حفظ بنفس الوقت، يعيد المحاولة على آخر نسخة.
  async commit(files, message, onProgress = () => {}) {
    const entries = [];
    const paths = Object.keys(files);
    let done = 0;
    for (const path of paths) {
      const bytes = files[path];
      if (bytes === null) {
        entries.push({ path, mode: '100644', type: 'blob', sha: null });
      } else {
        const blob = await (await this.call('/git/blobs', { method: 'POST', body: JSON.stringify({ content: toBase64(bytes), encoding: 'base64' }) })).json();
        entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      onProgress(++done / paths.length);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await (await this.call('/git/ref/heads/' + this.branch, { cache: 'no-store' })).json();
      const parent = await (await this.call('/git/commits/' + ref.object.sha)).json();
      const tree = await (await this.call('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }) })).json();
      const commit = await (await this.call('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }) })).json();
      try {
        await this.call('/git/refs/heads/' + this.branch, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
        return commit.sha;
      } catch (err) {
        if (err.status !== 422 && err.status !== 409) throw err;
      }
    }
    throw new GitHubError('ما قدرنا نحفظ لأن فيه حفظ ثاني بنفس الوقت. جرّب مرة ثانية.', 409);
  }
}
