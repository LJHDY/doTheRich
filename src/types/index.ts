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
  complexes: LivingZoneComplex[];  // 순위 순서대로 정렬됨 (백엔드가 complexRankings 기준으로 정렬)
  polygonPoints?: { lat: number; lng: number }[] | null; // 구획 폴리곤 좌표 배열
  complexRankings?: number[];       // 순위 배열 (complexId 순서)
  flagshipComplexName?: string | null;  // 1순위 단지명 (지도 라벨용)
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
  areaTypePrices?: Record<string, number>;       // 평형 → 실제 매매가(원) — 금액대 리스트 실금액 표시용
  priceItems?: PriceItem[]; // 백엔드가 포함 시 금액대 필터에서 평형 정보 표시 가능
  grade?: string;       // 지역 직장 밀도 등급 (S/A/B/C) — RegionWorkplaceConst 기준, DB 미저장
  employees?: number;   // 지역 종사자수
  businesses?: number;  // 지역 사업체수
  tenYearChangeRate?: number; // 최신 시세 기록의 10년 등락률 (%) — 백엔드 집계값
  isFavorite?: boolean; // 즐겨찾기 여부
  naverComplexNumber?: string; // 네이버 부동산 단지번호 (시세 감시용)
  slopeType?: string;         // 경사도: FLAT/GENTLE/MODERATE/STEEP
  buildingStructure?: string; // 아파트구조: STAIRCASE/CORRIDOR/MIXED
  floorAreaRatio?: number;    // 용적률 (%)
  hanRiverParkName?: string;  // 가장 가까운 한강공원명
  hanRiverDistanceM?: number; // 한강공원까지 직선거리 (미터)
  highestPrice?: number;      // 최신 시세 기록의 전고점 (원) — 전고점 대비 필터용
  kbPrice?: number;           // 최신 시세 기록의 KB시세 (원) — 전고점 대비 필터용
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
  hanRiverParkName?: string;  // 가장 가까운 한강공원명
  hanRiverDistanceM?: number; // 한강공원까지 직선거리 (미터)
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
    macroCategory?: string;
    subCategory?: string;
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
  peakDiffRanges: string[]      // "-60미만"|"-60~-40"|"-40~-20"|"-20~0"|"0~+20"|"+20이상"
  peakDiffPriceType: string     // "매매가"|"호가"|"KB시세" — 전고점 비교 기준 가격
  areaTypeRanges: string[]      // "~20평"|"20~25평"|"25~30평"|"30~35평"|"35평+" — 평형대 필터
}

export const EMPTY_FILTERS: ActiveFilters = {
  visitTypes: [], grades: [], commuteGrades: [], schoolGrades: [], infraGrades: [],
  unitCountRanges: [], redevelopTypes: [], slopeTypes: [], buildingStructures: [],
  builtYearRanges: [], regions: [], isFavoriteOnly: false,
  jeonseRateRanges: [], changeRateRanges: [], peakDiffRanges: [], peakDiffPriceType: '매매가',
  areaTypeRanges: [],
};

/** 필터가 하나라도 활성화돼 있는지 */
export const isFiltersActive = (f: ActiveFilters): boolean =>
  f.visitTypes.length > 0 || f.grades.length > 0 || f.commuteGrades.length > 0 ||
  f.schoolGrades.length > 0 || f.infraGrades.length > 0 || f.unitCountRanges.length > 0 ||
  f.redevelopTypes.length > 0 || f.slopeTypes.length > 0 || f.buildingStructures.length > 0 ||
  f.builtYearRanges.length > 0 || f.regions.length > 0 || f.isFavoriteOnly ||
  f.jeonseRateRanges.length > 0 || f.changeRateRanges.length > 0 || f.peakDiffRanges.length > 0 ||
  f.areaTypeRanges.length > 0;

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
  visitDate?: string;
  agentName?: string;
  officePhone?: string;
  mobilePhone?: string;
  dong?: string;
  hosu?: string;
  areaType?: string;
  price?: number;
  orientation?: string;      // 향 (남향/동향/서향 등)
  roomCount?: number;        // 방 수
  bathroomCount?: number;    // 화장실 수
  moveInCondition?: string;  // 입주조건
  repairStatus?: string;     // 수리상태
  repairPeriod?: string;    // 수리시기 (예: "2년 전")
  dislikeFactors?: string;   // 비선호 요소 (콤마 구분)
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

/** 매매가·호가 없이 전세가만 있는 평형 항목 — 단지 정리 기능용 */
export interface PublicComplex {
  id: string;
  guName?: string;
  bldNm?: string;
  address?: string;
  hhldCnt?: number;
  vlRat?: number;
  parkingCnt?: number;
  useAprDay?: string;
  latitude: number;
  longitude: number;
}

export interface JeonseOnlyItem {
  complexId: number;
  complexName: string;
  areaType: string;
  price?: number;        // 매매가 (확인용)
  askingPrice?: number;  // 호가 (확인용)
  jeonsePrice?: number;  // 전세가
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

/** 금액 포맷 유틸 — 원 단위를 "7억 5천만" 형식 문자열로 변환 */
export const formatPrice = (price: number): string => {
  const uk = Math.floor(price / 100000000);
  // 억 이하 잔액에서 천만 단위 추출 (예: 75000000 → cheon=7)
  const cheon = Math.floor((price % 100000000) / 10000000);
  if (cheon > 0) {
    return `${uk}억 ${cheon}천만`;
  }
  return `${uk}억`;
};

/** 억 단위 변환 — 차트 Y축 및 마커 표시에 사용 */
export const toUkUnit = (price: number): number => {
  // 소수점 2자리까지만 유지 (예: 7.543억 → 7.54)
  return Math.round((price / 100000000) * 100) / 100;
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

  // S: 강남 30분 이내 — 최상급 직주근접
  if (gangnam && gangnam.minutes <= 30) return { grade: 'S', color: '#F08080' };
  // A: 강남 60분 이내 OR 도심(시청·여의도) 30분 이내 — 핵심 업무지구 접근성 우수
  const cityUnder30 = (siccheong && siccheong.minutes <= 30) || (yeouido && yeouido.minutes <= 30);
  if (cityUnder30 || (gangnam && gangnam.minutes <= 60)) return { grade: 'A', color: '#FFD97D' };
  // B: 도심 60분 이내 — 대중교통으로 접근 가능
  const cityUnder60 = (siccheong && siccheong.minutes <= 60) || (yeouido && yeouido.minutes <= 60);
  if (cityUnder60) return { grade: 'B', color: '#7DC8A0' };
  // C: 위 조건 모두 미충족
  return { grade: 'C', color: '#89CFF0' };
};

// ─── 가계부 ───────────────────────────────────────────────

export interface BudgetEntry {
  id: number;
  userId: string;
  yearMonth: string;    // "202508"
  entryDate: string;    // "2025-08-12"
  entryType: 'INCOME' | 'EXPENSE';
  category: string;
  subcategory?: string;
  accountMain?: string; // 통장 대분류 (고정비통장/변동비통장/이벤트통장)
  account?: string;     // 통장 중분류 (생활비/데이트 등)
  cardName?: string;    // 결제 카드명 (account와 별도 — 통장에서 출금 + 카드로 결제)
  amount: number;       // 원 단위
  isFixed: boolean;
  isInvestment: boolean;
  investmentType?: string;
  isTransfer?: boolean;   // 이체 여부
  transferPairId?: number; // 이체 쌍 상대 항목 id (출금↔입금 연결)
  isCardPayment?: boolean; // 카드 납부 여부 — 통장에서 카드값 갚는 출금 (totalExpense 집계 제외)
  merchant?: string;    // 지출처 (예: 스타벅스, 쿠팡)
  installmentMonths?: number;   // 할부 총 개월수 (null=일시불)
  installmentSeq?: number;      // 할부 회차 (1부터 시작)
  installmentGroupId?: string;  // 같은 할부 묶음 UUID
  isInterestFree?: boolean;     // 무이자 할부 여부
  memo?: string;
  createdAt: string;
}

export interface AccountBalance {
  accountName: string;
  yearMonth: string;
  openingBalance: number;  // 이월 잔액 (원)
}

export interface BudgetSummary {
  yearMonth: string;
  totalIncome: number;
  totalExpense: number;
  totalInvestment: number;
  fixedExpense: number;
  variableExpense: number;
  byAccount: { account: string; income: number; expense: number }[];
  byCategory: { category: string; type: string; amount: number }[];
}

// ─── 자산 관리 ───────────────────────────────────────────────

export interface Asset {
  id: number;
  userId: string;
  assetName: string;
  assetType: string;
  amount: number;    // 원 단위 (BigInteger 허용)
  memo?: string;
  updatedAt: string;
}

/** 자산 스냅샷 단일 셀 — (user_id, snapshot_date, asset_type) 기준 upsert */
export interface AssetSnapshotCell {
  id: number;
  userId: string;
  snapshotDate: string;  // "YYYY-MM-DD"
  assetType: string;     // ASSET_COLUMNS key
  amount: number;        // 원 단위 (달러 현금은 USD 달러 금액)
}

/** 자산 세부 항목 — 계좌별 내역 (합산 → 스냅샷 셀 자동 반영) */
export interface AssetSnapshotDetail {
  id: number;
  userId: string;
  snapshotDate: string;
  assetType: string;
  accountName: string;
  amount: number;  // 원 단위
}

/** 공통코드 — DB로 관리하는 코드 테이블 (공통코드그룹 + 상세코드) */
export interface CommonCode {
  id: number;
  commonCode: string;       // 그룹 식별자 (예: FIXED_EXPENSE_CATEGORY)
  commonCodeName: string;   // 그룹 표시명 (예: 고정비 카테고리)
  detailCode: string;       // 상세 코드
  detailCodeName: string;   // 상세 표시명
  sortOrder: number;
  createdAt: string;
}

/** 결제수단 (통장/카드) — 가계부 및 고정비 납부 통장 선택에 사용 */
export interface PaymentMethod {
  id: number;
  userId: string;
  name: string;             // 예: "신한은행 고정비 통장"
  type: '통장' | '카드';
  accountMain?: string;     // 통장 대분류 (고정비/변동비/이벤트 통장)
  accountNumber?: string;   // 계좌번호
  cardAlias?: string;       // 카드 별칭 or 카드번호
  billingDay?: number;       // 카드 결제일 (1-31)
  billingStartDay?: number;  // 카드 결산 시작일 (1-31)
  billingEndDay?: number;    // 카드 결산 종료일 (1-31)
  isShared: boolean;         // 공용 통장 여부 (동영·주해 공동 관리)
  isActive: boolean;
}

/** 사용자별 고정비 템플릿 — 납부 버튼으로 지출 내역 자동 등록 */
export interface FixedExpense {
  id: number;
  userId: string;
  name: string;          // 고정비 내역
  amount: number;        // 원 단위
  accountMain?: string;  // 납부 통장 대분류
  account?: string;      // 납부 통장
  paymentDay?: number;   // 납부일 (1-31)
  category: string;
  isActive: boolean;
}

/** 할일 */
export interface Todo {
  id: number;
  userId: string;        // "ldy" | "juhae" | "common"
  title: string;
  todoDate: string;      // YYYY-MM-DD (시작일)
  endDate?: string;      // YYYY-MM-DD (종료일, 없으면 단일일)
  isDone: boolean;       // 단일 할일 완료 여부
  doneDate?: string;     // 다일 할일: 마지막으로 완료 처리한 날짜 (YYYY-MM-DD)
  createdAt: string;
}

export interface Dday {
  id: number;
  userId: string;       // "ldy" | "juhae" | "common"
  title: string;
  targetDate: string;   // YYYY-MM-DD
  createdAt: string;
}

// 하루 스케줄 블록 (원형 시간표 한 조각)
export interface DayScheduleBlock {
  id: string;
  startMin: number;  // 0~1430 (10분 단위)
  endMin: number;    // 10~1440
  label: string;
  color: string;
}

/** 고정비 캘린더 — 납부일별 항목 + 납부 여부 */
export interface FixedExpenseCalendarItem {
  id: number;
  name: string;
  amount: number;
  paid: boolean;
}
export interface FixedExpenseCalendar {
  ldy?: Record<string, FixedExpenseCalendarItem[]>;
  juhae?: Record<string, FixedExpenseCalendarItem[]>;
}

/** CNN Fear & Greed Index */
export interface FearGreedData {
  score: number;
  rating: string;          // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
  previousClose: number;
  previous1Week: number;
  previous1Month: number;
}

/** 시장 데이터 단일 티커 */
export interface MarketTicker {
  label: string;
  close: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  date: string;
}

/** 국내 장 마감 리포트 섹터 데이터 */
export interface KrSectorData {
  market: 'KOSPI' | 'KOSDAQ';
  sector: string;
  changePct: number;
}

/** 국내 장 마감 리포트 주도주 데이터 */
export interface KrTopGainer {
  market: 'KOSPI' | 'KOSDAQ';
  ticker: string;
  name: string;
  changePct: number;
  changePrice?: number;
  close: number | null;
  tradeVolume?: number;
  tradeAmount?: number;
}

/** 투자자별 매매동향 — 1거래일치 */
export interface KrInvestorDayFlow {
  date: string;   // 'YYYYMMDD'
  investors: Record<string, { label: string; diffHundredMillion: number }>;
}

/** 부동산/대출상담사 연락처 */
export interface Contact {
  id: number;
  type: '부동산' | '대출상담사';
  company: string;      // 회사/사무소명 (메인 표시, 필수)
  name?: string;        // 담당자 이름 (선택)
  phone?: string;
  region?: string;
  memo?: string;
  createdAt: string;
}

/** 연락처별 상담 기록 (텍스트 + 녹음파일) */
export interface ConsultationLog {
  id: number;
  contactId: number;
  consultDate: string;   // YYYY-MM-DD
  title: string;
  content?: string;
  audioUrl?: string;     // R2 공개 URL
  createdAt: string;
}

/** 시장 리포트 — 매일 KST 07:00(글로벌) / 16:00(국내장마감) 자동 생성 */
export interface MarketReport {
  id: number;
  reportDate: string;                         // YYYY-MM-DD
  reportType: 'global' | 'kr_close' | 'premarket'; // 글로벌(기본) | 국내장마감 | 미국장 프리마켓
  marketData: Record<string, MarketTicker>;   // sp500, nasdaq, kospi 등
  fearGreed: FearGreedData | null;            // CNN Fear & Greed Index
  krSectors: KrSectorData[];                  // 섹터별 등락률 (kr_close 전용)
  krTopGainers: KrTopGainer[];               // 상승률 상위 종목 (kr_close 전용)
  krInvestorFlow: KrInvestorDayFlow[];        // 투자자별 매매동향 최근 5거래일 (kr_close 전용)
  content: string;                            // Gemini 분석 마크다운
  createdAt: string | null;
  updatedAt: string | null;
}

// 일정 관리
export interface Schedule {
  id: number;
  userId: string;
  title: string;
  description: string | null;
  eventDate: string;         // "YYYY-MM-DD" 시작일
  endDate: string | null;    // "YYYY-MM-DD" 종료일 (null이면 단일일)
  eventTime: string | null;  // "HH:MM"
  category: string | null;
  repeatType: string | null;  // weekly / monthly / yearly
  repeatDays: string | null;  // 매주 반복 시 요일 — "0,2,4" (0=월…6=일), null이면 시작일 요일 반복
  naverUid: string | null;    // 네이버 캘린더 iCal UID
  createdAt: string | null;
}

/** 투자 메모 첨부 이미지 */
export interface InvestmentMemoImage {
  id: number;
  memoId: number;
  imageUrl: string;
  imageFileName: string;
  displayOrder: number;
}

/** 투자 메모 */
export interface InvestmentMemo {
  id: number;
  title: string;
  content: string | null;
  images: InvestmentMemoImage[];
  createdAt: string | null;
  updatedAt: string | null;
}

export type WorkoutType = 'TENNIS' | 'HEALTH' | 'RUNNING';

/** 운동 기록 — workout_log 테이블 1:1 매핑 */
export interface WorkoutLog {
  id: number;
  userId: string;
  workoutDate: string;           // ISO date (YYYY-MM-DD)
  workoutType: WorkoutType;
  durationMinutes?: number | null;
  memo?: string | null;
  // 테니스
  gameCount?: number | null;
  // 헬스
  muscleGroup?: string | null;
  exerciseName?: string | null;
  weightKg?: number | null;
  reps?: number | null;
  sets?: number | null;
  setsData?: { weight: number | null; reps: number }[] | null; // 세트별 무게·횟수 목록
  // 러닝
  distanceKm?: number | null;
  createdAt?: string | null;
}

/** 금액을 "0,000원" 형식으로 포맷 */
export const formatAmount = (amount: number): string =>
  amount.toLocaleString('ko-KR') + '원';

/** 금액을 콤마 구분 정수로 포맷 (반올림·버림 없음) */
export const formatAmountShort = (amount: number): string =>
  amount.toLocaleString('ko-KR');

/** 모바일 등 좁은 공간용 억/만 단위 축약 포맷 */
// TEXT 타입 항목 점수 매핑 — memo에 해당 키워드가 포함되면 점수 부여
const CHECKLIST_TEXT_SCORE_MAP: Record<string, number> = {
  '탄성': 1,
  '모래': 0,
};

export interface ChecklistScore {
  score: number;     // 획득 점수
  maxScore: number;  // 최대 가능 점수
}

/** 체크리스트 항목 배열을 점수로 환산
 *  - RATING: 상=3 / 중=2 / 하=1
 *  - OX: O=1 / X=0
 *  - TEXT: CHECKLIST_TEXT_SCORE_MAP 키워드 매칭 시 해당 점수 (미매칭은 집계 제외)
 */
export const calcChecklistScore = (
  items: Array<{ inputType?: ChecklistInputType; rating: ChecklistRating; memo?: string | null }>
): ChecklistScore => {
  let score = 0;
  let maxScore = 0;
  for (const item of items) {
    const type = (item.inputType ?? 'RATING') as ChecklistInputType;
    if (type === 'RATING') {
      maxScore += 3;
      if (item.rating === 'UPPER') score += 3;
      else if (item.rating === 'MIDDLE') score += 2;
      else if (item.rating === 'LOWER') score += 1;
    } else if (type === 'OX') {
      maxScore += 1;
      if (item.rating === 'O') score += 1;
    } else if (type === 'TEXT') {
      const memo = (item.memo ?? '').trim();
      const matched = Object.keys(CHECKLIST_TEXT_SCORE_MAP).find(k => memo.includes(k));
      if (matched !== undefined) {
        maxScore += 1;
        score += CHECKLIST_TEXT_SCORE_MAP[matched];
      }
    }
  }
  return { score, maxScore };
};

export const formatAmountCompact = (amount: number): string => {
  if (amount === 0) return '—';
  if (amount >= 100_000_000) {
    return `${parseFloat((amount / 100_000_000).toFixed(2))}억`;
  }
  return `${Math.round(amount / 10_000).toLocaleString()}만`;
};

// ─── DART 재무 스크리닝 ─────────────────────────────────────────────────────

/** DART 스크리닝 통과 개별 종목 재무 데이터 */
/** 분기별 재무 실적 (1분기/반기 보고서 공통 구조) */
export interface QuarterlyFinancialResult {
  revenue?: number | null;        // 매출액 (원)
  revenuePrev?: number | null;    // 전기 매출액 (YoY 계산용)
  opIncome?: number | null;       // 영업이익 (원)
  opIncomePrev?: number | null;   // 전기 영업이익
  netIncome?: number | null;      // 당기순이익 (원)
  netIncomePrev?: number | null;  // 전기 당기순이익
}

export interface ScreeningTopPick {
  stockCode: string;
  corpCode: string;
  corpName: string;
  market: 'KOSPI' | 'KOSDAQ';
  roe: number | null;            // ROE (%)
  opMargin: number | null;       // 영업이익률 (%)
  debtRatio: number | null;      // 부채비율 (%)
  revenueGrowth: number | null;  // 매출성장률 (%)
  pbr: number | null;            // PBR (배)
  per: number | null;            // PER (배) — yfinance market_cap / DART 순이익
  cashRatio: number | null;      // 현금 보유 비중 (%) — 현금및현금성자산 / 자산총계
  marketCap: number | null;      // 시총 (억원)
  currentPrice?: number | null;  // 현재가 (원)
  score: number;                 // 종합 스코어 (0~100)
  quarterly?: {                  // 분기 실적 (TOP 30만 포함)
    q1?: QuarterlyFinancialResult;   // 1분기 (5월 이후 가용)
    h1?: QuarterlyFinancialResult;   // 반기 (8월 이후 가용)
  } | null;
}

/** 추가 랭킹용 종목 항목 (4종 랭킹 공용) */
export interface ScreeningRankItem {
  stockCode: string;
  corpName: string;
  market: 'KOSPI' | 'KOSDAQ';
  marketCap: number | null;
  debtRatio: number | null;
  roe: number | null;
  opMargin: number | null;
  revenueGrowth: number | null;
  assetsGrowth3y?: number | null;   // 자산 증가율 TOP20
  opMargin3yAvg?: number | null;    // 3년 평균 영업이익률 TOP20
  revenueGrowth3y?: number | null;  // 매출 증가율 TOP20
}

/** DART 우량주 스크리닝 리포트 1건 */
export interface ScreeningReport {
  id: number;
  reportDate: string;                          // YYYY-MM-DD
  marketType: 'ALL' | 'KOSPI' | 'KOSDAQ';    // 시장 유형
  bsnYear: string | null;                      // 기준 사업연도
  universeCount: number | null;                // 분석 대상 종목 수
  screenedCount: number | null;                // 1차 필터 통과 종목 수
  topPicks: ScreeningTopPick[];                // JSON 파싱된 TOP 40 종목
  rankAssetGrowth: ScreeningRankItem[];        // 3년 자산 증가율 TOP20
  rankOpMarginAvg: ScreeningRankItem[];        // 3년 평균 영업이익률 TOP20
  rankLowDebt: ScreeningRankItem[];            // 부채비율 120% 이하
  rankRevenueGrowth: ScreeningRankItem[];      // 3년 매출 증가율 TOP20
  content: string | null;                      // Gemini 마크다운 분석
  createdAt: string;
  updatedAt: string;
}

// 시장 리포트 × 스크리닝 통합 투자 의견 리포트
export interface IntegratedReport {
  id: number;
  reportDate: string;              // YYYY-MM-DD
  marketReportId: number | null;   // 참조한 시장 리포트 ID
  screeningReportId: number | null; // 참조한 스크리닝 리포트 ID
  content: string | null;          // Gemini 마크다운 분석
  createdAt: string;
  updatedAt: string;
}
