import React, { useMemo } from 'react';
import { ApartmentComplex, formatPrice } from '../types';

interface Props {
  range: string;           // '' = 전체, '7억대' = 특정 금액대
  areaType?: string;       // 평형 필터 — undefined이면 전체
  complexes: ApartmentComplex[];
  onClose: () => void;
  onSelect: (complex: ApartmentComplex) => void;
}

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

  // 지역구별 그룹핑 — 정렬된 배열을 순차 스캔해 동일 region을 묶음
  const groups: { region: string; items: ApartmentComplex[] }[] = [];
  sorted.forEach(c => {
    const last = groups[groups.length - 1];
    if (last && last.region === (c.region || '')) {
      last.items.push(c);
    } else {
      groups.push({ region: c.region || '지역 미입력', items: [c] });
    }
  });

  return (
    <>
      {/* 투명 백드롭 — 패널 외부 클릭 시 닫기 */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
        onClick={onClose}
      />

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
            // 지역구 헤더 + 단지 행들을 그리드로 표시
            groups.map(group => (
              <div key={group.region}>
                <div style={{
                  padding: '6px 24px',
                  backgroundColor: '#f8f9fa',
                  fontSize: '11px', fontWeight: 700, color: '#5f6368',
                  borderBottom: '1px solid #e8eaed',
                  position: 'sticky', top: 0,
                }}>
                  {group.region}
                </div>

                {/* 단지 목록을 그리드로 배치해 가로 공간 활용 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 0,
                }}>
                  {group.items.map(complex => (
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
                      {/* 왼쪽: 금액대 태그 + 단지�� */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, color: '#fff',
                            backgroundColor: '#1a73e8', borderRadius: '10px',
                            padding: '1px 6px', flexShrink: 0,
                          }}>{complex.priceRange}</span>
                          <span style={{
                            fontSize: '13px', fontWeight: 700, color: '#202124',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{complex.complexName}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#80868b' }}>
                          {[complex.builtYear, complex.region].filter(Boolean).join(' · ')}
                        </div>
                      </div>

                      {/* 오른쪽: 가격 + 날짜 */}
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a73e8' }}>
                          {complex.price ? formatPrice(complex.price) : '-'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#9e9e9e', marginTop: '1px' }}>
                          {complex.checkDate || ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default ComplexListModal;
