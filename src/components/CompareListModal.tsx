import React, { useState, useEffect } from 'react';
import { ApartmentComplex, Comparison, formatPrice } from '../types';
import { getComparisons, getMostSelectedComplex } from '../services/api';

interface CompareListModalProps {
  complexes: ApartmentComplex[];
  priceRanges: string[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onClose: () => void;
  compareMode: 'normal' | 'evaluation';
  onModeChange: (mode: 'normal' | 'evaluation') => void;
  // 저장된 비교평가 선택 시 두 단지를 비교평가 모드로 바로 진입
  onSelectComparison: (complexId1: number, complexId2: number) => void;
  // AI 분석 이력 모달 열기
  onOpenAiHistory: () => void;
  top?: number;
}

const getMatchingAreaTypes = (complex: ApartmentComplex, range: string): string[] => {
  if (!range) return [];
  const atMap = complex.areaTypePriceRanges;
  if (atMap) return Object.entries(atMap).filter(([, r]) => r === range).map(([at]) => at);
  return complex.areaTypes ?? [];
};

const getPriceForAreaType = (complex: ApartmentComplex, at: string | null): number | undefined => {
  if (!at) return complex.price;
  return complex.priceItems?.find(p => p.areaType === at)?.price ?? complex.price;
};

const CompareListModal: React.FC<CompareListModalProps> = ({
  complexes, priceRanges, selectedIds, onToggle, onClose,
  compareMode, onModeChange, onSelectComparison, onOpenAiHistory, top = 56,
}) => {
  const [selectedRange, setSelectedRange] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 조회 모드 — 저장된 비교평가 목록 표시
  const [showComparisons, setShowComparisons] = useState(false);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [loadingComparisons, setLoadingComparisons] = useState(false);
  const [mostSelected, setMostSelected] = useState<{ complexId: number; complexName: string; selectedCount: number } | null>(null);

  // 조회 버튼 클릭 시 비교평가 목록 + 최다 선정 단지 동시 로드
  useEffect(() => {
    if (!showComparisons) return;
    setLoadingComparisons(true);
    Promise.all([
      getComparisons(),
      getMostSelectedComplex(),
    ])
      .then(([list, ms]) => { setComparisons(list); setMostSelected(ms); })
      .catch(() => { setComparisons([]); setMostSelected(null); })
      .finally(() => setLoadingComparisons(false));
  }, [showComparisons]);

  const filtered = complexes.filter(c => {
    const q = searchQuery.trim().toLowerCase();
    if (q && !c.complexName.toLowerCase().includes(q)) return false;
    if (favoritesOnly && !c.isFavorite) return false;
    if (selectedRange) {
      return c.areaTypePriceRanges
        ? Object.values(c.areaTypePriceRanges).includes(selectedRange)
        : c.priceRange === selectedRange;
    }
    return true;
  });

  const sortedRanges = [...priceRanges].sort((a, b) => {
    const na = parseInt(a); const nb = parseInt(b);
    return isNaN(na) || isNaN(nb) ? 0 : na - nb;
  });

  const btnBase: React.CSSProperties = {
    padding: '4px 10px', fontSize: '11px', fontWeight: 700,
    cursor: 'pointer', border: '1px solid', borderRadius: '10px', whiteSpace: 'nowrap',
  };

  return (
    <>
      {/* 투명 백드롭 */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={onClose} />

      <div style={{
        position: 'fixed', top: `${top}px`, left: '50%', transform: 'translateX(-50%)',
        width: '520px', maxWidth: 'calc(100vw - 16px)', maxHeight: '65vh',
        backgroundColor: '#fff', borderRadius: '0 0 12px 12px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
        zIndex: 301, display: 'flex', flexDirection: 'column',
      }}>

        {/* 헤더 — 2줄 */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>

          {/* 1줄: 제목+카운트 / 비교평가·조회·즐겨찾기 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>
              {showComparisons ? '저장된 비교평가' : '비교할 단지 선택'}
            </span>
            {!showComparisons && (
              <span style={{
                fontSize: '11px', fontWeight: 700,
                color: selectedIds.length > 0 ? '#89CFF0' : '#9e9e9e',
                backgroundColor: selectedIds.length > 0 ? '#D4EFFC' : '#f5f5f5',
                padding: '2px 7px', borderRadius: '10px',
              }}>
                {selectedIds.length}/{compareMode === 'evaluation' ? 2 : 3}
              </span>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* 비교평가 토글 */}
              <button
                onClick={() => {
                  setShowComparisons(false);
                  onModeChange(compareMode === 'normal' ? 'evaluation' : 'normal');
                }}
                style={{
                  ...btnBase,
                  borderColor: compareMode === 'evaluation' ? '#7DC8A0' : '#dadce0',
                  backgroundColor: compareMode === 'evaluation' ? '#e6f4ea' : '#fff',
                  color: compareMode === 'evaluation' ? '#7DC8A0' : '#9e9e9e',
                }}
              >
                {compareMode === 'evaluation' ? '✓ 비교평가' : '비교평가'}
              </button>

              {/* 조회 — 저장된 비교평가 목록 토글 */}
              <button
                onClick={() => setShowComparisons(v => !v)}
                style={{
                  ...btnBase,
                  borderColor: showComparisons ? '#89CFF0' : '#dadce0',
                  backgroundColor: showComparisons ? '#D4EFFC' : '#fff',
                  color: showComparisons ? '#89CFF0' : '#9e9e9e',
                }}
              >
                조회
              </button>

              {/* AI 분석 이력 바로 보기 */}
              <button
                onClick={onOpenAiHistory}
                style={{
                  ...btnBase,
                  borderColor: '#89CFF0',
                  backgroundColor: '#f0f8fd',
                  color: '#4BAAD4',
                  fontWeight: 600,
                }}
              >
                🤖 AI 분석
              </button>

              {/* 즐겨찾기 필터 */}
              <button
                onClick={() => setFavoritesOnly(v => !v)}
                style={{
                  ...btnBase,
                  borderColor: favoritesOnly ? '#FFD97D' : '#dadce0',
                  backgroundColor: favoritesOnly ? '#fef9e7' : '#fff',
                  color: favoritesOnly ? '#FFD97D' : '#9e9e9e',
                }}
              >★ 즐겨찾기</button>
            </div>
          </div>

          {/* 2줄: 단지명 검색 + 금액대 셀렉트 (조회 모드일 때는 숨김) */}
          {!showComparisons && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="단지명 검색..."
                style={{
                  flex: 1, fontSize: '12px', padding: '5px 12px',
                  border: '1px solid #dadce0', borderRadius: '14px', outline: 'none', color: '#202124',
                }}
              />
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                <select
                  value={selectedRange}
                  onChange={e => setSelectedRange(e.target.value)}
                  style={{
                    appearance: 'none', WebkitAppearance: 'none',
                    fontSize: '12px', padding: '5px 24px 5px 10px',
                    border: '1px solid #dadce0', borderRadius: '6px', outline: 'none',
                    backgroundColor: selectedRange ? '#D4EFFC' : '#fff',
                    color: selectedRange ? '#89CFF0' : '#5f6368', cursor: 'pointer',
                  }}
                >
                  <option value="">전체 금액대</option>
                  {sortedRanges.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="#9e9e9e" strokeWidth={2.5}
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ position: 'absolute', right: '7px', width: '10px', height: '10px', pointerEvents: 'none' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* 본문 — 조회 모드: 저장된 비교평가 목록 / 선택 모드: 단지 목록 */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {showComparisons ? (
            // 저장된 비교평가 목록
            loadingComparisons ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>로딩 중...</div>
            ) : comparisons.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
                저장된 비교평가가 없습니다.
              </div>
            ) : (
              <>
                {/* 최다 선정 단지 배너 */}
                {mostSelected && (
                  <div style={{
                    margin: '12px 12px 8px',
                    padding: '10px 14px',
                    backgroundColor: '#fffbea',
                    border: '1.5px solid #f9ab00',
                    borderRadius: '10px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '10px', color: '#b07d00', fontWeight: 600, marginBottom: '4px' }}>
                      비교평가 최다 선정
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#b07d00' }}>
                      👑 {mostSelected.complexName} 👑
                    </div>
                    <div style={{ fontSize: '11px', color: '#c49000', marginTop: '3px' }}>
                      총 {mostSelected.selectedCount}회 선정
                    </div>
                  </div>
                )}

                {comparisons.map(c => (
                  <div
                    key={c.id}
                    onClick={() => {
                      onSelectComparison(c.complexId1, c.complexId2);
                      onClose();
                    }}
                    style={{
                      padding: '12px 16px', borderBottom: '1px solid #f5f5f5',
                      cursor: 'pointer', transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
                  >
                    {/* 단지 vs 단지 — 선정 단지에 왕관 표시 */}
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#202124', marginBottom: '4px' }}>
                      {c.selectedComplexId === c.complexId1 && <span style={{ marginRight: '3px' }}>👑</span>}
                      {c.complexName1}
                      <span style={{ color: '#9e9e9e', margin: '0 6px', fontWeight: 400 }}>vs</span>
                      {c.selectedComplexId === c.complexId2 && <span style={{ marginRight: '3px' }}>👑</span>}
                      {c.complexName2}
                    </div>
                    {/* 결론 미리보기 */}
                    {c.conclusion && (
                      <div style={{ fontSize: '11px', color: '#7DC8A0', fontWeight: 600, marginBottom: '2px' }}>
                        → {c.conclusion}
                      </div>
                    )}
                    {/* 가치평가 미리보기 */}
                    {c.valueRating && !c.conclusion && (
                      <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '2px' }}>
                        {c.valueRating}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {c.photos.length > 0 && (
                        <span style={{ fontSize: '10px', color: '#9e9e9e' }}>📷 {c.photos.length}장</span>
                      )}
                      <span style={{ fontSize: '10px', color: '#bdbdbd' }}>
                        {new Date(c.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  </div>
                ))}

              </>
            )
          ) : (
            // 단지 선택 목록
            <>
              {filtered.map(c => {
                const isSelected = selectedIds.includes(c.id);
                const matchingAts = getMatchingAreaTypes(c, selectedRange);
                const singleAt = matchingAts.length === 1 ? matchingAts[0] : null;
                const displayPrice = getPriceForAreaType(c, singleAt);
                const displayRange = selectedRange || c.priceRange;

                return (
                  <div
                    key={c.id}
                    onClick={() => onToggle(c.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 16px', borderBottom: '1px solid #f5f5f5',
                      backgroundColor: isSelected ? '#D4EFFC' : '#fff',
                      cursor: 'pointer', transition: 'background-color 0.1s',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#202124', marginBottom: '3px' }}>
                        {c.complexName}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: 700, color: '#fff',
                          backgroundColor: '#89CFF0', borderRadius: '10px', padding: '1px 6px',
                        }}>{displayRange}</span>
                        {matchingAts.map(at => (
                          <span key={at} style={{
                            fontSize: '10px', fontWeight: 600, color: '#4BAAD4',
                            backgroundColor: '#D4EFFC', borderRadius: '10px', padding: '1px 6px',
                          }}>{at.replace(/^전용\s*/, '')}</span>
                        ))}
                        <span style={{ fontSize: '11px', color: '#80868b' }}>
                          {c.region}{displayPrice ? ` · ${formatPrice(displayPrice)}` : ''}
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(c.id)}
                      onClick={e => e.stopPropagation()}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0, marginLeft: '12px', accentColor: '#89CFF0' }}
                    />
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
                  해당하는 단지가 없습니다.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default CompareListModal;
