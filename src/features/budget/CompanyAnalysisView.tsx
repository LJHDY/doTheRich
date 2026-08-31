// ─── 기업 투자 분석 뷰 ────────────────────────────────────────────────────────
// 기업명 또는 종목코드 입력 → Gemini + yfinance/pykrx 기반 투자 분석 결과 표시
// AIReportView의 'company' 서브탭에서 렌더링
import React, { useEffect, useState } from 'react';
import { analyzeCompany, getCompanyAnalysisReports, deleteCompanyAnalysisReport } from '../../services/api';
import { CompanyAnalysisResult } from '../../services/api';

const CompanyAnalysisView: React.FC = () => {
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

  const handleDeleteReport = async (r: CompanyAnalysisResult, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!r.id || !window.confirm(`"${r.companyName}" 분석 리포트를 삭제할까요?`)) return;
    await deleteCompanyAnalysisReport(r.id).catch(() => {});
    setSavedReports(prev => prev.filter(p => p.id !== r.id));
    if (result?.id === r.id) setResult(null);
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

  // 마크다운 렌더러 (AIReportView와 동일 패턴)
  const renderContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('## ')) {
        return <h2 key={i} style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c', margin: '20px 0 8px', borderBottom: '2px solid #e0f0ff', paddingBottom: '4px' }}>{line.slice(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={i} style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: '14px 0 6px' }}>{line.slice(4)}</h3>;
      }
      if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
        return <p key={i} style={{ fontWeight: 700, color: '#1a3a5c', margin: '8px 0 4px', fontSize: '13px' }}>{line.slice(2, -2)}</p>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const parts = line.slice(2).split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
            <span style={{ color: '#89CFF0', flexShrink: 0 }}>•</span>
            <span>{parts.map((p, j) => p.startsWith('**') && p.endsWith('**')
              ? <strong key={j}>{p.slice(2, -2)}</strong>
              : p
            )}</span>
          </div>
        );
      }
      if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />;
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} style={{ fontSize: '13px', color: '#444', margin: '3px 0', lineHeight: '1.6' }}>
          {parts.map((p, j) => p.startsWith('**') && p.endsWith('**')
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : p
          )}
        </p>
      );
    });
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

      {/* ── 결과 */}
      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* 기업 메타 카드 */}
          <div style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #e0e4e8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
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
              {result.fromCache && (
                <span style={{ fontSize: '11px', color: '#9aa0a6', background: '#f5f5f5', borderRadius: '4px', padding: '1px 6px' }}>
                  캐시
                </span>
              )}
            </div>

            {/* 주요 지표 그리드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
              {([
                { label: '현재가', value: result.price != null ? `${result.market === 'KR' ? '₩' : '$'}${fmtNum(result.price, 0)}` : '-' },
                { label: '시가총액', value: fmtCap(result.marketCap, result.market) },
                { label: 'PBR', value: result.pbr != null ? `${fmtNum(result.pbr)}배` : '-' },
                { label: 'PER', value: result.per != null ? `${fmtNum(result.per)}배` : '-' },
                { label: 'EPS', value: result.eps != null ? `${result.market === 'KR' ? '₩' : '$'}${fmtNum(result.eps, result.market === 'KR' ? 0 : 2)}` : '-' },
                { label: 'ROE', value: result.roe != null ? `${fmtNum(result.roe)}%` : '-' },
                { label: '거래소', value: result.exchange || '-' },
                { label: '섹터', value: result.sector || '-' },
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label} style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '10px', color: '#9aa0a6', marginBottom: '3px' }}>{label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#344054' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Gemini 분석 본문 */}
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
