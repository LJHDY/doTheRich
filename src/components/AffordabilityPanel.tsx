import React, { useState, useMemo, useEffect } from 'react';
import { ApartmentComplex, PriceHistory, formatPrice } from '../types';
import { getPriceHistories } from '../services/api';

interface Props {
  complexes: ApartmentComplex[];
  onClose: () => void;
}

const HEADER_COLOR = '#0b8043';

// 원리금균등상환 기준 DSR 40%로 빌릴 수 있는 최대 대출액 (원 단위)
function calcDsrMaxLoan(incomeManwon: number, ratePercent: number, loanYears: number): number {
  if (incomeManwon <= 0 || ratePercent <= 0 || loanYears <= 0) return 0;
  const incomeWon = incomeManwon * 10_000;
  const r = ratePercent / 100 / 12;  // 월 이자율
  const n = loanYears * 12;           // 총 납부 개월 수
  // 월상환계수 = r(1+r)^n / ((1+r)^n - 1)
  const factor = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  // DSR 40% = 연 상환액 / 연 소득 ≤ 0.4 → 최대 연 상환액 = 소득 × 0.4
  return (incomeWon * 0.4) / (factor * 12);
}

// 가격 기준 LTV 70% + 한도 규제 적용 최대 대출액 (원 단위)
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
  const man = Math.round(won / 10_000);
  return `${man.toLocaleString()}만`;
}

// 단일 가격에 대한 구매 가능 분석 결과
interface Analysis {
  priceWon: number;
  ltv: number;      // LTV 한도
  dsrLoan: number;  // DSR 한도
  effLoan: number;  // 적용 대출 (ltv와 dsr 중 작은 값)
  budget: number;   // 현금 + 적용 대출
  canBuy: boolean;
  shortage: number;
}

// ─── 분석 결과 블록 ─────────────────────────────────────────────────────────
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
      <ARow label="LTV 70% 한도" value={fmt(a.ltv)} />
      <ARow label="DSR 40% 한도" value={fmt(a.dsrLoan)} />
      <ARow label="적용 대출 (작은 값)" value={fmt(a.effLoan)} highlight />
      <ARow label="현금 + 적용 대출" value={fmt(a.budget)} />
    </div>
    <div style={{ height: '1px', backgroundColor: a.canBuy ? '#a8d5b5' : '#f5c6c6', margin: '7px 0' }} />
    <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 700 }}>
      {a.canBuy ? (
        <span style={{ color: '#0b8043' }}>✓ 구매 가능</span>
      ) : (
        <span style={{ color: '#c5221f' }}>× {fmt(a.shortage)} 부족</span>
      )}
    </div>
  </div>
);

const ARow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span style={{ color: '#9e9e9e' }}>{label}</span>
    <span style={{ fontWeight: highlight ? 700 : 400, color: highlight ? '#1a73e8' : '#202124' }}>{value}</span>
  </div>
);

// ─── 메인 패널 ──────────────────────────────────────────────────────────────
const AffordabilityPanel: React.FC<Props> = ({ complexes, onClose }) => {
  // 입력값은 localStorage에 유지 (패널을 닫았다 열어도 보존)
  const [income, setIncome] = useState(() => localStorage.getItem('afford_income') || '');
  const [cash, setCash] = useState(() => localStorage.getItem('afford_cash') || '');
  const [rate, setRate] = useState(() => localStorage.getItem('afford_rate') || '3.5');
  const [loanYears, setLoanYears] = useState(() => parseInt(localStorage.getItem('afford_years') || '30'));

  const [filter, setFilter] = useState<'all' | 'ok' | 'ng'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [histories, setHistories] = useState<PriceHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => { localStorage.setItem('afford_income', income); }, [income]);
  useEffect(() => { localStorage.setItem('afford_cash', cash); }, [cash]);
  useEffect(() => { localStorage.setItem('afford_rate', rate); }, [rate]);
  useEffect(() => { localStorage.setItem('afford_years', String(loanYears)); }, [loanYears]);

  const incomeManwon = parseFloat(income) || 0;
  const cashWon = (parseFloat(cash) || 0) * 100_000_000;
  const rateNum = parseFloat(rate) || 0;
  const hasInputs = incomeManwon > 0 && cashWon >= 0 && rateNum > 0;

  const dsrMax = useMemo(
    () => calcDsrMaxLoan(incomeManwon, rateNum, loanYears),
    [incomeManwon, rateNum, loanYears]
  );

  // 주어진 가격에 대한 구매 가능 여부 분석
  const analyze = (priceWon: number): Analysis => {
    const ltv = calcLtvMax(priceWon);
    const effLoan = Math.min(ltv, dsrMax);
    const budget = cashWon + effLoan;
    const canBuy = budget >= priceWon;
    return { priceWon, ltv, dsrLoan: dsrMax, effLoan, budget, canBuy, shortage: canBuy ? 0 : priceWon - budget };
  };

  // 단지별 구매 가능 여부 사전 계산
  const affordMap = useMemo(() => {
    const map = new Map<number, Analysis>();
    complexes.forEach(c => {
      if (c.price) map.set(c.id, analyze(c.price));
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complexes, cashWon, dsrMax]);

  // 필터 + 정렬: 가능 단지 먼저, 불가는 부족액 오름차순
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

  const okCount = useMemo(
    () => Array.from(affordMap.values()).filter(v => v.canBuy).length,
    [affordMap]
  );

  // 선택된 단지의 가격 이력 조회 (호가 분석용)
  useEffect(() => {
    if (!selectedId) { setHistories([]); return; }
    setLoadingHistory(true);
    getPriceHistories(selectedId)
      .then(data => setHistories([...data].sort((a, b) => b.recordDate.localeCompare(a.recordDate))))
      .catch(() => setHistories([]))
      .finally(() => setLoadingHistory(false));
  }, [selectedId]);

  const selectedComplex = complexes.find(c => c.id === selectedId) ?? null;
  const latestHistory = histories[0];
  // 최근 시세 기록의 첫 번째 평형 기준 호가
  const askingPrice = latestHistory?.items?.[0]?.askingPrice ?? null;

  const inputStyle: React.CSSProperties = {
    border: '1px solid #dadce0', borderRadius: '6px',
    padding: '6px 8px', fontSize: '12px', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '11px', color: '#5f6368', marginBottom: '3px', display: 'block',
  };

  return (
    <div style={{
      width: '380px', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#fff', borderLeft: '1px solid #e8eaed', flexShrink: 0,
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '0 16px', height: '56px', backgroundColor: HEADER_COLOR, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: '15px', fontWeight: 700 }}>구매 가능 분석</span>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
            width: '28px', height: '28px', cursor: 'pointer', color: '#fff',
            fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>

      {/* 입력 섹션 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <div>
            <label style={labelStyle}>연소득 (만원)</label>
            <input type="number" placeholder="예: 5000"
              value={income} onChange={e => setIncome(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>현금 보유액 (억)</label>
            <input type="number" placeholder="예: 3"
              value={cash} onChange={e => setCash(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>연 금리 (%)</label>
            <input type="number" step="0.1" placeholder="예: 3.5"
              value={rate} onChange={e => setRate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>대출 기간 (년)</label>
            <input type="number" min={1} max={50} placeholder="30"
              value={loanYears} onChange={e => setLoanYears(parseInt(e.target.value) || 30)} style={inputStyle} />
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#5f6368' }}>구매 가능 단지</span>
              <span style={{ fontWeight: 700, color: '#0b8043' }}>
                {okCount} / {affordMap.size}개
              </span>
            </div>
            <div style={{ fontSize: '10px', color: '#9e9e9e', marginTop: '5px' }}>
              * LTV 한도는 매물 가격에 따라 달라짐 (15억↓ 6억 / 25억↓ 4억 / 초과 2억)
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
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0b8043' }}>
              {selectedComplex.complexName}
            </span>
            <button
              onClick={() => setSelectedId(null)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#9e9e9e', padding: 0, lineHeight: 1 }}
            >×</button>
          </div>

          {!hasInputs ? (
            <div style={{ fontSize: '11px', color: '#9e9e9e', textAlign: 'center', padding: '8px 0' }}>
              입력값을 먼저 입력해주세요.
            </div>
          ) : loadingHistory ? (
            <div style={{ fontSize: '11px', color: '#9e9e9e', textAlign: 'center', padding: '8px 0' }}>불러오는 중...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedComplex.price > 0 && (
                <AnalysisBlock label="매매가 기준" a={analyze(selectedComplex.price)} />
              )}
              {askingPrice ? (
                <AnalysisBlock label="호가 기준" a={analyze(askingPrice)} />
              ) : (
                <div style={{
                  fontSize: '11px', color: '#9e9e9e', textAlign: 'center',
                  padding: '8px', border: '1px dashed #e0e0e0', borderRadius: '6px',
                }}>
                  호가 정보 없음 (시세 기록에 호가 입력 필요)
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 필터 탭 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>
        {(['all', 'ok', 'ng'] as const).map(f => {
          const label = f === 'all' ? '전체' : f === 'ok' ? '가능' : '불가능';
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flex: 1, padding: '9px 0', fontSize: '12px',
                fontWeight: active ? 700 : 400,
                border: 'none',
                borderBottom: active ? `2px solid ${HEADER_COLOR}` : '2px solid transparent',
                backgroundColor: '#fff', cursor: 'pointer',
                color: active ? HEADER_COLOR : '#9e9e9e',
              }}
            >{label}</button>
          );
        })}
      </div>

      {/* 단지 목록 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {displayed.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
            해당하는 단지가 없습니다.
          </div>
        )}
        {displayed.map(c => {
          const aff = affordMap.get(c.id);
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

              {/* 구매 가능 여부 배지 — 입력값이 있을 때만 표시 */}
              {hasInputs && aff ? (
                aff.canBuy ? (
                  <span style={{
                    fontSize: '11px', fontWeight: 700, color: '#0b8043',
                    backgroundColor: '#e6f4ea', borderRadius: '8px', padding: '2px 8px',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>✓ 가능</span>
                ) : (
                  <span style={{
                    fontSize: '11px', fontWeight: 700, color: '#c5221f',
                    backgroundColor: '#fce8e6', borderRadius: '8px', padding: '2px 8px',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>△ {fmt(aff.shortage)}</span>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AffordabilityPanel;
