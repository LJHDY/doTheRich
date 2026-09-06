/**
 * NationalGapPanel.tsx
 * 전국 시군구 갭 분석 패널 — 인구 순 정렬, 매매/전세 갭 + 전세가율 히트맵 표시
 * + 아실(asil.kr) 기반 향후 3년 아파트 공급 상태 뱃지
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getNationalGapStats, collectNationalGapStats,
  getRegionalSupply, collectRegionalSupply,
} from '../../services/api';
import type { NationalDistrictStat, NationalGapResponse, RegionalSupplyResponse, ProvinceSupplyYear } from '../../types';
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

/** 세대수 K 단위 포맷 */
function fmtSupply(count: number | null): string {
  if (!count && count !== 0) return '-';
  return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
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

  // ── 공급 수집 ────────────────────────────────────────────────────────────────

  const handleSupplyCollect = async () => {
    if (supplyCollecting) return;
    setSupplyCollecting(true);
    setToast('아실 공급 데이터 수집 시작...');
    try {
      await collectRegionalSupply();
      // 10초 후 자동 재조회 (아실 수집은 빠름)
      setTimeout(async () => {
        await loadSupply();
        setSupplyCollecting(false);
        setToast('공급 데이터 수집 완료!');
        setTimeout(() => setToast(null), 3000);
      }, 10000);
    } catch {
      setSupplyCollecting(false);
      setToast('공급 수집 요청 실패');
    }
  };

  // ── 특정 시군구의 공급 상태 조회 ────────────────────────────────────────────

  const getSupplyForProvince = (province: string, year: number): ProvinceSupplyYear | null => {
    if (!supplyData) return null;
    return supplyData.data[province]?.[year] ?? null;
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
                    {items.map((stat, idx) => (
                      <tr key={stat.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #eee' }}>
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
                        <td style={{ padding: '5px 6px', borderLeft: '3px solid #e5e7eb', background: idx % 2 === 0 ? '#fafafa' : '#f3f4f6' }}>
                          {renderSupplyBadges(stat.province)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>

      {/* 하단 안내 */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #eee', fontSize: 11, color: '#999' }}>
        * MOLIT 실거래가 기반 | 직거래 제외 | 전용면적 기준 | 전세율 = 전세가 ÷ 매매가 × 100 | 공급: 아실(asil.kr) 입주예정 세대수 기반 — 시도 단위 | 매월 2일 자동 수집
      </div>
    </div>
  );
};

export default NationalGapPanel;
