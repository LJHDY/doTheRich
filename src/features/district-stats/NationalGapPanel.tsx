/**
 * NationalGapPanel.tsx
 * 전국 시군구 갭 분석 패널 — 인구 순 정렬, 매매/전세 갭 + 전세가율 히트맵 표시
 * 25평(전용 85㎡) · 33평(전용 109㎡) · 24평(전용 79㎡) 3개 평형 중심
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getNationalGapStats, collectNationalGapStats } from '../../services/api';
import type { NationalDistrictStat, NationalGapResponse } from '../../types';
import { useIsMobile } from '../../hooks/useIsMobile';

// ── 상수 ─────────────────────────────────────────────────────────────────────

/** 지역 유형 표시 순서 (인구 규모 감안) */
const CITY_TYPE_ORDER = ['서울', '수도권', '광역시', '세종', '지방'];

/** 히트맵 색상: 전세가율 높을수록(갭 낮을수록) 초록, 낮을수록(갭 높을수록) 빨강 */
function jeonseRateColor(rate: number | null): string {
  if (rate === null) return 'transparent';
  // rate: 0~100
  const clamped = Math.max(0, Math.min(100, rate));
  if (clamped >= 75) return '#c8f5c8'; // 짙은 초록 (전세율 높음 = 갭 낮음)
  if (clamped >= 60) return '#e8f8e8';
  if (clamped >= 50) return '#fff8e0'; // 중립
  if (clamped >= 40) return '#fde8e8';
  return '#fbbaba'; // 빨강 (갭 큼)
}

/** 억 단위 포맷 (소수점 1자리) */
function fmtUk(val?: number): string {
  if (!val) return '-';
  return (val / 10000).toFixed(1) + '억';
}

/** 갭(매매-전세) 억 단위 포맷 */
function fmtGap(trade?: number, jeonse?: number): string {
  if (!trade || !jeonse) return '-';
  const gap = trade - jeonse;
  return (gap / 10000).toFixed(1) + '억';
}

/** 전세가율(%) 계산 */
function calcRate(trade?: number, jeonse?: number): number | null {
  if (!trade || !jeonse || trade === 0) return null;
  return Math.round((jeonse / trade) * 100);
}

// ── 평형 정의 ─────────────────────────────────────────────────────────────────
interface AreaDef {
  key: keyof NationalDistrictStat;    // avgTrade26 같은 매매가 키
  jeonseKey: keyof NationalDistrictStat; // avgJeonse26
  label: string;                      // 화면 표시 레이블
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

  // 데이터 상태
  const [response, setResponse] = useState<NationalGapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);

  // 필터 상태
  const [cityTypeFilter, setCityTypeFilter] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState('');

  // 정렬 상태
  const [sortKey, setSortKey] = useState<SortKey>('population');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // 폴링 ref
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── 데이터 로드 ─────────────────────────────────────────────────────────────

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

  useEffect(() => {
    loadData();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  // 월 변경 시 재조회
  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    loadData(month);
  };

  // ── 수집 ────────────────────────────────────────────────────────────────────

  const handleCollect = async () => {
    if (collecting) return;
    setCollecting(true);
    setToast('전국 갭 통계 수집 시작...');
    try {
      await collectNationalGapStats(1);
      // 30초 폴링 — collected_at 갱신 감지
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

  // ── 데이터 필터 + 정렬 ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!response) return [];
    let list = [...response.stats];

    // 지역 유형 필터
    if (cityTypeFilter !== '전체') {
      list = list.filter(s => s.cityType === cityTypeFilter);
    }

    // 검색어 필터 (지역명/시도명)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(s =>
        s.regionName.toLowerCase().includes(q) ||
        s.province.toLowerCase().includes(q)
      );
    }

    // 정렬
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
      // null 은 뒤로 보냄
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

  // ── 지역 유형별 그룹화 여부 판단 ────────────────────────────────────────────
  // 전체 보기 시 지역 유형 헤더 표시
  const showCityTypeHeader = cityTypeFilter === '전체' && !searchQuery.trim();

  // ── 렌더링 ──────────────────────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    width: isMobile ? '100%' : '780px',
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
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 8, background: '#f0f8fd' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1a3a5c', flex: 1 }}>
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
        {/* 수집 버튼 */}
        <button
          onClick={handleCollect}
          disabled={collecting}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: 'none', background: collecting ? '#aaa' : '#89CFF0', color: '#fff', cursor: collecting ? 'default' : 'pointer' }}
        >
          {collecting ? '수집 중...' : '시세 수집'}
        </button>
        {/* 새로고침 버튼 */}
        <button
          onClick={() => loadData(selectedMonth)}
          disabled={loading}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
        >
          ↺
        </button>
        {/* 닫기 */}
        <button onClick={onClose} style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#555' }}>×</button>
      </div>

      {/* 토스트 */}
      {toast && (
        <div style={{ background: '#333', color: '#fff', fontSize: 13, padding: '8px 16px', textAlign: 'center' }}>
          {toast}
        </div>
      )}

      {/* 필터 바 */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 지역 유형 탭 */}
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
        {/* 지역명 검색 */}
        <input
          type="text"
          placeholder="지역 검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid #ccc', marginLeft: 'auto' }}
        />
      </div>

      {/* 정렬 바 */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #eee', fontSize: 12, color: '#666', display: 'flex', gap: 12 }}>
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
        <span style={{ marginLeft: 'auto', color: '#999' }}>({filtered.length}개 지역)</span>
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
          // 지역 유형별 그룹화
          const groups: { cityType: string; items: NationalDistrictStat[] }[] = [];
          if (showCityTypeHeader) {
            for (const ct of CITY_TYPE_ORDER) {
              const items = filtered.filter(s => s.cityType === ct);
              if (items.length > 0) groups.push({ cityType: ct, items });
            }
            // 알 수 없는 유형도 포함
            const known = new Set(CITY_TYPE_ORDER);
            const etc = filtered.filter(s => !known.has(s.cityType));
            if (etc.length > 0) groups.push({ cityType: '기타', items: etc });
          } else {
            groups.push({ cityType: '', items: filtered });
          }

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
                </tr>
              </thead>
              <tbody>
                {groups.map(({ cityType, items }) => (
                  <React.Fragment key={cityType}>
                    {/* 지역 유형 헤더 행 */}
                    {showCityTypeHeader && (
                      <tr>
                        <td colSpan={2 + AREA_DEFS.length * 3}
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
                          <div style={{ fontSize: 10, color: '#888' }}>{stat.province.replace('특별시', '').replace('광역시', '').replace('특별자치시', '').replace('특별자치도', '')}</div>
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
        * MOLIT 실거래가 기반 | 직거래 제외 | 전용면적 기준 | 전세율 = 전세가 ÷ 매매가 × 100 | 매월 2일 자동 수집
      </div>
    </div>
  );
};

export default NationalGapPanel;
