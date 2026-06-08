#!/usr/bin/env node
/**
 * 신규 현장 상세 생성기 — SSOT(data/listings.json) 실데이터만으로 상세 페이지 + 유입링크 생성.
 *  · property/<slug>.html 없으면 생성(있으면 스킵 — 멱등, 기존 수기 콘텐츠 무손상)
 *  · 카테고리/홈 card-grid 에 카드 주입(고아 방지 inbound)
 *  · 상세→상세 크로스링크 3개(같은 카테고리 우선, 막다른길 방지)
 *  · 확정 분양가/청약일은 출처 '청약홈' 표기, 미확정은 '(예상)/(예정)' 헤지(창작 0)
 *  · 무료 0·다크패턴 0·canonical 클린·og PNG·BreadcrumbList — 전 게이트 통과 형식
 *
 * 사용: node tools/new-listing.mjs --all        # SSOT 전체 중 미존재분 생성
 *       node tools/new-listing.mjs <slug>       # 특정 slug
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(join(ROOT, 'data/listings.json'), 'utf8'));
const BASE = db.site;
const CAT = Object.fromEntries(db.categories.map((c) => [c.slug, c]));
const ICON = { apartment: '🏢', officetel: '🏬', store: '🏪', 'knowledge-center': '🏗️', land: '🌳', industrial: '🏭' };

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hedge = (p) => p.confirmed ? '(청약홈 기준)' : (p.source === '예정' ? '(예정)' : '(예상)');
const priceText = (l) => l.price.text ? `${l.price.text}${/억|평당|원/.test(l.price.text) ? ' ' + hedge(l.price) : ''}` : '분양가 모집공고 시 확정';
const loc = (r) => [r.city.replace('특별시', '').replace('광역시', ''), r.gu, r.dong].filter(Boolean).join(' ');
const cardMeta = (l) => [loc(l.region), l.units ? `${l.units.toLocaleString()}세대` : null, l.floors || l.sizes].filter(Boolean).join(' | ');

function related(l) {
  const slugs = db.listings.filter((x) => x.status !== 'archived').map((x) => x.slug).sort();
  const same = slugs.filter((s) => s !== l.slug && db.listings.find((x) => x.slug === s).category === l.category);
  const other = slugs.filter((s) => s !== l.slug && db.listings.find((x) => x.slug === s).category !== l.category);
  return [...same, ...other].slice(0, 3).map((s) => db.listings.find((x) => x.slug === s));
}

function card(l) {
  return `
    <a href="/property/${l.slug}" class="card-link">
      <div class="card-img-placeholder">${ICON[l.category] || '🏢'}</div>
      <div class="card-body">
        <span class="badge badge-upcoming">${esc(l.badge)}</span>
        <h3>${esc(l.name)}</h3>
        <p class="card-meta">${esc(cardMeta(l))}</p>
        <p class="card-price">${esc(priceText(l))}</p>
      </div>
    </a>`;
}

function detailHtml(l) {
  const c = CAT[l.category]; const r = l.region;
  const title = `${l.name} — ${r.gu} ${r.zone || r.dong} ${l.units ? l.units.toLocaleString() + '세대' : c.label}`.slice(0, 60);
  const desc = `${l.name} 분양 정보. ${loc(r)}${r.zone ? ' ' + r.zone : ''} ${l.units ? l.units.toLocaleString() + '세대' : ''} ${l.builder || ''} 시공, ${priceText(l)}. ${l.schedule.apply || '2026년'} 분양 예정. 청약홈·언론 교차검증 실데이터.`.replace(/\s+/g, ' ').trim().slice(0, 158);
  const ld = {
    '@context': 'https://schema.org', '@type': 'RealEstateListing', name: l.name,
    description: `${loc(r)}${r.zone ? ' ' + r.zone : ''} ${l.units ? l.units.toLocaleString() + '세대' : ''} ${l.builder || ''} 분양${l.schedule.apply ? ', ' + l.schedule.apply + ' 예정' : ''}`.replace(/\s+/g, ' ').trim(),
    url: `${BASE}/property/${l.slug}`, datePosted: l.source.verifiedAt,
    address: { '@type': 'PostalAddress', addressLocality: r.city, addressRegion: r.gu, streetAddress: r.dong },
  };
  const bc = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '부동산분양', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: c.label, item: `${BASE}/${c.slug}` },
      { '@type': 'ListItem', position: 3, name: l.name, item: `${BASE}/property/${l.slug}` },
    ],
  };
  const specs = [
    ['면적', l.sizes], ['세대수', l.units ? `${l.units.toLocaleString()}세대${l.generalUnits ? `(일반 약 ${l.generalUnits.toLocaleString()}세대)` : ''}` : null],
    ['시공', l.builder], ['분양가', priceText(l)], ['청약', l.schedule.apply ? `${l.schedule.apply}${l.schedule.applyConfirmed ? '' : ' 예정'}` : '미정'],
    ['입주', l.schedule.moveIn ? `${l.schedule.moveIn} 예정` : '추후 공지'],
  ].filter(([, v]) => v);
  const rel = related(l);
  const srcLine = l.price.confirmed || l.schedule.applyConfirmed ? '확정 정보는 청약홈(한국부동산원) 공시 기준입니다.' : '확정 분양가·청약일은 모집공고 시점에 확정되며, 현재 수치는 예상치입니다.';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${BASE}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="1200">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:url" content="${BASE}/property/${l.slug}">
<link rel="canonical" href="${BASE}/property/${l.slug}">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/style.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(bc)}</script>
</head>
<body>

<header class="site-header"><div class="container">
  <a href="https://theassetsquare.com/" class="logo" target="_blank" rel="noopener noreferrer"><strong>더에셋스퀘어</strong></a>
  <nav class="main-nav">
    <a href="/apartment">아파트</a><a href="/officetel">오피스텔</a><a href="/store">상가</a><a href="/knowledge-center">지식산업센터</a>
    <a href="https://theassetsquare.com/" class="nav-cta" target="_blank" rel="noopener noreferrer">AI 상담받기</a>
  </nav>
  <button class="menu-toggle" aria-label="메뉴" aria-expanded="false"><span></span><span></span><span></span></button>
</div></header>
<main>

<nav class="breadcrumb"><div class="container"><a href="/">부동산분양</a> › <a href="/${c.slug}">${esc(c.label.replace('분양', ''))}</a> › ${esc(l.name)}</div></nav>

<section class="detail-hero"><div class="container">
  <span class="badge badge-upcoming">${esc(l.badge)}</span>
  <h1>${esc(l.name)}</h1>
  <p class="detail-location">${esc(loc(r))}${r.zone ? ` (${esc(r.zone)})` : ''}</p>
  <div class="detail-specs">
    ${specs.map(([k, v]) => `<div class="spec-box"><strong>${esc(k)}</strong><span>${esc(v)}</span></div>`).join('\n    ')}
  </div>
</div></section>

<section class="detail-content"><div class="container">
  <h2>${esc(l.name)} 분양 개요</h2>
  <p>${esc(loc(r))}${r.zone ? ` ${esc(r.zone)}` : ''}에 공급되는 ${esc(c.label)} 현장입니다. ${l.units ? `총 ${l.units.toLocaleString()}세대${l.generalUnits ? `(일반분양 약 ${l.generalUnits.toLocaleString()}세대)` : ''} 규모이며, ` : ''}${l.floors ? `${esc(l.floors)} 구성으로 ` : ''}${l.builder ? `${esc(l.builder)}이 시공합니다. ` : ''}청약 일정은 ${esc(l.schedule.apply || '추후 공지')}${l.schedule.applyConfirmed ? '' : ' 예정'}이며, ${l.schedule.moveIn ? `입주는 ${esc(l.schedule.moveIn)}으로 예정되어 있습니다. ` : '입주 시점은 추후 공지될 예정입니다. '}${srcLine}</p>

  <h2>분양가 및 일정</h2>
  <p>현재 분양가는 <strong>${esc(priceText(l))}</strong> 수준입니다. ${srcLine} 모집공고가 공개되면 확정 분양가·청약 자격·일정을 청약홈에서 다시 확인하시기 바랍니다.</p>
  <ul>
    <li>분양가: ${esc(priceText(l))}</li>
    <li>청약: ${esc(l.schedule.apply || '미정')}${l.schedule.applyConfirmed ? '' : ' 예정'}</li>
    ${l.schedule.moveIn ? `<li>입주: ${esc(l.schedule.moveIn)} 예정</li>` : ''}
    <li>출처: ${esc(l.source.name)} (확인 ${esc(l.source.verifiedAt)})</li>
  </ul>

  <h2>자주 묻는 질문</h2>
  <details class="faq-item"><summary>청약 일정은 언제인가요?</summary><div class="faq-answer">${esc(l.schedule.apply || '미정')}${l.schedule.applyConfirmed ? ' 입니다.' : ' 예정입니다. 정확한 접수일은 모집공고를 통해 확정됩니다.'}</div></details>
  <details class="faq-item"><summary>분양가는 얼마인가요?</summary><div class="faq-answer">${esc(priceText(l))} 수준입니다. ${esc(srcLine)}</div></details>
  <details class="faq-item"><summary>세대 규모와 시공사는?</summary><div class="faq-answer">${l.units ? `총 ${l.units.toLocaleString()}세대` : '세대수 미정'}${l.builder ? `, 시공 ${esc(l.builder)}` : ''} 입니다.</div></details>

  <div class="detail-cta-box">
    <p>이 현장에 대해 더 자세한 상담이 필요하신가요?</p>
    <a href="https://theassetsquare.com/" class="detail-cta-btn" target="_blank" rel="noopener noreferrer">AI 분양상담 받기</a>
  </div>
</div></section>

<section class="section"><div class="container">
  <h2>관련 분양 현장</h2>
  <div class="card-grid">${rel.map(card).join('')}
  </div>
</div></section>

</main>
<footer class="site-footer"><div class="container">
  <div class="footer-links"><a href="/apartment">아파트</a><a href="/officetel">오피스텔</a><a href="/store">상가</a><a href="/knowledge-center">지식산업센터</a></div>
  <p class="footer-copy">&copy; 2026 더에셋스퀘어. All rights reserved.</p>
</div></footer>

<script src="/main.js"></script>
<div class="site-bottombar"><a href="https://theassetsquare.com/" target="_blank" rel="noopener noreferrer">더에셋스퀘어에서 더 보기 →</a></div>
</body>
</html>
`;
}

// card-grid 에 카드 주입(첫 번째 .card-grid, 멱등)
function injectCard(file, l) {
  if (!existsSync(file)) return false;
  let h = readFileSync(file, 'utf8');
  if (h.includes(`href="/property/${l.slug}"`)) return false; // 이미 있음
  const m = h.match(/<div class="card-grid">/);
  if (!m) return false;
  h = h.replace('<div class="card-grid">', '<div class="card-grid">' + card(l));
  writeFileSync(file, h);
  return true;
}

const arg = process.argv.slice(2);
const targets = arg.includes('--all') ? db.listings : db.listings.filter((l) => arg.includes(l.slug));
let created = 0;
for (const l of targets) {
  if (l.status === 'archived') continue;
  const file = join(ROOT, 'property', l.slug + '.html');
  if (existsSync(file)) { continue; } // 기존 수기 콘텐츠 보존
  writeFileSync(file, detailHtml(l));
  injectCard(join(ROOT, l.category + '.html'), l);
  injectCard(join(ROOT, 'index.html'), l);
  created++;
  console.log(`✔ 생성: property/${l.slug}.html (+ ${l.category}·home 카드)`);
}
console.log(created ? `${created}개 신규 상세 생성` : '신규 없음 — 전 현장 상세 존재(기존 보존).');
