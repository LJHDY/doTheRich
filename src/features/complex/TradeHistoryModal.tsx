import React, { useState, useEffect, useCallback } from 'react';
import {
  getTradeHistory, getTradeHistoryStatus, collectTradeHistory, TradeHistoryMonth,
} from '../../services/api';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

export interface TradeComplexEntry {
  complexId: number;
  complexName: string;
  color: string; // 비교 시 단지별 고유 색상
}

interface Props {
  entries: TradeComplexEntry[];
  onClose: () => void;
}

const TradeHistoryModal: React.FC<Props> = ({ entries, onClose }) => {
  const [histories, setHistories] = useState<Map<number, TradeHistoryMonth[]>>(new Map());
  const [statuses, setStatuses] = useState<Map<number, boolean>>(new Map());
  const [collecting, setCollecting] = useState<Set<number>>(new Set());
  const [granularity, setGranularity] = useState<'month' | 'quarter' | 'year'>('year');
  const [selectedYear, setSelectedYear] = useState('');
  const [areaFilter, setAreaFilter] = useState('전체');

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

  // 개별 단지 수집 트리거 + 폴링
  const handleCollect = useCallback(async (complexId: number) => {
    setCollecting(prev => new Set(prev).add(complexId));
    try { await collectTradeHistory(complexId); } catch { /* ignore */ }
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const s = await getTradeHistoryStatus(complexId);
        if (s.collected) {
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

  // 수집된 단지의 평형 목록 합집합
  const allAreas = Array.from(new Set(
    entries.flatMap(({ complexId }) =>
      (histories.get(complexId) || []).flatMap(m => Object.keys(m.areaBreakdown))
    )
  )).sort((a, b) => (parseFloat(a) || 999) - (parseFloat(b) || 999));

  const effectiveArea = areaFilter !== '전체' && allAreas.includes(areaFilter) ? areaFilter : '전체';

  // 수집된 단지의 연도 합집합
  const availableYears = Array.from(new Set(
    entries.flatMap(({ complexId }) =>
      (histories.get(complexId) || []).map(m => m.yearMonth.slice(0, 4))
    )
  )).sort();
  const latestYear = availableYears[availableYears.length - 1] ?? '';
  const showAll = selectedYear === 'ALL';
  const effectiveYear = showAll ? latestYear
    : (selectedYear && availableYears.includes(selectedYear)) ? selectedYear : latestYear;

  // 단지별 집계 맵 생성
  const getAgg = (complexId: number): Map<string, { count: number; avgPrice: number | null }> => {
    const hist = histories.get(complexId) || [];
    const acc = new Map<string, { count: number; prices: number[] }>();

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

      const bd = effectiveArea === '전체' ? null : m.areaBreakdown[effectiveArea];
      const cnt = effectiveArea === '전체' ? m.tradeCount : (bd?.count ?? 0);
      const p = effectiveArea === '전체' ? m.avgPrice : bd?.avg;
      const cur = acc.get(label) ?? { count: 0, prices: [] };
      cur.count += cnt;
      if (p != null) cur.prices.push(p);
      acc.set(label, cur);
    });

    return new Map(Array.from(acc.entries()).map(([k, v]) => [k, {
      count: v.count,
      avgPrice: v.prices.length ? v.prices.reduce((a, b) => a + b, 0) / v.prices.length : null,
    }]));
  };

  const allAggs = new Map(entries.map(e => [e.complexId, getAgg(e.complexId)]));

  // 레이블 합집합 (정렬)
  let labels = Array.from(new Set(
    Array.from(allAggs.values()).flatMap(agg => Array.from(agg.keys()))
  )).sort();

  // 월별 단일 연도: 없는 달도 0으로 채움
  if (granularity === 'month' && !showAll && labels.length === 0 && effectiveYear) {
    labels = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
  } else if (granularity === 'month' && !showAll) {
    labels = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
  }

  const chartData = labels.map(label => {
    const row: Record<string, string | number | null> = { label };
    entries.forEach(({ complexId }) => {
      const val = allAggs.get(complexId)?.get(label);
      row[`c${complexId}_count`] = val?.count ?? 0;
      row[`c${complexId}_price`] = val?.avgPrice != null
        ? parseFloat((val.avgPrice / 10000).toFixed(2)) : null;
    });
    return row;
  });

  // 가격 Y축 범위
  const allPrices = entries.flatMap(({ complexId }) =>
    Array.from(allAggs.get(complexId)?.values() || [])
      .map(v => v.avgPrice != null ? v.avgPrice / 10000 : null)
      .filter((p): p is number => p != null)
  );
  const minP = allPrices.length ? Math.floor(Math.min(...allPrices) * 0.95 * 10) / 10 : 0;
  const maxP = allPrices.length ? Math.ceil(Math.max(...allPrices) * 1.05 * 10) / 10 : 10;

  const hasAnyData = chartData.some(row =>
    entries.some(({ complexId }) => (row[`c${complexId}_count`] as number) > 0)
  );

  // 단일 단지: 거래량 bar = 하늘색, 가격 line = 빨강 / 비교: 단지별 color 통일
  const barColor = (e: TradeComplexEntry) => isSingle ? '#89CFF0' : e.color;
  const lineColor = (e: TradeComplexEntry) => isSingle ? '#E06060' : e.color;

  const xInterval = showAll && granularity === 'month' ? 11
    : granularity === 'quarter' && labels.length > 20 ? 3 : 0;
  const xFormatter = showAll && granularity === 'month'
    ? (v: string) => v.slice(0, 4) : undefined;

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
          width: '100%', maxWidth: '920px',
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

            {/* 월별 모드 — 연도 네비게이터 */}
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

          {/* 평형 탭 */}
          {allAreas.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
              {allAreas.length > 1 && (
                <button onClick={() => setAreaFilter('전체')} style={{
                  padding: '3px 11px', fontSize: '11px',
                  border: `1px solid ${effectiveArea === '전체' ? '#344054' : '#e0e0e0'}`,
                  borderRadius: '16px',
                  background: effectiveArea === '전체' ? '#344054' : '#f8f9fa',
                  color: effectiveArea === '전체' ? '#fff' : '#5f6368', cursor: 'pointer',
                }}>전체</button>
              )}
              {allAreas.map(a => (
                <button key={a} onClick={() => setAreaFilter(a)} style={{
                  padding: '3px 11px', fontSize: '11px',
                  border: `1px solid ${effectiveArea === a ? '#4BAAD4' : '#e0e0e0'}`,
                  borderRadius: '16px',
                  background: effectiveArea === a ? '#e0f4fb' : '#f8f9fa',
                  color: effectiveArea === a ? '#1a73e8' : '#5f6368', cursor: 'pointer',
                }}>{parseFloat(a).toFixed(0)}㎡</button>
              ))}
            </div>
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

          {/* 차트 */}
          {hasAnyData && (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
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
                  formatter={(value: number, name: string) => {
                    const [prefix, type] = (name as string).split('_');
                    const cid = parseInt(prefix.slice(1));
                    const entry = entries.find(e => e.complexId === cid);
                    const label = isSingle ? '' : `${entry?.complexName ?? ''} `;
                    if (type === 'count') return [`${value}건`, `${label}거래량`];
                    return [`${value?.toFixed ? value.toFixed(2) : '-'}억`, `${label}평균가`];
                  }}
                />
                {/* 거래량 — 단일: 단색 bar, 다중: 스택 bar */}
                {entries.map(e => (
                  <Bar
                    key={`bar-${e.complexId}`}
                    yAxisId="left"
                    dataKey={`c${e.complexId}_count`}
                    fill={barColor(e)}
                    opacity={isSingle ? 0.7 : 0.45}
                    stackId={isSingle ? undefined : 'vol'}
                    maxBarSize={isSingle ? 28 : 36}
                    radius={[3, 3, 0, 0]}
                    name={`c${e.complexId}_count`}
                  />
                ))}
                {/* 평균가 라인 */}
                {entries.map(e => (
                  <Line
                    key={`line-${e.complexId}`}
                    yAxisId="right"
                    dataKey={`c${e.complexId}_price`}
                    stroke={lineColor(e)}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                    name={`c${e.complexId}_price`}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {!hasAnyData && entries.some(e => statuses.get(e.complexId)) && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9aa0a6', fontSize: '14px' }}>
              거래 데이터가 없습니다.
            </div>
          )}

          {/* 범례 + 요약 */}
          {entries.some(e => statuses.get(e.complexId)) && (
            <div style={{
              display: 'flex', gap: '20px', flexWrap: 'wrap',
              marginTop: '18px', justifyContent: 'center',
              padding: '14px 20px', background: '#f8f9fa', borderRadius: '12px',
            }}>
              {entries.filter(e => statuses.get(e.complexId)).map(e => {
                const agg = allAggs.get(e.complexId);
                const totalCount = Array.from(agg?.values() || []).reduce((s, v) => s + v.count, 0);
                const prices = Array.from(agg?.values() || [])
                  .map(v => v.avgPrice != null ? v.avgPrice / 10000 : null)
                  .filter((p): p is number => p != null);
                return (
                  <div key={e.complexId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* 색상 범례 — bar + line 표시 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: barColor(e), opacity: isSingle ? 0.7 : 0.5 }} />
                        <div style={{ width: '22px', height: '3px', borderRadius: '2px', background: lineColor(e) }} />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#344054' }}>{e.complexName}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#9aa0a6' }}>
                      총 <b style={{ color: '#344054' }}>{totalCount.toLocaleString()}건</b>
                      {prices.length > 0 && (
                        <span> · {Math.min(...prices).toFixed(1)}~{Math.max(...prices).toFixed(1)}억</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 출처 */}
          <p style={{ fontSize: '10px', color: '#bdbdbd', textAlign: 'center', margin: '12px 0 0' }}>
            국토교통부 실거래가 공개시스템 기준 · 해제 거래 제외
          </p>
        </div>
      </div>
    </div>
  );
};

export default TradeHistoryModal;
