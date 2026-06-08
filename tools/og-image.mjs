#!/usr/bin/env node
/**
 * og:image 생성기 — 1200×1200 실 PNG (한글 폰트 임베드, 두부(□) 방지)
 *
 * 의존성(빌드 전용, CI 게이트와 분리):
 *   npm install --no-save @resvg/resvg-js
 *   폰트: tools/.fonts/NanumGothic-Regular.ttf, NanumGothicBold.ttf
 *     (없으면 아래 URL에서 받아 tools/.fonts/ 에 두세요 — gitignore 대상)
 *     https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf
 *     https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Bold.ttf
 *
 * 사용: node tools/og-image.mjs   → /og-image.png 생성
 *
 * og:image PNG 는 리포에 커밋되는 정적 자산입니다.
 * 이 스크립트는 CI 게이트(seo-audit.mjs)에서 import 되지 않습니다(무의존 유지).
 */
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_REG = join(ROOT, 'tools/.fonts/NanumGothic-Regular.ttf');
const FONT_BOLD = join(ROOT, 'tools/.fonts/NanumGothicBold.ttf');

for (const f of [FONT_REG, FONT_BOLD]) {
  if (!existsSync(f)) { console.error(`❌ 폰트 없음: ${f}\n   tools/.fonts/ 에 NanumGothic ttf 2종을 받아두세요(주석 참고).`); process.exit(1); }
}

const W = 1200, H = 1200;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#1e3a5f"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="80" y="80" width="${W-160}" height="${H-160}" rx="40" fill="none" stroke="#3b5a82" stroke-width="3"/>
  <text x="600" y="300" text-anchor="middle" font-family="NanumGothic" font-weight="bold" font-size="64" fill="#60a5fa">부동산분양 전문 플랫폼</text>
  <text x="600" y="540" text-anchor="middle" font-family="NanumGothic" font-weight="bold" font-size="150" fill="#ffffff">더에셋스퀘어</text>
  <text x="600" y="700" text-anchor="middle" font-family="NanumGothic" font-weight="bold" font-size="64" fill="#e2e8f0">2026년 실제 분양 현장만</text>
  <text x="600" y="900" text-anchor="middle" font-family="NanumGothic" font-size="46" fill="#94a3b8">아파트 · 오피스텔 · 상가 · 지식산업센터 · 토지 · 산업단지</text>
  <text x="600" y="1010" text-anchor="middle" font-family="NanumGothic" font-size="42" fill="#f59e0b">청약홈·언론보도 교차검증 · 분양예정 현장</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { fontFiles: [FONT_REG, FONT_BOLD], loadSystemFonts: false, defaultFontFamily: 'NanumGothic' },
});
const png = resvg.render().asPng();
const out = join(ROOT, 'og-image.png');
writeFileSync(out, png);
console.log(`✔ og-image.png 생성 (${png.length} bytes, ${W}×${H})`);
