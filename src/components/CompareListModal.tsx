import React, { useState } from 'react';
import { ApartmentComplex, formatPrice } from '../types';

interface CompareListModalProps {
  complexes: ApartmentComplex[];
  priceRanges: string[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onClose: () => void;
  top?: number; // 헤더 높이(px) — 기본값 56
}

// 필터 기준 매칭 평형 목록 반환
const getMatchingAreaTypes = (complex: ApartmentComplex, range: string): string[] => {
  if (!range) return [];
  const atMap = complex.areaTypePriceRanges;
  if (atMap) {
    return Object.entries(atMap).filter(([, r]) => r === range).map(([at]) => at);
  }
  return complex.areaTypes ?? [];
};

// 특정 평형의 가격 반환 — priceItems 없으면 대표가 fallback
const getPriceForAreaType = (complex: ApartmentComplex, at: string | null): number | undefined => {
  if (!at) return complex.price;
  return complex.priceItems?.find(p => p.areaType === at)?.price ?? complex.price;
};

const CompareListModal: React.FC<CompareListModalProps> = ({
  complexes, priceRanges, selectedIds, onToggle, onClose, top = 56,
}) => {
  const [selectedRange, setSelectedRange] = useState('');

  const filtered = selectedRange
    ? complexes.filter(c =>
        c.areaTypePriceRanges
          ? Object.values(c.areaTypePriceRanges).includes(selectedRange)
          : c.priceRange === selectedRange
      )
    : complexes;

  // 금액대 오름차순 정렬 (숫자 파싱)
  const sortedRanges = [...priceRanges].sort((a, b) => {
    const na = parseInt(a); const nb = parseInt(b);
    return isNaN(na) || isNaN(nb) ? 0 : na - nb;
  });

  return (
    <>
      {/* 투명 백드롭 — 바깥 클릭 시 닫힘 */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 300 }}
        onClick={onClose}
      />

      {/* 패널 본체 */}
      <div style={{
        position: 'fixed', top: `${top}px`, left: '50%', transform: 'translateX(-50%)',
        width: '480px', maxWidth: 'calc(100vw - 16px)', maxHeight: '65vh',
        backgroundColor: '#fff', borderRadius: '0 0 12px 12px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
        zIndex: 301, display: 'flex', flexDirection: 'column',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid #e8eaed',
          display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
        }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>
            비교할 단지 선택
          </span>
          <span style={{
            fontSize: '12px', fontWeight: 700,
            color: selectedIds.length > 0 ? '#1a73e8' : '#9e9e9e',
            backgroundColor: selectedIds.length > 0 ? '#e8f0fe' : '#f5f5f5',
            padding: '2px 8px', borderRadius: '10px',
          }}>
            {selectedIds.length}/3
          </span>

          {/* 금액대 필터 */}
          <div style={{ marginLeft: 'auto', position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              value={selectedRange}
              onChange={e => setSelectedRange(e.target.value)}
              style={{
                appearance: 'none', WebkitAppearance: 'none',
                fontSize: '12px', padding: '4px 24px 4px 8px',
                border: '1px solid #dadce0', borderRadius: '6px', outline: 'none',
                backgroundColor: selectedRange ? '#e8f0fe' : '#fff',
                color: selectedRange ? '#1a73e8' : '#5f6368', cursor: 'pointer',
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

        {/* 단지 리스트 */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
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
                  backgroundColor: isSelected ? '#e8f0fe' : '#fff',
                  cursor: 'pointer', transition: 'background-color 0.1s',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#202124', marginBottom: '3px' }}>
                    {c.complexName}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    {/* 금액대 배지 */}
                    <span style={{
                      fontSize: '10px', fontWeight: 700, color: '#fff',
                      backgroundColor: '#1a73e8', borderRadius: '10px', padding: '1px 6px',
                    }}>{displayRange}</span>
                    {/* 매칭 평형 배지 */}
                    {matchingAts.map(at => (
                      <span key={at} style={{
                        fontSize: '10px', fontWeight: 600, color: '#1a73e8',
                        backgroundColor: '#e8f0fe', borderRadius: '10px', padding: '1px 6px',
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
                  style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0, marginLeft: '12px', accentColor: '#1a73e8' }}
                />
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
              해당하는 단지가 없습니다.
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CompareListModal;
