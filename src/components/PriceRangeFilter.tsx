import React, { useState } from 'react';
import { ApartmentComplex } from '../types';

interface PriceRangeFilterProps {
  priceRanges: string[];
  selectedRange: string | null;
  onSelect: (range: string | null) => void;
  onSelectAreaType?: (range: string, areaType: string) => void;
  complexes?: ApartmentComplex[];
}

const parsePriceRangeNum = (range: string): number => {
  const match = range.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
};

// 공통 셀렉트 스타일 팩토리 — 활성 여부에 따라 색상 분기
const selectStyle = (active: boolean): React.CSSProperties => ({
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  border: '1.5px solid',
  borderColor: active ? '#1a73e8' : '#d2d5da',
  borderRadius: '16px',
  backgroundColor: active ? '#e8f0fe' : '#fff',
  color: active ? '#1a73e8' : '#4a4f54',
  fontSize: '13px',
  fontWeight: 600,
  padding: '6px 30px 6px 14px',
  cursor: 'pointer',
  outline: 'none',
  boxShadow: active
    ? '0 2px 8px rgba(26,115,232,0.2)'
    : '0 1px 3px rgba(0,0,0,0.07)',
  transition: 'all 0.18s ease',
  lineHeight: 1.3,
});

// 커스텀 화살표 오버레이 SVG
const DropdownArrow: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 24 24" fill="none"
    stroke={active ? '#1a73e8' : '#9e9e9e'}
    strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
    style={{
      position: 'absolute', right: '10px', top: '50%',
      transform: 'translateY(-50%)',
      width: '12px', height: '12px', pointerEvents: 'none',
    }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const PriceRangeFilter: React.FC<PriceRangeFilterProps> = ({
  priceRanges,
  onSelect,
  onSelectAreaType,
  complexes,
}) => {
  const sorted = [...priceRanges].sort(
    (a, b) => parsePriceRangeNum(a) - parsePriceRangeNum(b)
  );

  // 금액대 선택 상태 — '' = 전체
  const [localRange, setLocalRange] = useState('');

  // 선택된 금액대에 해당하는 평형 목록
  // areaTypePriceRanges(평형→금액대 맵)가 있으면 해당 금액대인 평형만 추출, 없으면 대표 priceRange로 fallback
  const getAreaTypes = (range: string): string[] => {
    if (!complexes || !range) return [];
    const seen = new Set<string>();
    const types: string[] = [];
    complexes
      .filter(c => c.areaTypePriceRanges
        ? Object.values(c.areaTypePriceRanges).includes(range)
        : c.priceRange === range)
      .forEach(c => {
        if (c.areaTypePriceRanges) {
          // 해당 금액대인 평형만 추출 (다른 금액대 평형 제외)
          Object.entries(c.areaTypePriceRanges)
            .filter(([, r]) => r === range)
            .forEach(([at]) => { if (!seen.has(at)) { seen.add(at); types.push(at); } });
        } else {
          const sources = c.areaTypes?.length
            ? c.areaTypes
            : (c.priceItems?.map(p => p.areaType).filter(Boolean) as string[] ?? []);
          sources.forEach(at => {
            if (at && !seen.has(at)) { seen.add(at); types.push(at); }
          });
        }
      });
    return types;
  };

  const areaTypes = getAreaTypes(localRange);
  const rangeActive = localRange !== '';

  const handleRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLocalRange(val);
    onSelect(val === '' ? null : val);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 0', flexShrink: 0,
    }}>
      <span style={{ fontSize: '12px', color: '#9e9e9e', fontWeight: 500, whiteSpace: 'nowrap' }}>
        금액대
      </span>

      {/* 금액대 셀렉트 */}
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <select
          value={localRange}
          onChange={handleRangeChange}
          style={selectStyle(rangeActive)}
        >
          <option value="">전체</option>
          {sorted.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <DropdownArrow active={rangeActive} />
      </div>

      {/* 금액대 선택 시 평형 셀렉트 표시 */}
      {rangeActive && areaTypes.length > 0 && (
        <>
          <span style={{ fontSize: '12px', color: '#d2d5da', fontWeight: 400 }}>›</span>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              defaultValue=""
              onChange={(e) => {
                const val = e.target.value;
                if (val) onSelectAreaType?.(localRange, val);
                else onSelect(localRange);
              }}
              style={selectStyle(false)}
            >
              <option value="">전체 평형</option>
              {areaTypes.map(at => (
                <option key={at} value={at}>
                  {at.replace(/^전용\s*/, '')}
                </option>
              ))}
            </select>
            <DropdownArrow active={false} />
          </div>
        </>
      )}
    </div>
  );
};

export default PriceRangeFilter;
