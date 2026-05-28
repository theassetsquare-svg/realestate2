#!/usr/bin/env node
/**
 * 구조 정규화 코드모드 (idempotent · 의존성 0)
 *  1) 금지 전화번호 하단 고정 바 제거
 *  2) 내부 링크의 target="_blank"/rel 제거 (외부 메인사이트 링크는 _blank 유지)
 *  3) 잉여 하단 spacer 제거 (CSS padding-bottom 으로 대체)
 *
 * 여러 번 실행해도 결과 동일. CI 안전망으로도 사용 가능.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'tools') continue;
    const full = join(dir, name);
    statSync(full).isDirectory() ? walk(full, acc) : (name.endsWith('.html') && acc.push(full));
  }
  return acc;
}

const isExternal = (href) => /^https?:\/\//i.test(href);

function normalize(html) {
  let out = html;

  // 1) 금지 전화번호 고정 바 div 제거 (tel:1666-6838 포함하는 div 한 개)
  out = out.replace(/[ \t]*<div[^>]*>(?:(?!<\/div>)[\s\S])*?1666-6838[\s\S]*?<\/div>\s*\n?/gi, '');

  // 2) 잉여 spacer 제거
  out = out.replace(/[ \t]*<div style="height:96px"><\/div>\s*\n?/gi, '');

  // 2-1) 하단 고정 메인사이트 바 → 클래스 기반으로 정규화 (스타일 일관성)
  out = out.replace(
    /<div style="position:fixed;bottom:0;[^"]*z-index:9999"><a href="https:\/\/theassetsquare\.com\/"[^>]*style="[^"]*">([\s\S]*?)<\/a><\/div>/gi,
    '<div class="site-bottombar"><a href="https://theassetsquare.com/" target="_blank" rel="noopener noreferrer">$1</a></div>'
  );
  // 2-2) 이미 클래스 적용된 하단바의 앵커 속성 깔끔하게 정규화 (멱등)
  out = out.replace(
    /<div class="site-bottombar"><a href="https:\/\/theassetsquare\.com\/"[^>]*>([\s\S]*?)<\/a><\/div>/gi,
    '<div class="site-bottombar"><a href="https://theassetsquare.com/" target="_blank" rel="noopener noreferrer">$1</a></div>'
  );

  // 2-3) 사진 플레이스홀더에서 현장명 반복 제거 (스터핑 방지)
  const h1 = (out.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
  if (h1) {
    const name = h1.replace(/<[^>]+>/g, '').trim();
    if (name) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(<div class="photo-placeholder">)${esc}\\s+`, 'g'), '$1');
      out = out.replace(new RegExp(`(<div class="photo-placeholder">)${esc}(<\\/div>)`, 'g'), '$1단지 이미지$2');
    }
  }

  // 3) 내부 링크 target/rel 제거
  out = out.replace(/<a\s+[^>]*>/gi, (tag) => {
    const m = tag.match(/href=["']([^"']*)["']/i);
    if (!m || isExternal(m[1])) return tag; // 외부 링크는 그대로
    return tag
      .replace(/\s+target=["']_blank["']/gi, '')
      .replace(/\s+rel=["']noopener noreferrer["']/gi, '');
  });

  return out;
}

const files = walk(ROOT).sort();
let changed = 0;
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const after = normalize(before);
  if (before !== after) {
    changed++;
    if (CHECK) {
      console.log(`✗ ${relative(ROOT, file)} 정규화 필요`);
    } else {
      writeFileSync(file, after);
      console.log(`✔ ${relative(ROOT, file)} 정규화 완료`);
    }
  }
}
console.log(changed === 0 ? '모든 파일 정규화 상태 OK' : `${changed}개 파일 ${CHECK ? '수정 필요' : '수정됨'}`);
if (CHECK && changed > 0) process.exit(1);
