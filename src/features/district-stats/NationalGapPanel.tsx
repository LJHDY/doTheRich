/**
 * NationalGapPanel.tsx
 * 전국 시군구 갭 분석 패널 — 인구 순 정렬, 매매/전세 갭 + 전세가율 히트맵 표시
 * + 아실(asil.kr) 기반 향후 3년 아파트 공급 상태 뱃지
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import {
  getNationalGapStats, collectNationalGapStats,
  getRegionalSupply, collectRegionalSupply, getProvinceSupply,
  getMoveInData,
} from '../../services/api';
import type { NationalDistrictStat, NationalGapResponse, RegionalSupplyResponse, ProvinceSupplyYear, MoveInItem } from '../../types';
import { useIsMobile } from '../../hooks/useIsMobile';

// ── 상수 ─────────────────────────────────────────────────────────────────────

/** 지역 유형 표시 순서 (인구 규모 감안) */
const CITY_TYPE_ORDER = ['서울', '수도권', '광역시', '세종', '지방'];

/** 공급 상태 색상 */
const SUPPLY_COLORS: Record<string, { bg: string; color: string }> = {
  부족: { bg: '#dbeafe', color: '#1d4ed8' },
  적정: { bg: '#dcfce7', color: '#15803d' },
  초과: { bg: '#ffedd5', color: '#c2410c' },
  과잉: { bg: '#fee2e2', color: '#b91c1c' },
};

/** 오늘 기준 표시할 공급 연도 3개 */
const SUPPLY_YEARS = (() => {
  const cur = new Date().getFullYear();
  return [cur, cur + 1, cur + 2];
})();

/** 시도 전체명 → 아실(asil.kr) 저장 단축명 매핑 */
const PROVINCE_TO_ASIL: Record<string, string> = {
  '서울특별시': '서울',
  '부산광역시': '부산',
  '대구광역시': '대구',
  '인천광역시': '인천',
  '광주광역시': '광주',
  '대전광역시': '대전',
  '울산광역시': '울산',
  '세종특별자치시': '세종',
  '경기도': '경기',
  '강원특별자치도': '강원',
  '강원도': '강원',
  '충청북도': '충북',
  '충청남도': '충남',
  '전라북도': '전북',
  '전라남도': '전남',
  '경상북도': '경북',
  '경상남도': '경남',
  '제주특별자치도': '제주',
};

/** 히트맵 색상: 전세가율 높을수록(갭 낮을수록) 초록, 낮을수록(갭 높을수록) 빨강 */
function jeonseRateColor(rate: number | null): string {
  if (rate === null) return 'transparent';
  const clamped = Math.max(0, Math.min(100, rate));
  if (clamped >= 75) return '#c8f5c8';
  if (clamped >= 60) return '#e8f8e8';
  if (clamped >= 50) return '#fff8e0';
  if (clamped >= 40) return '#fde8e8';
  return '#fbbaba';
}

/** 억 단위 포맷 (소수점 1자리) */
function fmtUk(val?: number): string {
  if (!val) return '-';
  return (val / 10000).toFixed(1) + '억';
}

/** 갭(매매-전세) 억 단위 포맷 */
function fmtGap(trade?: number, jeonse?: number): string {
  if (!trade || !jeonse) return '-';
  return ((trade - jeonse) / 10000).toFixed(1) + '억';
}

/** 전세가율(%) 계산 */
function calcRate(trade?: number, jeonse?: number): number | null {
  if (!trade || !jeonse || trade === 0) return null;
  return Math.round((jeonse / trade) * 100);
}

// ── 평형 정의 ─────────────────────────────────────────────────────────────────
interface AreaDef {
  key: keyof NationalDistrictStat;
  jeonseKey: keyof NationalDistrictStat;
  label: string;
}

const AREA_DEFS: AreaDef[] = [
  { key: 'avgTrade26', jeonseKey: 'avgJeonse26', label: '25평(85㎡)' },
  { key: 'avgTrade33', jeonseKey: 'avgJeonse33', label: '33평(109㎡)' },
  { key: 'avgTrade24', jeonseKey: 'avgJeonse24', label: '24평(79㎡)' },
  { key: 'avgTrade21', jeonseKey: 'avgJeonse21', label: '21평(69㎡)' },
  { key: 'avgTrade18', jeonseKey: 'avgJeonse18', label: '18평(59㎡)' },
];

// ── 정렬 옵션 ─────────────────────────────────────────────────────────────────
type SortKey = 'population' | 'gap26' | 'rate26' | 'trade26' | 'jeonse26';
type SortDir = 'asc' | 'desc';

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

const NationalGapPanel: React.FC<Props> = ({ onClose }) => {
  const isMobile = useIsMobile();

  // 갭 데이터 상태
  const [response, setResponse] = useState<NationalGapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);

  // 공급 데이터 상태
  const [supplyData, setSupplyData] = useState<RegionalSupplyResponse | null>(null);
  const [supplyLoading, setSupplyLoading] = useState(false);
  const [supplyCollecting, setSupplyCollecting] = useState(false);

  // 공급 차트 팝업 상태
  const [chartStat, setChartStat] = useState<NationalDistrictStat | null>(null);
  const [chartData, setChartData] = useState<RegionalSupplyResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  // 입주 예정 단지 목록 상태
  const [moveInItems, setMoveInItems] = useState<MoveInItem[]>([]);
  const [moveInLoading, setMoveInLoading] = useState(false);

  // 필터 상태
  const [cityTypeFilter, setCityTypeFilter] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState('');

  // 정렬 상태
  const [sortKey, setSortKey] = useState<SortKey>('population');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // 폴링 ref
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── 갭 데이터 로드 ──────────────────────────────────────────────────────────

  const loadData = useCallback(async (month?: string) => {
    setLoading(true);
    try {
      const res = await getNationalGapStats(month);
      setResponse(res);
      if (!month) setSelectedMonth(res.tradeMonth);
    } catch (e) {
      console.error('[NationalGapPanel] 데이터 로드 실패', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 공급 데이터 로드 ─────────────────────────────────────────────────────────

  const loadSupply = useCallback(async () => {
    setSupplyLoading(true);
    try {
      const startYear = SUPPLY_YEARS[0];
      const endYear   = SUPPLY_YEARS[SUPPLY_YEARS.length - 1];
      const res = await getRegionalSupply(startYear, endYear);
      setSupplyData(res);
    } catch (e) {
      console.error('[NationalGapPanel] 공급 데이터 로드 실패', e);
    } finally {
      setSupplyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadSupply();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData, loadSupply]);

  // 월 변경 시 재조회
  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    loadData(month);
  };

  // ── 행 클릭 → 시도 공급 차트 팝업 ────────────────────────────────────────────

  const handleRowClick = async (stat: NationalDistrictStat) => {
    if (chartStat?.province === stat.province && chartStat?.regionName === stat.regionName && chartData) {
      setChartStat(null); // 같은 지역 재클릭 시 닫기
      setMoveInItems([]);
      return;
    }
    setChartStat(stat);
    setChartLoading(true);
    setMoveInLoading(true);
    setChartData(null);
    setMoveInItems([]);

    const asilKey = PROVINCE_TO_ASIL[stat.province] ?? stat.province;

    // 시도 공급 차트 + 시군구 입주 예정 목록 병렬 조회
    await Promise.allSettled([
      getProvinceSupply(asilKey)
        .then(res => setChartData(res))
        .catch(e => console.error('[공급차트] 로드 실패', e))
        .finally(() => setChartLoading(false)),

      getMoveInData(asilKey, stat.regionName)
        .then(items => setMoveInItems(items))
        .catch(e => console.error('[입주목록] 로드 실패', e))
        .finally(() => setMoveInLoading(false)),
    ]);
  };


  // ── 갭 수집 ─────────────────────────────────────────────────────────────────

  const handleCollect = async () => {
    if (collecting) return;
    setCollecting(true);
    setToast('전국 갭 통계 수집 시작...');
    try {
      await collectNationalGapStats(1);
      const prevCollectedAt = response?.stats[0]?.collectedAt ?? '';
      let count = 0;
      pollRef.current = setInterval(async () => {
        count++;
        if (count > 60) {
          clearInterval(pollRef.current!);
          setCollecting(false);
          setToast('수집 시간이 초과되었습니다. 나중에 새로고침해 주세요.');
          return;
        }
        try {
          const res = await getNationalGapStats(selectedMonth);
          const newAt = res.stats[0]?.collectedAt ?? '';
          if (newAt && newAt !== prevCollectedAt) {
            clearInterval(pollRef.current!);
            setResponse(res);
            setCollecting(false);
            setToast('전국 갭 통계 수집 완료!');
            setTimeout(() => setToast(null), 3000);
          }
        } catch {/* 무시 */}
      }, 5000);
    } catch {
      setCollecting(false);
      setToast('수집 요청 실패');
    }
  };

  // ── 공급 수집 — 5초 폴링으로 데이터 감지 ────────────────────────────────────

  const handleSupplyCollect = async () => {
    if (supplyCollecting) return;
    setSupplyCollecting(true);
    setToast('아실 공급 데이터 수집 시작...');
    try {
      await collectRegionalSupply();
      // 수집 완료 감지: 5초마다 재조회 — 데이터 건수가 생기면 완료 (최대 2분)
      let prevCount = Object.keys(supplyData?.data ?? {}).length;
      let ticks = 0;
      const supplyPollId = setInterval(async () => {
        ticks++;
        if (ticks > 24) {
          clearInterval(supplyPollId);
          setSupplyCollecting(false);
          setToast('공급 수집 시간 초과. 새로고침 버튼을 눌러주세요.');
          return;
        }
        try {
          const startYear = SUPPLY_YEARS[0];
          const endYear   = SUPPLY_YEARS[SUPPLY_YEARS.length - 1];
          const res = await getRegionalSupply(startYear, endYear);
          const newCount = Object.keys(res.data ?? {}).length;
          if (newCount > prevCount) {
            clearInterval(supplyPollId);
            setSupplyData(res);
            setSupplyCollecting(false);
            setToast('공급 데이터 수집 완료!');
            setTimeout(() => setToast(null), 3000);
          }
          prevCount = newCount;
        } catch {/* 무시 */}
      }, 5000);
    } catch {
      setSupplyCollecting(false);
      setToast('공급 수집 요청 실패');
    }
  };

  // ── 특정 시군구의 공급 상태 조회 ────────────────────────────────────────────

  const getSupplyForProvince = (province: string, year: number): ProvinceSupplyYear | null => {
    if (!supplyData) return null;
    // 시도 전체명 → 아실 단축명 변환 후 조회
    const asilKey = PROVINCE_TO_ASIL[province] ?? province;
    return supplyData.data[asilKey]?.[year] ?? null;
  };

  // ── 데이터 필터 + 정렬 ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!response) return [];
    let list = [...response.stats];

    if (cityTypeFilter !== '전체') {
      list = list.filter(s => s.cityType === cityTypeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(s =>
        s.regionName.toLowerCase().includes(q) ||
        s.province.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let va: number | null = null;
      let vb: number | null = null;
      if (sortKey === 'population') {
        va = a.population ?? 0;
        vb = b.population ?? 0;
      } else if (sortKey === 'gap26') {
        va = (a.avgTrade26 && a.avgJeonse26) ? a.avgTrade26 - a.avgJeonse26 : null;
        vb = (b.avgTrade26 && b.avgJeonse26) ? b.avgTrade26 - b.avgJeonse26 : null;
      } else if (sortKey === 'rate26') {
        va = calcRate(a.avgTrade26, a.avgJeonse26);
        vb = calcRate(b.avgTrade26, b.avgJeonse26);
      } else if (sortKey === 'trade26') {
        va = a.avgTrade26 ?? null;
        vb = b.avgTrade26 ?? null;
      } else if (sortKey === 'jeonse26') {
        va = a.avgJeonse26 ?? null;
        vb = b.avgJeonse26 ?? null;
      }
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return sortDir === 'desc' ? vb - va : va - vb;
    });

    return list;
  }, [response, cityTypeFilter, searchQuery, sortKey, sortDir]);

  // ── 정렬 토글 ──────────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';
  const showCityTypeHeader = cityTypeFilter === '전체' && !searchQuery.trim();

  // ── 공급 뱃지 렌더 헬퍼 ─────────────────────────────────────────────────────

  const renderSupplyBadges = (province: string) => {
    if (supplyLoading) return <span style={{ color: '#bbb', fontSize: 10 }}>-</span>;
    return (
      <div style={{ display: 'flex', gap: 2, flexWrap: 'nowrap' }}>
        {SUPPLY_YEARS.map(yr => {
          const s = getSupplyForProvince(province, yr);
          if (!s) return (
            <span key={yr} style={{ fontSize: 9, color: '#ccc', lineHeight: '16px' }}>-</span>
          );
          const clr = SUPPLY_COLORS[s.supplyStatus] ?? { bg: '#f0f0f0', color: '#666' };
          return (
            <span
              key={yr}
              title={`${yr}년 공급: ${s.supplyCount.toLocaleString()}세대 / 적정수요: ${s.demandLine.toLocaleString()}세대 (${s.supplyRatio}%)`}
              style={{
                display: 'inline-block',
                fontSize: 9,
                padding: '1px 4px',
                borderRadius: 3,
                background: clr.bg,
                color: clr.color,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                lineHeight: '16px',
              }}
            >
              {String(yr).slice(2)}·{s.supplyStatus}
            </span>
          );
        })}
      </div>
    );
  };

  // ── 렌더링 ──────────────────────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    width: isMobile ? '100%' : '900px',
    height: '100vh',
    background: '#fff',
    boxShadow: '-2px 0 12px rgba(0,0,0,0.15)',
    zIndex: 3100,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'sans-serif',
  };

  return (
    <div style={panelStyle}>
      {/* 헤더 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 8, background: '#f0f8fd', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1a3a5c' }}>
          🏙 전국 갭 분석
        </span>
        {/* 거래월 셀렉트 */}
        <select
          value={selectedMonth}
          onChange={e => handleMonthChange(e.target.value)}
          style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4, border: '1px solid #ccc' }}
        >
          {(response?.availableMonths ?? []).map(m => (
            <option key={m} value={m}>{m.slice(0, 4)}년 {parseInt(m.slice(4), 10)}월</option>
          ))}
        </select>
        {/* 갭 수집 */}
        <button
          onClick={handleCollect}
          disabled={collecting}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: 'none', background: collecting ? '#aaa' : '#89CFF0', color: '#fff', cursor: collecting ? 'default' : 'pointer' }}
        >
          {collecting ? '수집 중...' : '시세 수집'}
        </button>
        {/* 공급 수집 버튼 */}
        <button
          onClick={handleSupplyCollect}
          disabled={supplyCollecting}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: 'none', background: supplyCollecting ? '#aaa' : '#6b7280', color: '#fff', cursor: supplyCollecting ? 'default' : 'pointer' }}
        >
          {supplyCollecting ? '수집 중...' : '공급 수집'}
        </button>
        {/* 새로고침 */}
        <button
          onClick={() => { loadData(selectedMonth); loadSupply(); }}
          disabled={loading}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
        >
          ↺
        </button>
        <button onClick={onClose} style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#555', marginLeft: 'auto' }}>×</button>
      </div>

      {/* 토스트 */}
      {toast && (
        <div style={{ background: '#333', color: '#fff', fontSize: 13, padding: '8px 16px', textAlign: 'center' }}>
          {toast}
        </div>
      )}

      {/* 필터 바 */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {['전체', ...CITY_TYPE_ORDER].map(ct => (
          <button
            key={ct}
            onClick={() => setCityTypeFilter(ct)}
            style={{
              fontSize: 12, padding: '3px 9px', borderRadius: 12,
              border: '1px solid #ccc',
              background: cityTypeFilter === ct ? '#89CFF0' : '#fff',
              color: cityTypeFilter === ct ? '#fff' : '#333',
              cursor: 'pointer',
            }}
          >
            {ct}
          </button>
        ))}
        <input
          type="text"
          placeholder="지역 검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid #ccc', marginLeft: 'auto' }}
        />
      </div>

      {/* 정렬 바 */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #eee', fontSize: 12, color: '#666', display: 'flex', gap: 12, alignItems: 'center' }}>
        <span>정렬:</span>
        {([
          ['population', '인구'] as [SortKey, string],
          ['trade26', '매매가'] as [SortKey, string],
          ['jeonse26', '전세가'] as [SortKey, string],
          ['gap26', '갭'] as [SortKey, string],
          ['rate26', '전세율'] as [SortKey, string],
        ]).map(([key, label]) => (
          <button key={key} onClick={() => handleSort(key as SortKey)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: sortKey === key ? '#1565c0' : '#555', fontWeight: sortKey === key ? 700 : 400 }}
          >
            {label}{sortArrow(key as SortKey)}
          </button>
        ))}
        {/* 공급 범례 */}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {Object.entries(SUPPLY_COLORS).map(([label, clr]) => (
            <span key={label} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: clr.bg, color: clr.color, fontWeight: 700 }}>{label}</span>
          ))}
        </span>
        <span style={{ color: '#999', fontSize: 11 }}>({filtered.length}개 지역)</span>
      </div>

      {/* 테이블 영역 */}
      <div style={{ flex: 1, overflowY: 'auto', fontSize: 12 }}>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>데이터 조회 중...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>
            {response ? '조건에 맞는 데이터가 없습니다.' : '데이터가 없습니다. 시세 수집 버튼을 눌러 수집하세요.'}
          </div>
        )}

        {!loading && filtered.length > 0 && (() => {
          const groups: { cityType: string; items: NationalDistrictStat[] }[] = [];
          if (showCityTypeHeader) {
            for (const ct of CITY_TYPE_ORDER) {
              const items = filtered.filter(s => s.cityType === ct);
              if (items.length > 0) groups.push({ cityType: ct, items });
            }
            const known = new Set(CITY_TYPE_ORDER);
            const etc = filtered.filter(s => !known.has(s.cityType));
            if (etc.length > 0) groups.push({ cityType: '기타', items: etc });
          } else {
            groups.push({ cityType: '', items: filtered });
          }

          const colSpanTotal = 2 + AREA_DEFS.length * 3 + 1; // +1 for 공급열

          return (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ddd', minWidth: 90 }}>지역</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right', borderBottom: '1px solid #ddd', minWidth: 45 }}>인구</th>
                  {AREA_DEFS.map(a => (
                    <React.Fragment key={a.key}>
                      <th colSpan={3} style={{ padding: '4px 4px', textAlign: 'center', borderBottom: '1px solid #ddd', borderLeft: '2px solid #ddd', fontSize: 11, color: '#555' }}>
                        {a.label}
                      </th>
                    </React.Fragment>
                  ))}
                  {/* 공급 예정 헤더 */}
                  <th
                    style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #ddd', borderLeft: '3px solid #6b7280', fontSize: 11, color: '#374151', background: '#f8f9fa', minWidth: 90 }}
                  >
                    공급 ({SUPPLY_YEARS.map(y => String(y).slice(2)).join('/')})
                  </th>
                </tr>
                <tr style={{ background: '#fafafa', position: 'sticky', top: 28, zIndex: 1 }}>
                  <th style={{ borderBottom: '1px solid #ddd' }} />
                  <th style={{ borderBottom: '1px solid #ddd' }} />
                  {AREA_DEFS.map(a => (
                    <React.Fragment key={a.key}>
                      <th style={{ padding: '3px 4px', textAlign: 'right', borderBottom: '1px solid #ddd', borderLeft: '2px solid #ddd', fontSize: 10, color: '#777' }}>매매</th>
                      <th style={{ padding: '3px 4px', textAlign: 'right', borderBottom: '1px solid #ddd', fontSize: 10, color: '#777' }}>갭</th>
                      <th style={{ padding: '3px 4px', textAlign: 'right', borderBottom: '1px solid #ddd', fontSize: 10, color: '#777' }}>전세율</th>
                    </React.Fragment>
                  ))}
                  {/* 공급 서브헤더: 적정수요 기준 뱃지 */}
                  <th style={{ padding: '3px 6px', textAlign: 'center', borderBottom: '1px solid #ddd', borderLeft: '3px solid #6b7280', fontSize: 10, color: '#777', background: '#f8f9fa' }}>
                    적정수요 대비
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map(({ cityType, items }) => (
                  <React.Fragment key={cityType}>
                    {showCityTypeHeader && (
                      <tr>
                        <td colSpan={colSpanTotal}
                          style={{ padding: '5px 8px', background: '#e8f4ff', fontWeight: 700, fontSize: 12, color: '#1a3a5c', borderTop: '2px solid #89CFF0' }}>
                          {cityType} ({items.length}개)
                        </td>
                      </tr>
                    )}
                    {items.map((stat, idx) => {
                      const isSelected = chartStat?.province === stat.province;
                      return (
                      <tr
                        key={stat.id}
                        onClick={() => handleRowClick(stat)}
                        style={{
                          background: isSelected ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#f9f9f9',
                          borderBottom: isSelected ? '2px solid #89CFF0' : '1px solid #eee',
                          cursor: 'pointer',
                          outline: isSelected ? '2px solid #89CFF0' : 'none',
                          outlineOffset: -1,
                        }}
                      >
                        {/* 지역명 */}
                        <td style={{ padding: '5px 8px', fontWeight: 500 }}>
                          <div style={{ fontSize: 12 }}>{stat.regionName}</div>
                          <div style={{ fontSize: 10, color: '#888' }}>
                            {stat.province.replace('특별시', '').replace('광역시', '').replace('특별자치시', '').replace('특별자치도', '')}
                          </div>
                        </td>
                        {/* 인구 */}
                        <td style={{ padding: '5px 4px', textAlign: 'right', color: '#555', whiteSpace: 'nowrap' }}>
                          {stat.population ? (stat.population >= 10000 ? `${(stat.population / 10000).toFixed(0)}만` : stat.population.toLocaleString()) : '-'}
                        </td>
                        {/* 평형별 데이터 */}
                        {AREA_DEFS.map(area => {
                          const trade = stat[area.key] as number | undefined;
                          const jeonse = stat[area.jeonseKey] as number | undefined;
                          const rate = calcRate(trade, jeonse);
                          const bgColor = jeonseRateColor(rate);
                          return (
                            <React.Fragment key={area.key}>
                              <td style={{ padding: '5px 4px', textAlign: 'right', borderLeft: '2px solid #eee', whiteSpace: 'nowrap' }}>
                                {fmtUk(trade)}
                              </td>
                              <td style={{ padding: '5px 4px', textAlign: 'right', background: bgColor, whiteSpace: 'nowrap', color: '#c0392b', fontWeight: 600 }}>
                                {fmtGap(trade, jeonse)}
                              </td>
                              <td style={{ padding: '5px 4px', textAlign: 'right', background: bgColor, whiteSpace: 'nowrap', fontSize: 11 }}>
                                {rate !== null ? `${rate}%` : '-'}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        {/* 공급 예정 뱃지 */}
                        <td style={{ padding: '5px 6px', borderLeft: '3px solid #e5e7eb', background: isSelected ? '#dbeafe' : idx % 2 === 0 ? '#fafafa' : '#f3f4f6' }}>
                          {renderSupplyBadges(stat.province)}
                        </td>
                      </tr>
                    );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>

      {/* 하단 안내 */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #eee', fontSize: 11, color: '#999' }}>
        * MOLIT 실거래가 기반 | 직거래 제외 | 전용면적 기준 | 전세율 = 전세가 ÷ 매매가 × 100 | 공급: 아실(asil.kr) 입주예정 세대수 — 시도 단위 | 행 클릭 시 공급 그래프
      </div>

      {/* ── 시도 공급 그래프 패널 (행 클릭 시 왼쪽에 슬라이드) ─────────────────── */}
      {chartStat && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: isMobile ? 0 : '900px',
          left: isMobile ? 0 : undefined,
          bottom: isMobile ? 0 : undefined,
          width: isMobile ? '100%' : '420px',
          height: isMobile ? '55vh' : '100vh',
          background: '#fff',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.18)',
          zIndex: 3099,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'sans-serif',
        }}>
          {/* 차트 패널 헤더 */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', background: '#f0f8fd', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', flex: 1 }}>
              📊 {PROVINCE_TO_ASIL[chartStat.province] ?? chartStat.province} 아파트 입주 예정량
            </span>
            <span style={{ fontSize: 11, color: '#888' }}>(2010–2030)</span>
            <button
              onClick={() => setChartStat(null)}
              style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#555', lineHeight: 1 }}
            >×</button>
          </div>

          {/* 로딩 */}
          {chartLoading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
              데이터 조회 중...
            </div>
          )}

          {/* 데이터 없음 */}
          {!chartLoading && !chartData && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
              공급 데이터가 없습니다. "공급 수집" 버튼을 먼저 누르세요.
            </div>
          )}

          {/* 차트 본문 */}
          {!chartLoading && chartData && (() => {
            const asilKey = PROVINCE_TO_ASIL[chartStat.province] ?? chartStat.province;
            const provinceYears = chartData.data[asilKey] ?? {};
            const barData = Object.entries(provinceYears)
              .map(([yr, d]) => ({ year: parseInt(yr, 10), ...(d as ProvinceSupplyYear) }))
              .sort((a, b) => a.year - b.year);

            if (barData.length === 0) {
              return (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
                  "{asilKey}" 공급 데이터 없음
                </div>
              );
            }

            const demandLine = barData[0]?.demandLine ?? 0;
            const currentYear = new Date().getFullYear();

            return (
              <div style={{ flex: 1, overflow: 'auto', padding: '12px 8px 8px' }}>
                {/* 범례 */}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {Object.entries(SUPPLY_COLORS).map(([label, clr]) => (
                    <span key={label} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: clr.bg, color: clr.color, fontWeight: 700 }}>
                      {label}
                    </span>
                  ))}
                  <span style={{ fontSize: 10, color: '#dc2626', marginLeft: 4 }}>
                    — 적정수요 {(demandLine / 1000).toFixed(0)}천세대/년
                  </span>
                </div>

                {/* 바 차트 */}
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barData} margin={{ top: 6, right: 20, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 9 }}
                      tickFormatter={(v: number) => v === currentYear ? `${v}★` : String(v)}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                      width={32}
                    />
                    <Tooltip
                      formatter={(value: unknown) => [`${(value as number).toLocaleString()}세대`, '공급 예정']}
                      labelFormatter={(label: unknown) => `${label}년`}
                    />
                    <ReferenceLine
                      y={demandLine}
                      stroke="#dc2626"
                      strokeDasharray="6 3"
                      label={{ value: '적정수요', position: 'insideTopRight', fontSize: 9, fill: '#dc2626' }}
                    />
                    <Bar dataKey="supplyCount" maxBarSize={24}>
                      {barData.map(d => {
                        const clr = SUPPLY_COLORS[d.supplyStatus] ?? { bg: '#e0e0e0', color: '#999' };
                        return (
                          <Cell
                            key={d.year}
                            fill={clr.bg}
                            stroke={d.year === currentYear ? '#1a3a5c' : clr.color}
                            strokeWidth={d.year === currentYear ? 2 : 1}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* 근접 연도 수치 테이블 (현재±4년) */}
                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        <th style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>연도</th>
                        <th style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>공급(세대)</th>
                        <th style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>적정수요비</th>
                        <th style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barData.filter(d => d.year >= currentYear - 2 && d.year <= currentYear + 3).map((d, i) => {
                        const clr = SUPPLY_COLORS[d.supplyStatus] ?? { bg: '#f0f0f0', color: '#666' };
                        const isCur = d.year === currentYear;
                        return (
                          <tr key={d.year} style={{ background: isCur ? '#fffbeb' : i % 2 === 0 ? '#fff' : '#f9f9f9', fontWeight: isCur ? 700 : 400 }}>
                            <td style={{ padding: '3px 6px', textAlign: 'center' }}>{d.year}{isCur ? ' ★' : ''}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'right' }}>{d.supplyCount.toLocaleString()}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'right' }}>{d.supplyRatio}%</td>
                            <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                              <span style={{ padding: '1px 6px', borderRadius: 3, background: clr.bg, color: clr.color, fontWeight: 700 }}>
                                {d.supplyStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 10, color: '#bbb', marginTop: 8, textAlign: 'center' }}>
                  출처: 아실(asil.kr) | 적정수요 {demandLine.toLocaleString()}세대/년
                </div>

                {/* 입주 예정 단지 목록 */}
                <div style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                    🏗 {chartStat.regionName} 입주 예정 단지
                    {moveInLoading && <span style={{ fontSize: 10, fontWeight: 400, color: '#888', marginLeft: 6 }}>조회 중...</span>}
                    {!moveInLoading && <span style={{ fontSize: 10, fontWeight: 400, color: '#888', marginLeft: 6 }}>({moveInItems.length}건)</span>}
                  </div>
                  {!moveInLoading && moveInItems.length === 0 && (
                    <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', padding: '8px 0' }}>
                      입주 예정 단지 없음
                    </div>
                  )}
                  {moveInItems.length > 0 && (() => {
                    // 연도별 그룹핑
                    const byYear: Record<number, MoveInItem[]> = {};
                    for (const item of moveInItems) {
                      const yr = item.moveinYear ?? 0;
                      if (!byYear[yr]) byYear[yr] = [];
                      byYear[yr].push(item);
                    }
                    return (
                      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                        {Object.entries(byYear)
                          .sort(([a], [b]) => parseInt(a) - parseInt(b))
                          .map(([yr, items]) => (
                            <div key={yr} style={{ marginBottom: 8 }}>
                              {/* 연도 헤더 */}
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', padding: '3px 8px', borderRadius: 4, marginBottom: 4 }}>
                                {yr}년 · {items.reduce((s, i) => s + (i.household || 0), 0).toLocaleString()}세대
                              </div>
                              {/* 월별 단지 목록 */}
                              {items.map(item => (
                                <div key={item.seq} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '3px 8px', fontSize: 11, borderBottom: '1px solid #f3f4f6' }}>
                                  <span style={{ color: '#6b7280', minWidth: 28, fontSize: 10 }}>{item.moveinMonth}월</span>
                                  <span style={{ flex: 1, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</span>
                                  <span style={{ color: '#374151', whiteSpace: 'nowrap' }}>{(item.household || 0).toLocaleString()}세대</span>
                                </div>
                              ))}
                            </div>
                          ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default NationalGapPanel;
