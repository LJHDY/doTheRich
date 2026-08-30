import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApartmentComplex, PriceHistory, PriceHistoryItem, PriceHistoryRequest, ChartDataRow, ChartSeries, formatPrice, toUkUnit, SchoolInfo, InfraInfo, SubwayInfo, calcCommuteGrade, OverlayMarker, calcChecklistScore } from '../../types';
import api, { getPriceHistories, addPriceHistory, updateComplexMemo, deleteComplex, getComplexById, addSchoolInfos, updateSchoolInfo, deleteSchoolInfo, addInfraInfos, updateInfraInfo, deleteInfraInfo, addHazardInfos, updateHazardInfo, deleteHazardInfo, addSubwayInfos, updateSubwayInfo, deleteSubwayInfo, toggleFavorite, updatePriceHistoryItem, updateVisitType, updateComplexBasicInfo, updateCommuteTimes, deletePriceHistoryByAreaType, updateRedevelopInfo, searchNearby, getTransitRoutes, TransitRoute, getNearbySchools, NearbySchool, updateNaverComplexNumber, getComplexPriceSnapshots, ComplexPriceSnapshot, getTradeHistory, getTradeHistoryStatus, collectTradeHistory, TradeHistoryMonth } from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import PriceChart from './PriceChart';
import PriceInputForm from './PriceInputForm';
import CommuteGradeBadge from './CommuteGradeBadge';
import PhotoSlideModal from './PhotoSlideModal';
import ChecklistModal from '../checklist/ChecklistModal';
import { getComplexChecklist, getPropertyVisits } from '../../services/api';
import { useNumberedTextarea } from '../../hooks/useNumberedTextarea';
import { FACILITY_MACRO_CATEGORY, getSimplifiedCategory } from './constants/hazardCategories';

interface ComplexInfoPanelProps {
  complex: ApartmentComplex | null;
  onClose: () => void;
  onMemoUpdate?: (complexId: number, memo: string) => void;
  onDelete?: (complexId: number) => void;
  onOverlayMarkersChange?: (markers: OverlayMarker[]) => void;
  onComplexUpdate?: (complex: ApartmentComplex) => void; // 학군/인프라 저장 후 부모 상태 갱신
  onRadiusToggle?: (center: { lat: number; lng: number } | null) => void; // 도보 반경 원 토글
  isMobile?: boolean; // 모바일 풀스크린 오버레이 모드
}

// 네이버 검색 결과 단건 — 학교·인프라 검색에서 공통 사용
interface SearchItem {
  title: string;
  category: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
}

// 학군 기존 항목 수정 전용 상태 (mode 필드 제거, schoolId 필수)
interface SchoolEditState {
  schoolId: number;
  schoolName: string;
  schoolAddress: string;
  schoolType: 'ELEMENTARY' | 'MIDDLE';
  walkingMinutes: string;
  achievementScore: string;
  totalStudents: string;
  latitude: number | null;
  longitude: number | null;
  fetching: boolean;        // 검색 or 도보거리 계산 중
  searchResults: SearchItem[];
  showDropdown: boolean;
  saving: boolean;
}

// 학군 신규 추가 행 — 배열로 관리하여 여러 행을 쌓아두고 한 번에 저장
interface SchoolAddRow {
  localId: number;          // React key용 고유 번호 (useRef 카운터로 증가)
  schoolName: string;
  schoolAddress: string;
  schoolType: 'ELEMENTARY' | 'MIDDLE';
  walkingMinutes: string;
  achievementScore: string;
  totalStudents: string;
  latitude: number | null;
  longitude: number | null;
  fetching: boolean;
  searchResults: SearchItem[];
  showDropdown: boolean;
}

// 인프라 기존 항목 수정 전용 상태 (mode 필드 제거, infraId 필수)
interface InfraEditState {
  infraId: number;
  infraType: string;
  infraName: string;
  infraAddress: string;
  distance: string;
  latitude: number | null;
  longitude: number | null;
  fetching: boolean;
  searchResults: SearchItem[];
  showDropdown: boolean;
  saving: boolean;
}

// 인프라 신규 추가 행 — 배열로 관리
interface InfraAddRow {
  localId: number;          // React key용 고유 번호
  infraType: string;
  infraName: string;
  infraAddress: string;
  distance: string;
  latitude: number | null;
  longitude: number | null;
  fetching: boolean;
  searchResults: SearchItem[];
  showDropdown: boolean;
}

// 유해시설 기존 항목 수정 폼 상태
interface HazardEditState {
  hazardId: number;
  hazardName: string;
  hazardAddress: string;
  distance: string;          // 미터
  latitude: number | null;
  longitude: number | null;
  fetching: boolean;
  searchResults: SearchItem[];
  showDropdown: boolean;
  saving: boolean;
}

// 유해시설 신규 추가 행
interface HazardAddRow {
  localId: number;
  hazardName: string;
  hazardAddress: string;
  distance: string;          // 미터
  latitude: number | null;
  longitude: number | null;
  fetching: boolean;
  searchResults: SearchItem[];
  showDropdown: boolean;
  macroCategory?: string;    // 자동 감지 시 매크로 그룹
  subCategory?: string;      // 자동 감지 시 세부 카테고리
}

// 지하철 편집 행 — 기존(id 있음) + 신규(id 없음) 통합 관리
interface SubwayEditRow {
  localId: string;
  id?: number;
  stationName: string;
  subwayLines: string;
  walkingMinutes: string;
  foundLines: string[];  // 역 조회 결과 호선 목록
  fetching: boolean;
}

// 출퇴근 시간 편집 행 — 5개 고정 목적지
interface CommuteEditRow {
  destination: string;
  minutes: string;
  transportType: string;
  transferCount: string;
  transferLines: string[]; // 환승 노선명 배열 (저장 시 ' ➡️ '로 join)
  distanceKm?: number;     // 직선거리 (km) — 좌표 있으면 자동 계산
  // 커스텀 목적지 전용 필드
  isCustom?: boolean;
  destLat?: number;
  destLng?: number;
  destLabel?: string;
  searchQuery?: string;
  searchResults?: SearchItem[];
  showSearchDropdown?: boolean;
  isSearching?: boolean;
  localKey?: number; // React key용 고유 번호
}

// 네이버 지도 경로 URL 생성용 목적지 좌표 — RegisterModal과 동일
const DESTINATION_COORDS: Record<string, { lng: number; lat: number; label: string }> = {
  '강남':    { lng: 127.0276368, lat: 37.4979462, label: '강남역' },
  '시청':    { lng: 126.9769157, lat: 37.5663174, label: '시청역' },
  '여의도':  { lng: 126.9244095, lat: 37.5216839, label: '여의도역' },
  '발산':    { lng: 126.8373108, lat: 37.5590293, label: '발산역' },
  '마곡나루': { lng: 126.8275182, lat: 37.5667930, label: '마곡나루역' },
};
const COMMUTE_DESTINATIONS = ['강남', '시청', '여의도', '발산', '마곡나루'];

// 네이버 category("교통 > 지하철 > 서울 지하철 2호선")에서 "2호선"만 추출
const parseLineFromCategory = (category: string): string =>
  category.split('>').slice(-1)[0].trim()
    .replace(/수도권전철\s+/, '').replace(/서울\s+지하철\s+/, '').replace(/^서울\s+/, '').trim();

const isStation = (category: string) =>
  category.includes('지하철') || category.includes('전철');

// HTML 태그 제거 (네이버 검색 결과 title에 <b> 태그가 포함되어 있어 제거)
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '');

// 두 좌표 사이의 직선 거리(km) 계산 — 도보 API 실패 시 fallback으로 사용
const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// 인프라 유형 목록 — 셀렉트박스 옵션 생성에 사용
const INFRA_TYPES_LIST = [
  { key: 'DEPARTMENT_STORE', label: '백화점' },
  { key: 'MART', label: '마트' },
  { key: 'HOSPITAL', label: '병원' },
  { key: 'ETC', label: '기타' },
];

// 인라인 편집 폼 인풋 공통 스타일
const editInputStyle: React.CSSProperties = {
  border: '1px solid #dadce0', borderRadius: '6px', padding: '6px 8px',
  fontSize: '12px', outline: 'none', width: '100%', boxSizing: 'border-box',
};

// 값이 없으면 행 자체를 렌더링하지 않아 불필요한 빈 줄 방지
const InfoRow: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, marginRight: '8px' }}>{label}</span>
      <span style={{ fontSize: '13px', color: '#202124', textAlign: 'right' }}>{value}</span>
    </div>
  );
};

const REDEVELOP_TYPE_LABELS: Record<string, string> = {
  REDEVELOPMENT: '재개발', RECONSTRUCTION: '재건축', REMODELING: '리모델링',
};
const REDEVELOP_STAGE_LABELS: Record<string, string> = {
  INITIAL: '정비구역 지정', COMMITTEE: '추진위원회 구성 및 승인',
  ASSOCIATION: '조합 설립 인가', APPROVAL: '사업시행인가',
  MGMT_APPROVAL: '관리처분인가', RELOCATION: '이주·철거 및 착공', COMPLETION: '준공 및 입주',
};
const VISIT_TYPE_LABELS: Record<string, string> = {
  ATMOSPHERE: '분위기 임장', COMPLEX: '단지 임장', LISTING: '매물 임장', NONE: '임장X',
};
const SCHOOL_TYPE_LABELS: Record<string, string> = {
  ELEMENTARY: '초등', MIDDLE: '중학',
};
const INFRA_TYPE_LABELS: Record<string, string> = {
  DEPARTMENT_STORE: '백화점', MART: '마트', HOSPITAL: '병원', ETC: '기타',
};

// 중학교 학업성취도 기준 학군 등급 — 중학교 없거나 점수 없으면 null
const calcSchoolGrade = (
  schoolInfos: SchoolInfo[]
): { grade: 'S' | 'A' | 'B' | 'C'; color: string } | null => {
  const scores = schoolInfos
    .filter(s => s.schoolType === 'MIDDLE' && s.achievementScore != null)
    .map(s => s.achievementScore!);
  if (scores.length === 0) return null;
  const best = Math.max(...scores);
  if (best >= 95) return { grade: 'S', color: '#F08080' };
  if (best >= 90) return { grade: 'A', color: '#FFD97D' };
  if (best >= 85) return { grade: 'B', color: '#7DC8A0' };
  return { grade: 'C', color: '#4BAAD4' };
};

// 인프라 등급 — 백화점 2개↑=S, 1개=A, 대형마트 1개↑=B, 그외=C / 인프라 없어도 항상 표시
const calcInfraGrade = (
  infraInfos: InfraInfo[]
): { grade: 'S' | 'A' | 'B' | 'C'; color: string } => {
  const deptCount = infraInfos.filter(i => i.infraType === 'DEPARTMENT_STORE').length;
  const martCount = infraInfos.filter(i => i.infraType === 'MART').length;
  if (deptCount >= 2) return { grade: 'S', color: '#F08080' };
  if (deptCount >= 1) return { grade: 'A', color: '#FFD97D' };
  if (martCount >= 1) return { grade: 'B', color: '#7DC8A0' };
  return { grade: 'C', color: '#4BAAD4' };
};

// 인라인 뱃지 — 학교유형·인프라유형 등 짧은 분류 태그 표시용
const Tag: React.FC<{ label: string; color?: string }> = ({ label, color = '#5f6368' }) => (
  <span style={{
    fontSize: '10px', fontWeight: 700, color: '#fff',
    backgroundColor: color, padding: '1px 6px', borderRadius: '8px',
    whiteSpace: 'nowrap', flexShrink: 0,
  }}>{label}</span>
);

// S/A/B/C 등급 → 색상 매핑 (직장밀도·학군·인프라 공통)
const GRADE_COLORS: Record<string, string> = {
  S: '#F08080', A: '#FFD97D', B: '#7DC8A0', C: '#89CFF0',
};

// 만 단위 축약 (240689 → "24만", 9500 → "9,500")
const formatCount = (n: number): string =>
  n >= 10000 ? `${Math.round(n / 10000)}만` : n.toLocaleString();

// 매매가: 파란 계열 / 전세가: 빨간 계열 — 평형 수만큼 순환 사용
const SALE_COLORS = ['#89CFF0', '#4285f4', '#185abc', '#669df6'];

// RegisterModal과 동일한 참고가 자동계산 헬퍼
const evalExpr = (expr: string): string => {
  const cleaned = expr.replace(/\s/g, '');
  if (!cleaned) return '';
  if (!/^[0-9+\-*/.]+$/.test(cleaned)) return expr;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${cleaned}`)() as number;
    if (typeof result === 'number' && isFinite(result)) return String(Math.round(result * 100) / 100);
  } catch {}
  return expr;
};
// "A-B" 패턴 → 등락금액·등락률 자동 계산
const calcTenYear = (expr: string): { amount: string; rate: string } => {
  const cleaned = expr.replace(/\s/g, '');
  const match = cleaned.match(/^(\d+\.?\d*)-(\d+\.?\d*)$/);
  if (match) {
    const cur = parseFloat(match[1]);
    const base = parseFloat(match[2]);
    const amount = Math.round((cur - base) * 100) / 100;
    const rate = base > 0 ? Math.round((cur - base) / base * 10000) / 100 : 0;
    return { amount: String(amount), rate: String(rate) };
  }
  return { amount: evalExpr(expr), rate: '' };
};
const JEONSE_COLORS = ['#F08080', '#c62828', '#ef5350', '#e57373'];

// PriceHistory 배열을 recharts용 다중 시리즈 데이터로 변환
const buildChartData = (
  histories: PriceHistory[]
): { rows: ChartDataRow[]; series: ChartSeries[] } => {
  // 전체 히스토리에서 등장한 areaType 목록 (순서 유지, 중복 제거)
  const seen = new Set<string>();
  const areaTypes: string[] = [];
  histories.flatMap(h => h.items.map(i => i.areaType || '').filter(Boolean))
    .forEach(at => { if (!seen.has(at)) { seen.add(at); areaTypes.push(at); } });

  const series: ChartSeries[] = [];
  areaTypes.forEach((at, idx) => {
    // 매매가 시리즈
    series.push({
      key: `${at}-sale`,
      label: `${at} 매매`,
      areaType: at,
      type: 'sale',
      color: SALE_COLORS[idx % SALE_COLORS.length],
    });
    // 전세가 데이터가 하나라도 있는 평형만 전세 시리즈 추가
    const hasJeonse = histories.some(h =>
      h.items.some(i => i.areaType === at && i.jeonsePrice)
    );
    if (hasJeonse) {
      series.push({
        key: `${at}-jeonse`,
        label: `${at} 전세`,
        areaType: at,
        type: 'jeonse',
        color: JEONSE_COLORS[idx % JEONSE_COLORS.length],
      });
    }
  });

  // 같은 날짜 기록이 여러 개(평형별 별도 등록)일 때 하나의 row로 합산
  const dateMap = new Map<string, ChartDataRow>();
  const rows: ChartDataRow[] = [];
  histories.forEach(h => {
    if (!dateMap.has(h.recordDate)) {
      const newRow: ChartDataRow = { date: h.recordDate };
      dateMap.set(h.recordDate, newRow);
      rows.push(newRow);
    }
    const row = dateMap.get(h.recordDate)!;
    h.items.forEach(item => {
      const at = item.areaType || '';
      if (!at) return;
      if (item.price) row[`${at}-sale`] = toUkUnit(item.price);
      if (item.jeonsePrice) row[`${at}-jeonse`] = toUkUnit(item.jeonsePrice);
    });
  });

  return { rows, series };
};

const ComplexInfoPanel: React.FC<ComplexInfoPanelProps> = ({ complex, onClose, onMemoUpdate, onDelete, onOverlayMarkersChange, onComplexUpdate, onRadiusToggle, isMobile }) => {
  const [priceHistories, setPriceHistories] = useState<PriceHistory[]>([]);
  const [chartData, setChartData] = useState<{ rows: ChartDataRow[]; series: ChartSeries[] }>(() => ({ rows: [], series: [] }));
  const [showInputForm, setShowInputForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 즐겨찾기 로컬 상태 — 낙관적 업데이트(즉시 UI 반영) 후 API 실패 시 롤백
  const [isFavorite, setIsFavorite] = useState(false);

  // 네이버 단지번호 인라인 편집 상태
  const [editingNaverNo, setEditingNaverNo] = useState(false);
  const [naverNoInput, setNaverNoInput] = useState('');
  const [naverNoSaving, setNaverNoSaving] = useState(false);

  // 시세 스냅샷 — 즐겨찾기 단지에 수집된 네이버 호가 이력
  const [priceSnapshots, setPriceSnapshots] = useState<ComplexPriceSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);

  // 거래량 이력 — MOLIT 실거래 10년 데이터
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryMonth[]>([]);
  const [tradeCollected, setTradeCollected] = useState(false);
  const [tradeCollecting, setTradeCollecting] = useState(false);
  const [tradeGranularity, setTradeGranularity] = useState<'month' | 'quarter' | 'year'>('year');
  const [tradeAreaFilter, setTradeAreaFilter] = useState<string>('전체');

  // 차트 평형 필터 — '' = 전체, '전용 59' 등 선택 시 해당 타입의 매매/전세 세트만 표시
  const [selectedAreaType, setSelectedAreaType] = useState('');

  // 메모 인라인 편집 상태 — displayMemo는 저장 즉시 반영, complex.memo는 서버 원본
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoText, setMemoText] = useState('');
  const [displayMemo, setDisplayMemo] = useState('');
  const memoHook = useNumberedTextarea(memoText, setMemoText);
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);

  const [showRecordTooltip, setShowRecordTooltip] = useState(false);
  const [showStageTooltip, setShowStageTooltip] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // 사진 슬라이드 모달 표시 여부
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  // 도보 30분 반경 원 표시 여부
  const [showRadius, setShowRadius] = useState(false);

  // 임장 유형 인라인 편집 상태 — 값 없으면 NONE으로 초기화
  const [editingVisitType, setEditingVisitType] = useState(false);
  const [localVisitType, setLocalVisitType] = useState(complex?.visitType || 'NONE');
  const [visitTypeSaving, setVisitTypeSaving] = useState(false);

  // 재개발 정보 인라인 편집 상태
  const [editingRedevelop, setEditingRedevelop] = useState(false);
  const [localRedevelopType, setLocalRedevelopType] = useState(complex?.redevelopType ?? '');
  const [localRedevelopStage, setLocalRedevelopStage] = useState(complex?.redevelopStage ?? '');
  const [redevelopSaving, setRedevelopSaving] = useState(false);

  // 참고가 평형 탭 선택 상태 — priceHistories 로드 후 첫 번째 areaType으로 초기화
  const [selectedRefTab, setSelectedRefTab] = useState<string>('');

  // 참고가 인라인 편집 상태
  const [editingRefPrice, setEditingRefPrice] = useState(false);
  const [refPriceForm, setRefPriceForm] = useState({
    areaType: '',
    priceUk: '', jeonseUk: '',
    kbPriceUk: '', askingPriceUk: '', highestPriceUk: '', lowestPriceUk: '',
    tenYearAmountStr: '', tenYearRateStr: '',
  });
  const [refPriceSaving, setRefPriceSaving] = useState(false);
  const [deletingAreaType, setDeletingAreaType] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 기본 정보 인라인 편집 상태
  const [editingBasicInfo, setEditingBasicInfo] = useState(false);
  const [basicInfoForm, setBasicInfoForm] = useState({ builtYear: '', unitCount: '', slopeType: '', buildingStructure: '', floorAreaRatio: '' });
  const [basicInfoSaving, setBasicInfoSaving] = useState(false);

  // 학군 편집 상태 — editingSchool: 기존 항목 수정 폼, newSchoolRows: 신규 추가 행 배열
  const [editingSchool, setEditingSchool] = useState<SchoolEditState | null>(null);
  const [newSchoolRows, setNewSchoolRows] = useState<SchoolAddRow[]>([]);
  const [savingNewSchools, setSavingNewSchools] = useState(false);
  // 인프라 편집 상태 — editingInfra: 기존 항목 수정 폼, newInfraRows: 신규 추가 행 배열
  const [editingInfra, setEditingInfra] = useState<InfraEditState | null>(null);
  const [newInfraRows, setNewInfraRows] = useState<InfraAddRow[]>([]);
  const [savingNewInfras, setSavingNewInfras] = useState(false);
  // 유해시설 편집 상태
  const [editingHazard, setEditingHazard] = useState<HazardEditState | null>(null);
  const [newHazardRows, setNewHazardRows] = useState<HazardAddRow[]>([]);
  const [savingNewHazards, setSavingNewHazards] = useState(false);
  const [loadingHazardSuggestions, setLoadingHazardSuggestions] = useState(false);
  const [loadingInfraSuggestions, setLoadingInfraSuggestions] = useState(false);
  // 전국 학교 DB — 단지 선택 시 1km 반경 학교 자동 조회
  const [dbSchools, setDbSchools] = useState<NearbySchool[]>([]);
  const [loadingDbSchools, setLoadingDbSchools] = useState(false);
  const [addingDbSchoolId, setAddingDbSchoolId] = useState<string | null>(null);
  // 체크리스트 모달 상태
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistRatedCount, setChecklistRatedCount] = useState(0);
  const [checklistTotalCount, setChecklistTotalCount] = useState(0);
  const [checklistScore, setChecklistScore] = useState<{ score: number; maxScore: number } | null>(null);
  // 지하철 편집 상태 — 기존·신규 행 통합 배열 + 삭제 예약 ID 목록
  const [editingSubway, setEditingSubway] = useState(false);
  const [subwayRows, setSubwayRows] = useState<SubwayEditRow[]>([]);
  const [deletedSubwayIds, setDeletedSubwayIds] = useState<number[]>([]);
  const [savingSubway, setSavingSubway] = useState(false);
  // 출퇴근 시간 편집 상태 — 5개 고정 목적지 행 + 커스텀 목적지
  const [editingCommute, setEditingCommute] = useState(false);
  const [transitPicker, setTransitPicker] = useState<{ routes: TransitRoute[]; rowIdx: number } | null>(null);
  const [transitLoading, setTransitLoading] = useState<number | null>(null); // 로딩 중인 행 idx
  const [commuteRows, setCommuteRows] = useState<CommuteEditRow[]>([]);
  const [savingCommute, setSavingCommute] = useState(false);
  const customCommuteKeyRef = useRef(0);
  const [showPeakChart, setShowPeakChart] = useState(false);
  const [showMetroMap, setShowMetroMap] = useState(false);
  const [metroZoom, setMetroZoom] = useState(1);
  const [metroPan, setMetroPan] = useState({ x: 0, y: 0 });
  const metroDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  // 추가 행 localId 생성용 카운터 — useRef로 관리해 리렌더 시 초기화 방지
  const schoolRowCounter = useRef(0);
  const infraRowCounter = useRef(0);
  const hazardRowCounter = useRef(0);
  // 검색 시퀀스 번호 — 비동기 경쟁 조건 방지: 선택 후 in-flight 검색 결과 무시
  const newSchoolSearchSeq = useRef<Map<number, number>>(new Map());
  const editSchoolSearchSeq = useRef(0);
  const newInfraSearchSeq = useRef<Map<number, number>>(new Map());
  const editInfraSearchSeq = useRef(0);
  const newHazardSearchSeq = useRef<Map<number, number>>(new Map());
  const editHazardSearchSeq = useRef(0);

  // 종합평가 카드 클릭 시 해당 섹션으로 스크롤
  const workSectionRef = useRef<HTMLDivElement>(null);
  const commuteSectionRef = useRef<HTMLDivElement>(null);
  const schoolSectionRef = useRef<HTMLDivElement>(null);
  const infraSectionRef = useRef<HTMLDivElement>(null);
  const hazardSectionRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 시세 기록 로드 후 차트용 억 단위 데이터 포인트로 변환
  const loadPriceHistories = useCallback(async (complexId: number) => {
    setLoading(true);
    try {
      const histories = await getPriceHistories(complexId);
      setPriceHistories(histories);
      // 평형별·매매/전세별 다중 시리즈로 변환
      setChartData(buildChartData(histories));
    } catch (e) {
      console.error('시세 기록 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // priceHistories 최초 로드 시 참고가 탭을 첫 번째 areaType으로 초기화
  // editingRefPrice=true 중에는 실행 금지 — + 평형 클릭으로 selectedRefTab을 ''로 만든 직후
  // 이 effect가 발화해 기존 탭값으로 리셋하면 saveRefPrice에서 PATCH로 잘못 분기됨
  useEffect(() => {
    if (editingRefPrice) return;
    if (priceHistories.length > 0 && !selectedRefTab) {
      const first = priceHistories[priceHistories.length - 1].items[0]?.areaType || '';
      setSelectedRefTab(first);
    }
  }, [priceHistories, selectedRefTab, editingRefPrice]);

  // 단지 변경 시 좌표가 저장된 학교·인프라·유해시설 + DB 학교를 오버레이 마커로 지도에 전달
  useEffect(() => {
    if (!onOverlayMarkersChange) return;
    const markers: OverlayMarker[] = [];
    (complex?.schoolInfos ?? []).forEach(s => {
      if (s.latitude != null && s.longitude != null) {
        markers.push({
          id: `school-${s.id}`,
          name: s.schoolName,
          lat: s.latitude,
          lng: s.longitude,
          markerType: 'school',
          subType: s.schoolType,
          achievementScore: s.achievementScore ?? undefined,
          walkingMinutes: s.walkingMinutes ?? undefined,
        });
      }
    });
    // 전국 학교 DB에서 조회한 근처 학교도 오버레이 마커로 추가 (이미 등록된 학교와 별개)
    dbSchools.forEach(s => {
      markers.push({
        id: `db-school-${s.id}`,
        name: s.schoolName,
        lat: s.latitude,
        lng: s.longitude,
        markerType: 'school',
        subType: s.schoolType === '초등학교' ? 'ELEMENTARY' : 'MIDDLE',
        achievementScore: s.achievementScore ?? undefined,
      });
    });
    (complex?.infraInfos ?? []).forEach(inf => {
      if (inf.latitude != null && inf.longitude != null) {
        markers.push({ id: `infra-${inf.id}`, name: inf.infraName, lat: inf.latitude, lng: inf.longitude, markerType: 'infra', subType: inf.infraType });
      }
    });
    (complex?.hazardInfos ?? []).forEach(h => {
      if (h.latitude != null && h.longitude != null) {
        markers.push({ id: `hazard-${h.id}`, name: h.hazardName ?? '', lat: h.latitude, lng: h.longitude, markerType: 'hazard', subType: h.macroCategory });
      }
    });
    onOverlayMarkersChange(markers);
  }, [complex, dbSchools, onOverlayMarkersChange]);

  // 선택 단지가 바뀌면 이전 데이터·상태를 초기화하고 새로 조회
  useEffect(() => {
    if (complex) {
      setPriceHistories([]);
      setChartData({ rows: [], series: [] });
      setShowInputForm(false);
      setSuccessMsg(null);
      // 차트 필터·메모 상태도 초기화 — 새 단지 선택 시 이전 상태 버림
      setSelectedAreaType('');
      setEditingMemo(false);
      setMemoText(complex.memo || '');
      setDisplayMemo(complex.memo || '');
      setMemoError(null);
      // 즐겨찾기 상태를 새 단지 값으로 동기화
      setIsFavorite(complex.isFavorite ?? false);
      // 사진 모달·임장 유형 편집 상태도 초기화 — 다른 단지 선택 시 닫기
      setShowPhotoModal(false);
      setShowRadius(false);
      onRadiusToggle?.(null);
      setEditingVisitType(false);
      setLocalVisitType(complex.visitType || 'NONE');
      setEditingRedevelop(false);
      setLocalRedevelopType(complex.redevelopType ?? '');
      setLocalRedevelopStage(complex.redevelopStage ?? '');
      // 기본 정보·참고가 탭·편집 상태도 초기화 — 다른 단지 선택 시 폼 닫기
      setEditingBasicInfo(false);
      setSelectedRefTab('');
      setEditingRefPrice(false);
      // 학군/인프라 편집·추가 상태도 초기화 — 다른 단지 선택 시 이전 폼 닫기
      setEditingSchool(null);
      setNewSchoolRows([]);
      setSavingNewSchools(false);
      setEditingInfra(null);
      setNewInfraRows([]);
      setSavingNewInfras(false);
      setEditingSubway(false);
      setSubwayRows([]);
      setDeletedSubwayIds([]);
      setEditingCommute(false);
      setCommuteRows([]);
      setEditingNaverNo(false);
      setNaverNoInput(complex.naverComplexNumber ?? '');
      loadPriceHistories(complex.id);
      // 체크리스트 요약 로드 — 체크된 항목 수 / 전체 항목 수 파악
      setChecklistOpen(false);
      // 분위기/단지 + 매물 기록 병렬 로드 후 합산 총점 계산
      Promise.all([
        getComplexChecklist(complex.id),
        getPropertyVisits(complex.id),
      ]).then(([results, visits]) => {
        setChecklistRatedCount(results.filter(r => r.rating !== null).length);
        setChecklistTotalCount(results.length);
        const atmoComp = calcChecklistScore(results);
        const propScore = visits.reduce(
          (acc, v) => {
            const s = calcChecklistScore(v.results);
            return { score: acc.score + s.score, maxScore: acc.maxScore + s.maxScore };
          },
          { score: 0, maxScore: 0 }
        );
        const combined = { score: atmoComp.score + propScore.score, maxScore: atmoComp.maxScore + propScore.maxScore };
        setChecklistScore(combined.maxScore > 0 ? combined : null);
      }).catch(() => {});
    }
  }, [complex, loadPriceHistories, onRadiusToggle]);

  // 단지 변경 시 DB에서 2km 반경 학교 자동 조회 (전국 학교 DB 활용)
  useEffect(() => {
    if (!complex) { setDbSchools([]); return; }
    setDbSchools([]);
    setLoadingDbSchools(true);
    // 1km로 조회 후 클라이언트에서 초등 500m / 중학 1km 필터 적용
    getNearbySchools(complex.latitude, complex.longitude, 1.0)
      .then(schools => setDbSchools(schools.filter(s =>
        s.schoolType === '중학교' ? s.distanceKm <= 1.0 : s.distanceKm <= 0.5
      )))
      .catch(() => setDbSchools([]))
      .finally(() => setLoadingDbSchools(false));
  }, [complex?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 즐겨찾기 단지 & naverComplexNumber 있으면 시세 스냅샷 로드
  useEffect(() => {
    if (!complex?.id || !complex.naverComplexNumber) {
      setPriceSnapshots([]);
      return;
    }
    setSnapshotsLoading(true);
    getComplexPriceSnapshots(complex.id, 10)
      .then(snaps => setPriceSnapshots(snaps))
      .catch(() => setPriceSnapshots([]))
      .finally(() => setSnapshotsLoading(false));
  }, [complex?.id, complex?.naverComplexNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // 거래 이력 — 단지 변경 시 수집 여부 확인 + 이력 로드
  useEffect(() => {
    if (!complex?.id) { setTradeHistory([]); setTradeCollected(false); return; }
    getTradeHistoryStatus(complex.id).then(s => {
      setTradeCollected(s.collected);
      if (s.collected) getTradeHistory(complex.id).then(setTradeHistory).catch(() => {});
    }).catch(() => {});
  }, [complex?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCollectTradeHistory = async () => {
    if (!complex?.id) return;
    setTradeCollecting(true);
    try {
      await collectTradeHistory(complex.id);
      // 폴링: 5초마다 상태 확인, 완료되면 이력 로드
      const poll = setInterval(async () => {
        const s = await getTradeHistoryStatus(complex.id);
        if (s.collected && (s.totalMonths ?? 0) > 0) {
          clearInterval(poll);
          setTradeCollected(true);
          setTradeCollecting(false);
          const data = await getTradeHistory(complex.id);
          setTradeHistory(data);
        }
      }, 5000);
      // 최대 4분 후 자동 중단
      setTimeout(() => { clearInterval(poll); setTradeCollecting(false); }, 240000);
    } catch {
      setTradeCollecting(false);
      alert('수집 시작에 실패했습니다.');
    }
  };

  // 네이버 단지번호 저장
  const handleSaveNaverNo = async () => {
    if (!complex) return;
    setNaverNoSaving(true);
    try {
      await updateNaverComplexNumber(complex.id, naverNoInput.trim());
      onComplexUpdate?.({ ...complex, naverComplexNumber: naverNoInput.trim() || undefined });
      setEditingNaverNo(false);
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setNaverNoSaving(false);
    }
  };

  // 즐겨찾기 토글 — 낙관적 업데이트 후 API 실패 시 롤백
  const handleToggleFavorite = async () => {
    if (!complex) return;
    const next = !isFavorite;
    setIsFavorite(next); // UI 즉시 반영
    try {
      await toggleFavorite(complex.id, next);
      onComplexUpdate?.({ ...complex, isFavorite: next }); // 부모 상태 갱신
    } catch {
      setIsFavorite(!next); // API 실패 시 원래 값으로 롤백
    }
  };

  // 메모 저장 — PATCH 성공 시 로컬 displayMemo를 즉시 갱신 (재조회 불필요)
  const handleMemoSave = async () => {
    if (!complex) return;
    setMemoSaving(true);
    setMemoError(null);
    try {
      await updateComplexMemo(complex.id, memoText);
      setDisplayMemo(memoText);
      setEditingMemo(false);
      // 부모 상태(complexes, selectedComplex)에도 즉시 반영 — 다른 단지 갔다 와도 유지됨
      onMemoUpdate?.(complex.id, memoText);
    } catch {
      setMemoError('저장에 실패했습니다.');
    } finally {
      setMemoSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!complex) return;
    setDeleting(true);
    try {
      await deleteComplex(complex.id);
      onDelete?.(complex.id);
      onClose();
    } catch {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const handlePriceSubmit = async (request: PriceHistoryRequest) => {
    if (!complex) return;
    await addPriceHistory(complex.id, request);
    setShowInputForm(false);
    setSuccessMsg('시세가 저장되었습니다!');
    await loadPriceHistories(complex.id);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // 전체 히스토리를 순서대로 순회해 areaType별 최신 item을 Map으로 구성
  const latestItemPerAreaType = (() => {
    const map = new Map<string, PriceHistoryItem>();
    priceHistories.forEach(h => {
      h.items.forEach(item => {
        if (item.areaType) map.set(item.areaType, item);
      });
    });
    return map;
  })();

  // 현재 선택된 탭에 해당하는 최신 시세 아이템 반환 헬퍼
  const getSelectedRefItem = () => {
    if (selectedRefTab && latestItemPerAreaType.has(selectedRefTab))
      return latestItemPerAreaType.get(selectedRefTab)!;
    // areaType 없는 item은 latestHistory 첫 항목에서 가져옴
    const latest = priceHistories.length > 0 ? priceHistories[priceHistories.length - 1] : null;
    return latest?.items[0] ?? null;
  };

  // 기본 정보 편집 시작 — 현재 단지 값으로 폼 초기화
  const startEditBasicInfo = () => {
    setBasicInfoForm({
      builtYear: complex?.builtYear ?? '',
      unitCount: complex?.unitCount ? String(complex.unitCount) : '',
      slopeType: complex?.slopeType ?? '',
      buildingStructure: complex?.buildingStructure ?? '',
      floorAreaRatio: complex?.floorAreaRatio != null ? String(complex.floorAreaRatio) : '',
    });
    setEditingBasicInfo(true);
  };

  // 기본 정보 저장 — PATCH /api/complexes/:id/basic-info
  const saveBasicInfo = async () => {
    if (!complex) return;
    setBasicInfoSaving(true);
    try {
      const payload: { builtYear?: string; unitCount?: number; slopeType?: string; buildingStructure?: string; floorAreaRatio?: number } = {};
      if (basicInfoForm.builtYear) {
        const yr = basicInfoForm.builtYear.trim();
        payload.builtYear = yr.endsWith('년') ? yr : `${yr}년`;
      }
      if (basicInfoForm.unitCount) payload.unitCount = parseInt(basicInfoForm.unitCount, 10);
      if (basicInfoForm.slopeType) payload.slopeType = basicInfoForm.slopeType;
      if (basicInfoForm.buildingStructure) payload.buildingStructure = basicInfoForm.buildingStructure;
      if (basicInfoForm.floorAreaRatio) payload.floorAreaRatio = parseFloat(basicInfoForm.floorAreaRatio);
      await updateComplexBasicInfo(complex.id, payload);
      await refreshComplex();
      setEditingBasicInfo(false);
    } catch {
      // 에러는 콘솔에만 — 인터셉터가 이미 출력
    } finally {
      setBasicInfoSaving(false);
    }
  };

  // 참고가 편집 시작 — 선택된 탭 areaType의 기존 값으로 폼 초기화
  const startEditRefPrice = () => {
    const item = getSelectedRefItem();
    setRefPriceForm({
      areaType: item?.areaType ?? '',
      priceUk: item?.price ? String(item.price / 100_000_000) : '',
      jeonseUk: item?.jeonsePrice ? String(item.jeonsePrice / 100_000_000) : '',
      kbPriceUk: item?.kbPrice ? String(item.kbPrice / 100_000_000) : '',
      askingPriceUk: item?.askingPrice ? String(item.askingPrice / 100_000_000) : '',
      highestPriceUk: item?.highestPrice ? String(item.highestPrice / 100_000_000) : '',
      lowestPriceUk: item?.lowestPrice ? String(item.lowestPrice / 100_000_000) : '',
      tenYearAmountStr: item?.tenYearChangeAmount != null ? String(item.tenYearChangeAmount / 100_000_000) : '',
      tenYearRateStr: item?.tenYearChangeRate != null ? String(item.tenYearChangeRate) : '',
    });
    setEditingRefPrice(true);
  };

  // 참고가 저장 — item 있으면 PATCH, 없으면 오늘 날짜로 POST 신규 생성
  const saveRefPrice = async () => {
    if (!complex) return;
    // selectedRefTab이 빈 문자열이면 신규 추가(+ 평형) → item을 null로 강제해 POST 경로로 진입
    // getSelectedRefItem()의 fallback(latest.items[0])을 쓰면 기존 item id가 반환돼 PATCH로 잘못 분기됨
    const item = selectedRefTab ? (latestItemPerAreaType.get(selectedRefTab) ?? null) : null;
    setRefPriceSaving(true);
    try {
      const f = refPriceForm;
      const savedAreaType = f.areaType.trim();
      const normalizedAreaType = savedAreaType && /^\d+(\.\d+)?$/.test(savedAreaType)
        ? `전용 ${savedAreaType}` : savedAreaType || undefined;
      const payload = {
        areaType: normalizedAreaType,
        price: f.priceUk ? Math.round(parseFloat(f.priceUk) * 100_000_000) : undefined,
        jeonsePrice: f.jeonseUk ? Math.round(parseFloat(f.jeonseUk) * 100_000_000) : undefined,
        kbPrice: f.kbPriceUk ? Math.round(parseFloat(f.kbPriceUk) * 100_000_000) : undefined,
        askingPrice: f.askingPriceUk ? Math.round(parseFloat(f.askingPriceUk) * 100_000_000) : undefined,
        highestPrice: f.highestPriceUk ? Math.round(parseFloat(f.highestPriceUk) * 100_000_000) : undefined,
        lowestPrice: f.lowestPriceUk ? Math.round(parseFloat(f.lowestPriceUk) * 100_000_000) : undefined,
        tenYearChangeAmount: f.tenYearAmountStr ? Math.round(parseFloat(f.tenYearAmountStr) * 100_000_000) : undefined,
        tenYearChangeRate: f.tenYearRateStr ? parseFloat(f.tenYearRateStr) : undefined,
      };
      if (item?.id) {
        await updatePriceHistoryItem(complex.id, item.id, payload);
      } else {
        const today = new Date().toISOString().slice(0, 10);
        await addPriceHistory(complex.id, { recordDate: today, items: [payload] });
      }
      await loadPriceHistories(complex.id);
      await refreshComplex(); // 지도 마커 가격 반영
      if (normalizedAreaType) setSelectedRefTab(normalizedAreaType);
      setEditingRefPrice(false);
    } catch {
      // 에러는 콘솔에만 — 인터셉터가 이미 출력
    } finally {
      setRefPriceSaving(false);
    }
  };

  // areaType 전체 삭제 — 해당 평형의 모든 시세 기록 삭제 후 재조회
  const handleDeleteAreaType = async (areaType: string) => {
    if (!complex) return;
    if (!window.confirm(`"${areaType}" 평형의 모든 시세 기록을 삭제합니다.\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeletingAreaType(true);
    try {
      await deletePriceHistoryByAreaType(complex.id, areaType);
      setSelectedRefTab('');
      setEditingRefPrice(false);
      await loadPriceHistories(complex.id);
      await refreshComplex();
    } catch { /* 에러는 인터셉터가 출력 */ }
    finally { setDeletingAreaType(false); }
  };

  // 저장 후 단지 전체 재조회 → 부모·오버레이 마커 동시 갱신
  const refreshComplex = useCallback(async () => {
    if (!complex) return;
    try {
      const fresh = await getComplexById(complex.id);
      onComplexUpdate?.(fresh);
      // 갱신된 단지의 학교·인프라 오버레이 마커도 함께 갱신
      const markers: OverlayMarker[] = [];
      (fresh.schoolInfos ?? []).forEach(s => {
        if (s.latitude != null && s.longitude != null)
          markers.push({ id: `school-${s.id}`, name: s.schoolName, lat: s.latitude, lng: s.longitude, markerType: 'school', subType: s.schoolType });
      });
      (fresh.infraInfos ?? []).forEach(inf => {
        if (inf.latitude != null && inf.longitude != null)
          markers.push({ id: `infra-${inf.id}`, name: inf.infraName, lat: inf.latitude, lng: inf.longitude, markerType: 'infra', subType: inf.infraType });
      });
      onOverlayMarkersChange?.(markers);
    } catch { /* 재조회 실패는 무시 — 이미 저장은 완료된 상태 */ }
  }, [complex, onComplexUpdate, onOverlayMarkersChange]);

  // 신규 추가 행 하나 추가 — 빈 상태로 생성 후 배열 끝에 삽입
  const startAddSchool = () => {
    const localId = ++schoolRowCounter.current;
    setNewSchoolRows(prev => [...prev, {
      localId,
      schoolName: '', schoolAddress: '',
      schoolType: 'ELEMENTARY',
      walkingMinutes: '', achievementScore: '', totalStudents: '',
      latitude: null, longitude: null,
      fetching: false, searchResults: [], showDropdown: false,
    }]);
    // 학군 섹션으로 스크롤 — DOM 렌더 후 실행되도록 딜레이
    setTimeout(() => schoolSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  // 추가 행 제거 — localId로 해당 행만 필터링 제거
  const removeNewSchoolRow = (localId: number) => {
    setNewSchoolRows(prev => prev.filter(r => r.localId !== localId));
  };

  // 추가 행 필드 업데이트 — localId로 해당 행만 찾아서 부분 갱신
  const updateNewSchoolRow = (localId: number, update: Partial<SchoolAddRow>) => {
    setNewSchoolRows(prev => prev.map(r => r.localId === localId ? { ...r, ...update } : r));
  };

  // 추가 행 학교 검색 — 네이버 장소 검색 API 호출
  // 결과 1건이면 자동 선택, 시퀀스 번호로 선택 후 in-flight 결과 폐기
  const handleNewSchoolSearch = async (localId: number) => {
    const row = newSchoolRows.find(r => r.localId === localId);
    if (!row || !row.schoolName.trim()) return;
    const seq = (newSchoolSearchSeq.current.get(localId) ?? 0) + 1;
    newSchoolSearchSeq.current.set(localId, seq);
    updateNewSchoolRow(localId, { fetching: true, showDropdown: false });
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', { params: { query: row.schoolName.trim() } });
      if (newSchoolSearchSeq.current.get(localId) !== seq) return;
      if (data.items.length === 1) { await handleNewSchoolSelect(localId, data.items[0]); return; }
      updateNewSchoolRow(localId, { fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 });
    } catch {
      if (newSchoolSearchSeq.current.get(localId) === seq) updateNewSchoolRow(localId, { fetching: false });
    }
  };

  // 추가 행 검색 결과 선택 — 주소·좌표 자동 입력 후 도보 거리 계산
  const handleNewSchoolSelect = async (localId: number, item: SearchItem) => {
    if (!complex) return;
    newSchoolSearchSeq.current.set(localId, -1);  // 진행 중인 검색 결과 무시
    const addr = item.roadAddress || item.address;
    const lat = parseInt(item.mapy) / 10000000;
    const lng = parseInt(item.mapx) / 10000000;
    updateNewSchoolRow(localId, {
      schoolName: stripHtml(item.title), schoolAddress: addr,
      latitude: lat, longitude: lng, showDropdown: false, searchResults: [], fetching: true,
    });
    try {
      const { data: dir } = await api.get<{ minutes: number }>('/api/directions/walking', {
        params: { startLat: complex.latitude, startLng: complex.longitude, goalLat: lat, goalLng: lng },
      });
      updateNewSchoolRow(localId, { walkingMinutes: String(dir.minutes), fetching: false });
    } catch {
      // 도보 API 실패 시 직선 거리로 추정 (1.3 배율, 시속 4km 기준)
      const km = haversineKm(complex.latitude!, complex.longitude!, lat, lng);
      updateNewSchoolRow(localId, { walkingMinutes: String(Math.max(1, Math.round(km * 1.3 / 4 * 60))), fetching: false });
    }
  };

  // 신규 추가 행 전체 일괄 저장 — 이름이 있는 행만 필터링 후 POST
  const saveNewSchools = async () => {
    if (!complex || newSchoolRows.length === 0) return;
    setSavingNewSchools(true);
    const items = newSchoolRows
      .filter(r => r.schoolName.trim())
      .map(r => ({
        schoolName: r.schoolName || undefined,
        schoolType: r.schoolType,
        walkingMinutes: r.walkingMinutes ? parseInt(r.walkingMinutes) : undefined,
        achievementScore: r.achievementScore ? parseFloat(r.achievementScore) : undefined,
        schoolAddress: r.schoolAddress || undefined,
        totalStudents: r.totalStudents ? parseInt(r.totalStudents) : undefined,
        latitude: r.latitude ?? undefined,
        longitude: r.longitude ?? undefined,
      }));
    try {
      await addSchoolInfos(complex.id, items as any);
      setNewSchoolRows([]);
      await refreshComplex();
    } catch {
      /* 저장 실패해도 입력 폼 유지 */
    } finally {
      setSavingNewSchools(false);
    }
  };

  // DB 학교 "+ 추가" — 도보 시간 자동 계산 후 school_info에 즉시 저장
  const handleAddDbSchool = async (s: NearbySchool) => {
    if (!complex) return;
    setAddingDbSchoolId(s.id);
    let walkingMinutes: number | undefined;
    try {
      const { data: dir } = await api.get<{ minutes: number }>('/api/directions/walking', {
        params: { startLat: complex.latitude, startLng: complex.longitude, goalLat: s.latitude, goalLng: s.longitude },
      });
      walkingMinutes = dir.minutes;
    } catch {
      walkingMinutes = Math.max(1, Math.round(s.distanceKm * 1.3 / 4 * 60));
    }
    try {
      await addSchoolInfos(complex.id, [{
        schoolName: s.schoolName,
        schoolType: s.schoolType === '초등학교' ? 'ELEMENTARY' : 'MIDDLE',
        walkingMinutes,
        achievementScore: s.achievementScore ?? undefined,
        schoolAddress: s.address || undefined,
        totalStudents: s.totalStudents ?? undefined,
        latitude: s.latitude,
        longitude: s.longitude,
      }] as any);
      await refreshComplex();
    } catch { /* 저장 실패 무시 */ }
    finally { setAddingDbSchoolId(null); }
  };

  // 기존 항목 수정 폼 열기 — 해당 학교 데이터로 편집 상태 초기화
  const startEditSchool = (s: SchoolInfo) => {
    setEditingSchool({
      schoolId: s.id,
      schoolName: s.schoolName ?? '',
      schoolAddress: s.schoolAddress ?? '',
      schoolType: (s.schoolType as 'ELEMENTARY' | 'MIDDLE') ?? 'ELEMENTARY',
      walkingMinutes: s.walkingMinutes != null ? String(s.walkingMinutes) : '',
      achievementScore: s.achievementScore != null ? String(s.achievementScore) : '',
      totalStudents: s.totalStudents != null ? String(s.totalStudents) : '',
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
      fetching: false, searchResults: [], showDropdown: false, saving: false,
    });
  };

  // 수정 폼 학교명 검색 — 결과 1건이면 자동 선택, 시퀀스로 stale 결과 폐기
  const handleSchoolSearch = async () => {
    if (!editingSchool) return;
    const query = editingSchool.schoolName.trim();
    if (!query) return;
    const seq = editSchoolSearchSeq.current + 1;
    editSchoolSearchSeq.current = seq;
    setEditingSchool(prev => prev ? { ...prev, fetching: true, showDropdown: false } : null);
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', { params: { query } });
      if (editSchoolSearchSeq.current !== seq) return;
      if (data.items.length === 1) { await handleSchoolSelect(data.items[0]); return; }
      setEditingSchool(prev => prev ? { ...prev, fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 } : null);
    } catch {
      if (editSchoolSearchSeq.current === seq) setEditingSchool(prev => prev ? { ...prev, fetching: false } : null);
    }
  };

  // 수정 폼 드롭다운 항목 선택 — 주소·좌표 자동 입력 + 도보거리 계산
  const handleSchoolSelect = async (item: SearchItem) => {
    if (!editingSchool || !complex) return;
    editSchoolSearchSeq.current = -1;  // 진행 중인 검색 결과 무시
    const addr = item.roadAddress || item.address;
    const lat = parseInt(item.mapy) / 10000000;
    const lng = parseInt(item.mapx) / 10000000;
    setEditingSchool(prev => prev ? {
      ...prev, schoolName: stripHtml(item.title), schoolAddress: addr,
      latitude: lat, longitude: lng, showDropdown: false, searchResults: [], fetching: true,
    } : null);
    try {
      const { data: dir } = await api.get<{ minutes: number }>('/api/directions/walking', {
        params: { startLat: complex.latitude, startLng: complex.longitude, goalLat: lat, goalLng: lng },
      });
      setEditingSchool(prev => prev ? { ...prev, walkingMinutes: String(dir.minutes), fetching: false } : null);
    } catch {
      const km = haversineKm(complex.latitude!, complex.longitude!, lat, lng);
      setEditingSchool(prev => prev ? { ...prev, walkingMinutes: String(Math.max(1, Math.round(km * 1.3 / 4 * 60))), fetching: false } : null);
    }
  };

  // 기존 항목 수정 저장 — PATCH 후 refreshComplex 호출
  const saveEditingSchool = async () => {
    if (!editingSchool || !complex) return;
    setEditingSchool(prev => prev ? { ...prev, saving: true } : null);
    const payload = {
      schoolName: editingSchool.schoolName || undefined,
      schoolType: editingSchool.schoolType,
      walkingMinutes: editingSchool.walkingMinutes ? parseInt(editingSchool.walkingMinutes) : undefined,
      achievementScore: editingSchool.achievementScore ? parseFloat(editingSchool.achievementScore) : undefined,
      schoolAddress: editingSchool.schoolAddress || undefined,
      totalStudents: editingSchool.totalStudents ? parseInt(editingSchool.totalStudents) : undefined,
      latitude: editingSchool.latitude ?? undefined,
      longitude: editingSchool.longitude ?? undefined,
    };
    try {
      await updateSchoolInfo(complex.id, editingSchool.schoolId, payload as any);
      setEditingSchool(null);
      await refreshComplex();
    } catch {
      setEditingSchool(prev => prev ? { ...prev, saving: false } : null);
    }
  };

  // 학교 삭제 — DELETE 후 refreshComplex 호출
  const handleDeleteSchool = async (schoolId: number) => {
    if (!complex) return;
    try {
      await deleteSchoolInfo(complex.id, schoolId);
      await refreshComplex();
    } catch { /* 삭제 실패 시 UI 변화 없음 */ }
  };

  // 신규 추가 행 하나 추가 — 빈 상태로 생성 후 배열 끝에 삽입
  const startAddInfra = () => {
    const localId = ++infraRowCounter.current;
    setNewInfraRows(prev => [...prev, {
      localId,
      infraType: 'DEPARTMENT_STORE',
      infraName: '', infraAddress: '',
      distance: '',
      latitude: null, longitude: null,
      fetching: false, searchResults: [], showDropdown: false,
    }]);
    // 환경 섹션으로 스크롤 — DOM 렌더 후 실행되도록 딜레이
    setTimeout(() => infraSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  // 추가 행 제거
  const removeNewInfraRow = (localId: number) => {
    setNewInfraRows(prev => prev.filter(r => r.localId !== localId));
  };

  // 추가 행 필드 업데이트
  const updateNewInfraRow = (localId: number, update: Partial<InfraAddRow>) => {
    setNewInfraRows(prev => prev.map(r => r.localId === localId ? { ...r, ...update } : r));
  };

  // 추가 행 인프라 검색 — 결과 1건이면 자동 선택, 시퀀스로 stale 결과 폐기
  const handleNewInfraSearch = async (localId: number) => {
    const row = newInfraRows.find(r => r.localId === localId);
    if (!row || !row.infraName.trim()) return;
    const seq = (newInfraSearchSeq.current.get(localId) ?? 0) + 1;
    newInfraSearchSeq.current.set(localId, seq);
    updateNewInfraRow(localId, { fetching: true, showDropdown: false });
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', { params: { query: row.infraName.trim() } });
      if (newInfraSearchSeq.current.get(localId) !== seq) return;
      if (data.items.length === 1) { await handleNewInfraSelect(localId, data.items[0]); return; }
      updateNewInfraRow(localId, { fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 });
    } catch {
      if (newInfraSearchSeq.current.get(localId) === seq) updateNewInfraRow(localId, { fetching: false });
    }
  };

  // 추가 행 검색 결과 선택 — 주소·좌표 자동 입력 후 도보 거리 계산
  const handleNewInfraSelect = async (localId: number, item: SearchItem) => {
    if (!complex) return;
    newInfraSearchSeq.current.set(localId, -1);  // 진행 중인 검색 결과 무시
    const addr = item.roadAddress || item.address;
    const lat = parseInt(item.mapy) / 10000000;
    const lng = parseInt(item.mapx) / 10000000;
    updateNewInfraRow(localId, {
      infraName: stripHtml(item.title), infraAddress: addr,
      latitude: lat, longitude: lng, showDropdown: false, searchResults: [], fetching: true,
    });
    try {
      const { data: dir } = await api.get<{ minutes: number }>('/api/directions/walking', {
        params: { startLat: complex.latitude, startLng: complex.longitude, goalLat: lat, goalLng: lng },
      });
      updateNewInfraRow(localId, { distance: String(dir.minutes), fetching: false });
    } catch {
      const km = haversineKm(complex.latitude!, complex.longitude!, lat, lng);
      updateNewInfraRow(localId, { distance: String(Math.max(1, Math.round(km * 1.3 / 4 * 60))), fetching: false });
    }
  };

  // 신규 추가 행 전체 일괄 저장
  const saveNewInfras = async () => {
    if (!complex || newInfraRows.length === 0) return;
    setSavingNewInfras(true);
    const items = newInfraRows
      .filter(r => r.infraName.trim())
      .map(r => ({
        infraName: r.infraName || undefined,
        infraType: r.infraType,
        distance: r.distance ? parseInt(r.distance) : undefined,
        infraAddress: r.infraAddress || undefined,
        latitude: r.latitude ?? undefined,
        longitude: r.longitude ?? undefined,
      }));
    try {
      await addInfraInfos(complex.id, items as any);
      setNewInfraRows([]);
      await refreshComplex();
    } catch {
      /* 저장 실패해도 입력 폼 유지 */
    } finally {
      setSavingNewInfras(false);
    }
  };

  // 기존 항목 수정 폼 열기
  const startEditInfra = (inf: InfraInfo) => {
    setEditingInfra({
      infraId: inf.id,
      infraType: inf.infraType ?? 'DEPARTMENT_STORE',
      infraName: inf.infraName ?? '',
      infraAddress: inf.infraAddress ?? '',
      distance: inf.distance != null ? String(inf.distance) : '',
      latitude: inf.latitude ?? null,
      longitude: inf.longitude ?? null,
      fetching: false, searchResults: [], showDropdown: false, saving: false,
    });
  };

  // 수정 폼 인프라명 검색
  const handleInfraSearch = async () => {
    if (!editingInfra) return;
    const query = editingInfra.infraName.trim();
    if (!query) return;
    const seq = editInfraSearchSeq.current + 1;
    editInfraSearchSeq.current = seq;
    setEditingInfra(prev => prev ? { ...prev, fetching: true, showDropdown: false } : null);
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', { params: { query } });
      if (editInfraSearchSeq.current !== seq) return;
      if (data.items.length === 1) { await handleInfraSelect(data.items[0]); return; }
      setEditingInfra(prev => prev ? { ...prev, fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 } : null);
    } catch {
      if (editInfraSearchSeq.current === seq) setEditingInfra(prev => prev ? { ...prev, fetching: false } : null);
    }
  };

  // 수정 폼 드롭다운 항목 선택
  const handleInfraSelect = async (item: SearchItem) => {
    if (!editingInfra || !complex) return;
    editInfraSearchSeq.current = -1;  // 진행 중인 검색 결과 무시
    const addr = item.roadAddress || item.address;
    const lat = parseInt(item.mapy) / 10000000;
    const lng = parseInt(item.mapx) / 10000000;
    setEditingInfra(prev => prev ? {
      ...prev, infraName: stripHtml(item.title), infraAddress: addr,
      latitude: lat, longitude: lng, showDropdown: false, searchResults: [], fetching: true,
    } : null);
    try {
      const { data: dir } = await api.get<{ minutes: number }>('/api/directions/walking', {
        params: { startLat: complex.latitude, startLng: complex.longitude, goalLat: lat, goalLng: lng },
      });
      setEditingInfra(prev => prev ? { ...prev, distance: String(dir.minutes), fetching: false } : null);
    } catch {
      const km = haversineKm(complex.latitude!, complex.longitude!, lat, lng);
      setEditingInfra(prev => prev ? { ...prev, distance: String(Math.max(1, Math.round(km * 1.3 / 4 * 60))), fetching: false } : null);
    }
  };

  // 기존 항목 수정 저장
  const saveEditingInfra = async () => {
    if (!editingInfra || !complex) return;
    setEditingInfra(prev => prev ? { ...prev, saving: true } : null);
    const payload = {
      infraName: editingInfra.infraName || undefined,
      infraType: editingInfra.infraType,
      distance: editingInfra.distance ? parseInt(editingInfra.distance) : undefined,
      infraAddress: editingInfra.infraAddress || undefined,
      latitude: editingInfra.latitude ?? undefined,
      longitude: editingInfra.longitude ?? undefined,
    };
    try {
      await updateInfraInfo(complex.id, editingInfra.infraId, payload as any);
      setEditingInfra(null);
      await refreshComplex();
    } catch {
      setEditingInfra(prev => prev ? { ...prev, saving: false } : null);
    }
  };

  // 인프라 삭제
  const handleDeleteInfra = async (infraId: number) => {
    if (!complex) return;
    try {
      await deleteInfraInfo(complex.id, infraId);
      await refreshComplex();
    } catch { /* 삭제 실패 시 UI 변화 없음 */ }
  };

  // ── 유해시설 편집 ────────────────────────────────────────────────

  // 단지 변경 시: 추가 행 초기화 + 유해시설 없으면 11개 JSON 자동 조회
  useEffect(() => {
    setNewHazardRows([]);
    setEditingHazard(null);
    if (!complex?.id || !complex.latitude || !complex.longitude) return;
    if ((complex.hazardInfos ?? []).length > 0) return;

    const lat = complex.latitude;
    const lng = complex.longitude;
    const files = [
      'waste-facilities', 'chemical-facilities', 'correctional-facilities',
      'animal-shelters', 'funeral-homes', 'cemeteries', 'columbarium-facilities',
      'crematoriums', 'natural-burial-sites', 'energy-storage-bases',
      'construction-material-factories',
    ];

    setLoadingHazardSuggestions(true);
    let cnt = hazardRowCounter.current;
    Promise.allSettled(
      files.map(f => fetch(`/data/${f}.json`).then(r => r.json()))
    ).then(results => {
      type FItem = { name: string; type?: string; category?: string; roadAddress?: string; address?: string; lat: number; lng: number };
      const nearby: HazardAddRow[] = [];
      results.forEach(res => {
        if (res.status !== 'fulfilled') return;
        (res.value as FItem[]).forEach(f => {
          if (haversineKm(lat, lng, f.lat, f.lng) <= 1 && !f.name.includes('동물병원')) {
            nearby.push({
              localId: ++cnt,
              hazardName: f.name,
              hazardAddress: f.roadAddress ?? f.address ?? '',
              distance: String(Math.round(haversineKm(lat, lng, f.lat, f.lng) * 1000)),
              latitude: f.lat,
              longitude: f.lng,
              fetching: false,
              searchResults: [],
              showDropdown: false,
              macroCategory: FACILITY_MACRO_CATEGORY[f.type ?? ''] ?? '',
              subCategory: getSimplifiedCategory(f.type ?? '', f.category),
            });
          }
        });
      });
      hazardRowCounter.current = cnt;
      setNewHazardRows(nearby);
    }).finally(() => setLoadingHazardSuggestions(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complex?.id]);

  // 인프라 자동탐지 — 저장된 인프라 없을 때 카카오 API로 주변 마트/병원/백화점 조회
  useEffect(() => {
    setNewInfraRows([]);
    if (!complex?.id || !complex.latitude || !complex.longitude) return;
    if ((complex.infraInfos ?? []).length > 0) return;

    const lat = complex.latitude;
    const lng = complex.longitude;
    const region = complex.region || '';

    setLoadingInfraSuggestions(true);
    let cnt = infraRowCounter.current;
    const TYPE_MAP: Record<number, string> = { 0: 'MART', 1: 'HOSPITAL', 2: 'DEPARTMENT_STORE' };
    Promise.allSettled([
      searchNearby(lat, lng, 'MART', 2000, region || undefined),
      searchNearby(lat, lng, 'HOSPITAL'),
      searchNearby(lat, lng, 'DEPARTMENT_STORE', 2000, region || undefined),
    ]).then(results => {
      const rows: InfraAddRow[] = [];
      results.forEach((result, idx) => {
        if (result.status !== 'fulfilled') return;
        result.value.forEach(place => {
          rows.push({
            localId: ++cnt,
            infraType: TYPE_MAP[idx],
            infraName: place.name,
            infraAddress: place.address,
            distance: String(Math.max(1, Math.round(place.distanceM / 67))),
            latitude: place.lat,
            longitude: place.lng,
            fetching: false,
            searchResults: [],
            showDropdown: false,
          });
        });
      });
      infraRowCounter.current = cnt;
      setNewInfraRows(rows);
    }).finally(() => setLoadingInfraSuggestions(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complex?.id]);

  const startAddHazard = () => {
    const localId = ++hazardRowCounter.current;
    setNewHazardRows(prev => [...prev, {
      localId, hazardName: '', hazardAddress: '', distance: '',
      latitude: null, longitude: null, fetching: false, searchResults: [], showDropdown: false,
    }]);
    setTimeout(() => hazardSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const removeNewHazardRow = (localId: number) =>
    setNewHazardRows(prev => prev.filter(r => r.localId !== localId));

  const updateNewHazardRow = (localId: number, update: Partial<HazardAddRow>) =>
    setNewHazardRows(prev => prev.map(r => r.localId === localId ? { ...r, ...update } : r));

  const handleNewHazardSearch = async (localId: number) => {
    const row = newHazardRows.find(r => r.localId === localId);
    if (!row || !row.hazardName.trim()) return;
    const seq = (newHazardSearchSeq.current.get(localId) ?? 0) + 1;
    newHazardSearchSeq.current.set(localId, seq);
    updateNewHazardRow(localId, { fetching: true, showDropdown: false });
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', { params: { query: row.hazardName.trim() } });
      if (newHazardSearchSeq.current.get(localId) !== seq) return;
      if (data.items.length === 1) { await handleNewHazardSelect(localId, data.items[0]); return; }
      updateNewHazardRow(localId, { fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 });
    } catch {
      if (newHazardSearchSeq.current.get(localId) === seq) updateNewHazardRow(localId, { fetching: false });
    }
  };

  const handleNewHazardSelect = async (localId: number, item: SearchItem) => {
    if (!complex) return;
    newHazardSearchSeq.current.set(localId, -1);
    const addr = item.roadAddress || item.address;
    const lat = parseInt(item.mapy) / 10000000;
    const lng = parseInt(item.mapx) / 10000000;
    const distanceM = Math.round(haversineKm(complex.latitude!, complex.longitude!, lat, lng) * 1000);
    updateNewHazardRow(localId, {
      hazardName: stripHtml(item.title), hazardAddress: addr,
      latitude: lat, longitude: lng, distance: String(distanceM),
      showDropdown: false, searchResults: [], fetching: false,
    });
  };

  const saveNewHazards = async () => {
    if (!complex || newHazardRows.length === 0) return;
    setSavingNewHazards(true);
    const items = newHazardRows
      .filter(r => r.hazardName.trim())
      .map(r => ({
        hazardName: r.hazardName || undefined,
        hazardAddress: r.hazardAddress || undefined,
        distance: r.distance ? parseInt(r.distance) : undefined,
        latitude: r.latitude ?? undefined,
        longitude: r.longitude ?? undefined,
        macroCategory: r.macroCategory || undefined,
        subCategory: r.subCategory || undefined,
      }));
    try {
      await addHazardInfos(complex.id, items as any);
      setNewHazardRows([]);
      await refreshComplex();
    } catch { /* 저장 실패 시 폼 유지 */ }
    finally { setSavingNewHazards(false); }
  };

  const startEditHazard = (h: { id: number; hazardName?: string; hazardAddress?: string; distance?: number; latitude?: number; longitude?: number }) => {
    setEditingHazard({
      hazardId: h.id,
      hazardName: h.hazardName ?? '',
      hazardAddress: h.hazardAddress ?? '',
      distance: h.distance != null ? String(h.distance) : '',
      latitude: h.latitude ?? null,
      longitude: h.longitude ?? null,
      fetching: false, searchResults: [], showDropdown: false, saving: false,
    });
  };

  const handleEditHazardSearch = async () => {
    if (!editingHazard) return;
    const query = editingHazard.hazardName.trim();
    if (!query) return;
    const seq = editHazardSearchSeq.current + 1;
    editHazardSearchSeq.current = seq;
    setEditingHazard(prev => prev ? { ...prev, fetching: true, showDropdown: false } : null);
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', { params: { query } });
      if (editHazardSearchSeq.current !== seq) return;
      if (data.items.length === 1) { await handleEditHazardSelect(data.items[0]); return; }
      setEditingHazard(prev => prev ? { ...prev, fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 } : null);
    } catch {
      if (editHazardSearchSeq.current === seq) setEditingHazard(prev => prev ? { ...prev, fetching: false } : null);
    }
  };

  const handleEditHazardSelect = async (item: SearchItem) => {
    if (!editingHazard || !complex) return;
    editHazardSearchSeq.current = -1;
    const addr = item.roadAddress || item.address;
    const lat = parseInt(item.mapy) / 10000000;
    const lng = parseInt(item.mapx) / 10000000;
    const distanceM = Math.round(haversineKm(complex.latitude!, complex.longitude!, lat, lng) * 1000);
    setEditingHazard(prev => prev ? {
      ...prev, hazardName: stripHtml(item.title), hazardAddress: addr,
      latitude: lat, longitude: lng, distance: String(distanceM),
      showDropdown: false, searchResults: [], fetching: false,
    } : null);
  };

  const saveEditingHazard = async () => {
    if (!editingHazard || !complex) return;
    setEditingHazard(prev => prev ? { ...prev, saving: true } : null);
    try {
      await updateHazardInfo(complex.id, editingHazard.hazardId, {
        hazardName: editingHazard.hazardName || undefined,
        hazardAddress: editingHazard.hazardAddress || undefined,
        distance: editingHazard.distance ? parseInt(editingHazard.distance) : undefined,
        latitude: editingHazard.latitude ?? undefined,
        longitude: editingHazard.longitude ?? undefined,
      } as any);
      setEditingHazard(null);
      await refreshComplex();
    } catch { setEditingHazard(prev => prev ? { ...prev, saving: false } : null); }
  };

  const handleDeleteHazard = async (hazardId: number) => {
    if (!complex) return;
    try {
      await deleteHazardInfo(complex.id, hazardId);
      await refreshComplex();
    } catch { /* 삭제 실패 시 UI 변화 없음 */ }
  };

  // ── 지하철 편집 ──────────────────────────────────────────────────

  // 편집 모드 시작 — 기존 subwayInfos를 행으로 복사, 빈 신규 행 1개 추가
  const startEditSubway = () => {
    const existing: SubwayEditRow[] = (complex?.subwayInfos ?? []).map(s => ({
      localId: `existing-${s.id}`,
      id: s.id,
      stationName: s.stationName ?? '',
      subwayLines: s.subwayLines ?? '',
      walkingMinutes: s.walkingMinutes != null ? String(s.walkingMinutes) : '',
      foundLines: [],
      fetching: false,
    }));
    setSubwayRows([...existing, { localId: `new-${Date.now()}`, stationName: '', subwayLines: '', walkingMinutes: '', foundLines: [], fetching: false }]);
    setDeletedSubwayIds([]);
    setEditingSubway(true);
  };

  const cancelEditSubway = () => {
    setEditingSubway(false);
    setSubwayRows([]);
    setDeletedSubwayIds([]);
  };

  const updateSubwayRow = (localId: string, patch: Partial<SubwayEditRow>) =>
    setSubwayRows(prev => prev.map(r => r.localId === localId ? { ...r, ...patch } : r));

  // 행 삭제 — 기존 항목이면 deletedSubwayIds에 추가 예약
  const removeSubwayRow = (localId: string) => {
    const row = subwayRows.find(r => r.localId === localId);
    if (row?.id) setDeletedSubwayIds(prev => [...prev, row.id!]);
    setSubwayRows(prev => prev.filter(r => r.localId !== localId));
  };

  const addSubwayRow = () =>
    setSubwayRows(prev => [...prev, { localId: `new-${Date.now()}`, stationName: '', subwayLines: '', walkingMinutes: '', foundLines: [], fetching: false }]);

  // 역 조회 — 네이버 장소 검색 → 지하철 카테고리 필터 → 호선·도보시간 자동 입력
  const lookupSubwayStation = async (localId: string) => {
    if (!complex) return;
    const row = subwayRows.find(r => r.localId === localId);
    if (!row || !row.stationName.trim()) return;
    const query = row.stationName.trim().endsWith('역') ? row.stationName.trim() : `${row.stationName.trim()}역`;
    updateSubwayRow(localId, { fetching: true });
    try {
      const { data } = await api.get<{ items: { title: string; category: string; mapx: string; mapy: string }[] }>(
        '/api/search/local', { params: { query } }
      );
      const stationItems = data.items.filter(it => isStation(it.category));
      const lineSet = new Set(stationItems.map(it => parseLineFromCategory(it.category)).filter(Boolean));
      const foundLines = Array.from(lineSet);
      const first = stationItems[0] ?? data.items[0];
      const stLat = first ? parseInt(first.mapy) / 10000000 : null;
      const stLng = first ? parseInt(first.mapx) / 10000000 : null;

      let walkingMinutes = row.walkingMinutes;
      if (stLat && stLng) {
        try {
          const { data: dir } = await api.get<{ minutes: number }>('/api/directions/walking', {
            params: { startLat: complex.latitude, startLng: complex.longitude, goalLat: stLat, goalLng: stLng },
          });
          walkingMinutes = String(dir.minutes);
        } catch {
          const km = haversineKm(complex.latitude!, complex.longitude!, stLat, stLng);
          walkingMinutes = String(Math.max(1, Math.round(km * 1.3 / 4 * 60)));
        }
      }
      updateSubwayRow(localId, {
        foundLines,
        subwayLines: foundLines.length === 1 ? foundLines[0] : '',
        walkingMinutes,
        fetching: false,
      });
    } catch {
      updateSubwayRow(localId, { fetching: false });
    }
  };

  // 저장 — DELETE(삭제예약) → PATCH(기존 수정) → POST(신규 추가) → 재조회
  const saveSubway = async () => {
    if (!complex) return;
    setSavingSubway(true);
    try {
      await Promise.all(deletedSubwayIds.map(id => deleteSubwayInfo(complex.id, id)));
      const toUpdate = subwayRows.filter(r => r.id && r.stationName.trim());
      await Promise.all(toUpdate.map(r =>
        updateSubwayInfo(complex.id, r.id!, {
          stationName: r.stationName,
          subwayLines: r.subwayLines || undefined,
          walkingMinutes: r.walkingMinutes ? parseInt(r.walkingMinutes) : undefined,
        } as Omit<SubwayInfo, 'id'>)
      ));
      const toAdd = subwayRows.filter(r => !r.id && r.stationName.trim()).map(r => ({
        stationName: r.stationName,
        subwayLines: r.subwayLines || undefined,
        walkingMinutes: r.walkingMinutes ? parseInt(r.walkingMinutes) : undefined,
      }));
      if (toAdd.length > 0) await addSubwayInfos(complex.id, toAdd as Omit<SubwayInfo, 'id'>[]);
      setEditingSubway(false);
      setSubwayRows([]);
      setDeletedSubwayIds([]);
      await refreshComplex();
    } catch {
      /* 저장 실패 시 폼 유지 */
    } finally {
      setSavingSubway(false);
    }
  };

  // 출퇴근 시간 편집 시작 — 기존 데이터로 5개 행 초기화
  const startEditCommute = () => {
    const fixedRows: CommuteEditRow[] = COMMUTE_DESTINATIONS.map(dest => {
      const existing = complex?.commuteTimes?.find(ct => ct.destination === dest);
      const transferLines = existing?.transferLines
        ? existing.transferLines.split(' ➡️ ').filter(Boolean)
        : (existing?.transferCount != null
            ? Array(existing.transferCount + 1).fill('')
            : ['']);
      const destCoordEntry = DESTINATION_COORDS[dest];
      const distanceKm = existing?.distanceKm
        ?? (destCoordEntry && complex?.latitude && complex?.longitude
            ? parseFloat(haversineKm(complex.latitude, complex.longitude, destCoordEntry.lat, destCoordEntry.lng).toFixed(2))
            : undefined);
      return {
        destination: dest,
        minutes: existing?.minutes != null ? String(existing.minutes) : '',
        transportType: existing?.transportType || '지하철',
        transferCount: existing?.transferCount != null ? String(existing.transferCount) : '0',
        transferLines,
        distanceKm,
      };
    });
    // 5개 고정 목적지 외 커스텀 목적지 로드 (기존 저장된 것)
    const customRows: CommuteEditRow[] = (complex?.commuteTimes ?? [])
      .filter(ct => !COMMUTE_DESTINATIONS.includes(ct.destination))
      .map(ct => {
        const transferLines = ct.transferLines
          ? ct.transferLines.split(' ➡️ ').filter(Boolean)
          : (ct.transferCount != null ? Array(ct.transferCount + 1).fill('') : ['']);
        return {
          destination: ct.destination,
          minutes: ct.minutes != null ? String(ct.minutes) : '',
          transportType: ct.transportType || '지하철',
          transferCount: ct.transferCount != null ? String(ct.transferCount) : '0',
          transferLines,
          distanceKm: ct.distanceKm,
          isCustom: true,
          localKey: ++customCommuteKeyRef.current,
          searchQuery: ct.destination,
        };
      });
    setCommuteRows([...fixedRows, ...customRows]);
    setEditingCommute(true);
  };

  const cancelEditCommute = () => {
    setEditingCommute(false);
    setCommuteRows([]);
  };

  // 환승 횟수 변경 시 transferLines 배열 크기를 동기화 (최대 4회 제한)
  const handleCommuteTransferCountChange = (i: number, val: string) => {
    const count = val === '' ? 0 : parseInt(val);
    if (!isNaN(count) && count > 4) {
      alert('환승 횟수는 최대 4회까지 입력할 수 있습니다.');
      return;
    }
    // 환승 N회 = 탑승 노선 N+1개 (환승 없으면 1칸, 환승 1회면 2칸, ...)
    const lines = Array(count + 1).fill('');
    setCommuteRows(prev => prev.map((r, idx) => idx === i ? { ...r, transferCount: val, transferLines: lines } : r));
  };

  const saveCommute = async () => {
    if (!complex) return;
    setSavingCommute(true);
    try {
      // 분 입력이 있는 행만 전송, 없는 행은 제외 (삭제 처리)
      const items = commuteRows
        .filter(r => r.minutes.trim())
        .map(r => ({
          destination: r.destination,
          minutes: parseInt(r.minutes),
          transportType: r.transportType || undefined,
          transferCount: r.transferCount.trim() ? parseInt(r.transferCount) : undefined,
          // 노선명이 하나라도 있으면 ' ➡️ '로 연결, 없으면 undefined (DB에 저장 안 함)
          transferLines: r.transferLines.filter(l => l.trim()).join(' ➡️ ') || undefined,
          distanceKm: r.distanceKm,
        }));
      await updateCommuteTimes(complex.id, items);
      setEditingCommute(false);
      setCommuteRows([]);
      await refreshComplex();
    } catch {
      /* 저장 실패 시 폼 유지 */
    } finally {
      setSavingCommute(false);
    }
  };

  // 커스텀 목적지 추가
  const addCustomCommuteRow = () => {
    setCommuteRows(prev => [...prev, {
      destination: '',
      minutes: '',
      transportType: '지하철',
      transferCount: '0',
      transferLines: [''],
      isCustom: true,
      localKey: ++customCommuteKeyRef.current,
      searchQuery: '',
      searchResults: [],
      showSearchDropdown: false,
      isSearching: false,
    }]);
  };

  // 커스텀 목적지 역 검색
  const searchCustomDestination = async (i: number) => {
    const row = commuteRows[i];
    if (!row.searchQuery?.trim()) return;
    setCommuteRows(prev => prev.map((r, idx) => idx === i ? { ...r, isSearching: true, showSearchDropdown: false } : r));
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', {
        params: { query: row.searchQuery!.trim() + ' 역' },
      });
      setCommuteRows(prev => prev.map((r, idx) =>
        idx === i ? { ...r, isSearching: false, searchResults: data.items, showSearchDropdown: data.items.length > 0 } : r
      ));
    } catch {
      setCommuteRows(prev => prev.map((r, idx) => idx === i ? { ...r, isSearching: false } : r));
    }
  };

  // 커스텀 목적지 검색 결과 선택
  const selectCustomDestination = (i: number, item: SearchItem) => {
    const lat = parseFloat(item.mapy) / 1e7;
    const lng = parseFloat(item.mapx) / 1e7;
    const label = stripHtml(item.title);
    const distanceKm = complex?.latitude && complex?.longitude
      ? parseFloat(haversineKm(complex.latitude, complex.longitude, lat, lng).toFixed(2))
      : undefined;
    setCommuteRows(prev => prev.map((r, idx) =>
      idx === i ? {
        ...r,
        destination: label,
        destLat: lat,
        destLng: lng,
        destLabel: label,
        distanceKm,
        showSearchDropdown: false,
        searchResults: [],
      } : r
    ));
  };

  // 커스텀 목적지 행 삭제
  const removeCustomCommuteRow = (i: number) => {
    setCommuteRows(prev => prev.filter((_, idx) => idx !== i));
  };

  if (!complex) {
    return (
      <div
        style={{
          width: '360px',
          height: '100%',
          backgroundColor: '#fff',
          borderLeft: '1px solid #e8eaed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '12px',
          color: '#9e9e9e',
          fontSize: '14px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '40px' }}>🏢</div>
        <p>지도에서 단지 마커를 클릭하면<br />상세 정보가 표시됩니다</p>
      </div>
    );
  }

  const latestHistory = priceHistories.length > 0 ? priceHistories[priceHistories.length - 1] : null;
  const firstHistory = priceHistories.length > 1 ? priceHistories[0] : null;

  // areaType 문자열에서 숫자 추출 ("전용 84" → 84)
  const areaTypeNum = (at: string) => parseFloat(at.replace(/[^0-9.]/g, '')) || 0;

  // 가장 큰 areaType 번호에 해당하는 priceRange 선택 (헤더 금액대 표시용)
  const topPriceRange = (() => {
    const entries = Object.entries(complex.areaTypePriceRanges ?? {});
    if (entries.length === 0) return complex.priceRange;
    return entries.sort((a, b) => areaTypeNum(b[0]) - areaTypeNum(a[0]))[0][1];
  })();

  // 현재 선택된 탭의 최신 시세 아이템 (전체 히스토리 기반)
  const selectedRefItem = latestItemPerAreaType.get(selectedRefTab)
    ?? (latestHistory?.items[0] ?? null);

  // 전체 히스토리에서 수집한 areaType 탭 목록 (숫자 오름차순 정렬)
  const refTabList = Array.from(latestItemPerAreaType.keys())
    .sort((a, b) => (parseFloat(a.replace(/[^0-9.]/g, '')) || 0) - (parseFloat(b.replace(/[^0-9.]/g, '')) || 0));

  // 차트에 표시되는 평형 목록 (선택박스 옵션 생성용, 중복 제거)
  const seen = new Set<string>();
  const areaTypes: string[] = [];
  chartData.series.forEach(s => {
    if (!seen.has(s.areaType)) { seen.add(s.areaType); areaTypes.push(s.areaType); }
  });

  // 특정 평형 선택 시에만 변동폭 계산 — 전체(selectedAreaType='')일 때는 null로 숨김
  const getPriceForType = (history: typeof latestHistory) => {
    if (!history || !selectedAreaType) return undefined;
    return history.items.find(i => i.areaType === selectedAreaType)?.price;
  };
  const latestPrice = getPriceForType(latestHistory);
  const firstPrice = getPriceForType(firstHistory);
  const priceChange = latestPrice != null && firstPrice != null ? latestPrice - firstPrice : null;

  // 셀렉트박스 선택에 따라 해당 평형의 매매+전세 시리즈만 필터링 (세트로 묶임)
  const filteredSeries = selectedAreaType
    ? chartData.series.filter(s => s.areaType === selectedAreaType)
    : chartData.series;

  return (
    <div
      style={{
        width: isMobile ? '100%' : '360px',
        height: '100%',
        backgroundColor: '#fff',
        borderLeft: isMobile ? 'none' : '1px solid #e8eaed',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #b8e0f5',
          backgroundColor: '#89CFF0',
          color: '#1a3a5c',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{topPriceRange} | {complex.region}</span>
              {/* 도보 30분 반경 원 토글 버튼 */}
              <button
                onClick={() => {
                  const next = !showRadius;
                  setShowRadius(next);
                  if (next && complex?.latitude && complex?.longitude) {
                    onRadiusToggle?.({ lat: complex.latitude, lng: complex.longitude });
                  } else {
                    onRadiusToggle?.(null);
                  }
                }}
                title="도보 30분 반경 표시"
                style={{
                  border: '1px solid',
                  borderColor: showRadius ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                  background: showRadius ? 'rgba(255,255,255,0.25)' : 'transparent',
                  cursor: 'pointer', lineHeight: 1,
                  padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
                  color: showRadius ? '#fff' : 'rgba(255,255,255,0.6)',
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}
              >반경</button>
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.3, display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              {complex.complexName}
              <span style={{ fontSize: '11px', fontWeight: 400, color: 'rgba(255,255,255,0.55)', userSelect: 'all' }}>#{complex.id}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              color: '#fff',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* 평형별 가격 표시 — latestItemPerAreaType으로 전체 히스토리에서 areaType별 최신값 수집
               평형별 별도 등록(여러 PriceHistory)이어도 모든 평형이 표시됨 */}
          {(() => {
            const priceItems = Array.from(latestItemPerAreaType.entries())
              .filter(([, item]) => item.price)
              .sort(([a], [b]) => areaTypeNum(a) - areaTypeNum(b));
            if (priceItems.length > 0) {
              return (
                <div style={{ fontSize: '15px', fontWeight: 700, display: 'flex', flexWrap: 'wrap', gap: '2px', flex: 1 }}>
                  {priceItems.map(([at, item], idx) => (
                    <span key={at} style={{ whiteSpace: 'nowrap' }}>
                      {idx > 0 && <span style={{ opacity: 0.5, margin: '0 3px' }}>|</span>}
                      {formatPrice(item.price!)}
                      <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8, marginLeft: '2px' }}>
                        ({at})
                      </span>
                    </span>
                  ))}
                </div>
              );
            }
            if (complex.price) {
              return (
                <div style={{ fontSize: '15px', fontWeight: 700, flex: 1 }}>
                  <span style={{ fontSize: '20px' }}>{formatPrice(complex.price)}</span>
                </div>
              );
            }
            return null;
          })()}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* 즐겨찾기 버튼 — 노란별(활성)/회색별(비활성), 낙관적 업데이트 */}
            <button
              onClick={handleToggleFavorite}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: 0, color: isFavorite ? '#FFD97D' : 'rgba(255,255,255,0.4)', flexShrink: 0 }}
            >★</button>
            {/* 사진 보기 버튼 — 가격 없는 단지(임장용 등)도 항상 표시 */}
            <button
              onClick={() => setShowPhotoModal(true)}
              title="사진 보기"
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0, color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}
            >📷</button>
          </div>
        </div>
      </div>

      {/* 본문 스크롤 영역 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {successMsg && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: '12px',
              backgroundColor: '#e6f4ea',
              borderRadius: '6px',
              color: '#137333',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {successMsg}
          </div>
        )}

        {/* 기본 정보 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: 0 }}>단지 정보</h3>
            {!editingBasicInfo && (
              <button
                onClick={startEditBasicInfo}
                style={{ border: '1px solid #34a853', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#188038', padding: '2px 8px', borderRadius: '6px', marginLeft: 'auto' }}
                title="연식·세대수 수정"
              >수정</button>
            )}
          </div>
          {editingBasicInfo ? (
            <div style={{ marginBottom: '8px' }}>
              {[
                { label: '연식', key: 'builtYear', type: 'text', placeholder: '예: 2023' },
                { label: '세대수', key: 'unitCount', type: 'number', placeholder: '예: 2990' },
                { label: '용적률(%)', key: 'floorAreaRatio', type: 'number', placeholder: '예: 250' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>{label}</span>
                  <input type={type} placeholder={placeholder}
                    value={(basicInfoForm as any)[key]}
                    onChange={e => setBasicInfoForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ ...editInputStyle, flex: 1 }} />
                </div>
              ))}
              {[
                { label: '경사도', key: 'slopeType', options: [['', '선택 안함'], ['FLAT', '평지'], ['GENTLE', '완경사'], ['MODERATE', '중경사'], ['STEEP', '급경사']] },
                { label: '아파트구조', key: 'buildingStructure', options: [['', '선택 안함'], ['STAIRCASE', '계단식'], ['CORRIDOR', '복도식'], ['MIXED', '혼합식']] },
              ].map(({ label, key, options }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>{label}</span>
                  <select value={(basicInfoForm as any)[key]}
                    onChange={e => setBasicInfoForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ ...editInputStyle, flex: 1 }}>
                    {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={saveBasicInfo} disabled={basicInfoSaving}
                  style={{ flex: 1, padding: '6px 0', backgroundColor: '#89CFF0', color: '#1a3a5c', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: basicInfoSaving ? 'not-allowed' : 'pointer', opacity: basicInfoSaving ? 0.7 : 1 }}>
                  {basicInfoSaving ? '저장 중...' : '저장'}
                </button>
                <button onClick={() => setEditingBasicInfo(false)} disabled={basicInfoSaving}
                  style={{ flex: 1, padding: '6px 0', backgroundColor: '#f1f3f4', color: '#5f6368', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  취소
                </button>
              </div>
            </div>
          ) : (
            <>
              <InfoRow label="연식" value={complex.builtYear} />
              <InfoRow label="세대수" value={complex.unitCount ? `${complex.unitCount}세대` : null} />
              <InfoRow label="경사도" value={
                complex.slopeType ? { FLAT: '평지', GENTLE: '완경사', MODERATE: '중경사', STEEP: '급경사' }[complex.slopeType] ?? null : null
              } />
              <InfoRow label="아파트구조" value={
                complex.buildingStructure ? { STAIRCASE: '계단식', CORRIDOR: '복도식', MIXED: '혼합식' }[complex.buildingStructure] ?? null : null
              } />
              <InfoRow label="용적률" value={complex.floorAreaRatio != null ? `${complex.floorAreaRatio}%` : null} />
            </>
          )}
          <InfoRow label="주소" value={complex.address} />
          <InfoRow label="확인일자" value={complex.checkDate} />
          {/* 평형 탭 + 수정·추가 버튼 — 항상 표시 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 0 4px', borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
            {refTabList.map(at => (
              <button
                key={at}
                onClick={() => { setSelectedRefTab(at); setEditingRefPrice(false); }}
                style={{
                  padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                  cursor: 'pointer', border: 'none',
                  backgroundColor: selectedRefTab === at ? '#89CFF0' : '#f1f3f4',
                  color: selectedRefTab === at ? '#fff' : '#5f6368',
                }}
              >
                {at}
              </button>
            ))}
            {/* + 평형 추가 버튼 */}
            {!editingRefPrice && (
              <button
                onClick={() => {
                  setSelectedRefTab(''); // 탭 선택 해제 → saveRefPrice에서 POST 경로로 진입
                  setRefPriceForm({ areaType: '', priceUk: '', jeonseUk: '', kbPriceUk: '', askingPriceUk: '', highestPriceUk: '', lowestPriceUk: '', tenYearAmountStr: '', tenYearRateStr: '' });
                  setEditingRefPrice(true);
                }}
                style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: '1px dashed #1a73e8', backgroundColor: 'transparent', color: '#4BAAD4' }}
                title="평형 추가"
              >+ 평형</button>
            )}
            {/* 수정·삭제 버튼 — 탭이 선택된 경우에만 */}
            {!editingRefPrice && selectedRefTab && (
              <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                <button
                  onClick={startEditRefPrice}
                  style={{ border: '1px solid #34a853', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#188038', padding: '2px 8px', borderRadius: '6px' }}
                  title="참고가 수정"
                >수정</button>
                <button
                  onClick={() => handleDeleteAreaType(selectedRefTab)}
                  disabled={deletingAreaType}
                  style={{ border: '1px solid #c5221f', background: 'none', cursor: deletingAreaType ? 'not-allowed' : 'pointer', fontSize: '11px', color: '#E06060', padding: '2px 8px', borderRadius: '6px', opacity: deletingAreaType ? 0.5 : 1 }}
                  title="이 평형 시세 기록 전체 삭제"
                >{deletingAreaType ? '...' : '삭제'}</button>
              </div>
            )}
          </div>
          {/* 참고가 — 편집 모드일 때는 인라인 폼, 아닐 때는 선택 탭 기준 읽기 전용 표시 */}
          {editingRefPrice ? (
            <div style={{ paddingTop: '8px' }}>
              {/* 평형 — 숫자만 입력 시 onBlur에서 "전용 N" 자동 보완 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>평형</span>
                <input
                  type="text"
                  placeholder="예: 전용 59"
                  value={refPriceForm.areaType}
                  onChange={e => setRefPriceForm(f => ({ ...f, areaType: e.target.value }))}
                  onBlur={() => {
                    const v = refPriceForm.areaType.trim();
                    if (/^\d+(\.\d+)?$/.test(v)) setRefPriceForm(f => ({ ...f, areaType: `전용 ${v}` }));
                  }}
                  style={{ ...editInputStyle, flex: 1 }}
                />
              </div>
              {/* 매매가 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>매매가</span>
                <input
                  type="number" step="0.01"
                  placeholder="억 단위"
                  value={refPriceForm.priceUk}
                  onChange={e => setRefPriceForm(f => ({ ...f, priceUk: e.target.value }))}
                  style={{ ...editInputStyle, flex: 1 }}
                />
              </div>
              {/* 전세가 + 전세율 자동 계산 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>전세가</span>
                <input
                  type="number" step="0.01"
                  placeholder="억 단위"
                  value={refPriceForm.jeonseUk}
                  onChange={e => setRefPriceForm(f => ({ ...f, jeonseUk: e.target.value }))}
                  style={{ ...editInputStyle, flex: 1 }}
                />
                <span style={{ fontSize: '11px', color: '#80868b', flexShrink: 0, minWidth: '36px', textAlign: 'right' }}>
                  {(() => {
                    const p = parseFloat(refPriceForm.priceUk);
                    const j = parseFloat(refPriceForm.jeonseUk);
                    return !isNaN(p) && !isNaN(j) && p > 0 ? (j / p * 100).toFixed(1) + '%' : '-';
                  })()}
                </span>
              </div>
              {/* KB시세 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>KB시세</span>
                <input
                  type="number" step="0.01"
                  placeholder="억 단위"
                  value={refPriceForm.kbPriceUk}
                  onChange={e => setRefPriceForm(f => ({ ...f, kbPriceUk: e.target.value }))}
                  style={{ ...editInputStyle, flex: 1 }}
                />
              </div>
              {/* 호가 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>호가</span>
                <input
                  type="number" step="0.01"
                  placeholder="억 단위"
                  value={refPriceForm.askingPriceUk}
                  onChange={e => setRefPriceForm(f => ({ ...f, askingPriceUk: e.target.value }))}
                  style={{ ...editInputStyle, flex: 1 }}
                />
              </div>
              {/* 전고점 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>전고점</span>
                <input
                  type="number" step="0.01"
                  placeholder="억 단위"
                  value={refPriceForm.highestPriceUk}
                  onChange={e => setRefPriceForm(f => ({ ...f, highestPriceUk: e.target.value }))}
                  style={{ ...editInputStyle, flex: 1 }}
                />
              </div>
              {/* 전저점 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>전저점</span>
                <input
                  type="number" step="0.01"
                  placeholder="억 단위"
                  value={refPriceForm.lowestPriceUk}
                  onChange={e => setRefPriceForm(f => ({ ...f, lowestPriceUk: e.target.value }))}
                  style={{ ...editInputStyle, flex: 1 }}
                />
              </div>
              {/* 10년 등락 — "전고점-전저점" 패턴 입력 시 onBlur에서 자동 계산 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>10년 등락</span>
                <input
                  type="text"
                  placeholder="A-B 또는 억 단위"
                  value={refPriceForm.tenYearAmountStr}
                  onChange={e => setRefPriceForm(f => ({ ...f, tenYearAmountStr: e.target.value }))}
                  onBlur={() => {
                    const { amount, rate } = calcTenYear(refPriceForm.tenYearAmountStr);
                    setRefPriceForm(f => ({ ...f, tenYearAmountStr: amount, tenYearRateStr: rate || f.tenYearRateStr }));
                  }}
                  style={{ ...editInputStyle, flex: 1 }}
                />
              </div>
              {/* 등락률 — 자동 계산 결과로만 채워지며 직접 수정 불가 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>등락률</span>
                <input
                  type="text"
                  placeholder="자동 계산"
                  value={refPriceForm.tenYearRateStr}
                  readOnly
                  style={{ ...editInputStyle, flex: 1, backgroundColor: '#f8f9fa', color: '#80868b', cursor: 'not-allowed' }}
                />
              </div>
              {/* 저장/취소 버튼 */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={saveRefPrice}
                  disabled={refPriceSaving}
                  style={{ flex: 1, padding: '6px 0', backgroundColor: '#89CFF0', color: '#1a3a5c', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: refPriceSaving ? 'not-allowed' : 'pointer', opacity: refPriceSaving ? 0.7 : 1 }}
                >
                  {refPriceSaving ? '저장 중...' : '저장'}
                </button>
                <button
                  onClick={() => setEditingRefPrice(false)}
                  disabled={refPriceSaving}
                  style={{ flex: 1, padding: '6px 0', backgroundColor: '#f1f3f4', color: '#5f6368', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <>
              <InfoRow label="매매가" value={selectedRefItem?.price ? formatPrice(selectedRefItem.price) : null} />
              <InfoRow label="전세가" value={selectedRefItem?.jeonsePrice ? formatPrice(selectedRefItem.jeonsePrice) : null} />
              <InfoRow label="전세율" value={selectedRefItem?.jeonseRate != null
                ? `${selectedRefItem.jeonseRate.toFixed(1)}%`
                : (selectedRefItem?.price && selectedRefItem?.jeonsePrice)
                  ? `${(selectedRefItem.jeonsePrice / selectedRefItem.price * 100).toFixed(1)}%`
                  : null} />
              <InfoRow label="KB시세" value={selectedRefItem?.kbPrice ? formatPrice(selectedRefItem.kbPrice) : null} />
              <InfoRow label="호가" value={selectedRefItem?.askingPrice ? formatPrice(selectedRefItem.askingPrice) : null} />
              <InfoRow label="전고점" value={selectedRefItem?.highestPrice ? formatPrice(selectedRefItem.highestPrice) : null} />
              {/* 전고점 대비 % — 전고점이 있고 비교할 가격이 하나라도 있을 때 표시 */}
              {selectedRefItem?.highestPrice && (selectedRefItem.price || selectedRefItem.kbPrice || selectedRefItem.askingPrice) && (() => {
                const h = selectedRefItem.highestPrice!;
                const lines = [
                  selectedRefItem.price && { label: '매매', v: selectedRefItem.price },
                  selectedRefItem.kbPrice && { label: 'KB', v: selectedRefItem.kbPrice },
                  selectedRefItem.askingPrice && { label: '호가', v: selectedRefItem.askingPrice },
                ].filter(Boolean) as { label: string; v: number }[];
                return (
                  <div
                    onClick={() => setShowPeakChart(true)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                    title="클릭하여 그래프 보기"
                  >
                    <span style={{ fontSize: '12px', color: '#80868b' }}>전고점 대비</span>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {lines.map(({ label, v }) => {
                        const pct = +((v - h) / h * 100).toFixed(1);
                        const color = pct >= 0 ? '#1565c0' : '#c62828';
                        return (
                          <span key={label} style={{ fontSize: '12px', color, fontWeight: 600 }}>
                            {label} {pct >= 0 ? '▲' : '▼'}{Math.abs(pct)}%
                          </span>
                        );
                      })}
                      <span style={{ fontSize: '12px', color: '#80868b' }}>📊</span>
                    </span>
                  </div>
                );
              })()}
              {/* 전저점 — 호가도 있으면 전저점 대비 상승분을 옆에 인라인 표시 */}
              {selectedRefItem?.lowestPrice && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, marginRight: '8px' }}>전저점</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#202124' }}>{formatPrice(selectedRefItem.lowestPrice)}</span>
                    {selectedRefItem.askingPrice && (() => {
                      const diff = selectedRefItem.askingPrice! - selectedRefItem.lowestPrice!;
                      const pct  = +((diff / selectedRefItem.lowestPrice!) * 100).toFixed(1);
                      const sign = diff >= 0 ? '+' : '';
                      const color = diff >= 0 ? '#c62828' : '#1565c0';
                      return (
                        <span style={{ fontSize: '11px', color, fontWeight: 600 }}>
                          {sign}{+(diff / 100_000_000).toFixed(2)}억 ({sign}{pct}%)
                        </span>
                      );
                    })()}
                  </span>
                </div>
              )}
              <InfoRow label="10년 등락" value={selectedRefItem?.tenYearChangeAmount != null
                ? `${selectedRefItem.tenYearChangeAmount >= 0 ? '+' : ''}${toUkUnit(selectedRefItem.tenYearChangeAmount)}억`
                : null} />
              <InfoRow label="등락률" value={selectedRefItem?.tenYearChangeRate != null
                ? `${selectedRefItem.tenYearChangeRate >= 0 ? '+' : ''}${selectedRefItem.tenYearChangeRate}%`
                : null} />
            </>
          )}
          {/* 메모 — 편집 버튼 클릭 시 textarea로 전환, 저장 시 즉시 반영 */}
          <div style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingMemo ? '6px' : 0 }}>
              <span style={{ fontSize: '12px', color: '#80868b' }}>메모</span>
              {!editingMemo && (
                <button
                  onClick={() => { setMemoText(displayMemo); setEditingMemo(true); setMemoError(null); }}
                  style={{ border: '1px solid #34a853', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#188038', padding: '2px 8px', borderRadius: '6px' }}
                  title="메모 편집"
                >
                  수정
                </button>
              )}
            </div>

            {editingMemo ? (
              <div>
                <textarea
                  ref={memoHook.ref}
                  value={memoText}
                  onChange={e => setMemoText(e.target.value)}
                  onFocus={memoHook.onFocus}
                  onKeyDown={memoHook.onKeyDown}
                  onBlur={memoHook.onBlur}
                  onCompositionEnd={memoHook.onCompositionEnd}
                  style={{
                    width: '100%', padding: '6px 8px', fontSize: '13px',
                    border: '1px solid #1a73e8', borderRadius: '6px',
                    resize: 'none', overflow: 'hidden',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                    outline: 'none', minHeight: '60px',
                  }}
                />
                {memoError && (
                  <div style={{ fontSize: '12px', color: '#E06060', marginTop: '4px' }}>{memoError}</div>
                )}
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    onClick={handleMemoSave}
                    disabled={memoSaving}
                    style={{
                      flex: 1, padding: '6px', fontSize: '12px', fontWeight: 600,
                      backgroundColor: memoSaving ? '#9e9e9e' : '#89CFF0',
                      color: '#fff', border: 'none', borderRadius: '5px', cursor: memoSaving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {memoSaving ? '저장 중...' : '저장'}
                  </button>
                  <button
                    onClick={() => { setEditingMemo(false); setMemoError(null); }}
                    disabled={memoSaving}
                    style={{
                      flex: 1, padding: '6px', fontSize: '12px',
                      backgroundColor: '#fff', color: '#5f6368',
                      border: '1px solid #dadce0', borderRadius: '5px', cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              // pre-wrap: \n을 줄바꿈으로 렌더링, 긴 줄은 자동 wrap
              <span style={{ fontSize: '13px', color: displayMemo ? '#202124' : '#bdbdbd', whiteSpace: 'pre-wrap' }}>
                {displayMemo || '메모 없음'}
              </span>
            )}
          </div>
        </div>

        {/* 종합평가 — 직장·교통·학군·환경 4개 등급을 한눈에 비교 */}
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054', marginBottom: '8px' }}>종합평가</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {([
              { label: '직장', grade: complex.grade ? { grade: complex.grade, color: GRADE_COLORS[complex.grade] ?? '#9e9e9e' } : null, sectionRef: workSectionRef },
              { label: '교통', grade: calcCommuteGrade(complex.commuteTimes), sectionRef: commuteSectionRef },
              { label: '학군', grade: calcSchoolGrade(complex.schoolInfos ?? []), sectionRef: schoolSectionRef },
              { label: '환경', grade: calcInfraGrade(complex.infraInfos ?? []), sectionRef: infraSectionRef },
            ] as { label: string; grade: { grade: string; color: string } | null; sectionRef: React.RefObject<HTMLDivElement> }[]).map(({ label, grade, sectionRef }) => (
              <div key={label} onClick={() => scrollToSection(sectionRef)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                padding: '10px 6px', backgroundColor: '#f8f9fa',
                borderRadius: '8px', border: '1px solid #e8eaed',
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: '12px', color: '#80868b', fontWeight: 500 }}>{label}</span>
                {grade ? (
                  <span style={{
                    fontSize: '14px', fontWeight: 800, color: '#fff',
                    backgroundColor: grade.color, padding: '2px 10px', borderRadius: '10px',
                  }}>
                    {grade.grade}
                  </span>
                ) : (
                  <span style={{ fontSize: '13px', color: '#bdbdbd', fontWeight: 600 }}>-</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 체크리스트 — 종합평가 바로 아래, 지하철 위 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054' }}>
              체크리스트
              {checklistTotalCount > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '12px', color: '#9aa0a6', fontWeight: 400 }}>
                  {checklistRatedCount}/{checklistTotalCount}
                </span>
              )}
            </h3>
            <button
              onClick={() => setChecklistOpen(true)}
              style={{
                padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                border: '1px solid',
                borderColor: checklistRatedCount > 0 ? '#89CFF0' : '#7DC8A0',
                borderRadius: '6px',
                backgroundColor: checklistRatedCount > 0 ? '#D4EFFC' : '#e6f4ea',
                color: checklistRatedCount > 0 ? '#89CFF0' : '#5AAF84',
              }}
            >
              {checklistRatedCount > 0 ? '체크리스트 보기' : '체크리스트 작성'}
            </button>
          </div>
          {checklistScore ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {(() => {
                const pct = checklistScore.score / checklistScore.maxScore;
                const score100 = Math.round(pct * 100);
                return (
                  <>
                    <div style={{ flex: 1, height: '7px', borderRadius: '4px', backgroundColor: '#f0f0f0', overflow: 'hidden' }}>
                      <div style={{
                        width: `${score100}%`,
                        height: '100%', borderRadius: '4px', transition: 'width 0.3s',
                        backgroundColor: pct >= 0.7 ? '#7DC8A0' : pct >= 0.4 ? '#FFD97D' : '#F08080',
                      }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#202124', flexShrink: 0 }}>
                      {score100}<span style={{ fontSize: '11px', color: '#80868b', fontWeight: 400 }}>/100점</span>
                    </span>
                  </>
                );
              })()}
            </div>
          ) : checklistRatedCount > 0 ? (
            <div style={{ fontSize: '12px', color: '#80868b' }}>
              {checklistRatedCount}개 항목 체크됨 — 보기 버튼을 클릭하세요
            </div>
          ) : null}
        </div>
        {/* 체크리스트 모달 */}
        {checklistOpen && (
          <ChecklistModal
            complexId={complex.id}
            complexName={complex.complexName}
            onClose={() => {
              setChecklistOpen(false);
              // 모달 닫힌 후 카운트 갱신
              getComplexChecklist(complex.id).then(results => {
                setChecklistRatedCount(results.filter(r => r.rating !== null).length);
                setChecklistTotalCount(results.length);
              }).catch(() => {});
            }}
          />
        )}

        {/* 지하철 정보 — 항상 표시, 편집 버튼으로 추가·수정·삭제 가능 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054' }}>지하철</h3>
            {!editingSubway && (
              <button
                onClick={startEditSubway}
                style={{ border: '1px solid #34a853', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#188038', padding: '2px 8px', borderRadius: '6px', marginLeft: 'auto' }}
                title="지하철 정보 수정"
              >수정</button>
            )}
          </div>

          {!editingSubway ? (
            // 읽기 모드
            complex.subwayInfos && complex.subwayInfos.length > 0 ? (
              complex.subwayInfos.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '13px', color: '#202124' }}>{s.stationName}</span>
                  <span style={{ fontSize: '12px', color: '#80868b' }}>
                    {s.subwayLines}{s.walkingMinutes ? ` · 도보 ${s.walkingMinutes}분` : ''}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '12px', color: '#9e9e9e', padding: '4px 0' }}>등록된 지하철 정보가 없습니다.</div>
            )
          ) : (
            // 편집 모드
            <div>
              {subwayRows.map(row => (
                <div key={row.localId} style={{ border: '1px solid #e8eaed', borderRadius: '8px', padding: '10px', marginBottom: '8px', backgroundColor: '#fafafa' }}>
                  {/* 역명 + 조회 버튼 */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <input
                      placeholder="역명 (예: 구일역)"
                      value={row.stationName}
                      onChange={e => updateSubwayRow(row.localId, { stationName: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') lookupSubwayStation(row.localId); }}
                      style={{ ...editInputStyle, flex: 1 }}
                    />
                    <button
                      onClick={() => lookupSubwayStation(row.localId)}
                      disabled={row.fetching || !row.stationName.trim()}
                      style={{
                        padding: '4px 10px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid #1a73e8', borderRadius: '6px',
                        backgroundColor: row.fetching || !row.stationName.trim() ? '#f1f3f4' : '#D4EFFC',
                        color: row.fetching || !row.stationName.trim() ? '#9e9e9e' : '#89CFF0',
                        cursor: row.fetching || !row.stationName.trim() ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >{row.fetching ? '조회 중' : '조회'}</button>
                    <button
                      onClick={() => removeSubwayRow(row.localId)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#E06060', flexShrink: 0, padding: 0 }}
                    >×</button>
                  </div>
                  {/* 호선 + 도보(분) */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {row.foundLines.length > 1 ? (
                      <select
                        value={row.subwayLines}
                        onChange={e => updateSubwayRow(row.localId, { subwayLines: e.target.value })}
                        style={{ ...editInputStyle, flex: 1 }}
                      >
                        <option value="">호선 선택</option>
                        {row.foundLines.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    ) : (
                      <input
                        placeholder="호선 (예: 1호선)"
                        value={row.subwayLines}
                        onChange={e => updateSubwayRow(row.localId, { subwayLines: e.target.value })}
                        style={{ ...editInputStyle, flex: 1 }}
                      />
                    )}
                    <input
                      type="number"
                      placeholder="도보(분)"
                      value={row.walkingMinutes}
                      onChange={e => updateSubwayRow(row.localId, { walkingMinutes: e.target.value })}
                      style={{ ...editInputStyle, width: '72px', flexShrink: 0 }}
                    />
                  </div>
                </div>
              ))}
              {/* + 역 추가 */}
              <button
                onClick={addSubwayRow}
                style={{ width: '100%', padding: '6px', fontSize: '12px', fontWeight: 600, border: '1px dashed #1a73e8', borderRadius: '6px', backgroundColor: 'transparent', color: '#4BAAD4', cursor: 'pointer', marginBottom: '8px' }}
              >+ 역 추가</button>
              {/* 저장·취소 */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={saveSubway}
                  disabled={savingSubway}
                  style={{ flex: 1, padding: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: savingSubway ? '#9e9e9e' : '#89CFF0', color: '#fff', border: 'none', borderRadius: '6px', cursor: savingSubway ? 'not-allowed' : 'pointer' }}
                >{savingSubway ? '저장 중...' : '저장'}</button>
                <button
                  onClick={cancelEditSubway}
                  style={{ flex: 1, padding: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: '#f1f3f4', color: '#5f6368', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >취소</button>
              </div>
            </div>
          )}
        </div>

        {/* 직장 밀도 */}
        {complex.grade && (
          <div ref={workSectionRef} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054' }}>직장</h3>
              <span style={{
                fontSize: '12px', fontWeight: 800, color: '#fff',
                backgroundColor: GRADE_COLORS[complex.grade] ?? '#9e9e9e',
                padding: '1px 8px', borderRadius: '10px',
              }}>
                {complex.grade}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '16px', padding: '6px 0' }}>
              {complex.employees != null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', color: '#80868b' }}>종사자수</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#202124' }}>{formatCount(complex.employees)}명</span>
                </div>
              )}
              {complex.businesses != null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', color: '#80868b' }}>사업체수</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#202124' }}>{formatCount(complex.businesses)}개</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 교통 (주요 지구 소요시간) — 항상 표시, ✏ 버튼으로 편집 진입 */}
        <div ref={commuteSectionRef} style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054' }}>교통</h3>
            {complex.commuteTimes && complex.commuteTimes.length > 0 && (
              <CommuteGradeBadge commuteTimes={complex.commuteTimes} />
            )}
            <button
              onClick={() => { setShowMetroMap(true); setMetroZoom(1); setMetroPan({ x: 0, y: 0 }); }}
              style={{ border: '1px solid #89CFF0', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#1a6fa8', padding: '2px 8px', borderRadius: '6px' }}
              title="서울 지하철 노선도"
            >노선도</button>
            {!editingCommute && (
              <button
                onClick={startEditCommute}
                style={{ border: '1px solid #34a853', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#188038', padding: '2px 8px', borderRadius: '6px', marginLeft: 'auto' }}
                title="출퇴근 시간 수정"
              >수정</button>
            )}
          </div>

          {/* 편집 모드 — 5개 고정 + 커스텀 목적지 카드 스타일 입력 */}
          {editingCommute ? (
            <div>
              {commuteRows.map((row, i) => {
                const destCoords = row.isCustom ? null : DESTINATION_COORDS[row.destination];
                // 커스텀 행: 저장된 좌표 or 검색으로 선택된 좌표 사용
                const customLat = row.isCustom ? row.destLat : undefined;
                const customLng = row.isCustom ? row.destLng : undefined;
                const canQuery = row.isCustom ? !!(customLat && customLng) : !!(destCoords);
                return (
                  <div key={row.isCustom ? `custom-${row.localKey}` : row.destination} style={{
                    border: `1px solid ${row.isCustom ? '#d4e8fc' : '#e8eaed'}`, borderRadius: '10px',
                    padding: '8px 10px', marginBottom: '6px',
                    background: row.isCustom ? '#f0f8fd' : '#f8f9fa',
                  }}>
                    {/* 커스텀 행 헤더: 역 검색 입력 + 검색버튼 + × 삭제 */}
                    {row.isCustom && (
                      <div style={{ marginBottom: '6px' }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input
                            placeholder="역 이름 검색 (예: 강남)"
                            value={row.searchQuery ?? ''}
                            onChange={e => setCommuteRows(prev => prev.map((r, idx) =>
                              idx === i ? { ...r, searchQuery: e.target.value } : r
                            ))}
                            onKeyDown={e => { if (e.key === 'Enter') searchCustomDestination(i); }}
                            style={{ ...editInputStyle, flex: 1, fontSize: '11px' }}
                          />
                          <button
                            onClick={() => searchCustomDestination(i)}
                            disabled={row.isSearching}
                            style={{
                              padding: '3px 8px', fontSize: '11px',
                              border: '1px solid #89CFF0', borderRadius: '6px',
                              background: '#D4EFFC', color: '#1a6fa8',
                              cursor: 'pointer', flexShrink: 0,
                            }}
                          >{row.isSearching ? '…' : '검색'}</button>
                          <button
                            onClick={() => removeCustomCommuteRow(i)}
                            style={{
                              padding: '3px 6px', fontSize: '11px',
                              border: '1px solid #f5c6cb', borderRadius: '6px',
                              background: '#fff5f5', color: '#e06060',
                              cursor: 'pointer', flexShrink: 0,
                            }}
                          >×</button>
                        </div>
                        {/* 검색 결과 드롭다운 */}
                        {row.showSearchDropdown && (row.searchResults ?? []).length > 0 && (
                          <div style={{
                            border: '1px solid #e8eaed', borderRadius: '6px',
                            background: '#fff', maxHeight: '140px', overflowY: 'auto',
                            marginTop: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                          }}>
                            {(row.searchResults ?? []).map((item, si) => (
                              <div
                                key={si}
                                onClick={() => selectCustomDestination(i, item)}
                                style={{
                                  padding: '6px 10px', fontSize: '11px', cursor: 'pointer',
                                  borderBottom: si < (row.searchResults!.length - 1) ? '1px solid #f0f0f0' : 'none',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f0f8fd')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}
                              >
                                <div style={{ fontWeight: 600, color: '#202124' }}>{stripHtml(item.title)}</div>
                                <div style={{ color: '#80868b', fontSize: '10px', marginTop: '2px' }}>{item.roadAddress || item.address}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* 선택된 역 표시 */}
                        {row.destLabel && (
                          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1a6fa8' }}>{row.destLabel}</span>
                            {row.distanceKm != null && (
                              <span style={{ fontSize: '10px', color: '#80868b' }}>{row.distanceKm}km</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 고정 행 헤더: 목적지 라벨 + 직선거리 + 조회 버튼 */}
                    {!row.isCustom && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#202124' }}>{row.destination}</span>
                          {destCoords && complex.latitude && complex.longitude && (
                            <span style={{ fontSize: '10px', color: '#80868b' }}>
                              {haversineKm(complex.latitude, complex.longitude, destCoords.lat, destCoords.lng).toFixed(1)}km
                            </span>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            if (!destCoords || !complex.latitude || !complex.longitude) return;
                            setTransitLoading(i);
                            try {
                              const routes = await getTransitRoutes(complex.latitude, complex.longitude, destCoords.lat, destCoords.lng);
                              setTransitPicker({ routes, rowIdx: i });
                            } catch { alert('경로 조회에 실패했습니다'); }
                            finally { setTransitLoading(null); }
                          }}
                          disabled={!canQuery || transitLoading === i}
                          style={{
                            padding: '3px 8px', fontSize: '11px', fontWeight: 600,
                            border: '1px solid #34a853', borderRadius: '6px',
                            backgroundColor: canQuery ? '#e6f4ea' : '#f5f5f5',
                            color: canQuery ? '#5AAF84' : '#bbb',
                            cursor: canQuery ? 'pointer' : 'default', flexShrink: 0,
                          }}
                        >{transitLoading === i ? '조회 중...' : '조회'}</button>
                      </div>
                    )}

                    {/* 커스텀 행 조회 버튼 (역 선택 후 활성화) */}
                    {row.isCustom && canQuery && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
                        <button
                          onClick={async () => {
                            if (!customLat || !customLng || !complex.latitude || !complex.longitude) return;
                            setTransitLoading(i);
                            try {
                              const routes = await getTransitRoutes(complex.latitude, complex.longitude, customLat, customLng);
                              setTransitPicker({ routes, rowIdx: i });
                            } catch { alert('경로 조회에 실패했습니다'); }
                            finally { setTransitLoading(null); }
                          }}
                          disabled={transitLoading === i}
                          style={{
                            padding: '3px 8px', fontSize: '11px', fontWeight: 600,
                            border: '1px solid #34a853', borderRadius: '6px',
                            backgroundColor: '#e6f4ea', color: '#5AAF84',
                            cursor: 'pointer', flexShrink: 0,
                          }}
                        >{transitLoading === i ? '조회 중...' : '조회'}</button>
                      </div>
                    )}

                    {/* Line 2: 분 + 환승횟수 + 교통수단 */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="number"
                        placeholder="분"
                        value={row.minutes}
                        onChange={e => setCommuteRows(prev => prev.map((r, idx) => idx === i ? { ...r, minutes: e.target.value } : r))}
                        style={{ ...editInputStyle, width: '52px', flexShrink: 0 }}
                      />
                      {/* 환승 횟수 변경 시 handleCommuteTransferCountChange로 transferLines 동기화 */}
                      <input
                        type="number"
                        placeholder="환승"
                        value={row.transferCount}
                        min={0}
                        onChange={e => handleCommuteTransferCountChange(i, e.target.value)}
                        style={{ ...editInputStyle, width: '46px', flexShrink: 0 }}
                      />
                      <select
                        value={row.transportType}
                        onChange={e => setCommuteRows(prev => prev.map((r, idx) => idx === i ? { ...r, transportType: e.target.value } : r))}
                        style={{ ...editInputStyle, flex: 1 }}
                      >
                        {['지하철', '버스+지하철', '버스', '도보'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>

                    {/* Line 3: 환승 횟수 입력 후 노선 칸 표시 (N회 환승 = N+1칸) */}
                    {row.transferLines.length > 0 && (
                      <div style={{ marginTop: '6px', borderTop: '1px dashed #e8eaed', paddingTop: '6px' }}>
                        <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '4px' }}>환승노선</div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                          {row.transferLines.map((line, j) => (
                            <React.Fragment key={j}>
                              {/* 두 번째 칸부터 ➡️ 이모지 구분자 표시 */}
                              {j > 0 && <span style={{ color: '#FFD97D', fontWeight: 700, margin: '0 2px' }}>➡️</span>}
                              <input
                                placeholder={`노선${j + 1}`}
                                value={line}
                                onChange={e => {
                                  const newLines = [...row.transferLines];
                                  newLines[j] = e.target.value;
                                  setCommuteRows(prev => prev.map((r, idx) => idx === i ? { ...r, transferLines: newLines } : r));
                                }}
                                style={{ ...editInputStyle, width: '60px' }}
                              />
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* 커스텀 목적지 추가 버튼 */}
              <button
                onClick={addCustomCommuteRow}
                style={{
                  width: '100%', padding: '6px', fontSize: '11px',
                  border: '1px dashed #89CFF0', borderRadius: '8px',
                  background: 'none', color: '#4BAAD4', cursor: 'pointer',
                  marginBottom: '8px',
                }}
              >+ 목적지 추가</button>
              <div style={{ display: 'flex', gap: '6px', marginTop: '0' }}>
                <button
                  onClick={saveCommute}
                  disabled={savingCommute}
                  style={{
                    padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                    border: '1px solid #1a73e8', borderRadius: '6px',
                    backgroundColor: '#D4EFFC', color: '#4BAAD4', cursor: 'pointer',
                  }}
                >{savingCommute ? '저장 중…' : '저장'}</button>
                <button
                  onClick={cancelEditCommute}
                  style={{
                    padding: '6px 14px', fontSize: '12px',
                    border: '1px solid #dadce0', borderRadius: '6px',
                    background: 'none', color: '#5f6368', cursor: 'pointer',
                  }}
                >취소</button>
              </div>

              {/* 대중교통 경로 선택 팝업 */}
              {transitPicker && (
                <div style={{
                  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
                  zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => setTransitPicker(null)}>
                  <div style={{
                    backgroundColor: '#fff', borderRadius: '12px', padding: '16px',
                    width: '320px', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                  }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c' }}>경로 선택</span>
                      <button onClick={() => setTransitPicker(null)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#80868b' }}>×</button>
                    </div>
                    {transitPicker.routes.map((route, idx) => {
                      const typeLabel = route.type === 'SUBWAY' ? '🚇 지하철' : route.type === 'BUS' ? '🚌 버스' : '🚇🚌 버스+지하철';
                      const typeColor = route.type === 'SUBWAY' ? '#1a73e8' : route.type === 'BUS' ? '#34a853' : '#9334e8';
                      return (
                        <div key={idx}
                          onClick={() => {
                            const tc = route.transfers;
                            const lines = route.lineNames;
                            const paddedLines = lines.length > 0 ? lines : Array(tc + 1).fill('');
                            setCommuteRows(prev => prev.map((r, ri) => ri === transitPicker.rowIdx ? {
                              ...r,
                              minutes: String(route.minutes),
                              transferCount: String(tc),
                              transportType: route.type === 'SUBWAY' ? '지하철' : route.type === 'BUS' ? '버스' : '버스+지하철',
                              transferLines: paddedLines,
                            } : r));
                            setTransitPicker(null);
                          }}
                          style={{
                            border: '1px solid #e8eaed', borderRadius: '8px', padding: '10px 12px',
                            marginBottom: '8px', cursor: 'pointer', transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f8fd')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: typeColor }}>{typeLabel}</span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#202124' }}>{route.minutes}분</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#5f6368' }}>
                            환승 {route.transfers}회
                            {route.lineNames.length > 0 && <span style={{ marginLeft: '6px' }}>· {route.lineNames.join(' ➡️ ')}</span>}
                          </div>
                          {route.fare > 0 && <div style={{ fontSize: '10px', color: '#9e9e9e', marginTop: '2px' }}>{route.fare.toLocaleString()}원</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 읽기 모드 */
            complex.commuteTimes && complex.commuteTimes.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {complex.commuteTimes.map((ct) => (
                  <div
                    key={ct.id}
                    style={{
                      textAlign: 'center', padding: '8px 4px',
                      backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e8eaed',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '2px' }}>
                      {ct.destination}
                      {ct.distanceKm != null && (
                        <span style={{ marginLeft: '3px', fontSize: '10px', color: '#b0b8c1' }}>{ct.distanceKm}km</span>
                      )}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#4BAAD4' }}>{ct.minutes}분</div>
                    {ct.transferCount != null && (
                      <div style={{ marginTop: '3px' }}>
                        <div style={{ fontSize: '10px', color: ct.transferCount === 0 ? '#7DC8A0' : '#80868b', fontWeight: ct.transferCount === 0 ? 600 : 400 }}>
                          {ct.transferCount === 0 ? '직통' : `환승 ${ct.transferCount}회`}
                        </div>
                        {ct.transferLines && (
                          <div style={{ fontSize: '10px', color: '#5f6368', marginTop: '2px', lineHeight: 1.4 }}>
                            {ct.transferLines.split(' ➡️ ').map((line, i, arr) => (
                              <span key={i}>
                                <span style={{ fontWeight: 600 }}>{line}</span>
                                {i < arr.length - 1 && <span style={{ color: '#FFE082', margin: '0 1px' }}> ➡ </span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#9e9e9e', padding: '6px 0' }}>
                ✏ 버튼을 눌러 출퇴근 시간을 입력하세요.
              </div>
            )
          )}
        </div>

        {/* 학군 — 항상 표시 */}
        <div ref={schoolSectionRef} style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054' }}>학군</h3>
            {(() => {
              const g = calcSchoolGrade(complex.schoolInfos ?? []);
              return g ? (
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', backgroundColor: g.color, padding: '1px 8px', borderRadius: '10px' }}>
                  {g.grade}
                </span>
              ) : null;
            })()}
            {!editingSchool && (
              <button onClick={startAddSchool}
                style={{ border: '1px dashed #1a73e8', background: 'none', cursor: 'pointer', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#4BAAD4', marginLeft: 'auto' }}>
                + 추가
              </button>
            )}
          </div>

            {/* 데이터 없을 때 안내 */}
            {(complex.schoolInfos ?? []).length === 0 && newSchoolRows.length === 0 && (
              <div style={{ fontSize: '12px', color: '#9e9e9e', paddingBottom: '4px' }}>등록된 학군 없음</div>
            )}
            {/* 기존 학교 항목 목록 */}
            {(complex.schoolInfos ?? []).map((s: SchoolInfo) => (
              <div key={s.id}>
                {/* 수정 중인 항목 — 인라인 편집 폼 표시 */}
                {editingSchool?.schoolId === s.id ? (
                  <div style={{ border: '1px solid #1a73e8', borderRadius: '8px', padding: '10px', marginBottom: '8px', backgroundColor: '#f8fbff' }}>
                    {/* 학교명 검색 행 */}
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                      <input
                        placeholder="예) 영등포초등학교"
                        value={editingSchool.schoolName}
                        onChange={e => setEditingSchool(prev => prev ? { ...prev, schoolName: e.target.value, showDropdown: false } : null)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSchoolSearch(); }}
                        style={{ ...editInputStyle, flex: 1 }}
                      />
                      <button
                        onClick={handleSchoolSearch}
                        disabled={editingSchool.fetching}
                        style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {editingSchool.fetching ? '...' : '조회'}
                      </button>
                      <select
                        value={editingSchool.schoolType}
                        onChange={e => setEditingSchool(prev => prev ? { ...prev, schoolType: e.target.value as 'ELEMENTARY' | 'MIDDLE' } : null)}
                        style={{ ...editInputStyle, width: '72px' }}
                      >
                        <option value="ELEMENTARY">초등</option>
                        <option value="MIDDLE">중학교</option>
                      </select>
                    </div>
                    {/* 검색 결과 드롭다운 */}
                    {editingSchool.showDropdown && (
                      <div style={{ border: '1px solid #e8eaed', borderRadius: '6px', backgroundColor: '#fff', maxHeight: '160px', overflowY: 'auto', marginBottom: '4px' }}>
                        {editingSchool.searchResults.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleSchoolSelect(item)}
                            style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
                          >
                            <div style={{ fontWeight: 600 }}>{stripHtml(item.title)}</div>
                            <div style={{ color: '#80868b', fontSize: '11px' }}>{item.roadAddress || item.address}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {editingSchool.schoolAddress && (
                      <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '4px', padding: '2px 4px', backgroundColor: '#f0f4ff', borderRadius: '4px' }}>
                        {editingSchool.schoolAddress}
                      </div>
                    )}
                    {/* 도보거리 / 성취도(중학교만) / 전교생 */}
                    <div style={{ display: 'grid', gridTemplateColumns: editingSchool.schoolType === 'MIDDLE' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>도보(분)</div>
                        <input type="number" value={editingSchool.walkingMinutes}
                          onChange={e => setEditingSchool(prev => prev ? { ...prev, walkingMinutes: e.target.value } : null)}
                          style={editInputStyle} />
                      </div>
                      {editingSchool.schoolType === 'MIDDLE' && (
                        <div>
                          <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>학업성취도(%)</div>
                          <input type="number" value={editingSchool.achievementScore}
                            onChange={e => setEditingSchool(prev => prev ? { ...prev, achievementScore: e.target.value } : null)}
                            style={editInputStyle} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>전교생수</div>
                        <input type="number" value={editingSchool.totalStudents}
                          onChange={e => setEditingSchool(prev => prev ? { ...prev, totalStudents: e.target.value } : null)}
                          style={editInputStyle} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={saveEditingSchool} disabled={editingSchool.saving}
                        style={{ flex: 1, padding: '7px', fontSize: '12px', fontWeight: 600, backgroundColor: editingSchool.saving ? '#9e9e9e' : '#89CFF0', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                        {editingSchool.saving ? '저장 중...' : '저장'}
                      </button>
                      <button onClick={() => setEditingSchool(null)}
                        style={{ flex: 1, padding: '7px', fontSize: '12px', backgroundColor: '#fff', color: '#5f6368', border: '1px solid #dadce0', borderRadius: '6px', cursor: 'pointer' }}>
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 일반 표시 행 — 수정(✏)·삭제(🗑) 버튼 표시 */
                  <div style={{ padding: '7px 0', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Tag
                        label={SCHOOL_TYPE_LABELS[s.schoolType] ?? s.schoolType}
                        color={s.schoolType === 'MIDDLE' ? '#89CFF0' : '#7DC8A0'}
                      />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#202124', flex: 1 }}>{s.schoolName}</span>
                      {s.walkingMinutes != null && (
                        <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0 }}>도보 {s.walkingMinutes}분</span>
                      )}
                      {/* 수정 버튼 */}
                      <button onClick={() => startEditSchool(s)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#80868b', padding: '0 2px', flexShrink: 0 }}
                        title="수정">✏</button>
                      {/* 삭제 버튼 */}
                      <button onClick={() => handleDeleteSchool(s.id)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#E06060', padding: '0 2px', flexShrink: 0 }}
                        title="삭제">🗑</button>
                    </div>
                    {(() => {
                      const REGION_PREFIXES = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
                      const normalize = (n: string) => { for (const p of REGION_PREFIXES) { if (n.startsWith(p)) return n.slice(p.length); } return n; };
                      const matched = dbSchools.find(d => d.schoolName === s.schoolName || normalize(d.schoolName) === normalize(s.schoolName ?? ''));
                      const hasExtra = s.achievementScore != null || s.totalStudents != null || matched != null;
                      if (!hasExtra) return null;
                      return (
                        <div style={{ display: 'flex', gap: '10px', paddingLeft: '2px', flexWrap: 'wrap' }}>
                          {s.achievementScore != null && (
                            <span style={{ fontSize: '11px', color: '#5f6368' }}>학업성취도 {s.achievementScore}%</span>
                          )}
                          {matched?.studentsPerClass != null && (
                            <span style={{ fontSize: '11px', color: '#5f6368' }}>학급당 {matched.studentsPerClass}명</span>
                          )}
                          {s.totalStudents != null && (
                            <span style={{ fontSize: '11px', color: '#5f6368' }}>전교생 {s.totalStudents.toLocaleString()}명</span>
                          )}
                          {s.schoolType === 'MIDDLE' && matched?.eliteHighRate != null && (
                            <span style={{ fontSize: '11px', color: '#e06060' }}>
                              특목고 {matched.eliteHighRate}%
                              {(matched.scienceHighCount != null || matched.intlHighCount != null) && (
                                <span style={{ color: '#b0b8c1' }}> (과{matched.scienceHighCount ?? 0}/외{matched.intlHighCount ?? 0}명)</span>
                              )}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}

            {/* 신규 추가 행 배열 — 여러 행을 쌓아두고 일괄 저장 */}
            {newSchoolRows.map((row, idx) => (
              <div key={row.localId} style={{ border: '1px dashed #1a73e8', borderRadius: '8px', padding: '10px', marginTop: '6px', backgroundColor: '#f8fbff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#4BAAD4' }}>추가 {idx + 1}</span>
                  <button onClick={() => removeNewSchoolRow(row.localId)}
                    style={{ border: 'none', background: 'none', color: '#E06060', cursor: 'pointer', fontSize: '16px' }}>×</button>
                </div>
                {/* 검색 행 */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  <input
                    placeholder="예) 영등포초등학교"
                    value={row.schoolName}
                    onChange={e => updateNewSchoolRow(row.localId, { schoolName: e.target.value, showDropdown: false })}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleNewSchoolSearch(row.localId); }}
                    style={{ ...editInputStyle, flex: 1 }}
                  />
                  <button onClick={() => handleNewSchoolSearch(row.localId)} disabled={row.fetching}
                    style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {row.fetching ? '...' : '조회'}
                  </button>
                  <select value={row.schoolType}
                    onChange={e => updateNewSchoolRow(row.localId, { schoolType: e.target.value as 'ELEMENTARY' | 'MIDDLE' })}
                    style={{ ...editInputStyle, width: '72px' }}>
                    <option value="ELEMENTARY">초등</option>
                    <option value="MIDDLE">중학교</option>
                  </select>
                </div>
                {/* 검색 결과 드롭다운 */}
                {row.showDropdown && (
                  <div style={{ border: '1px solid #e8eaed', borderRadius: '6px', backgroundColor: '#fff', maxHeight: '160px', overflowY: 'auto', marginBottom: '4px' }}>
                    {row.searchResults.map((item, j) => (
                      <div key={j} onClick={() => handleNewSchoolSelect(row.localId, item)}
                        style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}>
                        <div style={{ fontWeight: 600 }}>{stripHtml(item.title)}</div>
                        <div style={{ color: '#80868b', fontSize: '11px' }}>{item.roadAddress || item.address}</div>
                      </div>
                    ))}
                  </div>
                )}
                {row.schoolAddress && (
                  <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '4px', padding: '2px 4px', backgroundColor: '#f0f4ff', borderRadius: '4px' }}>
                    {row.schoolAddress}
                  </div>
                )}
                {/* 도보 / 성취도(중학교만) / 전교생 입력 */}
                <div style={{ display: 'grid', gridTemplateColumns: row.schoolType === 'MIDDLE' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '6px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>도보(분)</div>
                    <input type="number" value={row.walkingMinutes}
                      onChange={e => updateNewSchoolRow(row.localId, { walkingMinutes: e.target.value })}
                      style={editInputStyle} />
                  </div>
                  {row.schoolType === 'MIDDLE' && (
                    <div>
                      <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>학업성취도(%)</div>
                      <input type="number" value={row.achievementScore}
                        onChange={e => updateNewSchoolRow(row.localId, { achievementScore: e.target.value })}
                        style={editInputStyle} />
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>전교생수</div>
                    <input type="number" value={row.totalStudents}
                      onChange={e => updateNewSchoolRow(row.localId, { totalStudents: e.target.value })}
                      style={editInputStyle} />
                  </div>
                </div>
              </div>
            ))}

            {/* 추가 행이 1개 이상일 때 일괄 저장 버튼 */}
            {newSchoolRows.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <button onClick={saveNewSchools} disabled={savingNewSchools}
                  style={{ width: '100%', padding: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: savingNewSchools ? '#9e9e9e' : '#89CFF0', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  {savingNewSchools ? '저장 중...' : `${newSchoolRows.length}건 저장`}
                </button>
              </div>
            )}

            {/* 전국 학교 DB — 2km 반경 자동 조회 결과 (읽기 전용) */}
            {(loadingDbSchools || dbSchools.length > 0) && (() => {
              // 지역명 접두사 제거 후 비교 — "서울선유초등학교" = "선유초등학교"
              const REGION_PREFIXES = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
              const normalizeSchoolName = (name: string) => {
                for (const p of REGION_PREFIXES) {
                  if (name.startsWith(p)) return name.slice(p.length);
                }
                return name;
              };
              const isSameSchool = (a: string, b: string) =>
                a === b || normalizeSchoolName(a) === normalizeSchoolName(b);

              // 초등학교(500m 이내) 가까운 3개 + 중학교(1km 이내) 전체 (이미 거리 오름차순)
              const filtered = [
                ...dbSchools.filter(s => s.schoolType === '초등학교').slice(0, 3),
                ...dbSchools.filter(s => s.schoolType === '중학교'),
              ];
              // 전부 이미 추가된 상태면 섹션 자체를 숨김
              const allAdded = filtered.length > 0 && filtered.every(s =>
                (complex.schoolInfos ?? []).some(r => isSameSchool(r.schoolName ?? '', s.schoolName))
              );
              if (!loadingDbSchools && allAdded) return null;
              return (
                <div style={{ marginTop: '10px', borderTop: '1px dashed #e0e0e0', paddingTop: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '6px', fontWeight: 600 }}>
                    반경 1km 학교 DB {loadingDbSchools ? '(조회 중...)' : `(${filtered.length}개)`}
                  </div>
                  {filtered.map(s => {
                    const alreadyAdded = (complex.schoolInfos ?? []).some(r => isSameSchool(r.schoolName ?? '', s.schoolName));
                    const isAdding = addingDbSchoolId === s.id;
                    return (
                      <div key={s.id} style={{ padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                        {/* 1행: 유형 배지 + 학교명 + 버튼 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <Tag
                            label={s.schoolType === '초등학교' ? '초등' : '중학'}
                            color={s.schoolType === '초등학교' ? '#7DC8A0' : '#89CFF0'}
                          />
                          <span style={{ fontSize: '12px', color: '#202124', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.schoolName}
                          </span>
                          <button
                            onClick={() => handleAddDbSchool(s)}
                            disabled={alreadyAdded || isAdding}
                            style={{
                              flexShrink: 0, fontSize: '10px', padding: '2px 6px', borderRadius: '5px',
                              cursor: alreadyAdded ? 'default' : 'pointer',
                              border: '1px solid #dadce0',
                              backgroundColor: alreadyAdded ? '#f0f0f0' : '#fff',
                              color: alreadyAdded ? '#9e9e9e' : '#4BAAD4', whiteSpace: 'nowrap',
                            }}
                          >
                            {isAdding ? '...' : alreadyAdded ? '추가됨' : '+ 추가'}
                          </button>
                        </div>
                        {/* 2행: 거리 + 성취도 + 특목고 진학률 + 학생수 */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px', paddingLeft: '2px' }}>
                          <span style={{ fontSize: '10px', color: '#80868b' }}>
                            {s.distanceKm < 1 ? `${Math.round(s.distanceKm * 1000)}m` : `${s.distanceKm.toFixed(1)}km`}
                          </span>
                          {s.achievementScore != null && (
                            <span style={{ fontSize: '10px', color: '#5f6368' }}>성취 {s.achievementScore}%</span>
                          )}
                          {s.studentsPerClass != null && (
                            <span style={{ fontSize: '10px', color: '#9e9e9e' }}>학급당 {s.studentsPerClass}명</span>
                          )}
                          {s.totalStudents != null && (
                            <span style={{ fontSize: '10px', color: '#9e9e9e' }}>{s.totalStudents.toLocaleString()}명</span>
                          )}
                          {s.schoolType === '중학교' && s.eliteHighRate != null && (
                            <span style={{ fontSize: '10px', color: '#e06060' }}>
                              특목고 {s.eliteHighRate}%
                              {(s.scienceHighCount != null || s.intlHighCount != null) && (
                                <span style={{ color: '#b0b8c1' }}> (과{s.scienceHighCount ?? 0}/외{s.intlHighCount ?? 0}명)</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
        </div>

        {/* 환경 (주변 인프라) — 항상 표시 */}
        <div ref={infraSectionRef} style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054' }}>환경</h3>
            {(() => {
              const g = calcInfraGrade(complex.infraInfos ?? []);
              return (
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', backgroundColor: g.color, padding: '1px 8px', borderRadius: '10px' }}>
                  {g.grade}
                </span>
              );
            })()}
            {!editingInfra && (
              <button onClick={startAddInfra}
                style={{ border: '1px dashed #f9ab00', background: 'none', cursor: 'pointer', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#e37400', marginLeft: 'auto' }}>
                + 추가
              </button>
            )}
          </div>

          {/* 한강공원 — 환경 섹션 헤더 바로 아래 작게 표시 */}
          {complex.hanRiverParkName && (
            <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>🏞</span>
              <span style={{ fontWeight: 600, color: '#1a3a5c' }}>{complex.hanRiverParkName}</span>
              <span>직선</span>
              <span style={{ fontWeight: 600, color: '#4BAAD4' }}>
                {complex.hanRiverDistanceM != null
                  ? complex.hanRiverDistanceM >= 1000
                    ? `${(complex.hanRiverDistanceM / 1000).toFixed(1)}km`
                    : `${complex.hanRiverDistanceM}m`
                  : '-'}
              </span>
            </div>
          )}

          {/* 데이터 없을 때 안내 / 자동탐지 로딩 */}
          {(complex.infraInfos ?? []).length === 0 && newInfraRows.length === 0 && (
            <div style={{ fontSize: '12px', color: '#9e9e9e', paddingBottom: '4px' }}>
              {loadingInfraSuggestions ? '주변 인프라 조회 중...' : '등록된 인프라 없음'}
            </div>
          )}

          {/* 기존 인프라 항목 목록 */}
            {(complex.infraInfos ?? []).map((inf: InfraInfo) => (
              <div key={inf.id}>
                {/* 수정 중인 항목 — 인라인 편집 폼 표시 */}
                {editingInfra?.infraId === inf.id ? (
                  <div style={{ border: '1px solid #f9ab00', borderRadius: '8px', padding: '10px', marginBottom: '8px', backgroundColor: '#fffbf0' }}>
                    {/* 유형 + 이름 검색 행 */}
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                      <select value={editingInfra.infraType}
                        onChange={e => setEditingInfra(prev => prev ? { ...prev, infraType: e.target.value } : null)}
                        style={{ ...editInputStyle, width: '80px' }}>
                        {INFRA_TYPES_LIST.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                      <input
                        placeholder="시설명 입력 후 조회"
                        value={editingInfra.infraName}
                        onChange={e => setEditingInfra(prev => prev ? { ...prev, infraName: e.target.value, showDropdown: false } : null)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleInfraSearch(); }}
                        style={{ ...editInputStyle, flex: 1 }}
                      />
                      <button onClick={handleInfraSearch} disabled={editingInfra.fetching}
                        style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {editingInfra.fetching ? '...' : '조회'}
                      </button>
                    </div>
                    {editingInfra.showDropdown && (
                      <div style={{ border: '1px solid #e8eaed', borderRadius: '6px', backgroundColor: '#fff', maxHeight: '160px', overflowY: 'auto', marginBottom: '4px' }}>
                        {editingInfra.searchResults.map((item, idx) => (
                          <div key={idx} onClick={() => handleInfraSelect(item)}
                            style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}>
                            <div style={{ fontWeight: 600 }}>{stripHtml(item.title)}</div>
                            <div style={{ color: '#80868b', fontSize: '11px' }}>{item.roadAddress || item.address}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {editingInfra.infraAddress && (
                      <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '4px', padding: '2px 4px', backgroundColor: '#fffbe6', borderRadius: '4px' }}>
                        {editingInfra.infraAddress}
                      </div>
                    )}
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>도보(분)</div>
                      <input type="number" value={editingInfra.distance}
                        onChange={e => setEditingInfra(prev => prev ? { ...prev, distance: e.target.value } : null)}
                        style={editInputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={saveEditingInfra} disabled={editingInfra.saving}
                        style={{ flex: 1, padding: '7px', fontSize: '12px', fontWeight: 600, backgroundColor: editingInfra.saving ? '#9e9e9e' : '#e37400', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                        {editingInfra.saving ? '저장 중...' : '저장'}
                      </button>
                      <button onClick={() => setEditingInfra(null)}
                        style={{ flex: 1, padding: '7px', fontSize: '12px', backgroundColor: '#fff', color: '#5f6368', border: '1px solid #dadce0', borderRadius: '6px', cursor: 'pointer' }}>
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 일반 표시 행 — 수정(✏)·삭제(🗑) 버튼 표시 */
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Tag label={INFRA_TYPE_LABELS[inf.infraType] ?? inf.infraType} color='#FFD97D' />
                    <span style={{ fontSize: '13px', color: '#202124', flex: 1 }}>{inf.infraName}</span>
                    {inf.distance != null && (
                      <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0 }}>도보 {inf.distance}분</span>
                    )}
                    {/* 수정 버튼 */}
                    <button onClick={() => startEditInfra(inf)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#80868b', padding: '0 2px', flexShrink: 0 }}
                      title="수정">✏</button>
                    {/* 삭제 버튼 */}
                    <button onClick={() => handleDeleteInfra(inf.id)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#E06060', padding: '0 2px', flexShrink: 0 }}
                      title="삭제">🗑</button>
                  </div>
                )}
              </div>
            ))}

            {/* 신규 추가 행 배열 */}
            {newInfraRows.map((row, idx) => (
              <div key={row.localId} style={{ border: '1px dashed #f9ab00', borderRadius: '8px', padding: '10px', marginTop: '6px', backgroundColor: '#fffbf0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#e37400' }}>추가 {idx + 1}</span>
                  <button onClick={() => removeNewInfraRow(row.localId)}
                    style={{ border: 'none', background: 'none', color: '#E06060', cursor: 'pointer', fontSize: '16px' }}>×</button>
                </div>
                {/* 유형 + 이름 검색 행 */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  <select value={row.infraType}
                    onChange={e => updateNewInfraRow(row.localId, { infraType: e.target.value })}
                    style={{ ...editInputStyle, width: '80px' }}>
                    {INFRA_TYPES_LIST.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <input
                    placeholder="시설명 입력 후 조회"
                    value={row.infraName}
                    onChange={e => updateNewInfraRow(row.localId, { infraName: e.target.value, showDropdown: false })}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleNewInfraSearch(row.localId); }}
                    style={{ ...editInputStyle, flex: 1 }}
                  />
                  <button onClick={() => handleNewInfraSearch(row.localId)} disabled={row.fetching}
                    style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {row.fetching ? '...' : '조회'}
                  </button>
                </div>
                {/* 검색 결과 드롭다운 */}
                {row.showDropdown && (
                  <div style={{ border: '1px solid #e8eaed', borderRadius: '6px', backgroundColor: '#fff', maxHeight: '160px', overflowY: 'auto', marginBottom: '4px' }}>
                    {row.searchResults.map((item, j) => (
                      <div key={j} onClick={() => handleNewInfraSelect(row.localId, item)}
                        style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}>
                        <div style={{ fontWeight: 600 }}>{stripHtml(item.title)}</div>
                        <div style={{ color: '#80868b', fontSize: '11px' }}>{item.roadAddress || item.address}</div>
                      </div>
                    ))}
                  </div>
                )}
                {row.infraAddress && (
                  <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '4px', padding: '2px 4px', backgroundColor: '#fffbe6', borderRadius: '4px' }}>
                    {row.infraAddress}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>도보(분)</div>
                  <input type="number" value={row.distance}
                    onChange={e => updateNewInfraRow(row.localId, { distance: e.target.value })}
                    style={editInputStyle} />
                </div>
              </div>
            ))}

          {/* 추가 행이 1개 이상일 때 일괄 저장 버튼 */}
          {newInfraRows.length > 0 && !loadingInfraSuggestions && (
            <div style={{ marginTop: '8px' }}>
              <button onClick={saveNewInfras} disabled={savingNewInfras}
                style={{ width: '100%', padding: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: savingNewInfras ? '#9e9e9e' : '#e37400', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                {savingNewInfras ? '저장 중...' : `${newInfraRows.length}건 저장`}
              </button>
            </div>
          )}
        </div>

        {/* 유해시설 */}
        <div ref={hazardSectionRef} style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054' }}>유해시설</h3>
            {!editingHazard && (
              <button onClick={startAddHazard}
                style={{ border: '1px dashed #c5221f', background: 'none', cursor: 'pointer', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#E06060', marginLeft: 'auto' }}>
                + 추가
              </button>
            )}
          </div>

          {/* 기존 유해시설 목록 */}
          {(complex.hazardInfos ?? []).length === 0 && newHazardRows.length === 0 && (
            <div style={{ fontSize: '12px', color: '#9e9e9e', paddingBottom: '4px' }}>
              {loadingHazardSuggestions ? '주변 유해시설 조회 중...' : '등록된 유해시설 없음'}
            </div>
          )}
          {(complex.hazardInfos ?? []).map((h: { id: number; hazardName?: string; hazardAddress?: string; distance?: number; latitude?: number; longitude?: number; macroCategory?: string; subCategory?: string }) => (
            <div key={h.id}>
              {editingHazard?.hazardId === h.id ? (
                // 수정 폼
                <div style={{ border: '1px solid #c5221f', borderRadius: '8px', padding: '10px', marginBottom: '8px', backgroundColor: '#fff8f7' }}>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <input
                      placeholder="시설명 입력 후 조회"
                      value={editingHazard.hazardName}
                      onChange={e => setEditingHazard(prev => prev ? { ...prev, hazardName: e.target.value, showDropdown: false } : null)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleEditHazardSearch(); }}
                      style={{ ...editInputStyle, flex: 1 }}
                    />
                    <button onClick={handleEditHazardSearch} disabled={editingHazard.fetching}
                      style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {editingHazard.fetching ? '...' : '조회'}
                    </button>
                  </div>
                  {editingHazard.showDropdown && (
                    <div style={{ border: '1px solid #e8eaed', borderRadius: '6px', backgroundColor: '#fff', maxHeight: '160px', overflowY: 'auto', marginBottom: '4px' }}>
                      {editingHazard.searchResults.map((item, idx) => (
                        <div key={idx} onClick={() => handleEditHazardSelect(item)}
                          style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}>
                          <div style={{ fontWeight: 600 }}>{stripHtml(item.title)}</div>
                          <div style={{ color: '#80868b', fontSize: '11px' }}>{item.roadAddress || item.address}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {editingHazard.hazardAddress && (
                    <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '4px', padding: '2px 4px', backgroundColor: '#fff0ee', borderRadius: '4px' }}>
                      {editingHazard.hazardAddress}
                    </div>
                  )}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>거리(m)</div>
                    <input type="number" value={editingHazard.distance}
                      onChange={e => setEditingHazard(prev => prev ? { ...prev, distance: e.target.value } : null)}
                      style={editInputStyle} />
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={saveEditingHazard} disabled={editingHazard.saving}
                      style={{ flex: 1, padding: '7px', fontSize: '12px', fontWeight: 600, backgroundColor: editingHazard.saving ? '#9e9e9e' : '#E06060', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                      {editingHazard.saving ? '저장 중...' : '저장'}
                    </button>
                    <button onClick={() => setEditingHazard(null)}
                      style={{ flex: 1, padding: '7px', fontSize: '12px', backgroundColor: '#fff', color: '#5f6368', border: '1px solid #dadce0', borderRadius: '6px', cursor: 'pointer' }}>
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                // 읽기 행
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 카테고리 배지 (백엔드에 저장된 경우만 표시) */}
                    {h.macroCategory && (
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '2px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', background: '#FFE8E8', color: '#E06060', borderRadius: '4px', padding: '1px 6px', fontWeight: 600 }}>
                          {h.macroCategory}
                        </span>
                        {h.subCategory && (
                          <span style={{ fontSize: '10px', background: '#f1f3f4', color: '#5f6368', borderRadius: '4px', padding: '1px 6px' }}>
                            {h.subCategory}
                          </span>
                        )}
                      </div>
                    )}
                    <span style={{ fontSize: '13px', color: '#202124' }}>{h.hazardName}</span>
                  </div>
                  {h.distance != null && (
                    <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0 }}>{h.distance}m</span>
                  )}
                  <button onClick={() => startEditHazard(h)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#80868b', padding: '0 2px', flexShrink: 0 }}
                    title="수정">✏</button>
                  <button onClick={() => handleDeleteHazard(h.id)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#E06060', padding: '0 2px', flexShrink: 0 }}
                    title="삭제">🗑</button>
                </div>
              )}
            </div>
          ))}

          {/* 신규 추가 행 */}
          {newHazardRows.map((row, idx) => (
            <div key={row.localId} style={{ border: '1px dashed #c5221f', borderRadius: '8px', padding: '10px', marginTop: '6px', backgroundColor: '#fff8f7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#E06060' }}>추가 {idx + 1}</span>
                  {/* 자동 감지 항목 카테고리 배지 */}
                  {row.macroCategory && (
                    <span style={{ fontSize: '10px', background: '#FFE8E8', color: '#E06060', borderRadius: '4px', padding: '1px 6px', fontWeight: 600 }}>
                      {row.macroCategory}
                    </span>
                  )}
                  {row.subCategory && (
                    <span style={{ fontSize: '10px', background: '#f1f3f4', color: '#5f6368', borderRadius: '4px', padding: '1px 6px' }}>
                      {row.subCategory}
                    </span>
                  )}
                </div>
                <button onClick={() => removeNewHazardRow(row.localId)}
                  style={{ border: 'none', background: 'none', color: '#E06060', cursor: 'pointer', fontSize: '16px' }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                <input
                  placeholder="시설명 입력 후 조회"
                  value={row.hazardName}
                  onChange={e => updateNewHazardRow(row.localId, { hazardName: e.target.value, showDropdown: false })}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleNewHazardSearch(row.localId); }}
                  style={{ ...editInputStyle, flex: 1 }}
                />
                <button onClick={() => handleNewHazardSearch(row.localId)} disabled={row.fetching}
                  style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {row.fetching ? '...' : '조회'}
                </button>
              </div>
              {row.showDropdown && (
                <div style={{ border: '1px solid #e8eaed', borderRadius: '6px', backgroundColor: '#fff', maxHeight: '160px', overflowY: 'auto', marginBottom: '4px' }}>
                  {row.searchResults.map((item, j) => (
                    <div key={j} onClick={() => handleNewHazardSelect(row.localId, item)}
                      style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}>
                      <div style={{ fontWeight: 600 }}>{stripHtml(item.title)}</div>
                      <div style={{ color: '#80868b', fontSize: '11px' }}>{item.roadAddress || item.address}</div>
                    </div>
                  ))}
                </div>
              )}
              {row.hazardAddress && (
                <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '4px', padding: '2px 4px', backgroundColor: '#fff0ee', borderRadius: '4px' }}>
                  {row.hazardAddress}
                </div>
              )}
              <div>
                <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>거리(m)</div>
                <input type="number" value={row.distance}
                  onChange={e => updateNewHazardRow(row.localId, { distance: e.target.value })}
                  style={editInputStyle} />
              </div>
            </div>
          ))}

          {/* 일괄 저장 버튼 */}
          {newHazardRows.length > 0 && !loadingHazardSuggestions && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
              <button onClick={saveNewHazards} disabled={savingNewHazards}
                style={{ flex: 1, padding: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: savingNewHazards ? '#9e9e9e' : '#E06060', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                {savingNewHazards ? '저장 중...' : `${newHazardRows.length}건 저장`}
              </button>
              <button onClick={() => setNewHazardRows([])}
                style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: '#fff', color: '#5f6368', border: '1px solid #dadce0', borderRadius: '6px', cursor: 'pointer' }}>
                전체 삭제
              </button>
            </div>
          )}
          {/* 자동 조회 로딩 인디케이터 */}
          {loadingHazardSuggestions && (
            <div style={{ fontSize: '12px', color: '#E06060', paddingTop: '4px' }}>주변 유해시설 조회 중...</div>
          )}
        </div>

        {/* 재개발 정보 — 데이터 있거나 편집 중일 때 표시 */}
        {(complex.redevelopType || editingRedevelop) && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: 0 }}>재개발 정보</h3>
              {!editingRedevelop && (
                <button
                  onClick={() => setEditingRedevelop(true)}
                  style={{ fontSize: '12px', padding: '3px 8px', border: '1px solid #34a853', color: '#7DC8A0', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}
                >수정</button>
              )}
            </div>

            {editingRedevelop ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* 유형 셀렉트 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#80868b', width: '52px', flexShrink: 0 }}>유형</span>
                  <select
                    value={localRedevelopType}
                    onChange={e => setLocalRedevelopType(e.target.value)}
                    style={{ ...editInputStyle, flex: 1 }}
                  >
                    <option value="">없음</option>
                    <option value="REDEVELOPMENT">재개발</option>
                    <option value="RECONSTRUCTION">재건축</option>
                    <option value="REMODELING">리모델링</option>
                  </select>
                </div>
                {/* 진행단계 셀렉트 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#80868b', width: '52px', flexShrink: 0 }}>진행단계</span>
                  <select
                    value={localRedevelopStage}
                    onChange={e => setLocalRedevelopStage(e.target.value)}
                    style={{ ...editInputStyle, flex: 1 }}
                  >
                    <option value="">없음</option>
                    <option value="INITIAL">① 정비구역 지정</option>
                    <option value="COMMITTEE">② 추진위원회 구성</option>
                    <option value="ASSOCIATION">③ 조합 설립 인가</option>
                    <option value="APPROVAL">④ 사업시행인가</option>
                    <option value="MGMT_APPROVAL">⑤ 관리처분인가</option>
                    <option value="RELOCATION">⑥ 이주·철거 및 착공</option>
                    <option value="COMPLETION">⑦ 준공 및 입주</option>
                  </select>
                </div>
                {/* 저장·취소 */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={async () => {
                      setRedevelopSaving(true);
                      try {
                        await updateRedevelopInfo(complex.id, {
                          redevelopType: localRedevelopType || null,
                          redevelopStage: localRedevelopStage || null,
                        });
                        onComplexUpdate?.({ ...complex, redevelopType: localRedevelopType || undefined, redevelopStage: localRedevelopStage || undefined });
                        setEditingRedevelop(false);
                      } catch { }
                      finally { setRedevelopSaving(false); }
                    }}
                    disabled={redevelopSaving}
                    style={{ padding: '6px 12px', backgroundColor: '#89CFF0', color: '#1a3a5c', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: redevelopSaving ? 'not-allowed' : 'pointer', opacity: redevelopSaving ? 0.7 : 1 }}
                  >{redevelopSaving ? '저장 중...' : '저장'}</button>
                  <button
                    onClick={() => { setLocalRedevelopType(complex.redevelopType ?? ''); setLocalRedevelopStage(complex.redevelopStage ?? ''); setEditingRedevelop(false); }}
                    disabled={redevelopSaving}
                    style={{ padding: '6px 12px', border: '1px solid #dadce0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff', cursor: 'pointer' }}
                  >취소</button>
                </div>
              </div>
            ) : (
              <>
                <InfoRow label="유형" value={REDEVELOP_TYPE_LABELS[complex.redevelopType!]} />
                {/* 진행단계 — ? 아이콘 호버 시 각 단계 설명 tooltip 표시 */}
                {complex.redevelopStage && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginRight: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#80868b' }}>진행단계</span>
                      <div
                        style={{ position: 'relative', display: 'inline-flex' }}
                        onMouseEnter={() => setShowStageTooltip(true)}
                        onMouseLeave={() => setShowStageTooltip(false)}
                      >
                        <div style={{
                          width: '14px', height: '14px', borderRadius: '50%',
                          backgroundColor: '#dadce0', color: '#5f6368',
                          fontSize: '10px', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'default', lineHeight: 1,
                        }}>?</div>
                        {showStageTooltip && (
                          <div style={{
                            position: 'absolute', bottom: '120%', left: 0, zIndex: 20,
                            backgroundColor: '#3c4043', color: '#fff',
                            fontSize: '11px', lineHeight: 1.7,
                            padding: '8px 10px', borderRadius: '6px',
                            width: '280px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                            pointerEvents: 'none',
                          }}>
                            {([
                              ['①', '정비구역 지정', '지방자치단체가 지역의 노후도, 기반시설 부족 여부 등을 종합적으로 판단해 사업 구역 지정'],
                              ['②', '추진위원회 구성 및 승인', '조합 설립을 위한 준비 조직을 구성하여 지자체의 승인을 받음'],
                              ['③', '조합 설립 인가', '토지 및 건물 소유자로부터 법정 동의율을 확보하여 조합 설립 인가를 받음'],
                              ['④', '사업시행인가', '조합이 수립한 건축계획, 이주 계획 등을 지자체가 최종 승인'],
                              ['⑤', '관리처분인가', '조합원의 자산 평가, 분양 계획, 추가 분담금 등을 최종 확정'],
                              ['⑥', '이주·철거 및 착공', '거주자의 이주가 완료되면 기존 건물을 철거하고 공사 시작'],
                              ['⑦', '준공 및 입주', '공사가 완료되면 준공 인가를 거쳐 입주 시작'],
                            ] as const).map(([num, title, desc]) => (
                              <div key={num} style={{ marginBottom: '4px' }}>
                                <span style={{ fontWeight: 700 }}>{num} {title}</span><br />
                                <span style={{ color: '#bdbdbd', fontSize: '10px' }}>{desc}</span>
                              </div>
                            ))}
                            <div style={{
                              position: 'absolute', top: '100%', left: '7px',
                              borderWidth: '5px', borderStyle: 'solid',
                              borderColor: '#3c4043 transparent transparent transparent',
                            }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: '13px', color: '#202124', textAlign: 'right' }}>
                      {REDEVELOP_STAGE_LABELS[complex.redevelopStage]}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {/* 재개발 정보 없을 때 추가 버튼 */}
        {!complex.redevelopType && !editingRedevelop && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: 0 }}>재개발 정보</h3>
              <button
                onClick={() => setEditingRedevelop(true)}
                style={{ fontSize: '12px', padding: '3px 8px', border: '1px solid #34a853', color: '#7DC8A0', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}
              >+ 추가</button>
            </div>
            <p style={{ fontSize: '12px', color: '#9aa0a6', margin: 0 }}>재개발·재건축·리모델링 정보가 없습니다.</p>
          </div>
        )}

        {/* 임장 유형 — 항상 표시, 값 없으면 NONE(임장X)과 동일하게 표시 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: 0 }}>임장 유형</h3>
            <button
              onClick={() => setEditingVisitType(v => !v)}
              style={{ border: '1px solid #34a853', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#188038', padding: '2px 8px', borderRadius: '6px', marginLeft: 'auto' }}
              title="임장 유형 수정"
            >수정</button>
          </div>
          {editingVisitType ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={localVisitType}
                onChange={e => setLocalVisitType(e.target.value)}
                style={{ ...editInputStyle, flex: 1 }}
              >
                <option value="NONE">임장X</option>
                <option value="ATMOSPHERE">분위기 임장</option>
                <option value="COMPLEX">단지 임장</option>
                <option value="LISTING">매물 임장</option>
              </select>
              <button
                onClick={async () => {
                  if (!complex) return;
                  setVisitTypeSaving(true);
                  try {
                    await updateVisitType(complex.id, localVisitType);
                    onComplexUpdate?.({ ...complex, visitType: localVisitType });
                    setEditingVisitType(false);
                  } catch { /* 인터셉터가 콘솔 출력 */ } finally {
                    setVisitTypeSaving(false);
                  }
                }}
                disabled={visitTypeSaving}
                style={{ padding: '6px 12px', backgroundColor: '#89CFF0', color: '#1a3a5c', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: visitTypeSaving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: visitTypeSaving ? 0.7 : 1 }}
              >
                {visitTypeSaving ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={() => { setLocalVisitType(complex.visitType || 'NONE'); setEditingVisitType(false); }}
                disabled={visitTypeSaving}
                style={{ padding: '6px 12px', backgroundColor: '#f1f3f4', color: '#5f6368', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >취소</button>
            </div>
          ) : (
            <div style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: '12px',
              backgroundColor: '#D4EFFC', color: '#4BAAD4', fontSize: '13px', fontWeight: 600,
            }}>
              {VISIT_TYPE_LABELS[complex.visitType ?? 'NONE'] ?? VISIT_TYPE_LABELS['NONE']}
            </div>
          )}
        </div>


        {/* 시세 변동 그래프 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054' }}>
              시세 변동
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {priceChange !== null && (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: priceChange >= 0 ? '#E06060' : '#137333',
                  }}
                >
                  {priceChange >= 0 ? '+' : ''}{formatPrice(Math.abs(priceChange))}
                </span>
              )}
              {/* 평형이 2개 이상일 때만 필터 셀렉트박스 표시 */}
              {areaTypes.length > 1 && (
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <select
                    value={selectedAreaType}
                    onChange={e => setSelectedAreaType(e.target.value)}
                    style={{
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      border: '1.5px solid',
                      borderColor: selectedAreaType ? '#89CFF0' : '#d2d5da',
                      borderRadius: '14px',
                      backgroundColor: selectedAreaType ? '#D4EFFC' : '#f8f9fa',
                      color: selectedAreaType ? '#89CFF0' : '#5f6368',
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '4px 26px 4px 10px',
                      cursor: 'pointer',
                      outline: 'none',
                      boxShadow: selectedAreaType
                        ? '0 2px 6px rgba(26,115,232,0.18)'
                        : '0 1px 3px rgba(0,0,0,0.07)',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    <option value="">전체 평형</option>
                    {areaTypes.map(at => (
                      <option key={at} value={at}>{at}</option>
                    ))}
                  </select>
                  <svg
                    viewBox="0 0 24 24" fill="none"
                    stroke={selectedAreaType ? '#89CFF0' : '#9e9e9e'}
                    strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      position: 'absolute', right: '8px', top: '50%',
                      transform: 'translateY(-50%)',
                      width: '11px', height: '11px', pointerEvents: 'none',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9e9e9e', fontSize: '13px' }}>
              로딩 중...
            </div>
          ) : (
            // filteredSeries: 선택 평형의 매매+전세 세트, 전체일 때는 모든 시리즈
            <PriceChart rows={chartData.rows} series={filteredSeries} />
          )}

          {priceHistories.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#80868b', textAlign: 'right' }}>
              총 {priceHistories.length}건의 기록
            </div>
          )}
        </div>

        {/* 최근 시세 기록 목록 */}
        {priceHistories.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: 0 }}>
                최근 기록
              </h3>
              {/* 물음표 아이콘 — 호버 시 tooltip 표시 */}
              <div
                style={{ position: 'relative', display: 'inline-flex' }}
                onMouseEnter={() => setShowRecordTooltip(true)}
                onMouseLeave={() => setShowRecordTooltip(false)}
              >
                <div style={{
                  width: '15px', height: '15px', borderRadius: '50%',
                  backgroundColor: '#dadce0', color: '#5f6368',
                  fontSize: '10px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'default', flexShrink: 0, lineHeight: 1,
                }}>
                  ?
                </div>
                {showRecordTooltip && (
                  <div style={{
                    position: 'absolute', bottom: '120%', left: 0,
                    backgroundColor: '#3c4043', color: '#fff',
                    fontSize: '11px', lineHeight: 1.6,
                    padding: '7px 10px', borderRadius: '6px',
                    width: '200px', zIndex: 10,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    pointerEvents: 'none',
                  }}>
                    전세가율 : 낮으면 호황/급등기, 높으면 불황
                    <div style={{
                      position: 'absolute', top: '100%', left: '7px',
                      borderWidth: '5px', borderStyle: 'solid',
                      borderColor: '#3c4043 transparent transparent transparent',
                    }} />
                  </div>
                )}
              </div>
            </div>
            {/* 최신순으로 뒤집어 최대 5건만 표시 — 날짜별로 items 배열을 나열 */}
            {(() => {
              const reversed = [...priceHistories].reverse();
              return reversed.slice(0, 5).map((h, idx) => {
                // 직전 기록 — 동일 areaType 간 가격 변동 계산에 사용
                const prevH = reversed[idx + 1];
                return (
                  <div
                    key={h.id}
                    style={{
                      marginBottom: '8px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '6px',
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '4px' }}>
                      {h.recordDate}
                      {h.memo && <span style={{ marginLeft: '6px' }}>{h.memo}</span>}
                    </div>
                    {h.items.map((item) => {
                      // 직전 기록에서 동일 areaType 항목 탐색 → 변동액·변동률 계산
                      const prevItem = prevH?.items.find(p => p.areaType === item.areaType);
                      const delta = prevItem ? item.price - prevItem.price : null;
                      const rate = delta !== null && prevItem && prevItem.price > 0
                        ? (delta / prevItem.price) * 100 : null;

                      return (
                        <div key={item.id} style={{ padding: '3px 0', borderBottom: '1px solid #f0f0f0' }}>
                          {/* 기본 가격 행 */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                            <span style={{ color: '#5f6368' }}>
                              {item.areaType || '-'}
                              {item.floor ? ` · ${item.floor}층` : ''}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: 600, color: '#202124' }}>{formatPrice(item.price)}</span>
                              {/* 직전 기록 대비 변동액·변동률 */}
                              {delta !== null && delta !== 0 && rate !== null && (
                                <span style={{
                                  fontSize: '10px', fontWeight: 700,
                                  color: delta > 0 ? '#E06060' : '#89CFF0',
                                }}>
                                  {delta > 0 ? '▲' : '▼'} {formatPrice(Math.abs(delta))} ({delta > 0 ? '+' : ''}{rate.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                            {item.jeonseRate != null && (
                              <span style={{ fontSize: '11px', color: '#4BAAD4' }}>전세가율 {item.jeonseRate.toFixed(0)}%</span>
                            )}
                          </div>
                          {/* 참고가 — 값이 있는 항목만 표시 */}
                          {(item.kbPrice || item.askingPrice || item.highestPrice || item.lowestPrice || item.tenYearChangeAmount || item.tenYearChangeRate) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '3px' }}>
                              {item.kbPrice && (
                                <span style={{ fontSize: '10px', color: '#80868b' }}>KB {formatPrice(item.kbPrice)}</span>
                              )}
                              {item.askingPrice && (
                                <span style={{ fontSize: '10px', color: '#80868b' }}>호가 {formatPrice(item.askingPrice)}</span>
                              )}
                              {item.highestPrice && (
                                <span style={{ fontSize: '10px', color: '#80868b' }}>전고점 {formatPrice(item.highestPrice)}</span>
                              )}
                              {item.lowestPrice && (
                                <span style={{ fontSize: '10px', color: '#80868b' }}>전저점 {formatPrice(item.lowestPrice)}</span>
                              )}
                              {(item.tenYearChangeAmount || item.tenYearChangeRate != null) && (
                                <span style={{ fontSize: '10px', color: '#80868b' }}>
                                  10년{item.tenYearChangeAmount ? ` ${formatPrice(item.tenYearChangeAmount)}` : ''}
                                  {item.tenYearChangeRate != null ? ` (${item.tenYearChangeRate}%)` : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* 거래량 이력 — MOLIT 실거래 10년 */}
        <div style={{ marginBottom: '16px', borderTop: '1px solid #f0f0f0', paddingTop: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: 0 }}>거래량 이력</h3>
            {tradeCollected && !tradeCollecting && (
              <>
                {/* 기간 단위 토글 */}
                {(['month', 'quarter', 'year'] as const).map(g => (
                  <button key={g} onClick={() => setTradeGranularity(g)} style={{
                    fontSize: '11px', padding: '2px 7px',
                    border: `1px solid ${tradeGranularity === g ? '#4BAAD4' : '#dadce0'}`,
                    borderRadius: '4px', background: tradeGranularity === g ? '#e0f4fb' : '#fff',
                    color: tradeGranularity === g ? '#1a73e8' : '#5f6368', cursor: 'pointer',
                  }}>{g === 'month' ? '월별' : g === 'quarter' ? '분기별' : '연별'}</button>
                ))}
                {/* 평형 필터 */}
                {(() => {
                  const areas = Array.from(new Set(
                    tradeHistory.flatMap(m => Object.keys(m.areaBreakdown))
                  )).sort((a, b) => (parseFloat(a) || 999) - (parseFloat(b) || 999));
                  if (areas.length <= 1) return null;
                  return (
                    <select value={tradeAreaFilter} onChange={e => setTradeAreaFilter(e.target.value)}
                      style={{ fontSize: '11px', padding: '2px 5px', border: '1px solid #dadce0', borderRadius: '4px' }}>
                      <option value="전체">전체 평형</option>
                      {areas.map(a => <option key={a} value={a}>{a}㎡</option>)}
                    </select>
                  );
                })()}
                <button onClick={handleCollectTradeHistory} style={{
                  fontSize: '11px', padding: '2px 7px', border: '1px solid #dadce0',
                  borderRadius: '4px', background: '#fff', color: '#9aa0a6', cursor: 'pointer', marginLeft: 'auto',
                }}>재수집</button>
              </>
            )}
            {!tradeCollected && !tradeCollecting && (
              <button onClick={handleCollectTradeHistory} style={{
                fontSize: '11px', padding: '2px 8px', border: '1px solid #4BAAD4',
                borderRadius: '4px', background: '#fff', color: '#4BAAD4', cursor: 'pointer',
              }}>10년 데이터 수집</button>
            )}
            {tradeCollecting && (
              <span style={{ fontSize: '11px', color: '#9aa0a6' }}>수집 중… (2~3분 소요)</span>
            )}
          </div>

          {!tradeCollected && !tradeCollecting && (
            <div style={{ fontSize: '12px', color: '#9aa0a6' }}>
              국토교통부 실거래가 기준 10년 거래량 데이터를 수집합니다.
            </div>
          )}

          {tradeCollected && tradeHistory.length > 0 && (() => {
            // 단위별 집계
            const aggregated: { label: string; count: number; direct: number }[] = [];

            if (tradeGranularity === 'month') {
              tradeHistory.forEach(m => {
                const count = tradeAreaFilter === '전체'
                  ? m.tradeCount
                  : (m.areaBreakdown[tradeAreaFilter]?.count ?? 0);
                aggregated.push({ label: m.yearMonth, count, direct: m.directCount });
              });
            } else if (tradeGranularity === 'quarter') {
              const qMap = new Map<string, { count: number; direct: number }>();
              tradeHistory.forEach(m => {
                const y = m.yearMonth.slice(0, 4);
                const mo = parseInt(m.yearMonth.slice(4));
                const q = Math.ceil(mo / 3);
                const key = `${y}Q${q}`;
                const count = tradeAreaFilter === '전체' ? m.tradeCount : (m.areaBreakdown[tradeAreaFilter]?.count ?? 0);
                const cur = qMap.get(key) ?? { count: 0, direct: 0 };
                qMap.set(key, { count: cur.count + count, direct: cur.direct + m.directCount });
              });
              qMap.forEach((v, k) => aggregated.push({ label: k, count: v.count, direct: v.direct }));
            } else {
              const yMap = new Map<string, { count: number; direct: number }>();
              tradeHistory.forEach(m => {
                const y = m.yearMonth.slice(0, 4);
                const count = tradeAreaFilter === '전체' ? m.tradeCount : (m.areaBreakdown[tradeAreaFilter]?.count ?? 0);
                const cur = yMap.get(y) ?? { count: 0, direct: 0 };
                yMap.set(y, { count: cur.count + count, direct: cur.direct + m.directCount });
              });
              yMap.forEach((v, k) => aggregated.push({ label: k, count: v.count, direct: v.direct }));
            }

            const maxCount = Math.max(...aggregated.map(d => d.count), 1);

            return (
              <div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={aggregated} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9aa0a6' }}
                      interval={tradeGranularity === 'month' ? 11 : 0} />
                    <YAxis tick={{ fontSize: 9, fill: '#9aa0a6' }} allowDecimals={false} />
                    <Tooltip
                      formatter={(v: number, name: string) => [
                        `${v}건`, name === 'count' ? '총 거래' : '직거래'
                      ]}
                      labelFormatter={(l: string) => `${l}`}
                      contentStyle={{ fontSize: '11px' }}
                    />
                    <Bar dataKey="count" maxBarSize={24} radius={[2, 2, 0, 0]}>
                      {aggregated.map((d, i) => (
                        <Cell key={i}
                          fill={d.count === 0 ? '#f0f0f0' : d.count >= maxCount * 0.7 ? '#E06060' : d.count >= maxCount * 0.35 ? '#FFD97D' : '#89CFF0'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* 요약 — 연간 평균 거래량 */}
                {(() => {
                  const total = aggregated.reduce((s, d) => s + d.count, 0);
                  const years = tradeGranularity === 'year'
                    ? aggregated.length
                    : tradeGranularity === 'quarter'
                    ? aggregated.length / 4
                    : aggregated.length / 12;
                  const annualAvg = years > 0 ? Math.round(total / years) : 0;
                  const directTotal = aggregated.reduce((s, d) => s + d.direct, 0);
                  const directPct = total > 0 ? Math.round(directTotal / total * 100) : 0;
                  return (
                    <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '4px', display: 'flex', gap: '12px' }}>
                      <span>10년 합계 <b style={{ color: '#344054' }}>{total.toLocaleString()}건</b></span>
                      <span>연 평균 <b style={{ color: '#344054' }}>{annualAvg}건</b></span>
                      <span>직거래 <b style={{ color: '#344054' }}>{directPct}%</b></span>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>

        {/* 네이버 호가 감시 — 단지번호 등록 + 스냅샷 이력 */}
        <div style={{ marginBottom: '16px', borderTop: '1px solid #f0f0f0', paddingTop: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: 0 }}>네이버 호가 감시</h3>
            {!editingNaverNo && (
              <button
                onClick={() => { setEditingNaverNo(true); setNaverNoInput(complex.naverComplexNumber ?? ''); }}
                style={{ fontSize: '11px', padding: '2px 8px', border: '1px solid #4BAAD4', borderRadius: '4px', background: '#fff', color: '#4BAAD4', cursor: 'pointer' }}
              >
                {complex.naverComplexNumber ? '수정' : '등록'}
              </button>
            )}
          </div>
          {editingNaverNo ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="text"
                value={naverNoInput}
                onChange={e => setNaverNoInput(e.target.value)}
                placeholder="네이버 단지번호 (예: 3030)"
                onKeyDown={e => e.key === 'Enter' && handleSaveNaverNo()}
                style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
              />
              <button
                onClick={handleSaveNaverNo}
                disabled={naverNoSaving}
                style={{ padding: '6px 10px', background: '#4BAAD4', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
              >
                저장
              </button>
              <button
                onClick={() => setEditingNaverNo(false)}
                style={{ padding: '6px 10px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
              >
                취소
              </button>
            </div>
          ) : complex.naverComplexNumber ? (
            <div style={{ fontSize: '12px', color: '#5f6368', marginBottom: '8px' }}>
              단지번호: <b>{complex.naverComplexNumber}</b> · 2시간 주기 자동 수집 (09~19시 KST)
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#9aa0a6' }}>
              네이버 부동산 단지번호를 등록하면 호가를 2시간마다 자동으로 수집합니다.
            </div>
          )}

          {/* 스냅샷 이력 */}
          {snapshotsLoading && (
            <div style={{ fontSize: '12px', color: '#9aa0a6', padding: '4px 0' }}>이력 로드 중...</div>
          )}
          {!snapshotsLoading && priceSnapshots.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '11px', color: '#9aa0a6', marginBottom: '6px' }}>최근 수집 이력 (최저호가 기준)</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #e8eaed' }}>
                      <th style={{ padding: '4px 6px', textAlign: 'left', color: '#5f6368', fontWeight: 600 }}>수집시각</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right', color: '#5f6368', fontWeight: 600 }}>매물수</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right', color: '#5f6368', fontWeight: 600 }}>최저호가</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right', color: '#5f6368', fontWeight: 600 }}>평균호가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceSnapshots.map((snap, idx) => {
                      const prev = priceSnapshots[idx + 1];
                      const minDiff = prev && snap.minPrice != null && prev.minPrice != null
                        ? snap.minPrice - prev.minPrice : null;
                      return (
                        <tr key={snap.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '4px 6px', color: '#5f6368' }}>
                            {new Date(snap.collectedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>{snap.totalCount}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#202124' }}>
                            {snap.minPrice != null ? `${toUkUnit(snap.minPrice)}억` : '-'}
                            {minDiff != null && minDiff !== 0 && (
                              <span style={{ marginLeft: '4px', fontSize: '10px', color: minDiff > 0 ? '#E06060' : '#4BAAD4' }}>
                                {minDiff > 0 ? '▲' : '▼'}{toUkUnit(Math.abs(minDiff))}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#5f6368' }}>
                            {snap.avgPrice != null ? `${toUkUnit(snap.avgPrice)}억` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* 평형별 최신 스냅샷 상세 */}
              {priceSnapshots[0] && Object.keys(priceSnapshots[0].priceByArea).length > 0 && (
                <details style={{ marginTop: '10px' }}>
                  <summary style={{ fontSize: '11px', color: '#9aa0a6', cursor: 'pointer' }}>
                    최신 평형별 상세 ({new Date(priceSnapshots[0].collectedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })})
                  </summary>
                  <div style={{ marginTop: '6px' }}>
                    {Object.entries(priceSnapshots[0].priceByArea)
                      .sort(([a], [b]) => (parseFloat(a) || 999) - (parseFloat(b) || 999))
                      .map(([area, info]) => (
                        <div key={area} style={{ marginBottom: '6px', backgroundColor: '#f8f9fa', borderRadius: '4px', padding: '6px 8px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#344054', marginBottom: '4px' }}>
                            {area}㎡ · {info.count}건 · 최저 {toUkUnit(info.min)}억 · 평균 {toUkUnit(info.avg)}억
                          </div>
                          {(info as any).items && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {((info as any).items as Array<{ price: number; floor: number | null }>).map((it, i) => (
                                <span key={i} style={{ fontSize: '10px', padding: '1px 5px', background: '#e8f4fd', borderRadius: '3px', color: '#1a73e8' }}>
                                  {it.floor != null ? `${it.floor}층 ` : ''}{toUkUnit(it.price)}억
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* 시세 입력 폼 */}
        {showInputForm ? (
          <PriceInputForm
            complexId={complex.id}
            complexName={complex.complexName}
            onSubmit={handlePriceSubmit}
            onCancel={() => setShowInputForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowInputForm(true)}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#fff',
              color: '#4BAAD4',
              border: '2px dashed #1a73e8',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '16px',
            }}
          >
            + 시세 입력하기
          </button>
        )}


        {/* 단지 삭제 — 실수 방지를 위해 2단계 확인 */}
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px', marginBottom: '16px' }}>
          {deleteConfirm ? (
            <div style={{ backgroundColor: '#FFE8E8', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '13px', color: '#E06060', fontWeight: 600, marginBottom: '8px' }}>
                정말 삭제하시겠습니까?
              </div>
              <div style={{ fontSize: '12px', color: '#80868b', marginBottom: '10px' }}>
                {complex.complexName}의 모든 시세 기록도 함께 삭제됩니다.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: '8px', fontSize: '13px', fontWeight: 600,
                    backgroundColor: deleting ? '#9e9e9e' : '#E06060',
                    color: '#fff', border: 'none', borderRadius: '6px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {deleting ? '삭제 중...' : '삭제 확인'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: '8px', fontSize: '13px',
                    backgroundColor: '#fff', color: '#5f6368',
                    border: '1px solid #dadce0', borderRadius: '6px', cursor: 'pointer',
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(true)}
              style={{
                width: '100%', padding: '10px', fontSize: '13px',
                backgroundColor: '#fff', color: '#E06060',
                border: '1px solid #c5221f', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              단지 삭제
            </button>
          )}
        </div>
      </div>

      {/* 사진 슬라이드 모달 */}
      {showPhotoModal && (
        <PhotoSlideModal
          complexId={complex.id}
          complexName={complex.complexName}
          onClose={() => setShowPhotoModal(false)}
        />
      )}

      {/* 전고점 대비 바 차트 모달 */}
      {showPeakChart && selectedRefItem?.highestPrice && (
        <div
          onClick={() => setShowPeakChart(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', minWidth: '320px', maxWidth: '420px', width: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#344054' }}>
                전고점 대비 {selectedRefTab && `(${selectedRefTab})`}
              </span>
              <button onClick={() => setShowPeakChart(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#80868b', lineHeight: 1 }}>×</button>
            </div>
            {(() => {
              const h = selectedRefItem.highestPrice!;
              const rows = [
                { label: '전고점', v: h, ref: true },
                selectedRefItem.price      && { label: '매매가', v: selectedRefItem.price },
                selectedRefItem.kbPrice    && { label: 'KB시세', v: selectedRefItem.kbPrice },
                selectedRefItem.askingPrice && { label: '호가',   v: selectedRefItem.askingPrice },
              ].filter(Boolean) as { label: string; v: number; ref?: boolean }[];
              const maxV = Math.max(...rows.map(r => r.v));
              return rows.map(({ label, v, ref }) => {
                const pct = +((v - h) / h * 100).toFixed(1);
                const barRatio = (v / maxV) * 100;
                const barColor = ref ? '#90a4ae' : pct >= 0 ? '#42a5f5' : '#ef5350';
                return (
                  <div key={label} style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: ref ? '#80868b' : '#344054', fontWeight: ref ? 400 : 600 }}>{label}</span>
                      <span style={{ fontSize: '12px', color: ref ? '#80868b' : pct >= 0 ? '#1565c0' : '#c62828', fontWeight: 600 }}>
                        {formatPrice(v)}{!ref && ` (${pct >= 0 ? '▲' : '▼'}${Math.abs(pct)}%)`}
                      </span>
                    </div>
                    <div style={{ background: '#f0f0f0', borderRadius: '4px', height: '12px', overflow: 'hidden' }}>
                      <div style={{ width: `${barRatio}%`, background: barColor, height: '100%', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              });
            })()}
            <p style={{ fontSize: '11px', color: '#bdbdbd', margin: '16px 0 0', textAlign: 'center' }}>배경 클릭으로 닫기</p>
          </div>
        </div>
      )}

      {/* 서울 지하철 노선도 뷰어 */}
      {showMetroMap && (
        <div
          onClick={() => setShowMetroMap(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 99999, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* 컨트롤 바 */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '12px', background: 'rgba(255,255,255,0.1)',
              borderRadius: '20px', padding: '6px 16px',
            }}
          >
            <button
              onClick={() => setMetroZoom(z => Math.max(0.3, +(z - 0.2).toFixed(1)))}
              style={{ background: 'none', border: '1px solid #fff', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
            >−</button>
            <span style={{ color: '#fff', fontSize: '13px', minWidth: '40px', textAlign: 'center' }}>{Math.round(metroZoom * 100)}%</span>
            <button
              onClick={() => setMetroZoom(z => Math.min(5, +(z + 0.2).toFixed(1)))}
              style={{ background: 'none', border: '1px solid #fff', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
            >+</button>
            <button
              onClick={() => { setMetroZoom(1); setMetroPan({ x: 0, y: 0 }); }}
              style={{ background: 'none', border: '1px solid #aaa', color: '#ccc', borderRadius: '12px', padding: '2px 10px', cursor: 'pointer', fontSize: '12px', marginLeft: '4px' }}
            >초기화</button>
            <button
              onClick={() => setShowMetroMap(false)}
              style={{ background: 'none', border: '1px solid #aaa', color: '#ccc', borderRadius: '12px', padding: '2px 10px', cursor: 'pointer', fontSize: '12px', marginLeft: '4px' }}
            >닫기</button>
          </div>

          {/* 이미지 영역 */}
          <div
            onClick={e => e.stopPropagation()}
            onWheel={e => {
              e.preventDefault();
              setMetroZoom(z => Math.min(5, Math.max(0.3, +(z - e.deltaY * 0.001).toFixed(3))));
            }}
            onMouseDown={e => {
              metroDragRef.current = { startX: e.clientX, startY: e.clientY, panX: metroPan.x, panY: metroPan.y };
            }}
            onMouseMove={e => {
              if (!metroDragRef.current) return;
              setMetroPan({
                x: metroDragRef.current.panX + (e.clientX - metroDragRef.current.startX),
                y: metroDragRef.current.panY + (e.clientY - metroDragRef.current.startY),
              });
            }}
            onMouseUp={() => { metroDragRef.current = null; }}
            onMouseLeave={() => { metroDragRef.current = null; }}
            style={{
              overflow: 'hidden', cursor: metroZoom > 1 ? 'grab' : 'default',
              maxWidth: '90vw', maxHeight: '80vh',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <img
              src="/seoul-metro-map.png"
              alt="서울 지하철 노선도"
              draggable={false}
              style={{
                transform: `translate(${metroPan.x}px, ${metroPan.y}px) scale(${metroZoom})`,
                transformOrigin: 'center center',
                transition: metroDragRef.current ? 'none' : 'transform 0.1s',
                maxWidth: '85vw', maxHeight: '75vh',
                userSelect: 'none',
              }}
            />
          </div>
          <p style={{ color: '#888', fontSize: '11px', marginTop: '10px' }}>스크롤로 줌 · 드래그로 이동 · 배경 클릭으로 닫기</p>
        </div>
      )}
    </div>
  );
};

export default ComplexInfoPanel;
