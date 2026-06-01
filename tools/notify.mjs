#!/usr/bin/env node
// 이메일 알림 — Resend API (사장님이 다른 사이트에서 쓰는 방식과 동일)
// 환경변수: RESEND_API_KEY (필수), ALERT_TO(기본 theassetsquare@gmail.com), ALERT_FROM(기본 onboarding@resend.dev)
import https from 'node:https';

const TO = (process.env.ALERT_TO || 'theassetsquare@gmail.com').split(',');
const FROM = process.env.ALERT_FROM || '놀쿨 모니터 <onboarding@resend.dev>';

export async function sendEmail({ subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log('ℹ️  RESEND_API_KEY 없음 — 이메일 생략(로컬 모드).'); return false; }
  const body = JSON.stringify({ from: FROM, to: TO, subject, html: html || `<pre>${text || ''}</pre>` });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com', path: '/emails', method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { res.statusCode < 300 ? (console.log('📧 알림 발송 완료'), resolve(true)) : reject(new Error(`Resend ${res.statusCode}: ${d}`)); });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  sendEmail({ subject: process.argv[2] || '테스트 알림', text: process.argv[3] || '테스트 본문' })
    .then((ok) => console.log(ok ? 'OK' : 'SKIP')).catch((e) => { console.error(e.message); process.exit(1); });
}
