import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApartmentComplex, PriceHistory, PriceHistoryItem, ChartDataRow, ChartSeries, SchoolInfo, InfraInfo, formatPrice, toUkUnit, calcCommuteGrade } from '../types';
import { getPriceHistories } from '../services/api';
import PriceChart from './PriceChart';
import CommuteGradeBadge from './CommuteGradeBadge';

interface CompareCardProps {
  complex: ApartmentComplex;
  onClose: () => void; // 닫기 = 비교 목록에서 제거 + 체크박스 해제
}

const InfoRow: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: '11px', color: '#80868b', flexShrink: 0, marginRight: '8px' }}>{label}</span>
      <span style={{ fontSize: '12px', color: '#202124', textAlign: 'right' }}>{value}</span>
    </div>
  );
};

// ComplexInfoPanel과 동일한 레이블 맵
const REDEVELOP_TYPE_LABELS: Record<string, string> = {
  REDEVELOPMENT: '재개발', RECONSTRUCTION: '재건축', REMODELING: '리모델링',
};
const REDEVELOP_STAGE_LABELS: Record<string, string> = {
  INITIAL: '정비구역 지정', COMMITTEE: '추진위원회 구성 및 승인',
  ASSOCIATION: '조합 설립 인가', APPROVAL: '사업시행인가',
  MGMT_APPROVAL: '관리처분인가', RELOCATION: '이주·철거 및 착공', COMPLETION: '준공 및 입주',
};
const VISIT_TYPE_LABELS: Record<string, string> = {
  ATMOSPHERE: '분위기 임장', COMPLEX: '단지 임장', LISTING: '매물 임장', NONE: '임장X',
};
const SCHOOL_TYPE_LABELS: Record<string, string> = {
  ELEMENTARY: '초등', MIDDLE: '중학',
};
const INFRA_TYPE_LABELS: Record<string, string> = {
  DEPARTMENT_STORE: '백화점', MART: '마트', HOSPITAL: '병원', ETC: '기타',
};
const GRADE_COLORS: Record<string, string> = {
  S: '#ea4335', A: '#f9ab00', B: '#34a853', C: '#1a73e8',
};

const formatCount = (n: number): string =>
  n >= 10000 ? `${Math.round(n / 10000)}만` : n.toLocaleString();

// areaType 문자열에서 숫자 추출 ("전용 84" → 84)
const areaTypeNum = (at: string) => parseFloat(at.replace(/[^0-9.]/g, '')) || 0;

// 중학교 학업성취도 기준 학군 등급
const calcSchoolGrade = (
  schoolInfos: SchoolInfo[]
): { grade: 'S' | 'A' | 'B' | 'C'; color: string } | null => {
  const scores = schoolInfos
    .filter(s => s.schoolType === 'MIDDLE' && s.achievementScore != null)
    .map(s => s.achievementScore!);
  if (scores.length === 0) return null;
  const best = Math.max(...scores);
  if (best >= 95) return { grade: 'S', color: '#ea4335' };
  if (best >= 90) return { grade: 'A', color: '#f9ab00' };
  if (best >= 85) return { grade: 'B', color: '#34a853' };
  return { grade: 'C', color: '#1a73e8' };
};

// 인프라 등급 — 인프라 없어도 항상 반환
const calcInfraGrade = (
  infraInfos: InfraInfo[]
): { grade: 'S' | 'A' | 'B' | 'C'; color: string } => {
  const deptCount = infraInfos.filter(i => i.infraType === 'DEPARTMENT_STORE').length;
  const martCount = infraInfos.filter(i => i.infraType === 'MART').length;
  if (deptCount >= 2) return { grade: 'S', color: '#ea4335' };
  if (deptCount >= 1) return { grade: 'A', color: '#f9ab00' };
  if (martCount >= 1) return { grade: 'B', color: '#34a853' };
  return { grade: 'C', color: '#1a73e8' };
};

// 인라인 뱃지 — 학교유형·인프라유형 등 짧은 분류 태그
const Tag: React.FC<{ label: string; color?: string }> = ({ label, color = '#5f6368' }) => (
  <span style={{
    fontSize: '9px', fontWeight: 700, color: '#fff',
    backgroundColor: color, padding: '1px 5px', borderRadius: '7px',
    whiteSpace: 'nowrap', flexShrink: 0,
  }}>{label}</span>
);

const SALE_COLORS = ['#1a73e8', '#4285f4', '#185abc', '#669df6'];
const JEONSE_COLORS = ['#ea4335', '#c62828', '#ef5350', '#e57373'];

// 같은 날짜 기록이 여러 개일 때 하나의 row로 병합 — ComplexInfoPanel과 동일
const buildChartData = (histories: PriceHistory[]): { rows: ChartDataRow[]; series: ChartSeries[] } => {
  const seen = new Set<string>();
  const areaTypes: string[] = [];
  histories.flatMap(h => h.items.map(i => i.areaType || '').filter(Boolean))
    .forEach(at => { if (!seen.has(at)) { seen.add(at); areaTypes.push(at); } });

  const series: ChartSeries[] = [];
  areaTypes.forEach((at, idx) => {
    series.push({ key: `${at}-sale`, label: `${at} 매매`, areaType: at, type: 'sale', color: SALE_COLORS[idx % SALE_COLORS.length] });
    const hasJeonse = histories.some(h => h.items.some(i => i.areaType === at && i.jeonsePrice));
    if (hasJeonse) {
      series.push({ key: `${at}-jeonse`, label: `${at} 전세`, areaType: at, type: 'jeonse', color: JEONSE_COLORS[idx % JEONSE_COLORS.length] });
    }
  });

  const dateMap = new Map<string, ChartDataRow>();
  const rows: ChartDataRow[] = [];
  histories.forEach(h => {
    if (!dateMap.has(h.recordDate)) {
      const newRow: ChartDataRow = { date: h.recordDate };
      dateMap.set(h.recordDate, newRow);
      rows.push(newRow);
    }
    const row = dateMap.get(h.recordDate)!;
    h.items.forEach(item => {
      const at = item.areaType || '';
      if (!at) return;
      if (item.price) row[`${at}-sale`] = toUkUnit(item.price);
      if (item.jeonsePrice) row[`${at}-jeonse`] = toUkUnit(item.jeonsePrice);
    });
  });
  return { rows, series };
};

const CompareCard: React.FC<CompareCardProps> = ({ complex, onClose }) => {
  const [priceHistories, setPriceHistories] = useState<PriceHistory[]>([]);
  const [chartData, setChartData] = useState<{ rows: ChartDataRow[]; series: ChartSeries[] }>({ rows: [], series: [] });
  const [loading, setLoading] = useState(false);
  // 참고가 탭 — 선택된 areaType (빈 문자열이면 전체)
  const [selectedRefTab, setSelectedRefTab] = useState<string>('');

  const loadHistories = useCallback(async () => {
    setLoading(true);
    try {
      const histories = await getPriceHistories(complex.id);
      setPriceHistories(histories);
      setChartData(buildChartData(histories));
    } catch {
      // 조회 실패 시 빈 상태 유지
    } finally {
      setLoading(false);
    }
  }, [complex.id]);

  useEffect(() => {
    loadHistories();
  }, [loadHistories]);

  // 전체 히스토리에서 areaType별 최신 item 수집 — 평형별 별도 등록이어도 모두 포함
  const latestItemPerAreaType = (() => {
    const map = new Map<string, PriceHistoryItem>();
    priceHistories.forEach(h => {
      h.items.forEach(item => {
        if (item.areaType) map.set(item.areaType, item);
      });
    });
    return map;
  })();

  const workSectionRef = useRef<HTMLDivElement>(null);
  const commuteSectionRef = useRef<HTMLDivElement>(null);
  const schoolSectionRef = useRef<HTMLDivElement>(null);
  const infraSectionRef = useRef<HTMLDivElement>(null);

  // window 커스텀 이벤트로 발행 → 모든 카드가 동시에 수신해 각자 스크롤
  const scrollToSection = (sectionKey: string) => {
    window.dispatchEvent(new CustomEvent('compare-section-scroll', { detail: sectionKey }));
  };

  useEffect(() => {
    const refMap: Record<string, React.RefObject<HTMLDivElement>> = {
      work: workSectionRef,
      commute: commuteSectionRef,
      school: schoolSectionRef,
      infra: infraSectionRef,
    };
    const handler = (e: Event) => {
      const section = (e as CustomEvent<string>).detail;
      refMap[section]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('compare-section-scroll', handler);
    return () => window.removeEventListener('compare-section-scroll', handler);
  }, []); // refs는 컴포넌트 생명주기 동안 동일 객체 유지

  // 헤더용 평형별 가격 목록 (숫자 오름차순)
  const headerPriceItems = Array.from(latestItemPerAreaType.entries())
    .filter(([, item]) => item.price)
    .sort(([a], [b]) => areaTypeNum(a) - areaTypeNum(b));

  return (
    <div style={{
      flex: 1,
      minWidth: '280px',
      height: '100%',
      backgroundColor: '#fff',
      borderRight: '1px solid #e8eaed',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* 헤더 — 파란 배경, 단지명/가격/닫기 */}
      <div style={{
        padding: '12px 14px',
        backgroundColor: '#1a73e8',
        color: '#fff',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '10px', opacity: 0.85, marginBottom: '2px' }}>
              {complex.priceRange} | {complex.region}
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.3, margin: 0, wordBreak: 'break-all' }}>
              {complex.complexName}
            </h3>
          </div>
          {/* 닫기 버튼 — 비교 목록 제거 + 체크박스 해제 */}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
              width: '26px', height: '26px', cursor: 'pointer', color: '#fff',
              fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginLeft: '8px',
            }}
          >×</button>
        </div>
        {/* 평형별 가격 — latestItemPerAreaType 기반으로 모든 평형 표시 */}
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {headerPriceItems.length > 0 ? (
            <div style={{ fontSize: '15px', fontWeight: 700, display: 'flex', flexWrap: 'wrap', gap: '2px', flex: 1 }}>
              {headerPriceItems.map(([at, item], idx) => (
                <span key={at} style={{ whiteSpace: 'nowrap' }}>
                  {idx > 0 && <span style={{ opacity: 0.5, margin: '0 3px' }}>|</span>}
                  {formatPrice(item.price!)}
                  <span style={{ fontSize: '10px', fontWeight: 400, opacity: 0.8, marginLeft: '2px' }}>({at})</span>
                </span>
              ))}
            </div>
          ) : complex.price ? (
            <div style={{ fontSize: '18px', fontWeight: 700 }}>{formatPrice(complex.price)}</div>
          ) : null}
          {/* 즐겨찾기 — 읽기 전용 */}
          {complex.isFavorite && <span style={{ fontSize: '18px', color: '#f9ab00', lineHeight: 1 }}>★</span>}
        </div>
      </div>

      {/* 본문 스크롤 영역 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

        {/* 단지 정보 */}
        <div style={{ marginBottom: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '6px' }}>단지 정보</h4>
          <InfoRow label="연식" value={complex.builtYear} />
          <InfoRow label="세대수" value={complex.unitCount ? `${complex.unitCount}세대` : null} />
          <InfoRow label="경사도" value={
            complex.slopeType ? ({ FLAT: '평지', GENTLE: '완경사', MODERATE: '중경사', STEEP: '급경사' } as Record<string,string>)[complex.slopeType] ?? null : null
          } />
          <InfoRow label="아파트구조" value={
            complex.buildingStructure ? ({ STAIRCASE: '계단식', CORRIDOR: '복도식', MIXED: '혼합식' } as Record<string,string>)[complex.buildingStructure] ?? null : null
          } />
          <InfoRow label="용적률" value={complex.floorAreaRatio != null ? `${complex.floorAreaRatio}%` : null} />
          <InfoRow label="주소" value={complex.address} />
          <InfoRow label="확인일자" value={complex.checkDate} />
          {/* 평형별 참고가 — 탭 버튼으로 선택, 선택된 areaType 참고가만 표시 */}
          {latestItemPerAreaType.size > 0 && (() => {
            const sortedEntries = Array.from(latestItemPerAreaType.entries())
              .sort(([a], [b]) => areaTypeNum(a) - areaTypeNum(b));
            // selectedRefTab이 없으면 첫 번째 areaType으로 초기화
            const activeTab = selectedRefTab || sortedEntries[0]?.[0] || '';
            const activeItem = latestItemPerAreaType.get(activeTab);
            return (
              <>
                {/* 평형 탭 버튼 목록 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '6px 0 4px' }}>
                  {sortedEntries.map(([at]) => (
                    <button
                      key={at}
                      onClick={() => setSelectedRefTab(at)}
                      style={{
                        fontSize: '10px', fontWeight: 600,
                        padding: '2px 8px', borderRadius: '10px', cursor: 'pointer', border: 'none',
                        backgroundColor: activeTab === at ? '#1a73e8' : '#e8eaed',
                        color: activeTab === at ? '#fff' : '#5f6368',
                      }}
                    >{at}</button>
                  ))}
                </div>
                {/* 선택된 탭의 가격 + 참고가 — ComplexInfoPanel과 동일 항목 순서 */}
                {activeItem && (
                  <>
                    <InfoRow label="매매가" value={activeItem.price ? formatPrice(activeItem.price) : null} />
                    <InfoRow label="전세가" value={activeItem.jeonsePrice ? formatPrice(activeItem.jeonsePrice) : null} />
                    <InfoRow label="전세율" value={activeItem.jeonseRate != null
                      ? `${activeItem.jeonseRate.toFixed(1)}%`
                      : (activeItem.price && activeItem.jeonsePrice)
                        ? `${(activeItem.jeonsePrice / activeItem.price * 100).toFixed(1)}%`
                        : null} />
                    <InfoRow label="KB시세" value={activeItem.kbPrice ? formatPrice(activeItem.kbPrice) : null} />
                    <InfoRow label="호가" value={activeItem.askingPrice ? formatPrice(activeItem.askingPrice) : null} />
                    <InfoRow label="전고점" value={activeItem.highestPrice ? formatPrice(activeItem.highestPrice) : null} />
                    <InfoRow label="전저점" value={activeItem.lowestPrice ? formatPrice(activeItem.lowestPrice) : null} />
                    <InfoRow label="10년 등락" value={activeItem.tenYearChangeAmount != null
                      ? `${activeItem.tenYearChangeAmount >= 0 ? '+' : ''}${toUkUnit(activeItem.tenYearChangeAmount)}억`
                      : null} />
                    <InfoRow label="등락률" value={activeItem.tenYearChangeRate != null
                      ? `${activeItem.tenYearChangeRate >= 0 ? '+' : ''}${activeItem.tenYearChangeRate}%`
                      : null} />
                  </>
                )}
              </>
            );
          })()}
          {complex.memo && (
            <div style={{ padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>메모</div>
              <div style={{ fontSize: '11px', color: '#5f6368', whiteSpace: 'pre-wrap' }}>{complex.memo}</div>
            </div>
          )}
        </div>

        {/* 종합평가 */}
        <div style={{ marginBottom: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '6px' }}>종합평가</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
            {([
              { label: '직장', grade: complex.grade ? { grade: complex.grade, color: GRADE_COLORS[complex.grade] ?? '#9e9e9e' } : null, sectionKey: 'work' },
              { label: '교통', grade: calcCommuteGrade(complex.commuteTimes), sectionKey: 'commute' },
              { label: '학군', grade: calcSchoolGrade(complex.schoolInfos ?? []), sectionKey: 'school' },
              { label: '환경', grade: calcInfraGrade(complex.infraInfos ?? []), sectionKey: 'infra' },
            ] as { label: string; grade: { grade: string; color: string } | null; sectionKey: string }[]).map(({ label, grade, sectionKey }) => (
              <div key={label} onClick={() => scrollToSection(sectionKey)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                padding: '8px 4px', backgroundColor: '#f8f9fa',
                borderRadius: '7px', border: '1px solid #e8eaed',
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: '11px', color: '#80868b', fontWeight: 500 }}>{label}</span>
                {grade ? (
                  <span style={{
                    fontSize: '13px', fontWeight: 800, color: '#fff',
                    backgroundColor: grade.color, padding: '1px 8px', borderRadius: '10px',
                  }}>
                    {grade.grade}
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: '#bdbdbd', fontWeight: 600 }}>-</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 지하철 */}
        {complex.subwayInfos && complex.subwayInfos.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '6px' }}>지하철</h4>
            {complex.subwayInfos.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: '12px', color: '#202124' }}>{s.stationName}</span>
                <span style={{ fontSize: '11px', color: '#80868b' }}>
                  {s.subwayLines}{s.walkingMinutes ? ` · 도보 ${s.walkingMinutes}분` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 직장 밀도 */}
        {complex.grade && (
          <div ref={workSectionRef} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054' }}>직장</h4>
              <span style={{
                fontSize: '11px', fontWeight: 800, color: '#fff',
                backgroundColor: GRADE_COLORS[complex.grade] ?? '#9e9e9e',
                padding: '1px 7px', borderRadius: '10px',
              }}>
                {complex.grade}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '14px', padding: '4px 0' }}>
              {complex.employees != null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', color: '#80868b' }}>종사자수</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#202124' }}>{formatCount(complex.employees)}명</span>
                </div>
              )}
              {complex.businesses != null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', color: '#80868b' }}>사업체수</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#202124' }}>{formatCount(complex.businesses)}개</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 교통 — 항상 표시, 데이터 없으면 안내 문구 */}
        <div ref={commuteSectionRef} style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054' }}>교통</h4>
            {complex.commuteTimes && complex.commuteTimes.length > 0 && (
              <CommuteGradeBadge commuteTimes={complex.commuteTimes} />
            )}
          </div>
          {complex.commuteTimes && complex.commuteTimes.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
              {complex.commuteTimes.map(ct => (
                <div key={ct.id} style={{
                  textAlign: 'center', padding: '7px 4px',
                  backgroundColor: '#f8f9fa', borderRadius: '7px', border: '1px solid #e8eaed',
                }}>
                  <div style={{ fontSize: '10px', color: '#80868b', marginBottom: '2px' }}>
                    {ct.destination}
                    {ct.distanceKm != null && (
                      <span style={{ marginLeft: '3px', fontSize: '9px', color: '#b0b8c1' }}>{ct.distanceKm}km</span>
                    )}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a73e8' }}>{ct.minutes}분</div>
                  {ct.transferCount != null && (
                    <div style={{ marginTop: '3px' }}>
                      <div style={{ fontSize: '9px', color: ct.transferCount === 0 ? '#34a853' : '#80868b', fontWeight: ct.transferCount === 0 ? 600 : 400 }}>
                        {ct.transferCount === 0 ? '직통' : `환승 ${ct.transferCount}회`}
                      </div>
                      {ct.transferLines && (
                        <div style={{ fontSize: '9px', color: '#5f6368', marginTop: '2px', lineHeight: 1.4 }}>
                          {ct.transferLines.split(' ➡️ ').map((line, i, arr) => (
                            <span key={i}>
                              <span style={{ fontWeight: 600 }}>{line}</span>
                              {i < arr.length - 1 && <span style={{ color: '#fbbc04', margin: '0 1px' }}> ➡ </span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#9e9e9e' }}>출퇴근 시간 정보 없음</div>
          )}
        </div>

        {/* 학군 */}
        {complex.schoolInfos && complex.schoolInfos.length > 0 && (
          <div ref={schoolSectionRef} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054' }}>학군</h4>
              {(() => {
                const g = calcSchoolGrade(complex.schoolInfos ?? []);
                return g ? (
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff', backgroundColor: g.color, padding: '1px 7px', borderRadius: '10px' }}>
                    {g.grade}
                  </span>
                ) : null;
              })()}
            </div>
            {complex.schoolInfos.map((s: SchoolInfo) => (
              <div key={s.id} style={{ padding: '5px 0', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Tag
                    label={SCHOOL_TYPE_LABELS[s.schoolType] ?? s.schoolType}
                    color={s.schoolType === 'MIDDLE' ? '#1a73e8' : '#34a853'}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#202124', flex: 1 }}>{s.schoolName}</span>
                  {s.walkingMinutes != null && (
                    <span style={{ fontSize: '11px', color: '#80868b', flexShrink: 0 }}>도보 {s.walkingMinutes}분</span>
                  )}
                </div>
                {(s.achievementScore != null || s.totalStudents != null) && (
                  <div style={{ display: 'flex', gap: '10px', paddingLeft: '2px' }}>
                    {s.achievementScore != null && (
                      <span style={{ fontSize: '10px', color: '#5f6368' }}>학업성취도 {s.achievementScore}%</span>
                    )}
                    {s.totalStudents != null && (
                      <span style={{ fontSize: '10px', color: '#5f6368' }}>전교생 {s.totalStudents.toLocaleString()}명</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 환경 (주변 인프라) — 항상 표시, 등급 배지 항상 */}
        <div ref={infraSectionRef} style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054' }}>환경</h4>
            {(() => {
              const g = calcInfraGrade(complex.infraInfos ?? []);
              return (
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff', backgroundColor: g.color, padding: '1px 7px', borderRadius: '10px' }}>
                  {g.grade}
                </span>
              );
            })()}
          </div>
          {complex.infraInfos && complex.infraInfos.length > 0 ? (
            complex.infraInfos.map((inf: InfraInfo) => (
              <div key={inf.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Tag label={INFRA_TYPE_LABELS[inf.infraType] ?? inf.infraType} color='#f9ab00' />
                <span style={{ fontSize: '12px', color: '#202124', flex: 1 }}>{inf.infraName}</span>
                {inf.distance != null && (
                  <span style={{ fontSize: '11px', color: '#80868b', flexShrink: 0 }}>도보 {inf.distance}분</span>
                )}
              </div>
            ))
          ) : (
            <div style={{ fontSize: '11px', color: '#9e9e9e' }}>인프라 정보 없음</div>
          )}
        </div>

        {/* 유해시설 */}
        {(complex.hazardInfos ?? []).length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '6px' }}>유해시설</h4>
            {complex.hazardInfos!.map(h => (
              <div key={h.id} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                {(h.macroCategory || h.subCategory) && (
                  <div style={{ display: 'flex', gap: '3px', marginBottom: '2px', flexWrap: 'wrap' }}>
                    {h.macroCategory && (
                      <span style={{ fontSize: '9px', background: '#fce8e6', color: '#c5221f', borderRadius: '4px', padding: '1px 5px', fontWeight: 600 }}>
                        {h.macroCategory}
                      </span>
                    )}
                    {h.subCategory && (
                      <span style={{ fontSize: '9px', background: '#f1f3f4', color: '#5f6368', borderRadius: '4px', padding: '1px 5px' }}>
                        {h.subCategory}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#202124', flex: 1 }}>{h.hazardName}</span>
                  {h.distance != null && (
                    <span style={{ fontSize: '10px', color: '#80868b', flexShrink: 0 }}>{h.distance}m</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 재개발 정보 */}
        {complex.redevelopType && (
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '6px' }}>재개발 정보</h4>
            <InfoRow label="유형" value={REDEVELOP_TYPE_LABELS[complex.redevelopType]} />
            {complex.redevelopStage && (
              <InfoRow label="진행단계" value={REDEVELOP_STAGE_LABELS[complex.redevelopStage]} />
            )}
          </div>
        )}

        {/* 임장 유형 — 항상 표시 (NONE 포함) */}
        <div style={{ marginBottom: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '6px' }}>임장 유형</h4>
          <div style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: '10px',
            backgroundColor: '#e8f0fe', color: '#1a73e8', fontSize: '12px', fontWeight: 600,
          }}>
            {VISIT_TYPE_LABELS[complex.visitType ?? 'NONE'] ?? complex.visitType ?? '임장X'}
          </div>
        </div>

        {/* 시세 변동 그래프 */}
        <div style={{ marginBottom: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '6px' }}>시세 변동</h4>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#9e9e9e', fontSize: '12px' }}>로딩 중...</div>
          ) : (
            <PriceChart rows={chartData.rows} series={chartData.series} />
          )}
        </div>

        {/* 최근 기록 5건 — 직전 기록 대비 변동률 포함 */}
        {priceHistories.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '6px' }}>최근 기록</h4>
            {(() => {
              const reversed = [...priceHistories].reverse();
              return reversed.slice(0, 5).map((h, idx) => {
                const prevH = reversed[idx + 1];
                return (
                  <div key={h.id} style={{ marginBottom: '6px', backgroundColor: '#f8f9fa', borderRadius: '5px', padding: '7px 9px' }}>
                    <div style={{ fontSize: '10px', color: '#80868b', marginBottom: '3px' }}>
                      {h.recordDate}{h.memo && <span style={{ marginLeft: '6px' }}>{h.memo}</span>}
                    </div>
                    {h.items.map(item => {
                      const prevItem = prevH?.items.find(p => p.areaType === item.areaType);
                      const delta = prevItem && item.price && prevItem.price ? item.price - prevItem.price : null;
                      const rate = delta !== null && prevItem && prevItem.price > 0
                        ? (delta / prevItem.price) * 100 : null;
                      return (
                        <div key={item.id} style={{ padding: '2px 0', borderBottom: '1px solid #f0f0f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                            <span style={{ color: '#5f6368' }}>
                              {item.areaType || '-'}{item.floor ? ` · ${item.floor}층` : ''}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ fontWeight: 600, color: '#202124' }}>{formatPrice(item.price)}</span>
                              {delta !== null && delta !== 0 && rate !== null && (
                                <span style={{ fontSize: '9px', fontWeight: 700, color: delta > 0 ? '#c5221f' : '#1a73e8' }}>
                                  {delta > 0 ? '▲' : '▼'} {formatPrice(Math.abs(delta))} ({delta > 0 ? '+' : ''}{rate.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                            {item.jeonseRate != null && (
                              <span style={{ fontSize: '10px', color: '#1a73e8' }}>전세율 {item.jeonseRate.toFixed(0)}%</span>
                            )}
                          </div>
                          {(item.kbPrice || item.askingPrice || item.highestPrice || item.lowestPrice || item.tenYearChangeAmount || item.tenYearChangeRate != null) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                              {item.kbPrice && <span style={{ fontSize: '9px', color: '#80868b' }}>KB {formatPrice(item.kbPrice)}</span>}
                              {item.askingPrice && <span style={{ fontSize: '9px', color: '#80868b' }}>호가 {formatPrice(item.askingPrice)}</span>}
                              {item.highestPrice && <span style={{ fontSize: '9px', color: '#80868b' }}>전고점 {formatPrice(item.highestPrice)}</span>}
                              {item.lowestPrice && <span style={{ fontSize: '9px', color: '#80868b' }}>전저점 {formatPrice(item.lowestPrice)}</span>}
                              {(item.tenYearChangeAmount || item.tenYearChangeRate != null) && (
                                <span style={{ fontSize: '9px', color: '#80868b' }}>
                                  10년{item.tenYearChangeAmount ? ` ${formatPrice(item.tenYearChangeAmount)}` : ''}
                                  {item.tenYearChangeRate != null ? ` (${item.tenYearChangeRate}%)` : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompareCard;
