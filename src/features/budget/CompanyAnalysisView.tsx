// ─── 기업 투자 분석 뷰 ────────────────────────────────────────────────────────
// 기업명/종목코드 입력 → DART 6년 재무 + yfinance 5년 주가 + Gemini 투자 분석
// AIReportView의 'company' 서브탭에서 렌더링
import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  analyzeCompany,
  getCompanyAnalysisReports,
  deleteCompanyAnalysisReport,
  CompanyAnalysisResult,
  AnnualFinancial,
  InvestorTradingData,
  PricePoint,
} from '../../services/api';

// ── 포맷 유틸 ──────────────────────────────────────────────────────────────────

const fmtAmount = (v: number | null): string => {
  if (v === null || v === undefined) return '-';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}조`;
  if (abs >= 100_000_000) return `${sign}${Math.round(abs / 100_000_000)}억`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000)}만`;
  return `${sign}${abs.toLocaleString()}`;
};

const fmtPct = (v: number | null): string => (v === null || v === undefined) ? '-' : `${v.toFixed(1)}%`;

const fmtWon = (v: number | null): string => (v === null || v === undefined) ? '-' : `₩${Math.round(v).toLocaleString()}`;

const numColor = (v: number | null, inverse = false): string => {
  if (v === null || v === undefined) return '#666';
  const good = inverse ? v < 200 : v > 0;
  return good ? '#1e7e34' : '#c0392b';
};

const pctColor = (v: number | null): string => {
  if (v === null || v === undefined) return '#666';
  return v >= 10 ? '#1e7e34' : v >= 5 ? '#2e7d32' : v >= 0 ? '#666' : '#c0392b';
};

// ── CAGR 계산 (annualFinancials는 최신→과거 정렬, 데이터 부족 시 가용 연수로 fallback) ─
const calcCAGR = (
  financials: AnnualFinancial[],
  key: 'revenue' | 'opIncome' | 'netIncome',
  years = 3,
): { cagr: number; actualYears: number } | null => {
  if (financials.length < 2) return null;
  const actualYears = Math.min(years, financials.length - 1);
  const endVal = financials[0][key];
  const startVal = financials[actualYears][key];
  if (!endVal || !startVal || startVal <= 0 || endVal <= 0) return null;
  return { cagr: (Math.pow(endVal / startVal, 1 / actualYears) - 1) * 100, actualYears };
};

// ── 저평가 점수 계산 (0~100, 높을수록 저평가) ─────────────────────────────────
const calcUndervalueScore = (
  result: CompanyAnalysisResult,
  latestFin?: AnnualFinancial,
): number => {
  const comps: { score: number; w: number }[] = [];

  if (result.per != null && result.per > 0) {
    const s = result.per <= 5 ? 100 : result.per <= 10 ? 85 : result.per <= 15 ? 65
            : result.per <= 20 ? 45 : result.per <= 30 ? 25 : 5;
    comps.push({ score: s, w: 35 });
  }
  if (result.pbr != null && result.pbr > 0) {
    const s = result.pbr <= 0.5 ? 100 : result.pbr <= 1 ? 85 : result.pbr <= 2 ? 65
            : result.pbr <= 3 ? 45 : result.pbr <= 5 ? 25 : 5;
    comps.push({ score: s, w: 25 });
  }
  const roe = latestFin?.roe ?? result.roe;
  if (roe != null) {
    const s = roe >= 20 ? 100 : roe >= 15 ? 85 : roe >= 10 ? 65 : roe >= 5 ? 45 : roe >= 0 ? 25 : 5;
    comps.push({ score: s, w: 25 });
  }
  const dr = latestFin?.debtRatio;
  if (dr != null) {
    const s = dr <= 50 ? 100 : dr <= 100 ? 85 : dr <= 150 ? 65 : dr <= 200 ? 45 : dr <= 300 ? 25 : 5;
    comps.push({ score: s, w: 15 });
  }

  if (comps.length === 0) return 50;
  const totalW = comps.reduce((s, c) => s + c.w, 0);
  const totalS = comps.reduce((s, c) => s + c.score * c.w, 0);
  return Math.round(totalS / totalW);
};

// ── 저평가 점수 게이지 ─────────────────────────────────────────────────────────
const UndervalueGauge: React.FC<{ score: number }> = ({ score }) => {
  const label = score >= 80 ? '매우 저평가' : score >= 60 ? '저평가' : score >= 40 ? '적정가치' : score >= 20 ? '고평가' : '매우 고평가';
  const scoreColor = score >= 80 ? '#1e7e34' : score >= 60 ? '#5cb85c' : score >= 40 ? '#f59e0b' : score >= 20 ? '#e65100' : '#c0392b';

  return (
    <div style={{ minWidth: '220px' }}>
      <div style={{ fontSize: '11px', color: '#6b8ba4', marginBottom: '6px', fontWeight: 600 }}>저평가 점수</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ flex: 1, position: 'relative', height: '10px' }}>
          <div style={{
            height: '10px', borderRadius: '5px',
            background: 'linear-gradient(to right, #c0392b, #e65100, #f59e0b, #5cb85c, #1e7e34)',
          }} />
          {/* 위치 마커 */}
          <div style={{
            position: 'absolute', top: '-3px',
            left: `calc(${score}% - 8px)`,
            width: '16px', height: '16px',
            borderRadius: '50%', background: scoreColor,
            border: '2px solid #fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }} />
        </div>
        <div style={{
          background: scoreColor, color: '#fff', borderRadius: '8px',
          padding: '4px 10px', textAlign: 'center', minWidth: '72px',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 900, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: '9px', marginTop: '2px', whiteSpace: 'nowrap' }}>{label}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#aaa', marginTop: '4px' }}>
        <span>고평가</span><span>저평가</span>
      </div>
    </div>
  );
};

// ── 4열 지표 그리드 ────────────────────────────────────────────────────────────
interface MetricItem { label: string; value: string; sub?: string; color?: string }
interface MetricGroup { title: string; color: string; items: MetricItem[] }

const MetricGrid: React.FC<{ groups: MetricGroup[] }> = ({ groups }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
    {groups.map(g => (
      <div key={g.title} style={{ background: '#fff', borderRadius: '10px', border: `1px solid ${g.color}30`, overflow: 'hidden' }}>
        <div style={{ background: `${g.color}18`, padding: '7px 12px', fontSize: '11px', fontWeight: 700, color: g.color, borderBottom: `1px solid ${g.color}20` }}>
          {g.title}
        </div>
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {g.items.map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#6b8ba4' }}>{item.label}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: item.color || '#1a3a5c' }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

// ── 재무제표 테이블 (12행) ─────────────────────────────────────────────────────

interface TableSection {
  sectionLabel: string;
  rows: {
    label: string;
    key: keyof AnnualFinancial;
    fmt: (v: number | null) => string;
    color?: (v: number | null) => string;
  }[];
}

const TABLE_SECTIONS: TableSection[] = [
  {
    sectionLabel: '재무성과',
    rows: [
      { label: '매출', key: 'revenue', fmt: fmtAmount },
      { label: '영업이익', key: 'opIncome', fmt: fmtAmount, color: v => numColor(v) },
      { label: '순이익', key: 'netIncome', fmt: fmtAmount, color: v => numColor(v) },
      { label: '자기자본', key: 'equity', fmt: fmtAmount },
    ],
  },
  {
    sectionLabel: '수익성',
    rows: [
      { label: 'ROE', key: 'roe', fmt: fmtPct, color: v => pctColor(v) },
      { label: 'ROA', key: 'roa', fmt: fmtPct, color: v => pctColor(v) },
      { label: '영업이익률', key: 'opMargin', fmt: fmtPct, color: v => pctColor(v) },
      { label: '순이익률', key: 'netMargin', fmt: fmtPct, color: v => pctColor(v) },
    ],
  },
  {
    sectionLabel: '주당지표',
    rows: [
      { label: 'EPS', key: 'eps', fmt: fmtWon },
      { label: 'BPS', key: 'bps', fmt: fmtWon },
    ],
  },
  {
    sectionLabel: '안정성',
    rows: [
      { label: '부채비율', key: 'debtRatio', fmt: fmtPct, color: v => v !== null ? (v <= 100 ? '#1e7e34' : v <= 200 ? '#e65100' : '#c0392b') : '#666' },
      { label: '유동비율', key: 'currentRatio', fmt: fmtPct, color: v => v !== null ? (v >= 150 ? '#1e7e34' : v >= 100 ? '#e65100' : '#c0392b') : '#666' },
    ],
  },
];

const FinancialTable: React.FC<{ rows: AnnualFinancial[] }> = ({ rows }) => {
  if (rows.length === 0) return (
    <div style={{ padding: '24px', textAlign: 'center', color: '#9aa0a6', fontSize: '13px' }}>
      재무 데이터 없음
    </div>
  );

  const years = rows.map(r => r.year);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#f0f8fd' }}>
            <th style={{ padding: '7px 10px', textAlign: 'left', color: '#1a3a5c', fontWeight: 700, borderBottom: '2px solid #d0e8f5', minWidth: '80px', position: 'sticky', left: 0, background: '#f0f8fd', zIndex: 1 }}>
              항목
            </th>
            {years.map(y => (
              <th key={y} style={{ padding: '7px 10px', textAlign: 'right', color: '#1a3a5c', fontWeight: 700, borderBottom: '2px solid #d0e8f5', minWidth: '65px' }}>
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TABLE_SECTIONS.map(sec => (
            <React.Fragment key={sec.sectionLabel}>
              {/* 섹션 헤더 행 */}
              <tr>
                <td
                  colSpan={years.length + 1}
                  style={{ padding: '5px 10px', background: '#eef4ff', fontSize: '11px', fontWeight: 700, color: '#4a6fa5', borderTop: '1px solid #d0e8f5' }}
                >
                  {sec.sectionLabel}
                </td>
              </tr>
              {/* 데이터 행 */}
              {sec.rows.map(({ label, key, fmt, color }) => (
                <tr key={label} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '6px 10px', color: '#344054', fontWeight: 500, background: '#fafcff', position: 'sticky', left: 0, zIndex: 1 }}>
                    {label}
                  </td>
                  {rows.map(r => {
                    const v = r[key] as number | null;
                    return (
                      <td key={r.year} style={{ padding: '6px 10px', textAlign: 'right', color: color ? color(v) : '#344054', fontWeight: 500 }}>
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── 5년 주가 차트 (일별) ────────────────────────────────────────────────────────
const PriceChart: React.FC<{ data: PricePoint[] }> = ({ data }) => {
  if (data.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9aa0a6', fontSize: '13px' }}>
      주가 데이터 없음
    </div>
  );

  // 연도별 첫 거래일만 X축 틱으로 표시
  const yearTicks: string[] = [];
  const seenYears = new Set<string>();
  for (const p of data) {
    const y = p.date.slice(0, 4);
    if (!seenYears.has(y)) { seenYears.add(y); yearTicks.push(p.date); }
  }

  return (
    <ResponsiveContainer width="100%" height={210}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#89CFF0" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#89CFF0" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" ticks={yearTicks} tickFormatter={d => d.slice(0, 4)} tick={{ fontSize: 11, fill: '#666' }} />
        <YAxis tickFormatter={v => v >= 100_000 ? `${Math.round(v / 10_000)}만` : v.toLocaleString()} tick={{ fontSize: 11, fill: '#666' }} width={55} />
        <Tooltip
          formatter={(v: number) => [`₩${v.toLocaleString()}`, '종가']}
          labelFormatter={(l: string) => l}
          contentStyle={{ fontSize: '12px', borderRadius: '6px', border: '1px solid #e0e4e8' }}
        />
        <Area type="monotone" dataKey="close" stroke="#4BAAD4" strokeWidth={1.5} fill="url(#priceGradient)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// ── 수익성 추이 차트 ───────────────────────────────────────────────────────────
const ProfitChart: React.FC<{ data: AnnualFinancial[] }> = ({ data }) => {
  const sorted = [...data].reverse(); // 과거→최신 순 정렬
  if (sorted.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9aa0a6', fontSize: '13px' }}>
      수익성 데이터 없음
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={sorted} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#666' }} />
        <YAxis unit="%" tick={{ fontSize: 11, fill: '#666' }} width={40} />
        <Tooltip
          formatter={(v: number, name: string) => [`${v?.toFixed(1)}%`, name]}
          contentStyle={{ fontSize: '12px', borderRadius: '6px', border: '1px solid #e0e4e8' }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
        <Line type="monotone" dataKey="roe" name="ROE" stroke="#1565c0" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="opMargin" name="영업이익률" stroke="#2e7d32" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="netMargin" name="순이익률" stroke="#e65100" strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ── 투자자별 수급 바 (외국인/기관/개인 60일 순매수) ─────────────────────────────
const InvestorBar: React.FC<{ label: string; value: number; maxAbs: number }> = ({ label, value, maxAbs }) => {
  const isPos = value >= 0;
  const barPct = maxAbs > 0 ? Math.abs(value) / maxAbs * 100 : 0;
  const barColor = isPos ? '#1565c0' : '#c0392b';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
      <span style={{ width: '40px', color: '#6b8ba4', textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, position: 'relative', height: '14px', background: '#f0f4f8', borderRadius: '4px', overflow: 'hidden' }}>
        {/* 가운데 기준선 */}
        <div style={{ position: 'absolute', left: '50%', top: 0, width: '1px', height: '100%', background: '#ccc', zIndex: 1 }} />
        {/* 순매수/순매도 바 */}
        <div style={{
          position: 'absolute',
          top: '2px', bottom: '2px',
          borderRadius: '3px',
          background: barColor,
          ...(isPos
            ? { left: '50%', width: `${barPct / 2}%` }
            : { right: '50%', width: `${barPct / 2}%` }
          ),
        }} />
      </div>
      <span style={{ width: '62px', textAlign: 'right', fontWeight: 700, color: barColor, flexShrink: 0 }}>
        {isPos ? '+' : ''}{value.toFixed(1)}억
      </span>
    </div>
  );
};

const InvestorTradingSection: React.FC<{ data: InvestorTradingData }> = ({ data }) => {
  const maxAbs = Math.max(Math.abs(data.foreigners), Math.abs(data.institutions), Math.abs(data.individuals), 1);
  return (
    <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e0e4e8' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '10px' }}>
        👥 투자자별 수급 <span style={{ fontWeight: 400, fontSize: '11px', color: '#9aa0a6', marginLeft: '6px' }}>최근 60일 순매수 (Toss API)</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        <InvestorBar label="외국인" value={data.foreigners} maxAbs={maxAbs} />
        <InvestorBar label="기관" value={data.institutions} maxAbs={maxAbs} />
        <InvestorBar label="개인" value={data.individuals} maxAbs={maxAbs} />
      </div>
    </div>
  );
};

// ── 마크다운 렌더러 ─────────────────────────────────────────────────────────────
const renderContent = (text: string) => {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return (
      <h2 key={i} style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c', margin: '18px 0 7px', borderBottom: '2px solid #e0f0ff', paddingBottom: '4px' }}>
        {line.slice(3)}
      </h2>
    );
    if (line.startsWith('### ')) return (
      <h3 key={i} style={{ fontSize: '13px', fontWeight: 700, color: '#344054', margin: '12px 0 5px' }}>
        {line.slice(4)}
      </h3>
    );
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const parts = line.slice(2).split(/(\*\*[^*]+\*\*)/g);
      return (
        <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
          <span style={{ color: '#89CFF0', flexShrink: 0 }}>•</span>
          <span>{parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p)}</span>
        </div>
      );
    }
    if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} style={{ fontSize: '13px', color: '#444', margin: '3px 0', lineHeight: '1.6' }}>
        {parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p)}
      </p>
    );
  });
};

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

interface CompanyAnalysisViewProps {
  initialQuery?: string;
  onQueryConsumed?: () => void;
}

const CompanyAnalysisView: React.FC<CompanyAnalysisViewProps> = ({ initialQuery, onQueryConsumed }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompanyAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [savedReports, setSavedReports] = useState<CompanyAnalysisResult[]>([]);

  useEffect(() => {
    getCompanyAnalysisReports().then(setSavedReports).catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialQuery) return;
    setQuery(initialQuery);
    onQueryConsumed?.();
    const timer = setTimeout(() => { handleAnalyzeWith(initialQuery); }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const runAnalysis = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await analyzeCompany(trimmed);
      setResult(res);
      setSavedReports(prev => [res, ...prev.filter(r => r.companyName !== res.companyName)]);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeWith = (q: string) => runAnalysis(q);
  const handleAnalyze = () => runAnalysis(query);

  const handleDeleteReport = async (r: CompanyAnalysisResult, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!r.id || !window.confirm(`"${r.companyName}" 분석 리포트를 삭제할까요?`)) return;
    await deleteCompanyAnalysisReport(r.id).catch(() => {});
    setSavedReports(prev => prev.filter(p => p.id !== r.id));
    if (result?.id === r.id) setResult(null);
  };

  const fmtNum = (v: number | null, digits = 1) =>
    v == null ? '-' : v.toLocaleString('ko-KR', { maximumFractionDigits: digits });

  const fmtCap = (cap: number | null, market: string) => {
    if (cap == null) return '-';
    if (market === 'KR') {
      const uk = cap / 1e8;
      return uk >= 1 ? `₩${uk.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}억` : `₩${(cap / 1e6).toFixed(0)}백만`;
    }
    const b = cap / 1e9;
    return b >= 1 ? `$${b.toFixed(1)}B` : `$${(cap / 1e6).toFixed(0)}M`;
  };

  // 최신 연도 재무 데이터 (annualFinancials[0])
  const latestFin = result?.annualFinancials[0];

  // 저평가 점수
  const uvScore = result ? calcUndervalueScore(result, latestFin) : null;

  // 4열 지표 그리드 데이터 구성
  const metricGroups: MetricGroup[] = result ? [
    {
      title: '밸류에이션',
      color: '#1565c0',
      items: [
        { label: 'PER', value: result.per != null ? `${fmtNum(result.per)}배` : '-' },
        { label: 'PBR', value: result.pbr != null ? `${fmtNum(result.pbr)}배` : '-' },
        { label: 'EPS', value: result.eps != null ? `₩${Math.round(result.eps).toLocaleString()}` : '-' },
        { label: '시가총액', value: fmtCap(result.marketCap, result.market) },
      ],
    },
    {
      title: '수익성',
      color: '#2e7d32',
      items: [
        { label: 'ROE', value: fmtPct(latestFin?.roe ?? result.roe), color: pctColor(latestFin?.roe ?? result.roe) },
        { label: '영업이익률', value: fmtPct(latestFin?.opMargin ?? null), color: pctColor(latestFin?.opMargin ?? null) },
        { label: '순이익률', value: fmtPct(latestFin?.netMargin ?? null), color: pctColor(latestFin?.netMargin ?? null) },
        { label: 'ROA', value: fmtPct(latestFin?.roa ?? null), color: pctColor(latestFin?.roa ?? null) },
      ],
    },
    {
      title: (() => {
        const fins = result.annualFinancials;
        const yr = fins.length >= 2 ? Math.min(3, fins.length - 1) : 3;
        return `성장성 (${yr}Y CAGR)`;
      })(),
      color: '#e65100',
      items: (() => {
        const fins = result.annualFinancials;
        const revRes = calcCAGR(fins, 'revenue');
        const opRes = calcCAGR(fins, 'opIncome');
        const netRes = calcCAGR(fins, 'netIncome');
        const fmt = (r: { cagr: number } | null) => r != null ? `${r.cagr > 0 ? '+' : ''}${r.cagr.toFixed(1)}%` : '-';
        return [
          { label: '매출 성장률', value: fmt(revRes), color: revRes != null ? pctColor(revRes.cagr) : '#666' },
          { label: '영업이익 성장률', value: fmt(opRes), color: opRes != null ? pctColor(opRes.cagr) : '#666' },
          { label: '순이익 성장률', value: fmt(netRes), color: netRes != null ? pctColor(netRes.cagr) : '#666' },
        ];
      })(),
    },
    {
      title: '안정성',
      color: '#6a1b9a',
      items: [
        {
          label: '부채비율',
          value: fmtPct(latestFin?.debtRatio ?? null),
          color: latestFin?.debtRatio != null ? (latestFin.debtRatio <= 100 ? '#1e7e34' : latestFin.debtRatio <= 200 ? '#e65100' : '#c0392b') : '#666',
        },
        {
          label: '유동비율',
          value: fmtPct(latestFin?.currentRatio ?? null),
          color: latestFin?.currentRatio != null ? (latestFin.currentRatio >= 150 ? '#1e7e34' : latestFin.currentRatio >= 100 ? '#e65100' : '#c0392b') : '#666',
        },
        { label: '자기자본', value: fmtAmount(latestFin?.equity ?? null) },
      ],
    },
  ] : [];

  return (
    <div>
      {/* ── 검색창 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleAnalyze()}
          placeholder="기업명 또는 티커 입력 (예: 삼성전자, 005930, AAPL)"
          style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #dadce0', fontSize: '14px', outline: 'none' }}
        />
        <button
          onClick={handleAnalyze}
          disabled={loading || !query.trim()}
          style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            background: loading ? '#b0cfdf' : '#89CFF0', color: '#fff',
            fontWeight: 700, fontSize: '14px', cursor: loading ? 'default' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {loading ? '분석 중…' : '🔍 분석'}
        </button>
      </div>

      {/* ── 저장된 분석 이력 */}
      {savedReports.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {savedReports.map((r, i) => {
            const isActive = result?.companyName === r.companyName;
            return (
              <div key={i} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '20px', border: '1px solid #89CFF0', overflow: 'hidden' }}>
                <button
                  onClick={() => setResult(r)}
                  style={{ padding: '4px 8px 4px 10px', fontSize: '12px', border: 'none', background: isActive ? '#89CFF0' : '#fff', color: isActive ? '#fff' : '#1a3a5c', cursor: 'pointer' }}
                >
                  {r.companyName}{r.ticker ? ` (${r.ticker})` : ''}
                </button>
                <button
                  onClick={e => handleDeleteReport(r, e)}
                  style={{ padding: '4px 7px 4px 4px', fontSize: '11px', border: 'none', background: isActive ? '#89CFF0' : '#fff', color: isActive ? '#fff' : '#888', cursor: 'pointer', lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          ❌ {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#89CFF0', fontSize: '14px' }}>
          <div style={{ marginBottom: '10px', fontSize: '24px' }}>🔍</div>
          DART + yfinance + Gemini 분석 중… (30초~1분 소요)
        </div>
      )}

      {/* ── 결과 대시보드 */}
      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* ① 기업 헤더 */}
          <div style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #e0e4e8' }}>
            {/* 회사명 + 배지 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#1a3a5c' }}>{result.companyName}</span>
              {result.ticker && (
                <span style={{ fontSize: '13px', color: '#666', background: '#f0f4f8', borderRadius: '6px', padding: '2px 8px' }}>{result.ticker}</span>
              )}
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 600, background: result.market === 'KR' ? '#e0f0ff' : '#fff0e0', color: result.market === 'KR' ? '#1565c0' : '#e65100' }}>
                {result.market === 'KR' ? '🇰🇷 KOSPI/KOSDAQ' : '🇺🇸 US'}
              </span>
              {result.exchange && <span style={{ fontSize: '11px', color: '#666', background: '#f5f5f5', borderRadius: '4px', padding: '1px 6px' }}>{result.exchange}</span>}
              {result.sector && <span style={{ fontSize: '11px', color: '#555', background: '#eef4ff', borderRadius: '4px', padding: '1px 8px' }}>{result.sector}</span>}
              {result.fromCache && <span style={{ fontSize: '11px', color: '#9aa0a6', background: '#f5f5f5', borderRadius: '4px', padding: '1px 6px' }}>캐시</span>}
            </div>

            {/* 현재가 + 게이지 */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                {result.price != null && (
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#1a3a5c', lineHeight: 1 }}>
                    {result.market === 'KR' ? '₩' : '$'}{fmtNum(result.price, 0)}
                  </div>
                )}
                {result.marketCap != null && (
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>시가총액 {fmtCap(result.marketCap, result.market)}</div>
                )}
              </div>
              {uvScore !== null && <UndervalueGauge score={uvScore} />}
            </div>
          </div>

          {/* ② 4열 지표 그리드 */}
          <MetricGrid groups={metricGroups} />

          {/* ②-b 투자자별 수급 (Toss API, KR only) */}
          {result.investorTrading && (
            <InvestorTradingSection data={result.investorTrading} />
          )}

          {/* ③ 차트 2분할 */}
          {(result.annualFinancials.length > 0 || result.priceHistory.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e0e4e8' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '8px' }}>📈 5년 주가 추이</div>
                <PriceChart data={result.priceHistory} />
              </div>
              <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e0e4e8' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '8px' }}>📊 수익성 추이 (%)</div>
                <ProfitChart data={result.annualFinancials} />
              </div>
            </div>
          )}

          {/* ④ 재무제표 테이블 */}
          {result.annualFinancials.length > 0 && (
            <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e0e4e8' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '10px' }}>
                📋 재무제표 ({result.annualFinancials.length}개년)
                <span style={{ fontWeight: 400, fontSize: '11px', color: '#9aa0a6', marginLeft: '8px' }}>단위: 억원 / % / 원(주당)</span>
              </div>
              <FinancialTable rows={result.annualFinancials} />
            </div>
          )}

          {/* ⑤ Gemini AI 분석 */}
          <div style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #e0e4e8' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', marginBottom: '10px' }}>🤖 Gemini 투자 분석</div>
            {renderContent(result.content)}
          </div>

          <div style={{ padding: '10px 14px', background: '#fff8e1', borderRadius: '8px', border: '1px solid #ffe082', fontSize: '12px', color: '#795548' }}>
            ⚠️ 본 분석은 AI 및 공개 데이터 기반 참고 자료입니다. 투자 결정 전 반드시 추가 검토가 필요합니다.
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9aa0a6' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏢</div>
          <div style={{ fontSize: '14px', marginBottom: '6px' }}>기업명 또는 종목코드를 입력하세요</div>
          <div style={{ fontSize: '12px', color: '#b0b8c1' }}>예시: 삼성전자, 005930, AAPL, TSLA, 카카오</div>
        </div>
      )}
    </div>
  );
};

export default CompanyAnalysisView;
