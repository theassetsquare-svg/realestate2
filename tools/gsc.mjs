#!/usr/bin/env node
// GSC 연동 — 서비스 계정(JSON 키)으로 Google Search Console API 직접 호출
// 의존성 0 (Node 내장 crypto/https만 사용)
//
// 키 제공 방법(우선순위):
//   1) 환경변수 GSC_SA_KEY        = 서비스계정 JSON "내용" 전체
//   2) 환경변수 GOOGLE_APPLICATION_CREDENTIALS = 키 파일 경로
//   3) tools/.gsc-key.json        = 키 파일을 이 경로에 저장 (gitignore 처리됨)
//
// 사용법:
//   node tools/gsc.mjs sites                 # 등록된 사이트 목록
//   node tools/gsc.mjs query [siteUrl] [일수] # 검색어/페이지 실적 + 카니발리제이션
//   node tools/gsc.mjs                       # 자동(사이트 탐색 후 query)
//
// 사이트 지정: 인자 또는 환경변수 GSC_SITE
//   예) https://m.nolcool.com/   또는   sc-domain:m.nolcool.com

import crypto from 'node:crypto';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SITE = process.env.GSC_SITE || 'https://m.nolcool.com/';
const SCOPE = 'https://www.googleapis.com/auth/webmasters';

function loadKey() {
  if (process.env.GSC_SA_KEY) {
    try { return JSON.parse(process.env.GSC_SA_KEY); }
    catch { throw new Error('GSC_SA_KEY 환경변수가 올바른 JSON이 아닙니다.'); }
  }
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(__dirname, '.gsc-key.json'),
    path.join(__dirname, '..', '.gsc-key.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  throw new Error(
    '서비스 계정 키를 찾을 수 없습니다.\n' +
    '  → tools/.gsc-key.json 에 키 JSON을 저장하거나, GSC_SA_KEY 환경변수에 JSON 내용을 넣으세요.\n' +
    '  찾아본 위치: ' + candidates.join(', ')
  );
}

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// 서비스 계정 → OAuth2 access token (JWT bearer 방식, 외부 라이브러리 불필요)
async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(key.private_key)
    .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${header}.${claim}.${signature}`;

  const body = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`;
  const res = await httpsRequest('https://oauth2.googleapis.com/token', 'POST', body, {
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  const json = JSON.parse(res);
  if (!json.access_token) throw new Error('토큰 발급 실패: ' + res);
  return json.access_token;
}

function httpsRequest(url, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body || null;
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: { ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let chunks = '';
      res.on('data', (d) => (chunks += d));
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${chunks}`));
        else resolve(chunks);
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function api(token, urlPath, method = 'GET', payload) {
  const res = await httpsRequest(
    'https://www.googleapis.com/webmasters/v3/' + urlPath,
    method,
    payload ? JSON.stringify(payload) : null,
    { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  );
  return JSON.parse(res);
}

// URL 검사 API (색인 상태) — 엔드포인트가 다름
async function inspectUrl(token, inspectionUrl, siteUrl) {
  const res = await httpsRequest(
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    'POST',
    JSON.stringify({ inspectionUrl, siteUrl, languageCode: 'ko' }),
    { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  );
  return JSON.parse(res);
}

async function listSitemaps(token, site) {
  const r = await api(token, `sites/${encodeURIComponent(site)}/sitemaps`);
  return r.sitemap || [];
}

// 사이트맵 (재)제출 — 구글이 다시 읽어가도록 트리거
async function submitSitemap(token, site, sitemapUrl) {
  await httpsRequest(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
    'PUT', null,
    { Authorization: `Bearer ${token}` }
  );
}

function fmtDate(d) { return d.toISOString().slice(0, 10); }

async function listSites(token) {
  const r = await api(token, 'sites');
  return (r.siteEntry || []).map((s) => `${s.siteUrl}  [${s.permissionLevel}]`);
}

async function searchAnalytics(token, site, dimensions, days = 28, rowLimit = 25) {
  const end = new Date(); end.setDate(end.getDate() - 1);   // GSC는 보통 2~3일 지연
  const start = new Date(); start.setDate(start.getDate() - days);
  const r = await api(token, `sites/${encodeURIComponent(site)}/searchAnalytics/query`, 'POST', {
    startDate: fmtDate(start),
    endDate: fmtDate(end),
    dimensions,
    rowLimit,
  });
  return r.rows || [];
}

function pct(x) { return (x * 100).toFixed(2) + '%'; }

async function main() {
  const cmd = process.argv[2] || 'auto';
  const key = loadKey();
  const token = await getAccessToken(key);
  console.log(`✅ 인증 성공: ${key.client_email}\n`);

  if (cmd === 'sites') {
    const sites = await listSites(token);
    console.log('등록된 사이트:\n' + (sites.length ? sites.map((s) => '  ' + s).join('\n') : '  (없음)'));
    return;
  }

  // 사이트맵 재제출
  if (cmd === 'submit-sitemap') {
    const site = process.argv[3] || DEFAULT_SITE;
    const sm = process.argv[4] || new URL('sitemap.xml', site).href;
    await submitSitemap(token, site, sm);
    console.log(`✅ 사이트맵 제출 완료: ${sm}`);
    return;
  }

  // 색인 진단: 사이트맵 + 전 페이지 색인 상태
  if (cmd === 'diag') {
    const site = process.argv[3] || DEFAULT_SITE;
    console.log(`🔍 [${site}] 색인 진단\n${'─'.repeat(60)}`);
    const sms = await listSitemaps(token, site);
    console.log('\n🗺️  제출된 사이트맵:');
    if (!sms.length) console.log('  ❌ 없음 — 사이트맵 미제출! (반드시 제출 필요)');
    sms.forEach((s) => console.log(`  ${s.path} — 등록URL ${s.contents?.[0]?.submitted || '?'}개 / 색인오류 ${s.errors || 0} / 경고 ${s.warnings || 0} / 마지막다운로드 ${s.lastDownloaded || '안됨'}`));

    const urls = (process.env.GSC_URLS || '').split(',').filter(Boolean);
    if (urls.length) {
      console.log('\n📑 페이지별 색인 상태:');
      for (const u of urls) {
        try {
          const r = await inspectUrl(token, u, site);
          const idx = r.inspectionResult?.indexStatusResult || {};
          console.log(`  ${idx.verdict || '?'} | 커버리지: ${idx.coverageState || '?'} | ${u}`);
        } catch (e) { console.log(`  ⚠️ 검사실패 ${u}: ${e.message.slice(0, 80)}`); }
      }
    }
    return;
  }

  // query / auto
  let site = process.argv[3] || DEFAULT_SITE;
  const days = parseInt(process.argv[4], 10) || 28;
  const sites = await listSites(token);
  console.log('등록된 사이트:\n' + sites.map((s) => '  ' + s).join('\n') + '\n');
  // 지정 사이트가 목록에 없으면 첫 사이트로 대체
  if (!sites.some((s) => s.startsWith(site))) {
    const first = (sites[0] || '').split('  ')[0];
    if (first) { console.log(`⚠️  지정 사이트(${site})가 목록에 없어 ${first} 사용\n`); site = first; }
  }

  console.log(`📊 [${site}] 최근 ${days}일 실적\n${'─'.repeat(60)}`);

  const queries = await searchAnalytics(token, site, ['query'], days, 25);
  console.log('\n🔑 상위 검색어 (클릭/노출/CTR/평균순위):');
  queries.forEach((r, i) =>
    console.log(`  ${String(i + 1).padStart(2)}. ${r.keys[0]}  —  클릭 ${r.clicks} / 노출 ${r.impressions} / ${pct(r.ctr)} / ${r.position.toFixed(1)}위`));

  const pages = await searchAnalytics(token, site, ['page'], days, 25);
  console.log('\n📄 상위 페이지:');
  pages.forEach((r, i) =>
    console.log(`  ${String(i + 1).padStart(2)}. ${r.keys[0]}  —  클릭 ${r.clicks} / 노출 ${r.impressions} / ${r.position.toFixed(1)}위`));

  // 카니발리제이션: 같은 검색어를 여러 페이지가 동시에 노출 → 순위 분산
  const qp = await searchAnalytics(token, site, ['query', 'page'], days, 1000);
  const byQuery = {};
  for (const r of qp) {
    const [q, p] = r.keys;
    (byQuery[q] ||= []).push({ page: p, impressions: r.impressions, clicks: r.clicks, position: r.position });
  }
  const canni = Object.entries(byQuery)
    .filter(([, arr]) => arr.length > 1)
    .sort((a, b) => b[1].reduce((s, x) => s + x.impressions, 0) - a[1].reduce((s, x) => s + x.impressions, 0))
    .slice(0, 15);
  console.log(`\n⚠️  카니발리제이션 의심 (한 검색어 → 여러 페이지 경쟁): ${canni.length}건`);
  for (const [q, arr] of canni) {
    console.log(`  "${q}" — ${arr.length}개 페이지`);
    arr.sort((a, b) => b.impressions - a.impressions)
      .forEach((x) => console.log(`      ${x.position.toFixed(1)}위  노출${x.impressions}  ${x.page}`));
  }
  if (!canni.length) console.log('  (없음 — 양호)');
}

export { loadKey, getAccessToken, listSites, listSitemaps, searchAnalytics, inspectUrl, submitSitemap, DEFAULT_SITE };

// CLI로 직접 실행할 때만 main() 수행 (다른 스크립트가 import할 때는 실행 안 함)
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
}
