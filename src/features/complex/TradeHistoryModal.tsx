import React, { useState, useEffect, useCallback } from 'react';
import {
  getTradeHistory, getTradeHistoryStatus, collectTradeHistory, TradeHistoryMonth, TradeRawItem,
  getProvinceSupply, getMoveInData,
} from '../../services/api';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
  BarChart, Cell, ReferenceLine,
} from 'recharts';
import { ProvinceSupplyYear, MoveInItem, RegionalSupplyResponse } from '../../types';

export interface TradeComplexEntry {
  complexId: number;
  complexName: string;
  color: string;
  region?: string; // "서울특별시 강남구" 형태 — 공급 현황 표시에 사용
}

// 공급 현황 색상 — NationalGapPanel과 동일 팔레트
const SUPPLY_COLORS: Record<string, { bg: string; color: string }> = {
  부족: { bg: '#dbeafe', color: '#1d4ed8' },
  적정: { bg: '#dcfce7', color: '#15803d' },
  초과: { bg: '#ffedd5', color: '#c2410c' },
  과잉: { bg: '#fee2e2', color: '#b91c1c' },
};

// "서울특별시 강남구" → "서울"
function toProvinceKey(region?: string): string | null {
  if (!region) return null;
  const f = region.trim().split(/\s+/)[0];
  if (f.startsWith('서울')) return '서울';
  if (f.startsWith('경기')) return '경기';
  if (f.startsWith('인천')) return '인천';
  if (f.startsWith('부산')) return '부산';
  if (f.startsWith('대구')) return '대구';
  if (f.startsWith('광주')) return '광주';
  if (f.startsWith('대전')) return '대전';
  if (f.startsWith('울산')) return '울산';
  if (f.startsWith('세종')) return '세종';
  if (f.startsWith('강원')) return '강원';
  if (f.startsWith('충북') || f.startsWith('충청북')) return '충북';
  if (f.startsWith('충남') || f.startsWith('충청남')) return '충남';
  if (f.startsWith('전북') || f.startsWith('전라북')) return '전북';
  if (f.startsWith('전남') || f.startsWith('전라남')) return '전남';
  if (f.startsWith('경북') || f.startsWith('경상북')) return '경북';
  if (f.startsWith('경남') || f.startsWith('경상남')) return '경남';
  if (f.startsWith('제주')) return '제주';
  return null;
}

// "서울특별시 강남구" → "강남구" / "경기도 성남시 분당구" → "성남시"
function toGuName(region?: string): string | null {
  if (!region) return null;
  const parts = region.trim().split(/\s+/).slice(1); // 도/시 레벨 제외
  for (const p of parts) {
    if (p.endsWith('시') || p.endsWith('군') || p.endsWith('구')) return p;
  }
  return parts[parts.length - 1] ?? null;
}

interface Props {
  entries: TradeComplexEntry[];
  onClose: () => void;
}

// 레이블별 매매+전세 집계 결과
interface LabelAgg {
  tradeCount: number;
  tradeAvg: number | null;
  jeonseCount: number;
  jeonseAvg: number | null;
}

const TradeHistoryModal: React.FC<Props> = ({ entries, onClose }) => {
  const [histories, setHistories] = useState<Map<number, TradeHistoryMonth[]>>(new Map());
  const [statuses, setStatuses] = useState<Map<number, boolean>>(new Map());
  const [collecting, setCollecting] = useState<Set<number>>(new Set());
  const [granularity, setGranularity] = useState<'month' | 'quarter' | 'year'>('year');
  const [selectedYear, setSelectedYear] = useState('');
  const [areaFilters, setAreaFilters] = useState<Map<number, string>>(new Map());
  // 드릴다운: 클릭한 레이블 + 매매/전세 선택
  const [clickedLabel, setClickedLabel] = useState<string | null>(null);
  const [drillType, setDrillType] = useState<'trade' | 'jeonse'>('trade');
  // 공급 현황 (단일 단지 + region 있을 때만 로드)
  const [supplyData, setSupplyData] = useState<RegionalSupplyResponse | null>(null);
  const [moveInItems, setMoveInItems] = useState<MoveInItem[]>([]);
  const [supplyLoading, setSupplyLoading] = useState(false);

  // 모달 오픈 시 각 단지 수집 상태 + 이력 로드
  useEffect(() => {
    entries.forEach(async ({ complexId }) => {
      try {
        const s = await getTradeHistoryStatus(complexId);
        setStatuses(prev => new Map(prev).set(complexId, s.collected));
        if (s.collected) {
          const rows = await getTradeHistory(complexId);
          setHistories(prev => new Map(prev).set(complexId, rows));
        }
      } catch { /* ignore */ }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 단일 단지 + region 있을 때 시도 공급 차트 + 구 입주 예정 단지 로드
  useEffect(() => {
    if (entries.length !== 1) return;
    const region = entries[0].region;
    const province = toProvinceKey(region);
    const gu = toGuName(region);
    if (!province) return;
    setSupplyLoading(true);
    const currentYear = new Date().getFullYear();
    Promise.allSettled([
      getProvinceSupply(province).then(r => setSupplyData(r)).catch(() => {}),
      getMoveInData(province, gu ?? undefined, currentYear).then(r => setMoveInItems(r)).catch(() => {}),
    ]).finally(() => setSupplyLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 개별 단지 수집 트리거 + 폴링
  // collect 엔드포인트는 202 즉시 반환 → 백그라운드 실행. 따라서 수집 전 lastUpdated를
  // 기록해두고, 해당 값이 바뀔 때까지 폴링해야 새 데이터를 올바르게 로드할 수 있다.
  const handleCollect = useCallback(async (complexId: number) => {
    setCollecting(prev => new Set(prev).add(complexId));

    let prevLastUpdated: string | null = null;
    try {
      const prevStatus = await getTradeHistoryStatus(complexId);
      prevLastUpdated = prevStatus.lastUpdated ?? null;
    } catch { /* ignore */ }

    try { await collectTradeHistory(complexId); } catch { /* ignore */ }

    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const s = await getTradeHistoryStatus(complexId);
        const isNewlyCollected =
          s.collected && s.lastUpdated != null && s.lastUpdated !== prevLastUpdated;
        const wasUncollected = !prevLastUpdated && s.collected;
        if (isNewlyCollected || wasUncollected) {
          clearInterval(poll);
          setCollecting(prev => { const n = new Set(prev); n.delete(complexId); return n; });
          setStatuses(prev => new Map(prev).set(complexId, true));
          const rows = await getTradeHistory(complexId);
          setHistories(prev => new Map(prev).set(complexId, rows));
        }
      } catch { /* ignore */ }
      if (attempts >= 48) {
        clearInterval(poll);
        setCollecting(prev => { const n = new Set(prev); n.delete(complexId); return n; });
      }
    }, 5000);
  }, []);

  const isSingle = entries.length === 1;

  // 단지별 보유 평형 목록 — 매매 + 전세 합집합
  const areasPerComplex = new Map<number, string[]>(
    entries.map(({ complexId }) => {
      const areas = Array.from(new Set(
        (histories.get(complexId) || []).flatMap(m => [
          ...Object.keys(m.areaBreakdown),
          ...Object.keys(m.jeonseAreaBreakdown ?? {}),
        ])
      )).sort((a, b) => (parseFloat(a) || 999) - (parseFloat(b) || 999));
      return [complexId, areas];
    })
  );

  const getArea = (complexId: number) => areaFilters.get(complexId) ?? '전체';
  const setArea = (complexId: number, area: string) =>
    setAreaFilters(prev => new Map(prev).set(complexId, area));

  const availableYears = Array.from(new Set(
    entries.flatMap(({ complexId }) =>
      (histories.get(complexId) || []).map(m => m.yearMonth.slice(0, 4))
    )
  )).sort();
  const latestYear = availableYears[availableYears.length - 1] ?? '';
  const showAll = selectedYear === 'ALL';
  const effectiveYear = showAll ? latestYear
    : (selectedYear && availableYears.includes(selectedYear)) ? selectedYear : latestYear;

  // 매매+전세 동시 집계
  const getAgg = (complexId: number): Map<string, LabelAgg> => {
    const hist = histories.get(complexId) || [];
    const area = getArea(complexId);
    const acc = new Map<string, { tc: number; tp: number[]; jc: number; jp: number[] }>();

    hist.forEach(m => {
      let label: string;
      if (granularity === 'month') {
        if (!showAll && m.yearMonth.slice(0, 4) !== effectiveYear) return;
        label = showAll
          ? `${m.yearMonth.slice(0, 4)}.${m.yearMonth.slice(4)}`
          : `${parseInt(m.yearMonth.slice(4))}월`;
      } else if (granularity === 'quarter') {
        const mo = parseInt(m.yearMonth.slice(4));
        label = `${m.yearMonth.slice(0, 4)}Q${Math.ceil(mo / 3)}`;
      } else {
        label = m.yearMonth.slice(0, 4);
      }

      const cur = acc.get(label) ?? { tc: 0, tp: [], jc: 0, jp: [] };

      // 매매
      const tradeBd = area === '전체' ? null : m.areaBreakdown[area];
      cur.tc += area === '전체' ? m.tradeCount : (tradeBd?.count ?? 0);
      const tp = area === '전체' ? m.avgPrice : tradeBd?.avg;
      if (tp != null) cur.tp.push(tp);

      // 전세
      const jeonseBd = area === '전체' ? null : (m.jeonseAreaBreakdown ?? {})[area];
      cur.jc += area === '전체' ? m.jeonseCount : (jeonseBd?.count ?? 0);
      const jp = area === '전체' ? m.avgJeonse : jeonseBd?.avg;
      if (jp != null) cur.jp.push(jp);

      acc.set(label, cur);
    });

    return new Map(Array.from(acc.entries()).map(([k, v]) => [k, {
      tradeCount: v.tc,
      tradeAvg: v.tp.length ? v.tp.reduce((a, b) => a + b, 0) / v.tp.length : null,
      jeonseCount: v.jc,
      jeonseAvg: v.jp.length ? v.jp.reduce((a, b) => a + b, 0) / v.jp.length : null,
    }]));
  };

  const allAggs = new Map(entries.map(e => [e.complexId, getAgg(e.complexId)]));

  let labels = Array.from(new Set(
    Array.from(allAggs.values()).flatMap(agg => Array.from(agg.keys()))
  )).sort();

  if (granularity === 'month' && !showAll) {
    labels = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
  }

  // 차트 데이터 — 매매 거래량(_tc), 전세 거래량(_jc), 매매 평균가(_tp), 전세 평균가(_jp)
  const chartData = labels.map(label => {
    const row: Record<string, string | number | null> = { label };
    entries.forEach(({ complexId }) => {
      const val = allAggs.get(complexId)?.get(label);
      row[`c${complexId}_tc`] = val?.tradeCount ?? 0;
      row[`c${complexId}_jc`] = val?.jeonseCount ?? 0;
      row[`c${complexId}_tp`] = val?.tradeAvg != null
        ? parseFloat((val.tradeAvg / 10000).toFixed(2)) : null;
      row[`c${complexId}_jp`] = val?.jeonseAvg != null
        ? parseFloat((val.jeonseAvg / 10000).toFixed(2)) : null;
    });
    return row;
  });

  // 가격 Y축 범위 — 매매 + 전세 모두 포함
  const allPrices = entries.flatMap(({ complexId }) =>
    Array.from(allAggs.get(complexId)?.values() || []).flatMap(v => {
      const prices: number[] = [];
      if (v.tradeAvg != null) prices.push(v.tradeAvg / 10000);
      if (v.jeonseAvg != null) prices.push(v.jeonseAvg / 10000);
      return prices;
    })
  );
  const minP = allPrices.length ? Math.floor(Math.min(...allPrices) * 0.92 * 10) / 10 : 0;
  const maxP = allPrices.length ? Math.ceil(Math.max(...allPrices) * 1.05 * 10) / 10 : 10;

  // 매매 또는 전세 데이터가 있으면 차트 표시
  const hasTradeData = chartData.some(row =>
    entries.some(({ complexId }) => (row[`c${complexId}_tc`] as number) > 0)
  );
  const hasJeonseData = chartData.some(row =>
    entries.some(({ complexId }) => (row[`c${complexId}_jc`] as number) > 0)
  );
  const hasAnyData = hasTradeData || hasJeonseData;

  // 전세 데이터가 없는 수집된 단지 — 재수집 안내 표시
  const jeonseNoDataIds = entries.filter(e =>
    statuses.get(e.complexId) &&
    !collecting.has(e.complexId) &&
    !hasJeonseData &&
    (histories.get(e.complexId) || []).every(m => m.jeonseCount === 0)
  );

  // 색상
  const tradeBarColor = (e: TradeComplexEntry) =>
    isSingle ? '#89CFF0' : e.color;
  const jeonseBarColor = (e: TradeComplexEntry) =>
    isSingle ? '#F4A0A0' : `${e.color}99`;
  const tradeLineColor = (e: TradeComplexEntry) =>
    isSingle ? '#1565C0' : e.color;
  const jeonseLineColor = (e: TradeComplexEntry) =>
    isSingle ? '#C0392B' : `${e.color}CC`;

  const xInterval = showAll && granularity === 'month' ? 11
    : granularity === 'quarter' && labels.length > 20 ? 3 : 0;
  const xFormatter = showAll && granularity === 'month'
    ? (v: string) => v.slice(0, 4) : undefined;

  // 레이블 → yearMonth 목록
  const getLabelMonths = (label: string): string[] => {
    if (granularity === 'month') {
      if (showAll) return [label.replace('.', '')];
      const mo = String(parseInt(label)).padStart(2, '0');
      return [`${effectiveYear}${mo}`];
    } else if (granularity === 'quarter') {
      const [yearPart, qPart] = label.split('Q');
      const q = parseInt(qPart);
      const startMo = (q - 1) * 3 + 1;
      return Array.from({ length: 3 }, (_, i) => `${yearPart}${String(startMo + i).padStart(2, '0')}`);
    } else {
      return Array.from({ length: 12 }, (_, i) => `${label}${String(i + 1).padStart(2, '0')}`);
    }
  };

  // 드릴다운 개별 거래 목록 (drillType 기준, 평형 필터 적용, 날짜 내림차순)
  const drillDownItems: (TradeRawItem & { complexId: number })[] = clickedLabel
    ? (() => {
        const months = new Set(getLabelMonths(clickedLabel));
        const result: (TradeRawItem & { complexId: number })[] = [];
        entries.forEach(({ complexId }) => {
          const selectedArea = getArea(complexId);
          (histories.get(complexId) || [])
            .filter(m => months.has(m.yearMonth))
            .forEach(m => {
              const rawList = drillType === 'jeonse' ? (m.jeonseRawItems || []) : (m.rawItems || []);
              rawList.filter(it => selectedArea === '전체' || it.area === selectedArea)
                .forEach(it => result.push({ ...it, complexId }));
            });
        });
        return result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      })()
    : [];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '18px',
          width: '100%', maxWidth: '960px',
          maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── 헤더 (sticky) ── */}
        <div style={{
          padding: '22px 28px 14px',
          position: 'sticky', top: 0, background: '#fff', zIndex: 2,
          borderBottom: '1px solid #f0f0f0',
        }}>
          {/* 타이틀 + 닫기 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
                {isSingle ? '거래량 이력' : '거래량 이력 비교'}
              </h2>
              <p style={{ fontSize: '12px', color: '#9aa0a6', margin: '3px 0 0' }}>
                {isSingle
                  ? entries[0].complexName
                  : entries.map(e => e.complexName).join('  vs  ')}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                width: '32px', height: '32px', borderRadius: '50%',
                border: 'none', background: '#f0f0f0',
                cursor: 'pointer', fontSize: '18px', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#5f6368', flexShrink: 0,
              }}
            >×</button>
          </div>

          {/* 단위 토글 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {(['year', 'quarter', 'month'] as const).map(g => (
              <button key={g} onClick={() => setGranularity(g)} style={{
                padding: '5px 14px', fontSize: '12px', fontWeight: granularity === g ? 700 : 400,
                border: `1.5px solid ${granularity === g ? '#4BAAD4' : '#dadce0'}`,
                borderRadius: '20px',
                background: granularity === g ? '#4BAAD4' : '#fff',
                color: granularity === g ? '#fff' : '#5f6368',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {g === 'year' ? '연별' : g === 'quarter' ? '분기별' : '월별'}
              </button>
            ))}

            {granularity === 'month' && availableYears.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '10px' }}>
                <button
                  onClick={() => {
                    if (showAll) { setSelectedYear(latestYear); return; }
                    const idx = availableYears.indexOf(effectiveYear);
                    if (idx > 0) setSelectedYear(availableYears[idx - 1]);
                  }}
                  disabled={!showAll && availableYears.indexOf(effectiveYear) === 0}
                  style={{ padding: '4px 9px', border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#5f6368' }}
                >◀</button>
                <span style={{
                  padding: '4px 10px', fontSize: '13px', fontWeight: 700,
                  color: '#344054', minWidth: '72px', textAlign: 'center',
                }}>
                  {showAll ? '전체 기간' : effectiveYear}
                </span>
                <button
                  onClick={() => {
                    const idx = availableYears.indexOf(effectiveYear);
                    if (idx < availableYears.length - 1) setSelectedYear(availableYears[idx + 1]);
                  }}
                  disabled={showAll || availableYears.indexOf(effectiveYear) === availableYears.length - 1}
                  style={{ padding: '4px 9px', border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#5f6368' }}
                >▶</button>
                <button
                  onClick={() => setSelectedYear(showAll ? latestYear : 'ALL')}
                  style={{
                    padding: '4px 12px', marginLeft: '6px',
                    border: `1.5px solid ${showAll ? '#4BAAD4' : '#dadce0'}`,
                    borderRadius: '20px', fontSize: '12px', fontWeight: showAll ? 700 : 400,
                    background: showAll ? '#4BAAD4' : '#fff',
                    color: showAll ? '#fff' : '#5f6368', cursor: 'pointer',
                  }}
                >전체</button>
              </div>
            )}
          </div>

          {/* 평형 선택 */}
          {isSingle ? (
            (() => {
              const areas = areasPerComplex.get(entries[0].complexId) ?? [];
              const cur = getArea(entries[0].complexId);
              return areas.length > 0 ? (
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {areas.length > 1 && (
                    <button onClick={() => setArea(entries[0].complexId, '전체')} style={{
                      padding: '3px 11px', fontSize: '11px',
                      border: `1px solid ${cur === '전체' ? '#344054' : '#e0e0e0'}`,
                      borderRadius: '16px',
                      background: cur === '전체' ? '#344054' : '#f8f9fa',
                      color: cur === '전체' ? '#fff' : '#5f6368', cursor: 'pointer',
                    }}>전체</button>
                  )}
                  {areas.map(a => (
                    <button key={a} onClick={() => setArea(entries[0].complexId, a)} style={{
                      padding: '3px 11px', fontSize: '11px',
                      border: `1px solid ${cur === a ? '#4BAAD4' : '#e0e0e0'}`,
                      borderRadius: '16px',
                      background: cur === a ? '#e0f4fb' : '#f8f9fa',
                      color: cur === a ? '#1a73e8' : '#5f6368', cursor: 'pointer',
                    }}>{parseFloat(a).toFixed(0)}㎡</button>
                  ))}
                </div>
              ) : null;
            })()
          ) : (
            (() => {
              const collectedEntries = entries.filter(e => statuses.get(e.complexId));
              if (collectedEntries.length === 0) return null;
              return (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {collectedEntries.map(e => {
                    const areas = areasPerComplex.get(e.complexId) ?? [];
                    const cur = getArea(e.complexId);
                    return (
                      <div key={e.complexId} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '80px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: e.color, flexShrink: 0 }} />
                          <span style={{
                            fontSize: '11px', fontWeight: 700, color: '#344054',
                            maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }} title={e.complexName}>{e.complexName}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {areas.length > 1 && (
                            <button onClick={() => setArea(e.complexId, '전체')} style={{
                              padding: '2px 9px', fontSize: '11px',
                              border: `1px solid ${cur === '전체' ? '#344054' : '#e0e0e0'}`,
                              borderRadius: '14px',
                              background: cur === '전체' ? '#344054' : '#f8f9fa',
                              color: cur === '전체' ? '#fff' : '#5f6368', cursor: 'pointer',
                            }}>전체</button>
                          )}
                          {areas.map(a => (
                            <button key={a} onClick={() => setArea(e.complexId, a)} style={{
                              padding: '2px 9px', fontSize: '11px',
                              border: `1px solid ${cur === a ? e.color : '#e0e0e0'}`,
                              borderRadius: '14px',
                              background: cur === a ? `${e.color}22` : '#f8f9fa',
                              color: cur === a ? e.color : '#5f6368',
                              cursor: 'pointer', fontWeight: cur === a ? 700 : 400,
                            }}>{parseFloat(a).toFixed(0)}㎡</button>
                          ))}
                          {areas.length === 0 && (
                            <span style={{ fontSize: '11px', color: '#9aa0a6' }}>평형 정보 없음</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>

        {/* ── 본문 ── */}
        <div style={{ padding: '20px 28px 28px' }}>

          {/* 미수집 단지 안내 */}
          {entries.map(({ complexId, complexName, color }) => {
            if (statuses.get(complexId)) return null;
            const isCollecting = collecting.has(complexId);
            return (
              <div key={complexId} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px', marginBottom: '10px',
                background: '#fafafa', borderRadius: '10px',
                border: `1px solid ${color}55`,
              }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#344054', flex: 1, fontWeight: 500 }}>{complexName}</span>
                {isCollecting ? (
                  <span style={{ fontSize: '12px', color: '#9aa0a6' }}>수집 중... (2~3분 소요)</span>
                ) : (
                  <button onClick={() => handleCollect(complexId)} style={{
                    padding: '6px 14px', fontSize: '12px',
                    border: '1.5px solid #4BAAD4', borderRadius: '18px',
                    background: '#fff', color: '#4BAAD4', cursor: 'pointer', fontWeight: 600,
                  }}>10년 데이터 수집</button>
                )}
              </div>
            );
          })}

          {/* 전세 데이터 없음 안내 배너 */}
          {jeonseNoDataIds.length > 0 && hasTradeData && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 16px', marginBottom: '12px',
              background: '#fff5f5', borderRadius: '10px',
              border: '1px solid #f4a0a0',
            }}>
              <span style={{ fontSize: '13px', color: '#C0392B', flex: 1 }}>
                전세 데이터 없음 — 재수집하면 매매·전세를 함께 표시합니다
              </span>
              {isSingle && (
                <button
                  onClick={() => handleCollect(entries[0].complexId)}
                  disabled={collecting.has(entries[0].complexId)}
                  style={{
                    padding: '5px 14px', fontSize: '12px', fontWeight: 600,
                    border: '1.5px solid #C0392B', borderRadius: '16px',
                    background: '#fff', color: '#C0392B', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {collecting.has(entries[0].complexId) ? '수집 중...' : '↺ 재수집'}
                </button>
              )}
            </div>
          )}

          {/* 차트 */}
          {hasAnyData && (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 54, left: 0, bottom: 0 }}
                style={{ cursor: 'pointer' }}
                onClick={(data) => {
                  // ComposedChart 레벨 onClick — Bar 위에 Line이 그려져 Bar onClick이
                  // 가로막히는 문제를 방지. activeLabel로 클릭한 X축 레이블을 가져온다.
                  const l = (data as any)?.activeLabel as string | undefined;
                  if (l) setClickedLabel(prev => prev === l ? null : l);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#9aa0a6' }}
                  interval={xInterval}
                  tickFormatter={xFormatter}
                />
                <YAxis
                  yAxisId="left" orientation="left"
                  tick={{ fontSize: 11, fill: '#9aa0a6' }} allowDecimals={false}
                  label={{ value: '건', position: 'insideTopLeft', fontSize: 11, fill: '#9aa0a6', dy: -6 }}
                  width={46}
                />
                <YAxis
                  yAxisId="right" orientation="right"
                  tick={{ fontSize: 11, fill: '#9aa0a6' }}
                  domain={[minP, maxP]}
                  tickFormatter={(v: number) => `${v.toFixed(1)}억`}
                  width={54}
                />
                <Tooltip
                  contentStyle={{ fontSize: '12px', borderRadius: '10px', border: '1px solid #e0e0e0', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                  formatter={(value: number, name: string, props) => {
                    const [prefix, type] = (name as string).split('_');
                    const cid = parseInt(prefix.slice(1));
                    const entry = entries.find(e => e.complexId === cid);
                    const selectedArea = getArea(cid);
                    const areaSuffix = selectedArea !== '전체' ? ` (${parseFloat(selectedArea).toFixed(0)}㎡)` : '';
                    const cname = isSingle ? '' : `${entry?.complexName ?? ''}${areaSuffix} `;
                    if (type === 'tc') return [`${value}건`, `${cname}매매 거래량`];
                    if (type === 'jc') return [`${value}건`, `${cname}전세 거래량`];
                    if (type === 'tp') return [`${(value as number)?.toFixed?.(2) ?? '-'}억`, `${cname}매매 평균가`];
                    if (type === 'jp') {
                      // 갭 계산 — 같은 레이블의 매매가와 비교
                      const label = props.payload?.label as string;
                      const tp = chartData.find(r => r.label === label)?.[`c${cid}_tp`] as number | null;
                      const gap = tp != null && value != null ? (tp - value).toFixed(2) : null;
                      const gapStr = gap != null ? ` (갭 ${gap}억)` : '';
                      return [`${(value as number)?.toFixed?.(2) ?? '-'}억${gapStr}`, `${cname}전세 평균가`];
                    }
                    return [value, name];
                  }}
                />
                {/* 매매 거래량 bar */}
                {entries.map(e => (
                  <Bar
                    key={`bar-trade-${e.complexId}`}
                    yAxisId="left"
                    dataKey={`c${e.complexId}_tc`}
                    fill={tradeBarColor(e)}
                    opacity={isSingle ? 0.7 : 0.5}
                    maxBarSize={isSingle ? 20 : 28}
                    radius={[3, 3, 0, 0]}
                    name={`c${e.complexId}_tc`}
                  />
                ))}
                {/* 전세 거래량 bar */}
                {entries.map(e => (
                  <Bar
                    key={`bar-jeonse-${e.complexId}`}
                    yAxisId="left"
                    dataKey={`c${e.complexId}_jc`}
                    fill={jeonseBarColor(e)}
                    opacity={isSingle ? 0.65 : 0.45}
                    maxBarSize={isSingle ? 20 : 28}
                    radius={[3, 3, 0, 0]}
                    name={`c${e.complexId}_jc`}
                  />
                ))}
                {/* 매매 평균가 line (실선) */}
                {entries.map(e => (
                  <Line
                    key={`line-trade-${e.complexId}`}
                    yAxisId="right"
                    dataKey={`c${e.complexId}_tp`}
                    stroke={tradeLineColor(e)}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                    name={`c${e.complexId}_tp`}
                  />
                ))}
                {/* 전세 평균가 line (점선) */}
                {entries.map(e => (
                  <Line
                    key={`line-jeonse-${e.complexId}`}
                    yAxisId="right"
                    dataKey={`c${e.complexId}_jp`}
                    stroke={jeonseLineColor(e)}
                    strokeWidth={2.5}
                    strokeDasharray="5 3"
                    dot={false}
                    connectNulls
                    name={`c${e.complexId}_jp`}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {!hasAnyData && entries.some(e => statuses.get(e.complexId)) && (
            <div style={{ textAlign: 'center', padding: '50px 20px' }}>
              <div style={{ fontSize: '14px', color: '#9aa0a6' }}>거래 데이터가 없습니다.</div>
            </div>
          )}

          {/* 드릴다운 */}
          {clickedLabel && (
            <div style={{
              marginTop: '16px',
              border: '1.5px solid #e0f4fb',
              borderRadius: '12px',
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px',
                background: '#f0f8fd',
                borderBottom: '1px solid #e0f4fb',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c' }}>
                    {clickedLabel} 개별 거래
                  </span>
                  {/* 매매/전세 드릴다운 선택 */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['trade', 'jeonse'] as const).map(t => (
                      <button key={t} onClick={() => setDrillType(t)} style={{
                        padding: '3px 12px', fontSize: '11px', fontWeight: drillType === t ? 700 : 400,
                        border: `1.5px solid ${drillType === t ? (t === 'trade' ? '#4BAAD4' : '#E06060') : '#dadce0'}`,
                        borderRadius: '16px',
                        background: drillType === t ? (t === 'trade' ? '#4BAAD4' : '#E06060') : '#fff',
                        color: drillType === t ? '#fff' : '#5f6368',
                        cursor: 'pointer',
                      }}>{t === 'trade' ? '매매' : '전세'} {drillDownItems.length > 0 ? '' : ''}</button>
                    ))}
                  </div>
                  <span style={{ fontSize: '12px', color: '#9aa0a6' }}>({drillDownItems.length}건)</span>
                </div>
                <button
                  onClick={() => setClickedLabel(null)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#9aa0a6', lineHeight: 1 }}
                >×</button>
              </div>

              {drillDownItems.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9aa0a6', fontSize: '13px' }}>
                  거래 데이터가 없습니다. (이전 수집 데이터는 포함되지 않을 수 있습니다)
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        {!isSingle && <th style={thStyle}>단지</th>}
                        <th style={thStyle}>거래일</th>
                        <th style={thStyle}>평형(㎡)</th>
                        <th style={thStyle}>층</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>{drillType === 'jeonse' ? '보증금' : '실거래가'}</th>
                        {drillType === 'trade' && <th style={thStyle}>구분</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {drillDownItems.map((it, idx) => {
                        const entry = entries.find(e => e.complexId === it.complexId);
                        const dateStr = it.date
                          ? `${it.date.slice(0, 4)}.${it.date.slice(4, 6)}.${it.date.slice(6, 8)}`
                          : '-';
                        const priceStr = it.price != null
                          ? `${(it.price / 10000).toFixed(2).replace(/\.?0+$/, '')}억`
                          : '-';
                        return (
                          <tr key={idx} style={{
                            borderBottom: '1px solid #f8f9fa',
                            background: idx % 2 === 0 ? '#fff' : '#fafafa',
                          }}>
                            {!isSingle && (
                              <td style={tdStyle}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry?.color, display: 'inline-block', flexShrink: 0 }} />
                                  <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry?.complexName}</span>
                                </span>
                              </td>
                            )}
                            <td style={tdStyle}>{dateStr}</td>
                            <td style={{ ...tdStyle, color: '#4BAAD4', fontWeight: 600 }}>
                              {it.area ? `${parseFloat(it.area).toFixed(1)}` : '-'}
                            </td>
                            <td style={tdStyle}>{it.floor ? `${it.floor}층` : '-'}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#1a1a2e' }}>{priceStr}</td>
                            {drillType === 'trade' && (
                              <td style={tdStyle}>
                                {it.isDirect
                                  ? <span style={{ color: '#E06060', fontWeight: 600 }}>직거래</span>
                                  : <span style={{ color: '#9aa0a6' }}>중개</span>}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 범례 + 요약 */}
          {entries.some(e => statuses.get(e.complexId)) && (
            <div style={{
              marginTop: '18px', padding: '14px 20px',
              background: '#f8f9fa', borderRadius: '12px',
            }}>
              {entries.filter(e => statuses.get(e.complexId)).map(e => {
                const agg = allAggs.get(e.complexId);
                const totalTrade = Array.from(agg?.values() || []).reduce((s, v) => s + v.tradeCount, 0);
                const totalJeonse = Array.from(agg?.values() || []).reduce((s, v) => s + v.jeonseCount, 0);
                const tradePrices = Array.from(agg?.values() || [])
                  .map(v => v.tradeAvg != null ? v.tradeAvg / 10000 : null)
                  .filter((p): p is number => p != null);
                const jeonsePrices = Array.from(agg?.values() || [])
                  .map(v => v.jeonseAvg != null ? v.jeonseAvg / 10000 : null)
                  .filter((p): p is number => p != null);
                const selectedArea = getArea(e.complexId);
                const areaLabel = selectedArea !== '전체' ? ` · ${parseFloat(selectedArea).toFixed(0)}㎡` : '';

                // 최신 시점 갭 계산 — 마지막 라벨 기준
                const lastLabelAgg = agg?.get(labels[labels.length - 1]);
                const gap = lastLabelAgg?.tradeAvg != null && lastLabelAgg?.jeonseAvg != null
                  ? ((lastLabelAgg.tradeAvg - lastLabelAgg.jeonseAvg) / 10000).toFixed(2)
                  : null;

                return (
                  <div key={e.complexId} style={{ marginBottom: entries.filter(ee => statuses.get(ee.complexId)).length > 1 ? '12px' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      {!isSingle && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: e.color }} />}
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#344054' }}>
                        {e.complexName}{areaLabel}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', paddingLeft: isSingle ? 0 : '18px' }}>
                      {/* 매매 요약 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: tradeBarColor(e), opacity: 0.7 }} />
                          <div style={{ width: '20px', height: '3px', background: tradeLineColor(e), borderRadius: '2px' }} />
                        </div>
                        <span style={{ fontSize: '12px', color: '#344054' }}>
                          매매 <b>{totalTrade.toLocaleString()}건</b>
                          {tradePrices.length > 0 && (
                            <span style={{ color: '#9aa0a6' }}>
                              {' '}· {Math.min(...tradePrices).toFixed(1)}~{Math.max(...tradePrices).toFixed(1)}억
                            </span>
                          )}
                        </span>
                      </div>
                      {/* 전세 요약 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: jeonseBarColor(e), opacity: 0.7 }} />
                          <div style={{ width: '20px', height: '0px', borderTop: `2px dashed ${jeonseLineColor(e)}`, borderRadius: '2px' }} />
                        </div>
                        <span style={{ fontSize: '12px', color: '#344054' }}>
                          전세 {totalJeonse > 0 ? <b>{totalJeonse.toLocaleString()}건</b> : <span style={{ color: '#9aa0a6' }}>0건</span>}
                          {jeonsePrices.length > 0 && (
                            <span style={{ color: '#9aa0a6' }}>
                              {' '}· {Math.min(...jeonsePrices).toFixed(1)}~{Math.max(...jeonsePrices).toFixed(1)}억
                            </span>
                          )}
                        </span>
                      </div>
                      {/* 갭 */}
                      {gap != null && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '2px 10px', background: '#fff3cd', borderRadius: '12px',
                          border: '1px solid #ffc107',
                        }}>
                          <span style={{ fontSize: '11px', color: '#856404', fontWeight: 700 }}>
                            갭 {gap}억
                          </span>
                          <span style={{ fontSize: '10px', color: '#9aa0a6' }}>
                            ({labels[labels.length - 1]} 기준)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ fontSize: '10px', color: '#bdbdbd', textAlign: 'center', margin: '12px 0 0' }}>
            국토교통부 실거래가 공개시스템 기준 · 해제 거래 제외 · 막대 클릭 시 개별 거래 조회
          </p>

          {/* ── 공급 현황 섹션 (단일 단지 + region 있을 때만) ── */}
          {isSingle && entries[0].region && (() => {
            const province = toProvinceKey(entries[0].region);
            const gu = toGuName(entries[0].region);
            if (!province) return null;

            const provinceYears = supplyData?.data[province] ?? {};
            const barData = Object.entries(provinceYears)
              .map(([yr, d]) => ({ year: parseInt(yr, 10), ...(d as ProvinceSupplyYear) }))
              .sort((a, b) => a.year - b.year)
              .filter(d => d.year >= 2020); // 2020년 이후만 표시

            const demandLine = barData[0]?.demandLine ?? 0;
            const currentYear = new Date().getFullYear();

            // 연도별 그룹핑
            const moveInByYear: Record<number, MoveInItem[]> = {};
            for (const item of moveInItems) {
              const yr = item.moveinYear ?? 0;
              if (!moveInByYear[yr]) moveInByYear[yr] = [];
              moveInByYear[yr].push(item);
            }

            return (
              <div style={{ marginTop: '20px', borderTop: '1.5px solid #e0f4fb', paddingTop: '18px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: '0 0 14px' }}>
                  📊 {province} 아파트 공급 현황
                </h3>

                {supplyLoading && (
                  <div style={{ textAlign: 'center', color: '#9aa0a6', fontSize: '12px', padding: '16px 0' }}>
                    공급 데이터 조회 중...
                  </div>
                )}

                {!supplyLoading && barData.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#bdbdbd', fontSize: '12px', padding: '12px 0' }}>
                    공급 데이터 없음 — "공급 수집" 버튼으로 먼저 수집해주세요
                  </div>
                )}

                {!supplyLoading && barData.length > 0 && (
                  <>
                    {/* 범례 */}
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px', alignItems: 'center' }}>
                      {Object.entries(SUPPLY_COLORS).map(([label, clr]) => (
                        <span key={label} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '3px', background: clr.bg, color: clr.color, fontWeight: 700 }}>
                          {label}
                        </span>
                      ))}
                      {demandLine > 0 && (
                        <span style={{ fontSize: '10px', color: '#dc2626', marginLeft: '4px' }}>
                          — 적정수요 {(demandLine / 1000).toFixed(0)}천세대/년
                        </span>
                      )}
                    </div>

                    {/* 바 차트 */}
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={barData} margin={{ top: 4, right: 20, left: 4, bottom: 0 }}>
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
                          contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                        />
                        {demandLine > 0 && (
                          <ReferenceLine
                            y={demandLine}
                            stroke="#dc2626"
                            strokeDasharray="6 3"
                            label={{ value: '적정수요', position: 'insideTopRight', fontSize: 9, fill: '#dc2626' }}
                          />
                        )}
                        <Bar dataKey="supplyCount" maxBarSize={28}>
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

                    {/* 근접 연도 수치 테이블 */}
                    <div style={{ marginTop: '8px', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ background: '#f5f5f5' }}>
                            <th style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #ddd', color: '#5f6368' }}>연도</th>
                            <th style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #ddd', color: '#5f6368' }}>공급(세대)</th>
                            <th style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #ddd', color: '#5f6368' }}>적정수요비</th>
                            <th style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #ddd', color: '#5f6368' }}>상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {barData.filter(d => d.year >= currentYear - 1 && d.year <= currentYear + 3).map((d, i) => {
                            const clr = SUPPLY_COLORS[d.supplyStatus] ?? { bg: '#f0f0f0', color: '#666' };
                            const isCur = d.year === currentYear;
                            return (
                              <tr key={d.year} style={{ background: isCur ? '#fffbeb' : i % 2 === 0 ? '#fff' : '#f9f9f9', fontWeight: isCur ? 700 : 400 }}>
                                <td style={{ padding: '3px 8px', textAlign: 'center' }}>{d.year}{isCur ? ' ★' : ''}</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right' }}>{d.supplyCount.toLocaleString()}</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right' }}>{d.supplyRatio}%</td>
                                <td style={{ padding: '3px 8px', textAlign: 'center' }}>
                                  <span style={{ padding: '1px 6px', borderRadius: '3px', background: clr.bg, color: clr.color, fontWeight: 700 }}>
                                    {d.supplyStatus}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* 구 입주 예정 단지 목록 */}
                {gu && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid #f0f0f0', paddingTop: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '8px' }}>
                      🏗 {gu} 입주 예정 단지
                      {supplyLoading && <span style={{ fontSize: '11px', fontWeight: 400, color: '#9aa0a6', marginLeft: '6px' }}>조회 중...</span>}
                      {!supplyLoading && <span style={{ fontSize: '11px', fontWeight: 400, color: '#9aa0a6', marginLeft: '6px' }}>({moveInItems.length}건)</span>}
                    </div>
                    {!supplyLoading && moveInItems.length === 0 && (
                      <div style={{ fontSize: '12px', color: '#bdbdbd', textAlign: 'center', padding: '8px 0' }}>
                        입주 예정 단지 없음
                      </div>
                    )}
                    {moveInItems.length > 0 && (
                      <div>
                        {Object.entries(moveInByYear)
                          .sort(([a], [b]) => parseInt(a) - parseInt(b))
                          .map(([yr, items]) => (
                            <div key={yr} style={{ marginBottom: '8px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', padding: '3px 10px', borderRadius: '5px', marginBottom: '4px' }}>
                                {yr}년 · {items.reduce((s, i) => s + (i.household || 0), 0).toLocaleString()}세대
                              </div>
                              {items.map(item => (
                                <div key={item.seq} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '3px 10px', fontSize: '12px', borderBottom: '1px solid #f3f4f6' }}>
                                  <span style={{ color: '#6b7280', minWidth: '28px', fontSize: '11px' }}>{item.moveinMonth}월</span>
                                  <span style={{ flex: 1, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</span>
                                  <span style={{ color: '#374151', whiteSpace: 'nowrap', fontSize: '11px' }}>{(item.household || 0).toLocaleString()}세대</span>
                                </div>
                              ))}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ fontSize: '10px', color: '#bdbdbd', textAlign: 'right', marginTop: '8px' }}>
                  출처: 아실(asil.kr)
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
  color: '#5f6368', fontSize: '11px', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '7px 12px', color: '#344054', whiteSpace: 'nowrap',
};

export default TradeHistoryModal;
