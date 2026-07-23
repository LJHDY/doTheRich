import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { uploadComplexPhotos } from '../services/api';
import { compressImages } from '../utils/imageUtils';
import { ApartmentComplex } from '../types';
import { useNumberedTextarea } from '../hooks/useNumberedTextarea';

export interface RegisterInitialData {
  complexName: string;
  address: string;
  latitude: number;
  longitude: number;
  fromSearch?: boolean;
}

interface SearchLocalItem {
  title: string;
  category: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
}

interface PriceInfoRow {
  areaType: string;
  floorInfo: string;
  priceUk: string;
  jeonseUk: string;
  priceRange: string;       // 매매가에서 자동 계산, 수동 수정 가능
  askingPriceUk: string;    // 호가 (억)
  highestPriceUk: string;   // 전고점 (억)
  lowestPriceUk: string;    // 전저점 (억)
  tenYearAmountStr: string;  // 10년 등락 수식 (예: "8.5-4.3")
  tenYearRateStr: string;    // 10년 등락률 (%)
}

interface SubwayRow {
  stationName: string;
  subwayLines: string;
  walkingMinutes: string;
  availableLines: string[];
  stationLat: number | null;
  stationLng: number | null;
  fetching: boolean;
}

interface CommuteRow {
  destination: string;
  minutes: string;
  transportType: string;
  transferCount: string; // 환승 횟수 (빈 문자열 = 미입력)
}

interface SchoolRow {
  schoolName: string;
  schoolAddress: string;       // 화면에 표시 + 도보거리 계산용 (백엔드 필드명과 일치)
  schoolType: 'ELEMENTARY' | 'MIDDLE'; // 백엔드 enum key: ELEMENTARY=초등학교, MIDDLE=중학교
  walkingMinutes: string;
  achievementScore: string;    // 중학교만 표시, % 미포함, blur 시 자동 포맷 → Double로 전송
  totalStudents: string;
  latitude: number | null;
  longitude: number | null;
  fetching: boolean;
  searchResults: SearchLocalItem[];
  showDropdown: boolean;
}

interface InfraRow {
  infraType: string;       // 서버로 보내는 key (DEPARTMENT_STORE 등)
  infraName: string;       // 화면에 표시
  infraAddress: string;    // 도보거리 계산용, 화면에 미표시 (백엔드 필드명과 일치)
  distance: string;        // 백엔드 distance 필드 (분 단위로 입력, 필드명은 distance)
  latitude: number | null;
  longitude: number | null;
  fetching: boolean;
  searchResults: SearchLocalItem[];
  showDropdown: boolean;
}

const INFRA_TYPES = [
  { key: 'DEPARTMENT_STORE', label: '백화점' },
  { key: 'MART',             label: '마트' },
  { key: 'HOSPITAL',         label: '병원' },
  { key: 'ETC',              label: '기타' },
];

const REDEVELOP_TYPES = [
  { key: 'REDEVELOPMENT',  label: '재개발' },
  { key: 'RECONSTRUCTION', label: '재건축' },
  { key: 'REMODELING',     label: '리모델링' },
];

// 백엔드 entity 주석 기준 + 추진위원회 단계(COMMITTEE) 추가
const REDEVELOP_STAGES = [
  { key: 'INITIAL',        label: '정비구역 지정' },
  { key: 'COMMITTEE',      label: '추진위원회 구성 및 승인' },
  { key: 'ASSOCIATION',    label: '조합 설립 인가' },
  { key: 'APPROVAL',       label: '사업시행인가' },
  { key: 'MGMT_APPROVAL',  label: '관리처분인가' },
  { key: 'RELOCATION',     label: '이주·철거 및 착공' },
  { key: 'COMPLETION',     label: '준공 및 입주' },
];

const VISIT_TYPES = [
  { key: 'ATMOSPHERE', label: '분위기 임장' },
  { key: 'COMPLEX',    label: '단지 임장' },
  { key: 'LISTING',    label: '매물 임장' },
  { key: 'NONE',       label: '임장X' },
];

// 네이버 검색 API 응답에 포함된 HTML 태그 제거
const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '');

interface Props {
  initialData: RegisterInitialData;
  onClose: () => void;
  onSuccess: () => void;
}

const DESTINATIONS = ['강남', '시청', '여의도', '발산', '마곡나루'];

// 네이버 지도 경로 URL 생성 시 도착지 좌표가 필요 — 역 출입구 기준 좌표 (Naver 검색 API 기준)
// 마곡나루역은 9호선/공항철도 (5호선 마곡역과 혼동 주의: 마곡역 lng≈126.8338, 마곡나루역 lng≈126.8271)
const DESTINATION_COORDS: Record<string, { lng: number; lat: number; label: string }> = {
  '강남':    { lng: 127.0276368, lat: 37.4979462, label: '강남역' },
  '시청':    { lng: 126.9769157, lat: 37.5663174, label: '시청역' },
  '여의도':  { lng: 126.9244095, lat: 37.5216839, label: '여의도역' },
  '발산':    { lng: 126.8373108, lat: 37.5590293, label: '발산역' },
  '마곡나루': { lng: 126.8275182, lat: 37.5667930, label: '마곡나루역' },
};

// 주소에서 "서울 구로구" 형태의 지역구 추출 — '구'/'군'으로 끝나는 토큰까지만 사용
const extractRegion = (address: string): string => {
  const parts = address.trim().split(/\s+/);
  const result: string[] = [];
  for (const part of parts) {
    result.push(part);
    if (part.endsWith('구') || part.endsWith('군')) break;
    if (result.length >= 3) break;
  }
  return result.join(' ');
};

// 사칙연산 문자열을 계산해 결과값 문자열로 반환 — "8.5-4.3" → "4.2"
// 숫자·소수점·연산자(+,-,*,/)만 허용해 eval 없이 안전하게 처리
const evalExpr = (expr: string): string => {
  const cleaned = expr.replace(/\s/g, '');
  if (!cleaned) return '';
  if (!/^[0-9+\-*/.]+$/.test(cleaned)) return expr;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${cleaned}`)() as number;
    if (typeof result === 'number' && isFinite(result)) {
      return String(Math.round(result * 100) / 100);
    }
  } catch {}
  return expr;
};

// "A-B" 패턴에서 등락 금액과 등락률(%) 동시 계산
// "8.5-4.3" → { amount: "4.2", rate: "97.67" }
// 복합 수식이면 amount만 계산, rate는 ''
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

// 억 단위 입력값 → "7억대" 형태의 금액대 문자열 생성
const calcPriceRange = (priceUk: string): string => {
  const num = parseFloat(priceUk);
  return isNaN(num) ? '' : `${Math.floor(num)}억대`;
};

const calcJeonseRate = (priceUk: string, jeonseUk: string): string => {
  const p = parseFloat(priceUk);
  const j = parseFloat(jeonseUk);
  if (isNaN(p) || isNaN(j) || p === 0) return '-';
  return (j / p * 100).toFixed(1) + '%';
};

// 네이버 category 문자열(예: "교통 > 지하철 > 서울 지하철 1호선")에서 호선명만 추출
const parseLineFromCategory = (category: string): string => {
  const parts = category.split('>');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].trim()
    .replace(/수도권전철\s+/, '')
    .replace(/서울\s+지하철\s+/, '')
    .replace(/^서울\s+/, '')
    .trim();
};

const isStation = (category: string) =>
  category.includes('지하철') || category.includes('전철');

// 도보 API 실패 시 직선거리 기반 도보 시간을 추정하는 폴백용 Haversine 거리 계산
const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #dadce0',
  borderRadius: '6px', fontSize: '13px', color: '#202124',
  outline: 'none', boxSizing: 'border-box',
};

const readonlyStyle: React.CSSProperties = {
  ...inputStyle,
  backgroundColor: '#f8f9fa', color: '#80868b', cursor: 'default',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px', color: '#5f6368', marginBottom: '4px', display: 'block',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: '#1a73e8',
  borderBottom: '1px solid #e8eaed', paddingBottom: '6px', marginBottom: '12px',
};

const grid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px',
};

const iconBtn = (color: string): React.CSSProperties => ({
  border: 'none', background: 'none', cursor: 'pointer',
  color, fontSize: '18px', lineHeight: 1, padding: '0 4px', flexShrink: 0,
});

const actionBtn = (bg: string, disabled: boolean): React.CSSProperties => ({
  padding: '7px 10px', border: 'none', borderRadius: '6px',
  backgroundColor: disabled ? '#dadce0' : bg, color: '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '12px', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
});

const RegisterModal: React.FC<Props> = ({ initialData, onClose, onSuccess }) => {
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    complexName: initialData.complexName,
    address: initialData.address,
    region: extractRegion(initialData.address),
    checkDate: today,
    priceRange: '',
    builtYear: '',
    unitCount: '',
    memo: '',
    redevelopType: '',   // '' = 해당없음, 'REDEVELOPMENT' | 'RECONSTRUCTION' | 'REMODELING'
    redevelopStage: '',  // 체크 시 표시되는 진행단계
    visitType: '',       // '' = null(미입력), 'ATMOSPHERE' | 'COMPLEX' | 'LISTING' | 'NONE'
  });

  const [priceInfos, setPriceInfos] = useState<PriceInfoRow[]>([
    { areaType: '', floorInfo: '', priceUk: '', jeonseUk: '', priceRange: '', askingPriceUk: '', highestPriceUk: '', lowestPriceUk: '', tenYearAmountStr: '', tenYearRateStr: '' },
  ]);
  const [subwayInfos, setSubwayInfos] = useState<SubwayRow[]>([]);
  // 기본 목적지 5개를 빈 값으로 미리 채워둠 — 사용자가 분만 입력하면 됨
  const [commuteTimes, setCommuteTimes] = useState<CommuteRow[]>(
    DESTINATIONS.map(d => ({ destination: d, minutes: '', transportType: '지하철', transferCount: '' }))
  );
  const [schoolInfos, setSchoolInfos] = useState<SchoolRow[]>([]);
  const [infraInfos, setInfraInfos] = useState<InfraRow[]>([]);
  // 즐겨찾기 — form state와 분리해 boolean 타입 오염 방지
  const [isFavorite, setIsFavorite] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const memoHook = useNumberedTextarea(form.memo, v => set('memo', v));

  // 주소 입력이 바뀔 때마다 지역구 자동 재추출
  useEffect(() => {
    setForm(prev => ({ ...prev, region: extractRegion(prev.address) }));
  }, [form.address]);

  // (삭제됨) 금액대는 이제 행별로 자동 계산

  // TODO: 실거래가 자동 조회 — 검색 정확도 개선 후 재활성화
  // useEffect(() => {
  //   if (!initialData.fromSearch) return;
  //   if (priceFetchedRef.current) return;
  //   priceFetchedRef.current = true;
  //
  //   const fetchPrices = async () => {
  //     setFetchingPrices(true);
  //     setPricesFetchMsg('');
  //     try {
  //       const [tradeRes, jeonseRes] = await Promise.allSettled([
  //         api.get('/api/real-estate/trade/latest', {
  //           params: { complexName: initialData.complexName, address: initialData.address },
  //         }),
  //         api.get('/api/real-estate/jeonse/latest', {
  //           params: { complexName: initialData.complexName, address: initialData.address },
  //         }),
  //       ]);
  //       const tradeErr = tradeRes.status === 'rejected'
  //         ? (tradeRes.reason?.response?.data || tradeRes.reason?.message || '오류') : null;
  //       const trade = tradeRes.status === 'fulfilled' && tradeRes.value.status === 200
  //         ? tradeRes.value.data : null;
  //       const jeonse = jeonseRes.status === 'fulfilled' && jeonseRes.value.status === 200
  //         ? jeonseRes.value.data : null;
  //       if (tradeErr) {
  //         setPricesFetchMsg(`조회 실패: ${tradeErr}`);
  //       } else if (!trade && !jeonse) {
  //         setPricesFetchMsg('최근 6개월 내 실거래 데이터 없음 — 직접 입력해주세요.');
  //       } else {
  //         const priceUk = trade?.tradePrice ? String(trade.tradePrice / 10000) : '';
  //         const jeonseUk = jeonse?.jeonsePrice ? String(jeonse.jeonsePrice / 10000) : '';
  //         const areaType = trade?.area ? `전용 ${parseFloat(trade.area).toFixed(1)}` : '';
  //         const floorInfo = trade?.floor || '';
  //         const builtYear = trade?.builtYear ? `${trade.builtYear}년` : '';
  //         setPriceInfos([{ areaType, floorInfo, priceUk, jeonseUk }]);
  //         if (builtYear) setForm(prev => ({ ...prev, builtYear }));
  //         setPricesFetchMsg(`실거래가 셋팅 완료 (매매: ${trade?.dealDate ?? '-'}, 전세: ${jeonse?.dealDate ?? '데이터 없음'})`);
  //       }
  //     } catch (e: any) {
  //       setPricesFetchMsg(`조회 오류: ${e?.message || '서버 연결 실패'}`);
  //     } finally {
  //       setFetchingPrices(false);
  //     }
  //   };
  //   fetchPrices();
  // // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  // ── 가격 정보 행 ────────────────────────────────────────────────
  // priceInfos 배열 관리: 추가·삭제·부분 업데이트를 불변 방식으로 처리
  const addPriceRow = () =>
    setPriceInfos(prev => [...prev, { areaType: '', floorInfo: '', priceUk: '', jeonseUk: '', priceRange: '', askingPriceUk: '', highestPriceUk: '', lowestPriceUk: '', tenYearAmountStr: '', tenYearRateStr: '' }]);

  const removePriceRow = (i: number) =>
    setPriceInfos(prev => prev.filter((_, idx) => idx !== i));

  const updatePriceRow = (i: number, update: Partial<PriceInfoRow>) =>
    setPriceInfos(prev => prev.map((r, idx) => idx === i ? { ...r, ...update } : r));

  // ── 교통 정보 ────────────────────────────────────────────────────
  const addSubway = () =>
    setSubwayInfos(prev => [...prev, {
      stationName: '', subwayLines: '', walkingMinutes: '',
      availableLines: [], stationLat: null, stationLng: null, fetching: false,
    }]);

  const removeSubway = (i: number) =>
    setSubwayInfos(prev => prev.filter((_, idx) => idx !== i));

  const updateSubway = (i: number, update: Partial<SubwayRow>) =>
    setSubwayInfos(prev => prev.map((r, idx) => idx === i ? { ...r, ...update } : r));

  // 역명 조회: 로컬 검색 → 지하철 카테고리 필터 → 호선 목록 추출 → 도보 시간 계산
  const handleStationLookup = async (i: number) => {
    const name = subwayInfos[i].stationName.trim();
    if (!name) return;
    // "구일" 입력 시 "구일역"으로 자동 보완해 검색 정확도 향상
    const query = name.endsWith('역') ? name : `${name}역`;
    updateSubway(i, { fetching: true });

    try {
      const { data } = await api.get<{ items: SearchLocalItem[] }>('/api/search/local', { params: { query } });

      // 지하철 카테고리만 필터링 후 중복 없는 호선 목록 생성
      const stationItems = data.items.filter(item => isStation(item.category));
      const lineSet = new Set(stationItems.map(item => parseLineFromCategory(item.category)).filter(Boolean));
      const lines = Array.from(lineSet);
      // 역 좌표 추출: 지하철 항목 우선, 없으면 첫 번째 검색 결과 사용
      const first = stationItems[0] ?? data.items[0];

      const stationLat = first ? parseInt(first.mapy) / 10000000 : null;
      const stationLng = first ? parseInt(first.mapx) / 10000000 : null;

      let walkingMinutes = '';
      if (stationLat && stationLng) {
        try {
          // 네이버 도보 경로 API로 실제 도보 시간 조회
          const { data: dir } = await api.get<{ minutes: number }>('/api/directions/walking', {
            params: { startLat: initialData.latitude, startLng: initialData.longitude, goalLat: stationLat, goalLng: stationLng },
          });
          walkingMinutes = String(dir.minutes);
        } catch {
          // API 실패 시 직선거리 × 1.3(경로 보정) ÷ 4km/h(도보 속도)로 추정
          const km = haversineKm(initialData.latitude, initialData.longitude, stationLat, stationLng);
          walkingMinutes = String(Math.max(1, Math.round(km * 1.3 / 4 * 60)));
        }
      }

      updateSubway(i, {
        availableLines: lines,
        subwayLines: lines.length === 1 ? lines[0] : '', // 단일 호선이면 자동 선택, 복수면 사용자 선택
        stationLat, stationLng, walkingMinutes, fetching: false,
      });
    } catch {
      updateSubway(i, { fetching: false });
    }
  };

  // ── 출퇴근 시간 ─────────────────────────────────────────────────
  const addCommute = () =>
    setCommuteTimes(prev => [...prev, { destination: '', minutes: '', transportType: '지하철', transferCount: '' }]);

  const removeCommute = (i: number) =>
    setCommuteTimes(prev => prev.filter((_, idx) => idx !== i));

  const updateCommute = (i: number, update: Partial<CommuteRow>) =>
    setCommuteTimes(prev => prev.map((r, idx) => idx === i ? { ...r, ...update } : r));

  // ── 학군 정보 ─────────────────────────────────────────────────────
  const addSchool = () => setSchoolInfos(prev => [...prev, {
    schoolName: '', schoolAddress: '', schoolType: 'ELEMENTARY',
    walkingMinutes: '', achievementScore: '', totalStudents: '',
    latitude: null, longitude: null,
    fetching: false, searchResults: [], showDropdown: false,
  }]);
  const removeSchool = (i: number) => setSchoolInfos(prev => prev.filter((_, idx) => idx !== i));
  const updateSchool = (i: number, update: Partial<SchoolRow>) =>
    setSchoolInfos(prev => prev.map((r, idx) => idx === i ? { ...r, ...update } : r));

  const handleSchoolSearch = async (i: number) => {
    const query = schoolInfos[i].schoolName.trim();
    if (!query) return;
    updateSchool(i, { fetching: true, showDropdown: false });
    try {
      const { data } = await api.get<{ items: SearchLocalItem[] }>('/api/search/local', { params: { query } });
      updateSchool(i, { fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 });
    } catch {
      updateSchool(i, { fetching: false });
    }
  };

  const handleSchoolSelect = async (i: number, item: SearchLocalItem) => {
    const schoolAddress = item.roadAddress || item.address;
    const lat = parseInt(item.mapy) / 10000000;
    const lng = parseInt(item.mapx) / 10000000;
    updateSchool(i, { schoolName: stripHtml(item.title), schoolAddress, latitude: lat, longitude: lng, showDropdown: false, searchResults: [], fetching: true });
    try {
      const { data: dir } = await api.get<{ minutes: number }>('/api/directions/walking', {
        params: { startLat: initialData.latitude, startLng: initialData.longitude, goalLat: lat, goalLng: lng },
      });
      updateSchool(i, { walkingMinutes: String(dir.minutes), fetching: false });
    } catch {
      const km = haversineKm(initialData.latitude, initialData.longitude, lat, lng);
      updateSchool(i, { walkingMinutes: String(Math.max(1, Math.round(km * 1.3 / 4 * 60))), fetching: false });
    }
  };

  // ── 주변 인프라 ───────────────────────────────────────────────────
  const addInfra = () => setInfraInfos(prev => [...prev, {
    infraType: 'DEPARTMENT_STORE', infraName: '', infraAddress: '',
    distance: '', latitude: null, longitude: null,
    fetching: false, searchResults: [], showDropdown: false,
  }]);
  const removeInfra = (i: number) => setInfraInfos(prev => prev.filter((_, idx) => idx !== i));
  const updateInfra = (i: number, update: Partial<InfraRow>) =>
    setInfraInfos(prev => prev.map((r, idx) => idx === i ? { ...r, ...update } : r));

  const handleInfraSearch = async (i: number) => {
    const query = infraInfos[i].infraName.trim();
    if (!query) return;
    updateInfra(i, { fetching: true, showDropdown: false });
    try {
      const { data } = await api.get<{ items: SearchLocalItem[] }>('/api/search/local', { params: { query } });
      updateInfra(i, { fetching: false, searchResults: data.items, showDropdown: data.items.length > 0 });
    } catch {
      updateInfra(i, { fetching: false });
    }
  };

  const handleInfraSelect = async (i: number, item: SearchLocalItem) => {
    const infraAddress = item.roadAddress || item.address;
    const lat = parseInt(item.mapy) / 10000000;
    const lng = parseInt(item.mapx) / 10000000;
    updateInfra(i, { infraName: stripHtml(item.title), infraAddress, latitude: lat, longitude: lng, showDropdown: false, searchResults: [], fetching: true });
    try {
      const { data: dir } = await api.get<{ minutes: number }>('/api/directions/walking', {
        params: { startLat: initialData.latitude, startLng: initialData.longitude, goalLat: lat, goalLng: lng },
      });
      updateInfra(i, { distance: String(dir.minutes), fetching: false });
    } catch {
      const km = haversineKm(initialData.latitude, initialData.longitude, lat, lng);
      updateInfra(i, { distance: String(Math.max(1, Math.round(km * 1.3 / 4 * 60))), fetching: false });
    }
  };

  // ── 제출 ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.complexName.trim()) { setError('단지명을 입력해주세요.'); return; }
    if (!priceInfos[0]?.priceUk) { setError('매매가를 입력해주세요.'); return; }
    setError('');
    setSubmitting(true);

    try {
      // payload 구성: 빈 문자열은 undefined로 변환해 서버에 전송하지 않음
      const { data: created } = await api.post<ApartmentComplex>('/api/complexes/register', {
        complexName: form.complexName,
        address: form.address || undefined,
        region: form.region || undefined,
        checkDate: form.checkDate || undefined,
        // 단지 대표 금액대: 첫 번째 행 금액대 우선, 없으면 매매가에서 자동 계산
        priceRange: priceInfos[0]?.priceRange || calcPriceRange(priceInfos[0]?.priceUk || ''),
        builtYear: form.builtYear || undefined,
        unitCount: form.unitCount ? parseInt(form.unitCount) : undefined,
        memo: form.memo || undefined,
        redevelopType: form.redevelopType || undefined,
        redevelopStage: form.redevelopStage || undefined,
        visitType: form.visitType || undefined,
        isFavorite: isFavorite,
        latitude: initialData.latitude,
        longitude: initialData.longitude,
        // 매매가 또는 전세가가 입력된 행만 포함, 억 단위 → 원 단위 변환
        priceItems: priceInfos
          .filter(r => r.priceUk || r.jeonseUk)
          .map(r => ({
            areaType: r.areaType || undefined,
            floor: r.floorInfo || undefined,
            price: r.priceUk ? Math.round(parseFloat(r.priceUk) * 100_000_000) : undefined,
            jeonsePrice: r.jeonseUk ? Math.round(parseFloat(r.jeonseUk) * 100_000_000) : undefined,
            askingPrice: r.askingPriceUk ? Math.round(parseFloat(r.askingPriceUk) * 100_000_000) : undefined,
            highestPrice: r.highestPriceUk ? Math.round(parseFloat(r.highestPriceUk) * 100_000_000) : undefined,
            lowestPrice: r.lowestPriceUk ? Math.round(parseFloat(r.lowestPriceUk) * 100_000_000) : undefined,
            tenYearChangeAmount: r.tenYearAmountStr ? Math.round(parseFloat(r.tenYearAmountStr) * 100_000_000) : undefined,
            tenYearChangeRate: r.tenYearRateStr ? parseFloat(r.tenYearRateStr) : undefined,
          })),
        // 역명이 입력된 교통 정보만 포함
        subwayInfos: subwayInfos.filter(r => r.stationName.trim()).map(r => ({
          stationName: r.stationName,
          subwayLines: r.subwayLines || undefined,
          walkingMinutes: r.walkingMinutes ? parseInt(r.walkingMinutes) : undefined,
        })),
        // 소요시간이 입력된 출퇴근 항목만 포함
        commuteTimes: commuteTimes.filter(r => r.minutes).map(r => ({
          destination: r.destination,
          minutes: parseInt(r.minutes),
          transportType: r.transportType,
          transferCount: r.transferCount !== '' ? parseInt(r.transferCount) : 0,
        })),
        // 학교명이 입력된 학군 정보만 포함 — schoolType은 ELEMENTARY/MIDDLE enum key로 전송
        schoolInfos: schoolInfos.filter(r => r.schoolName.trim()).map(r => ({
          schoolName: r.schoolName,
          schoolAddress: r.schoolAddress || undefined,
          schoolType: r.schoolType,
          walkingMinutes: r.walkingMinutes ? parseInt(r.walkingMinutes) : undefined,
          // achievementScore: % 제거 후 Double로 전송 (중학교만 해당)
          achievementScore: r.achievementScore ? parseFloat(r.achievementScore.replace('%', '')) : undefined,
          totalStudents: r.totalStudents ? parseInt(r.totalStudents) : undefined,
          latitude: r.latitude ?? undefined,
          longitude: r.longitude ?? undefined,
        })),
        // 인프라명이 입력된 항목만 포함 — infraType은 key 값으로, distance는 도보 분 단위로 전송
        infraInfos: infraInfos.filter(r => r.infraName.trim()).map(r => ({
          infraType: r.infraType,
          infraName: r.infraName,
          infraAddress: r.infraAddress || undefined,
          distance: r.distance ? parseInt(r.distance) : undefined,
          latitude: r.latitude ?? undefined,
          longitude: r.longitude ?? undefined,
        })),
      });
      // 선택된 사진을 압축 후 한 번에 업로드 — 실패해도 단지 등록은 완료 상태로 처리
      if (photoFiles.length > 0 && created?.id) {
        try {
          const compressed = await compressImages(photoFiles);
          await uploadComplexPhotos(created.id, compressed);
        } catch { /* 업로드 실패 무시 */ }
      }
      onSuccess();
      onClose();
    } catch {
      setError('등록에 실패했습니다. 서버를 확인해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>

      <div style={{
        backgroundColor: '#fff', borderRadius: '12px', width: '640px',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid #e8eaed', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#202124' }}>단지 등록</span>
            {/* 즐겨찾기 별 버튼 — 노란별(활성)/회색별(비활성) 토글 */}
            <button
              type="button"
              onClick={() => setIsFavorite(prev => !prev)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: 0, color: isFavorite ? '#f9ab00' : '#dadce0' }}
            >★</button>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#80868b', padding: 0 }}>×</button>
        </div>

        {/* 폼 */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

          {/* 기본 정보 */}
          <div style={sectionTitle}>기본 정보</div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>단지명 *</label>
            <input style={inputStyle} value={form.complexName} onChange={e => set('complexName', e.target.value)} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>주소</label>
            <input style={inputStyle} value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>지역구</label>
              <input style={inputStyle} value={form.region} onChange={e => set('region', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>확인일</label>
              <input style={inputStyle} type="date" value={form.checkDate} onChange={e => set('checkDate', e.target.value)} />
            </div>
          </div>

          {/* 가격 정보 */}
          <div style={sectionTitle}>가격 정보</div>

          {/* 가격 행 헤더 — 금액대 칼럼 추가 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.8fr 1.2fr 1.6fr 1.6fr 52px 60px 28px',
            gap: '6px', marginBottom: '4px', paddingRight: '2px',
          }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>평형</span>
            <span style={{ ...labelStyle, marginBottom: 0 }}>층수</span>
            <span style={{ ...labelStyle, marginBottom: 0 }}>매매가(억) *</span>
            <span style={{ ...labelStyle, marginBottom: 0 }}>전세가(억)</span>
            <span style={{ ...labelStyle, marginBottom: 0 }}>전세율</span>
            <span style={{ ...labelStyle, marginBottom: 0 }}>금액대</span>
            <span />
          </div>

          {priceInfos.map((row, i) => (
            <div key={i} style={{ marginBottom: '10px', border: '1px solid #e8eaed', borderRadius: '6px', overflow: 'hidden' }}>
              {/* 기본 가격 행 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr 1.2fr 1.6fr 1.6fr 52px 60px 28px',
                gap: '6px', padding: '8px', alignItems: 'center',
              }}>
                <input
                  style={inputStyle}
                  placeholder="예) 전용 59"
                  value={row.areaType}
                  onChange={e => updatePriceRow(i, { areaType: e.target.value })}
                  onBlur={() => {
                    // 숫자만 입력하면 "전용 59" 형식으로 자동 보완
                    const v = row.areaType.trim();
                    if (/^\d+(\.\d+)?$/.test(v)) updatePriceRow(i, { areaType: `전용 ${v}` });
                  }}
                />
                <input
                  style={inputStyle}
                  placeholder="예) 3/15"
                  value={row.floorInfo}
                  onChange={e => updatePriceRow(i, { floorInfo: e.target.value })}
                />
                <input
                  type="number" step="0.01"
                  style={inputStyle}
                  placeholder="예) 7.5"
                  value={row.priceUk}
                  onChange={e => {
                    const newUk = e.target.value;
                    // 매매가 입력 시 금액대 자동 계산 (수동 수정 우선)
                    updatePriceRow(i, { priceUk: newUk, priceRange: calcPriceRange(newUk) });
                  }}
                />
                <input
                  type="number" step="0.01"
                  style={inputStyle}
                  placeholder="예) 5.5"
                  value={row.jeonseUk}
                  onChange={e => updatePriceRow(i, { jeonseUk: e.target.value })}
                />
                <div style={{ ...readonlyStyle, padding: '8px 6px', textAlign: 'center', fontSize: '12px' }}>
                  {calcJeonseRate(row.priceUk, row.jeonseUk)}
                </div>
                <input
                  style={{ ...inputStyle, fontSize: '12px', padding: '8px 6px', textAlign: 'center' }}
                  placeholder="예) 7억대"
                  value={row.priceRange}
                  onChange={e => updatePriceRow(i, { priceRange: e.target.value })}
                />
                {priceInfos.length > 1 ? (
                  <button onClick={() => removePriceRow(i)} style={iconBtn('#c5221f')}>×</button>
                ) : (
                  <span />
                )}
              </div>
              {/* 참고가 서브 행 — 평형별로 개별 입력 */}
              <div style={{ backgroundColor: '#f8f9fa', borderTop: '1px dashed #e8eaed', padding: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#80868b', marginBottom: '5px' }}>참고가</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '6px' }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>호가(억)</label>
                    <input type="number" step="0.01" style={{ ...inputStyle, fontSize: '11px', padding: '5px 6px' }}
                      placeholder="8.5"
                      value={row.askingPriceUk}
                      onChange={e => updatePriceRow(i, { askingPriceUk: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>전고점(억)</label>
                    <input type="number" step="0.01" style={{ ...inputStyle, fontSize: '11px', padding: '5px 6px' }}
                      placeholder="12"
                      value={row.highestPriceUk}
                      onChange={e => updatePriceRow(i, { highestPriceUk: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>전저점(억)</label>
                    <input type="number" step="0.01" style={{ ...inputStyle, fontSize: '11px', padding: '5px 6px' }}
                      placeholder="6"
                      value={row.lowestPriceUk}
                      onChange={e => updatePriceRow(i, { lowestPriceUk: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>10년 등락(억)</label>
                    {/* "A-B" 입력 시 등락 금액과 등락률 자동 계산 */}
                    <input type="text" style={{ ...inputStyle, fontSize: '11px', padding: '5px 6px' }}
                      placeholder="8.5-4.3"
                      value={row.tenYearAmountStr}
                      onChange={e => updatePriceRow(i, { tenYearAmountStr: e.target.value })}
                      onBlur={() => {
                        const { amount, rate } = calcTenYear(row.tenYearAmountStr);
                        updatePriceRow(i, { tenYearAmountStr: amount, ...(rate ? { tenYearRateStr: rate } : {}) });
                      }} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>등락률(%)</label>
                    <input type="text" style={{ ...inputStyle, fontSize: '11px', padding: '5px 6px' }}
                      placeholder="자동 계산"
                      value={row.tenYearRateStr}
                      onChange={e => updatePriceRow(i, { tenYearRateStr: e.target.value })}
                      onBlur={() => updatePriceRow(i, { tenYearRateStr: evalExpr(row.tenYearRateStr) })} />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div style={{ marginBottom: '20px' }}>
            <button onClick={addPriceRow} style={{
              border: '1px dashed #dadce0', background: 'none', cursor: 'pointer',
              borderRadius: '6px', padding: '6px 14px', fontSize: '12px', color: '#1a73e8',
            }}>+ 행 추가</button>
          </div>

          {/* 단지 정보 */}
          <div style={sectionTitle}>단지 정보</div>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>준공년도</label>
              <input style={inputStyle} placeholder="예) 95" value={form.builtYear}
                onChange={e => set('builtYear', e.target.value)}
                onBlur={() => { const v = form.builtYear.trim(); if (/^\d+$/.test(v)) set('builtYear', `${v}년`); }} />
            </div>
            <div>
              <label style={labelStyle}>세대수</label>
              <input style={inputStyle} type="number" placeholder="예) 500" value={form.unitCount} onChange={e => set('unitCount', e.target.value)} />
            </div>
          </div>

          {/* 교통 정보 */}
          <div style={sectionTitle}>교통 정보</div>
          {subwayInfos.map((row, i) => (
            <div key={i} style={{ marginBottom: '10px' }}>
              {i === 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', paddingRight: '28px' }}>
                  <span style={{ ...labelStyle, flex: 2, marginBottom: 0 }}>역명</span>
                  <span style={{ ...labelStyle, flex: 2, marginBottom: 0 }}>호선</span>
                  <span style={{ ...labelStyle, width: '80px', marginBottom: 0 }}>도보(분)</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ flex: 2, display: 'flex', gap: '4px' }}>
                  <input placeholder="예) 구일역" value={row.stationName}
                    onChange={e => updateSubway(i, { stationName: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') handleStationLookup(i); }}
                    style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => handleStationLookup(i)}
                    disabled={row.fetching || !row.stationName.trim()}
                    style={actionBtn('#1a73e8', row.fetching || !row.stationName.trim())}>
                    {row.fetching ? '...' : '조회'}
                  </button>
                </div>
                <div style={{ flex: 2 }}>
                  {row.availableLines.length > 1 ? (
                    <select value={row.subwayLines}
                      onChange={e => updateSubway(i, { subwayLines: e.target.value })}
                      style={inputStyle}>
                      <option value="">호선 선택</option>
                      {row.availableLines.map(line => <option key={line} value={line}>{line}</option>)}
                    </select>
                  ) : (
                    <input placeholder="자동 입력" value={row.subwayLines}
                      onChange={e => updateSubway(i, { subwayLines: e.target.value })}
                      style={inputStyle} />
                  )}
                </div>
                <input type="number" placeholder="분" value={row.walkingMinutes}
                  onChange={e => updateSubway(i, { walkingMinutes: e.target.value })}
                  style={{ ...inputStyle, width: '80px', flexShrink: 0 }} />
                <button onClick={() => removeSubway(i)} style={iconBtn('#c5221f')}>×</button>
              </div>
            </div>
          ))}
          <button onClick={addSubway} style={{
            border: '1px dashed #dadce0', background: 'none', cursor: 'pointer',
            borderRadius: '6px', padding: '7px 14px', fontSize: '12px',
            color: '#1a73e8', marginBottom: '20px',
          }}>+ 역 추가</button>

          {/* 출퇴근 시간 */}
          <div style={sectionTitle}>출퇴근 시간</div>
          {commuteTimes.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              {/* 목적지: 텍스트 입력 — 기본 5개는 채워진 상태, 추가 행은 직접 입력 */}
              <input
                placeholder="예) 강남"
                value={row.destination}
                onChange={e => updateCommute(i, { destination: e.target.value })}
                style={{ ...inputStyle, width: '90px', flexShrink: 0 }}
              />
              {/* 네이버 지도 경로 버튼 — DESTINATION_COORDS에 있는 기본 목적지만 활성화 */}
              <button
                type="button"
                onClick={() => {
                  const dest = DESTINATION_COORDS[row.destination];
                  if (!dest) return;
                  // Naver Maps /p/directions/ URL은 lng,lat 순서 사용 (WGS84 decimal degrees)
                  const start = `${initialData.longitude},${initialData.latitude},${encodeURIComponent(form.complexName || '출발지')}`;
                  const goal = `${dest.lng},${dest.lat},${encodeURIComponent(dest.label)}`;
                  window.open(
                    `https://map.naver.com/p/directions/${start}/${goal}/-/transit`,
                    '_blank',
                    'noopener,noreferrer'
                  );
                }}
                disabled={!DESTINATION_COORDS[row.destination]}
                style={actionBtn('#34a853', !DESTINATION_COORDS[row.destination])}
                title="네이버 지도에서 경로 확인"
              >
                지도
              </button>
              <input type="number" placeholder="분" value={row.minutes}
                onChange={e => updateCommute(i, { minutes: e.target.value })}
                style={{ ...inputStyle, width: '60px', flexShrink: 0 }} />
              <input type="number" placeholder="환승" value={row.transferCount}
                onChange={e => updateCommute(i, { transferCount: e.target.value })}
                style={{ ...inputStyle, width: '55px', flexShrink: 0 }} />
              <select value={row.transportType} onChange={e => updateCommute(i, { transportType: e.target.value })}
                style={{ ...inputStyle, width: '80px', flexShrink: 0 }}>
                {['지하철', '버스', '도보'].map(t => <option key={t}>{t}</option>)}
              </select>
              <button onClick={() => removeCommute(i)} style={iconBtn('#c5221f')}>×</button>
            </div>
          ))}
          <button onClick={addCommute} style={{
            border: '1px dashed #dadce0', background: 'none', cursor: 'pointer',
            borderRadius: '6px', padding: '7px 14px', fontSize: '12px',
            color: '#1a73e8', marginBottom: '20px',
          }}>+ 항목 추가</button>

          {/* 학군 정보 */}
          <div style={sectionTitle}>학군 정보</div>
          {schoolInfos.map((row, i) => (
            <div key={i} style={{ marginBottom: '12px', border: '1px solid #e8eaed', borderRadius: '8px' }}>
              {/* 학교명 검색 행 */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 10px 6px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      placeholder="예) 영등포초등학교"
                      value={row.schoolName}
                      onChange={e => updateSchool(i, { schoolName: e.target.value, showDropdown: false })}
                      onKeyDown={e => { if (e.key === 'Enter') handleSchoolSearch(i); }}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={() => handleSchoolSearch(i)}
                      disabled={row.fetching || !row.schoolName.trim()}
                      style={actionBtn('#1a73e8', row.fetching || !row.schoolName.trim())}
                    >{row.fetching ? '...' : '조회'}</button>
                  </div>
                  {/* 검색 결과 드롭다운 */}
                  {row.showDropdown && row.searchResults.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                      backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '180px', overflowY: 'auto',
                    }}>
                      {row.searchResults.map((item, j) => (
                        <div
                          key={j}
                          onClick={() => handleSchoolSelect(i, item)}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f8f9fa'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = ''; }}
                        >
                          <div style={{ fontWeight: 600, color: '#202124' }}>{stripHtml(item.title)}</div>
                          <div style={{ fontSize: '11px', color: '#80868b', marginTop: '2px' }}>{item.roadAddress || item.address}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* 학교 유형 — ELEMENTARY/MIDDLE을 백엔드 enum key로 관리 */}
                <select
                  value={row.schoolType}
                  onChange={e => updateSchool(i, { schoolType: e.target.value as 'ELEMENTARY' | 'MIDDLE' })}
                  style={{ ...inputStyle, width: '100px', flexShrink: 0 }}
                >
                  <option value="ELEMENTARY">초등학교</option>
                  <option value="MIDDLE">중학교</option>
                </select>
                <button onClick={() => removeSchool(i)} style={iconBtn('#c5221f')}>×</button>
              </div>

              {/* 선택된 학교 주소 표시 */}
              {row.schoolAddress && (
                <div style={{ padding: '0 10px 6px', fontSize: '11px', color: '#80868b' }}>{row.schoolAddress}</div>
              )}

              {/* 도보거리 / 학업성취도(중학교만) / 전교생수 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: row.schoolType === 'MIDDLE' ? '1fr 1fr 1fr' : '1fr 1fr',
                gap: '8px', padding: '0 10px 10px',
              }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>도보거리(분)</label>
                  <input type="number" placeholder="자동 계산"
                    value={row.walkingMinutes}
                    onChange={e => updateSchool(i, { walkingMinutes: e.target.value })}
                    style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} />
                </div>
                {/* 학업성취도는 중학교 선택 시에만 표시 */}
                {row.schoolType === 'MIDDLE' && (
                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>학업성취도</label>
                    <input type="text" placeholder="예) 85%"
                      value={row.achievementScore}
                      onChange={e => updateSchool(i, { achievementScore: e.target.value.replace('%', '') })}
                      onBlur={() => {
                        const v = row.achievementScore.replace('%', '').trim();
                        if (v) updateSchool(i, { achievementScore: `${v}%` });
                      }}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} />
                  </div>
                )}
                <div>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>전교생수</label>
                  <input type="number" placeholder="명"
                    value={row.totalStudents}
                    onChange={e => updateSchool(i, { totalStudents: e.target.value })}
                    style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} />
                </div>
              </div>
            </div>
          ))}
          <button onClick={addSchool} style={{
            border: '1px dashed #dadce0', background: 'none', cursor: 'pointer',
            borderRadius: '6px', padding: '7px 14px', fontSize: '12px',
            color: '#1a73e8', marginBottom: '20px',
          }}>+ 학교 추가</button>

          {/* 주변 인프라 */}
          <div style={sectionTitle}>주변 인프라</div>
          {infraInfos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px 28px', gap: '6px', marginBottom: '4px' }}>
              <span style={{ ...labelStyle, marginBottom: 0 }}>유형</span>
              <span style={{ ...labelStyle, marginBottom: 0 }}>인프라명</span>
              <span style={{ ...labelStyle, marginBottom: 0 }}>도보(분)</span>
              <span />
            </div>
          )}
          {infraInfos.map((row, i) => (
            <div key={i} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px 28px', gap: '6px', alignItems: 'flex-start' }}>
                <select
                  value={row.infraType}
                  onChange={e => updateInfra(i, { infraType: e.target.value })}
                  style={{ ...inputStyle, fontSize: '12px', padding: '8px 4px' }}
                >
                  {INFRA_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>

                {/* 인프라명 검색 */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      placeholder="예) 현대백화점"
                      value={row.infraName}
                      onChange={e => updateInfra(i, { infraName: e.target.value, showDropdown: false })}
                      onKeyDown={e => { if (e.key === 'Enter') handleInfraSearch(i); }}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={() => handleInfraSearch(i)}
                      disabled={row.fetching || !row.infraName.trim()}
                      style={actionBtn('#1a73e8', row.fetching || !row.infraName.trim())}
                    >{row.fetching ? '...' : '조회'}</button>
                  </div>
                  {/* 검색 결과 드롭다운 */}
                  {row.showDropdown && row.searchResults.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                      backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '180px', overflowY: 'auto',
                    }}>
                      {row.searchResults.map((item, j) => (
                        <div
                          key={j}
                          onClick={() => handleInfraSelect(i, item)}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f8f9fa'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = ''; }}
                        >
                          <div style={{ fontWeight: 600 }}>{stripHtml(item.title)}</div>
                          <div style={{ fontSize: '11px', color: '#80868b', marginTop: '2px' }}>{item.roadAddress || item.address}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <input type="number" placeholder="분"
                  value={row.distance}
                  onChange={e => updateInfra(i, { distance: e.target.value })}
                  style={inputStyle} />
                <button onClick={() => removeInfra(i)} style={{ ...iconBtn('#c5221f'), marginTop: '8px' }}>×</button>
              </div>
            </div>
          ))}
          <button onClick={addInfra} style={{
            border: '1px dashed #dadce0', background: 'none', cursor: 'pointer',
            borderRadius: '6px', padding: '7px 14px', fontSize: '12px',
            color: '#1a73e8', marginBottom: '20px',
          }}>+ 인프라 추가</button>

          {/* 재개발/재건축/리모델링 여부 */}
          <div style={sectionTitle}>재개발·재건축·리모델링</div>
          <div style={{ marginBottom: '20px' }}>
            {/* 체크박스 — 체크 시 유형·단계 셀렉트 표시, 해제 시 두 값 초기화 */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '12px' }}>
              <input
                type="checkbox"
                checked={form.redevelopType !== ''}
                onChange={e => set('redevelopType', e.target.checked ? 'REDEVELOPMENT' : '')}
                style={{ width: '16px', height: '16px', accentColor: '#1a73e8', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px', color: '#202124' }}>재개발/재건축/리모델링 해당</span>
            </label>

            {form.redevelopType !== '' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>유형</label>
                  <select
                    value={form.redevelopType}
                    onChange={e => set('redevelopType', e.target.value)}
                    style={inputStyle}
                  >
                    {REDEVELOP_TYPES.map(t => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>진행 단계</label>
                  <select
                    value={form.redevelopStage}
                    onChange={e => set('redevelopStage', e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">단계 선택</option>
                    {REDEVELOP_STAGES.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 임장 유형 */}
          <div style={sectionTitle}>임장 유형</div>
          <div style={{ marginBottom: '20px' }}>
            <select
              value={form.visitType}
              onChange={e => set('visitType', e.target.value)}
              style={{ ...inputStyle, width: '200px' }}
            >
              <option value="">미입력</option>
              {VISIT_TYPES.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* 메모 */}
          <div style={sectionTitle}>메모</div>
          <textarea
            ref={memoHook.ref}
            placeholder="자유롭게 메모를 입력하세요."
            value={form.memo}
            onChange={e => set('memo', e.target.value)}
            onFocus={memoHook.onFocus}
            onKeyDown={memoHook.onKeyDown}
            onBlur={memoHook.onBlur}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />

          {/* 사진 */}
          <div style={sectionTitle}>사진</div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'inline-block', padding: '7px 16px', borderRadius: '6px',
              border: '1px solid #dadce0', backgroundColor: '#f8f9fa', cursor: 'pointer',
              fontSize: '13px', color: '#3c4043', marginBottom: '10px',
            }}>
              📷 사진 선택
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files ?? []);
                  setPhotoFiles(prev => [...prev, ...files]);
                  e.target.value = ''; // 같은 파일 재선택 허용
                }}
              />
            </label>
            {/* 선택된 사진 썸네일 미리보기 */}
            {photoFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {photoFiles.map((file, idx) => (
                  <div key={idx} style={{ position: 'relative', width: '72px', height: '72px' }}>
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e8eaed' }}
                    />
                    <button
                      onClick={() => setPhotoFiles(prev => prev.filter((_, i) => i !== idx))}
                      style={{
                        position: 'absolute', top: '-6px', right: '-6px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        backgroundColor: '#c5221f', color: '#fff', border: 'none',
                        cursor: 'pointer', fontSize: '10px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #e8eaed',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', flexShrink: 0,
        }}>
          {error && <span style={{ fontSize: '12px', color: '#c5221f', marginRight: 'auto' }}>{error}</span>}
          <button onClick={onClose} style={{
            padding: '8px 20px', borderRadius: '6px', border: '1px solid #dadce0',
            background: '#fff', cursor: 'pointer', fontSize: '13px', color: '#5f6368',
          }}>취소</button>
          <button onClick={handleSubmit} disabled={submitting} style={{
            padding: '8px 20px', borderRadius: '6px', border: 'none',
            backgroundColor: submitting ? '#a8c7fa' : '#1a73e8',
            color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: 600,
          }}>{submitting ? '등록 중...' : '등록'}</button>
        </div>
      </div>
    </div>
  );
};

export default RegisterModal;
