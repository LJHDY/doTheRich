import React, { useMemo } from 'react';
import { ApartmentComplex, formatPrice } from '../types';

interface Props {
  range: string;           // '' = 전체, '7억대' = 특정 금액대
  areaType?: string;       // 평형 필터 — undefined이면 전체
  complexes: ApartmentComplex[];
  onClose: () => void;
  onSelect: (complex: ApartmentComplex) => void;
}

// 현재 필터(range/areaType)에 매칭되는 평형 목록 반환
const getMatchingAreaTypes = (
  complex: ApartmentComplex, range: string, areaType?: string
): string[] => {
  if (areaType) return [areaType];
  if (!range) return [];
  const atMap = complex.areaTypePriceRanges;
  if (atMap) {
    return Object.entries(atMap).filter(([, r]) => r === range).map(([at]) => at);
  }
  return complex.areaTypes ?? [];
};

// 특정 평형의 가격 반환 — priceItems 있으면 해당 평형 가격, 없으면 대표가 fallback
const getPriceForAreaType = (complex: ApartmentComplex, at: string | null): number | undefined => {
  if (!at) return complex.price;
  return complex.priceItems?.find(p => p.areaType === at)?.price ?? complex.price;
};

const ComplexListModal: React.FC<Props> = ({ range, areaType, complexes, onClose, onSelect }) => {
  // 금액대 + 평형 필터 적용 후 지역 가나다 → 동일 지역 내 최신 확인일 순으로 정렬
  const sorted = useMemo(() => {
    const filtered = complexes.filter(c => {
      const atMap = c.areaTypePriceRanges;

      if (range && areaType) {
        // 평형 + 금액대 동시 필터 — 해당 평형이 정확히 해당 금액대인 단지만 통과
        // 예: "전용59" + "14억대" → 전용59가 14억대인 단지만 (11억대이면 제외)
        return atMap
          ? atMap[areaType] === range
          : c.priceRange === range && (c.areaTypes?.includes(areaType) ?? false);
      }
      if (range) {
        // 금액대만 필터 — 어떤 평형이든 해당 금액대가 있으면 통과
        return atMap
          ? Object.values(atMap).includes(range)
          : c.priceRange === range;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const regionCmp = (a.region || '').localeCompare(b.region || '', 'ko');
      if (regionCmp !== 0) return regionCmp;
      return (b.checkDate || '').localeCompare(a.checkDate || '');
    });
  }, [complexes, range, areaType]);

  // 타이틀에 선택한 평형 표시
  const title = range
    ? `${range}${areaType ? ` · ${areaType}` : ''} 단지 목록`
    : '전체 단지 목록';

  // 2단계 그룹핑: 지역 → 평형 서브그룹 (평형 숫자 오름차순)
  const groups = useMemo(() => {
    const atNum = (at: string) => parseFloat(at.replace(/[^0-9.]/g, '')) || 0;
    // region → areaType → complex[] 매핑 빌드
    const regionMap = new Map<string, Map<string, ApartmentComplex[]>>();
    sorted.forEach(c => {
      const region = c.region || '지역 미입력';
      const ats = getMatchingAreaTypes(c, range, areaType);
      if (!regionMap.has(region)) regionMap.set(region, new Map());
      const subMap = regionMap.get(region)!;
      if (ats.length === 0) {
        // 평형 정보 없으면 빈 키로 묶음
        if (!subMap.has('')) subMap.set('', []);
        subMap.get('')!.push(c);
      } else {
        ats.forEach(at => {
          if (!subMap.has(at)) subMap.set(at, []);
          subMap.get(at)!.push(c);
        });
      }
    });
    return Array.from(regionMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'ko'))
      .map(([region, subMap]) => ({
        region,
        subGroups: Array.from(subMap.entries())
          .sort(([a], [b]) => atNum(a) - atNum(b))
          .map(([at, items]) => ({ areaType: at, items })),
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, range, areaType]);

  return (
    <>
      {/* 헤더 하단에 고정되는 드롭다운 패널 */}
      <div
        style={{
          position: 'fixed',
          top: '56px',
          left: 0,
          right: 0,
          zIndex: 1000,
          backgroundColor: '#fff',
          borderBottom: '1px solid #e8eaed',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '55vh',
        }}
      >
        {/* 패널 헤더 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 24px',
          borderBottom: '1px solid #e8eaed',
          flexShrink: 0,
          backgroundColor: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#202124' }}>{title}</span>
            <span style={{
              fontSize: '12px', fontWeight: 600, color: '#1a73e8',
              backgroundColor: '#e8f0fe', borderRadius: '12px', padding: '2px 10px',
            }}>{sorted.length}개</span>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '20px', color: '#80868b', padding: 0, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* 단지 목록 스크롤 영역 */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {sorted.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>
              해당 금액대의 단지가 없습니다.
            </div>
          ) : (
            // 지역구 헤더 → 평형 서브헤더 → 단지 그리드
            groups.map(group => (
              <div key={group.region}>
                {/* 지역구 sticky 헤더 */}
                <div style={{
                  padding: '6px 24px',
                  backgroundColor: '#f0f2f5',
                  fontSize: '11px', fontWeight: 700, color: '#5f6368',
                  borderBottom: '1px solid #e8eaed',
                  position: 'sticky', top: 0, zIndex: 1,
                }}>
                  {group.region}
                </div>

                {group.subGroups.map(sub => (
                  <div key={sub.areaType || '_none'}>
                    {/* 평형 서브헤더 — 평형 정보 있을 때만 표시 */}
                    {sub.areaType && (
                      <div style={{
                        padding: '3px 36px',
                        backgroundColor: '#f8f9fa',
                        fontSize: '10px', fontWeight: 600, color: '#9e9e9e',
                        borderBottom: '1px solid #f0f0f0',
                      }}>
                        {'전용 ' + sub.areaType.replace(/^전용\s*/, '')}
                      </div>
                    )}

                    {/* 단지 목록 그리드 */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: 0,
                    }}>
                      {sub.items.map(complex => {
                        const displayAt = sub.areaType || null;
                        const displayRange = (displayAt && complex.areaTypePriceRanges?.[displayAt]) || range || complex.priceRange;
                        const displayPrice = getPriceForAreaType(complex, displayAt);

                        return (
                          <div
                            key={complex.id}
                            onClick={() => { onSelect(complex); onClose(); }}
                            style={{
                              display: 'flex', alignItems: 'center',
                              padding: '10px 24px', borderBottom: '1px solid #f0f0f0',
                              borderRight: '1px solid #f0f0f0',
                              cursor: 'pointer', transition: 'background-color 0.1s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            {/* 왼쪽: 금액대 배지 + 단지명 */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px', flexWrap: 'wrap' }}>
                                {displayRange && (
                                  <span style={{
                                    fontSize: '10px', fontWeight: 700, color: '#fff',
                                    backgroundColor: '#1a73e8', borderRadius: '10px',
                                    padding: '1px 6px', flexShrink: 0,
                                  }}>{displayRange}</span>
                                )}
                                <span style={{
                                  fontSize: '13px', fontWeight: 700, color: '#202124',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{complex.complexName}</span>
                              </div>
                              <div style={{ fontSize: '11px', color: '#80868b' }}>
                                {[complex.builtYear, complex.region].filter(Boolean).join(' · ')}
                              </div>
                            </div>

                            {/* 오른쪽: 평형별 가격 + 날짜 */}
                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a73e8' }}>
                                {displayPrice ? formatPrice(displayPrice) : '-'}
                              </div>
                              <div style={{ fontSize: '10px', color: '#9e9e9e', marginTop: '1px' }}>
                                {complex.checkDate || ''}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default ComplexListModal;
