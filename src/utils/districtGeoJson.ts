import proj4 from 'proj4';

// 행정구역 GeoJSON 캐시 유틸
// 출처: statgarten/maps (통계청 SGIS API 기반, 고정밀 좌표)
// 원본 좌표계: EPSG:5179 (한국 TM, 미터 단위) → proj4로 WGS84 변환 후 사용
const SEOUL_URL =
  'https://raw.githubusercontent.com/statgarten/maps/main/json/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C_%EC%8B%9C%EA%B5%B0%EA%B5%AC_%EA%B2%BD%EA%B3%84.json';
const GYEONGGI_URL =
  'https://raw.githubusercontent.com/statgarten/maps/main/json/%EA%B2%BD%EA%B8%B0%EB%8F%84_%EC%8B%9C%EA%B5%B0%EA%B5%AC_%EA%B2%BD%EA%B3%84.json';

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

let cached: any = null;
let pending: Promise<any> | null = null;

/** 서울+경기도 GeoJSON 로드 — 병렬 fetch, EPSG:5179→WGS84 변환 후 합쳐서 캐시 */
export const loadDistrictGeoJson = (): Promise<any> => {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = Promise.all([
      fetch(SEOUL_URL).then(r => { if (!r.ok) throw new Error('Seoul GeoJSON 로드 실패'); return r.json(); }),
      fetch(GYEONGGI_URL).then(r => { if (!r.ok) throw new Error('Gyeonggi GeoJSON 로드 실패'); return r.json(); }),
    ])
      .then(([seoulData, gyeonggiData]) => {
        const allFeatures = [
          ...(seoulData.features ?? []),
          ...(gyeonggiData.features ?? []),
        ];
        // 좌표계 변환 — 원본 EPSG:5179 미터 좌표 → WGS84 경위도
        const converted = allFeatures.map((f: any) => ({
          ...f,
          geometry: reprojectGeometry(f.geometry),
        }));
        cached = { type: 'FeatureCollection', features: converted };
        return cached;
      })
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
