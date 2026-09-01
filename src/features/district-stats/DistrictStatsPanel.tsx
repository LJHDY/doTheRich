import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { DistrictStat, DistrictTradeDetail, DistrictStatHistory } from '../../types';
import { getDistrictStats, collectDistrictStats, getDistrictTradeDetails, getDistrictStatsHistory } from '../../services/api';

interface Props {
  onClose: () => void;
  onToast?: (msg: string, type?: 'success' | 'error') => void;
  isMobile?: boolean;
}

// 만원 → 억 단위 표시 (소수점 1자리)
const toUk = (v?: number | null): string => {
  if (v == null) return '-';
  const uk = v / 10000;
  return uk >= 1 ? `${uk.toFixed(1)}억` : `${Math.round(v / 1000)}천`;
};


type AreaKey = '15' | '18' | '21' | '24' | '26' | '33';

const AREA_LABELS: Record<AreaKey, string> = {
  '15': '전용 49㎡ (15평)',
  '18': '전용 59㎡ (18평)',
  '21': '전용 69㎡ (21평)',
  '24': '전용 79㎡ (24평)',
  '26': '전용 85㎡ (26평)',
  '33': '전용 109㎡ (33평)',
};

type ViewMode = 'trade' | 'jeonse';
type SelectedArea = 'all' | AreaKey;

// 상급지→중급지→하급지 순서 (ComparisonEvalPanel의 DISTRICT_GRADES와 동일)
const GRADE_ORDER: Record<string, number> = Object.fromEntries(
  [
    '강남구', '서초구', '용산구', '송파구', '성동구', '광진구', '마포구', '양천구',   // 상급지
    '강동구', '동작구', '영등포구', '중구', '종로구',                                   // 중급지
    '서대문구', '강서구', '동대문구', '성북구', '관악구', '은평구', '구로구',
    '노원구', '중랑구', '강북구', '금천구', '도봉구',                                    // 하급지
  ].map((d, i) => [d, i])
);

// 급지 그룹 정의 (ComparisonEvalPanel의 DISTRICT_GRADES와 동일)
const DISTRICT_GRADE_GROUPS = [
  { label: '상급지', color: '#F08080', textColor: '#c0392b',
    districts: ['강남구', '서초구', '용산구', '송파구', '성동구', '광진구', '마포구', '양천구'] },
  { label: '중급지', color: '#FFD97D', textColor: '#b8860b',
    districts: ['강동구', '동작구', '영등포구', '중구', '종로구'] },
  { label: '하급지', color: '#89CFF0', textColor: '#2a6090',
    districts: ['서대문구', '강서구', '동대문구', '성북구', '관악구', '은평구', '구로구', '노원구', '중랑구', '강북구', '금천구', '도봉구'] },
];

// 구별 고유 색상 (급지별 색 계열)
const DISTRICT_COLORS: Record<string, string> = {
  강남구: '#c0392b', 서초구: '#e74c3c', 용산구: '#922b21', 송파구: '#e67e22',
  성동구: '#d35400', 광진구: '#ca6f1e', 마포구: '#af601a', 양천구: '#935116',
  강동구: '#b7950b', 동작구: '#d4ac0d', 영등포구: '#f1c40f', 중구: '#f39c12', 종로구: '#e67e22',
  서대문구: '#1a5276', 강서구: '#1f618d', 동대문구: '#2471a3', 성북구: '#2e86c1',
  관악구: '#2980b9', 은평구: '#5dade2', 구로구: '#7fb3d3', 노원구: '#85c1e9',
  중랑구: '#a9cce3', 강북구: '#4a235a', 금천구: '#6c3483', 도봉구: '#7d3c98',
};

const ALL_DISTRICTS_ORDER = DISTRICT_GRADE_GROUPS.flatMap(g => g.districts);

// 폴링 간격 5초, 최대 3분
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 36;

const DistrictStatsPanel: React.FC<Props> = ({ onClose, onToast, isMobile }) => {
  const [stats, setStats] = useState<DistrictStat[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('trade');
  const [selectedArea, setSelectedArea] = useState<SelectedArea>('all');

  // 그래프 모드 상태
  const [graphMode, setGraphMode] = useState(false);
  const [historyItems, setHistoryItems] = useState<DistrictStatHistory[]>([]);
  const [historyMonths, setHistoryMonths] = useState<string[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [graphDistricts, setGraphDistricts] = useState<Set<string>>(
    new Set(ALL_DISTRICTS_ORDER)
  );

  // 실거래 상세 모달 상태
  const [detailCtx, setDetailCtx] = useState<{
    district: string; areaKey: AreaKey; month: string; mode: ViewMode;
  } | null>(null);
  const [detailItems, setDetailItems] = useState<DistrictTradeDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptsRef = useRef(0);
  const collectStartRef = useRef<string>('');

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollAttemptsRef.current = 0;
  }, []);

  // 언마운트 시 폴링 정리
  useEffect(() => () => stopPolling(), [stopPolling]);

  const load = useCallback(async (month?: string) => {
    setLoading(true);
    try {
      const res = await getDistrictStats(month);
      setStats(res.data);
      setAvailableMonths(res.availableMonths);
      if (!month && res.availableMonths.length > 0) {
        setSelectedMonth(res.availableMonths[0]);
      }
      return res;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    load(m);
  };

  const handleCollect = async () => {
    if (!window.confirm('서울 25구 시세 수집을 시작합니다.\n수집에는 수 분이 소요될 수 있습니다.')) return;
    setCollecting(true);
    // 수집 시작 시각 기록 — 이보다 최신 collectedAt이 반환되면 수집 완료로 판단
    // ISO 문자열 비교 가능: "2024-08-10T02:00:00" > "2024-08-09T23:00:00"
    collectStartRef.current = new Date().toISOString();

    try {
      await collectDistrictStats();
    } catch {
      onToast?.('수집 요청에 실패했습니다.', 'error');
      setCollecting(false);
      return;
    }

    // 5초마다 폴링 — collectedAt이 수집 시작 시각보다 최신이면 완료
    stopPolling();
    pollAttemptsRef.current = 0;
    pollTimerRef.current = setInterval(async () => {
      pollAttemptsRef.current += 1;

      try {
        const res = await getDistrictStats(selectedMonth || undefined);
        const isDone = res.data.some(
          d => d.collectedAt && d.collectedAt > collectStartRef.current
        );

        if (isDone || pollAttemptsRef.current >= POLL_MAX_ATTEMPTS) {
          stopPolling();
          setCollecting(false);
          setStats(res.data);
          setAvailableMonths(res.availableMonths);
          if (res.availableMonths[0]) setSelectedMonth(res.availableMonths[0]);

          if (isDone) {
            onToast?.('서울 25구 시세 수집이 완료되었습니다.', 'success');
          } else {
            onToast?.('수집 시간이 초과되었습니다. 잠시 후 새로고침해주세요.', 'error');
          }
        }
      } catch {
        stopPolling();
        setCollecting(false);
        onToast?.('데이터 조회 중 오류가 발생했습니다.', 'error');
      }
    }, POLL_INTERVAL_MS);
  };

  const statMap = new Map(stats.map(s => [s.district, s]));

  const getVal = (s: DistrictStat | undefined, area: AreaKey, mode: ViewMode) => {
    if (!s) return undefined;
    if (mode === 'trade') {
      return area === '15' ? s.avgTrade15 : area === '18' ? s.avgTrade18
           : area === '21' ? s.avgTrade21 : area === '24' ? s.avgTrade24
           : area === '26' ? s.avgTrade26 : s.avgTrade33;
    } else {
      return area === '15' ? s.avgJeonse15 : area === '18' ? s.avgJeonse18
           : area === '21' ? s.avgJeonse21 : area === '24' ? s.avgJeonse24
           : area === '26' ? s.avgJeonse26 : s.avgJeonse33;
    }
  };

  const getCount = (s: DistrictStat | undefined, area: AreaKey, mode: ViewMode) => {
    if (!s) return undefined;
    if (mode === 'trade') {
      return area === '15' ? s.tradeCount15 : area === '18' ? s.tradeCount18
           : area === '21' ? s.tradeCount21 : area === '24' ? s.tradeCount24
           : area === '26' ? s.tradeCount26 : s.tradeCount33;
    } else {
      return area === '15' ? s.jeonseCount15 : area === '18' ? s.jeonseCount18
           : area === '21' ? s.jeonseCount21 : area === '24' ? s.jeonseCount24
           : area === '26' ? s.jeonseCount26 : s.jeonseCount33;
    }
  };

  const ALL_AREAS = ['15', '18', '21', '24', '26', '33'] as AreaKey[];

  // 전체 보기: 상급지→중급지→하급지 순서 (GRADE_ORDER)
  // 평형 선택 시: 해당 평형 가격 내림차순, 데이터 없는 구는 하단
  const sortedDistricts = Array.from(statMap.keys()).sort((a, b) => {
    if (selectedArea === 'all') {
      // GRADE_ORDER에 없는 구는 99위로 처리 (하단 배치)
      return (GRADE_ORDER[a] ?? 99) - (GRADE_ORDER[b] ?? 99);
    }
    const va = getVal(statMap.get(a), selectedArea, viewMode);
    const vb = getVal(statMap.get(b), selectedArea, viewMode);
    if (va != null && vb != null) return vb - va; // 가격 내림차순
    if (va != null) return -1;  // 데이터 있는 구 상단
    if (vb != null) return 1;   // 데이터 없는 구 하단
    return 0;
  });

  // 같은 평형대 내 최댓값 — 히트맵에서 상대 비율(0~1)을 계산하기 위한 기준값
  // 평형 간 절대값 비교가 아닌 동일 평형 내 상대 순위로 색상 결정
  const maxVals: Record<AreaKey, number> = { '15': 0, '18': 0, '21': 0, '24': 0, '26': 0, '33': 0 };
  for (const s of Array.from(statMap.values())) {
    ALL_AREAS.forEach(a => {
      const v = getVal(s, a, viewMode);
      if (v && v > maxVals[a]) maxVals[a] = v;
    });
  }

  // 히트맵 배경색 — 구간 내 최솟값(0)→최댓값 대비 상대 비율로 파랑→빨강 선형 보간
  // 투명도 0.12 — 텍스트 가독성과 색상 구분 사이 균형
  const cellBg = (v?: number | null, area?: AreaKey): string => {
    if (!v || !area || !maxVals[area]) return 'transparent';
    const ratio = v / maxVals[area];
    // ratio 0=파랑(낮은 가격), 1=빨강(높은 가격)
    const r = Math.round(255 * ratio);
    const b = Math.round(255 * (1 - ratio));
    return `rgba(${r}, 120, ${b}, 0.12)`;
  };

  const handleCountClick = async (district: string, areaKey: AreaKey) => {
    const month = selectedMonth;
    const mode = viewMode;
    setDetailCtx({ district, areaKey, month, mode });
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const res = await getDistrictTradeDetails(district, month, areaKey, mode === 'trade' ? 'trade' : 'jeonse');
      setDetailItems(res.items);
    } catch {
      setDetailItems([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const areaKey = selectedArea === 'all' ? '26' : selectedArea;
      const res = await getDistrictStatsHistory(areaKey, viewMode === 'trade' ? 'trade' : 'jeonse');
      setHistoryItems(res.items);
      setHistoryMonths(res.months);
    } catch {
      // 오류 시 빈 상태 유지
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedArea, viewMode]);

  // 그래프 모드 진입 시 또는 selectedArea/viewMode 변경 시 이력 재조회
  useEffect(() => {
    if (graphMode) loadHistory();
  }, [graphMode, loadHistory]);

  // 그래프용 Recharts 데이터 변환 — 월별 X축 행에 구별 가격과 총 거래건수를 flatten
  // Recharts ComposedChart: 각 구를 별도 dataKey로 가진 행 배열이 필요
  const chartData = useMemo(() => {
    return historyMonths.map(month => {
      // 월 레이블: "202408" → "2024.08"
      const row: Record<string, string | number> = {
        month: `${month.slice(0, 4)}.${month.slice(4)}`,
      };
      let totalCount = 0;
      historyItems
        // 해당 월 + 현재 선택된 구만 포함
        .filter(d => d.month === month && graphDistricts.has(d.district))
        .forEach(d => {
          if (d.price != null) row[d.district] = d.price;
          if (d.count != null) totalCount += d.count;
        });
      // totalCount: 막대 차트용 (배경 거래량 시각화)
      row.totalCount = totalCount;
      return row;
    });
  }, [historyItems, historyMonths, graphDistricts]);

  const toggleGradeGroup = (districts: string[]) => {
    setGraphDistricts(prev => {
      const next = new Set(prev);
      const allOn = districts.every(d => next.has(d));
      districts.forEach(d => allOn ? next.delete(d) : next.add(d));
      return next;
    });
  };

  const toggleDistrict = (district: string) => {
    setGraphDistricts(prev => {
      const next = new Set(prev);
      next.has(district) ? next.delete(district) : next.add(district);
      return next;
    });
  };

  const panelWidth = isMobile ? '100%' : '720px';
  const formatMonthLabel = (m: string) => `${m.slice(0, 4)}년 ${parseInt(m.slice(4), 10)}월`;

  return (
    <div style={{
      width: panelWidth, height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#fff', borderLeft: '1px solid #e8eaed',
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #e8eaed',
        backgroundColor: '#f0f8fd', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ fontWeight: 700, fontSize: '14px', color: '#1a3a5c', flex: 1 }}>
          서울 구별 시세 현황
        </span>
        <button onClick={onClose} style={{
          padding: '3px 8px', fontSize: '13px', border: '1px solid #dadce0',
          borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', color: '#5f6368',
        }}>✕</button>
      </div>

      {/* 컨트롤 바 */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
      }}>
        {/* 거래월 선택 */}
        <select
          value={selectedMonth}
          onChange={e => handleMonthChange(e.target.value)}
          style={{
            fontSize: '12px', padding: '4px 8px', border: '1px solid #dadce0',
            borderRadius: '6px', color: '#1a3a5c', backgroundColor: '#fff', cursor: 'pointer',
          }}
        >
          {availableMonths.length === 0 && <option value="">-- 데이터 없음 --</option>}
          {availableMonths.map(m => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </select>

        {/* 평형 선택 */}
        <select
          value={selectedArea}
          onChange={e => setSelectedArea(e.target.value as SelectedArea)}
          style={{
            fontSize: '12px', padding: '4px 8px', border: '1px solid #dadce0',
            borderRadius: '6px', color: '#1a3a5c', backgroundColor: '#fff', cursor: 'pointer',
          }}
        >
          <option value="all">전체 (급지순)</option>
          {(Object.entries(AREA_LABELS) as [AreaKey, string][]).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>

        {/* 매매/전세 탭 */}
        {(['trade', 'jeonse'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              padding: '4px 10px', fontSize: '12px', fontWeight: 600,
              border: '1px solid',
              borderColor: viewMode === mode ? '#89CFF0' : '#dadce0',
              borderRadius: '6px',
              backgroundColor: viewMode === mode ? '#D4EFFC' : '#fff',
              color: viewMode === mode ? '#2a6090' : '#5f6368',
              cursor: 'pointer',
            }}
          >{mode === 'trade' ? '매매' : '전세'}</button>
        ))}

        <div style={{ flex: 1 }} />
        {/* 테이블/그래프 토글 */}
        <button
          onClick={() => setGraphMode(m => !m)}
          style={{
            padding: '4px 10px', fontSize: '12px', fontWeight: 600,
            border: '1px solid',
            borderColor: graphMode ? '#89CFF0' : '#dadce0',
            borderRadius: '6px',
            backgroundColor: graphMode ? '#D4EFFC' : '#fff',
            color: graphMode ? '#2a6090' : '#5f6368',
            cursor: 'pointer',
          }}
        >{graphMode ? '📊 테이블' : '📈 그래프'}</button>

        {/* 시세 수집 버튼 */}
        <button
          onClick={handleCollect}
          disabled={collecting}
          style={{
            padding: '4px 12px', fontSize: '12px', fontWeight: 600,
            border: '1px solid #89CFF0', borderRadius: '6px',
            backgroundColor: collecting ? '#f1f3f4' : '#D4EFFC',
            color: collecting ? '#9e9e9e' : '#2a6090',
            cursor: collecting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: '5px',
          }}
        >
          {collecting && (
            <span style={{
              display: 'inline-block', width: '10px', height: '10px',
              border: '2px solid #9e9e9e', borderTopColor: 'transparent',
              borderRadius: '50%', animation: 'dtr-spin 0.7s linear infinite',
            }} />
          )}
          {collecting ? '수집 중...' : '시세 수집'}
        </button>

        {/* 새로고침 */}
        <button
          onClick={() => load(selectedMonth || undefined)}
          disabled={loading}
          style={{
            padding: '4px 10px', fontSize: '12px', fontWeight: 600,
            border: '1px solid #dadce0', borderRadius: '6px',
            backgroundColor: '#fff', color: '#5f6368',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >↻</button>
      </div>

      {/* 수집 중 안내 */}
      {collecting && (
        <div style={{
          padding: '6px 12px', fontSize: '11px', backgroundColor: '#f0f8fd',
          color: '#2a6090', borderBottom: '1px solid #d4edfb', flexShrink: 0,
        }}>
          백그라운드에서 수집 중입니다. 완료되면 알림이 표시됩니다.
        </div>
      )}

      {/* 테이블 */}
      {!graphMode && <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
            불러오는 중...
          </div>
        ) : stats.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
            <div>수집된 데이터가 없습니다.</div>
            <div style={{ marginTop: '6px', fontSize: '11px', color: '#bdbdbd' }}>
              "시세 수집" 버튼을 눌러 서울 25구 데이터를 수집하세요.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', minWidth: '400px', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ ...thStyle, textAlign: 'left', width: '70px' }}>지역</th>
                {(Object.entries(AREA_LABELS) as [AreaKey, string][]).map(([key, label]) => (
                  <th key={key} style={{
                    ...thStyle,
                    backgroundColor: selectedArea === key ? '#D4EFFC' : undefined,
                    color: selectedArea === key ? '#2a6090' : '#344054',
                  }}>{label}{selectedArea === key ? ' ▲' : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedDistricts.map(district => {
                const s = statMap.get(district);
                return (
                  <tr key={district} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1a3a5c', whiteSpace: 'nowrap' }}>
                      {district}
                      {GRADE_ORDER[district] != null && (
                        <span style={{
                          marginLeft: '4px', fontSize: '9px', fontWeight: 700,
                          color: GRADE_ORDER[district] < 8 ? '#E06060'
                               : GRADE_ORDER[district] < 13 ? '#B8860B' : '#4BAAD4',
                        }}>
                          {GRADE_ORDER[district] < 8 ? '상' : GRADE_ORDER[district] < 13 ? '중' : '하'}
                        </span>
                      )}
                    </td>
                    {ALL_AREAS.map(area => {
                      const v = getVal(s, area, viewMode);
                      const cnt = getCount(s, area, viewMode);
                      return (
                        <td
                          key={area}
                          style={{
                            ...tdStyle, textAlign: 'right',
                            backgroundColor: cellBg(v, area),
                            color: v ? '#1a3a5c' : '#bdbdbd',
                          }}
                        >
                          {v ? (
                            <>
                              {toUk(v)}
                              <span
                                onClick={() => handleCountClick(district, area)}
                                style={{
                                  fontSize: '10px', color: '#89CFF0', marginLeft: '3px',
                                  cursor: 'pointer', textDecoration: 'underline',
                                  textDecorationStyle: 'dotted',
                                }}
                                title="클릭하면 실거래 목록을 볼 수 있습니다"
                              >
                                ({cnt ?? 0})
                              </span>
                            </>
                          ) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>}

      {/* 그래프 뷰 */}
      {graphMode && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 구 필터 */}
          <div style={{
            padding: '8px 12px', borderBottom: '1px solid #f0f0f0',
            flexShrink: 0,
          }}>
            {/* 급지 그룹 버튼 */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#9e9e9e', marginRight: '2px' }}>급지:</span>
              {DISTRICT_GRADE_GROUPS.map(g => {
                const allOn = g.districts.every(d => graphDistricts.has(d));
                return (
                  <button key={g.label} onClick={() => toggleGradeGroup(g.districts)} style={{
                    padding: '2px 8px', fontSize: '11px', fontWeight: 600,
                    border: `1px solid ${g.color}`,
                    borderRadius: '10px',
                    backgroundColor: allOn ? g.color : '#fff',
                    color: allOn ? g.textColor : '#9e9e9e',
                    cursor: 'pointer',
                  }}>{g.label}</button>
                );
              })}
              <button onClick={() => setGraphDistricts(new Set(ALL_DISTRICTS_ORDER))} style={{
                padding: '2px 8px', fontSize: '11px', border: '1px solid #dadce0',
                borderRadius: '10px', backgroundColor: '#fff', color: '#5f6368', cursor: 'pointer',
              }}>전체</button>
              <button onClick={() => setGraphDistricts(new Set())} style={{
                padding: '2px 8px', fontSize: '11px', border: '1px solid #dadce0',
                borderRadius: '10px', backgroundColor: '#fff', color: '#5f6368', cursor: 'pointer',
              }}>해제</button>
            </div>
            {/* 개별 구 칩 */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {ALL_DISTRICTS_ORDER.map(d => {
                const on = graphDistricts.has(d);
                const color = DISTRICT_COLORS[d] ?? '#9e9e9e';
                return (
                  <button key={d} onClick={() => toggleDistrict(d)} style={{
                    padding: '1px 7px', fontSize: '10px', fontWeight: on ? 700 : 400,
                    border: `1px solid ${on ? color : '#e0e0e0'}`,
                    borderRadius: '10px',
                    backgroundColor: on ? color + '22' : '#fafafa',
                    color: on ? color : '#bdbdbd',
                    cursor: 'pointer',
                  }}>{d.replace(/구$/, '')}</button>
                );
              })}
            </div>
          </div>

          {/* 차트 영역 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 4px 8px 0' }}>
            {historyLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
                이력 데이터 불러오는 중...
              </div>
            ) : historyMonths.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
                수집된 이력 데이터가 없습니다.
              </div>
            ) : (
              <>
                {/* 범례 */}
                <div style={{ padding: '0 12px 8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {ALL_DISTRICTS_ORDER.filter(d => graphDistricts.has(d)).map(d => (
                    <span key={d} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}>
                      <span style={{ width: '16px', height: '2px', backgroundColor: DISTRICT_COLORS[d], display: 'inline-block', borderRadius: '1px' }} />
                      {d}
                    </span>
                  ))}
                </div>

                {/* 가격 라인 차트 */}
                <div style={{ marginBottom: '4px', padding: '0 4px' }}>
                  <div style={{ fontSize: '11px', color: '#9e9e9e', paddingLeft: '12px', marginBottom: '2px' }}>
                    {viewMode === 'trade' ? '매매가' : '전세가'} (억원) — {selectedArea === 'all' ? '26평 기준' : AREA_LABELS[selectedArea as AreaKey]}
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="price"
                        tickFormatter={v => `${(v / 10000).toFixed(0)}억`}
                        tick={{ fontSize: 10 }}
                        width={44}
                      />
                      <YAxis
                        yAxisId="count"
                        orientation="right"
                        tick={{ fontSize: 10 }}
                        width={32}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === 'totalCount') return [`${value}건`, '총 거래건수'];
                          return [`${(value / 10000).toFixed(1)}억`, name];
                        }}
                        contentStyle={{ fontSize: '11px' }}
                      />
                      {/* 거래건수 막대 (배경) */}
                      <Bar yAxisId="count" dataKey="totalCount" fill="#89CFF0" opacity={0.25} name="totalCount" />
                      {/* 구별 가격 라인 */}
                      {ALL_DISTRICTS_ORDER.filter(d => graphDistricts.has(d)).map(d => (
                        <Line
                          key={d}
                          yAxisId="price"
                          type="monotone"
                          dataKey={d}
                          stroke={DISTRICT_COLORS[d] ?? '#9e9e9e'}
                          strokeWidth={1.5}
                          dot={{ r: 3 }}
                          connectNulls
                          name={d}
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 하단 안내 */}
      {stats.length > 0 && (
        <div style={{
          padding: '6px 12px', fontSize: '10px', color: '#9e9e9e',
          borderTop: '1px solid #f0f0f0', flexShrink: 0, textAlign: 'center',
        }}>
          전용면적 기준 · 출처: 국토교통부 실거래가
        </div>
      )}

      {/* 스피너 애니메이션 */}
      <style>{`
        @keyframes dtr-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* 실거래 상세 모달 — 건수 클릭 시 표시 */}
      {detailCtx && (
        <div
          onClick={() => setDetailCtx(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)',
            zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#fff', borderRadius: '12px', width: '480px', maxWidth: '95vw',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            {/* 모달 헤더 */}
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid #e8eaed',
              display: 'flex', alignItems: 'center', gap: '8px',
              backgroundColor: '#f0f8fd', borderRadius: '12px 12px 0 0',
            }}>
              <span style={{ fontWeight: 700, fontSize: '13px', color: '#1a3a5c', flex: 1 }}>
                {detailCtx.district} · {AREA_LABELS[detailCtx.areaKey]} ·{' '}
                {formatMonthLabel(detailCtx.month)} ·{' '}
                {detailCtx.mode === 'trade' ? '매매' : '전세'}
              </span>
              <button
                onClick={() => setDetailCtx(null)}
                style={{
                  padding: '2px 8px', fontSize: '13px', border: '1px solid #dadce0',
                  borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', color: '#5f6368',
                }}
              >✕</button>
            </div>

            {/* 모달 본문 */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
              {detailLoading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
                  불러오는 중...
                </div>
              ) : detailItems.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
                  데이터가 없습니다.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0 }}>
                      <th style={dtThStyle}>단지명</th>
                      <th style={dtThStyle}>면적</th>
                      <th style={dtThStyle}>층</th>
                      <th style={dtThStyle}>연식</th>
                      <th style={dtThStyle}>거래일</th>
                      <th style={{ ...dtThStyle, textAlign: 'right' }}>
                        {detailCtx.mode === 'trade' ? '매매가' : '보증금'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((item, i) => {
                      const price = detailCtx.mode === 'trade' ? item.dealAmount : item.deposit;
                      const dealDate = [item.dealYear, item.dealMonth?.padStart(2, '0'), item.dealDay?.padStart(2, '0')]
                        .filter(Boolean).join('-');
                      return (
                        <tr
                          key={item.id}
                          style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}
                        >
                          <td style={dtTdStyle}>
                            <div style={{ fontWeight: 600, color: '#1a3a5c' }}>{item.aptNm || '-'}</div>
                            {item.umdNm && (
                              <div style={{ fontSize: '10px', color: '#9e9e9e', marginTop: '1px' }}>{item.umdNm}</div>
                            )}
                          </td>
                          <td style={{ ...dtTdStyle, textAlign: 'center', color: '#5f6368' }}>
                            {item.excluUseAr ? `${parseFloat(item.excluUseAr).toFixed(1)}㎡` : '-'}
                          </td>
                          <td style={{ ...dtTdStyle, textAlign: 'center', color: '#5f6368' }}>
                            {item.floor ? `${item.floor}층` : '-'}
                          </td>
                          <td style={{ ...dtTdStyle, textAlign: 'center', color: '#5f6368' }}>
                            {item.buildYear || '-'}
                          </td>
                          <td style={{ ...dtTdStyle, textAlign: 'center', color: '#5f6368' }}>
                            {dealDate || '-'}
                          </td>
                          <td style={{ ...dtTdStyle, textAlign: 'right', fontWeight: 700, color: '#e53935' }}>
                            {toUk(price)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* 모달 푸터 — 건수 요약 */}
            {!detailLoading && detailItems.length > 0 && (
              <div style={{
                padding: '8px 16px', borderTop: '1px solid #f0f0f0',
                fontSize: '11px', color: '#9e9e9e', textAlign: 'right',
                borderRadius: '0 0 12px 12px',
              }}>
                총 {detailItems.length}건 · 직거래 제외
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const thStyle: React.CSSProperties = {
  padding: '6px 8px', fontSize: '11px', fontWeight: 600, color: '#344054',
  borderBottom: '1px solid #e8eaed', textAlign: 'center',
};

const tdStyle: React.CSSProperties = {
  padding: '5px 8px', fontSize: '11px', color: '#1a3a5c',
};

const dtThStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: '#344054',
  borderBottom: '1px solid #e8eaed', textAlign: 'center', whiteSpace: 'nowrap',
};

const dtTdStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: '12px', color: '#1a3a5c',
};

export default DistrictStatsPanel;
