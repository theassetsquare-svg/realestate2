#!/usr/bin/env node
// GSC 자동 모니터 — 색인/사이트맵/순위/카니발리제이션 점검 후 문제 시 이메일 알림
//   node tools/gsc-monitor.mjs            # 점검 + (문제 있으면) 이메일
//   node tools/gsc-monitor.mjs --ci       # 문제 있으면 exit 1 (CI 게이트)
//
// 필요한 환경변수: GSC_SA_KEY 또는 tools/.gsc-key.json,  RESEND_API_KEY(이메일용, 없으면 출력만)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadKey, getAccessToken, listSitemaps, searchAnalytics, inspectUrl, submitSitemap,
} from './gsc.mjs';
import { sendEmail } from './notify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.GSC_SITE || 'https://m.nolcool.com/';
const CI = process.argv.includes('--ci');

function urlsFromSitemap() {
  const xml = fs.readFileSync(path.join(__dirname, '..', 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function main() {
  const token = await getAccessToken(loadKey());
  const urls = urlsFromSitemap();
  const problems = [];   // {sev:'red'|'yellow', msg}
  const info = [];

  // 1) 사이트맵 상태
  const sms = await listSitemaps(token, SITE);
  if (!sms.length) problems.push({ sev: 'red', msg: '사이트맵이 GSC에 제출돼 있지 않음' });
  for (const s of sms) {
    if (!s.lastDownloaded) problems.push({ sev: 'yellow', msg: `사이트맵 미수집(구글이 아직 안 읽음): ${s.path} — 재제출 시도함` });
    if (Number(s.errors) > 0) problems.push({ sev: 'red', msg: `사이트맵 오류 ${s.errors}건: ${s.path}` });
    info.push(`사이트맵 ${s.path}: 다운로드=${s.lastDownloaded || '안됨'} 오류=${s.errors || 0}`);
  }
  // 미수집이면 재제출 트리거
  if (sms.some((s) => !s.lastDownloaded) || !sms.length) {
    try { await submitSitemap(token, SITE, new URL('sitemap.xml', SITE).href); info.push('사이트맵 재제출 트리거함'); } catch {}
  }

  // 2) 색인 상태 (전 페이지)
  let indexed = 0, notIndexed = 0, unknown = 0;
  for (const u of urls) {
    try {
      const r = await inspectUrl(token, u, SITE);
      const idx = r.inspectionResult?.indexStatusResult || {};
      const cov = idx.coverageState || '';
      if (idx.verdict === 'PASS') indexed++;
      else if (/알려지지 않은|Unknown|not known/i.test(cov)) { unknown++; }
      else { notIndexed++; }
      if (idx.verdict !== 'PASS') problems.push({ sev: 'yellow', msg: `미색인: ${u} (${cov || idx.verdict})` });
    } catch (e) { problems.push({ sev: 'yellow', msg: `색인검사 실패: ${u}` }); }
  }
  info.push(`색인: 완료 ${indexed} / 미색인 ${notIndexed} / 구글모름 ${unknown} (총 ${urls.length})`);

  // 3) 검색 실적 + 카니발리제이션
  const qp = await searchAnalytics(token, SITE, ['query', 'page'], 28, 2000);
  const byQuery = {};
  for (const r of qp) { (byQuery[r.keys[0]] ||= []).push({ page: r.keys[1], impressions: r.impressions, position: r.position }); }
  const canni = Object.entries(byQuery).filter(([, a]) => a.length > 1);
  for (const [q, arr] of canni) {
    problems.push({ sev: 'yellow', msg: `카니발리제이션 "${q}" — ${arr.length}개 페이지 경쟁` });
  }
  const totalImpr = qp.reduce((s, r) => s + r.impressions, 0);
  const totalClicks = qp.reduce((s, r) => s + r.clicks, 0);
  info.push(`28일 노출 ${totalImpr} / 클릭 ${totalClicks} / 카니발 ${canni.length}건`);

  // 리포트
  const red = problems.filter((p) => p.sev === 'red');
  const yellow = problems.filter((p) => p.sev === 'yellow');
  const stamp = new Date().toISOString();
  const lines = [
    `[GSC 모니터] ${SITE}`,
    `측정: ${stamp}`,
    `🔴 긴급 ${red.length} · 🟡 주의 ${yellow.length}`,
    '',
    '■ 요약',
    ...info.map((i) => '  · ' + i),
    '',
    ...(red.length ? ['■ 🔴 긴급', ...red.map((p) => '  - ' + p.msg), ''] : []),
    ...(yellow.length ? ['■ 🟡 주의', ...yellow.slice(0, 30).map((p) => '  - ' + p.msg)] : []),
  ];
  const report = lines.join('\n');
  console.log(report);

  // 문제 있으면 이메일
  if (red.length || yellow.length) {
    const subject = `[부동산분양 서브] GSC 점검 🔴${red.length} 🟡${yellow.length}`;
    try { await sendEmail({ subject, text: report }); } catch (e) { console.error('이메일 실패:', e.message); }
  }

  if (CI && red.length) process.exit(1);
}

main().catch((e) => { console.error('❌ ' + e.message); process.exit(CI ? 1 : 0); });
