import React, { useState, useEffect, useCallback } from 'react';
import { ApartmentComplex, PriceHistory, PriceHistoryRequest, ChartDataRow, ChartSeries, formatPrice, toUkUnit } from '../types';
import { getPriceHistories, addPriceHistory, updateComplexMemo } from '../services/api';
import PriceChart from './PriceChart';
import PriceInputForm from './PriceInputForm';

interface ComplexInfoPanelProps {
  complex: ApartmentComplex | null;
  onClose: () => void;
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

const ComplexInfoPanel: React.FC<ComplexInfoPanelProps> = ({ complex, onClose }) => {
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
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);

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
    } catch {
      setMemoError('저장에 실패했습니다.');
    } finally {
      setMemoSaving(false);
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
                  value={memoText}
                  onChange={e => setMemoText(e.target.value)}
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

        {/* 상업지구 소요시간 */}
        {complex.commuteTimes && complex.commuteTimes.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>
              주요 지구 소요시간
            </h3>
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
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#5f6368', marginBottom: '8px' }}>
              최근 기록
            </h3>
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
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '13px',
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: '#5f6368' }}>
                      {item.areaType || '-'}
                      {item.floor ? ` · ${item.floor}층` : ''}
                    </span>
                    <span style={{ fontWeight: 600, color: '#202124' }}>{formatPrice(item.price)}</span>
                    {item.jeonseRate != null && (
                      <span style={{ fontSize: '11px', color: '#1a73e8' }}>전세율 {item.jeonseRate.toFixed(0)}%</span>
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
      </div>
    </div>
  );
};

export default ComplexInfoPanel;
