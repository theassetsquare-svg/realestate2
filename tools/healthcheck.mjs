#!/usr/bin/env node
/**
 * 라이브사이트 헬스체크 (의존성 0 · Node 18+ fetch)
 *  - 배포된 전 페이지를 실제로 가져와 HTTP 상태, 금지 전화번호, title 유무를 검증
 *  - 24시간 자동화(GitHub Actions cron)에서 호출되어 배포본 회귀를 감시
 *
 * 사용: node tools/healthcheck.mjs [https://base-domain]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = ['1666-6838', '1660-4050'];

// canonical 도메인 자동 감지 (index.html 의 canonical)
function detectBase() {
  try {
    const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const m = idx.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    if (m) return m[1].replace(/\/$/, '');
  } catch {}
  return 'https://m.nolcool.com';
}
const BASE = (process.argv[2] || detectBase()).replace(/\/$/, '');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'tools') continue;
    const full = join(dir, name);
    statSync(full).isDirectory() ? walk(full, acc) : (name.endsWith('.html') && acc.push(full));
  }
  return acc;
}

const paths = walk(ROOT).map(f => '/' + relative(ROOT, f).split('\\').join('/'))
  .map(p => p === '/index.html' ? '/' : p).sort();

console.log(`🌐 라이브 헬스체크 — ${BASE}  (${paths.length}개 경로)\n`);
let fail = 0;
for (const p of paths) {
  const url = BASE + p;
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'TheAssetSquare-Healthcheck' } });
    const body = await res.text();
    const phone = BANNED.filter(b => body.includes(b));
    const hasTitle = /<title>[^<]+<\/title>/i.test(body);
    const ok = res.ok && phone.length === 0 && hasTitle;
    if (!ok) fail++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${res.status} ${p}${phone.length ? '  ⚠ 전화번호:' + phone.join(',') : ''}${!hasTitle ? '  ⚠ title없음' : ''}`);
  } catch (e) {
    fail++;
    console.log(`FAIL --- ${p}  (${e.message})`);
  }
}
console.log(fail === 0 ? '\n✅ 라이브 전 페이지 정상 (금지번호 0건)\n' : `\n❌ ${fail}개 경로 이상\n`);
process.exit(fail === 0 ? 0 : 1);
