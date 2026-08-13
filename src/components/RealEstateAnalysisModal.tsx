import React, { useState } from 'react';

import { analyzeRealEstate } from '../services/api';
import { ApartmentComplex } from '../types';

interface Props {
  complexes: ApartmentComplex[];  // 비교 중인 단지 목록 (2~3개)
  onClose: () => void;
}

// 마크다운 → JSX (financial_report_service와 동일 패턴)
function renderMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, i) => {
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
    if (line.startsWith('#### ')) {
      return (
        <h4 key={i} style={{ fontSize: '13px', fontWeight: 700, color: '#344054', margin: '10px 0 4px' }}>
          {line.slice(5)}
        </h4>
      );
    }
    if (line.startsWith('---')) {
      return <hr key={i} style={{ border: 'none', borderTop: '1px solid #e8eaed', margin: '16px 0' }} />;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
          <span style={{ color: '#89CFF0', flexShrink: 0 }}>•</span>
          <span>{inlineBold(line.slice(2))}</span>
        </div>
      );
    }
    if (/^\d+\. /.test(line)) {
      return (
        <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
          <span style={{ color: '#4BAAD4', flexShrink: 0, fontWeight: 600 }}>{line.match(/^\d+/)![0]}.</span>
          <span>{inlineBold(line.replace(/^\d+\. /, ''))}</span>
        </div>
      );
    }
    if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />;
    // 표(|로 시작) 그대로 pre 처리
    if (line.startsWith('|')) {
      return (
        <div key={i} style={{ fontFamily: 'monospace', fontSize: '12px', color: '#444', margin: '1px 0', overflowX: 'auto' }}>
          {line}
        </div>
      );
    }
    return (
      <p key={i} style={{ fontSize: '13px', color: '#444', margin: '3px 0', lineHeight: '1.7' }}>
        {inlineBold(line)}
      </p>
    );
  });
}

function inlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} style={{ color: '#1a3a5c' }}>{p.slice(2, -2)}</strong>
          : p
      )}
    </>
  );
}

const RealEstateAnalysisModal: React.FC<Props> = ({ complexes, onClose }) => {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await analyzeRealEstate(complexes.map(c => c.id));
      setContent(result);
    } catch {
      setError('분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    // 딤 배경
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        overflowY: 'auto', padding: '40px 16px',
      }}
    >
      {/* 모달 본체 */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '820px',
          background: '#fff', borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          overflow: 'hidden', flexShrink: 0,
        }}
      >
        {/* 헤더 */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #e0f0ff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #f0f8fd 0%, #fff 100%)',
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c' }}>
              🤖 AI 부동산 투자 분석
            </div>
            <div style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '3px' }}>
              {complexes.map(c => c.complexName).join(' vs ')}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6', padding: '4px 8px' }}
          >×</button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '24px' }}>
          {!content && !loading && (
            /* 분석 시작 화면 */
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a3a5c', marginBottom: '8px' }}>
                부동산 투자 AI 분석을 시작합니다
              </div>
              <div style={{ fontSize: '13px', color: '#9aa0a6', marginBottom: '24px', lineHeight: 1.6 }}>
                입지, 가격, 학군, 인프라, 전고점/전저점 대비 현재가,<br />
                미래 투자 가치를 종합 분석합니다. (약 20~40초 소요)
              </div>
              {/* 단지 목록 */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '28px' }}>
                {complexes.map(c => (
                  <div key={c.id} style={{
                    padding: '8px 16px', borderRadius: '20px',
                    background: '#e0f0ff', color: '#1a3a5c',
                    fontSize: '13px', fontWeight: 600,
                  }}>
                    📍 {c.complexName}
                  </div>
                ))}
              </div>
              <button
                onClick={handleAnalyze}
                style={{
                  padding: '12px 32px', fontSize: '14px', fontWeight: 700,
                  background: '#89CFF0', color: '#fff',
                  border: 'none', borderRadius: '12px', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(137,207,240,0.4)',
                }}
              >
                ✨ 지금 분석하기
              </button>
              <div style={{ fontSize: '11px', color: '#bbb', marginTop: '12px' }}>
                * Gemini AI 분석 결과는 투자 참고용이며, 전문 금융 조언을 대체하지 않습니다.
              </div>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>⚙️</div>
              <div style={{ fontSize: '14px', color: '#344054', fontWeight: 600 }}>Gemini가 분석 중입니다…</div>
              <div style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '8px' }}>
                {complexes.map(c => c.complexName).join(' vs ')} 데이터를 검토하고 있어요
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: '#fde8e8', border: '1px solid #e88', borderRadius: '8px', padding: '12px 16px', color: '#c62828', fontSize: '13px', marginBottom: '16px' }}>
              {error}
              <button onClick={handleAnalyze} style={{ marginLeft: '12px', padding: '4px 12px', fontSize: '12px', border: '1px solid #c62828', borderRadius: '6px', background: 'none', cursor: 'pointer', color: '#c62828' }}>
                다시 시도
              </button>
            </div>
          )}

          {content && (
            <div>
              {/* 재분석 버튼 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  style={{
                    padding: '6px 16px', fontSize: '12px', fontWeight: 600,
                    background: '#fff', border: '1px solid #89CFF0',
                    borderRadius: '8px', cursor: 'pointer', color: '#4BAAD4',
                  }}
                >
                  🔄 재분석
                </button>
              </div>
              {/* 분석 결과 */}
              <div style={{ lineHeight: 1.7 }}>
                {renderMarkdown(content)}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default RealEstateAnalysisModal;
