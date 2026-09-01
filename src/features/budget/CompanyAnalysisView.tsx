// ─── 기업 투자 분석 뷰 ────────────────────────────────────────────────────────
// 기업명 또는 종목코드 입력 → Gemini + yfinance/DART 기반 투자 분석 대시보드
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
  PricePoint,
} from '../../services/api';

// ── 포맷 유틸 ──────────────────────────────────────────────────────────────────

/** 금액(원) → "X조" / "X억" / "X만" 형식 */
const fmtAmount = (v: number | null): string => {
  if (v === null || v === undefined) return '-';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}조`;
  if (abs >= 100_000_000) return `${sign}${Math.round(abs / 100_000_000)}억`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000)}만`;
  return `${sign}${abs.toLocaleString()}`;
};

/** 숫자 → "X.X%" (null이면 '-') */
const fmtPct = (v: number | null): string => (v === null || v === undefined) ? '-' : `${v.toFixed(1)}%`;

/** 수치 색상: positive(초록) / negative(빨강) / null(회색). inverse=true 이면 반전(부채비율 등) */
const numColor = (v: number | null, inverse = false): string => {
  if (v === null || v === undefined) return '#666';
  const positive = inverse ? v < 30 : v > 0;
  return positive ? '#1e7e34' : '#c0392b';
};

/** 억 단위 Y축 포맷 (Recharts용) */
const yAxisBillion = (v: number) => {
  if (Math.abs(v) >= 1_000_000_000_000) return `${(v / 1_000_000_000_000).toFixed(1)}조`;
  if (Math.abs(v) >= 100_000_000) return `${Math.round(v / 100_000_000)}억`;
  return String(v);
};

/** 주가 Y축 포맷 */
const yAxisPrice = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(0)}억`;
  if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
  return v.toLocaleString();
};

/** 날짜 문자열 'YYYY-MM-01' → '20YY' 연도만 추출 */
const dateToYear = (d: string): string => d.slice(0, 4);

// ── 마크다운 렌더러 ─────────────────────────────────────────────────────────────

const renderContent = (text: string) => {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('## ')) {
      return (
        <h2 key={i} style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c', margin: '20px 0 8px', borderBottom: '2px solid #e0f0ff', paddingBottom: '4px' }}>
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith('### ')) {
      return (
        <h3 key={i} style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: '14px 0 6px' }}>
          {line.slice(4)}
        </h3>
      );
    }
    if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
      return (
        <p key={i} style={{ fontWeight: 700, color: '#1a3a5c', margin: '8px 0 4px', fontSize: '13px' }}>
          {line.slice(2, -2)}
        </p>
      );
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const parts = line.slice(2).split(/(\*\*[^*]+\*\*)/g);
      return (
        <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
          <span style={{ color: '#89CFF0', flexShrink: 0 }}>•</span>
          <span>
            {parts.map((p, j) =>
              p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p
            )}
          </span>
        </div>
      );
    }
    if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} style={{ fontSize: '13px', color: '#444', margin: '3px 0', lineHeight: '1.6' }}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p
        )}
      </p>
    );
  });
};

// ── 재무 테이블 ────────────────────────────────────────────────────────────────

interface FinancialTableProps {
  rows: AnnualFinancial[];
}

const FinancialTable: React.FC<FinancialTableProps> = ({ rows }) => {
  if (rows.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#9aa0a6', fontSize: '13px' }}>
        재무 데이터 없음
      </div>
    );
  }

  // 연도별 컬럼 (최신순 정렬은 백엔드에서 이미 처리됨)
  const years = rows.map(r => r.year);

  const tableRows: { label: string; key: keyof AnnualFinancial; fmt: (v: number | null) => string; color?: (v: number | null) => string }[] = [
    { label: '매출', key: 'revenue', fmt: fmtAmount },
    { label: '영업이익', key: 'opIncome', fmt: fmtAmount, color: v => numColor(v) },
    { label: '순이익', key: 'netIncome', fmt: fmtAmount, color: v => numColor(v) },
    { label: 'ROE', key: 'roe', fmt: fmtPct, color: v => numColor(v) },
    { label: '영업이익률', key: 'opMargin', fmt: fmtPct, color: v => numColor(v) },
    { label: '부채비율', key: 'debtRatio', fmt: fmtPct, color: v => numColor(v, true) },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#f0f8fd' }}>
            <th style={{ padding: '8px 10px', textAlign: 'left', color: '#1a3a5c', fontWeight: 700, borderBottom: '1px solid #d0e8f5', minWidth: '80px' }}>
              항목
            </th>
            {years.map(y => (
              <th key={y} style={{ padding: '8px 10px', textAlign: 'right', color: '#1a3a5c', fontWeight: 700, borderBottom: '1px solid #d0e8f5', minWidth: '70px' }}>
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map(({ label, key, fmt, color }) => (
            <tr key={label} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '7px 10px', color: '#344054', fontWeight: 600, background: '#fafcff' }}>
                {label}
              </td>
              {rows.map(r => {
                const v = r[key] as number | null;
                return (
                  <td key={r.year} style={{ padding: '7px 10px', textAlign: 'right', color: color ? color(v) : '#344054', fontWeight: 500 }}>
                    {fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── 주가 차트 ──────────────────────────────────────────────────────────────────

interface PriceChartProps {
  data: PricePoint[];
}

const PriceChart: React.FC<PriceChartProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9aa0a6', fontSize: '13px' }}>
        주가 데이터 없음
      </div>
    );
  }

  // x축은 연도만 표시 (중복 제거: 같은 연도 첫 포인트만)
  const displayedYears = new Set<string>();
  const tickFormatter = (d: string) => {
    const y = dateToYear(d);
    if (displayedYears.has(y)) return '';
    displayedYears.add(y);
    return y;
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#89CFF0" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#89CFF0" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tickFormatter={tickFormatter} tick={{ fontSize: 11, fill: '#666' }} />
        <YAxis tickFormatter={yAxisPrice} tick={{ fontSize: 11, fill: '#666' }} width={60} />
        <Tooltip
          formatter={(v: number) => [`₩${v.toLocaleString()}`, '종가']}
          labelFormatter={(l: string) => l.slice(0, 7)}
          contentStyle={{ fontSize: '12px', borderRadius: '6px', border: '1px solid #e0e4e8' }}
        />
        <Area type="monotone" dataKey="close" stroke="#4BAAD4" strokeWidth={2} fill="url(#priceGradient)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// ── 수익성 추이 차트 ───────────────────────────────────────────────────────────

interface ProfitChartProps {
  data: AnnualFinancial[];
}

const ProfitChart: React.FC<ProfitChartProps> = ({ data }) => {
  // 최신 → 과거 정렬이므로 차트 표시는 오래된 것부터
  const sorted = [...data].reverse();

  if (sorted.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9aa0a6', fontSize: '13px' }}>
        수익성 데이터 없음
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={sorted} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#666' }} />
        <YAxis unit="%" tick={{ fontSize: 11, fill: '#666' }} width={42} />
        <Tooltip
          formatter={(v: number, name: string) => [`${v?.toFixed(1)}%`, name]}
          contentStyle={{ fontSize: '12px', borderRadius: '6px', border: '1px solid #e0e4e8' }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
        <Line type="monotone" dataKey="roe" name="ROE" stroke="#1565c0" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="opMargin" name="영업이익률" stroke="#2e7d32" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="netMargin" name="순이익률" stroke="#e65100" strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

interface CompanyAnalysisViewProps {
  initialQuery?: string;        // 스크리닝/시장 리포트에서 클릭 시 주입
  onQueryConsumed?: () => void; // 쿼리 소비 완료 콜백 (부모 상태 초기화용)
}

const CompanyAnalysisView: React.FC<CompanyAnalysisViewProps> = ({ initialQuery, onQueryConsumed }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompanyAnalysisResult | null>(null);
  const [error, setError] = useState('');
  // DB에서 불러온 이전 분석 이력
  const [savedReports, setSavedReports] = useState<CompanyAnalysisResult[]>([]);

  // 마운트 시 저장된 분석 목록 로드
  useEffect(() => {
    getCompanyAnalysisReports().then(setSavedReports).catch(() => {});
  }, []);

  // 외부(스크리닝·시장 리포트)에서 종목 클릭 시 자동 분석
  useEffect(() => {
    if (!initialQuery) return;
    setQuery(initialQuery);
    onQueryConsumed?.();
    // 약간의 지연 후 실행 (렌더링 완료 보장)
    const timer = setTimeout(() => { handleAnalyzeWith(initialQuery); }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const handleDeleteReport = async (r: CompanyAnalysisResult, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!r.id || !window.confirm(`"${r.companyName}" 분석 리포트를 삭제할까요?`)) return;
    await deleteCompanyAnalysisReport(r.id).catch(() => {});
    setSavedReports(prev => prev.filter(p => p.id !== r.id));
    if (result?.id === r.id) setResult(null);
  };

  const handleAnalyzeWith = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await analyzeCompany(trimmed);
      setResult(res);
      setSavedReports(prev => {
        const filtered = prev.filter(r => r.companyName !== res.companyName);
        return [res, ...filtered];
      });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || '분석 중 오류가 발생했습니다.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await analyzeCompany(trimmed);
      setResult(res);
      // 저장 목록 갱신 (upsert 결과 반영)
      setSavedReports(prev => {
        const filtered = prev.filter(r => r.companyName !== res.companyName);
        return [res, ...filtered];
      });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || '분석 중 오류가 발생했습니다.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fmtNum = (v: number | null, digits = 1) =>
    v == null ? '-' : v.toLocaleString('ko-KR', { maximumFractionDigits: digits });

  // market='KR'이면 원화 표시, 아니면 달러 표시
  const fmtCap = (cap: number | null, market: string) => {
    if (cap == null) return '-';
    if (market === 'KR') {
      const uk = cap / 1e8;
      return uk >= 1 ? `₩${uk.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}억` : `₩${(cap / 1e6).toFixed(0)}백만`;
    }
    const b = cap / 1e9;
    return b >= 1 ? `$${b.toFixed(1)}B` : `$${(cap / 1e6).toFixed(0)}M`;
  };

  return (
    <div>
      {/* ── 검색창 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleAnalyze()}
          placeholder="기업명 또는 티커 입력 (예: 삼성전자, 005930, AAPL)"
          style={{
            flex: 1, padding: '10px 14px', borderRadius: '8px',
            border: '1px solid #dadce0', fontSize: '14px', outline: 'none',
          }}
        />
        <button
          onClick={handleAnalyze}
          disabled={loading || !query.trim()}
          style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            background: loading ? '#b0cfdf' : '#89CFF0', color: '#fff',
            fontWeight: 700, fontSize: '14px', cursor: loading ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? '분석 중…' : '🔍 분석'}
        </button>
      </div>

      {/* ── 저장된 분석 이력 탭 (DB 기반) */}
      {savedReports.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {savedReports.map((r, i) => {
            const isActive = result?.companyName === r.companyName;
            const label = r.companyName + (r.ticker ? ` (${r.ticker})` : '');
            return (
              <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0', borderRadius: '20px', border: '1px solid #89CFF0', overflow: 'hidden' }}>
                <button
                  onClick={() => setResult(r)}
                  style={{
                    padding: '4px 8px 4px 10px', fontSize: '12px', border: 'none',
                    background: isActive ? '#89CFF0' : '#fff',
                    color: isActive ? '#fff' : '#1a3a5c',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
                <button
                  onClick={e => handleDeleteReport(r, e)}
                  title="삭제"
                  style={{
                    padding: '4px 7px 4px 4px', fontSize: '11px', border: 'none',
                    background: isActive ? '#89CFF0' : '#fff',
                    color: isActive ? '#fff' : '#888',
                    cursor: 'pointer', lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 에러 메시지 */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '16px' }}>
          ❌ {error}
        </div>
      )}

      {/* ── 로딩 */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#89CFF0', fontSize: '14px' }}>
          <div style={{ marginBottom: '10px', fontSize: '24px' }}>🔍</div>
          Gemini가 분석 중입니다. 잠시만 기다려주세요…
        </div>
      )}

      {/* ── 결과 대시보드 */}
      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* ① 기업 헤더 카드 */}
          <div style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #e0e4e8' }}>
            {/* 회사명 + 배지 행 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#1a3a5c' }}>{result.companyName}</span>
              {result.ticker && (
                <span style={{ fontSize: '13px', color: '#666', background: '#f0f4f8', borderRadius: '6px', padding: '2px 8px' }}>
                  {result.ticker}
                </span>
              )}
              <span style={{
                fontSize: '12px', padding: '2px 8px', borderRadius: '20px', fontWeight: 600,
                background: result.market === 'KR' ? '#e0f0ff' : '#fff0e0',
                color: result.market === 'KR' ? '#1565c0' : '#e65100',
              }}>
                {result.market === 'KR' ? '🇰🇷 국내' : '🇺🇸 해외'}
              </span>
              {result.exchange && (
                <span style={{ fontSize: '11px', color: '#666', background: '#f5f5f5', borderRadius: '4px', padding: '1px 6px' }}>
                  {result.exchange}
                </span>
              )}
              {result.sector && (
                <span style={{ fontSize: '11px', color: '#555', background: '#eef4ff', borderRadius: '4px', padding: '1px 8px' }}>
                  {result.sector}
                </span>
              )}
              {result.fromCache && (
                <span style={{ fontSize: '11px', color: '#9aa0a6', background: '#f5f5f5', borderRadius: '4px', padding: '1px 6px' }}>
                  캐시
                </span>
              )}
            </div>

            {/* 현재가 + 시가총액 */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'baseline', marginBottom: '12px', flexWrap: 'wrap' }}>
              {result.price != null && (
                <span style={{ fontSize: '22px', fontWeight: 700, color: '#1a3a5c' }}>
                  {result.market === 'KR' ? '₩' : '$'}{fmtNum(result.price, 0)}
                </span>
              )}
              {result.marketCap != null && (
                <span style={{ fontSize: '13px', color: '#666' }}>
                  시가총액 {fmtCap(result.marketCap, result.market)}
                </span>
              )}
            </div>

            {/* 핵심 지표 3종 */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {([
                { label: 'PER', value: result.per != null ? `${fmtNum(result.per)}배` : 'N/A' },
                { label: 'PBR', value: result.pbr != null ? `${fmtNum(result.pbr)}배` : 'N/A' },
                { label: 'ROE', value: result.roe != null ? `${fmtNum(result.roe)}%` : 'N/A' },
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label} style={{ background: '#f0f8fd', borderRadius: '8px', padding: '8px 14px', minWidth: '70px' }}>
                  <div style={{ fontSize: '10px', color: '#6b8ba4', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ② 차트 2분할 (주가 + 수익성 추이) — 데이터 있을 때만 */}
          {(result.annualFinancials.length > 0 || result.priceHistory.length > 0) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '14px',
            }}>
              {/* 주가 차트 */}
              <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e0e4e8' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '10px' }}>
                  📈 5년 주가 추이
                </div>
                <PriceChart data={result.priceHistory} />
              </div>

              {/* 수익성 추이 차트 */}
              <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e0e4e8' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '10px' }}>
                  📊 수익성 추이 (%)
                </div>
                <ProfitChart data={result.annualFinancials} />
              </div>
            </div>
          )}

          {/* ③ 재무제표 테이블 — 데이터 있을 때만 */}
          {result.annualFinancials.length > 0 && (
            <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e0e4e8' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '10px' }}>
                📋 재무제표 요약 (단위: 억원 / %)
              </div>
              <FinancialTable rows={result.annualFinancials} />
            </div>
          )}

          {/* ④ Gemini AI 분석 본문 */}
          <div style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #e0e4e8' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', marginBottom: '12px' }}>
              🤖 Gemini 투자 분석
            </div>
            {renderContent(result.content)}
          </div>

          {/* 면책 안내 */}
          <div style={{ padding: '10px 14px', background: '#fff8e1', borderRadius: '8px', border: '1px solid #ffe082', fontSize: '12px', color: '#795548' }}>
            ⚠️ 본 분석은 AI 및 공개 데이터 기반 참고 자료입니다. 투자 결정 전 반드시 추가 검토가 필요합니다.
          </div>
        </div>
      )}

      {/* 초기 안내 */}
      {!result && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9aa0a6' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏢</div>
          <div style={{ fontSize: '14px', marginBottom: '6px' }}>기업명 또는 종목코드를 입력하세요</div>
          <div style={{ fontSize: '12px', color: '#b0b8c1' }}>
            예시: 삼성전자, 005930, AAPL, TSLA, 카카오, NVDA
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyAnalysisView;
