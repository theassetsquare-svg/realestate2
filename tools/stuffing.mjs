#!/usr/bin/env node
/**
 * 키워드 스터핑 정밀 분석기 (의존성 0)
 *  - 페이지별 주요 타깃 키워드(현장명/카테고리/부동산분양) 밀도
 *  - 본문에서 가장 많이 반복된 3자 이상 한글 키워드 자동 탐지(상위 5)
 *  - 임계 2.5% 초과 시 스터핑으로 표시, 1.0% 미만 주요키워드는 과소최적화 경고
 *
 * 사용: node tools/stuffing.mjs [--ci]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CI = process.argv.includes('--ci');
const MAX = 2.5, MIN = 1.0;

function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n.startsWith('.') || n === 'node_modules' || n === 'tools') continue;
    const f = join(dir, n);
    statSync(f).isDirectory() ? walk(f, acc) : (n.endsWith('.html') && acc.push(f));
  }
  return acc;
}
const pick = (re, s) => { const m = s.match(re); return m ? m[1].trim() : ''; };
function visibleText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}
const chars = t => t.replace(/\s/g, '').length;
const density = (t, kw) => kw ? +(((t.split(kw).length - 1) * kw.length / chars(t)) * 100).toFixed(2) : 0;

// 본문에서 3자 이상 한글 토큰 빈도 → 밀도
function topTokens(text, n = 5) {
  const toks = text.match(/[가-힣]{3,}/g) || [];
  const freq = new Map();
  for (const t of toks) freq.set(t, (freq.get(t) || 0) + 1);
  const total = chars(text) || 1;
  return [...freq.entries()]
    .map(([k, c]) => ({ k, c, d: +((c * k.length / total) * 100).toFixed(2) }))
    .filter(x => x.c >= 3)
    .sort((a, b) => b.d - a.d)
    .slice(0, n);
}

function primaryKeyword(rel, html) {
  const h1 = pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html).replace(/<[^>]+>/g, '').trim();
  if (rel.startsWith('property/')) return h1;                 // 현장명 전체
  if (rel === 'index.html') return '부동산분양';
  const cat = (h1.match(/([가-힣]+분양)/) || [])[1];          // 카테고리 키워드
  return cat || '부동산분양';
}

const files = walk(ROOT).sort();
let problems = 0;
const C = { r: s => `\x1b[31m${s}\x1b[0m`, g: s => `\x1b[32m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`, d: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m` };
console.log(C.b(`\n🔍 키워드 스터핑 정밀 분석 — ${files.length}개 페이지 (임계 ${MIN}~${MAX}%)\n`));

for (const file of files) {
  const rel = relative(ROOT, file);
  const html = readFileSync(file, 'utf8');
  const text = visibleText(html);
  const primary = primaryKeyword(rel, html);
  const dPrimary = density(text, primary);
  const dBudongsan = density(text, '부동산분양');
  const tops = topTokens(text);

  // 실제 스터핑 판정 = 단일 토큰 밀도 (구글이 보는 반복 신호)
  // 멀티워드 현장명의 '전체구절 밀도'는 글자수 합산 특성상 부풀려지므로 참고용.
  const issues = [];   // 하드 실패 (스터핑)
  const warns = [];    // 경고 (참고용)
  if (dBudongsan > MAX) issues.push(`"부동산분양" ${dBudongsan}% 스터핑`);
  for (const t of tops) if (t.d > MAX) issues.push(`반복어 "${t.k}" ${t.d}% (${t.c}회) 스터핑`);

  const isMultiWord = primary.includes(' ');
  if (isMultiWord && dPrimary > 3.5) warns.push(`현장명 전체구절 ${dPrimary}% (구조적 반복 — 단일토큰 기준으로 판정)`);
  if (dPrimary < MIN) warns.push(`주요키워드 "${primary}" ${dPrimary}% 과소(<${MIN}%) — 보강 권장`);

  if (issues.length) problems += issues.length;

  const tag = issues.length ? C.r('FAIL') : (warns.length ? C.y('WARN') : C.g('PASS'));
  console.log(`${tag} ${C.b(rel)} ${C.d(`(${chars(text)}자)`)}`);
  console.log(`   주요키워드 "${primary}" ${dPrimary}%${isMultiWord ? C.d('(전체구절·참고)') : ''}  |  부동산분양 ${dBudongsan}%`);
  console.log(`   ${C.d('상위 반복어: ' + tops.map(t => `${t.k} ${t.d}%(${t.c})`).join(', '))}`);
  for (const i of issues) console.log('   ' + C.r('└─ ' + i));
  for (const w of warns) console.log('   ' + C.y('· ' + w));
  console.log('');
}
console.log(problems === 0 ? C.g(`✅ 스터핑(단일토큰>2.5%) 0건 — 전 페이지 정상\n`) : C.r(`❌ 스터핑 ${problems}건 발견\n`));
if (CI && problems > 0) process.exit(1);
