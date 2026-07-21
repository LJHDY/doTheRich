import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApartmentComplex, PriceHistory, PriceHistoryRequest, ChartDataRow, ChartSeries, formatPrice, toUkUnit, SchoolInfo, InfraInfo, calcCommuteGrade } from '../types';
import { getPriceHistories, addPriceHistory, updateComplexMemo, deleteComplex } from '../services/api';
import PriceChart from './PriceChart';
import PriceInputForm from './PriceInputForm';
import CommuteGradeBadge from './CommuteGradeBadge';
import { useNumberedTextarea } from '../hooks/useNumberedTextarea';

interface ComplexInfoPanelProps {
  complex: ApartmentComplex | null;
  onClose: () => void;
  onMemoUpdate?: (complexId: number, memo: string) => void;
  onDelete?: (complexId: number) => void;
}

// 값이 없으면 행 자체를 렌더링하지 않아 불필요한 빈 줄 방지
const InfoRow: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0, marginRight: '8px' }}>{label}</span>
      <span style={{ fontSize: '13px', color: '#202124', textAlign: 'right' }}>{value}</span>
    </div>
  );
};

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

// 중학교 학업성취도 기준 학군 등급 — 중학교 없거나 점수 없으면 null
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

// 인프라 등급 — 백화점 2개↑=S, 1개=A, 대형마트 1개↑=B, 그외=C / 인프라 없어도 항상 표시
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

// 인라인 뱃지 — 학교유형·인프라유형 등 짧은 분류 태그 표시용
const Tag: React.FC<{ label: string; color?: string }> = ({ label, color = '#5f6368' }) => (
  <span style={{
    fontSize: '10px', fontWeight: 700, color: '#fff',
    backgroundColor: color, padding: '1px 6px', borderRadius: '8px',
    whiteSpace: 'nowrap', flexShrink: 0,
  }}>{label}</span>
);

// S/A/B/C 등급 → 색상 매핑 (직장밀도·학군·인프라 공통)
const GRADE_COLORS: Record<string, string> = {
  S: '#ea4335', A: '#f9ab00', B: '#34a853', C: '#1a73e8',
};

// 만 단위 축약 (240689 → "24만", 9500 → "9,500")
const formatCount = (n: number): string =>
  n >= 10000 ? `${Math.round(n / 10000)}만` : n.toLocaleString();

// 매매가: 파란 계열 / 전세가: 빨간 계열 — 평형 수만큼 순환 사용
const SALE_COLORS = ['#1a73e8', '#4285f4', '#185abc', '#669df6'];
const JEONSE_COLORS = ['#ea4335', '#c62828', '#ef5350', '#e57373'];

// PriceHistory 배열을 recharts용 다중 시리즈 데이터로 변환
const buildChartData = (
  histories: PriceHistory[]
): { rows: ChartDataRow[]; series: ChartSeries[] } => {
  // 전체 히스토리에서 등장한 areaType 목록 (순서 유지, 중복 제거)
  const seen = new Set<string>();
  const areaTypes: string[] = [];
  histories.flatMap(h => h.items.map(i => i.areaType || '').filter(Boolean))
    .forEach(at => { if (!seen.has(at)) { seen.add(at); areaTypes.push(at); } });

  const series: ChartSeries[] = [];
  areaTypes.forEach((at, idx) => {
    // 매매가 시리즈
    series.push({
      key: `${at}-sale`,
      label: `${at} 매매`,
      areaType: at,
      type: 'sale',
      color: SALE_COLORS[idx % SALE_COLORS.length],
    });
    // 전세가 데이터가 하나라도 있는 평형만 전세 시리즈 추가
    const hasJeonse = histories.some(h =>
      h.items.some(i => i.areaType === at && i.jeonsePrice)
    );
    if (hasJeonse) {
      series.push({
        key: `${at}-jeonse`,
        label: `${at} 전세`,
        areaType: at,
        type: 'jeonse',
        color: JEONSE_COLORS[idx % JEONSE_COLORS.length],
      });
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

const ComplexInfoPanel: React.FC<ComplexInfoPanelProps> = ({ complex, onClose, onMemoUpdate, onDelete }) => {
  const [priceHistories, setPriceHistories] = useState<PriceHistory[]>([]);
  const [chartData, setChartData] = useState<{ rows: ChartDataRow[]; series: ChartSeries[] }>(() => ({ rows: [], series: [] }));
  const [showInputForm, setShowInputForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 차트 평형 필터 — '' = 전체, '전용 59' 등 선택 시 해당 타입의 매매/전세 세트만 표시
  const [selectedAreaType, setSelectedAreaType] = useState('');

  // 메모 인라인 편집 상태 — displayMemo는 저장 즉시 반영, complex.memo는 서버 원본
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoText, setMemoText] = useState('');
  const [displayMemo, setDisplayMemo] = useState('');
  const memoHook = useNumberedTextarea(memoText, setMemoText);
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  const [showRecordTooltip, setShowRecordTooltip] = useState(false);
  const [showStageTooltip, setShowStageTooltip] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 종합평가 카드 클릭 시 해당 섹션으로 스크롤
  const workSectionRef = useRef<HTMLDivElement>(null);
  const commuteSectionRef = useRef<HTMLDivElement>(null);
  const schoolSectionRef = useRef<HTMLDivElement>(null);
  const infraSectionRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 시세 기록 로드 후 차트용 억 단위 데이터 포인트로 변환
  const loadPriceHistories = useCallback(async (complexId: number) => {
    setLoading(true);
    try {
      const histories = await getPriceHistories(complexId);
      setPriceHistories(histories);
      // 평형별·매매/전세별 다중 시리즈로 변환
      setChartData(buildChartData(histories));
    } catch (e) {
      console.error('시세 기록 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // 선택 단지가 바뀌면 이전 데이터·상태를 초기화하고 새로 조회
  useEffect(() => {
    if (complex) {
      setPriceHistories([]);
      setChartData({ rows: [], series: [] });
      setShowInputForm(false);
      setSuccessMsg(null);
      // 차트 필터·메모 상태도 초기화 — 새 단지 선택 시 이전 상태 버림
      setSelectedAreaType('');
      setEditingMemo(false);
      setMemoText(complex.memo || '');
      setDisplayMemo(complex.memo || '');
      setMemoError(null);
      loadPriceHistories(complex.id);
    }
  }, [complex, loadPriceHistories]);

  // 메모 저장 — PATCH 성공 시 로컬 displayMemo를 즉시 갱신 (재조회 불필요)
  const handleMemoSave = async () => {
    if (!complex) return;
    setMemoSaving(true);
    setMemoError(null);
    try {
      await updateComplexMemo(complex.id, memoText);
      setDisplayMemo(memoText);
      setEditingMemo(false);
      // 부모 상태(complexes, selectedComplex)에도 즉시 반영 — 다른 단지 갔다 와도 유지됨
      onMemoUpdate?.(complex.id, memoText);
    } catch {
      setMemoError('저장에 실패했습니다.');
    } finally {
      setMemoSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!complex) return;
    setDeleting(true);
    try {
      await deleteComplex(complex.id);
      onDelete?.(complex.id);
      onClose();
    } catch {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const handlePriceSubmit = async (request: PriceHistoryRequest) => {
    if (!complex) return;
    await addPriceHistory(complex.id, request);
    setShowInputForm(false);
    setSuccessMsg('시세가 저장되었습니다!');
    await loadPriceHistories(complex.id);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  if (!complex) {
    return (
      <div
        style={{
          width: '360px',
          height: '100%',
          backgroundColor: '#fff',
          borderLeft: '1px solid #e8eaed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '12px',
          color: '#9e9e9e',
          fontSize: '14px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '40px' }}>🏢</div>
        <p>지도에서 단지 마커를 클릭하면<br />상세 정보가 표시됩니다</p>
      </div>
    );
  }

  const latestHistory = priceHistories.length > 0 ? priceHistories[priceHistories.length - 1] : null;
  const firstHistory = priceHistories.length > 1 ? priceHistories[0] : null;

  // 차트에 표시되는 평형 목록 (선택박스 옵션 생성용, 중복 제거)
  const seen = new Set<string>();
  const areaTypes: string[] = [];
  chartData.series.forEach(s => {
    if (!seen.has(s.areaType)) { seen.add(s.areaType); areaTypes.push(s.areaType); }
  });

  // 선택된 타입의 대표 매매가로 변동폭 계산 — 전체일 때는 첫 번째 평형 기준
  const getPriceForType = (history: typeof latestHistory) => {
    if (!history) return undefined;
    if (selectedAreaType) return history.items.find(i => i.areaType === selectedAreaType)?.price;
    return history.items[0]?.price;
  };
  const latestPrice = getPriceForType(latestHistory);
  const firstPrice = getPriceForType(firstHistory);
  const priceChange = latestPrice != null && firstPrice != null ? latestPrice - firstPrice : null;

  // 셀렉트박스 선택에 따라 해당 평형의 매매+전세 시리즈만 필터링 (세트로 묶임)
  const filteredSeries = selectedAreaType
    ? chartData.series.filter(s => s.areaType === selectedAreaType)
    : chartData.series;

  return (
    <div
      style={{
        width: '360px',
        height: '100%',
        backgroundColor: '#fff',
        borderLeft: '1px solid #e8eaed',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #e8eaed',
          backgroundColor: '#1a73e8',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '4px' }}>
              {complex.priceRange} | {complex.region}
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.3 }}>
              {complex.complexName}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              color: '#fff',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
        {complex.price && (
          <div style={{ marginTop: '8px', fontSize: '20px', fontWeight: 700 }}>
            {formatPrice(complex.price)}
          </div>
        )}
      </div>

      {/* 본문 스크롤 영역 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {successMsg && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: '12px',
              backgroundColor: '#e6f4ea',
              borderRadius: '6px',
              color: '#137333',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {successMsg}
          </div>
        )}

        {/* 기본 정보 */}
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>
            단지 정보
          </h3>
          <InfoRow label="연식" value={complex.builtYear} />
          <InfoRow label="세대수" value={complex.unitCount ? `${complex.unitCount}세대` : null} />
          <InfoRow label="주소" value={complex.address} />
          <InfoRow label="확인일자" value={complex.checkDate} />
          {/* 참고가 — 최신 시세 기록 첫 번째 항목 기준으로 표시 */}
          <InfoRow label="호가" value={latestHistory?.items[0]?.askingPrice ? formatPrice(latestHistory.items[0].askingPrice) : null} />
          <InfoRow label="전고점" value={latestHistory?.items[0]?.highestPrice ? formatPrice(latestHistory.items[0].highestPrice) : null} />
          <InfoRow label="전저점" value={latestHistory?.items[0]?.lowestPrice ? formatPrice(latestHistory.items[0].lowestPrice) : null} />
          <InfoRow label="10년 등락" value={latestHistory?.items[0]?.tenYearChangeAmount != null
            ? `${latestHistory.items[0].tenYearChangeAmount >= 0 ? '+' : ''}${toUkUnit(latestHistory.items[0].tenYearChangeAmount)}억`
            : null} />
          <InfoRow label="등락률" value={latestHistory?.items[0]?.tenYearChangeRate != null
            ? `${latestHistory.items[0].tenYearChangeRate >= 0 ? '+' : ''}${latestHistory.items[0].tenYearChangeRate}%`
            : null} />
          {/* 메모 — 편집 버튼 클릭 시 textarea로 전환, 저장 시 즉시 반영 */}
          <div style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingMemo ? '6px' : 0 }}>
              <span style={{ fontSize: '12px', color: '#80868b' }}>메모</span>
              {!editingMemo && (
                <button
                  onClick={() => { setMemoText(displayMemo); setEditingMemo(true); setMemoError(null); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#1a73e8', padding: '0 2px' }}
                  title="메모 편집"
                >
                  ✏
                </button>
              )}
            </div>

            {editingMemo ? (
              <div>
                <textarea
                  ref={memoHook.ref}
                  value={memoText}
                  onChange={e => setMemoText(e.target.value)}
                  onFocus={memoHook.onFocus}
                  onKeyDown={memoHook.onKeyDown}
                  onBlur={memoHook.onBlur}
                  rows={3}
                  style={{
                    width: '100%', padding: '6px 8px', fontSize: '13px',
                    border: '1px solid #1a73e8', borderRadius: '6px',
                    resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                {memoError && (
                  <div style={{ fontSize: '12px', color: '#c5221f', marginTop: '4px' }}>{memoError}</div>
                )}
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    onClick={handleMemoSave}
                    disabled={memoSaving}
                    style={{
                      flex: 1, padding: '6px', fontSize: '12px', fontWeight: 600,
                      backgroundColor: memoSaving ? '#9e9e9e' : '#1a73e8',
                      color: '#fff', border: 'none', borderRadius: '5px', cursor: memoSaving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {memoSaving ? '저장 중...' : '저장'}
                  </button>
                  <button
                    onClick={() => { setEditingMemo(false); setMemoError(null); }}
                    disabled={memoSaving}
                    style={{
                      flex: 1, padding: '6px', fontSize: '12px',
                      backgroundColor: '#fff', color: '#5f6368',
                      border: '1px solid #dadce0', borderRadius: '5px', cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              // pre-wrap: \n을 줄바꿈으로 렌더링, 긴 줄은 자동 wrap
              <span style={{ fontSize: '13px', color: displayMemo ? '#202124' : '#bdbdbd', whiteSpace: 'pre-wrap' }}>
                {displayMemo || '메모 없음'}
              </span>
            )}
          </div>
        </div>

        {/* 종합평가 — 직장·교통·학군·환경 4개 등급을 한눈에 비교 */}
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>종합평가</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {([
              { label: '직장', grade: complex.grade ? { grade: complex.grade, color: GRADE_COLORS[complex.grade] ?? '#9e9e9e' } : null, sectionRef: workSectionRef },
              { label: '교통', grade: calcCommuteGrade(complex.commuteTimes), sectionRef: commuteSectionRef },
              { label: '학군', grade: calcSchoolGrade(complex.schoolInfos ?? []), sectionRef: schoolSectionRef },
              { label: '환경', grade: calcInfraGrade(complex.infraInfos ?? []), sectionRef: infraSectionRef },
            ] as { label: string; grade: { grade: string; color: string } | null; sectionRef: React.RefObject<HTMLDivElement> }[]).map(({ label, grade, sectionRef }) => (
              <div key={label} onClick={() => scrollToSection(sectionRef)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                padding: '10px 6px', backgroundColor: '#f8f9fa',
                borderRadius: '8px', border: '1px solid #e8eaed',
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: '12px', color: '#80868b', fontWeight: 500 }}>{label}</span>
                {grade ? (
                  <span style={{
                    fontSize: '14px', fontWeight: 800, color: '#fff',
                    backgroundColor: grade.color, padding: '2px 10px', borderRadius: '10px',
                  }}>
                    {grade.grade}
                  </span>
                ) : (
                  <span style={{ fontSize: '13px', color: '#bdbdbd', fontWeight: 600 }}>-</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 지하철 정보 — subwayInfos 배열로 여러 노선 표시 */}
        {complex.subwayInfos && complex.subwayInfos.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>
              지하철
            </h3>
            {complex.subwayInfos.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <span style={{ fontSize: '13px', color: '#202124' }}>{s.stationName}</span>
                <span style={{ fontSize: '12px', color: '#80868b' }}>
                  {s.subwayLines}{s.walkingMinutes ? ` · 도보 ${s.walkingMinutes}분` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 직장 밀도 */}
        {complex.grade && (
          <div ref={workSectionRef} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368' }}>직장</h3>
              <span style={{
                fontSize: '12px', fontWeight: 800, color: '#fff',
                backgroundColor: GRADE_COLORS[complex.grade] ?? '#9e9e9e',
                padding: '1px 8px', borderRadius: '10px',
              }}>
                {complex.grade}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '16px', padding: '6px 0' }}>
              {complex.employees != null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', color: '#80868b' }}>종사자수</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#202124' }}>{formatCount(complex.employees)}명</span>
                </div>
              )}
              {complex.businesses != null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', color: '#80868b' }}>사업체수</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#202124' }}>{formatCount(complex.businesses)}개</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 교통 (주요 지구 소요시간) */}
        {complex.commuteTimes && complex.commuteTimes.length > 0 && (
          <div ref={commuteSectionRef} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368' }}>
                교통
              </h3>
              <CommuteGradeBadge commuteTimes={complex.commuteTimes} />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '6px',
              }}
            >
              {complex.commuteTimes.map((ct) => (
                <div
                  key={ct.id}
                  style={{
                    textAlign: 'center',
                    padding: '8px 4px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #e8eaed',
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '2px' }}>
                    {ct.destination}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a73e8' }}>
                    {ct.minutes}분
                  </div>
                  {ct.transferCount != null && (
                    <div style={{ fontSize: '10px', color: ct.transferCount === 0 ? '#34a853' : '#80868b', marginTop: '2px' }}>
                      {ct.transferCount === 0 ? '직통' : `환승 ${ct.transferCount}회`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 학군 */}
        {complex.schoolInfos && complex.schoolInfos.length > 0 && (
          <div ref={schoolSectionRef} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368' }}>학군</h3>
              {(() => {
                const g = calcSchoolGrade(complex.schoolInfos ?? []);
                return g ? (
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', backgroundColor: g.color, padding: '1px 8px', borderRadius: '10px' }}>
                    {g.grade}
                  </span>
                ) : null;
              })()}
            </div>
            {complex.schoolInfos.map((s: SchoolInfo) => (
              <div key={s.id} style={{ padding: '7px 0', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {/* 학교명 + 유형 뱃지 + 도보 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag
                    label={SCHOOL_TYPE_LABELS[s.schoolType] ?? s.schoolType}
                    color={s.schoolType === 'MIDDLE' ? '#1a73e8' : '#34a853'}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#202124', flex: 1 }}>{s.schoolName}</span>
                  {s.walkingMinutes != null && (
                    <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0 }}>도보 {s.walkingMinutes}분</span>
                  )}
                </div>
                {/* 학업성취도(중학교) + 전교생수 */}
                {(s.achievementScore != null || s.totalStudents != null) && (
                  <div style={{ display: 'flex', gap: '12px', paddingLeft: '2px' }}>
                    {s.achievementScore != null && (
                      <span style={{ fontSize: '11px', color: '#5f6368' }}>학업성취도 {s.achievementScore}%</span>
                    )}
                    {s.totalStudents != null && (
                      <span style={{ fontSize: '11px', color: '#5f6368' }}>전교생 {s.totalStudents.toLocaleString()}명</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 환경 (주변 인프라) */}
        {complex.infraInfos && complex.infraInfos.length > 0 && (
          <div ref={infraSectionRef} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368' }}>환경</h3>
              {(() => {
                const g = calcInfraGrade(complex.infraInfos ?? []);
                return (
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', backgroundColor: g.color, padding: '1px 8px', borderRadius: '10px' }}>
                    {g.grade}
                  </span>
                );
              })()}
            </div>
            {complex.infraInfos.map((inf: InfraInfo) => (
              <div key={inf.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Tag label={INFRA_TYPE_LABELS[inf.infraType] ?? inf.infraType} color='#f9ab00' />
                <span style={{ fontSize: '13px', color: '#202124', flex: 1 }}>{inf.infraName}</span>
                {inf.distance != null && (
                  <span style={{ fontSize: '12px', color: '#80868b', flexShrink: 0 }}>도보 {inf.distance}분</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 재개발 정보 */}
        {complex.redevelopType && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>재개발 정보</h3>
            <InfoRow label="유형" value={REDEVELOP_TYPE_LABELS[complex.redevelopType]} />
            {/* 진행단계 — ? 아이콘 호버 시 각 단계 설명 tooltip 표시 */}
            {complex.redevelopStage && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginRight: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#80868b' }}>진행단계</span>
                  <div
                    style={{ position: 'relative', display: 'inline-flex' }}
                    onMouseEnter={() => setShowStageTooltip(true)}
                    onMouseLeave={() => setShowStageTooltip(false)}
                  >
                    <div style={{
                      width: '14px', height: '14px', borderRadius: '50%',
                      backgroundColor: '#dadce0', color: '#5f6368',
                      fontSize: '10px', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'default', lineHeight: 1,
                    }}>?</div>
                    {showStageTooltip && (
                      <div style={{
                        position: 'absolute', bottom: '120%', left: 0, zIndex: 20,
                        backgroundColor: '#3c4043', color: '#fff',
                        fontSize: '11px', lineHeight: 1.7,
                        padding: '8px 10px', borderRadius: '6px',
                        width: '280px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                        pointerEvents: 'none',
                      }}>
                        {([
                          ['①', '정비구역 지정', '지방자치단체가 지역의 노후도, 기반시설 부족 여부 등을 종합적으로 판단해 사업 구역 지정'],
                          ['②', '추진위원회 구성 및 승인', '조합 설립을 위한 준비 조직을 구성하여 지자체의 승인을 받음'],
                          ['③', '조합 설립 인가', '토지 및 건물 소유자로부터 법정 동의율을 확보하여 조합 설립 인가를 받음'],
                          ['④', '사업시행인가', '조합이 수립한 건축계획, 이주 계획 등을 지자체가 최종 승인'],
                          ['⑤', '관리처분인가', '조합원의 자산 평가, 분양 계획, 추가 분담금 등을 최종 확정'],
                          ['⑥', '이주·철거 및 착공', '거주자의 이주가 완료되면 기존 건물을 철거하고 공사 시작'],
                          ['⑦', '준공 및 입주', '공사가 완료되면 준공 인가를 거쳐 입주 시작'],
                        ] as const).map(([num, title, desc]) => (
                          <div key={num} style={{ marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700 }}>{num} {title}</span><br />
                            <span style={{ color: '#bdbdbd', fontSize: '10px' }}>{desc}</span>
                          </div>
                        ))}
                        <div style={{
                          position: 'absolute', top: '100%', left: '7px',
                          borderWidth: '5px', borderStyle: 'solid',
                          borderColor: '#3c4043 transparent transparent transparent',
                        }} />
                      </div>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: '13px', color: '#202124', textAlign: 'right' }}>
                  {REDEVELOP_STAGE_LABELS[complex.redevelopStage]}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 임장 유형 */}
        {complex.visitType && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>임장 유형</h3>
            <div style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: '12px',
              backgroundColor: '#e8f0fe', color: '#1a73e8', fontSize: '13px', fontWeight: 600,
            }}>
              {VISIT_TYPE_LABELS[complex.visitType] ?? complex.visitType}
            </div>
          </div>
        )}

        {/* 시세 변동 그래프 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368' }}>
              시세 변동
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {priceChange !== null && (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: priceChange >= 0 ? '#c5221f' : '#137333',
                  }}
                >
                  {priceChange >= 0 ? '+' : ''}{formatPrice(Math.abs(priceChange))}
                </span>
              )}
              {/* 평형이 2개 이상일 때만 필터 셀렉트박스 표시 */}
              {areaTypes.length > 1 && (
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <select
                    value={selectedAreaType}
                    onChange={e => setSelectedAreaType(e.target.value)}
                    style={{
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      border: '1.5px solid',
                      borderColor: selectedAreaType ? '#1a73e8' : '#d2d5da',
                      borderRadius: '14px',
                      backgroundColor: selectedAreaType ? '#e8f0fe' : '#f8f9fa',
                      color: selectedAreaType ? '#1a73e8' : '#5f6368',
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '4px 26px 4px 10px',
                      cursor: 'pointer',
                      outline: 'none',
                      boxShadow: selectedAreaType
                        ? '0 2px 6px rgba(26,115,232,0.18)'
                        : '0 1px 3px rgba(0,0,0,0.07)',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    <option value="">전체 평형</option>
                    {areaTypes.map(at => (
                      <option key={at} value={at}>{at}</option>
                    ))}
                  </select>
                  <svg
                    viewBox="0 0 24 24" fill="none"
                    stroke={selectedAreaType ? '#1a73e8' : '#9e9e9e'}
                    strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      position: 'absolute', right: '8px', top: '50%',
                      transform: 'translateY(-50%)',
                      width: '11px', height: '11px', pointerEvents: 'none',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9e9e9e', fontSize: '13px' }}>
              로딩 중...
            </div>
          ) : (
            // filteredSeries: 선택 평형의 매매+전세 세트, 전체일 때는 모든 시리즈
            <PriceChart rows={chartData.rows} series={filteredSeries} />
          )}

          {priceHistories.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#80868b', textAlign: 'right' }}>
              총 {priceHistories.length}건의 기록
            </div>
          )}
        </div>

        {/* 최근 시세 기록 목록 */}
        {priceHistories.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', margin: 0 }}>
                최근 기록
              </h3>
              {/* 물음표 아이콘 — 호버 시 tooltip 표시 */}
              <div
                style={{ position: 'relative', display: 'inline-flex' }}
                onMouseEnter={() => setShowRecordTooltip(true)}
                onMouseLeave={() => setShowRecordTooltip(false)}
              >
                <div style={{
                  width: '15px', height: '15px', borderRadius: '50%',
                  backgroundColor: '#dadce0', color: '#5f6368',
                  fontSize: '10px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'default', flexShrink: 0, lineHeight: 1,
                }}>
                  ?
                </div>
                {showRecordTooltip && (
                  <div style={{
                    position: 'absolute', bottom: '120%', left: 0,
                    backgroundColor: '#3c4043', color: '#fff',
                    fontSize: '11px', lineHeight: 1.6,
                    padding: '7px 10px', borderRadius: '6px',
                    width: '200px', zIndex: 10,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    pointerEvents: 'none',
                  }}>
                    전세가율 : 낮으면 호황/급등기, 높으면 불황
                    <div style={{
                      position: 'absolute', top: '100%', left: '7px',
                      borderWidth: '5px', borderStyle: 'solid',
                      borderColor: '#3c4043 transparent transparent transparent',
                    }} />
                  </div>
                )}
              </div>
            </div>
            {/* 최신순으로 뒤집어 최대 5건만 표시 — 날짜별로 items 배열을 나열 */}
            {[...priceHistories].reverse().slice(0, 5).map((h) => (
              <div
                key={h.id}
                style={{
                  marginBottom: '8px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '6px',
                  padding: '8px 10px',
                }}
              >
                <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '4px' }}>
                  {h.recordDate}
                  {h.memo && <span style={{ marginLeft: '6px' }}>{h.memo}</span>}
                </div>
                {h.items.map((item) => (
                  <div key={item.id} style={{ padding: '3px 0', borderBottom: '1px solid #f0f0f0' }}>
                    {/* 기본 가격 행 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                      <span style={{ color: '#5f6368' }}>
                        {item.areaType || '-'}
                        {item.floor ? ` · ${item.floor}층` : ''}
                      </span>
                      <span style={{ fontWeight: 600, color: '#202124' }}>{formatPrice(item.price)}</span>
                      {item.jeonseRate != null && (
                        <span style={{ fontSize: '11px', color: '#1a73e8' }}>전세가율 {item.jeonseRate.toFixed(0)}%</span>
                      )}
                    </div>
                    {/* 참고가 — 값이 있는 항목만 표시 */}
                    {(item.askingPrice || item.highestPrice || item.lowestPrice || item.tenYearChangeAmount || item.tenYearChangeRate) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '3px' }}>
                        {item.askingPrice && (
                          <span style={{ fontSize: '10px', color: '#80868b' }}>호가 {formatPrice(item.askingPrice)}</span>
                        )}
                        {item.highestPrice && (
                          <span style={{ fontSize: '10px', color: '#80868b' }}>전고점 {formatPrice(item.highestPrice)}</span>
                        )}
                        {item.lowestPrice && (
                          <span style={{ fontSize: '10px', color: '#80868b' }}>전저점 {formatPrice(item.lowestPrice)}</span>
                        )}
                        {(item.tenYearChangeAmount || item.tenYearChangeRate != null) && (
                          <span style={{ fontSize: '10px', color: '#80868b' }}>
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

        {/* 시세 입력 폼 */}
        {showInputForm ? (
          <PriceInputForm
            complexId={complex.id}
            complexName={complex.complexName}
            onSubmit={handlePriceSubmit}
            onCancel={() => setShowInputForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowInputForm(true)}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#fff',
              color: '#1a73e8',
              border: '2px dashed #1a73e8',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '16px',
            }}
          >
            + 시세 입력하기
          </button>
        )}

        {/* 단지 삭제 — 실수 방지를 위해 2단계 확인 */}
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px', marginBottom: '16px' }}>
          {deleteConfirm ? (
            <div style={{ backgroundColor: '#fce8e6', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '13px', color: '#c5221f', fontWeight: 600, marginBottom: '8px' }}>
                정말 삭제하시겠습니까?
              </div>
              <div style={{ fontSize: '12px', color: '#80868b', marginBottom: '10px' }}>
                {complex.complexName}의 모든 시세 기록도 함께 삭제됩니다.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: '8px', fontSize: '13px', fontWeight: 600,
                    backgroundColor: deleting ? '#9e9e9e' : '#c5221f',
                    color: '#fff', border: 'none', borderRadius: '6px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {deleting ? '삭제 중...' : '삭제 확인'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: '8px', fontSize: '13px',
                    backgroundColor: '#fff', color: '#5f6368',
                    border: '1px solid #dadce0', borderRadius: '6px', cursor: 'pointer',
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(true)}
              style={{
                width: '100%', padding: '10px', fontSize: '13px',
                backgroundColor: '#fff', color: '#c5221f',
                border: '1px solid #c5221f', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              단지 삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComplexInfoPanel;
