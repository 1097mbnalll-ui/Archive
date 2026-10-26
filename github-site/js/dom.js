// أداة صغيرة لبناء عناصر الصفحة. النص دايمًا ينحط كنص، فما ينفّذ أي كود.
export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children || [])) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

export const byYear = (a, b) => (a.year || 0) - (b.year || 0);

// يحوّل الأرقام العربية (١٩٨٥) إلى أرقام عادية، ويطلع سنة تقريبية من التاريخ المكتوب (ميلادي أو هجري).
export function yearFrom(dateText) {
  const text = String(dateText || '').replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0);
  const gregorian = text.match(/(?:^|\D)(1[89]\d\d|20\d\d)(?!\d)/);
  if (gregorian) return Number(gregorian[1]);
  const hijri = text.match(/(?:^|\D)(1[34]\d\d)(?!\d)/);
  if (hijri) return Math.round(Number(hijri[1]) * 0.970229 + 621.5643);
  return null;
}
