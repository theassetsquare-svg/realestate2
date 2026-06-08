#!/usr/bin/env node
/**
 * IndexNow 핑 — 변경 URL 을 즉시 색인 요청(Bing·Yandex·Seznam 공유 엔드포인트).
 *   네이버는 IndexNow 미참여 → sitemap + naver-site-verification(서치어드바이저)로 커버.
 * 키 파일: /<INDEXNOW_KEY>.txt (리포에 호스팅됨). 키 없으면 no-op.
 *
 * 사용: node tools/indexnow.mjs [url1 url2 ...]   # 미지정 시 SSOT 전 URL
 */
import https from 'node:https';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ssot = JSON.parse(readFileSync(join(ROOT, 'data/listings.json'), 'utf8'));
const BASE = ssot.site;
const host = BASE.replace(/^https?:\/\//, '');

// 키: 환경변수 우선, 없으면 루트의 <hex>.txt 키파일 탐지
function findKey() {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY;
  const f = readdirSync(ROOT).find((n) => /^[a-f0-9]{32}\.txt$/.test(n));
  return f ? f.replace('.txt', '') : null;
}

function allUrls() {
  const u = [BASE + '/'];
  for (const c of ssot.categories) u.push(`${BASE}/${c.slug}`);
  for (const l of ssot.listings) if (l.status !== 'archived') u.push(`${BASE}/property/${l.slug}`);
  return u;
}

async function submit(urlList, key) {
  const body = JSON.stringify({ host, key, keyLocation: `${BASE}/${key}.txt`, urlList });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.indexnow.org', path: '/indexnow', method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject); req.write(body); req.end();
  });
}

const key = findKey();
if (!key) { console.log('ℹ️  IndexNow 키 없음 — 핑 생략.'); process.exit(0); }
const urls = process.argv.slice(2).filter((a) => a.startsWith('http'));
const list = urls.length ? urls : allUrls();
submit(list, key).then((r) => {
  // IndexNow 정상: 200/202. 그 외는 경고만(배포 자체는 sitemap 으로 색인됨)
  console.log(`IndexNow → ${r.status} (${list.length} URL)`);
  if (r.status >= 400) console.warn('⚠ IndexNow 응답:', r.body.slice(0, 200));
}).catch((e) => { console.warn('⚠ IndexNow 네트워크 오류(무시):', e.message); });
