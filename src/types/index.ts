// 네이버 지도 전역 타입 선언
declare global {
  interface Window {
    naver: any; // CDN 로드된 네이버 지도 SDK를 any로 허용
  }
}

/** 단지 사진 — 백엔드 ComplexPhotoDto와 1:1 매핑 */
export interface ComplexPhoto {
  id: number;
  url: string;
  fileName?: string;
  createdAt?: string;
}

/** 주요 상업지구 소요시간 */
export interface CommuteTime {
  id: number;
  destination: string;   // "강남", "시청", "여의도", "발산", "마곡나루"
  minutes: number;
  transportType: string;
  transferCount?: number;  // 환승 횟수 (0 = 환승 없음, undefined = 미입력)
  transferLines?: string;  // 환승 노선 문자열 (예: "1호선 ➡️ 2호선")
  distanceKm?: number;     // 직선거리 (km)
}

/** 지하철 정보 (역명 + 호선 + 도보 시간) */
export interface SubwayInfo {
  id: number;
  stationName: string;   // "구일역"
  subwayLines: string;   // "1호선"
  walkingMinutes: number;
}

/** 학군 정보 — 백엔드 SchoolInfoDto와 1:1 매핑 */
export interface SchoolInfo {
  id: number;
  schoolName: string;
  schoolType: string;          // 'ELEMENTARY' | 'MIDDLE'
  walkingMinutes?: number;
  achievementScore?: number;   // 중학교만 해당
  schoolAddress?: string;
  totalStudents?: number;
  latitude?: number;
  longitude?: number;
}

/** 유해시설 정보 — 백엔드 HazardInfoDto와 1:1 매핑 */
export interface HazardInfo {
  id: number;
  hazardName?: string;
  distance?: number;       // 거리 (미터)
  hazardAddress?: string;
  latitude?: number;
  longitude?: number;
  macroCategory?: string;  // 매크로 그룹 (예: '장묘시설') — 백엔드 컬럼 추가 시 표시
  subCategory?: string;    // 단순화된 세부 카테고리 (예: '소각·열처리')
}

/** 주변 인프라 정보 — 백엔드 InfraInfoDto와 1:1 매핑 */
export interface InfraInfo {
  id: number;
  infraName: string;
  infraType: string;           // 'DEPARTMENT_STORE' | 'MART' | 'HOSPITAL' | 'ETC'
  distance?: number;           // 도보 분 단위
  infraAddress?: string;
  latitude?: number;
  longitude?: number;
}

/** 비교 평가 사진 — 백엔드 ComparisonPhotoDto와 1:1 매핑 */
export interface ComparisonPhoto {
  id: number;
  comparisonId: number;
  fileName: string;
  url: string;
  memo?: string;
  createdAt: string;
}

/** 1:1 단지 비교 평가 — 백엔드 ComparisonDto와 1:1 매핑 */
export interface Comparison {
  id: number;
  complexId1: number;
  complexId2: number;
  complexName1: string;
  complexName2: string;
  memo?: string;
  thumbnailUrl?: string;
  valueRating?: string;        // 가치 평가
  priceNote?: string;          // 가격 비교 평가
  conclusion?: string;         // 결론
  selectedComplexId?: number;  // 최종 선정 단지 PK
  createdAt: string;
  photos: ComparisonPhoto[];
}

/** 생활권 사진 — 백엔드 LivingZonePhotoDto와 1:1 매핑 */
export interface LivingZonePhoto {
  id: number;
  livingZoneId: number;
  url: string;
  fileName?: string;
  createdAt?: string;
}

/** 생활권에 포함된 단지 요약 정보 — 백엔드 LivingZoneComplexDto와 1:1 매핑
 *  id = join 레코드(LivingZoneComplex) ID, complexId = ApartmentComplex ID */
export interface LivingZoneComplex {
  id: number;          // join 레코드 ID
  complexId: number;   // 실제 단지 ID (DELETE 경로 등에 사용)
  complexName: string;
}

/** 생활권 — 지역구(district) 단위로 단지를 묶고 메모를 관리 */
export interface LivingZone {
  id: number;
  district: string;     // "서울 관악구"
  name: string;         // "봉천역 생활권"
  memo?: string;
  complexes: LivingZoneComplex[];
  polygonPoints?: { lat: number; lng: number }[] | null; // 구획 폴리곤 좌표 배열
}

/** 지도 오버레이 마커 — 학교·인프라 위치 표시용 */
export interface OverlayMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  markerType: 'school' | 'infra' | 'hazard';
  subType?: string;            // schoolType 또는 infraType
  achievementScore?: number;   // 중학교 학업성취도 (마커 위에 표시)
  walkingMinutes?: number;     // 도보시간 (초등학교 마커 위에 표시)
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
  askingPrice?: number;    // 호가 (원 단위) — 최신 시세 이력에서 집계, 지도 마커 우선 표시
  jeonsePrice?: number;    // 원 단위
  jeonseRate?: number;     // % (전세가 / 매매가 × 100)
  unitCount: number;
  region: string;          // "서울 구로구"
  address: string;
  memo?: string;
  redevelopType?: string;   // 'REDEVELOPMENT' | 'RECONSTRUCTION' | 'REMODELING' | null
  redevelopStage?: string;  // 'INITIAL' | 'COMMITTEE' | 'ASSOCIATION' | 'APPROVAL' | 'MGMT_APPROVAL' | 'RELOCATION' | 'COMPLETION'
  visitType?: string;       // 'ATMOSPHERE' | 'COMPLEX' | 'LISTING' | 'NONE' | null
  latitude: number;
  longitude: number;
  commuteTimes: CommuteTime[];
  subwayInfos: SubwayInfo[];
  schoolInfos?: SchoolInfo[];
  infraInfos?: InfraInfo[];
  hazardInfos?: HazardInfo[];
  areaTypes?: string[];                        // 최신 시세 기록 기준 평형 목록
  areaTypePriceRanges?: Record<string, string>; // 평형 → 금액대 매핑 (예: {"전용 59": "11억대", "전용 84": "14억대"})
  priceItems?: PriceItem[]; // 백엔드가 포함 시 금액대 필터에서 평형 정보 표시 가능
  grade?: string;       // 지역 직장 밀도 등급 (S/A/B/C) — RegionWorkplaceConst 기준, DB 미저장
  employees?: number;   // 지역 종사자수
  businesses?: number;  // 지역 사업체수
  tenYearChangeRate?: number; // 최신 시세 기록의 10년 등락률 (%) — 백엔드 집계값
  isFavorite?: boolean; // 즐겨찾기 여부
  slopeType?: string;         // 경사도: FLAT/GENTLE/MODERATE/STEEP
  buildingStructure?: string; // 아파트구조: STAIRCASE/CORRIDOR/MIXED
  floorAreaRatio?: number;    // 용적률 (%)
}

/** 평형별 시세 항목 — 백엔드 PriceHistoryItemDto와 1:1 매핑 */
export interface PriceHistoryItem {
  id: number;
  areaType: string;      // "전용 59.9"
  floor: string;         // "3/15"
  price: number;         // 원 단위
  jeonsePrice?: number;  // 원 단위
  jeonseRate?: number;   // %
  kbPrice?: number;             // KB시세 (원 단위)
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
    kbPrice?: number;
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
  redevelopType?: string;   // 'REDEVELOPMENT' | 'RECONSTRUCTION' | 'REMODELING'
  redevelopStage?: string;  // 'INITIAL' | 'COMMITTEE' | 'ASSOCIATION' | 'APPROVAL' | 'MGMT_APPROVAL' | 'RELOCATION' | 'COMPLETION'
  visitType?: string;       // 'ATMOSPHERE' | 'COMPLEX' | 'LISTING' | 'NONE'
  slopeType?: string;         // 경사도: FLAT/GENTLE/MODERATE/STEEP
  buildingStructure?: string; // 아파트구조: STAIRCASE/CORRIDOR/MIXED
  floorAreaRatio?: number;    // 용적률 (%)
  // 평형별 가격 배열 — 첫 번째 항목이 단지 대표 가격으로 사용됨
  priceItems?: {
    areaType?: string;
    floor?: string;
    price?: number;
    jeonsePrice?: number;
    kbPrice?: number;
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
    transferLines?: string; // 환승 노선 문자열 (예: "1호선 ➡️ 2호선")
  }[];
  subwayInfos?: {
    stationName: string;
    subwayLines?: string;
    walkingMinutes?: number;
  }[];
  schoolInfos?: {
    schoolName: string;
    schoolAddress?: string;
    schoolType?: string;       // 'ELEMENTARY' | 'MIDDLE'
    walkingMinutes?: number;
    achievementScore?: number; // Double — 중학교만 해당
    totalStudents?: number;
  }[];
  infraInfos?: {
    infraType: string;         // 'DEPARTMENT_STORE' | 'MART' | 'HOSPITAL' | 'ETC'
    infraName: string;
    infraAddress?: string;
    distance?: number;         // 도보 분 단위
  }[];
  hazardInfos?: {
    hazardName: string;
    hazardAddress?: string;
    distance?: number;         // 거리 (미터)
    latitude?: number;
    longitude?: number;
  }[];
  isFavorite?: boolean;        // 즐겨찾기 여부
}

/** 필터 패널 활성 필터 상태 — 빈 배열/null = 해당 카테고리 필터 없음 */
export interface ActiveFilters {
  visitTypes: string[]          // ATMOSPHERE | COMPLEX | LISTING | NONE
  grades: string[]              // S|A|B|C 직장밀도 등급
  commuteGrades: string[]       // S|A|B|C 입지(교통) 등급
  schoolGrades: string[]        // S|A|B|C 학군 등급
  infraGrades: string[]         // S|A|B|C 환경(인프라) 등급
  unitCountRanges: string[]     // "500이하"|"500~1000"|"1000~2000"|"2000이상"
  redevelopTypes: string[]      // REDEVELOPMENT|RECONSTRUCTION|REMODELING|없음
  slopeTypes: string[]          // FLAT|GENTLE|MODERATE|STEEP
  buildingStructures: string[]  // STAIRCASE|CORRIDOR|MIXED
  builtYearRanges: string[]     // "2020이후"|"2010년대"|"2000년대"|"1999이전"
  regions: string[]             // 지역구 (예: "서울 관악구")
  isFavoriteOnly: boolean
  jeonseRateRanges: string[]    // "60미만"|"60~70"|"70~80"|"80이상"
  changeRateRanges: string[]    // "80~100"|"100~150"|"150~200"|"200이상"
}

export const EMPTY_FILTERS: ActiveFilters = {
  visitTypes: [], grades: [], commuteGrades: [], schoolGrades: [], infraGrades: [],
  unitCountRanges: [], redevelopTypes: [], slopeTypes: [], buildingStructures: [],
  builtYearRanges: [], regions: [], isFavoriteOnly: false,
  jeonseRateRanges: [], changeRateRanges: [],
};

/** 필터가 하나라도 활성화돼 있는지 */
export const isFiltersActive = (f: ActiveFilters): boolean =>
  f.visitTypes.length > 0 || f.grades.length > 0 || f.commuteGrades.length > 0 ||
  f.schoolGrades.length > 0 || f.infraGrades.length > 0 || f.unitCountRanges.length > 0 ||
  f.redevelopTypes.length > 0 || f.slopeTypes.length > 0 || f.buildingStructures.length > 0 ||
  f.builtYearRanges.length > 0 || f.regions.length > 0 || f.isFavoriteOnly ||
  f.jeonseRateRanges.length > 0 || f.changeRateRanges.length > 0;

/** 경로 좌표 점 */
/** 체크리스트 입력 유형 */
export type ChecklistInputType = 'RATING' | 'OX' | 'TEXT';

/** 체크리스트 템플릿 항목 — 백엔드 ChecklistTemplateDto와 1:1 매핑 */
export interface ChecklistTemplate {
  id: number;
  visitType: string;    // ATMOSPHERE | COMPLEX | PROPERTY
  category?: string;   // 카테고리 그룹 (null=미분류)
  itemName: string;
  displayOrder: number;
  inputType?: ChecklistInputType;  // RATING(상중하) | OX | TEXT
}

/** 체크 평가값 타입 */
export type ChecklistRating = 'UPPER' | 'MIDDLE' | 'LOWER' | 'O' | 'X' | null;

/** 단지 체크 결과 — 미체크 항목도 rating=null로 포함 */
export interface ChecklistResultItem {
  id: number;
  templateId: number;
  itemName: string;
  visitType: string;    // ATMOSPHERE | COMPLEX | PROPERTY
  category?: string;   // 카테고리 그룹
  displayOrder: number;
  inputType?: ChecklistInputType;
  rating: ChecklistRating;
  memo: string | null;
}

/** 생활권 분위기 체크 결과 — 미체크 항목도 rating=null로 포함 */
export interface ZoneChecklistResultItem {
  id: number;
  templateId: number;
  itemName: string;
  category?: string;
  displayOrder: number;
  inputType?: ChecklistInputType;
  rating: ChecklistRating;
  memo: string | null;
}

/** 매물 임장 체크리스트 결과 — 미평가 항목도 rating=null로 포함 */
export interface PropertyVisitResultItem {
  id: number;
  templateId: number;
  itemName: string;
  category?: string;
  displayOrder: number;
  inputType?: ChecklistInputType;
  rating: ChecklistRating;
  memo?: string | null;  // TEXT 타입 입력값
}

/** 매물 임장 기록 — 부동산·동호수·평형·제안가 단위 1건 */
export interface PropertyVisit {
  id: number;
  complexId: number;
  visitDate?: string;     // "2024-01-15"
  agentName?: string;     // 부동산 이름
  officePhone?: string;   // 부동산 연락처
  mobilePhone?: string;   // 휴대전화 연락처
  dong?: string;
  hosu?: string;
  areaType?: string;      // 평형 (예: "전용 59")
  price?: number;         // 제안 금액 (원 단위)
  memo?: string;
  createdAt: string;
  results: PropertyVisitResultItem[];
}

export interface RoutePoint {
  lat: number;
  lng: number;
}

/** 저장된 경로 — 백엔드 RouteDto와 1:1 매핑 */
export interface MapRoute {
  id: number;
  name: string;
  points: RoutePoint[];
  createdAt: string;
}

/** 서울 구별 평형별 평균 시세 통계 (월별)
 * 18평(전용 59㎡) / 21평(전용 69㎡) / 24평(전용 79㎡) / 33평(전용 109㎡)
 */
export interface DistrictStat {
  id: number;
  tradeMonth: string;     // YYYYMM
  district: string;       // 구 이름
  avgTrade18?: number;    // 18평 평균 매매가 (만원)
  avgTrade21?: number;
  avgTrade24?: number;
  avgTrade26?: number;    // 26평 평균 매매가 (전용 85㎡, 국민평형)
  avgTrade33?: number;
  avgJeonse18?: number;   // 18평 평균 전세가 (만원)
  avgJeonse21?: number;
  avgJeonse24?: number;
  avgJeonse26?: number;   // 26평 평균 전세가
  avgJeonse33?: number;
  tradeCount18?: number;
  tradeCount21?: number;
  tradeCount24?: number;
  tradeCount26?: number;
  tradeCount33?: number;
  jeonseCount18?: number;
  jeonseCount21?: number;
  jeonseCount24?: number;
  jeonseCount26?: number;
  jeonseCount33?: number;
  collectedAt?: string;
}

/** 구별 시세 실거래 상세 1건 (apt_trade_cache / apt_jeonse_cache) */
export interface DistrictTradeDetail {
  id: number;
  aptNm?: string;
  aptDong?: string;
  umdNm?: string;
  excluUseAr?: string;
  floor?: string;
  buildYear?: string;
  dealYear?: string;
  dealMonth?: string;
  dealDay?: string;
  dealAmount?: number;   // 매매가 (만원)
  deposit?: number;      // 전세 보증금 (만원)
  dealingGbn?: string;   // 거래 구분
}

/** 구별 시세 이력 1건 (그래프용) */
export interface DistrictStatHistory {
  month: string;
  district: string;
  price?: number | null;
  count?: number | null;
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

  if (gangnam && gangnam.minutes <= 30) return { grade: 'S', color: '#F08080' };
  const cityUnder30 = (siccheong && siccheong.minutes <= 30) || (yeouido && yeouido.minutes <= 30);
  if (cityUnder30 || (gangnam && gangnam.minutes <= 60)) return { grade: 'A', color: '#FFD97D' };
  const cityUnder60 = (siccheong && siccheong.minutes <= 60) || (yeouido && yeouido.minutes <= 60);
  if (cityUnder60) return { grade: 'B', color: '#7DC8A0' };
  return { grade: 'C', color: '#89CFF0' };
};
