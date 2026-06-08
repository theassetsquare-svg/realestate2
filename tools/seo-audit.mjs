#!/usr/bin/env node
/**
 * TheAssetSquare 서브사이트 — SEO / 키워드스터핑 / 디버깅 자동 감사 엔진
 * 의존성 0. Node 18+ 표준 모듈만 사용.
 *
 * 사용:
 *   node tools/seo-audit.mjs            # 사람이 읽는 리포트
 *   node tools/seo-audit.mjs --json     # 기계용 JSON
 *   node tools/seo-audit.mjs --ci       # 위반 1개라도 있으면 exit 1 (CI/자동화용)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const AS_JSON = ARGS.includes('--json');
const CI = ARGS.includes('--ci');

// ---- 규칙 (CLAUDE.md 기준) ----
const RULES = {
  titleMax: 60,
  descMin: 70,
  descMax: 160,
  densityMin: 1.5,   // %
  densityMax: 2.5,   // %
  bannedPhones: ['1666-6838'],
  primaryKeyword: '부동산분양',
};

// ---- HTML 파일 수집 ----
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'tools' || name === '404.html') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

// ---- 추출 유틸 ----
const pick = (re, html) => { const m = html.match(re); return m ? m[1].trim() : ''; };
const meta = (name, html) => pick(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, 'i'), html);
const og   = (prop, html) => pick(new RegExp(`<meta\\s+property=["']og:${prop}["']\\s+content=["']([^"']*)["']`, 'i'), html);

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 한국어 키워드 밀도: (키워드 등장수 × 키워드 길이) / 전체 글자수 × 100
function density(text, kw) {
  if (!kw || !text.length) return 0;
  const count = text.split(kw).length - 1;
  return +((count * kw.length / text.length) * 100).toFixed(2);
}
const countOf = (text, kw) => kw ? text.split(kw).length - 1 : 0;

// 현장명 추정: <h1> 안의 핵심 명칭 (em 태그 제거)
function propertyName(html) {
  const h1 = pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html).replace(/<[^>]+>/g, '').trim();
  return h1;
}

const files = walk(ROOT).sort();
const results = [];
const titles = new Map();
const descs = new Map();

for (const file of files) {
  const rel = relative(ROOT, file);
  const html = readFileSync(file, 'utf8');
  const text = visibleText(html);
  const chars = text.replace(/\s/g, '').length;

  const title = pick(/<title>([\s\S]*?)<\/title>/i, html);
  const desc = meta('description', html);
  const canonical = pick(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i, html);
  const ogImage = og('image', html);
  const ogUrl = og('url', html);
  const hasSchema = /application\/ld\+json/i.test(html);
  const h1count = (html.match(/<h1[\s>]/gi) || []).length;
  const h2count = (html.match(/<h2[\s>]/gi) || []).length;
  const lang = pick(/<html[^>]*\blang=["']([^"']*)["']/i, html);
  const viewport = /name=["']viewport["']/i.test(html);

  const pname = propertyName(html);
  const isDetail = rel.startsWith('property/');

  // 밀도: 홈/카테고리는 부동산분양, 상세는 현장명 기준 추가
  const densPrimary = density(text, RULES.primaryKeyword);
  const densName = pname ? density(text, pname.split(' ')[0]) : 0;

  // 내부 링크에 target=_blank 사용된 개수
  const internalBlank = (html.match(/<a\s+href=["'](?:\/|\.\/|[a-z0-9-]+\.html)[^"']*["'][^>]*target=["']_blank["']/gi) || []).length;

  // 금지 전화번호
  const phoneHits = RULES.bannedPhones.reduce((n, p) => n + countOf(html, p), 0);

  const issues = [];
  if (!title) issues.push('title 없음');
  else if ([...title].length > RULES.titleMax) issues.push(`title ${[...title].length}자 (>${RULES.titleMax})`);
  if (!desc) issues.push('description 없음');
  else {
    const dl = [...desc].length;
    if (dl < RULES.descMin) issues.push(`description ${dl}자 (<${RULES.descMin})`);
    if (dl > RULES.descMax) issues.push(`description ${dl}자 (>${RULES.descMax})`);
  }
  if (!canonical) issues.push('canonical 없음');
  if (!ogImage) issues.push('og:image 없음');
  if (!hasSchema) issues.push('JSON-LD 스키마 없음');
  if (h1count !== 1) issues.push(`H1 ${h1count}개 (정확히 1개여야 함)`);
  if (lang !== 'ko') issues.push(`html lang="${lang}" (ko 아님)`);
  if (!viewport) issues.push('viewport meta 없음');
  if (phoneHits) issues.push(`금지 전화번호 ${phoneHits}회`);
  if (internalBlank) issues.push(`내부링크 target=_blank ${internalBlank}개 (UX저해)`);
  if (densPrimary > RULES.densityMax) issues.push(`"${RULES.primaryKeyword}" 밀도 ${densPrimary}% (스터핑>${RULES.densityMax}%)`);
  if (isDetail && densName > RULES.densityMax) issues.push(`현장명 밀도 ${densName}% (스터핑)`);

  // ---- 2단계 게이트 (재발 방지) ----
  // (1) "무료"/"체험" — 절대규칙 #27 (head 포함 전수)
  const freeHits = (html.match(/무료|체험/g) || []).length;
  if (freeHits) issues.push(`"무료/체험" ${freeHits}회 (절대규칙 #27 위반)`);

  // (2) 위성 가짜 폼 — 서브사이트엔 가입/알림 폼 0 (모든 행동은 본진 링크로)
  if (/<form[\s>]/i.test(html)) issues.push('서브사이트 <form> 존재 (가입 폼 금지)');
  if (/type=["']?email/i.test(html)) issues.push('email 입력 필드 존재 (가입 폼 금지)');
  const signupCta = (html.match(/<a[^>]*class=["'][^"']*(?:alert-cta-btn|detail-cta-btn|hero-cta|nav-cta)[^"']*["'][^>]*>([^<]*)<\/a>/gi) || [])
    .filter(a => /신청/.test(a)).length;
  if (signupCta) issues.push(`CTA "신청" 문구 ${signupCta}개 (위성 가입 오인 — 본진 유도 문구로 변경 필요)`);

  // (3) 미검증 단정 분양가 — card-price/spec 분양가에 억·평당 숫자가 헤지 라벨 없이 단정
  const HEDGE = /(예상|예정|미정|확정|공고|추정|전망)/;
  const priceFrags = [
    ...(html.match(/<p class=["']card-price["']>([^<]*)<\/p>/gi) || []),
    ...(html.match(/<strong>분양가<\/strong><span>([^<]*)<\/span>/gi) || []),
  ].map(s => s.replace(/<[^>]+>/g, '').trim());
  const assertive = priceFrags.filter(v => /(\d+\s*억|평당\s*[\d,]+\s*만)/.test(v) && !HEDGE.test(v));
  if (assertive.length) issues.push(`미검증 단정 분양가 ${assertive.length}건 (헤지 라벨 없음): ${assertive.join(' / ')}`);

  // ---- 3단계 게이트 (재발 방지) ----
  // (1) og:image SVG 금지 — 1200² 실 PNG
  if (ogImage && /\.svg(\?|#|$)/i.test(ogImage)) issues.push(`og:image SVG (${ogImage}) — 1200² 실 PNG 필요`);
  // (2) canonical/og:url/내부링크 .html 금지 — 클린 URL 통일(308 1홉 제거)
  if (canonical && /\.html(\?|#|$)/i.test(canonical)) issues.push(`canonical .html — 클린 URL로`);
  if (ogUrl && /\.html(\?|#|$)/i.test(ogUrl)) issues.push(`og:url .html — 클린 URL로`);
  const htmlLinks = (html.match(/href=["']\/[^"']*\.html["']/gi) || []).length;
  if (htmlLinks) issues.push(`내부 .html 링크 ${htmlLinks}개 — 클린 URL로`);
  // (3) 상세 BreadcrumbList 필수
  if (isDetail && !/"BreadcrumbList"/.test(html)) issues.push('상세 BreadcrumbList JSON-LD 누락');

  if (title) titles.set(rel, title);
  if (desc) descs.set(rel, desc);

  results.push({ rel, title, titleLen: [...title].length, desc, descLen: [...desc].length,
    canonical, ogImage, ogUrl, hasSchema, h1count, h2count, chars,
    pname, densPrimary, densName, internalBlank, phoneHits, issues });
}

// ---- 중복 title/description 탐지 ----
function dupes(map) {
  const seen = new Map();
  for (const [k, v] of map) {
    const key = v.trim();
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(k);
  }
  return [...seen.values()].filter(g => g.length > 1);
}
const dupTitles = dupes(titles);
const dupDescs = dupes(descs);

// ---- 모바일 본문 16px 게이트 (style.css 전역) ----
const cssIssues = [];
try {
  const css = readFileSync(join(ROOT, 'style.css'), 'utf8');
  const BODY_COPY = ['.section-desc', '.detail-content p', '.detail-content ul li', '.faq-item summary', '.faq-answer'];
  for (const sel of BODY_COPY) {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[}\\n,])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g');
    let m, minPx = Infinity;
    while ((m = re.exec(css))) {
      const fm = m[1].match(/font-size:\s*([\d.]+)(rem|px)/);
      if (fm) { const px = fm[2] === 'rem' ? parseFloat(fm[1]) * 16 : parseFloat(fm[1]); minPx = Math.min(minPx, px); }
    }
    if (minPx !== Infinity && minPx < 16) cssIssues.push(`${sel} 본문 ${minPx}px (<16px — 모바일 가독성)`);
  }
} catch { /* style.css 없으면 스킵 */ }

// ---- soft-404 / 인프라 게이트 (_redirects · sitemap) ----
const infraIssues = [];
try {
  const rd = readFileSync(join(ROOT, '_redirects'), 'utf8');
  if (/\/\*\s+\/index\.html\s+200/.test(rd)) infraIssues.push('_redirects soft-404: /* → /index.html 200 (가짜URL이 홈 200 반환)');
  else if (/\/\*\s+\/\S+\s+200\b/.test(rd)) infraIssues.push('_redirects: 와일드카드 200 catch-all (soft-404 위험)');
  if (!/\/\*\s+\/404\.html\s+404/.test(rd)) infraIssues.push('_redirects: "/* /404.html 404" 규칙 없음');
} catch { infraIssues.push('_redirects 파일 없음'); }
try {
  const sm = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  if (/\.html<\/loc>/i.test(sm)) infraIssues.push('sitemap .html URL 잔존 — 클린 URL로');
} catch { /* sitemap 없으면 스킵 */ }

const totalIssues = results.reduce((n, r) => n + r.issues.length, 0) + dupTitles.length + dupDescs.length + cssIssues.length + infraIssues.length;

if (AS_JSON) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), pages: results.length, totalIssues, results, dupTitles, dupDescs, cssIssues, infraIssues }, null, 2));
} else {
  const C = { red: s => `\x1b[31m${s}\x1b[0m`, grn: s => `\x1b[32m${s}\x1b[0m`, yel: s => `\x1b[33m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m` };
  console.log(C.b(`\n📊 TheAssetSquare SEO 자동 감사 — ${new Date().toLocaleString('ko-KR')}`));
  console.log(C.dim(`총 ${results.length}개 페이지 | 위반 ${totalIssues}건\n`));
  for (const r of results) {
    const ok = r.issues.length === 0;
    console.log(`${ok ? C.grn('PASS') : C.red('FAIL')} ${C.b(r.rel)}  ${C.dim(`(${r.chars}자)`)}`);
    console.log(`   ${C.dim('title')} [${r.titleLen}] ${r.title}`);
    console.log(`   ${C.dim('desc ')} [${r.descLen}] ${r.desc.slice(0, 70)}${r.desc.length > 70 ? '…' : ''}`);
    console.log(`   ${C.dim('밀도 ')} 부동산분양 ${r.densPrimary}%${r.densName ? ` | 현장명 ${r.densName}%` : ''}  ${C.dim(`H1:${r.h1count} H2:${r.h2count} schema:${r.hasSchema ? 'Y' : 'N'}`)}`);
    if (r.issues.length) for (const i of r.issues) console.log(`   ${C.red('└─ ' + i)}`);
    console.log('');
  }
  if (dupTitles.length) { console.log(C.red('⚠ 중복 title:')); dupTitles.forEach(g => console.log('  ' + g.join(' = '))); }
  if (dupDescs.length) { console.log(C.red('⚠ 중복 description:')); dupDescs.forEach(g => console.log('  ' + g.join(' = '))); }
  if (cssIssues.length) { console.log(C.red('⚠ 모바일 본문 16px 위반:')); cssIssues.forEach(i => console.log('  ' + i)); }
  if (infraIssues.length) { console.log(C.red('⚠ 인프라(soft-404/sitemap) 위반:')); infraIssues.forEach(i => console.log('  ' + i)); }
  console.log(totalIssues === 0 ? C.grn('\n✅ 위반 0건 — 전 페이지 통과\n') : C.red(`\n❌ 총 ${totalIssues}건 수정 필요\n`));
}

if (CI && totalIssues > 0) process.exit(1);
