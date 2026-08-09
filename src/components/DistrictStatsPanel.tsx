import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DistrictStat } from '../types';
import { getDistrictStats, collectDistrictStats } from '../services/api';

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


type AreaKey = '18' | '21' | '24' | '26' | '33';

const AREA_LABELS: Record<AreaKey, string> = {
  '18': '전용 59㎡ (18평)',
  '21': '전용 69㎡ (21평)',
  '24': '전용 79㎡ (24평)',
  '26': '전용 85㎡ (26평)',
  '33': '전용 109㎡ (33평)',
};

type ViewMode = 'trade' | 'jeonse';

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
    setCollecting(true);
    // 수집 시작 시각 기록 — 이보다 최신 collectedAt이 생기면 완료로 판단
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
      return area === '18' ? s.avgTrade18 : area === '21' ? s.avgTrade21
           : area === '24' ? s.avgTrade24 : area === '26' ? s.avgTrade26 : s.avgTrade33;
    } else {
      return area === '18' ? s.avgJeonse18 : area === '21' ? s.avgJeonse21
           : area === '24' ? s.avgJeonse24 : area === '26' ? s.avgJeonse26 : s.avgJeonse33;
    }
  };

  const getCount = (s: DistrictStat | undefined, area: AreaKey, mode: ViewMode) => {
    if (!s) return undefined;
    if (mode === 'trade') {
      return area === '18' ? s.tradeCount18 : area === '21' ? s.tradeCount21
           : area === '24' ? s.tradeCount24 : area === '26' ? s.tradeCount26 : s.tradeCount33;
    } else {
      return area === '18' ? s.jeonseCount18 : area === '21' ? s.jeonseCount21
           : area === '24' ? s.jeonseCount24 : area === '26' ? s.jeonseCount26 : s.jeonseCount33;
    }
  };

  const ALL_AREAS = ['18', '21', '24', '26', '33'] as AreaKey[];

  // 데이터가 있는 평형의 평균가 기준 내림차순 정렬
  // 합산 대신 평균을 써야 데이터 없는 평형이 0으로 처리되어 낮게 평가되는 것을 방지
  const sortedDistricts = Array.from(statMap.keys()).sort((a, b) => {
    const sa = statMap.get(a);
    const sb = statMap.get(b);
    const valsA = ALL_AREAS.map(area => getVal(sa, area, viewMode)).filter((v): v is number => v != null);
    const valsB = ALL_AREAS.map(area => getVal(sb, area, viewMode)).filter((v): v is number => v != null);
    const avgA = valsA.length ? valsA.reduce((s, v) => s + v, 0) / valsA.length : 0;
    const avgB = valsB.length ? valsB.reduce((s, v) => s + v, 0) / valsB.length : 0;
    return avgB - avgA;
  });

  // 같은 평형대 내 최댓값 (색상 히트맵 계산용)
  const maxVals: Record<AreaKey, number> = { '18': 0, '21': 0, '24': 0, '26': 0, '33': 0 };
  for (const s of Array.from(statMap.values())) {
    ALL_AREAS.forEach(a => {
      const v = getVal(s, a, viewMode);
      if (v && v > maxVals[a]) maxVals[a] = v;
    });
  }

  const cellBg = (v?: number | null, area?: AreaKey): string => {
    if (!v || !area || !maxVals[area]) return 'transparent';
    const ratio = v / maxVals[area];
    // 낮을수록 파랑 → 높을수록 빨강 (부동산 가격 시각화 관례)
    const r = Math.round(255 * ratio);
    const b = Math.round(255 * (1 - ratio));
    return `rgba(${r}, 120, ${b}, 0.12)`;
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
      <div style={{ flex: 1, overflowY: 'auto' }}>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ ...thStyle, textAlign: 'left', width: '70px' }}>지역</th>
                {(Object.entries(AREA_LABELS) as [AreaKey, string][]).map(([key, label]) => (
                  <th key={key} style={thStyle}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedDistricts.map(district => {
                const s = statMap.get(district);
                return (
                  <tr key={district} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1a3a5c' }}>{district}</td>
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
                              <span style={{ fontSize: '10px', color: '#9e9e9e', marginLeft: '3px' }}>
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
      </div>

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

export default DistrictStatsPanel;
