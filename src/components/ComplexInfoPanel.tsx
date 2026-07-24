import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApartmentComplex, PriceHistory, PriceHistoryRequest, ChartDataRow, ChartSeries, formatPrice, toUkUnit, SchoolInfo, InfraInfo, calcCommuteGrade, OverlayMarker } from '../types';
import api, { getPriceHistories, addPriceHistory, updateComplexMemo, deleteComplex, getComplexById, addSchoolInfos, updateSchoolInfo, deleteSchoolInfo, addInfraInfos, updateInfraInfo, deleteInfraInfo, toggleFavorite, updatePriceHistoryItem, updateVisitType } from '../services/api';
import PriceChart from './PriceChart';
import PriceInputForm from './PriceInputForm';
import CommuteGradeBadge from './CommuteGradeBadge';
import PhotoSlideModal from './PhotoSlideModal';
import { useNumberedTextarea } from '../hooks/useNumberedTextarea';

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
  if (best >= 95) return { grade: 'S', color: '#ea4335' };
  if (best >= 90) return { grade: 'A', color: '#f9ab00' };
  if (best >= 85) return { grade: 'B', color: '#34a853' };
  return { grade: 'C', color: '#1a73e8' };
};

// 인프라 등급 — 백화점 2개↑=S, 1개=A, 대형마트 1개↑=B, 그외=C / 인프라 없어도 항상 표시
const calcInfraGrade = (
  infraInfos: InfraInfo[]
): { grade: 'S' | 'A' | 'B' | 'C'; color: string } => {
  const deptCount = infraInfos.filter(i => i.infraType === 'DEPARTMENT_STORE').length;
  const martCount = infraInfos.filter(i => i.infraType === 'MART').length;
  if (deptCount >= 2) return { grade: 'S', color: '#ea4335' };
  if (deptCount >= 1) return { grade: 'A', color: '#f9ab00' };
  if (martCount >= 1) return { grade: 'B', color: '#34a853' };
  return { grade: 'C', color: '#1a73e8' };
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
  S: '#ea4335', A: '#f9ab00', B: '#34a853', C: '#1a73e8',
};

// 만 단위 축약 (240689 → "24만", 9500 → "9,500")
const formatCount = (n: number): string =>
  n >= 10000 ? `${Math.round(n / 10000)}만` : n.toLocaleString();

// 매매가: 파란 계열 / 전세가: 빨간 계열 — 평형 수만큼 순환 사용
const SALE_COLORS = ['#1a73e8', '#4285f4', '#185abc', '#669df6'];

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
const JEONSE_COLORS = ['#ea4335', '#c62828', '#ef5350', '#e57373'];

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

  const rows: ChartDataRow[] = histories.map(h => {
    const row: ChartDataRow = { date: h.recordDate };
    h.items.forEach(item => {
      const at = item.areaType || '';
      if (!at) return;
      if (item.price) row[`${at}-sale`] = toUkUnit(item.price);
      if (item.jeonsePrice) row[`${at}-jeonse`] = toUkUnit(item.jeonsePrice);
    });
    return row;
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

  // 참고가 평형 탭 선택 상태 — priceHistories 로드 후 첫 번째 areaType으로 초기화
  const [selectedRefTab, setSelectedRefTab] = useState<string>('');

  // 참고가 인라인 편집 상태
  const [editingRefPrice, setEditingRefPrice] = useState(false);
  const [refPriceForm, setRefPriceForm] = useState({
    askingPriceUk: '', highestPriceUk: '', lowestPriceUk: '',
    tenYearAmountStr: '', tenYearRateStr: '',
  });
  const [refPriceSaving, setRefPriceSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 학군 편집 상태 — editingSchool: 기존 항목 수정 폼, newSchoolRows: 신규 추가 행 배열
  const [editingSchool, setEditingSchool] = useState<SchoolEditState | null>(null);
  const [newSchoolRows, setNewSchoolRows] = useState<SchoolAddRow[]>([]);
  const [savingNewSchools, setSavingNewSchools] = useState(false);
  // 인프라 편집 상태 — editingInfra: 기존 항목 수정 폼, newInfraRows: 신규 추가 행 배열
  const [editingInfra, setEditingInfra] = useState<InfraEditState | null>(null);
  const [newInfraRows, setNewInfraRows] = useState<InfraAddRow[]>([]);
  const [savingNewInfras, setSavingNewInfras] = useState(false);
  // 추가 행 localId 생성용 카운터 — useRef로 관리해 리렌더 시 초기화 방지
  const schoolRowCounter = useRef(0);
  const infraRowCounter = useRef(0);

  // 종합평가 카드 클릭 시 해당 섹션으로 스크롤
  const workSectionRef = useRef<HTMLDivElement>(null);
  const commuteSectionRef = useRef<HTMLDivElement>(null);
  const schoolSectionRef = useRef<HTMLDivElement>(null);
  const infraSectionRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    if (priceHistories.length > 0 && !selectedRefTab) {
      const first = priceHistories[priceHistories.length - 1].items[0]?.areaType || '';
      setSelectedRefTab(first);
    }
  }, [priceHistories, selectedRefTab]);

  // 단지 변경 시 좌표가 저장된 학교·인프라를 오버레이 마커로 지도에 전달
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
    (complex?.infraInfos ?? []).forEach(inf => {
      if (inf.latitude != null && inf.longitude != null) {
        markers.push({ id: `infra-${inf.id}`, name: inf.infraName, lat: inf.latitude, lng: inf.longitude, markerType: 'infra', subType: inf.infraType });
      }
    });
    onOverlayMarkersChange(markers);
  }, [complex, onOverlayMarkersChange]);

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
      // 참고가 탭·편집 상태도 초기화 — 다른 단지 선택 시 폼 닫기
      setSelectedRefTab('');
      setEditingRefPrice(false);
      // 학군/인프라 편집·추가 상태도 초기화 — 다른 단지 선택 시 이전 폼 닫기
      setEditingSchool(null);
      setNewSchoolRows([]);
      setSavingNewSchools(false);
      setEditingInfra(null);
      setNewInfraRows([]);
      setSavingNewInfras(false);
      loadPriceHistories(complex.id);
    }
  }, [complex, loadPriceHistories, onRadiusToggle]);

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

  // 현재 선택된 탭에 해당하는 최신 시세 아이템 반환 헬퍼
  const getSelectedRefItem = () => {
    const latest = priceHistories.length > 0 ? priceHistories[priceHistories.length - 1] : null;
    return latest?.items.find(i => i.areaType === selectedRefTab) ?? latest?.items[0] ?? null;
  };

  // 참고가 편집 시작 — 선택된 탭 areaType의 기존 값으로 폼 초기화
  const startEditRefPrice = () => {
    const item = getSelectedRefItem();
    setRefPriceForm({
      askingPriceUk: item?.askingPrice ? String(item.askingPrice / 100_000_000) : '',
      highestPriceUk: item?.highestPrice ? String(item.highestPrice / 100_000_000) : '',
      lowestPriceUk: item?.lowestPrice ? String(item.lowestPrice / 100_000_000) : '',
      tenYearAmountStr: item?.tenYearChangeAmount != null ? String(item.tenYearChangeAmount / 100_000_000) : '',
      tenYearRateStr: item?.tenYearChangeRate != null ? String(item.tenYearChangeRate) : '',
    });
    setEditingRefPrice(true);
  };

  // 참고가 저장 — PATCH /api/complexes/:id/price-history-items/:itemId
  const saveRefPrice = async () => {
    const item = getSelectedRefItem();
    if (!complex || !item?.id) return;
    setRefPriceSaving(true);
    try {
      const f = refPriceForm;
      await updatePriceHistoryItem(complex.id, item.id, {
        askingPrice: f.askingPriceUk ? Math.round(parseFloat(f.askingPriceUk) * 100_000_000) : undefined,
        highestPrice: f.highestPriceUk ? Math.round(parseFloat(f.highestPriceUk) * 100_000_000) : undefined,
        lowestPrice: f.lowestPriceUk ? Math.round(parseFloat(f.lowestPriceUk) * 100_000_000) : undefined,
        tenYearChangeAmount: f.tenYearAmountStr ? Math.round(parseFloat(f.tenYearAmountStr) * 100_000_000) : undefined,
        tenYearChangeRate: f.tenYearRateStr ? parseFloat(f.tenYearRateStr) : undefined,
      });
      await loadPriceHistories(complex.id);
      setEditingRefPrice(false);
    } catch {
      // 에러는 콘솔에만 — 인터셉터가 이미 출력
    } finally {
      setRefPriceSaving(false);
    }
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
  const handleNewSchoolSearch = async (localId: number) => {
    const row = newSchoolRows.find(r => r.localId === localId);
    if (!row || !row.schoolName.trim()) return;
    updateNewSchoolRow(localId, { fetching: true, showDropdown: false });
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', { params: { query: row.schoolName.trim() } });
      updateNewSchoolRow(localId, { fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 });
    } catch {
      updateNewSchoolRow(localId, { fetching: false });
    }
  };

  // 추가 행 검색 결과 선택 — 주소·좌표 자동 입력 후 도보 거리 계산
  const handleNewSchoolSelect = async (localId: number, item: SearchItem) => {
    if (!complex) return;
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

  // 수정 폼 학교명 검색
  const handleSchoolSearch = async () => {
    if (!editingSchool) return;
    const query = editingSchool.schoolName.trim();
    if (!query) return;
    setEditingSchool(prev => prev ? { ...prev, fetching: true, showDropdown: false } : null);
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', { params: { query } });
      setEditingSchool(prev => prev ? { ...prev, fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 } : null);
    } catch {
      setEditingSchool(prev => prev ? { ...prev, fetching: false } : null);
    }
  };

  // 수정 폼 드롭다운 항목 선택 — 주소·좌표 자동 입력 + 도보거리 계산
  const handleSchoolSelect = async (item: SearchItem) => {
    if (!editingSchool || !complex) return;
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

  // 추가 행 인프라 검색
  const handleNewInfraSearch = async (localId: number) => {
    const row = newInfraRows.find(r => r.localId === localId);
    if (!row || !row.infraName.trim()) return;
    updateNewInfraRow(localId, { fetching: true, showDropdown: false });
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', { params: { query: row.infraName.trim() } });
      updateNewInfraRow(localId, { fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 });
    } catch {
      updateNewInfraRow(localId, { fetching: false });
    }
  };

  // 추가 행 검색 결과 선택 — 주소·좌표 자동 입력 후 도보 거리 계산
  const handleNewInfraSelect = async (localId: number, item: SearchItem) => {
    if (!complex) return;
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
    setEditingInfra(prev => prev ? { ...prev, fetching: true, showDropdown: false } : null);
    try {
      const { data } = await api.get<{ items: SearchItem[] }>('/api/search/local', { params: { query } });
      setEditingInfra(prev => prev ? { ...prev, fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 } : null);
    } catch {
      setEditingInfra(prev => prev ? { ...prev, fetching: false } : null);
    }
  };

  // 수정 폼 드롭다운 항목 선택
  const handleInfraSelect = async (item: SearchItem) => {
    if (!editingInfra || !complex) return;
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

  // 현재 선택된 탭의 최신 시세 아이템
  const selectedRefItem = latestHistory?.items.find(i => i.areaType === selectedRefTab)
    ?? latestHistory?.items[0] ?? null;

  // latestHistory에서 areaType 별 탭 목록
  const refTabList = latestHistory?.items.map(i => i.areaType ?? '').filter(Boolean) ?? [];

  // 차트에 표시되는 평형 목록 (선택박스 옵션 생성용, 중복 제거)
  const seen = new Set<string>();
  const areaTypes: string[] = [];
  chartData.series.forEach(s => {
    if (!seen.has(s.areaType)) { seen.add(s.areaType); areaTypes.push(s.areaType); }
  });

  // 선택된 타입의 대표 매매가로 변동폭 계산 — 전체일 때는 첫 번째 평형 기준
  const getPriceForType = (history: typeof latestHistory) => {
    if (!history) return undefined;
    if (selectedAreaType) return history.items.find(i => i.areaType === selectedAreaType)?.price;
    return history.items[0]?.price;
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
          borderBottom: '1px solid #e8eaed',
          backgroundColor: '#1a73e8',
          color: '#fff',
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
            <h2 style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.3 }}>
              {complex.complexName}
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
        {(latestHistory?.items.some(i => i.price) || complex.price) && (
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* 평형별 가격 표시 — latestHistory 있으면 areaType별, 없으면 단일 대표가 */}
            <div style={{ fontSize: '15px', fontWeight: 700, display: 'flex', flexWrap: 'wrap', gap: '2px', flex: 1 }}>
              {latestHistory?.items.filter(i => i.price).length
                ? latestHistory!.items.filter(i => i.price).map((item, idx) => (
                    <span key={item.areaType ?? idx} style={{ whiteSpace: 'nowrap' }}>
                      {idx > 0 && <span style={{ opacity: 0.5, margin: '0 3px' }}>|</span>}
                      {formatPrice(item.price!)}
                      {item.areaType && (
                        <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8, marginLeft: '2px' }}>
                          ({item.areaType})
                        </span>
                      )}
                    </span>
                  ))
                : <span style={{ fontSize: '20px' }}>{formatPrice(complex.price)}</span>
              }
            </div>
            {/* 즐겨찾기 버튼 — 노란별(활성)/회색별(비활성), 낙관적 업데이트 */}
            <button
              onClick={handleToggleFavorite}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: 0, color: isFavorite ? '#f9ab00' : 'rgba(255,255,255,0.4)', flexShrink: 0 }}
            >★</button>
            {/* 사진 보기 버튼 */}
            <button
              onClick={() => setShowPhotoModal(true)}
              title="사진 보기"
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0, color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}
            >📷</button>
          </div>
        )}
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
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>
            단지 정보
          </h3>
          <InfoRow label="연식" value={complex.builtYear} />
          <InfoRow label="세대수" value={complex.unitCount ? `${complex.unitCount}세대` : null} />
          <InfoRow label="주소" value={complex.address} />
          <InfoRow label="확인일자" value={complex.checkDate} />
          {/* 평형 탭 + 수정 버튼 — latestHistory에 areaType이 있을 때 표시 */}
          {refTabList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 0 4px', borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
              {refTabList.length > 1 && refTabList.map(at => (
                <button
                  key={at}
                  onClick={() => { setSelectedRefTab(at); setEditingRefPrice(false); }}
                  style={{
                    padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    backgroundColor: selectedRefTab === at ? '#1a73e8' : '#f1f3f4',
                    color: selectedRefTab === at ? '#fff' : '#5f6368',
                  }}
                >
                  {at}
                </button>
              ))}
              {/* 수정 버튼 — 탭 행 오른쪽 끝 */}
              {!editingRefPrice && (
                <button
                  onClick={startEditRefPrice}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#1a73e8', padding: '0 2px', marginLeft: 'auto' }}
                  title="참고가 수정"
                >✏</button>
              )}
            </div>
          )}
          {/* 참고가 — 편집 모드일 때는 인라인 폼, 아닐 때는 선택 탭 기준 읽기 전용 표시 */}
          {editingRefPrice ? (
            <div style={{ paddingTop: '8px' }}>
              {/* 호가 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, width: '60px' }}>호가</span>
                <input
                  type="text"
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
                  type="text"
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
                  type="text"
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
                  style={{ flex: 1, padding: '6px 0', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: refPriceSaving ? 'not-allowed' : 'pointer', opacity: refPriceSaving ? 0.7 : 1 }}
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
              <InfoRow label="호가" value={selectedRefItem?.askingPrice ? formatPrice(selectedRefItem.askingPrice) : null} />
              <InfoRow label="전고점" value={selectedRefItem?.highestPrice ? formatPrice(selectedRefItem.highestPrice) : null} />
              <InfoRow label="전저점" value={selectedRefItem?.lowestPrice ? formatPrice(selectedRefItem.lowestPrice) : null} />
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
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#1a73e8', padding: '0 2px' }}
                  title="메모 편집"
                >
                  ✏
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
                  rows={3}
                  style={{
                    width: '100%', padding: '6px 8px', fontSize: '13px',
                    border: '1px solid #1a73e8', borderRadius: '6px',
                    resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                {memoError && (
                  <div style={{ fontSize: '12px', color: '#c5221f', marginTop: '4px' }}>{memoError}</div>
                )}
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    onClick={handleMemoSave}
                    disabled={memoSaving}
                    style={{
                      flex: 1, padding: '6px', fontSize: '12px', fontWeight: 600,
                      backgroundColor: memoSaving ? '#9e9e9e' : '#1a73e8',
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
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>종합평가</h3>
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

        {/* 지하철 정보 — subwayInfos 배열로 여러 노선 표시 */}
        {complex.subwayInfos && complex.subwayInfos.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>
              지하철
            </h3>
            {complex.subwayInfos.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <span style={{ fontSize: '13px', color: '#202124' }}>{s.stationName}</span>
                <span style={{ fontSize: '12px', color: '#80868b' }}>
                  {s.subwayLines}{s.walkingMinutes ? ` · 도보 ${s.walkingMinutes}분` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 직장 밀도 */}
        {complex.grade && (
          <div ref={workSectionRef} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368' }}>직장</h3>
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

        {/* 교통 (주요 지구 소요시간) */}
        {complex.commuteTimes && complex.commuteTimes.length > 0 && (
          <div ref={commuteSectionRef} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368' }}>
                교통
              </h3>
              <CommuteGradeBadge commuteTimes={complex.commuteTimes} />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '6px',
              }}
            >
              {complex.commuteTimes.map((ct) => (
                <div
                  key={ct.id}
                  style={{
                    textAlign: 'center',
                    padding: '8px 4px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #e8eaed',
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '2px' }}>
                    {ct.destination}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a73e8' }}>
                    {ct.minutes}분
                  </div>
                  {ct.transferCount != null && (
                    <div style={{ fontSize: '10px', color: ct.transferCount === 0 ? '#34a853' : '#80868b', marginTop: '2px' }}>
                      {ct.transferCount === 0 ? '직통' : `환승 ${ct.transferCount}회`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 학군 — 기존 데이터나 추가 행이 있을 때 섹션 표시 */}
        {((complex.schoolInfos && complex.schoolInfos.length > 0) || newSchoolRows.length > 0) && (
          <div ref={schoolSectionRef} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368' }}>학군</h3>
              {(() => {
                const g = calcSchoolGrade(complex.schoolInfos ?? []);
                return g ? (
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', backgroundColor: g.color, padding: '1px 8px', borderRadius: '10px' }}>
                    {g.grade}
                  </span>
                ) : null;
              })()}
            </div>

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
                        onKeyDown={e => { if (e.key === 'Enter') handleSchoolSearch(); }}
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
                        style={{ flex: 1, padding: '7px', fontSize: '12px', fontWeight: 600, backgroundColor: editingSchool.saving ? '#9e9e9e' : '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
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
                        color={s.schoolType === 'MIDDLE' ? '#1a73e8' : '#34a853'}
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
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#c5221f', padding: '0 2px', flexShrink: 0 }}
                        title="삭제">🗑</button>
                    </div>
                    {(s.achievementScore != null || s.totalStudents != null) && (
                      <div style={{ display: 'flex', gap: '12px', paddingLeft: '2px' }}>
                        {s.achievementScore != null && (
                          <span style={{ fontSize: '11px', color: '#5f6368' }}>학업성취도 {s.achievementScore}%</span>
                        )}
                        {s.totalStudents != null && (
                          <span style={{ fontSize: '11px', color: '#5f6368' }}>전교생 {s.totalStudents.toLocaleString()}명</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* 신규 추가 행 배열 — 여러 행을 쌓아두고 일괄 저장 */}
            {newSchoolRows.map((row, idx) => (
              <div key={row.localId} style={{ border: '1px dashed #1a73e8', borderRadius: '8px', padding: '10px', marginTop: '6px', backgroundColor: '#f8fbff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a73e8' }}>추가 {idx + 1}</span>
                  <button onClick={() => removeNewSchoolRow(row.localId)}
                    style={{ border: 'none', background: 'none', color: '#c5221f', cursor: 'pointer', fontSize: '16px' }}>×</button>
                </div>
                {/* 검색 행 */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  <input
                    placeholder="예) 영등포초등학교"
                    value={row.schoolName}
                    onChange={e => updateNewSchoolRow(row.localId, { schoolName: e.target.value, showDropdown: false })}
                    onKeyDown={e => { if (e.key === 'Enter') handleNewSchoolSearch(row.localId); }}
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

            {/* 하단 버튼 행 — 행 추가 + 일괄 저장 */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              {/* 수정 폼이 열려 있지 않을 때만 추가 버튼 표시 */}
              {!editingSchool && (
                <button onClick={startAddSchool}
                  style={{ flex: 1, padding: '6px', fontSize: '12px', border: '1px dashed #1a73e8', borderRadius: '6px', backgroundColor: 'transparent', color: '#1a73e8', cursor: 'pointer' }}>
                  + 학교 추가
                </button>
              )}
              {/* 추가 행이 1개 이상일 때 일괄 저장 버튼 표시 */}
              {newSchoolRows.length > 0 && (
                <button onClick={saveNewSchools} disabled={savingNewSchools}
                  style={{ flex: 1, padding: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: savingNewSchools ? '#9e9e9e' : '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  {savingNewSchools ? '저장 중...' : `${newSchoolRows.length}건 저장`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 환경 (주변 인프라) — 기존 데이터나 추가 행이 있을 때 섹션 표시 */}
        {((complex.infraInfos && complex.infraInfos.length > 0) || newInfraRows.length > 0) && (
          <div ref={infraSectionRef} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368' }}>환경</h3>
              {(() => {
                const g = calcInfraGrade(complex.infraInfos ?? []);
                return (
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', backgroundColor: g.color, padding: '1px 8px', borderRadius: '10px' }}>
                    {g.grade}
                  </span>
                );
              })()}
            </div>

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
                        onKeyDown={e => { if (e.key === 'Enter') handleInfraSearch(); }}
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
                    <Tag label={INFRA_TYPE_LABELS[inf.infraType] ?? inf.infraType} color='#f9ab00' />
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
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#c5221f', padding: '0 2px', flexShrink: 0 }}
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
                    style={{ border: 'none', background: 'none', color: '#c5221f', cursor: 'pointer', fontSize: '16px' }}>×</button>
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
                    onKeyDown={e => { if (e.key === 'Enter') handleNewInfraSearch(row.localId); }}
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

            {/* 하단 버튼 행 — 행 추가 + 일괄 저장 */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              {/* 수정 폼이 열려 있지 않을 때만 추가 버튼 표시 */}
              {!editingInfra && (
                <button onClick={startAddInfra}
                  style={{ flex: 1, padding: '6px', fontSize: '12px', border: '1px dashed #f9ab00', borderRadius: '6px', backgroundColor: 'transparent', color: '#e37400', cursor: 'pointer' }}>
                  + 인프라 추가
                </button>
              )}
              {/* 추가 행이 1개 이상일 때 일괄 저장 버튼 표시 */}
              {newInfraRows.length > 0 && (
                <button onClick={saveNewInfras} disabled={savingNewInfras}
                  style={{ flex: 1, padding: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: savingNewInfras ? '#9e9e9e' : '#e37400', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  {savingNewInfras ? '저장 중...' : `${newInfraRows.length}건 저장`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 재개발 정보 */}
        {complex.redevelopType && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>재개발 정보</h3>
            <InfoRow label="유형" value={REDEVELOP_TYPE_LABELS[complex.redevelopType]} />
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
          </div>
        )}

        {/* 임장 유형 — 값 없으면 NONE(임장X)으로 표시, 항상 렌더링 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', margin: 0 }}>임장 유형</h3>
            {!editingVisitType && (
              <button
                onClick={() => setEditingVisitType(true)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#1a73e8', padding: '0 2px' }}
                title="임장 유형 수정"
              >✏</button>
            )}
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
                style={{ padding: '6px 12px', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: visitTypeSaving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: visitTypeSaving ? 0.7 : 1 }}
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
              backgroundColor: '#e8f0fe', color: '#1a73e8', fontSize: '13px', fontWeight: 600,
            }}>
              {VISIT_TYPE_LABELS[localVisitType] ?? localVisitType}
            </div>
          )}
        </div>

        {/* 시세 변동 그래프 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368' }}>
              시세 변동
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {priceChange !== null && (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: priceChange >= 0 ? '#c5221f' : '#137333',
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
                      borderColor: selectedAreaType ? '#1a73e8' : '#d2d5da',
                      borderRadius: '14px',
                      backgroundColor: selectedAreaType ? '#e8f0fe' : '#f8f9fa',
                      color: selectedAreaType ? '#1a73e8' : '#5f6368',
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
                    stroke={selectedAreaType ? '#1a73e8' : '#9e9e9e'}
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
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', margin: 0 }}>
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
                                  color: delta > 0 ? '#c5221f' : '#1a73e8',
                                }}>
                                  {delta > 0 ? '▲' : '▼'} {formatPrice(Math.abs(delta))} ({delta > 0 ? '+' : ''}{rate.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                            {item.jeonseRate != null && (
                              <span style={{ fontSize: '11px', color: '#1a73e8' }}>전세가율 {item.jeonseRate.toFixed(0)}%</span>
                            )}
                          </div>
                          {/* 참고가 — 값이 있는 항목만 표시 */}
                          {(item.askingPrice || item.highestPrice || item.lowestPrice || item.tenYearChangeAmount || item.tenYearChangeRate) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '3px' }}>
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
              color: '#1a73e8',
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

        {/* 학군/인프라 데이터가 없고 추가 행도 없을 때만 추가 버튼 표시 — 삭제 버튼 바로 위 */}
        {(() => {
          const noSchool = !complex.schoolInfos || complex.schoolInfos.length === 0;
          const noInfra = !complex.infraInfos || complex.infraInfos.length === 0;
          // 둘 다 이미 있거나 삭제 확인 중이면 버튼 숨김
          if ((!noSchool && !noInfra) || deleteConfirm) return null;
          return (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {/* 학군 데이터 없고 추가 행도 없고 수정 폼도 닫혀 있을 때 */}
              {noSchool && newSchoolRows.length === 0 && !editingSchool && (
                <button
                  onClick={startAddSchool}
                  style={{ flex: 1, padding: '8px', border: '1px dashed #1a73e8', background: 'none', borderRadius: '8px', color: '#1a73e8', fontSize: '13px', cursor: 'pointer' }}
                >
                  + 학군 추가
                </button>
              )}
              {/* 인프라 데이터 없고 추가 행도 없고 수정 폼도 닫혀 있을 때 */}
              {noInfra && newInfraRows.length === 0 && !editingInfra && (
                <button
                  onClick={startAddInfra}
                  style={{ flex: 1, padding: '8px', border: '1px dashed #f9ab00', background: 'none', borderRadius: '8px', color: '#e37400', fontSize: '13px', cursor: 'pointer' }}
                >
                  + 환경 추가
                </button>
              )}
            </div>
          );
        })()}

        {/* 단지 삭제 — 실수 방지를 위해 2단계 확인 */}
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px', marginBottom: '16px' }}>
          {deleteConfirm ? (
            <div style={{ backgroundColor: '#fce8e6', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '13px', color: '#c5221f', fontWeight: 600, marginBottom: '8px' }}>
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
                    backgroundColor: deleting ? '#9e9e9e' : '#c5221f',
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
                backgroundColor: '#fff', color: '#c5221f',
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
    </div>
  );
};

export default ComplexInfoPanel;
