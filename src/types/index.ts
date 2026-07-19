// 네이버 지도 전역 타입 선언
declare global {
  interface Window {
    naver: any; // CDN 로드된 네이버 지도 SDK를 any로 허용
  }
}

/** 주요 상업지구 소요시간 */
export interface CommuteTime {
  id: number;
  destination: string;   // "강남", "시청", "여의도", "발산", "마곡나루"
  minutes: number;
  transportType: string;
  transferCount?: number; // 환승 횟수 (0 = 환승 없음, undefined = 미입력)
}

/** 지하철 정보 (역명 + 호선 + 도보 시간) */
export interface SubwayInfo {
  id: number;
  stationName: string;   // "구일역"
  subwayLines: string;   // "1호선"
  walkingMinutes: number;
}

/** 단지 등록 시 입력한 평형별 가격 항목 (백엔드가 반환하면 필터에서 평형 표시에 사용) */
export interface PriceItem {
  id?: number;
  areaType?: string;   // "전용 59.9"
  floor?: string;
  price?: number;
  jeonsePrice?: number;
  jeonseRate?: number;
  priceRange?: string; // "7억대"
}

/** 아파트 단지 정보 — 백엔드 ApartmentComplexDto와 1:1 매핑 */
export interface ApartmentComplex {
  id: number;
  priceRange: string;      // "7억대", "9억대"
  complexName: string;
  checkDate: string;
  builtYear: string;       // "95년"
  price: number;           // 원 단위 (첫 번째 priceItem 대표값)
  jeonsePrice?: number;    // 원 단위
  jeonseRate?: number;     // % (전세가 / 매매가 × 100)
  unitCount: number;
  region: string;          // "서울 구로구"
  address: string;
  memo?: string;
  latitude: number;
  longitude: number;
  commuteTimes: CommuteTime[];
  subwayInfos: SubwayInfo[];
  areaTypes?: string[];                        // 최신 시세 기록 기준 평형 목록
  areaTypePriceRanges?: Record<string, string>; // 평형 → 금액대 매핑 (예: {"전용 59": "11억대", "전용 84": "14억대"})
  priceItems?: PriceItem[]; // 백엔드가 포함 시 금액대 필터에서 평형 정보 표시 가능
}

/** 평형별 시세 항목 — 백엔드 PriceHistoryItemDto와 1:1 매핑 */
export interface PriceHistoryItem {
  id: number;
  areaType: string;      // "전용 59.9"
  floor: string;         // "3/15"
  price: number;         // 원 단위
  jeonsePrice?: number;  // 원 단위
  jeonseRate?: number;   // %
  askingPrice?: number;         // 호가 (원 단위)
  highestPrice?: number;        // 전고점 (원 단위)
  lowestPrice?: number;         // 전저점 (원 단위)
  tenYearChangeRate?: number;   // 10년 등락률 (%)
  tenYearChangeAmount?: number; // 10년 등락 금액 (원 단위)
}

/** 시세 기록 — 날짜 단위 헤더 + 평형별 items 배열 */
export interface PriceHistory {
  id: number;
  complexId: number;
  complexName: string;
  recordDate: string;    // "yyyy-MM-dd"
  memo?: string;
  items: PriceHistoryItem[];
}

/** 시세 기록 등록 요청 — 백엔드 PriceHistoryRequest와 1:1 매핑 */
export interface PriceHistoryRequest {
  recordDate: string;    // "yyyy-MM-dd"
  memo?: string;
  updateGoogleSheet?: boolean;
  items: {
    areaType?: string;
    floor?: string;
    price?: number;
    jeonsePrice?: number;
    askingPrice?: number;
    highestPrice?: number;
    lowestPrice?: number;
    tenYearChangeRate?: number;
    tenYearChangeAmount?: number;
  }[];
}

/** 단지 등록 요청 */
export interface ApartmentComplexRequest {
  priceRange: string;
  complexName: string;
  checkDate?: string;
  builtYear?: string;
  unitCount?: number;
  region?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  memo?: string;
  // 평형별 가격 배열 — 첫 번째 항목이 단지 대표 가격으로 사용됨
  priceItems?: {
    areaType?: string;
    floor?: string;
    price?: number;
    jeonsePrice?: number;
    askingPrice?: number;
    highestPrice?: number;
    lowestPrice?: number;
    tenYearChangeRate?: number;
    tenYearChangeAmount?: number;
  }[];
  commuteTimes?: {
    destination: string;
    minutes: number;
    transportType?: string;
  }[];
  subwayInfos?: {
    stationName: string;
    subwayLines?: string;
    walkingMinutes?: number;
  }[];
}

/** 다중 시리즈 차트 — 날짜별 행. 키는 '평형-타입' 형식 (e.g. '전용59-sale') */
export interface ChartDataRow {
  date: string;
  [key: string]: string | number;
}

/** 차트 시리즈 메타 — 평형 × 매매/전세 조합 하나를 표현 */
export interface ChartSeries {
  key: string;       // '전용59-sale'
  label: string;     // '전용59 매매'
  areaType: string;
  type: 'sale' | 'jeonse';
  color: string;
}

/** 금액 포맷 유틸 */
export const formatPrice = (price: number): string => {
  const uk = Math.floor(price / 100000000);
  const cheon = Math.floor((price % 100000000) / 10000000); // 천만 단위 나머지 추출
  if (cheon > 0) {
    return `${uk}억 ${cheon}천만`;
  }
  return `${uk}억`;
};

/** 억 단위 변환 */
export const toUkUnit = (price: number): number => {
  return Math.round((price / 100000000) * 100) / 100; // 소수점 2자리까지만 유지
};

/** 주요 지구 소요시간 기반 입지 등급 계산
 * S(빨강): 강남 30분 이하
 * A(노랑): 강남 60분 이하 or 시청·여의도 중 하나 30분 이하
 * B(초록): 시청·여의도 중 하나 60분 이하
 * C(파랑): 나머지
 */
export const calcCommuteGrade = (
  commuteTimes: CommuteTime[]
): { grade: 'S' | 'A' | 'B' | 'C'; color: string } | null => {
  if (!commuteTimes || commuteTimes.length === 0) return null;
  const gangnam   = commuteTimes.find(ct => ct.destination === '강남');
  const siccheong = commuteTimes.find(ct => ct.destination === '시청');
  const yeouido   = commuteTimes.find(ct => ct.destination === '여의도');

  if (gangnam && gangnam.minutes <= 30) return { grade: 'S', color: '#ea4335' };
  const cityUnder30 = (siccheong && siccheong.minutes <= 30) || (yeouido && yeouido.minutes <= 30);
  if (cityUnder30 || (gangnam && gangnam.minutes <= 60)) return { grade: 'A', color: '#f9ab00' };
  const cityUnder60 = (siccheong && siccheong.minutes <= 60) || (yeouido && yeouido.minutes <= 60);
  if (cityUnder60) return { grade: 'B', color: '#34a853' };
  return { grade: 'C', color: '#1a73e8' };
};
