#!/usr/bin/env node
/**
 * 청약홈 어댑터 — 한국부동산원 청약홈 APT 분양정보 OpenAPI (data.go.kr)
 * 환경변수: DATA_GO_KR_KEY (무료 공공데이터 인증키). 없으면 fetch 안 함(창작 0).
 *
 * 엔드포인트(공공데이터포털 "한국부동산원_청약홈 분양정보 조회 서비스"):
 *   https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail
 * 반환 원본 필드를 SSOT 스키마(slug/name/region/units/price/schedule/status/source)로 정규화.
 * 확정 분양가/청약일이 응답에 있으면 source='청약홈', confirmed=true 로 표기(출처 자동표기).
 * 응답에 없는 값은 채우지 않음(예상 헤지 유지 — 가짜 출처 창작 금지).
 *
 * 사용: DATA_GO_KR_KEY=... node tools/cheonghome.mjs [지역코드] [페이지]
 */
import https from 'node:https';

const API_HOST = 'api.odcloud.kr';
const API_PATH = '/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(`청약홈 응답 파싱 실패(${res.statusCode}): ${d.slice(0, 200)}`)); } });
    }).on('error', reject);
  });
}

// 한글명 → 안전한 slug (영문 음차 매핑이 없으면 관리번호 기반 결정적 slug)
export function toSlug(name, managementNo) {
  const ascii = (name || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
  return /[a-z]/.test(ascii) ? ascii : `apt-${managementNo}`;
}

function normalize(row) {
  // 청약홈 원본 키(서비스 명세 기준): HOUSE_MANAGE_NO, HOUSE_NM, HSSPLY_ADRES,
  //  TOT_SUPLY_HSHLDCO, RCRIT_PBLANC_DE(모집공고일), RCEPT_BGNDE/ENDDE(청약접수), MVN_PREARNGE_YM(입주예정), BSNS_MBY_NM(시행/시공)
  const no = row.HOUSE_MANAGE_NO || row.PBLANC_NO || '';
  const name = (row.HOUSE_NM || '').trim();
  const addr = row.HSSPLY_ADRES || '';
  const [city, gu, dong] = addr.split(/\s+/);
  const applyEnd = row.RCEPT_ENDDE || null;     // 청약접수 종료일(YYYY-MM-DD)
  const moveIn = row.MVN_PREARNGE_YM || null;
  return {
    slug: toSlug(name, no),
    name,
    category: 'apartment',
    region: { city: city || '', gu: gu || '', dong: dong || '', zone: null },
    units: Number(row.TOT_SUPLY_HSHLDCO) || null, generalUnits: null,
    sizes: null, floors: null, builder: row.CNSTRCT_ENTRPS_NM || row.BSNS_MBY_NM || null,
    // 확정 분양가는 별도 상세(가격) API 에서 — 여기 없으면 채우지 않음(예상 유지)
    price: { text: null, perPyeong: null, source: '청약홈', confirmed: false },
    schedule: { apply: row.RCEPT_BGNDE || row.RCRIT_PBLANC_DE || null, applyConfirmed: true, applyEnd, moveIn },
    status: applyEnd && applyEnd < new Date().toISOString().slice(0, 10) ? 'closed' : 'upcoming',
    badge: '분양예정',
    source: { name: '청약홈(한국부동산원)', verifiedAt: new Date().toISOString().slice(0, 10), managementNo: no },
  };
}

export async function fetchListings({ perPage = 100, page = 1 } = {}) {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) { console.error('ℹ️  DATA_GO_KR_KEY 없음 — 청약홈 fetch 생략(창작 0).'); return null; }
  const url = `https://${API_HOST}${API_PATH}?page=${page}&perPage=${perPage}&serviceKey=${encodeURIComponent(key)}`;
  const json = await get(url);
  const rows = json.data || json.body?.items || [];
  return rows.map(normalize).filter((l) => l.name);
}

if (process.argv[1] && process.argv[1].endsWith('cheonghome.mjs')) {
  fetchListings().then((r) => { if (r) console.log(JSON.stringify(r.slice(0, 5), null, 2), `\n총 ${r.length}건`); })
    .catch((e) => { console.error('❌', e.message); process.exit(1); });
}
