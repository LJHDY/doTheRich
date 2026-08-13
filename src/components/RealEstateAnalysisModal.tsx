import React, { useEffect, useState } from 'react';

import { analyzeRealEstate, ComplexAnalysis, getComplexAnalyses } from '../services/api';
import { ApartmentComplex } from '../types';

interface Props {
  complexes: ApartmentComplex[];  // 현재 비교 중인 단지 목록 (2~3개)
  onClose: () => void;
}

// ISO UTC 문자열 → 한국 시간 표시
function formatKST(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 인라인 **bold** 파싱
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

// 마크다운 표 파싱 → <table> JSX
function renderTable(tableLines: string[], key: number): React.ReactNode {
  const parseRow = (line: string) =>
    line.split('|').slice(1, -1).map(c => c.trim());

  const isSeparator = (cells: string[]) =>
    cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));

  const getAlign = (cell: string): React.CSSProperties['textAlign'] => {
    if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
    if (cell.endsWith(':')) return 'right';
    return 'left';
  };

  const rows = tableLines.map(parseRow);
  const sepIdx = rows.findIndex(isSeparator);
  const headerRows = sepIdx > 0 ? rows.slice(0, sepIdx) : [];
  const aligns = sepIdx >= 0 ? rows[sepIdx].map(getAlign) : [];
  const bodyRows = rows.slice(sepIdx >= 0 ? sepIdx + 1 : 0);

  const cellStyle = (ci: number, isHead: boolean): React.CSSProperties => ({
    border: '1px solid #d0e8f8',
    padding: '7px 12px',
    textAlign: aligns[ci] ?? 'left',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    background: isHead ? '#daf0fb' : undefined,
    color: isHead ? '#1a3a5c' : '#344054',
    fontWeight: isHead ? 700 : undefined,
  });

  return (
    <div key={key} style={{ overflowX: 'auto', margin: '12px 0' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        {headerRows.length > 0 && (
          <thead>
            {headerRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <th key={ci} style={cellStyle(ci, true)}>{inlineBold(cell)}</th>
                ))}
              </tr>
            ))}
          </thead>
        )}
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f5fbff' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={cellStyle(ci, false)}>{inlineBold(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 마크다운 → JSX (표는 연속된 | 줄을 묶어서 <table>로 렌더링)
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 연속된 | 줄 → 표로 묶음
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      result.push(renderTable(tableLines, result.length));
      continue;
    }

    if (line.startsWith('## ')) {
      result.push(<h2 key={i} style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c', margin: '20px 0 8px', borderBottom: '2px solid #e0f0ff', paddingBottom: '4px' }}>{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      result.push(<h3 key={i} style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: '14px 0 6px' }}>{line.slice(4)}</h3>);
    } else if (line.startsWith('#### ')) {
      result.push(<h4 key={i} style={{ fontSize: '13px', fontWeight: 700, color: '#344054', margin: '10px 0 4px' }}>{line.slice(5)}</h4>);
    } else if (line.startsWith('---')) {
      result.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid #e8eaed', margin: '16px 0' }} />);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
          <span style={{ color: '#89CFF0', flexShrink: 0 }}>•</span>
          <span>{inlineBold(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\. /.test(line)) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
          <span style={{ color: '#4BAAD4', flexShrink: 0, fontWeight: 600 }}>{line.match(/^\d+/)![0]}.</span>
          <span>{inlineBold(line.replace(/^\d+\. /, ''))}</span>
        </div>
      );
    } else if (line.trim() === '') {
      result.push(<div key={i} style={{ height: '6px' }} />);
    } else {
      result.push(
        <p key={i} style={{ fontSize: '13px', color: '#444', margin: '3px 0', lineHeight: '1.7' }}>
          {inlineBold(line)}
        </p>
      );
    }
    i++;
  }

  return result;
}

const RealEstateAnalysisModal: React.FC<Props> = ({ complexes, onClose }) => {
  const [histories, setHistories] = useState<ComplexAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  // 모달 열릴 때 이력 로드
  useEffect(() => {
    getComplexAnalyses().then(data => {
      setHistories(data);
      // 현재 비교 단지와 동일한 최신 이력이 있으면 자동 선택
      if (data.length > 0) setSelectedId(data[0].id);
    }).catch(() => {});
  }, []);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const result = await analyzeRealEstate(complexes.map(c => c.id));
      setHistories(prev => [result, ...prev]);
      setSelectedId(result.id);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || '';
      setError(`분석 중 오류가 발생했습니다.${detail ? ` (${detail})` : ''}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const selected = histories.find(h => h.id === selectedId);

  // 드롭다운 레이블: "단지A vs 단지B · 8월 13일 오후 03:22"
  const historyLabel = (h: ComplexAnalysis) =>
    `${h.complexNames.join(' vs ')} · ${formatKST(h.createdAt)}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        overflowY: 'auto', padding: '40px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '840px',
          background: '#fff', borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          overflow: 'hidden', flexShrink: 0,
        }}
      >
        {/* 헤더 */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #e0f0ff',
          background: 'linear-gradient(135deg, #f0f8fd 0%, #fff 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c' }}>🤖 AI 부동산 투자 분석</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6', padding: '4px 8px' }}>×</button>
          </div>

          {/* 컨트롤 바: 이력 선택 + 새 분석 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* 현재 비교 단지 칩 */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {complexes.map(c => (
                <span key={c.id} style={{
                  padding: '4px 10px', borderRadius: '12px',
                  background: '#e0f0ff', color: '#1a3a5c',
                  fontSize: '12px', fontWeight: 600,
                }}>
                  📍 {c.complexName}
                </span>
              ))}
            </div>

            {/* 이력 드롭다운 */}
            {histories.length > 0 && (
              <select
                value={selectedId ?? ''}
                onChange={e => setSelectedId(Number(e.target.value))}
                style={{
                  padding: '5px 10px', fontSize: '12px',
                  border: '1px solid #dadce0', borderRadius: '8px',
                  background: '#fff', color: '#344054',
                  maxWidth: '320px', marginLeft: 'auto',
                }}
              >
                {histories.map(h => (
                  <option key={h.id} value={h.id}>{historyLabel(h)}</option>
                ))}
              </select>
            )}

            {/* 분석 버튼 */}
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              style={{
                padding: '7px 18px', fontSize: '13px', fontWeight: 600,
                border: 'none', borderRadius: '10px', cursor: analyzing ? 'default' : 'pointer',
                background: analyzing ? '#b0c4de' : '#89CFF0', color: '#fff',
                marginLeft: histories.length > 0 ? undefined : 'auto',
                flexShrink: 0,
              }}
            >
              {analyzing ? '⚙️ 분석 중…' : '✨ 지금 분석'}
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div style={{ padding: '24px' }}>
          {error && (
            <div style={{ background: '#fde8e8', border: '1px solid #e88', borderRadius: '8px', padding: '12px 16px', color: '#c62828', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {analyzing && (
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚙️</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#344054' }}>Gemini가 분석 중입니다…</div>
              <div style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '8px' }}>약 20~40초 소요됩니다</div>
            </div>
          )}

          {!analyzing && !selected && histories.length === 0 && (
            /* 첫 분석 안내 */
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a3a5c', marginBottom: '8px' }}>
                아직 분석 이력이 없어요
              </div>
              <div style={{ fontSize: '13px', color: '#9aa0a6', lineHeight: 1.6 }}>
                위의 <strong>✨ 지금 분석</strong> 버튼을 눌러<br />
                입지·가격·투자 가치를 AI로 비교해보세요.
              </div>
              <div style={{ fontSize: '11px', color: '#bbb', marginTop: '20px' }}>
                * Gemini AI 분석 결과는 투자 참고용이며, 전문 금융 조언을 대체하지 않습니다.
              </div>
            </div>
          )}

          {!analyzing && selected && (
            <div>
              {/* 분석 정보 헤더 */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #e0f0ff',
              }}>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c' }}>
                    {selected.complexNames.join(' vs ')}
                  </span>
                  {selected.createdAt && (
                    <span style={{ fontSize: '11px', color: '#9aa0a6', marginLeft: '10px' }}>
                      {formatKST(selected.createdAt)} 분석
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: '#bbb' }}>
                  #{selected.id}
                </span>
              </div>
              {/* 분석 내용 */}
              <div style={{ lineHeight: 1.7 }}>
                {renderMarkdown(selected.content)}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default RealEstateAnalysisModal;
