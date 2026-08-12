import proj4 from 'proj4';

// 행정구역 GeoJSON 캐시 유틸
// 출처: statgarten/maps (통계청 SGIS API 기반, 고정밀 좌표)
// 원본 좌표계: EPSG:5179 (한국 TM, 미터 단위) → proj4로 WGS84 변환 후 사용
const SEOUL_URL =
  'https://raw.githubusercontent.com/statgarten/maps/main/json/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C_%EC%8B%9C%EA%B5%B0%EA%B5%AC_%EA%B2%BD%EA%B3%84.json';
const GYEONGGI_URL =
  'https://raw.githubusercontent.com/statgarten/maps/main/json/%EA%B2%BD%EA%B8%B0%EB%8F%84_%EC%8B%9C%EA%B5%B0%EA%B5%AC_%EA%B2%BD%EA%B3%84.json';
const INCHEON_URL =
  'https://raw.githubusercontent.com/statgarten/maps/main/json/%EC%9D%B8%EC%B2%9C%EA%B4%91%EC%97%AD%EC%8B%9C_%EC%8B%9C%EA%B5%B0%EA%B5%AC_%EA%B2%BD%EA%B3%84.json';

// EPSG:5179 — 한국 TM 좌표계 (통계청 SGIS 기본 출력 좌표계)
const EPSG5179 =
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs';
const WGS84 = 'EPSG:4326';

/** EPSG:5179 좌표 [x, y] → WGS84 [lng, lat] 변환 */
const toWgs84 = (coord: number[]): number[] => proj4(EPSG5179, WGS84, coord);

/** GeoJSON geometry의 모든 좌표를 WGS84로 변환 (Polygon / MultiPolygon 대응) */
const reprojectGeometry = (geometry: any): any => {
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring: number[][]) => ring.map(toWgs84)),
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((poly: number[][][]) =>
        poly.map((ring: number[][]) => ring.map(toWgs84))
      ),
    };
  }
  return geometry;
};

// 모듈 레벨 캐시 — 동일 데이터를 중복 fetch하지 않도록 첫 로드 결과를 유지
let cached: any = null;
// 진행 중인 Promise — 동시 다발 호출 시 동일 Promise를 공유 (중복 fetch 방지)
let pending: Promise<any> | null = null;

// 인천 GeoJSON feature 이름 충돌 처리 — 서울/경기의 동명 구와 구분
// GeoJSON에서 그냥 "중구"/"동구"로 오는 것을 "인천 중구"/"인천 동구"로 변경
const disambiguateIncheon = (f: any): any => {
  const title: string = f.properties?.title ?? '';
  const renamed = title === '중구' ? '인천 중구' : title === '동구' ? '인천 동구' : title;
  return renamed !== title
    ? { ...f, properties: { ...f.properties, title: renamed } }
    : f;
};

/** 서울+경기도+인천 GeoJSON 로드 — 병렬 fetch, EPSG:5179→WGS84 변환 후 합쳐서 캐시 */
export const loadDistrictGeoJson = (): Promise<any> => {
  // 이미 로드된 데이터가 있으면 즉시 반환
  if (cached) return Promise.resolve(cached);
  // 첫 번째 호출자만 fetch를 시작하고, 이후 호출자는 같은 Promise를 기다림
  if (!pending) {
    pending = Promise.all([
      fetch(SEOUL_URL).then(r => { if (!r.ok) throw new Error('Seoul GeoJSON 로드 실패'); return r.json(); }),
      fetch(GYEONGGI_URL).then(r => { if (!r.ok) throw new Error('Gyeonggi GeoJSON 로드 실패'); return r.json(); }),
      fetch(INCHEON_URL).then(r => { if (!r.ok) throw new Error('Incheon GeoJSON 로드 실패'); return r.json(); }),
    ])
      .then(([seoulData, gyeonggiData, incheonData]) => {
        const incheonFeatures = (incheonData.features ?? []).map(disambiguateIncheon);
        const allFeatures = [
          ...(seoulData.features ?? []),
          ...(gyeonggiData.features ?? []),
          ...incheonFeatures,
        ];
        // 좌표계 변환 — 원본 EPSG:5179 미터 좌표 → WGS84 경위도 (Naver Maps 입력 형식)
        const converted = allFeatures.map((f: any) => ({
          ...f,
          geometry: reprojectGeometry(f.geometry),
        }));
        cached = { type: 'FeatureCollection', features: converted };
        return cached;
      })
      // 실패 시 pending 초기화 — 다음 호출에서 재시도 가능하게 함
      .catch(err => { pending = null; throw err; });
  }
  return pending;
};

/** feature에서 한국어 행정구역명 반환 (properties.title) */
export const getFeatureName = (f: any): string => f.properties?.title ?? '';

/** 서울(id 11xxx) 소속 feature 여부 */
export const isSeoul = (f: any): boolean =>
  String(f.properties?.id ?? '').startsWith('11');

/** 경기도(id 31xxx) 소속 feature 여부 */
export const isGyeonggi = (f: any): boolean =>
  String(f.properties?.id ?? '').startsWith('31');

/** 인천(id 23xxx) 소속 feature 여부 */
export const isIncheon = (f: any): boolean =>
  String(f.properties?.id ?? '').startsWith('23');
