import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ApartmentComplex } from '../../types';
import { getPriceHistories } from '../../services/api';

interface Props {
  complexes: ApartmentComplex[];
  onClose: () => void;
  isMobile?: boolean; // 모바일 풀스크린 오버레이 모드
}

const HEADER_COLOR = '#5AAF84';

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
          <span style={{ fontWeight: row.highlight ? 700 : 400, color: row.highlight ? '#89CFF0' : '#202124' }}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
    <div style={{ height: '1px', backgroundColor: a.canBuy ? '#a8d5b5' : '#f5c6c6', margin: '7px 0' }} />
    <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 700 }}>
      {a.canBuy
        ? <span style={{ color: '#5AAF84' }}>✓ 구매 가능</span>
        : <span style={{ color: '#E06060' }}>× {fmt(a.shortage)} 부족</span>}
    </div>
  </div>
);

// ─── 대출 계산 탭 ────────────────────────────────────────────────────────────

interface CreditLoan {
  amount: string; // 만원
  rate: string;   // 연 금리 %
  years: string;  // 상환기간 년
}

interface JeonseLoan {
  amount: string; // 만원 (전세보증금 중 대출 부분)
  rate: string;   // 연 금리 %
  years: string;  // 만기 년 (보통 2년)
}

interface LoanScenario {
  rate: string;
  repaymentType: 'equal_total' | 'equal_principal'; // 원리금균등 | 원금균등
  creditLoans: CreditLoan[];
  jeonseLoans: JeonseLoan[];
}

// 원리금균등상환 월 납입액
function calcMonthlyPayment(loanWon: number, annualRatePct: number, years: number): number {
  if (loanWon <= 0 || annualRatePct <= 0 || years <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  return loanWon * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// 원리금균등 연 단위 스케줄
function buildYearlySchedule(loanWon: number, annualRatePct: number, years: number) {
  if (loanWon <= 0 || annualRatePct <= 0 || years <= 0) return [];
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  const monthly = loanWon * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  let balance = loanWon;
  const result: { year: number; principal: number; interest: number; balance: number }[] = [];
  for (let y = 1; y <= years; y++) {
    let yp = 0, yi = 0;
    for (let m = 0; m < 12; m++) {
      if (balance <= 0) break;
      const ip = balance * r;
      const pp = Math.min(monthly - ip, balance);
      yi += ip; yp += pp; balance -= pp;
    }
    result.push({ year: y, principal: yp, interest: yi, balance: Math.max(balance, 0) });
  }
  return result;
}

// 원금균등 연 단위 스케줄 (매달 원금 고정, 이자 감소)
function buildYearlyScheduleEP(loanWon: number, annualRatePct: number, years: number) {
  if (loanWon <= 0 || years <= 0) return [];
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  const mp = loanWon / n; // 매달 고정 원금
  let balance = loanWon;
  const result: { year: number; principal: number; interest: number; balance: number }[] = [];
  for (let y = 1; y <= years; y++) {
    let yp = 0, yi = 0;
    for (let m = 0; m < 12; m++) {
      if (balance <= 0) break;
      const ip = balance * r;
      const pp = Math.min(mp, balance);
      yi += ip; yp += pp; balance -= pp;
    }
    result.push({ year: y, principal: yp, interest: yi, balance: Math.max(balance, 0) });
  }
  return result;
}

// 억 단위 포맷
function fmtUk(won: number): string {
  if (won <= 0) return '0원';
  const uk = won / 100_000_000;
  if (uk >= 1) return `${uk.toFixed(1).replace(/\.0$/, '')}억`;
  return `${Math.round(won / 10_000).toLocaleString()}만`;
}

// 만원 단위 포맷
function fmtMan(won: number): string {
  return `${Math.round(won / 10_000).toLocaleString()}만원`;
}

const LoanCalcTab: React.FC<{ isMobile?: boolean }> = ({ isMobile }) => {
  const [loanUk, setLoanUk] = useState(() => localStorage.getItem('loan_calc_uk') || '');
  const [loanYears, setLoanYears] = useState(() => parseInt(localStorage.getItem('loan_calc_years') || '30'));
  const [loanCalcIncome, setLoanCalcIncome] = useState(() => localStorage.getItem('loan_calc_income') || '');
  const [scenarios, setScenarios] = useState<LoanScenario[]>(() => {
    try {
      const saved = localStorage.getItem('loan_calc_scenarios');
      if (saved) {
        const parsed = JSON.parse(saved);
        // 기존 저장값 마이그레이션 (repaymentType, jeonseLoans 필드 추가)
        return parsed.map((s: LoanScenario) => ({
          rate: s.rate || '3.5',
          repaymentType: s.repaymentType || 'equal_total',
          creditLoans: s.creditLoans || [],
          jeonseLoans: s.jeonseLoans || [],
        }));
      }
    } catch {}
    return [
      { rate: '3.5', repaymentType: 'equal_total', creditLoans: [], jeonseLoans: [] },
      { rate: '4.0', repaymentType: 'equal_total', creditLoans: [], jeonseLoans: [] },
    ];
  });
  const [showSchedule, setShowSchedule] = useState(false);

  useEffect(() => { localStorage.setItem('loan_calc_uk', loanUk); }, [loanUk]);
  useEffect(() => { localStorage.setItem('loan_calc_years', String(loanYears)); }, [loanYears]);
  useEffect(() => { localStorage.setItem('loan_calc_income', loanCalcIncome); }, [loanCalcIncome]);
  useEffect(() => { localStorage.setItem('loan_calc_scenarios', JSON.stringify(scenarios)); }, [scenarios]);

  const updateRate = useCallback((idx: number, val: string) => {
    setScenarios(prev => prev.map((s, i) => i === idx ? { ...s, rate: val } : s));
  }, []);

  const updateRepaymentType = useCallback((idx: number, val: 'equal_total' | 'equal_principal') => {
    setScenarios(prev => prev.map((s, i) => i === idx ? { ...s, repaymentType: val } : s));
  }, []);

  const addCreditLoan = useCallback((idx: number) => {
    setScenarios(prev => prev.map((s, i) =>
      i === idx && s.creditLoans.length < 2
        ? { ...s, creditLoans: [...s.creditLoans, { amount: '', rate: '', years: '5' }] } : s));
  }, []);
  const removeCreditLoan = useCallback((si: number, li: number) => {
    setScenarios(prev => prev.map((s, i) =>
      i === si ? { ...s, creditLoans: s.creditLoans.filter((_, j) => j !== li) } : s));
  }, []);
  const updateCreditLoan = useCallback((si: number, li: number, field: keyof CreditLoan, val: string) => {
    setScenarios(prev => prev.map((s, i) =>
      i === si ? { ...s, creditLoans: s.creditLoans.map((cl, j) => j === li ? { ...cl, [field]: val } : cl) } : s));
  }, []);

  const addJeonseLoan = useCallback((idx: number) => {
    setScenarios(prev => prev.map((s, i) =>
      i === idx && s.jeonseLoans.length < 2
        ? { ...s, jeonseLoans: [...s.jeonseLoans, { amount: '', rate: '', years: '2' }] } : s));
  }, []);
  const removeJeonseLoan = useCallback((si: number, li: number) => {
    setScenarios(prev => prev.map((s, i) =>
      i === si ? { ...s, jeonseLoans: s.jeonseLoans.filter((_, j) => j !== li) } : s));
  }, []);
  const updateJeonseLoan = useCallback((si: number, li: number, field: keyof JeonseLoan, val: string) => {
    setScenarios(prev => prev.map((s, i) =>
      i === si ? { ...s, jeonseLoans: s.jeonseLoans.map((jl, j) => j === li ? { ...jl, [field]: val } : jl) } : s));
  }, []);

  const loanWon = (parseFloat(loanUk) || 0) * 100_000_000;
  const incomeWon = (parseFloat(loanCalcIncome) || 0) * 10_000;

  const results = useMemo(() => scenarios.map(s => {
    const rate = parseFloat(s.rate) || 0;
    const isEP = s.repaymentType === 'equal_principal';
    const r = rate / 100 / 12;
    const n = loanYears * 12;

    // 주담대 — 원리금균등: 고정 월납입 / 원금균등: 첫달(최대)을 DSR 기준으로 사용
    let mortgageMonthly: number; // DSR 산정 기준값
    let mortgageLastMonthly: number;
    let mortgageTotalInterest: number;
    if (isEP && loanWon > 0 && n > 0) {
      const mp = loanWon / n;
      mortgageMonthly = mp + loanWon * r;             // 첫달 납입 (최대)
      mortgageLastMonthly = mp * (1 + r);              // 마지막달 납입 (최소)
      mortgageTotalInterest = loanWon * r * (n + 1) / 2; // 원금균등 총이자 공식
    } else {
      mortgageMonthly = calcMonthlyPayment(loanWon, rate, loanYears);
      mortgageLastMonthly = mortgageMonthly;
      mortgageTotalInterest = Math.max(mortgageMonthly * loanYears * 12 - loanWon, 0);
    }

    // 신용대출 — 원리금균등 고정
    const creditDetails = s.creditLoans.map(cl => {
      const aw = (parseFloat(cl.amount) || 0) * 10_000;
      const cr = parseFloat(cl.rate) || 0;
      const cy = parseInt(cl.years) || 5;
      const monthly = calcMonthlyPayment(aw, cr, cy);
      return { amountWon: aw, rate: cr, years: cy, monthly, interest: Math.max(monthly * cy * 12 - aw, 0) };
    });

    // 전세자금대출 — 만기일시상환, 실납입=이자만, DSR도 이자만 (금감원 기준)
    const jeonseDetails = s.jeonseLoans.map(jl => {
      const aw = (parseFloat(jl.amount) || 0) * 10_000;
      const jr = parseFloat(jl.rate) || 0;
      const jy = parseInt(jl.years) || 2;
      const actualMonthly = aw * jr / 100 / 12; // 이자만 납입 (DSR 기준도 동일)
      return { amountWon: aw, rate: jr, years: jy, actualMonthly };
    });

    // 월 납입 합계 (주담대 + 신용대출 + 전세이자)
    const actualTotalMonthly = mortgageMonthly
      + creditDetails.reduce((sum, d) => sum + d.monthly, 0)
      + jeonseDetails.reduce((sum, d) => sum + d.actualMonthly, 0);

    // DSR 산정 합계 = 실납입과 동일 (전세=이자만이 금감원 기준)
    const dsrMonthlyTotal = actualTotalMonthly;

    const totalLoanAmt = loanWon + creditDetails.reduce((sum, d) => sum + d.amountWon, 0)
      + jeonseDetails.reduce((sum, d) => sum + d.amountWon, 0);
    const totalInterest = mortgageTotalInterest + creditDetails.reduce((sum, d) => sum + d.interest, 0);
    const interestRatio = totalLoanAmt > 0 ? (totalInterest / totalLoanAmt) * 100 : 0;
    const dsr = incomeWon > 0 ? (dsrMonthlyTotal * 12) / incomeWon * 100 : null;

    return { isEP, mortgageMonthly, mortgageLastMonthly, mortgageTotalInterest,
      creditDetails, jeonseDetails, actualTotalMonthly, dsrMonthlyTotal,
      totalLoanAmt, totalInterest, interestRatio, dsr };
  }), [loanWon, loanYears, incomeWon, scenarios]);

  // 상환 방식에 맞는 스케줄 (주담대 기준)
  const schedules = useMemo(() => scenarios.map(s => {
    const rate = parseFloat(s.rate) || 0;
    return s.repaymentType === 'equal_principal'
      ? buildYearlyScheduleEP(loanWon, rate, loanYears)
      : buildYearlySchedule(loanWon, rate, loanYears);
  }), [loanWon, loanYears, scenarios]);

  const hasInput = loanWon > 0 && loanYears > 0;
  const lowerIdx = results.length === 2
    ? (results[0].actualTotalMonthly <= results[1].actualTotalMonthly ? 0 : 1) : 0;
  const monthlyDiff = results.length === 2
    ? Math.abs(results[0].actualTotalMonthly - results[1].actualTotalMonthly) : 0;

  const SCENARIO_COLORS = ['#2a6090', '#5AAF84'];
  const inputStyle: React.CSSProperties = {
    border: '1px solid #dadce0', borderRadius: '6px',
    padding: '6px 8px', fontSize: '12px', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: '11px', color: '#5f6368', marginBottom: '3px', display: 'block' };
  const smInputStyle: React.CSSProperties = { ...inputStyle, fontSize: '11px', padding: '4px 6px' };
  const smLabelStyle: React.CSSProperties = { ...labelStyle, fontSize: '10px' };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* 공통 입력 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>주담대 금액 (억)</label>
          <input type="number" step="0.1" placeholder="예: 4" value={loanUk}
            onChange={e => setLoanUk(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>주담대 기간 (년)</label>
          <input type="number" min={1} max={50} value={loanYears}
            onChange={e => setLoanYears(parseInt(e.target.value) || 30)} style={inputStyle} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={labelStyle}>연소득 (만원) — DSR 계산용, 선택</label>
          <input type="number" step="100" placeholder="예: 6000" value={loanCalcIncome}
            onChange={e => setLoanCalcIncome(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {/* 시나리오별 설정 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {scenarios.map((s, i) => (
          <div key={i} style={{
            border: `1.5px solid ${SCENARIO_COLORS[i]}22`, borderRadius: '8px',
            padding: '10px', backgroundColor: `${SCENARIO_COLORS[i]}08`,
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: SCENARIO_COLORS[i], marginBottom: '6px' }}>
              시나리오 {i + 1}
            </div>

            {/* 주담대 금리 */}
            <label style={labelStyle}>주담대 금리 (%)</label>
            <input type="number" step="0.1" placeholder="예: 3.5" value={s.rate}
              onChange={e => updateRate(i, e.target.value)} style={inputStyle} />

            {/* 상환 방식 토글 */}
            <div style={{ marginTop: '8px' }}>
              <label style={labelStyle}>상환 방식</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['equal_total', 'equal_principal'] as const).map(type => {
                  const label = type === 'equal_total' ? '원리금균등' : '원금균등';
                  const active = s.repaymentType === type;
                  return (
                    <button key={type} onClick={() => updateRepaymentType(i, type)} style={{
                      flex: 1, padding: '5px 0', fontSize: '10px', cursor: 'pointer',
                      borderRadius: '5px', border: `1px solid ${active ? SCENARIO_COLORS[i] : '#dadce0'}`,
                      backgroundColor: active ? `${SCENARIO_COLORS[i]}18` : '#fff',
                      color: active ? SCENARIO_COLORS[i] : '#9e9e9e', fontWeight: active ? 700 : 400,
                    }}>{label}</button>
                  );
                })}
              </div>
            </div>

            {/* 신용대출 목록 */}
            {s.creditLoans.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {s.creditLoans.map((cl, li) => (
                  <div key={li} style={{ backgroundColor: '#fff', borderRadius: '6px', padding: '7px', border: '1px solid #e8eaed' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: '#5f6368' }}>신용대출 {li + 1}</span>
                      <button onClick={() => removeCreditLoan(i, li)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#bdbdbd', padding: 0 }}>×</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <div><label style={smLabelStyle}>금액 (만원)</label>
                        <input type="number" step="100" placeholder="예: 5000" value={cl.amount}
                          onChange={e => updateCreditLoan(i, li, 'amount', e.target.value)} style={smInputStyle} /></div>
                      <div><label style={smLabelStyle}>금리 (%)</label>
                        <input type="number" step="0.1" placeholder="5.0" value={cl.rate}
                          onChange={e => updateCreditLoan(i, li, 'rate', e.target.value)} style={smInputStyle} /></div>
                      <div style={{ gridColumn: 'span 2' }}><label style={smLabelStyle}>기간 (년)</label>
                        <input type="number" min={1} max={10} placeholder="5" value={cl.years}
                          onChange={e => updateCreditLoan(i, li, 'years', e.target.value)} style={smInputStyle} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 전세자금대출 목록 */}
            {s.jeonseLoans.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {s.jeonseLoans.map((jl, li) => (
                  <div key={li} style={{ backgroundColor: '#fffdf0', borderRadius: '6px', padding: '7px', border: '1px solid #e8d880' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: '#8a6800' }}>전세대출 {li + 1}</span>
                      <button onClick={() => removeJeonseLoan(i, li)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#bdbdbd', padding: 0 }}>×</button>
                    </div>
                    <div style={{ fontSize: '9px', color: '#b08000', marginBottom: '5px' }}>
                      만기일시상환 · DSR=이자만 (금감원 기준)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <div><label style={smLabelStyle}>금액 (만원)</label>
                        <input type="number" step="100" placeholder="예: 20000" value={jl.amount}
                          onChange={e => updateJeonseLoan(i, li, 'amount', e.target.value)} style={smInputStyle} /></div>
                      <div><label style={smLabelStyle}>금리 (%)</label>
                        <input type="number" step="0.1" placeholder="3.0" value={jl.rate}
                          onChange={e => updateJeonseLoan(i, li, 'rate', e.target.value)} style={smInputStyle} /></div>
                      <div style={{ gridColumn: 'span 2' }}><label style={smLabelStyle}>만기 (년)</label>
                        <input type="number" min={1} max={10} placeholder="2" value={jl.years}
                          onChange={e => updateJeonseLoan(i, li, 'years', e.target.value)} style={smInputStyle} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 추가 버튼 */}
            <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
              {s.creditLoans.length < 2 && (
                <button onClick={() => addCreditLoan(i)} style={{
                  flex: 1, border: `1px dashed ${SCENARIO_COLORS[i]}66`, borderRadius: '5px',
                  padding: '5px 0', fontSize: '10px', cursor: 'pointer',
                  backgroundColor: 'transparent', color: SCENARIO_COLORS[i],
                }}>+ 신용대출</button>
              )}
              {s.jeonseLoans.length < 2 && (
                <button onClick={() => addJeonseLoan(i)} style={{
                  flex: 1, border: '1px dashed #c8a020', borderRadius: '5px',
                  padding: '5px 0', fontSize: '10px', cursor: 'pointer',
                  backgroundColor: 'transparent', color: '#8a6800',
                }}>+ 전세대출</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 결과 카드 */}
      {hasInput ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {results.map((r, i) => {
              const isLower = i === lowerIdx;
              const hasOther = r.creditDetails.some(d => d.amountWon > 0) || r.jeonseDetails.some(d => d.amountWon > 0);
              const hasJeonse = r.jeonseDetails.some(d => d.amountWon > 0);
              return (
                <div key={i} style={{
                  border: `1.5px solid ${SCENARIO_COLORS[i]}55`, borderRadius: '10px',
                  padding: '12px', backgroundColor: isLower ? `${SCENARIO_COLORS[i]}10` : '#fff',
                  position: 'relative',
                }}>
                  {isLower && (
                    <span style={{
                      position: 'absolute', top: '8px', right: '8px', fontSize: '9px',
                      fontWeight: 700, color: '#fff', backgroundColor: SCENARIO_COLORS[i],
                      borderRadius: '6px', padding: '1px 5px',
                    }}>유리</span>
                  )}
                  <div style={{ fontSize: '11px', fontWeight: 700, color: SCENARIO_COLORS[i], marginBottom: '2px' }}>
                    시나리오 {i + 1} · {scenarios[i].rate}%
                  </div>
                  <div style={{ fontSize: '9px', color: '#9e9e9e', marginBottom: '8px' }}>
                    {r.isEP ? '원금균등 (첫달 기준)' : '원리금균등 (고정)'}
                  </div>

                  {/* 월 납입 합계 */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '10px', color: '#9e9e9e' }}>
                        {hasOther ? '월 납입 합계' : r.isEP ? '월 납입 (첫달)' : '월 납입액'}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: SCENARIO_COLORS[i] }}>
                        {fmtMan(r.actualTotalMonthly)}
                      </span>
                    </div>
                    {/* 원금균등: 마지막달 표시 */}
                    {r.isEP && !hasOther && (
                      <div style={{ textAlign: 'right', fontSize: '10px', color: '#9e9e9e' }}>
                        → 마지막달 {fmtMan(r.mortgageLastMonthly)}
                      </div>
                    )}
                    {/* 세부 내역 */}
                    {(hasOther || r.isEP) && (
                      <div style={{ marginTop: '5px', paddingLeft: '8px', borderLeft: `2px solid ${SCENARIO_COLORS[i]}33` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9e9e9e', marginBottom: '2px' }}>
                          <span>└ 주담대 {scenarios[i].rate}%{r.isEP ? ' (첫달)' : ''}</span>
                          <span>{fmtMan(r.mortgageMonthly)}</span>
                        </div>
                        {r.isEP && hasOther && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9e9e9e', marginBottom: '2px' }}>
                            <span style={{ paddingLeft: '8px' }}>└ 마지막달</span>
                            <span>{fmtMan(r.mortgageLastMonthly)}</span>
                          </div>
                        )}
                        {r.creditDetails.map((cd, li) => cd.amountWon > 0 && (
                          <div key={li} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9e9e9e', marginBottom: '2px' }}>
                            <span>└ 신용{li + 1} {cd.rate}%/{cd.years}년</span>
                            <span>{fmtMan(cd.monthly)}</span>
                          </div>
                        ))}
                        {r.jeonseDetails.map((jd, li) => jd.amountWon > 0 && (
                          <div key={li} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9e9e9e', marginBottom: '2px' }}>
                            <span>└ 전세{li + 1} {jd.rate}% (이자)</span>
                            <span>{fmtMan(jd.actualMonthly)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 총 이자 / 이자 비율 */}
                  {[
                    { label: '총 이자 (주담대+신용)', value: fmtUk(r.totalInterest) },
                    { label: '이자 비율', value: `${r.interestRatio.toFixed(1)}%` },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#9e9e9e' }}>{row.label}</span>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#202124' }}>{row.value}</span>
                    </div>
                  ))}

                  {/* DSR */}
                  {r.dsr !== null && (
                    <>
                      <div style={{ height: '1px', backgroundColor: '#f0f0f0', margin: '6px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: '#9e9e9e' }}>
                          DSR{hasJeonse ? ' (전세 이자 포함)' : ''}
                        </span>
                        <span style={{
                          fontSize: '13px', fontWeight: 700,
                          color: r.dsr <= 40 ? '#5AAF84' : r.dsr <= 50 ? '#E8A838' : '#E06060',
                        }}>
                          {r.dsr.toFixed(1)}%
                          <span style={{ fontSize: '9px', fontWeight: 400, marginLeft: '4px', color: '#9e9e9e' }}>
                            {r.dsr <= 40 ? '(40% 이하 ✓)' : '(40% 초과 ✗)'}
                          </span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* 두 시나리오 차이 */}
          {results.length === 2 && monthlyDiff > 0 && (
            <div style={{ backgroundColor: '#f1faf4', border: '1px solid #a8d5b5', borderRadius: '8px', padding: '10px 14px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#5f6368' }}>월 납입 차이 (합계 기준)</span>
                <span style={{ fontWeight: 700, color: '#5AAF84' }}>{fmtMan(monthlyDiff)}</span>
              </div>
            </div>
          )}

          {/* 상환 스케줄 토글 (주담대 기준) */}
          <button onClick={() => setShowSchedule(v => !v)} style={{
            border: '1px solid #dadce0', borderRadius: '6px', padding: '7px 12px',
            fontSize: '11px', cursor: 'pointer', backgroundColor: '#fff', color: '#5f6368', textAlign: 'left',
          }}>
            {showSchedule ? '▲ 상환 스케줄 접기' : '▼ 주담대 연도별 상환 스케줄 보기'}
          </button>

          {showSchedule && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontSize: '10px', color: '#9e9e9e', marginBottom: '4px' }}>
                * 주택담보대출 기준 (신용·전세 별도)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={thStyle}>년차</th>
                    {scenarios.map((s, i) => (
                      <React.Fragment key={i}>
                        <th style={{ ...thStyle, color: SCENARIO_COLORS[i] }}>
                          원금({s.rate}%{s.repaymentType === 'equal_principal' ? '·균등' : ''})
                        </th>
                        <th style={{ ...thStyle, color: SCENARIO_COLORS[i] }}>이자</th>
                        <th style={{ ...thStyle, color: SCENARIO_COLORS[i] }}>잔금</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedules[0].map((row, rowIdx) => (
                    <tr key={rowIdx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={tdStyle}>{row.year}년</td>
                      {schedules.map((sched, si) => {
                        const rv = sched[rowIdx];
                        return rv ? (
                          <React.Fragment key={si}>
                            <td style={tdStyle}>{fmtUk(rv.principal)}</td>
                            <td style={{ ...tdStyle, color: '#E06060' }}>{fmtUk(rv.interest)}</td>
                            <td style={tdStyle}>{fmtUk(rv.balance)}</td>
                          </React.Fragment>
                        ) : (
                          <React.Fragment key={si}>
                            <td style={tdStyle}>—</td><td style={tdStyle}>—</td><td style={tdStyle}>—</td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '20px', fontSize: '11px', color: '#9e9e9e', textAlign: 'center' }}>
          대출금액과 상환기간을 입력하면 원리금을 계산합니다.
        </div>
      )}
    </div>
  );
};

const thStyle: React.CSSProperties = {
  padding: '5px 6px', textAlign: 'right', fontWeight: 600,
  borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap', color: '#5f6368',
};
const tdStyle: React.CSSProperties = {
  padding: '5px 6px', textAlign: 'right', color: '#202124',
};

// ─── 메인 패널 ──────────────────────────────────────────────────────────────
const AffordabilityPanel: React.FC<Props> = ({ complexes, onClose, isMobile }) => {
  // 상단 탭: 구매 가능 분석 / 대출 계산
  const [mainTab, setMainTab] = useState<'afford' | 'loan'>('afford');

  const [income, setIncome] = useState(() => localStorage.getItem('afford_income') || '');
  const [cash, setCash] = useState(() => localStorage.getItem('afford_cash') || '');
  const [rate, setRate] = useState(() => localStorage.getItem('afford_rate') || '3.5');
  const [loanYears, setLoanYears] = useState(() => parseInt(localStorage.getItem('afford_years') || '30'));

  const [filter, setFilter] = useState<'all' | 'ok' | 'ng'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 패널 마운트 시 전체 단지의 호가·KB시세를 일괄 로드
  const [askingPriceMap, setAskingPriceMap] = useState<Map<number, number | null>>(new Map());
  const [kbPriceMap, setKbPriceMap] = useState<Map<number, number | null>>(new Map());
  const [loadingHistories, setLoadingHistories] = useState(false);

  useEffect(() => { localStorage.setItem('afford_income', income); }, [income]);
  useEffect(() => { localStorage.setItem('afford_cash', cash); }, [cash]);
  useEffect(() => { localStorage.setItem('afford_rate', rate); }, [rate]);
  useEffect(() => { localStorage.setItem('afford_years', String(loanYears)); }, [loanYears]);

  // 패널이 열릴 때 모든 단지의 최근 시세 기록을 병렬 조회해 호가·KB시세 추출
  useEffect(() => {
    if (complexes.length === 0) return;
    setLoadingHistories(true);
    Promise.all(
      complexes.map(c =>
        getPriceHistories(c.id)
          .then(histories => {
            const latest = [...histories].sort((a, b) => b.recordDate.localeCompare(a.recordDate))[0];
            const item = latest?.items?.[0];
            return { id: c.id, askingPrice: item?.askingPrice ?? null, kbPrice: item?.kbPrice ?? null };
          })
          .catch(() => ({ id: c.id, askingPrice: null, kbPrice: null }))
      )
    ).then(results => {
      const aMap = new Map<number, number | null>();
      const kMap = new Map<number, number | null>();
      results.forEach(r => { aMap.set(r.id, r.askingPrice); kMap.set(r.id, r.kbPrice); });
      setAskingPriceMap(aMap);
      setKbPriceMap(kMap);
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

  // 호가 기준 구매 가능 여부 맵
  const affordMapAsking = useMemo(() => {
    const map = new Map<number, Analysis>();
    askingPriceMap.forEach((price, id) => { if (price) map.set(id, analyze(price)); });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askingPriceMap, cashWon, dsrMax]);

  // KB시세 기준 구매 가능 여부 맵
  const affordMapKb = useMemo(() => {
    const map = new Map<number, Analysis>();
    kbPriceMap.forEach((price, id) => { if (price) map.set(id, analyze(price)); });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbPriceMap, cashWon, dsrMax]);

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
  const okCountKb = useMemo(
    () => Array.from(affordMapKb.values()).filter(v => v.canBuy).length,
    [affordMapKb]
  );

  const selectedComplex = complexes.find(c => c.id === selectedId) ?? null;
  const selectedAskingPrice = selectedId != null ? (askingPriceMap.get(selectedId) ?? null) : null;
  const selectedKbPrice = selectedId != null ? (kbPriceMap.get(selectedId) ?? null) : null;

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
        fontSize: '10px', fontWeight: 700, color: '#5AAF84',
        backgroundColor: '#e6f4ea', borderRadius: '6px', padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}>{prefix} ✓</span>
    ) : (
      <span style={{
        fontSize: '10px', fontWeight: 700, color: '#E06060',
        backgroundColor: '#FFE8E8', borderRadius: '6px', padding: '1px 6px',
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
        <span style={{ fontSize: '15px', fontWeight: 700 }}>
          {mainTab === 'afford' ? '구매 가능 분석' : '대출 계산기'}
        </span>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
          width: '28px', height: '28px', cursor: 'pointer', color: '#fff',
          fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
      </div>

      {/* 메인 탭 전환 */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e8eaed', flexShrink: 0 }}>
        {([
          { key: 'afford', label: '구매 가능 분석' },
          { key: 'loan', label: '대출 계산' },
        ] as const).map(t => {
          const active = mainTab === t.key;
          return (
            <button key={t.key} onClick={() => setMainTab(t.key)} style={{
              flex: 1, padding: '10px 0', fontSize: '12px', fontWeight: active ? 700 : 400,
              border: 'none', borderBottom: active ? `2px solid ${HEADER_COLOR}` : '2px solid transparent',
              marginBottom: '-2px', backgroundColor: '#fff', cursor: 'pointer',
              color: active ? HEADER_COLOR : '#9e9e9e',
            }}>{t.label}</button>
          );
        })}
      </div>

      {/* 대출 계산 탭 */}
      {mainTab === 'loan' && <LoanCalcTab isMobile={isMobile} />}

      {/* 구매 가능 분석 탭 이하 컨텐츠 */}
      {mainTab === 'afford' && <>

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
              <span style={{ fontWeight: 700, color: '#5AAF84' }}>{fmt(dsrMax)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ color: '#5f6368' }}>현금 보유액</span>
              <span style={{ fontWeight: 700, color: '#202124' }}>{fmt(cashWon)}</span>
            </div>
            <div style={{ height: '1px', backgroundColor: '#a8d5b5', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ color: '#5f6368' }}>매매가 기준 가능</span>
              <span style={{ fontWeight: 700, color: '#5AAF84' }}>{okCountPrice} / {affordMap.size}개</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ color: '#5f6368' }}>KB시세 기준 가능</span>
              <span style={{ fontWeight: 700, color: '#5AAF84' }}>
                {loadingHistories ? '—' : `${okCountKb} / ${affordMapKb.size}개`}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#5f6368' }}>호가 기준 가능</span>
              <span style={{ fontWeight: 700, color: '#5AAF84' }}>
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
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#5AAF84' }}>
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
              {selectedKbPrice ? (
                <AnalysisBlock label="KB시세 기준" a={analyze(selectedKbPrice)} />
              ) : (
                <div style={{
                  fontSize: '11px', color: '#9e9e9e', textAlign: 'center',
                  padding: '8px', border: '1px dashed #e0e0e0', borderRadius: '6px',
                }}>
                  {loadingHistories ? 'KB시세 로딩 중...' : 'KB시세 없음 (시세 기록에 KB시세 입력 필요)'}
                </div>
              )}
              {selectedAskingPrice ? (
                <AnalysisBlock label="호가 기준" a={analyze(selectedAskingPrice)} />
              ) : (
                <div style={{
                  fontSize: '11px', color: '#9e9e9e', textAlign: 'center',
                  padding: '8px', border: '1px dashed #e0e0e0', borderRadius: '6px',
                }}>
                  {loadingHistories ? '호가 로딩 중...' : '호가 없음 (시세 기록에 호가 입력 필요)'}
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
            KB시세·호가 로딩 중...
          </div>
        )}
        {displayed.length === 0 && !loadingHistories && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
            해당하는 단지가 없습니다.
          </div>
        )}
        {displayed.map(c => {
          const affPrice = affordMap.get(c.id);
          const affKb = affordMapKb.get(c.id);
          const affAsking = affordMapAsking.get(c.id);
          const hasKbData = kbPriceMap.has(c.id) && kbPriceMap.get(c.id) !== null;
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

              {/* 매매가·KB시세·호가 배지 — 입력값 있을 때만 */}
              {hasInputs && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end', flexShrink: 0 }}>
                  <SmallBadge prefix="매매가" a={affPrice} />
                  <SmallBadge prefix="KB" a={affKb} noData={!hasKbData} />
                  <SmallBadge prefix="호가" a={affAsking} noData={!hasAskingData} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      </> /* mainTab === 'afford' */}
    </div>
  );
};

export default AffordabilityPanel;
