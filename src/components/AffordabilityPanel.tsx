import React, { useState, useMemo, useEffect } from 'react';
import { ApartmentComplex } from '../types';
import { getPriceHistories } from '../services/api';

interface Props {
  complexes: ApartmentComplex[];
  onClose: () => void;
  isMobile?: boolean; // 모바일 풀스크린 오버레이 모드
}

const HEADER_COLOR = '#0b8043';

// 원리금균등상환 기준 DSR 40%로 빌릴 수 있는 최대 대출액 (원 단위)
function calcDsrMaxLoan(incomeManwon: number, ratePercent: number, loanYears: number): number {
  if (incomeManwon <= 0 || ratePercent <= 0 || loanYears <= 0) return 0;
  const incomeWon = incomeManwon * 10_000;
  const r = ratePercent / 100 / 12;
  const n = loanYears * 12;
  const factor = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return (incomeWon * 0.4) / (factor * 12);
}

// 가격 기준 LTV 70% + 한도 규제 적용 최대 대출액
// 15억 이하 → 최대 6억 / 15~25억 → 최대 4억 / 25억 초과 → 최대 2억
function calcLtvMax(priceWon: number): number {
  const raw = priceWon * 0.7;
  if (priceWon <= 1_500_000_000) return Math.min(raw, 600_000_000);
  if (priceWon <= 2_500_000_000) return Math.min(raw, 400_000_000);
  return Math.min(raw, 200_000_000);
}

// 원 단위 → "X억 Y천만" 형태 문자열
function fmt(won: number): string {
  if (won <= 0) return '0원';
  const uk = Math.floor(won / 100_000_000);
  const cheon = Math.floor((won % 100_000_000) / 10_000_000);
  if (uk > 0 && cheon > 0) return `${uk}억 ${cheon}천만`;
  if (uk > 0) return `${uk}억`;
  return `${Math.round(won / 10_000).toLocaleString()}만`;
}

interface Analysis {
  priceWon: number;
  ltv: number;
  dsrLoan: number;
  effLoan: number;
  budget: number;
  canBuy: boolean;
  shortage: number;
}

// 분석 결과 상세 블록 (단지 선택 시 표시)
const AnalysisBlock: React.FC<{ label: string; a: Analysis }> = ({ label, a }) => (
  <div style={{
    border: `1px solid ${a.canBuy ? '#a8d5b5' : '#f5c6c6'}`,
    borderRadius: '8px', padding: '10px 12px',
    backgroundColor: a.canBuy ? '#f6fdf8' : '#fff8f8',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>{fmt(a.priceWon)}</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
      {[
        { label: 'LTV 70% 한도', value: fmt(a.ltv) },
        { label: 'DSR 40% 한도', value: fmt(a.dsrLoan) },
        { label: '적용 대출 (작은 값)', value: fmt(a.effLoan), highlight: true },
        { label: '현금 + 적용 대출', value: fmt(a.budget) },
      ].map(row => (
        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9e9e9e' }}>{row.label}</span>
          <span style={{ fontWeight: row.highlight ? 700 : 400, color: row.highlight ? '#1a73e8' : '#202124' }}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
    <div style={{ height: '1px', backgroundColor: a.canBuy ? '#a8d5b5' : '#f5c6c6', margin: '7px 0' }} />
    <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 700 }}>
      {a.canBuy
        ? <span style={{ color: '#0b8043' }}>✓ 구매 가능</span>
        : <span style={{ color: '#c5221f' }}>× {fmt(a.shortage)} 부족</span>}
    </div>
  </div>
);

// ─── 메인 패널 ──────────────────────────────────────────────────────────────
const AffordabilityPanel: React.FC<Props> = ({ complexes, onClose, isMobile }) => {
  const [income, setIncome] = useState(() => localStorage.getItem('afford_income') || '');
  const [cash, setCash] = useState(() => localStorage.getItem('afford_cash') || '');
  const [rate, setRate] = useState(() => localStorage.getItem('afford_rate') || '3.5');
  const [loanYears, setLoanYears] = useState(() => parseInt(localStorage.getItem('afford_years') || '30'));

  const [filter, setFilter] = useState<'all' | 'ok' | 'ng'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 패널 마운트 시 전체 단지 호가를 일괄 로드 — Map<complexId, askingPrice | null>
  const [askingPriceMap, setAskingPriceMap] = useState<Map<number, number | null>>(new Map());
  const [loadingHistories, setLoadingHistories] = useState(false);

  useEffect(() => { localStorage.setItem('afford_income', income); }, [income]);
  useEffect(() => { localStorage.setItem('afford_cash', cash); }, [cash]);
  useEffect(() => { localStorage.setItem('afford_rate', rate); }, [rate]);
  useEffect(() => { localStorage.setItem('afford_years', String(loanYears)); }, [loanYears]);

  // 패널이 열릴 때 모든 단지의 최근 시세 기록을 병렬 조회해 호가 추출
  useEffect(() => {
    if (complexes.length === 0) return;
    setLoadingHistories(true);
    Promise.all(
      complexes.map(c =>
        getPriceHistories(c.id)
          .then(histories => {
            const latest = [...histories].sort((a, b) => b.recordDate.localeCompare(a.recordDate))[0];
            return { id: c.id, askingPrice: latest?.items?.[0]?.askingPrice ?? null };
          })
          .catch(() => ({ id: c.id, askingPrice: null }))
      )
    ).then(results => {
      const map = new Map<number, number | null>();
      results.forEach(r => map.set(r.id, r.askingPrice));
      setAskingPriceMap(map);
    }).finally(() => setLoadingHistories(false));
  // complexes가 바뀌어도 마운트 시 1회만 로드 (개인용 앱 특성상 재조회 불필요)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const incomeManwon = parseFloat(income) || 0;
  const cashWon = (parseFloat(cash) || 0) * 100_000_000;
  const rateNum = parseFloat(rate) || 0;
  const hasInputs = incomeManwon > 0 && cashWon >= 0 && rateNum > 0;

  const dsrMax = useMemo(
    () => calcDsrMaxLoan(incomeManwon, rateNum, loanYears),
    [incomeManwon, rateNum, loanYears]
  );

  // 단일 가격에 대한 구매 가능 여부 분석
  const analyze = (priceWon: number): Analysis => {
    const ltv = calcLtvMax(priceWon);
    const effLoan = Math.min(ltv, dsrMax);
    const budget = cashWon + effLoan;
    const canBuy = budget >= priceWon;
    return { priceWon, ltv, dsrLoan: dsrMax, effLoan, budget, canBuy, shortage: canBuy ? 0 : priceWon - budget };
  };

  // 매매가 기준 구매 가능 여부 맵
  const affordMap = useMemo(() => {
    const map = new Map<number, Analysis>();
    complexes.forEach(c => { if (c.price) map.set(c.id, analyze(c.price)); });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complexes, cashWon, dsrMax]);

  // 호가 기준 구매 가능 여부 맵 (호가 정보 있는 단지만)
  const affordMapAsking = useMemo(() => {
    const map = new Map<number, Analysis>();
    askingPriceMap.forEach((price, id) => {
      if (price) map.set(id, analyze(price));
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askingPriceMap, cashWon, dsrMax]);

  // 필터 + 정렬: 매매가 가능 먼저, 불가는 부족액 오름차순
  const displayed = useMemo(() => {
    let list = complexes.filter(c => c.price);
    if (filter === 'ok') list = list.filter(c => affordMap.get(c.id)?.canBuy);
    if (filter === 'ng') list = list.filter(c => !affordMap.get(c.id)?.canBuy);
    return [...list].sort((a, b) => {
      const ar = affordMap.get(a.id);
      const br = affordMap.get(b.id);
      if (!ar || !br) return 0;
      if (ar.canBuy !== br.canBuy) return ar.canBuy ? -1 : 1;
      return ar.shortage - br.shortage;
    });
  }, [complexes, affordMap, filter]);

  const okCountPrice = useMemo(
    () => Array.from(affordMap.values()).filter(v => v.canBuy).length,
    [affordMap]
  );
  const okCountAsking = useMemo(
    () => Array.from(affordMapAsking.values()).filter(v => v.canBuy).length,
    [affordMapAsking]
  );

  const selectedComplex = complexes.find(c => c.id === selectedId) ?? null;
  const selectedAskingPrice = selectedId != null ? (askingPriceMap.get(selectedId) ?? null) : null;

  const inputStyle: React.CSSProperties = {
    border: '1px solid #dadce0', borderRadius: '6px',
    padding: '6px 8px', fontSize: '12px', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '11px', color: '#5f6368', marginBottom: '3px', display: 'block',
  };

  // 리스트 행 우측에 표시할 소형 배지 (매매가/호가 각 1줄씩)
  const SmallBadge: React.FC<{ prefix: string; a: Analysis | undefined; noData?: boolean }> = ({ prefix, a, noData }) => {
    if (noData || !a) {
      return (
        <span style={{ fontSize: '10px', color: '#bdbdbd', whiteSpace: 'nowrap' }}>
          {prefix} —
        </span>
      );
    }
    return a.canBuy ? (
      <span style={{
        fontSize: '10px', fontWeight: 700, color: '#0b8043',
        backgroundColor: '#e6f4ea', borderRadius: '6px', padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}>{prefix} ✓</span>
    ) : (
      <span style={{
        fontSize: '10px', fontWeight: 700, color: '#c5221f',
        backgroundColor: '#fce8e6', borderRadius: '6px', padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}>{prefix} △{fmt(a.shortage)}</span>
    );
  };

  return (
    <div style={{
      width: isMobile ? '100%' : '380px', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#fff', borderLeft: isMobile ? 'none' : '1px solid #e8eaed', flexShrink: 0,
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '0 16px', height: '56px', backgroundColor: HEADER_COLOR, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: '15px', fontWeight: 700 }}>구매 가능 분석</span>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
          width: '28px', height: '28px', cursor: 'pointer', color: '#fff',
          fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
      </div>

      {/* 입력 섹션 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <div>
            <label style={labelStyle}>연소득 (만원)</label>
            <input type="number" placeholder="예: 5000" value={income}
              onChange={e => setIncome(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>현금 보유액 (억)</label>
            <input type="number" placeholder="예: 3" value={cash}
              onChange={e => setCash(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>연 금리 (%)</label>
            <input type="number" step="0.1" placeholder="예: 3.5" value={rate}
              onChange={e => setRate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>대출 기간 (년)</label>
            <input type="number" min={1} max={50} placeholder="30" value={loanYears}
              onChange={e => setLoanYears(parseInt(e.target.value) || 30)} style={inputStyle} />
          </div>
        </div>

        {/* 계산 결과 요약 */}
        {hasInputs ? (
          <div style={{
            backgroundColor: '#f1faf4', border: '1px solid #a8d5b5',
            borderRadius: '8px', padding: '10px 12px', fontSize: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ color: '#5f6368' }}>DSR 40% 최대 대출</span>
              <span style={{ fontWeight: 700, color: '#0b8043' }}>{fmt(dsrMax)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ color: '#5f6368' }}>현금 보유액</span>
              <span style={{ fontWeight: 700, color: '#202124' }}>{fmt(cashWon)}</span>
            </div>
            <div style={{ height: '1px', backgroundColor: '#a8d5b5', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ color: '#5f6368' }}>매매가 기준 가능</span>
              <span style={{ fontWeight: 700, color: '#0b8043' }}>{okCountPrice} / {affordMap.size}개</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#5f6368' }}>호가 기준 가능</span>
              <span style={{ fontWeight: 700, color: '#0b8043' }}>
                {loadingHistories ? '—' : `${okCountAsking} / ${affordMapAsking.size}개`}
              </span>
            </div>
            <div style={{ fontSize: '10px', color: '#9e9e9e', marginTop: '5px' }}>
              * LTV 한도: 15억↓ 6억 / 25억↓ 4억 / 초과 2억
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f8f9fa', borderRadius: '8px',
            padding: '10px 12px', fontSize: '11px', color: '#9e9e9e', textAlign: 'center',
          }}>
            연소득·현금·금리를 입력하면 구매 가능 여부를 계산합니다.
          </div>
        )}
      </div>

      {/* 선택된 단지 상세 분석 */}
      {selectedId && selectedComplex && (
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid #e8eaed',
          backgroundColor: '#fafffe', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0b8043' }}>
              {selectedComplex.complexName}
            </span>
            <button onClick={() => setSelectedId(null)} style={{
              border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '16px', color: '#9e9e9e', padding: 0, lineHeight: 1,
            }}>×</button>
          </div>

          {!hasInputs ? (
            <div style={{ fontSize: '11px', color: '#9e9e9e', textAlign: 'center', padding: '8px 0' }}>
              입력값을 먼저 입력해주세요.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedComplex.price > 0 && (
                <AnalysisBlock label="매매가 기준" a={analyze(selectedComplex.price)} />
              )}
              {selectedAskingPrice ? (
                <AnalysisBlock label="호가 기준" a={analyze(selectedAskingPrice)} />
              ) : (
                <div style={{
                  fontSize: '11px', color: '#9e9e9e', textAlign: 'center',
                  padding: '8px', border: '1px dashed #e0e0e0', borderRadius: '6px',
                }}>
                  {loadingHistories ? '호가 로딩 중...' : '호가 정보 없음 (시세 기록에 호가 입력 필요)'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 필터 탭 (매매가 기준) */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>
        {(['all', 'ok', 'ng'] as const).map(f => {
          const label = f === 'all' ? '전체' : f === 'ok' ? '가능(매매가)' : '불가(매매가)';
          const active = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              flex: 1, padding: '9px 0', fontSize: '11px',
              fontWeight: active ? 700 : 400, border: 'none',
              borderBottom: active ? `2px solid ${HEADER_COLOR}` : '2px solid transparent',
              backgroundColor: '#fff', cursor: 'pointer',
              color: active ? HEADER_COLOR : '#9e9e9e',
            }}>{label}</button>
          );
        })}
      </div>

      {/* 단지 목록 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loadingHistories && (
          <div style={{ padding: '10px 16px', fontSize: '11px', color: '#9e9e9e', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
            호가 정보 로딩 중...
          </div>
        )}
        {displayed.length === 0 && !loadingHistories && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
            해당하는 단지가 없습니다.
          </div>
        )}
        {displayed.map(c => {
          const affPrice = affordMap.get(c.id);
          const affAsking = affordMapAsking.get(c.id);
          const hasAskingData = askingPriceMap.has(c.id) && askingPriceMap.get(c.id) !== null;
          const isSelected = c.id === selectedId;

          return (
            <div
              key={c.id}
              onClick={() => setSelectedId(isSelected ? null : c.id)}
              style={{
                padding: '10px 16px', borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                backgroundColor: isSelected ? '#f1faf4' : '#fff',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px', fontWeight: 600, color: '#202124',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {c.complexName}
                </div>
                <div style={{ fontSize: '11px', color: '#9e9e9e', marginTop: '2px' }}>
                  {c.price ? fmt(c.price) : '-'} | {c.region || ''}
                </div>
              </div>

              {/* 매매가·호가 배지 — 입력값 있을 때만 */}
              {hasInputs && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end', flexShrink: 0 }}>
                  <SmallBadge prefix="매매가" a={affPrice} />
                  <SmallBadge prefix="호가" a={affAsking} noData={!hasAskingData} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AffordabilityPanel;
