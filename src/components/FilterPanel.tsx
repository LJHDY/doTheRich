import React, { useMemo, useState, useCallback } from 'react';
import { ApartmentComplex, ActiveFilters, EMPTY_FILTERS, calcCommuteGrade } from '../types';

// ── 등급 계산 (ComplexInfoPanel과 동일 로직) ────────────────────────────────
const calcSchoolGrade = (schoolInfos?: ApartmentComplex['schoolInfos']): string | null => {
  const middles = (schoolInfos ?? []).filter(s => s.schoolType === 'MIDDLE' && s.achievementScore != null);
  if (middles.length === 0) return null;
  const best = Math.max(...middles.map(s => s.achievementScore!));
  if (best >= 95) return 'S';
  if (best >= 90) return 'A';
  if (best >= 85) return 'B';
  return 'C';
};

const calcInfraGrade = (infraInfos?: ApartmentComplex['infraInfos']): string => {
  const dept = (infraInfos ?? []).filter(i => i.infraType === 'DEPARTMENT_STORE').length;
  const mart = (infraInfos ?? []).filter(i => i.infraType === 'MART').length;
  if (dept >= 2) return 'S';
  if (dept >= 1) return 'A';
  if (mart >= 1) return 'B';
  return 'C';
};

// ── 세대수 범위 판별 ──────────────────────────────────────────────────────────
const UNIT_COUNT_RANGES = ['500이하', '500~1000', '1000~2000', '2000이상'] as const;
const matchUnitCount = (unitCount: number | undefined, ranges: string[]): boolean => {
  if (ranges.length === 0) return true;
  if (!unitCount) return false;
  return ranges.some(r => {
    if (r === '500이하') return unitCount <= 500;
    if (r === '500~1000') return unitCount > 500 && unitCount <= 1000;
    if (r === '1000~2000') return unitCount > 1000 && unitCount <= 2000;
    if (r === '2000이상') return unitCount > 2000;
    return false;
  });
};

// ── 연식 파싱 — "95년" → 1995, "00년" → 2000, "2023년" → 2023
// 2자리 연도: 30이상=19xx, 29이하=20xx (부동산 데이터는 1930~2029 준공 범위 기준)
const parseBuiltYear = (builtYear: string): number | null => {
  // 4자리 연도 우선 탐지 (예: "2023년", "2005")
  const m4 = builtYear.match(/(\d{4})/);
  if (m4) return parseInt(m4[1]);
  // 2자리 연도 처리 (예: "95년", "00년")
  const m2 = builtYear.match(/^(\d{2})년?/);
  if (m2) {
    const y2 = parseInt(m2[1]);
    return y2 >= 30 ? 1900 + y2 : 2000 + y2;
  }
  return null;
};

const BUILT_YEAR_RANGES = ['2020이후', '2010년대', '2000년대', '1999이전'] as const;
const matchBuiltYear = (builtYear: string | undefined, ranges: string[]): boolean => {
  if (ranges.length === 0) return true;
  if (!builtYear) return false;
  const y = parseBuiltYear(builtYear);
  if (y === null) return false;
  return ranges.some(r => {
    if (r === '2020이후') return y >= 2020;
    if (r === '2010년대') return y >= 2010 && y < 2020;
    if (r === '2000년대') return y >= 2000 && y < 2010;
    if (r === '1999이전') return y < 2000;
    return false;
  });
};

// ── 전세가율 범위 판별 ────────────────────────────────────────────────────────
const JEONSE_RATE_RANGES = ['60미만', '60~70', '70~80', '80이상'] as const;
const matchJeonseRate = (rate: number | undefined, ranges: string[]): boolean => {
  if (ranges.length === 0) return true;
  if (rate == null) return false;
  return ranges.some(r => {
    if (r === '60미만') return rate < 60;
    if (r === '60~70') return rate >= 60 && rate < 70;
    if (r === '70~80') return rate >= 70 && rate < 80;
    if (r === '80이상') return rate >= 80;
    return false;
  });
};

// ── 10년 등락률 범위 판별 ─────────────────────────────────────────────────────
const matchChangeRate = (rate: number | undefined, ranges: string[]): boolean => {
  if (ranges.length === 0) return true;
  if (rate == null) return false;
  return ranges.some(r => {
    if (r === '80~100') return rate >= 80 && rate < 100;
    if (r === '100~150') return rate >= 100 && rate < 150;
    if (r === '150~200') return rate >= 150 && rate < 200;
    if (r === '200이상') return rate >= 200;
    return false;
  });
};

// ── 전고점 대비 % 범위 판별 — (선택가격 - highestPrice) / highestPrice * 100 ──
const PEAK_DIFF_RANGES = ['-60미만', '-60~-40', '-40~-20', '-20~0', '0~+20', '+20이상'] as const;
const PEAK_DIFF_PRICE_TYPES = ['매매가', '호가', 'KB시세'] as const;
const matchPeakDiff = (
  c: { price?: number; askingPrice?: number; kbPrice?: number; highestPrice?: number },
  ranges: string[],
  priceType: string,
): boolean => {
  if (ranges.length === 0) return true;
  if (!c.highestPrice) return false;
  const price = priceType === '호가' ? c.askingPrice : priceType === 'KB시세' ? c.kbPrice : c.price;
  if (!price) return false;
  const pct = (price - c.highestPrice) / c.highestPrice * 100;
  return ranges.some(r => {
    if (r === '-60미만')  return pct < -60;
    if (r === '-60~-40') return pct >= -60 && pct < -40;
    if (r === '-40~-20') return pct >= -40 && pct < -20;
    if (r === '-20~0')   return pct >= -20 && pct < 0;
    if (r === '0~+20')   return pct >= 0   && pct < 20;
    if (r === '+20이상')  return pct >= 20;
    return false;
  });
};

// ── 평형대 범위 판별 — areaType 문자열에서 전용면적(㎡) 추출 후 ÷3.3 환산 ──────
// 단지가 여러 평형을 가질 때 하나라도 범위에 해당하면 매칭 (OR)
const AREA_TYPE_RANGES = ['~20평', '20~25평', '25~30평', '30~35평', '35평+'] as const;
const matchAreaTypeRange = (areaTypes: string[] | undefined, ranges: string[]): boolean => {
  if (ranges.length === 0) return true;
  if (!areaTypes || areaTypes.length === 0) return false;
  return areaTypes.some(at => {
    // "전용 59" / "전용59" / "59.9" 등 다양한 형식에서 숫자 추출
    const m = at.match(/[\d.]+/);
    if (!m) return false;
    const sqm = parseFloat(m[0]);
    const pyeong = sqm / 3.3;
    return ranges.some(r => {
      if (r === '~20평')   return pyeong < 20;
      if (r === '20~25평') return pyeong >= 20 && pyeong < 25;
      if (r === '25~30평') return pyeong >= 25 && pyeong < 30;
      if (r === '30~35평') return pyeong >= 30 && pyeong < 35;
      if (r === '35평+')   return pyeong >= 35;
      return false;
    });
  });
};

// ── 재개발 유형 레이블 ─────────────────────────────────────────────────────────
const REDEVELOP_LABELS: Record<string, string> = {
  REDEVELOPMENT: '재개발', RECONSTRUCTION: '재건축', REMODELING: '리모델링',
};
const VISIT_LABELS: Record<string, string> = {
  ATMOSPHERE: '분위기', COMPLEX: '단지', LISTING: '매물', NONE: '미정',
};
const SLOPE_LABELS: Record<string, string> = {
  FLAT: '평지', GENTLE: '완만', MODERATE: '보통', STEEP: '급경사',
};
const STRUCT_LABELS: Record<string, string> = {
  STAIRCASE: '계단식', CORRIDOR: '복도식', MIXED: '혼합',
};
const GRADE_COLORS: Record<string, string> = {
  S: '#F08080', A: '#FFD97D', B: '#7DC8A0', C: '#89CFF0',
};

// ── 단일 단지에 대해 필터 적용 — App.tsx의 filteredComplexes useMemo에서 호출 ──
// 모든 조건을 AND로 연결 — 하나라도 불일치하면 false 반환 (단락 평가)
export const applyFilters = (c: ApartmentComplex, f: ActiveFilters): boolean => {
  if (f.isFavoriteOnly && !c.isFavorite) return false;
  if (f.regions.length > 0 && !f.regions.includes(c.region ?? '')) return false;
  // visitType이 null인 단지는 'NONE'으로 취급 (임장 안 한 단지)
  if (f.visitTypes.length > 0 && !f.visitTypes.includes(c.visitType ?? 'NONE')) return false;
  if (f.grades.length > 0 && !f.grades.includes(c.grade ?? '')) return false;
  if (f.slopeTypes.length > 0 && !f.slopeTypes.includes(c.slopeType ?? '')) return false;
  if (f.buildingStructures.length > 0 && !f.buildingStructures.includes(c.buildingStructure ?? '')) return false;
  if (f.redevelopTypes.length > 0) {
    // redevelopType이 null이면 '없음'으로 취급
    const rt = c.redevelopType ?? '없음';
    if (!f.redevelopTypes.includes(rt)) return false;
  }
  if (!matchUnitCount(c.unitCount, f.unitCountRanges)) return false;
  if (!matchBuiltYear(c.builtYear, f.builtYearRanges)) return false;
  if (!matchJeonseRate(c.jeonseRate, f.jeonseRateRanges)) return false;
  if (!matchChangeRate(c.tenYearChangeRate, f.changeRateRanges)) return false;
  if (!matchPeakDiff(c, f.peakDiffRanges, f.peakDiffPriceType)) return false;
  if (!matchAreaTypeRange(c.areaTypes, f.areaTypeRanges)) return false;

  // 등급 계산 필터 — 각 등급 함수를 런타임에 호출하므로 필터 미활성 시 계산 건너뜀
  if (f.commuteGrades.length > 0) {
    const g = calcCommuteGrade(c.commuteTimes ?? []);
    if (!g || !f.commuteGrades.includes(g.grade)) return false;
  }
  if (f.schoolGrades.length > 0) {
    const g = calcSchoolGrade(c.schoolInfos);
    // 학군 정보 없는 단지는 등급 산출 불가 → 필터에서 제외
    if (!g || !f.schoolGrades.includes(g)) return false;
  }
  if (f.infraGrades.length > 0) {
    const g = calcInfraGrade(c.infraInfos);
    if (!f.infraGrades.includes(g)) return false;
  }
  return true;
};

// ── 체크박스 그룹 유틸 ────────────────────────────────────────────────────────
function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

// ── 섹션 헤더 ─────────────────────────────────────────────────────────────────
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: '11px', fontWeight: 700, color: '#80868b', letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>
    {children}
  </div>
);

// ── 칩 버튼 ───────────────────────────────────────────────────────────────────
const Chip: React.FC<{
  label: string; active: boolean; color?: string; onClick: () => void;
}> = ({ label, active, color, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '4px 10px', fontSize: '12px', fontWeight: active ? 700 : 500,
      borderRadius: '14px', cursor: 'pointer', transition: 'all 0.12s',
      border: `1.5px solid ${active ? (color ?? '#89CFF0') : '#dadce0'}`,
      backgroundColor: active ? (color ? color + '18' : '#D4EFFC') : '#fff',
      color: active ? (color ?? '#89CFF0') : '#5f6368',
    }}
  >{label}</button>
);

// ── 등급 칩 그룹 ─────────────────────────────────────────────────────────────
const GradeChips: React.FC<{
  selected: string[]; onChange: (v: string[]) => void;
}> = ({ selected, onChange }) => (
  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
    {(['S', 'A', 'B', 'C'] as const).map(g => (
      <Chip key={g} label={g} active={selected.includes(g)} color={GRADE_COLORS[g]}
        onClick={() => onChange(toggle(selected, g))} />
    ))}
  </div>
);

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
interface FilterPanelProps {
  complexes: ApartmentComplex[];         // 전체 단지 (필터 옵션 추출용)
  filters: ActiveFilters;
  onChange: (f: ActiveFilters) => void;
  onClose: () => void;
  onSelect: (c: ApartmentComplex) => void;
  isMobile?: boolean;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  complexes, filters, onChange, onClose, onSelect, isMobile,
}) => {
  // 지역구 목록 — 단지에 있는 region distinct 정렬
  const regionOptions = useMemo(() =>
    Array.from(new Set(complexes.map(c => c.region).filter(Boolean))).sort() as string[],
    [complexes]
  );

  // 재개발 옵션 — 실제 등록된 유형만 + "없음"
  const redevelopOptions = useMemo(() => {
    const types = Array.from(new Set(complexes.map(c => c.redevelopType).filter(Boolean))) as string[];
    return [...types, '없음'];
  }, [complexes]);

  // 필터 적용 결과
  const filtered = useMemo(() => complexes.filter(c => applyFilters(c, filters)), [complexes, filters]);

  const [searchQuery, setSearchQuery] = useState('');
  const displayList = useMemo(() => {
    if (!searchQuery.trim()) return filtered;
    const q = searchQuery.trim().toLowerCase();
    return filtered.filter(c => c.complexName.toLowerCase().includes(q));
  }, [filtered, searchQuery]);

  // filters/onChange가 바뀔 때만 새 함수 생성 — Chip 불필요 re-render 방지
  // displayList 단지별 등급 사전 계산 — 목록 렌더 시 O(1) 조회
  const gradesCache = useMemo(() => {
    const cache = new Map<number, {
      commuteGrade: ReturnType<typeof calcCommuteGrade>;
      schoolGrade: string | null;
      infraGrade: string;
    }>();
    displayList.forEach(c => {
      cache.set(c.id, {
        commuteGrade: calcCommuteGrade(c.commuteTimes ?? []),
        schoolGrade: calcSchoolGrade(c.schoolInfos),
        infraGrade: calcInfraGrade(c.infraInfos),
      });
    });
    return cache;
  }, [displayList]);

  const upd = useCallback(
    (patch: Partial<ActiveFilters>) => onChange({ ...filters, ...patch }),
    [filters, onChange]
  );

  // 활성 필터 수
  const activeCount =
    filters.visitTypes.length + filters.grades.length + filters.commuteGrades.length +
    filters.schoolGrades.length + filters.infraGrades.length + filters.unitCountRanges.length +
    filters.redevelopTypes.length + filters.slopeTypes.length + filters.buildingStructures.length +
    filters.builtYearRanges.length + filters.regions.length + (filters.isFavoriteOnly ? 1 : 0) +
    filters.jeonseRateRanges.length + filters.changeRateRanges.length + filters.peakDiffRanges.length +
    filters.areaTypeRanges.length;

  const panelStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }
    : {
        width: '340px', minWidth: '340px', height: '100%',
        display: 'flex', flexDirection: 'column', backgroundColor: '#fff',
        borderLeft: '1px solid #e8eaed', boxShadow: '-2px 0 8px rgba(0,0,0,0.08)',
      };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #f1f3f4',
  };

  return (
    <div style={panelStyle}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid #e8eaed', flexShrink: 0,
        backgroundColor: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#202124' }}>필터</span>
          {activeCount > 0 && (
            <span style={{
              fontSize: '11px', fontWeight: 700, color: '#fff',
              backgroundColor: '#89CFF0', borderRadius: '10px', padding: '2px 7px',
            }}>{activeCount}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {activeCount > 0 && (
            <button
              onClick={() => onChange(EMPTY_FILTERS)}
              style={{
                fontSize: '12px', fontWeight: 600, color: '#E06060',
                background: 'none', border: '1px solid #f5c6c6',
                borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
              }}
            >초기화</button>
          )}
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '18px',
            cursor: 'pointer', color: '#5f6368', lineHeight: 1, padding: '2px',
          }}>×</button>
        </div>
      </div>

      {/* 필터 컨트롤 영역 */}
      <div style={{ flex: '0 0 auto', overflowY: 'auto', padding: '14px 16px', maxHeight: isMobile ? '55vh' : '55%', borderBottom: '1px solid #e8eaed' }}>

        {/* 즐겨찾기 */}
        <div style={sectionStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={filters.isFavoriteOnly}
              onChange={e => upd({ isFavoriteOnly: e.target.checked })}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFD97D' }}>★ 즐겨찾기만</span>
          </label>
        </div>

        {/* 지역구 */}
        {regionOptions.length > 0 && (
          <div style={sectionStyle}>
            <SectionLabel>지역구</SectionLabel>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {regionOptions.map(r => (
                <Chip key={r} label={r} active={filters.regions.includes(r)}
                  onClick={() => upd({ regions: toggle(filters.regions, r) })} />
              ))}
            </div>
          </div>
        )}

        {/* 임장 유형 */}
        <div style={sectionStyle}>
          <SectionLabel>임장 유형</SectionLabel>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {Object.entries(VISIT_LABELS).map(([k, v]) => (
              <Chip key={k} label={v} active={filters.visitTypes.includes(k)}
                onClick={() => upd({ visitTypes: toggle(filters.visitTypes, k) })} />
            ))}
          </div>
        </div>

        {/* 세대수 */}
        <div style={sectionStyle}>
          <SectionLabel>세대수</SectionLabel>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {UNIT_COUNT_RANGES.map(r => (
              <Chip key={r} label={r} active={filters.unitCountRanges.includes(r)}
                onClick={() => upd({ unitCountRanges: toggle(filters.unitCountRanges, r) })} />
            ))}
          </div>
        </div>

        {/* 연식 */}
        <div style={sectionStyle}>
          <SectionLabel>준공 연식</SectionLabel>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {BUILT_YEAR_RANGES.map(r => (
              <Chip key={r} label={r} active={filters.builtYearRanges.includes(r)}
                onClick={() => upd({ builtYearRanges: toggle(filters.builtYearRanges, r) })} />
            ))}
          </div>
        </div>

        {/* 직장밀도 등급 */}
        <div style={sectionStyle}>
          <SectionLabel>직장밀도 등급</SectionLabel>
          <GradeChips selected={filters.grades} onChange={v => upd({ grades: v })} />
        </div>

        {/* 입지(교통) 등급 */}
        <div style={sectionStyle}>
          <SectionLabel>입지 등급 (교통)</SectionLabel>
          <GradeChips selected={filters.commuteGrades} onChange={v => upd({ commuteGrades: v })} />
        </div>

        {/* 학군 등급 */}
        <div style={sectionStyle}>
          <SectionLabel>학군 등급</SectionLabel>
          <GradeChips selected={filters.schoolGrades} onChange={v => upd({ schoolGrades: v })} />
        </div>

        {/* 환경(인프라) 등급 */}
        <div style={sectionStyle}>
          <SectionLabel>환경 등급 (인프라)</SectionLabel>
          <GradeChips selected={filters.infraGrades} onChange={v => upd({ infraGrades: v })} />
        </div>

        {/* 재개발 */}
        {redevelopOptions.length > 1 && (
          <div style={sectionStyle}>
            <SectionLabel>재개발·재건축</SectionLabel>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {redevelopOptions.map(r => (
                <Chip key={r} label={REDEVELOP_LABELS[r] ?? r} active={filters.redevelopTypes.includes(r)}
                  onClick={() => upd({ redevelopTypes: toggle(filters.redevelopTypes, r) })} />
              ))}
            </div>
          </div>
        )}

        {/* 경사도 */}
        <div style={sectionStyle}>
          <SectionLabel>경사도</SectionLabel>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {Object.entries(SLOPE_LABELS).map(([k, v]) => (
              <Chip key={k} label={v} active={filters.slopeTypes.includes(k)}
                onClick={() => upd({ slopeTypes: toggle(filters.slopeTypes, k) })} />
            ))}
          </div>
        </div>

        {/* 아파트 구조 */}
        <div style={sectionStyle}>
          <SectionLabel>아파트 구조</SectionLabel>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {Object.entries(STRUCT_LABELS).map(([k, v]) => (
              <Chip key={k} label={v} active={filters.buildingStructures.includes(k)}
                onClick={() => upd({ buildingStructures: toggle(filters.buildingStructures, k) })} />
            ))}
          </div>
        </div>

        {/* 전세가율 */}
        <div style={sectionStyle}>
          <SectionLabel>전세가율 (%)</SectionLabel>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {JEONSE_RATE_RANGES.map(r => (
              <Chip key={r} label={r + '%'} active={filters.jeonseRateRanges.includes(r)}
                onClick={() => upd({ jeonseRateRanges: toggle(filters.jeonseRateRanges, r) })} />
            ))}
          </div>
        </div>

        {/* 10년 등락률 */}
        <div style={{ ...sectionStyle }}>
          <SectionLabel>10년 등락률</SectionLabel>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {(['80~100', '100~150', '150~200', '200이상'] as const).map(r => (
              <Chip
                key={r}
                label={r === '200이상' ? '200%+' : `${r}%`}
                active={filters.changeRateRanges.includes(r)}
                color='#7DC8A0'
                onClick={() => upd({ changeRateRanges: toggle(filters.changeRateRanges, r) })}
              />
            ))}
          </div>
          <div style={{ fontSize: '11px', color: '#bdbdbd', marginTop: '6px' }}>
            ※ 시세 기록에 10년 등락률이 입력된 단지만 필터됩니다
          </div>
        </div>

        {/* 평형대 */}
        <div style={sectionStyle}>
          <SectionLabel>평형대</SectionLabel>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {AREA_TYPE_RANGES.map(r => (
              <Chip key={r} label={r} active={filters.areaTypeRanges.includes(r)}
                color='#7986cb'
                onClick={() => upd({ areaTypeRanges: toggle(filters.areaTypeRanges, r) })} />
            ))}
          </div>
          <div style={{ fontSize: '11px', color: '#bdbdbd', marginTop: '6px' }}>
            ※ 전용면적(㎡) ÷ 3.3 환산 기준, 단지의 평형 중 하나라도 해당하면 포함
          </div>
        </div>

        {/* 전고점 대비 */}
        <div style={{ ...sectionStyle, borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
          <SectionLabel>전고점 대비 (%)</SectionLabel>
          {/* 가격 기준 토글 */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            {PEAK_DIFF_PRICE_TYPES.map(t => (
              <button
                key={t}
                onClick={() => upd({ peakDiffPriceType: t })}
                style={{
                  padding: '3px 10px', fontSize: '11px', borderRadius: '12px', cursor: 'pointer',
                  border: filters.peakDiffPriceType === t ? '1.5px solid #1a6fa8' : '1px solid #dadce0',
                  background: filters.peakDiffPriceType === t ? '#e8f4fd' : '#fff',
                  color: filters.peakDiffPriceType === t ? '#1a6fa8' : '#5f6368',
                  fontWeight: filters.peakDiffPriceType === t ? 600 : 400,
                }}
              >{t}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {PEAK_DIFF_RANGES.map(r => {
              const isNeg = r.startsWith('-');
              const color = isNeg ? '#ef9a9a' : '#90caf9';
              return (
                <Chip
                  key={r}
                  label={r}
                  active={filters.peakDiffRanges.includes(r)}
                  color={color}
                  onClick={() => upd({ peakDiffRanges: toggle(filters.peakDiffRanges, r) })}
                />
              );
            })}
          </div>
          <div style={{ fontSize: '11px', color: '#bdbdbd', marginTop: '6px' }}>
            ※ 전고점이 입력된 단지만 필터됩니다
          </div>
        </div>
      </div>

      {/* 결과 목록 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 검색 + 결과 수 */}
        <div style={{ padding: '10px 16px 8px', flexShrink: 0, borderBottom: '1px solid #f1f3f4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>
              {activeCount > 0 ? `필터 결과 ${filtered.length}개` : `전체 ${complexes.length}개`}
            </span>
            {activeCount > 0 && filtered.length !== complexes.length && (
              <span style={{ fontSize: '11px', color: '#80868b' }}>
                ({complexes.length - filtered.length}개 제외)
              </span>
            )}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="단지명 검색..."
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px', fontSize: '13px',
              border: '1px solid #dadce0', borderRadius: '8px', outline: 'none',
            }}
          />
        </div>

        {/* 단지 목록 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {displayList.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
              조건에 맞는 단지가 없습니다
            </div>
          ) : (
            displayList.map(c => {
              // gradesCache에서 O(1) 조회 — 매 렌더마다 재계산하지 않음
              const { commuteGrade, schoolGrade, infraGrade } = gradesCache.get(c.id)!;
              return (
                <div
                  key={c.id}
                  onClick={() => { onSelect(c); }}
                  style={{
                    padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f8f9fa',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                        {c.isFavorite && <span style={{ color: '#FFD97D', fontSize: '12px' }}>★</span>}
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.complexName}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#80868b', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {c.region && <span>{c.region}</span>}
                        {c.builtYear && <span>{c.builtYear}</span>}
                        {c.unitCount && <span>{c.unitCount.toLocaleString()}세대</span>}
                        {c.jeonseRate != null && <span>전세율 {c.jeonseRate}%</span>}
                        {c.tenYearChangeRate != null && (
                          <span style={{ color: c.tenYearChangeRate >= 0 ? '#7DC8A0' : '#89CFF0', fontWeight: 600 }}>
                            {c.tenYearChangeRate >= 0 ? '+' : ''}{c.tenYearChangeRate}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {c.priceRange && (
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#4BAAD4' }}>{c.priceRange}</div>
                      )}
                      {/* 등급 배지 한 줄 */}
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end', marginTop: '3px' }}>
                        {commuteGrade && (
                          <span style={{ fontSize: '10px', fontWeight: 700, color: GRADE_COLORS[commuteGrade.grade], border: `1px solid ${GRADE_COLORS[commuteGrade.grade]}`, borderRadius: '3px', padding: '0 3px' }}>
                            교{commuteGrade.grade}
                          </span>
                        )}
                        {schoolGrade && (
                          <span style={{ fontSize: '10px', fontWeight: 700, color: GRADE_COLORS[schoolGrade], border: `1px solid ${GRADE_COLORS[schoolGrade]}`, borderRadius: '3px', padding: '0 3px' }}>
                            학{schoolGrade}
                          </span>
                        )}
                        <span style={{ fontSize: '10px', fontWeight: 700, color: GRADE_COLORS[infraGrade], border: `1px solid ${GRADE_COLORS[infraGrade]}`, borderRadius: '3px', padding: '0 3px' }}>
                          환{infraGrade}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;
