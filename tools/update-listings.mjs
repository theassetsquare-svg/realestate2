#!/usr/bin/env node
/**
 * SSOT 갱신 오케스트레이터 — 청약홈 fetch → data/listings.json 병합.
 *  · 신규 현장 감지·추가(관리번호/slug 기준)
 *  · 만료 청약 자동 종료(청약접수 종료일 < 오늘 → status='closed', 이후 'archived')
 *  · 확정 분양가/청약일 들어오면 출처 '청약홈'·confirmed=true 자동표기
 *  · 데이터 없거나 키 없으면 변경 0 (창작 0)
 *
 * 사용: DATA_GO_KR_KEY=... node tools/update-listings.mjs
 *       node tools/update-listings.mjs --dry   # 변경만 출력, 파일 미기록
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchListings } from './cheonghome.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const SSOT = join(ROOT, 'data/listings.json');
const TODAY = new Date().toISOString().slice(0, 10);

const db = JSON.parse(readFileSync(SSOT, 'utf8'));
const byKey = new Map(db.listings.map((l) => [l.source.managementNo || l.slug, l]));
const changes = [];

// 1) 만료 자동 종료/아카이브 (실 청약접수 종료일 기준 — 예정/미확정은 종료 안 함)
for (const l of db.listings) {
  const end = l.schedule?.applyEnd;
  if (l.status !== 'closed' && l.status !== 'archived' && end && end < TODAY) {
    l.status = 'closed'; changes.push(`만료종료: ${l.name} (청약 ${end})`);
  }
  // 종료 후 30일 지나면 아카이브(sitemap 제외)
  if (l.status === 'closed' && end) {
    const days = (new Date(TODAY) - new Date(end)) / 86400000;
    if (days > 30) { l.status = 'archived'; changes.push(`아카이브: ${l.name}`); }
  }
}

// 2) 청약홈 신규/갱신 병합
const fetched = await fetchListings().catch((e) => { console.error('청약홈 오류:', e.message); return null; });
if (fetched) {
  for (const f of fetched) {
    const key = f.source.managementNo || f.slug;
    const cur = byKey.get(key);
    if (!cur) {
      db.listings.push(f); byKey.set(key, f);
      changes.push(`신규: ${f.name} (${f.category})`);
    } else {
      // 확정 분양가/청약일 출처 자동표기(있을 때만 덮어씀 — 없으면 기존 예상 유지)
      if (f.schedule?.applyConfirmed && f.schedule.apply) { cur.schedule.apply = f.schedule.apply; cur.schedule.applyConfirmed = true; cur.schedule.applyEnd = f.schedule.applyEnd || cur.schedule.applyEnd; }
      if (f.price?.confirmed && f.price.text) { cur.price = { ...cur.price, ...f.price }; }
      if (f.status === 'closed' && cur.status === 'upcoming') { cur.status = 'closed'; changes.push(`만료종료(청약홈): ${cur.name}`); }
    }
  }
} else {
  console.log('ℹ️  청약홈 데이터 없음 — 만료체크만 수행.');
}

db.updated = TODAY;
if (!changes.length) { console.log('변경 없음 (SSOT 안정).'); }
else { console.log('변경 ' + changes.length + '건:\n - ' + changes.join('\n - ')); }

if (!DRY && changes.length) { writeFileSync(SSOT, JSON.stringify(db, null, 2) + '\n'); console.log('✔ data/listings.json 기록'); }
else if (DRY) { console.log('(--dry: 미기록)'); }
