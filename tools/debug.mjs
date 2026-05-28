#!/usr/bin/env node
/**
 * HTML 디버깅 린터 (의존성 0) — 정적 사이트 버그 정밀 점검
 *  · JSON-LD 파싱 유효성   · 중복 id   · 핵심 태그 균형
 *  · title/charset/viewport/lang/h1   · 깨진/위험 링크(rel)   · 금지 전화번호
 *  · img alt   · 템플릿 잔재(undefined/null)   · 앵커 속성 잔여공백
 *
 * 사용: node tools/debug.mjs [--ci]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CI = process.argv.includes('--ci');
const BANNED = ['1666-6838', '1660-4050'];

function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n.startsWith('.') || n === 'node_modules' || n === 'tools') continue;
    const f = join(dir, n);
    statSync(f).isDirectory() ? walk(f, acc) : (n.endsWith('.html') && acc.push(f));
  }
  return acc;
}
const exists = (p) => { try { statSync(join(ROOT, p)); return true; } catch { return false; } };

function checkTagBalance(html, tag) {
  const open = (html.match(new RegExp(`<${tag}(\\s|>)`, 'gi')) || []).length;
  const close = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
  return open === close ? null : `<${tag}> 불균형 (열림 ${open} / 닫힘 ${close})`;
}

const files = walk(ROOT).sort();
let total = 0;
const C = { r: s => `\x1b[31m${s}\x1b[0m`, g: s => `\x1b[32m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`, d: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m` };
console.log(C.b(`\n🐞 HTML 디버깅 린터 — ${files.length}개 페이지\n`));

for (const file of files) {
  const rel = relative(ROOT, file);
  const html = readFileSync(file, 'utf8');
  const bugs = [];

  // 1) JSON-LD 파싱
  const lds = [...html.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  if (lds.length === 0) bugs.push('JSON-LD 없음');
  lds.forEach((m, i) => { try { JSON.parse(m[1]); } catch (e) { bugs.push(`JSON-LD #${i + 1} 파싱 오류: ${e.message}`); } });

  // 2) 중복 id
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map(m => m[1]);
  const dupId = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dupId.length) bugs.push(`중복 id: ${[...new Set(dupId)].join(', ')}`);

  // 3) 태그 균형
  for (const t of ['html', 'head', 'body', 'main', 'header', 'footer', 'section', 'div', 'ul', 'table', 'a']) {
    const r = checkTagBalance(html, t); if (r) bugs.push(r);
  }

  // 4) 필수 메타/구조
  if ((html.match(/<title>/gi) || []).length !== 1) bugs.push('title 태그가 1개가 아님');
  if (!/charset=/i.test(html)) bugs.push('charset 없음');
  if (!/name=["']viewport["']/i.test(html)) bugs.push('viewport 없음');
  if (!/<html[^>]*\blang=["']ko["']/i.test(html)) bugs.push('html lang="ko" 아님');
  const h1 = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1 !== 1) bugs.push(`H1 ${h1}개`);

  // 5) 링크 점검
  const anchors = [...html.matchAll(/<a\s[^>]*>/gi)].map(m => m[0]);
  for (const a of anchors) {
    const href = (a.match(/href=["']([^"']*)["']/i) || [])[1];
    if (href === undefined) { bugs.push('href 없는 <a>'); continue; }
    if (href === '' || href === '#') bugs.push(`빈 href: ${a.slice(0, 60)}`);
    // 외부 링크 + target=_blank 인데 rel noopener 없음 (보안)
    if (/^https?:\/\//i.test(href) && /target=["']_blank["']/i.test(a) && !/rel=["'][^"']*noopener/i.test(a))
      bugs.push(`외부 _blank 링크에 rel=noopener 없음: ${href}`);
    // 내부 .html 링크 파일 존재?
    if (href.startsWith('/') && href.endsWith('.html') && !exists(href.replace(/^\//, '')))
      bugs.push(`깨진 내부 링크: ${href}`);
  }

  // 6) 금지 전화번호 / tel 링크
  for (const p of BANNED) if (html.includes(p)) bugs.push(`금지 전화번호 ${p}`);
  if (/href=["']tel:/i.test(html)) bugs.push('tel: 링크 잔존');

  // 7) img alt
  for (const img of html.match(/<img\s[^>]*>/gi) || []) if (!/\salt=/i.test(img)) bugs.push('alt 없는 img');

  // 8) 템플릿 잔재 (스크립트/JSON-LD 제외 — '}}' 등은 JSON에서 정상)
  const htmlNoScript = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  for (const bad of ['undefined', 'NaN', '[object Object]', '{{', '}}']) if (htmlNoScript.includes(bad)) bugs.push(`템플릿 잔재 "${bad}"`);

  // 9) 앵커 속성 잔여 공백 (코드모드 아티팩트)
  if (/<a\s[^>]*\s>/i.test(html)) bugs.push('앵커 태그 잔여 공백(" >")');

  total += bugs.length;
  console.log(`${bugs.length ? C.r('BUG ') : C.g('OK  ')} ${C.b(rel)}`);
  for (const b of bugs) console.log('   ' + C.r('└─ ' + b));
}
console.log(total === 0 ? C.g(`\n✅ 버그 0건 — 전 페이지 정상\n`) : C.r(`\n❌ ${total}건 발견\n`));
if (CI && total > 0) process.exit(1);
