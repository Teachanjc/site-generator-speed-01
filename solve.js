const hop = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESC_RE = /[&<>"']/g;
const esc = (s) => s.replace(ESC_RE, (c) => ESCAPES[c]);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MARK_RE = /\p{M}/gu;

function longDate(d) {
  const y = d.slice(0, 4);
  const m = Number(d.slice(5, 7));
  const dd = Number(d.slice(8, 10));
  return dd + ' ' + MONTHS[m - 1] + ' ' + y;
}

function slugify(text, cache) {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const plain = text.normalize('NFKD').replace(MARK_RE, '');
  let out = '';
  let gap = false;
  for (let i = 0; i < plain.length; i++) {
    const ch = plain[i];
    let keep = '';
    if (ch >= 'A' && ch <= 'Z') keep = ch.toLowerCase();
    else if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) keep = ch;
    if (keep === '') {
      if (out.length > 0) gap = true;
      continue;
    }
    if (gap) out += '-';
    gap = false;
    out += keep;
  }
  if (out.length > 64) out = out.slice(0, 64);
  let e = out.length;
  while (e > 0 && out[e - 1] === '-') e--;
  out = out.slice(0, e);
  if (out === '') out = 'untitled';
  cache.set(text, out);
  return out;
}

function uniqSlug(slug, taken) {
  if (!taken.has(slug)) {
    taken.add(slug);
    return slug;
  }
  let n = 2;
  let cand = slug + '-2';
  while (taken.has(cand)) {
    n++;
    cand = slug + '-' + n;
  }
  taken.add(cand);
  return cand;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    let s = '';
    for (let i = 0; i < v.length; i++) {
      if (i > 0) s += ', ';
      s += textOf(v[i]);
    }
    return s;
  }
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

const FM_LINE = /^([a-z_]+):(?: (.*))?$/;
const FM_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FM_NAME = /^[a-z0-9-]+$/;
const FM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FM_TAG = /^[^"[\]]+$/;
const FM_KEYS = ['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary'];

function daysInMonth(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

function fmString(raw) {
  if (raw.charCodeAt(0) === 34) {
    if (raw.length < 2 || raw.charCodeAt(raw.length - 1) !== 34) return { err: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { err: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { err: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { val: out };
  }
  if (raw.charCodeAt(0) === 91) return { err: 'a bare string opens on [' };
  return { val: raw };
}

function fmValue(key, raw) {
  if (key === 'title' || key === 'summary') {
    const s = fmString(raw);
    if (s.err !== undefined) return { err: 'key "' + key + '": ' + s.err };
    return s;
  }
  if (key === 'date') {
    const m = FM_DATE.exec(raw);
    const y = m ? Number(m[1]) : 0;
    const mo = m ? Number(m[2]) : 0;
    const d = m ? Number(m[3]) : 0;
    if (!m || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return { err: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
    return { val: raw };
  }
  if (key === 'tags') {
    if (raw.charCodeAt(0) !== 91 || raw.charCodeAt(raw.length - 1) !== 93) return { err: 'key "tags": not a list [a, b]' };
    const inner = raw.slice(1, -1);
    if (inner.trim() === '') return { val: [] };
    const tags = inner.split(',');
    for (let i = 0; i < tags.length; i++) tags[i] = tags[i].trim();
    for (let i = 0; i < tags.length; i++) {
      if (tags[i] === '' || !FM_TAG.test(tags[i])) return { err: 'key "tags": an empty tag, or one holding " [ or ]' };
    }
    return { val: tags };
  }
  if (key === 'draft') {
    if (raw === 'true') return { val: true };
    if (raw === 'false') return { val: false };
    return { err: 'key "draft": true or false' };
  }
  if (key === 'layout') {
    if (FM_NAME.test(raw)) return { val: raw };
    return { err: 'key "layout": not a template name' };
  }
  if (key === 'slug') {
    if (FM_SLUG.test(raw) && raw.length <= 64) return { val: raw };
    return { err: 'key "slug": not a slug' };
  }
  return { err: 'unknown key "' + key + '"' };
}

function parseFM(text) {
  let pos = 0;
  let firstEnd = text.indexOf('\n');
  if (firstEnd === -1) firstEnd = text.length;
  if (text.slice(0, firstEnd) !== '---') return { err: 'no front matter' };
  let closeOff = -1;
  let closeStart = -1;
  let scan = firstEnd + 1;
  while (scan <= text.length) {
    let e = text.indexOf('\n', scan);
    if (e === -1) e = text.length;
    if (text.slice(scan, e) === '---') { closeOff = e; closeStart = scan; break; }
    if (e === text.length) break;
    scan = e + 1;
  }
  if (closeOff === -1) return { err: 'the front matter is not closed' };
  const data = {};
  let lineNo = 1;
  let p = firstEnd + 1;
  while (p < closeStart) {
    let e = text.indexOf('\n', p);
    if (e === -1 || e > closeStart) e = closeStart;
    const line = text.slice(p, e);
    lineNo++;
    let blank = true;
    for (let i = 0; i < line.length; i++) {
      const c = line.charCodeAt(i);
      if (c !== 32 && c !== 9) { blank = false; break; }
    }
    if (!blank && line.charCodeAt(0) !== 35) {
      const m = FM_LINE.exec(line);
      if (!m) return { err: 'line ' + lineNo + ' is not "key: value"' };
      const key = m[1];
      let raw = m[2] === undefined ? '' : m[2];
      let r = raw.length;
      while (r > 0 && (raw.charCodeAt(r - 1) === 32 || raw.charCodeAt(r - 1) === 9)) r--;
      raw = raw.slice(0, r);
      if (FM_KEYS.indexOf(key) === -1) return { err: 'unknown key "' + key + '"' };
      if (hop(data, key)) return { err: 'key "' + key + '" is given twice' };
      if (raw === '') return { err: 'key "' + key + '" has no value' };
      const v = fmValue(key, raw);
      if (v.err !== undefined) return { err: v.err };
      data[key] = v.val;
    }
    if (e === closeOff) break;
    p = e + 1;
  }
  if (!hop(data, 'title')) return { err: 'no title' };
  const bodyStart = closeOff + 1 <= text.length ? closeOff + 1 : text.length;
  return { data, body: text.slice(bodyStart) };
}

const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);
const INLINE_SPECIAL = /[\\`*\[]/;
const PLAIN_ESC = /[&<>"']/;

function escPush(s, out) {
  if (!PLAIN_ESC.test(s)) out.push(s);
  else out.push(esc(s));
}

function findUnesc(s, what, from) {
  const wlen = what.length;
  for (let j = from; j <= s.length - wlen; j++) {
    if (s[j] === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) { j++; continue; }
    if (s.startsWith(what, j)) return j;
  }
  return -1;
}

function findSingleStar(s, from) {
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) { j++; continue; }
    if (c !== '*') continue;
    if (s[j + 1] === '*') { j++; continue; }
    return j;
  }
  return -1;
}

function nextSpecial(s, from) {
  let j = s.length;
  for (let q = 0; q < 4; q++) {
    const k = s.indexOf(SPECIALS[q], from);
    if (k !== -1 && k < j) j = k;
  }
  return j;
}

const SPECIALS = ['\\', '`', '*', '['];

function inlineInto(s, link, out) {
  let i = 0;
  let plain = 0;
  while (i < s.length) {
    const j = nextSpecial(s, i);
    if (j >= s.length) break;
    const c = s[j];
    if (c === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
      if (j > plain) escPush(s.slice(plain, j), out);
      out.push(ESCAPES[s[j + 1]] || s[j + 1]);
      i = j + 2;
      plain = i;
      continue;
    }
    if (c === '`') {
      const k = s.indexOf('`', j + 1);
      if (k > j + 1) {
        if (j > plain) escPush(s.slice(plain, j), out);
        out.push('<code>');
        escPush(s.slice(j + 1, k), out);
        out.push('</code>');
        i = k + 1;
        plain = i;
      } else {
        i = j + 1;
      }
      continue;
    }
    if (c === '*') {
      if (s[j + 1] === '*') {
        const k = findUnesc(s, '**', j + 2);
        if (k > j + 2) {
          if (j > plain) escPush(s.slice(plain, j), out);
          out.push('<strong>');
          inlineInto(s.slice(j + 2, k), link, out);
          out.push('</strong>');
          i = k + 2;
          plain = i;
        } else {
          i = j + 2;
        }
        continue;
      }
      const k = findSingleStar(s, j + 1);
      if (k > j + 1) {
        if (j > plain) escPush(s.slice(plain, j), out);
        out.push('<em>');
        inlineInto(s.slice(j + 1, k), link, out);
        out.push('</em>');
        i = k + 1;
        plain = i;
      } else {
        i = j + 1;
      }
      continue;
    }
    if (c === '[') {
      const k = findUnesc(s, ']', j + 1);
      const m = k !== -1 && s[k + 1] === '(' ? s.indexOf(')', k + 2) : -1;
      const target = m === -1 ? '' : s.slice(k + 2, m);
      if (target !== '' && !/\s/.test(target)) {
        if (j > plain) escPush(s.slice(plain, j), out);
        out.push('<a href="');
        escPush(link(target), out);
        out.push('">');
        inlineInto(s.slice(j + 1, k), link, out);
        out.push('</a>');
        i = m + 1;
        plain = i;
      } else {
        i = j + 1;
      }
      continue;
    }
    i = j + 1;
  }
  if (s.length > plain) escPush(s.slice(plain), out);
}

function inlineStr(s, link) {
  if (!INLINE_SPECIAL.test(s) && !PLAIN_ESC.test(s)) return s;
  if (!INLINE_SPECIAL.test(s)) return esc(s);
  const out = [];
  inlineInto(s, link, out);
  return out.join('');
}

function isBlank(line) {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function trimLine(line) {
  let a = 0;
  let b = line.length;
  while (a < b && (line.charCodeAt(a) === 32 || line.charCodeAt(a) === 9)) a++;
  while (b > a && (line.charCodeAt(b - 1) === 32 || line.charCodeAt(b - 1) === 9)) b--;
  return line.slice(a, b);
}

function fenceLangOf(line) {
  if (!line.startsWith('```')) return null;
  let i = 3;
  const start = i;
  while (i < line.length) {
    const c = line.charCodeAt(i);
    const ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 43 || c === 45;
    if (!ok) break;
    i++;
  }
  const langEnd = i;
  while (i < line.length && (line.charCodeAt(i) === 32 || line.charCodeAt(i) === 9)) i++;
  if (i !== line.length) return null;
  return line.slice(start, langEnd);
}

function isFenceClose(line) {
  if (!line.startsWith('```')) return false;
  for (let i = 3; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function headingInfo(line) {
  let n = 0;
  while (n < line.length && line.charCodeAt(n) === 35) n++;
  if (n === 0 || n > 6) return null;
  if (n >= line.length) return null;
  const c = line.charCodeAt(n);
  if (c !== 32 && c !== 9) return null;
  let a = n;
  while (a < line.length && (line.charCodeAt(a) === 32 || line.charCodeAt(a) === 9)) a++;
  let b = line.length;
  while (b > a && (line.charCodeAt(b - 1) === 32 || line.charCodeAt(b - 1) === 9)) b--;
  if (b === a) return null;
  return { depth: n, text: line.slice(a, b) };
}

function isHr(line) {
  if (!line.startsWith('---') && !line.startsWith('***')) return false;
  for (let i = 3; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function endsPara(line) {
  return isBlank(line) || fenceLangOf(line) !== null || headingInfo(line) !== null || isHr(line);
}

const CONTINUED_RE = /^ {2,}\S/;

function renderBody(body, link, slugCache) {
  const lines = body.split('\n');
  const blocks = [];
  const toc = [];
  let excerpt = '';
  let haveExcerpt = false;
  const ids = new Set();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const lang = fenceLangOf(line);
    if (lang !== null) {
      const parts = [];
      i++;
      while (i < lines.length && !isFenceClose(lines[i])) { parts.push(lines[i]); i++; }
      i++;
      let code = '<pre><code';
      if (lang !== '') code += ' class="language-' + esc(lang) + '"';
      code += '>';
      for (let q = 0; q < parts.length; q++) { code += esc(parts[q]); code += '\n'; }
      code += '</code></pre>';
      blocks.push(code);
      continue;
    }
    const hd = headingInfo(line);
    if (hd !== null) {
      const id = uniqSlug(slugify(hd.text, slugCache), ids);
      const html = inlineStr(hd.text, link);
      blocks.push('<h' + hd.depth + ' id="' + id + '">' + html + '</h' + hd.depth + '>');
      if (hd.depth === 2 || hd.depth === 3) toc.push({ level: hd.depth, id, html });
      i++;
      continue;
    }
    if (isHr(line)) { blocks.push('<hr>'); i++; continue; }
    if (line.charCodeAt(0) === 62) {
      const qlines = [];
      while (i < lines.length && lines[i].charCodeAt(0) === 62) {
        let l = lines[i].slice(1);
        if (l.charCodeAt(0) === 32) l = l.slice(1);
        qlines.push(l);
        i++;
      }
      const kept = [];
      for (let q = 0; q < qlines.length; q++) {
        const t = trimLine(qlines[q]);
        if (t !== '') kept.push(t);
      }
      if (kept.length === 0) blocks.push('<blockquote>\n</blockquote>');
      else blocks.push('<blockquote>\n<p>' + inlineStr(kept.join('\n'), link) + '</p>\n</blockquote>');
      continue;
    }
    let bullet = null;
    let ordered = null;
    let startNum = 1;
    if ((line.charCodeAt(0) === 45 || line.charCodeAt(0) === 42) && line.charCodeAt(1) === 32) bullet = true;
    else {
      let d = 0;
      while (d < line.length && line.charCodeAt(d) >= 48 && line.charCodeAt(d) <= 57) d++;
      if (d >= 1 && d <= 9 && line.charCodeAt(d) === 46 && line.charCodeAt(d + 1) === 32) {
        ordered = true;
        startNum = Number(line.slice(0, d));
      }
    }
    if (bullet || ordered) {
      const items = [];
      while (i < lines.length) {
        const cur = lines[i];
        let mText = null;
        if (ordered) {
          let d = 0;
          while (d < cur.length && cur.charCodeAt(d) >= 48 && cur.charCodeAt(d) <= 57) d++;
          if (d >= 1 && d <= 9 && cur.charCodeAt(d) === 46 && cur.charCodeAt(d + 1) === 32) mText = cur.slice(d + 2);
        } else if ((cur.charCodeAt(0) === 45 || cur.charCodeAt(0) === 42) && cur.charCodeAt(1) === 32) {
          mText = cur.slice(2);
        }
        if (mText !== null) {
          items.push([trimLine(mText)]);
          i++;
        } else if (CONTINUED_RE.test(cur)) {
          items[items.length - 1].push(trimLine(cur));
          i++;
        } else break;
      }
      const tag = ordered ? 'ol' : 'ul';
      const open = ordered && startNum !== 1 ? '<ol start="' + startNum + '">' : '<' + tag + '>';
      let out = open + '\n';
      for (let q = 0; q < items.length; q++) out += '<li>' + inlineStr(items[q].join('\n'), link) + '</li>\n';
      out += '</' + tag + '>';
      blocks.push(out);
      continue;
    }
    const para = [trimLine(line)];
    i++;
    while (i < lines.length && !endsPara(lines[i])) { para.push(trimLine(lines[i])); i++; }
    const html = inlineStr(para.join('\n'), link);
    if (!haveExcerpt) { excerpt = html; haveExcerpt = true; }
    blocks.push('<p>' + html + '</p>');
  }
  let html = '';
  for (let q = 0; q < blocks.length; q++) html += blocks[q] + '\n';
  return { html, toc, excerpt };
}

const TPL_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const TPL_FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const TPL_IF = /^if (not )?(\S+)$/;
const TPL_INCLUDE = /^include "([a-z0-9-]+)"$/;

function tplFail(name, msg) {
  const e = new Error('template "' + name + '": ' + msg);
  e.tpl = true;
  return e;
}

function tplPath(name, text) {
  if (!TPL_PATH.test(text)) throw tplFail(name, JSON.stringify(text) + ' is not a path');
  return text.split('.');
}

function tokenizeTpl(name, src) {
  const toks = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw tplFail(name, 'a ' + (raw ? '{{{' : '{{') + ' is not closed');
      if (text !== '') { toks.push({ t: 0, text }); text = ''; }
      toks.push({ t: raw ? 2 : 1, path: tplPath(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw tplFail(name, 'a {% is not closed');
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const beforeOk = /^[ \t]*$/.test(src.slice(lineStart, open));
    const afterOk = /^[ \t]*$/.test(src.slice(end, lineEnd));
    const alone = beforeOk && afterOk;
    if (alone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') { toks.push({ t: 0, text }); text = ''; }
    toks.push({ t: 3, tag: src.slice(open + 2, close).trim() });
    i = alone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') toks.push({ t: 0, text });
  return toks;
}

function parseTpl(name, src) {
  const root = { k: 0, body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenizeTpl(name, src)) {
    if (tok.t === 0) { body.push({ k: 0, text: tok.text }); continue; }
    if (tok.t === 1 || tok.t === 2) { body.push({ k: tok.t, path: tok.path }); continue; }
    const tag = tok.tag;
    const top = stack[stack.length - 1];
    let m;
    if ((m = TPL_FOR.exec(tag)) !== null) {
      const node = { k: 3, name: m[1], path: tplPath(name, m[2]), body: [] };
      body.push(node);
      stack.push(node);
      body = node.body;
    } else if ((m = TPL_IF.exec(tag)) !== null) {
      const node = { k: 4, not: m[1] !== undefined, path: tplPath(name, m[2]), then: [], els: null };
      body.push(node);
      stack.push(node);
      body = node.then;
    } else if (tag === 'else') {
      if (top.k !== 4 || top.els !== null) throw tplFail(name, 'an else outside an if');
      top.els = [];
      body = top.els;
    } else if (tag === 'endfor' || tag === 'endif') {
      const want = tag === 'endfor' ? 3 : 4;
      if (top.k !== want) throw tplFail(name, 'an ' + tag + ' with no open ' + tag.slice(3));
      stack.pop();
      const parent = stack[stack.length - 1];
      body = parent.k === 0 ? parent.body : parent.k === 3 ? parent.body : (parent.els !== null && parent.els !== undefined ? parent.els : parent.then);
    } else if ((m = TPL_INCLUDE.exec(tag)) !== null) {
      body.push({ k: 5, name: m[1] });
    } else throw tplFail(name, '{% ' + tag + ' %} is not a tag');
  }
  if (stack.length > 1) {
    const top = stack[stack.length - 1];
    throw tplFail(name, 'a ' + (top.k === 3 ? 'for' : 'if') + ' is not closed');
  }
  return root.body;
}

function genPath(path, scopeVar, ctr) {
  const v = '_v' + (ctr.n++);
  let code = 'let ' + v + '=' + scopeVar + '.' + path[0] + ';';
  for (let q = 1; q < path.length; q++) {
    code += v + '=(' + v + '!==null&&typeof ' + v + "==='object'&&c.hop(" + v + ',' + JSON.stringify(path[q]) + '))?' + v + '.' + path[q] + ':undefined;';
  }
  return { code, v };
}

function genNodes(nodes, scopeVar, ctr, out) {
  for (const n of nodes) {
    if (n.k === 0) {
      out.push('o.push(' + JSON.stringify(n.text) + ');');
    } else if (n.k === 1) {
      const g = genPath(n.path, scopeVar, ctr);
      out.push(g.code + 'o.push(c.esc(c.txt(' + g.v + ')));');
    } else if (n.k === 2) {
      const g = genPath(n.path, scopeVar, ctr);
      out.push(g.code + 'o.push(c.txt(' + g.v + '));');
    } else if (n.k === 4) {
      const g = genPath(n.path, scopeVar, ctr);
      out.push(g.code + 'if(c.tru(' + g.v + ')!==' + (n.not ? 'true' : 'false') + '){');
      genNodes(n.then, scopeVar, ctr, out);
      out.push('}');
      if (n.els !== null) {
        out.push('else{');
        genNodes(n.els, scopeVar, ctr, out);
        out.push('}');
      }
    } else if (n.k === 3) {
      const g = genPath(n.path, scopeVar, ctr);
      const a = '_a' + (ctr.n++);
      const k = '_k' + (ctr.n++);
      const sv = '_s' + (ctr.n++);
      out.push(g.code + 'const ' + a + '=' + g.v + ';if(Array.isArray(' + a + ')){for(let ' + k + '=0;' + k + '<' + a + '.length;' + k + '++){const ' + sv + '=Object.create(' + scopeVar + ');' + sv + '.' + n.name + '=' + a + '[' + k + '];' + sv + '.loop={index:' + k + '+1,first:' + k + '===0,last:' + k + '===' + a + '.length-1,length:' + a + '.length};');
      genNodes(n.body, sv, ctr, out);
      out.push('}}');
    } else if (n.k === 5) {
      const f = '_f' + (ctr.n++);
      out.push('const ' + f + '=c.tpls.get(' + JSON.stringify(n.name) + ');if(' + f + '!==undefined&&d<8)o.push(' + f + '(' + scopeVar + ',d+1,c));');
    }
  }
}

function compileTpl(name, src) {
  const nodes = parseTpl(name, src);
  const ctr = { n: 0 };
  const parts = ['let o=[];'];
  genNodes(nodes, 's', ctr, parts);
  parts.push('return o.join("");');
  const fn = new Function('s', 'd', 'c', parts.join(''));
  return fn;
}

function resolveLink(dir, target, bySource, staticSet, base, broken, srcPath) {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.charCodeAt(0) === 47 || target.charCodeAt(0) === 35) return target;
  const hash = target.indexOf('#');
  const rel = hash === -1 ? target : target.slice(0, hash);
  const frag = hash === -1 ? '' : target.slice(hash);
  let path = null;
  if (rel !== '') {
    const parts = dir === '' ? [] : dir.split('/');
    let ok = true;
    for (const seg of rel.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        if (parts.length === 0) { ok = false; break; }
        parts.pop();
      } else parts.push(seg);
    }
    path = ok ? parts.join('/') : null;
  }
  if (path !== null && bySource.has(path)) return bySource.get(path).url + frag;
  if (path !== null && staticSet.has(path)) return base + '/' + path + frag;
  broken.add('broken-link ' + srcPath + ' -> ' + target);
  return target;
}

const RESERVED = ['posts', 'tags', 'page'];

export function run(input) {
  const slugCache = new Map();
  const report = [];
  const tpls = new Map();
  const tplBySrc = new Map();
  const names = Object.keys(input.templates).sort(cmp);
  for (const name of names) {
    const src = input.templates[name];
    if (tplBySrc.has(src)) {
      tpls.set(name, tplBySrc.get(src));
      continue;
    }
    try {
      const fn = compileTpl(name, src);
      tplBySrc.set(src, fn);
      tpls.set(name, fn);
    } catch (e) {
      if (e && e.tpl) report.push(e.message);
      else throw e;
    }
  }
  const base = input.site.base_url.replace(/\/+$/, '');
  const files = [...input.files].sort((a, b) => cmp(a.path, b.path));
  const sources = [];
  const statics = [];
  for (const f of files) {
    if (f.path.endsWith('.md')) sources.push({ path: f.path, text: f.content.replace(/\r\n?/g, '\n') });
    else statics.push(f);
  }
  const kept = [];
  for (const s of sources) {
    const fm = parseFM(s.text);
    if (fm.err !== undefined) {
      report.push('refused ' + s.path + ': ' + fm.err);
      continue;
    }
    s.data = fm.data;
    s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    let own = undefined;
    for (const d of RESERVED) {
      if (d !== 'posts' && s.path.startsWith(d + '/')) { own = d; break; }
    }
    if (own !== undefined) {
      report.push('refused ' + s.path + ': ' + own + '/ is the generator\'s own');
      continue;
    }
    if (s.post && !hop(s.data, 'date')) {
      report.push('refused ' + s.path + ': a post needs a date');
      continue;
    }
    const layout = s.data.layout !== undefined ? s.data.layout : (s.post ? 'post' : 'page');
    if (!tpls.has(layout)) {
      report.push('refused ' + s.path + ': layout "' + layout + '" is no template that parses');
      continue;
    }
    s.layout = layout;
    if (s.data.draft === true) {
      report.push('draft ' + s.path);
      continue;
    }
    kept.push(s);
  }
  const dirOf = (p) => {
    const q = p.lastIndexOf('/');
    return q === -1 ? '' : p.slice(0, q);
  };
  const takenByDir = new Map();
  const bySource = new Map();
  for (const s of kept) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    let taken = takenByDir.get(dir);
    if (taken === undefined) {
      taken = new Set(dir === '' ? RESERVED : []);
      takenByDir.set(dir, taken);
    }
    const slug = uniqSlug(s.data.slug !== undefined ? s.data.slug : slugify(s.data.title, slugCache), taken);
    s.slug = slug;
    s.outDir = dir === '' ? slug : dir + '/' + slug;
    s.url = base + '/' + s.outDir + '/';
    bySource.set(s.path, s);
  }
  const staticSet = new Set();
  for (const f of statics) staticSet.add(f.path);
  const broken = new Set();
  for (const s of kept) {
    const dir = dirOf(s.path);
    const link = (target) => resolveLink(dir, target, bySource, staticSet, base, broken, s.path);
    const md = renderBody(s.body, link, slugCache);
    s.html = md.html;
    s.toc = md.toc;
    s.excerpt = md.excerpt;
  }
  const posts = kept.filter((s) => s.post);
  posts.sort((x, y) => cmp(y.data.date, x.data.date) || cmp(x.slug, y.slug));
  for (let k = 0; k < posts.length; k++) {
    posts[k].newer = k === 0 ? null : posts[k - 1];
    posts[k].older = k === posts.length - 1 ? null : posts[k + 1];
  }
  const bySlug = new Map();
  const ownTags = (s) => {
    const seen = new Set();
    const out = [];
    const list = s.data.tags === undefined ? [] : s.data.tags;
    for (const name of list) {
      const slug = slugify(name, slugCache);
      if (!seen.has(slug)) { seen.add(slug); out.push(name); }
    }
    return out;
  };
  for (const p of posts) {
    p.tagRefs = [];
    for (const name of ownTags(p)) {
      const slug = slugify(name, slugCache);
      let tag = bySlug.get(slug);
      if (tag === undefined) {
        tag = { name, slug, url: base + '/tags/' + slug + '/', posts: [] };
        bySlug.set(slug, tag);
      }
      tag.posts.push(p);
      p.tagRefs.push(tag);
    }
  }
  for (const s of kept) {
    if (s.post) continue;
    s.tagRefs = ownTags(s).map((name) => {
      const slug = slugify(name, slugCache);
      const t = bySlug.get(slug);
      return t !== undefined ? t : { name, slug, url: '', posts: [] };
    });
  }
  const tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || cmp(x.slug, y.slug));
  const cardOf = (s) => {
    const wm = s.body.match(/\S+/g);
    const words = wm === null ? 0 : wm.length;
    return {
      title: s.data.title,
      url: s.url,
      date: s.data.date === undefined ? '' : s.data.date,
      date_long: s.data.date === undefined ? '' : longDate(s.data.date),
      summary: s.data.summary === undefined ? '' : s.data.summary,
      excerpt: s.excerpt,
      reading_minutes: Math.max(1, Math.ceil(words / 200)),
      tags: s.tagRefs.map((t) => ({ name: t.name, slug: t.slug, url: t.url })),
    };
  };
  const linkOf = (s) => {
    if (s === null) return null;
    return { title: s.data.title, url: s.url, date: s.data.date === undefined ? '' : s.data.date, date_long: s.data.date === undefined ? '' : longDate(s.data.date) };
  };
  const cards = new Map();
  for (const p of posts) cards.set(p, cardOf(p));
  const site = { title: input.site.title, base_url: base };
  const allTags = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = posts.slice(0, input.site.recent).map((p) => cards.get(p));
  const ctx = { tpls, esc, txt: textOf, tru: truthy, hop };
  const output = {};
  const render = (name, extra) => {
    const fn = tpls.get(name);
    if (fn === undefined) return null;
    const sc = Object.create(null);
    sc.site = site;
    sc.tags = allTags;
    sc.recent = recent;
    for (const k of Object.keys(extra)) sc[k] = extra[k];
    return fn(sc, 0, ctx);
  };
  for (const s of kept) {
    const cached = s.post ? cards.get(s) : null;
    const page = cached !== null && cached !== undefined ? { ...cached } : cardOf(s);
    page.slug = s.slug;
    page.content = s.html;
    page.toc = s.toc.map((h) => ({ level: h.level, id: h.id, html: h.html }));
    page.newer = linkOf(s.newer === undefined ? null : s.newer);
    page.older = linkOf(s.older === undefined ? null : s.older);
    page.is_post = s.post;
    output[s.outDir + '/index.html'] = render(s.layout, { page });
  }
  const per = input.site.per_page;
  const pageCount = Math.max(1, Math.ceil(posts.length / per));
  const indexUrl = (k) => (k === 1 ? base + '/' : base + '/page/' + k + '/');
  for (let k = 1; k <= pageCount; k++) {
    const html = render('index', {
      posts: posts.slice((k - 1) * per, k * per).map((p) => cards.get(p)),
      pager: { number: k, total: pageCount, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pageCount ? '' : indexUrl(k + 1) },
    });
    if (html !== null) output[k === 1 ? 'index.html' : 'page/' + k + '/index.html'] = html;
  }
  for (const t of tags) {
    const html = render('tag', { tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => cards.get(p)) } });
    if (html !== null) output['tags/' + t.slug + '/index.html'] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) output['tags/index.html'] = tagsHtml;
  for (const f of statics) {
    if (hop(output, f.path)) report.push('shadowed ' + f.path + ': a built page has its path');
    else output[f.path] = f.content;
  }
  const lines = [...report, ...broken].sort(cmp);
  const pageNum = kept.filter((s) => !s.post).length;
  lines.push('built ' + pageNum + ' pages, ' + posts.length + ' posts, ' + tags.length + ' tags and ' + statics.length + ' static files');
  output['build-report.txt'] = lines.join('\n') + '\n';
  return output;
}
