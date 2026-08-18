// 행정구역 GeoJSON 캐시 유틸
// 출처: southkorea/southkorea-maps (KOSTAT 2018, WGS84)
// 서울(11)+인천(23)+경기(31) 77개 시군구 추출 후 public/data/geojson/korea-districts.json 로컬 저장
// 인천 중구/동구 → '인천 중구'/'인천 동구'로 이름 충돌 처리 완료 (저장 시 전처리)

// 로컬 파일 경로 — GitHub raw 대신 동일 오리진으로 서빙 (rate limit 문제 없음)
const DISTRICTS_URL = '/data/geojson/korea-districts.json';

// 모듈 레벨 캐시
let cached: any = null;
let pending: Promise<any> | null = null;
// localStorage 캐시 키 (버전 변경 시 구 캐시 자동 무효화)
const LS_CACHE_KEY = 'district_geojson_v4';

/** 서울+경기+인천 GeoJSON 로드 — 로컬 파일 fetch, 캐시 우선 반환 */
export const loadDistrictGeoJson = (): Promise<any> => {
  // 1. 메모리 캐시
  if (cached) return Promise.resolve(cached);

  // 2. localStorage 캐시
  try {
    const stored = localStorage.getItem(LS_CACHE_KEY);
    if (stored) {
      cached = JSON.parse(stored);
      return Promise.resolve(cached);
    }
  } catch { /* ignore */ }

  // 3. 로컬 파일 fetch
  if (!pending) {
    pending = fetch(DISTRICTS_URL)
      .then(r => { if (!r.ok) throw new Error('GeoJSON 로드 실패'); return r.json(); })
      .then(data => {
        cached = data;
        try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cached)); } catch { /* ignore */ }
        return cached;
      })
      .catch(err => { pending = null; throw err; });
  }
  return pending;
};

/** feature에서 한국어 행정구역명 반환 — southkorea-maps는 'name' 프로퍼티 사용 */
export const getFeatureName = (f: any): string => f.properties?.name ?? '';

/** 서울(code 11xxx) 소속 feature 여부 */
export const isSeoul = (f: any): boolean =>
  String(f.properties?.code ?? '').startsWith('11');

/** 경기도(code 31xxx) 소속 feature 여부 */
export const isGyeonggi = (f: any): boolean =>
  String(f.properties?.code ?? '').startsWith('31');

/** 인천(code 23xxx) 소속 feature 여부 */
export const isIncheon = (f: any): boolean =>
  String(f.properties?.code ?? '').startsWith('23');
