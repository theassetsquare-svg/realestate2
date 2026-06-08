#!/usr/bin/env node
/**
 * sitemap.xml 생성기 — SSOT(data/listings.json) 단일 진실원천에서 재생성. 의존성 0.
 *   node tools/sitemap.mjs          # sitemap.xml 갱신
 *   node tools/sitemap.mjs --check  # 현재 파일과 다르면 exit 1 (CI 드리프트 게이트)
 *
 * lastmod: 홈/카테고리 = site.updated, 상세 = listing.source.verifiedAt.
 * 청약홈 갱신(update-listings.mjs) 으로 SSOT 가 바뀌면 이 스크립트가 sitemap·lastmod 를 따라갑니다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const ssot = JSON.parse(readFileSync(join(ROOT, 'data/listings.json'), 'utf8'));
const BASE = ssot.site;

const url = (loc, lastmod, freq, pri) =>
  `  <url><loc>${BASE}${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;

const rows = [];
rows.push(url('/', ssot.updated, 'daily', '1.0'));
for (const c of ssot.categories) rows.push(url('/' + c.slug, ssot.updated, 'weekly', c.priority));
for (const l of ssot.listings) {
  if (l.status === 'archived') continue; // 만료·아카이브는 sitemap 제외
  rows.push(url('/property/' + l.slug, l.source.verifiedAt, 'weekly', '0.8'));
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;

const out = join(ROOT, 'sitemap.xml');
const cur = (() => { try { return readFileSync(out, 'utf8'); } catch { return ''; } })();
if (CHECK) {
  if (cur !== xml) { console.error('✗ sitemap.xml 가 SSOT 와 불일치 (node tools/sitemap.mjs 로 재생성 필요)'); process.exit(1); }
  console.log('✔ sitemap.xml SSOT 일치'); process.exit(0);
}
if (cur === xml) { console.log('sitemap.xml 변경 없음(SSOT 일치)'); }
else { writeFileSync(out, xml); console.log(`✔ sitemap.xml 재생성 (${rows.length} URL)`); }
