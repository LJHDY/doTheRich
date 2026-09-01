// ─── AI 재무 분석 리포트 뷰 ──────────────────────────────────────────────────
// BudgetPage의 AI 탭에서 렌더링
// 서브탭: AI 재무분석(Gemini) / 시장 리포트 / 우량주 스크리닝 / 통합 투자 의견 / 기업 분석
import React, { useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  getFinancialReports,
  generateFinancialReport,
  FinancialReport as FinancialReportType,
} from '../../services/api';
import MarketReportView from './MarketReportView';
import ScreeningReportView from './ScreeningReportView';
import IntegratedReportView from './IntegratedReportView';
import CompanyAnalysisView from './CompanyAnalysisView';

const AIReportView: React.FC = () => {
  const isMobile = useIsMobile();
  // 서브탭: AI 재무분석 / 시장 리포트 / 우량주 스크리닝 / 통합 투자 의견 / 기업 분석
  const [aiSubTab, setAiSubTab] = useState<'financial' | 'market' | 'screening' | 'integrated' | 'company'>('financial');
  // 스크리닝·시장 리포트에서 종목 클릭 시 기업 분석 탭으로 이동
  const [companyQuery, setCompanyQuery] = useState('');

  const handleCompanyClick = (query: string) => {
    setCompanyQuery(query);
    setAiSubTab('company');
  };

  const [reports, setReports] = useState<FinancialReportType[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  // 분석 기간 선택: false=직전 3개월(기본) / true=이번달 포함
  const [includeCurrentMonth, setIncludeCurrentMonth] = useState(false);

  // 리포트 목록 불러오기
  const load = async () => {
    setLoading(true);
    try {
      const data = await getFinancialReports();
      setReports(data);
      if (data.length > 0 && selectedId === null) setSelectedId(data[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // AI 분석 생성 요청 → 5초 간격 폴링으로 완료 감지 (새 id 등장 기준)
  const handleGenerate = async () => {
    setGenerating(true);
    setToast('분석 요청 중…');
    try {
      await generateFinancialReport(undefined, includeCurrentMonth);
      setToast('Gemini가 분석 중입니다. 잠시 후 자동으로 업데이트됩니다.');
      const prevTopId = reports.length > 0 ? reports[0].id : null;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const data = await getFinancialReports();
        const isNew = data.length > 0 && data[0].id !== prevTopId;
        if (isNew || tries >= 36) {
          clearInterval(poll);
          setReports(data);
          if (data.length > 0) setSelectedId(data[0].id);
          setGenerating(false);
          setToast(isNew ? '✅ 분석 완료!' : '⚠️ 분석 시간이 초과되었습니다. 잠시 후 새로고침해주세요.');
          setTimeout(() => setToast(''), 4000);
        }
      }, 5000);
    } catch {
      setGenerating(false);
      setToast('❌ 요청에 실패했습니다.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  // 마크다운 → 간단한 JSX 변환 (굵기·줄바꿈·헤더만 처리)
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
        // 인라인 **bold** 처리
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
      // 일반 텍스트 — 인라인 **bold** 처리
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

  const selected = reports.find(r => r.id === selectedId);

  const formatMonth = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`;

  // DB가 KST naive datetime 반환 → suffix 없을 때 +09:00 명시해 이중 변환 방지
  const formatKST = (iso: string | null) => {
    if (!iso) return '';
    const s = /Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + '+09:00';
    return new Date(s).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 드롭다운 옵션 레이블: "2025년 8월 (8월 13일 오후 03:22)"
  const formatOptionLabel = (r: FinancialReportType) =>
    `${formatMonth(r.reportMonth)} · ${formatKST(r.createdAt)}`;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 40px' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>

        {/* ── 서브탭 — fit-content 래퍼로 탭 그룹을 컴팩트하게 유지 */}
        <div style={{ overflowX: 'auto', marginBottom: '18px' }}>
          <div style={{ display: 'inline-flex', border: '1px solid #dadce0', borderRadius: '10px', overflow: 'hidden' }}>
            {([['financial', '🤖 AI 재무분석'], ['market', '📈 시장 리포트'], ['screening', '📋 우량주 스크리닝'], ['integrated', '🔗 통합 투자 의견'], ['company', '🔍 기업 분석']] as const).map(([tab, label], idx, arr) => (
              <button
                key={tab}
                onClick={() => setAiSubTab(tab)}
                style={{
                  padding: '8px 14px', border: 'none', borderRight: idx < arr.length - 1 ? '1px solid #dadce0' : 'none',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  fontSize: '13px', fontWeight: aiSubTab === tab ? 700 : 400,
                  background: aiSubTab === tab ? '#89CFF0' : '#fff',
                  color: aiSubTab === tab ? '#fff' : '#5f6368',
                }}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* ── 시장 리포트 탭 */}
        {aiSubTab === 'market' && <MarketReportView onCompanyClick={handleCompanyClick} />}

        {/* ── 우량주 스크리닝 탭 */}
        {aiSubTab === 'screening' && <ScreeningReportView onCompanyClick={handleCompanyClick} />}

        {/* ── 통합 투자 의견 탭 */}
        {aiSubTab === 'integrated' && <IntegratedReportView />}

        {/* ── 기업 분석 탭 */}
        {aiSubTab === 'company' && <CompanyAnalysisView initialQuery={companyQuery} onQueryConsumed={() => setCompanyQuery('')} />}

        {/* ── AI 재무분석 탭 */}
        {aiSubTab === 'financial' && <>

        {/* ── 컨트롤 바 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {/* 리포트 선택 — 요청 건별로 표시 */}
          {reports.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ fontSize: '10px', color: '#9aa0a6' }}>매월 25일 오전 8시 자동 생성</span>
              <select
                value={selectedId ?? ''}
                onChange={e => setSelectedId(Number(e.target.value))}
                style={{ padding: '5px 10px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '8px', background: '#fff', color: '#344054', maxWidth: isMobile ? '200px' : '320px' }}
              >
                {reports.map(r => (
                  <option key={r.id} value={r.id}>{formatOptionLabel(r)}</option>
                ))}
              </select>
            </div>
          )}
          {/* 분석 기간 토글 */}
          <div style={{ display: 'flex', border: '1px solid #dadce0', borderRadius: '8px', overflow: 'hidden', fontSize: '12px' }}>
            {([false, true] as const).map(val => (
              <button
                key={String(val)}
                onClick={() => setIncludeCurrentMonth(val)}
                style={{
                  padding: '5px 12px', border: 'none', cursor: 'pointer', fontWeight: includeCurrentMonth === val ? 700 : 400,
                  background: includeCurrentMonth === val ? '#89CFF0' : '#fff',
                  color: includeCurrentMonth === val ? '#fff' : '#5f6368',
                }}
              >
                {val ? '이번달 포함' : '직전 3개월'}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              marginLeft: 'auto', padding: '6px 16px', fontSize: '13px', fontWeight: 600,
              border: 'none', borderRadius: '8px', cursor: generating ? 'default' : 'pointer',
              background: generating ? '#b0c4de' : '#89CFF0', color: '#fff',
            }}
          >
            {generating ? '분석 중…' : '✨ 지금 분석'}
          </button>
          <button onClick={load} style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '8px', background: '#fff', cursor: 'pointer', color: '#5f6368' }}>↺</button>
        </div>

        {/* ── toast */}
        {toast && (
          <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', padding: '10px 16px', marginBottom: '14px', fontSize: '13px', color: '#1b5e20' }}>
            {toast}
          </div>
        )}

        {/* ── 본문 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6' }}>불러오는 중…</div>
        ) : reports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6', fontSize: '14px' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🤖</div>
            <div>아직 분석 리포트가 없어요.</div>
            <div style={{ marginTop: '8px', fontSize: '12px' }}>위의 <strong>✨ 지금 분석</strong> 버튼을 눌러 첫 번째 리포트를 생성해보세요!</div>
            <div style={{ marginTop: '6px', fontSize: '12px' }}>매달 25일 오전 8시에 자동으로 생성됩니다.</div>
          </div>
        ) : selected ? (
          <div style={{ background: '#fff', borderRadius: '12px', padding: isMobile ? '16px' : '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e0f0ff' }}>
            {/* 리포트 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #e0f0ff' }}>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c' }}>{formatMonth(selected.reportMonth)} 재무 분석</span>
                {selected.createdAt && (
                  <span style={{ fontSize: '11px', color: '#9aa0a6', marginLeft: '10px' }}>
                    {formatKST(selected.createdAt)} 생성
                  </span>
                )}
              </div>
            </div>
            {/* 리포트 본문 */}
            <div>{renderContent(selected.content)}</div>
          </div>
        ) : null}

        </> /* aiSubTab === 'financial' */}

      </div>
    </div>
  );
};

export default AIReportView;
