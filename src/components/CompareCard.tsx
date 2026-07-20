import React, { useState, useEffect, useCallback } from 'react';
import { ApartmentComplex, PriceHistory, ChartDataRow, ChartSeries, SchoolInfo, InfraInfo, formatPrice, toUkUnit, calcCommuteGrade } from '../types';
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

  const rows: ChartDataRow[] = histories.map(h => {
    const row: ChartDataRow = { date: h.recordDate };
    h.items.forEach(item => {
      const at = item.areaType || '';
      if (!at) return;
      if (item.price) row[`${at}-sale`] = toUkUnit(item.price);
      if (item.jeonsePrice) row[`${at}-jeonse`] = toUkUnit(item.jeonsePrice);
    });
    return row;
  });
  return { rows, series };
};

const CompareCard: React.FC<CompareCardProps> = ({ complex, onClose }) => {
  const [priceHistories, setPriceHistories] = useState<PriceHistory[]>([]);
  const [chartData, setChartData] = useState<{ rows: ChartDataRow[]; series: ChartSeries[] }>({ rows: [], series: [] });
  const [loading, setLoading] = useState(false);

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

  const latestHistory = priceHistories.length > 0 ? priceHistories[priceHistories.length - 1] : null;

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
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
          >
            ×
          </button>
        </div>
        {complex.price && (
          <div style={{ marginTop: '6px', fontSize: '18px', fontWeight: 700 }}>
            {formatPrice(complex.price)}
          </div>
        )}
      </div>

      {/* 본문 스크롤 영역 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

        {/* 단지 정보 */}
        <div style={{ marginBottom: '12px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368', marginBottom: '6px' }}>단지 정보</h4>
          <InfoRow label="연식" value={complex.builtYear} />
          <InfoRow label="세대수" value={complex.unitCount ? `${complex.unitCount}세대` : null} />
          <InfoRow label="주소" value={complex.address} />
          <InfoRow label="확인일자" value={complex.checkDate} />
          {/* 참고가 — 최신 시세 기록의 첫 항목 기준 */}
          <InfoRow label="호가" value={latestHistory?.items[0]?.askingPrice ? formatPrice(latestHistory.items[0].askingPrice) : null} />
          <InfoRow label="전고점" value={latestHistory?.items[0]?.highestPrice ? formatPrice(latestHistory.items[0].highestPrice) : null} />
          <InfoRow label="전저점" value={latestHistory?.items[0]?.lowestPrice ? formatPrice(latestHistory.items[0].lowestPrice) : null} />
          <InfoRow label="10년 등락" value={latestHistory?.items[0]?.tenYearChangeAmount != null
            ? `${latestHistory.items[0].tenYearChangeAmount >= 0 ? '+' : ''}${toUkUnit(latestHistory.items[0].tenYearChangeAmount)}억`
            : null} />
          <InfoRow label="등락률" value={latestHistory?.items[0]?.tenYearChangeRate != null
            ? `${latestHistory.items[0].tenYearChangeRate >= 0 ? '+' : ''}${latestHistory.items[0].tenYearChangeRate}%`
            : null} />
          {complex.memo && (
            <div style={{ padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: '11px', color: '#80868b' }}>메모  </span>
              <span style={{ fontSize: '11px', color: '#5f6368', whiteSpace: 'pre-wrap' }}>{complex.memo}</span>
            </div>
          )}
        </div>

        {/* 종합평가 */}
        <div style={{ marginBottom: '12px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368', marginBottom: '6px' }}>종합평가</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
            {([
              { label: '직장', grade: complex.grade ? { grade: complex.grade, color: GRADE_COLORS[complex.grade] ?? '#9e9e9e' } : null },
              { label: '교통', grade: calcCommuteGrade(complex.commuteTimes) },
              { label: '학군', grade: calcSchoolGrade(complex.schoolInfos ?? []) },
              { label: '환경', grade: calcInfraGrade(complex.infraInfos ?? []) },
            ] as { label: string; grade: { grade: string; color: string } | null }[]).map(({ label, grade }) => (
              <div key={label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                padding: '8px 4px', backgroundColor: '#f8f9fa',
                borderRadius: '7px', border: '1px solid #e8eaed',
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
            <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368', marginBottom: '6px' }}>지하철</h4>
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

        {/* 지역 직장 밀도 */}
        {complex.grade && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368' }}>직장 밀도</h4>
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

        {/* 학군 정보 */}
        {complex.schoolInfos && complex.schoolInfos.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368' }}>학군 정보</h4>
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

        {/* 주변 인프라 */}
        {complex.infraInfos && complex.infraInfos.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368' }}>주변 인프라</h4>
              {(() => {
                const g = calcInfraGrade(complex.infraInfos ?? []);
                return (
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff', backgroundColor: g.color, padding: '1px 7px', borderRadius: '10px' }}>
                    {g.grade}
                  </span>
                );
              })()}
            </div>
            {complex.infraInfos.map((inf: InfraInfo) => (
              <div key={inf.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Tag label={INFRA_TYPE_LABELS[inf.infraType] ?? inf.infraType} color='#f9ab00' />
                <span style={{ fontSize: '12px', color: '#202124', flex: 1 }}>{inf.infraName}</span>
                {inf.distance != null && (
                  <span style={{ fontSize: '11px', color: '#80868b', flexShrink: 0 }}>도보 {inf.distance}분</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 재개발 정보 */}
        {complex.redevelopType && (
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368', marginBottom: '6px' }}>재개발 정보</h4>
            <InfoRow label="유형" value={REDEVELOP_TYPE_LABELS[complex.redevelopType]} />
            {complex.redevelopStage && (
              <InfoRow label="진행단계" value={REDEVELOP_STAGE_LABELS[complex.redevelopStage]} />
            )}
          </div>
        )}

        {/* 임장 유형 */}
        {complex.visitType && (
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368', marginBottom: '6px' }}>임장 유형</h4>
            <div style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: '10px',
              backgroundColor: '#e8f0fe', color: '#1a73e8', fontSize: '12px', fontWeight: 600,
            }}>
              {VISIT_TYPE_LABELS[complex.visitType] ?? complex.visitType}
            </div>
          </div>
        )}

        {/* 주요 지구 소요시간 */}
        {complex.commuteTimes && complex.commuteTimes.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368' }}>주요 지구 소요시간</h4>
              <CommuteGradeBadge commuteTimes={complex.commuteTimes} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
              {complex.commuteTimes.map(ct => (
                <div key={ct.id} style={{
                  textAlign: 'center', padding: '7px 4px',
                  backgroundColor: '#f8f9fa', borderRadius: '7px', border: '1px solid #e8eaed',
                }}>
                  <div style={{ fontSize: '10px', color: '#80868b', marginBottom: '2px' }}>{ct.destination}</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a73e8' }}>{ct.minutes}분</div>
                  {ct.transferCount != null && (
                    <div style={{ fontSize: '9px', color: ct.transferCount === 0 ? '#34a853' : '#80868b', marginTop: '2px' }}>
                      {ct.transferCount === 0 ? '직통' : `환승 ${ct.transferCount}회`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 시세 변동 그래프 */}
        <div style={{ marginBottom: '12px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368', marginBottom: '6px' }}>시세 변동</h4>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#9e9e9e', fontSize: '12px' }}>로딩 중...</div>
          ) : (
            <PriceChart rows={chartData.rows} series={chartData.series} />
          )}
        </div>

        {/* 최근 시세 3건 */}
        {priceHistories.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368', marginBottom: '6px' }}>최근 기록</h4>
            {[...priceHistories].reverse().slice(0, 3).map(h => (
              <div key={h.id} style={{ marginBottom: '6px', backgroundColor: '#f8f9fa', borderRadius: '5px', padding: '7px 9px' }}>
                <div style={{ fontSize: '10px', color: '#80868b', marginBottom: '3px' }}>
                  {h.recordDate}{h.memo && <span style={{ marginLeft: '6px' }}>{h.memo}</span>}
                </div>
                {h.items.map(item => (
                  <div key={item.id} style={{ padding: '2px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <span style={{ color: '#5f6368' }}>
                        {item.areaType || '-'}{item.floor ? ` · ${item.floor}층` : ''}
                      </span>
                      <span style={{ fontWeight: 600, color: '#202124' }}>{formatPrice(item.price)}</span>
                      {item.jeonseRate != null && (
                        <span style={{ fontSize: '10px', color: '#1a73e8' }}>전세율 {item.jeonseRate.toFixed(0)}%</span>
                      )}
                    </div>
                    {/* 참고가 chips */}
                    {(item.askingPrice || item.highestPrice || item.lowestPrice || item.tenYearChangeAmount || item.tenYearChangeRate) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
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
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompareCard;
