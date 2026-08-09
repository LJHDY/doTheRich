import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ApartmentComplex, JeonseOnlyItem, formatPrice } from '../types';
import { deletePriceHistoryByAreaType, getJeonseOnlyItems } from '../services/api';

interface Props {
  range: string;           // '' = 전체, '7억대' = 특정 금액대
  areaType?: string;       // 평형 필터 — undefined이면 전체
  complexes: ApartmentComplex[];
  onClose: () => void;
  onSelect: (complex: ApartmentComplex) => void;
  top?: number;            // 헤더 높이(px) — 기본값 56
  favoritesOnly?: boolean; // true면 즐겨찾기 단지만 표시
  showCleanup?: boolean;   // true면 "단지 정리" 버튼 표시 (내 단지 전용)
  onRefresh?: () => void;  // 삭제 완료 후 단지 목록 새로고침 콜백
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

// 특정 평형의 가격 반환 — areaTypePrices(평형별 실금액) 우선, 없으면 대표가 fallback
const getPriceForAreaType = (complex: ApartmentComplex, at: string | null): number | undefined => {
  if (!at) return complex.price;
  return complex.areaTypePrices?.[at] ?? complex.priceItems?.find(p => p.areaType === at)?.price ?? complex.price;
};

const ComplexListModal: React.FC<Props> = ({
  range, areaType, complexes, onClose, onSelect,
  top = 56, favoritesOnly = false, showCleanup = false, onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // 단지 정리 모드 상태
  const [cleanupMode, setCleanupMode] = useState(false);
  const [cleanupItems, setCleanupItems] = useState<JeonseOnlyItem[]>([]);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // 단지 정리 버튼 클릭 → 전세 전용 항목 조회
  const handleOpenCleanup = useCallback(async () => {
    setCleanupMode(true);
    setCleanupLoading(true);
    setCheckedKeys(new Set());
    try {
      const items = await getJeonseOnlyItems();
      setCleanupItems(items);
    } finally {
      setCleanupLoading(false);
    }
  }, []);

  const cleanupKey = (item: JeonseOnlyItem) => `${item.complexId}_${item.areaType}`;

  const toggleCheck = (key: string) => {
    setCheckedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedKeys.size === cleanupItems.length) {
      setCheckedKeys(new Set());
    } else {
      setCheckedKeys(new Set(cleanupItems.map(cleanupKey)));
    }
  };

  // 체크된 항목 일괄 삭제
  const handleDelete = useCallback(async () => {
    if (checkedKeys.size === 0) return;
    if (!window.confirm(`선택한 ${checkedKeys.size}개 항목의 전용면적 시세를 삭제하시겠습니까?\n(해당 평형의 시세 기록이 전부 삭제됩니다)`)) return;
    setDeleting(true);
    try {
      const targets = cleanupItems.filter(it => checkedKeys.has(cleanupKey(it)));
      await Promise.allSettled(
        targets.map(it => deletePriceHistoryByAreaType(it.complexId, it.areaType))
      );
      // 삭제 후 목록 재조회
      const updated = await getJeonseOnlyItems();
      setCleanupItems(updated);
      setCheckedKeys(new Set());
      onRefresh?.();
    } finally {
      setDeleting(false);
    }
  }, [checkedKeys, cleanupItems, onRefresh]);

  // 금액대 + 평형 + 즐겨찾기 + 이름 검색 필터 적용 후 지역 가나다 → 동일 지역 내 최신 확인일 순으로 정렬
  const sorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = complexes.filter(c => {
      if (q && !c.complexName.toLowerCase().includes(q)) return false;
      if (favoritesOnly && !c.isFavorite) return false;
      const atMap = c.areaTypePriceRanges;

      if (range && areaType) {
        return atMap
          ? atMap[areaType] === range
          : c.priceRange === range && (c.areaTypes?.includes(areaType) ?? false);
      }
      if (range) {
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
  }, [complexes, range, areaType, favoritesOnly, searchQuery]);

  const title = favoritesOnly
    ? `★ 즐겨찾기 단지`
    : range
      ? `${range}${areaType ? ` · ${areaType}` : ''} 단지 목록`
      : '전체 단지 목록';

  // 2단계 그룹핑: 지역 → 평형 서브그룹 (평형 숫자 오름차순)
  const groups = useMemo(() => {
    const atNum = (at: string) => parseFloat(at.replace(/[^0-9.]/g, '')) || 0;
    const regionMap = new Map<string, Map<string, ApartmentComplex[]>>();
    sorted.forEach(c => {
      const region = c.region || '지역 미입력';
      const ats = getMatchingAreaTypes(c, range, areaType);
      if (!regionMap.has(region)) regionMap.set(region, new Map());
      const subMap = regionMap.get(region)!;
      if (ats.length === 0) {
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

  const cellStyle: React.CSSProperties = {
    fontSize: '12px', padding: '7px 10px', borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'middle',
  };

  return (
    <>
      {/* 헤더 하단에 고정되는 드롭다운 패널 */}
      <div
        style={{
          position: 'fixed',
          top: `${top}px`,
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
          {cleanupMode ? (
            /* 단지 정리 모드 헤더 */
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <button
                onClick={() => setCleanupMode(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: '#5f6368', padding: '2px 6px', borderRadius: '4px' }}
              >← 돌아가기</button>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#202124' }}>단지 정리</span>
              {!cleanupLoading && (
                <span style={{
                  fontSize: '12px', fontWeight: 600, color: '#E06060',
                  backgroundColor: '#FFE8E8', borderRadius: '12px', padding: '2px 10px',
                }}>{cleanupItems.length}개</span>
              )}
              <span style={{ fontSize: '11px', color: '#9e9e9e' }}>매매가·호가 없이 전세가만 있는 평형</span>
            </div>
          ) : (
            /* 일반 모드 헤더 */
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#202124', flexShrink: 0 }}>{title}</span>
              <span style={{
                fontSize: '12px', fontWeight: 600, color: '#4BAAD4',
                backgroundColor: '#D4EFFC', borderRadius: '12px', padding: '2px 10px', flexShrink: 0,
              }}>{sorted.length}개</span>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="단지명 검색..."
                style={{
                  flex: 1, minWidth: 0, maxWidth: '200px',
                  fontSize: '12px', padding: '4px 10px',
                  border: '1px solid #dadce0', borderRadius: '14px', outline: 'none',
                  color: '#202124',
                }}
              />
              {showCleanup && (
                <button
                  onClick={handleOpenCleanup}
                  style={{
                    fontSize: '11px', fontWeight: 600, color: '#E06060',
                    border: '1px solid #E06060', background: 'none', cursor: 'pointer',
                    borderRadius: '10px', padding: '3px 10px', flexShrink: 0,
                  }}
                >단지 정리</button>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', flexShrink: 0 }}>
            {cleanupMode && checkedKeys.size > 0 && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  fontSize: '12px', fontWeight: 700, color: '#fff',
                  backgroundColor: deleting ? '#ccc' : '#E06060',
                  border: 'none', cursor: deleting ? 'not-allowed' : 'pointer',
                  borderRadius: '8px', padding: '5px 14px',
                }}
              >{deleting ? '삭제 중...' : `선택 삭제 (${checkedKeys.size})`}</button>
            )}
            <button
              onClick={onClose}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#80868b', padding: 0, lineHeight: 1 }}
            >×</button>
          </div>
        </div>

        {/* 스크롤 영역 */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {cleanupMode ? (
            /* ── 단지 정리 뷰 ── */
            cleanupLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>조회 중...</div>
            ) : cleanupItems.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>해당 항목이 없습니다.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ ...cellStyle, width: '36px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={checkedKeys.size === cleanupItems.length}
                        onChange={toggleAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 700, color: '#5f6368' }}>단지명</th>
                    <th style={{ ...cellStyle, textAlign: 'center', fontWeight: 700, color: '#5f6368', whiteSpace: 'nowrap' }}>전용면적</th>
                    <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, color: '#5f6368', whiteSpace: 'nowrap' }}>매매가</th>
                    <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, color: '#5f6368', whiteSpace: 'nowrap' }}>호가</th>
                    <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, color: '#5f6368', whiteSpace: 'nowrap' }}>전세가</th>
                  </tr>
                </thead>
                <tbody>
                  {cleanupItems.map(item => {
                    const key = cleanupKey(item);
                    const checked = checkedKeys.has(key);
                    return (
                      <tr
                        key={key}
                        onClick={() => toggleCheck(key)}
                        style={{ cursor: 'pointer', backgroundColor: checked ? '#FFF5F5' : 'transparent' }}
                        onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#f8f9fa'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = checked ? '#FFF5F5' : 'transparent'; }}
                      >
                        <td style={{ ...cellStyle, textAlign: 'center' }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleCheck(key)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                        </td>
                        <td style={{ ...cellStyle, fontWeight: 600, color: '#202124' }}>{item.complexName}</td>
                        <td style={{ ...cellStyle, textAlign: 'center', color: '#5f6368' }}>
                          {'전용 ' + item.areaType.replace(/^전용\s*/, '')}
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'right', color: '#bbb' }}>
                          {item.price ? formatPrice(item.price) : '없음'}
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'right', color: '#bbb' }}>
                          {item.askingPrice ? formatPrice(item.askingPrice) : '없음'}
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'right', color: '#4BAAD4', fontWeight: 700 }}>
                          {item.jeonsePrice ? formatPrice(item.jeonsePrice) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            /* ── 일반 단지 목록 뷰 ── */
            sorted.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '14px' }}>
                해당 금액대의 단지가 없습니다.
              </div>
            ) : (
              groups.map(group => (
                <div key={group.region}>
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
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px', flexWrap: 'wrap' }}>
                                  {displayRange && (
                                    <span style={{
                                      fontSize: '10px', fontWeight: 700, color: '#fff',
                                      backgroundColor: '#89CFF0', borderRadius: '10px',
                                      padding: '1px 6px', flexShrink: 0,
                                    }}>{displayRange}</span>
                                  )}
                                  <span style={{
                                    fontSize: '13px', fontWeight: 700, color: '#202124',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>{complex.complexName}</span>
                                </div>
                                <div style={{ fontSize: '11px', color: '#80868b' }}>
                                  {[complex.builtYear, complex.unitCount ? `${complex.unitCount.toLocaleString()}세대` : null].filter(Boolean).join(' · ')}
                                </div>
                                {complex.region && (
                                  <div style={{ fontSize: '11px', color: '#9e9e9e', marginTop: '1px' }}>
                                    {complex.region}
                                  </div>
                                )}
                              </div>

                              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: '#4BAAD4' }}>
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
            )
          )}
        </div>
      </div>
    </>
  );
};

export default ComplexListModal;
