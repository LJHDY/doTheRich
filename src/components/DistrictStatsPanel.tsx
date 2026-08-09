import React, { useState, useEffect, useCallback } from 'react';
import { DistrictStat } from '../types';
import { getDistrictStats, collectDistrictStats } from '../services/api';

interface Props {
  onClose: () => void;
  isMobile?: boolean;
}

// 만원 → 억 단위 표시 (소수점 1자리)
const toUk = (v?: number | null): string => {
  if (v == null) return '-';
  const uk = v / 10000;
  return uk >= 1 ? `${uk.toFixed(1)}억` : `${Math.round(v / 1000)}천`;
};

// 서울 25구 지역 순서 정렬 기준
const DISTRICT_ORDER = [
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구',
  '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구',
  '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구',
  '서초구', '강남구', '송파구', '강동구',
];

type AreaKey = '10' | '20' | '30';

const AREA_LABELS: Record<AreaKey, string> = {
  '10': '전용 33~66㎡',
  '20': '전용 66~99㎡',
  '30': '전용 99~132㎡',
};

type ViewMode = 'trade' | 'jeonse';

const DistrictStatsPanel: React.FC<Props> = ({ onClose, isMobile }) => {
  const [stats, setStats] = useState<DistrictStat[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('trade');
  const [collectMsg, setCollectMsg] = useState('');

  const load = useCallback(async (month?: string) => {
    setLoading(true);
    try {
      const res = await getDistrictStats(month);
      setStats(res.data);
      setAvailableMonths(res.availableMonths);
      if (!month && res.availableMonths.length > 0) {
        setSelectedMonth(res.availableMonths[0]);
      }
    } catch {
      // 데이터 없을 때 빈 상태 유지
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
    setCollectMsg('');
    try {
      const res = await collectDistrictStats();
      setCollectMsg(res.message);
      // 30초 후 데이터 재조회 (백그라운드 처리 완료 예상)
      setTimeout(() => load(), 30000);
    } catch {
      setCollectMsg('수집 요청에 실패했습니다.');
    } finally {
      setCollecting(false);
    }
  };

  // 지역 순서대로 정렬
  const sortedStats = [...stats].sort((a, b) => {
    const ia = DISTRICT_ORDER.indexOf(a.district);
    const ib = DISTRICT_ORDER.indexOf(b.district);
    return ia - ib;
  });

  const statMap = new Map(sortedStats.map(s => [s.district, s]));

  const getVal = (s: DistrictStat | undefined, area: AreaKey, mode: ViewMode) => {
    if (!s) return undefined;
    if (mode === 'trade') {
      return area === '10' ? s.avgTrade10 : area === '20' ? s.avgTrade20 : s.avgTrade30;
    } else {
      return area === '10' ? s.avgJeonse10 : area === '20' ? s.avgJeonse20 : s.avgJeonse30;
    }
  };

  const getCount = (s: DistrictStat | undefined, area: AreaKey, mode: ViewMode) => {
    if (!s) return undefined;
    if (mode === 'trade') {
      return area === '10' ? s.tradeCount10 : area === '20' ? s.tradeCount20 : s.tradeCount30;
    } else {
      return area === '10' ? s.jeonseCount10 : area === '20' ? s.jeonseCount20 : s.jeonseCount30;
    }
  };

  // 같은 평형대 내 최댓값 (색상 히트맵 계산용)
  const maxVals: Record<AreaKey, number> = { '10': 0, '20': 0, '30': 0 };
  for (const d of DISTRICT_ORDER) {
    const s = statMap.get(d);
    if (!s) continue;
    (['10', '20', '30'] as AreaKey[]).forEach(a => {
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

  const panelWidth = isMobile ? '100%' : '640px';
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
          }}
        >{collecting ? '수집 중...' : '시세 수집'}</button>

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

      {/* 수집 메시지 */}
      {collectMsg && (
        <div style={{
          padding: '6px 12px', fontSize: '11px', backgroundColor: '#f0f8fd',
          color: '#2a6090', borderBottom: '1px solid #d4edfb', flexShrink: 0,
        }}>
          {collectMsg}
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
          <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: '11px',
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ ...thStyle, textAlign: 'left', width: '70px' }}>지역</th>
                {(Object.entries(AREA_LABELS) as [AreaKey, string][]).map(([key, label]) => (
                  <th key={key} style={thStyle}>{label}</th>
                ))}
                <th style={{ ...thStyle, color: '#9e9e9e', fontSize: '10px' }}>건수</th>
              </tr>
            </thead>
            <tbody>
              {(stats.length > 0 ? DISTRICT_ORDER.filter(d => statMap.has(d)) : []).map(district => {
                const s = statMap.get(district);
                return (
                  <tr key={district} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1a3a5c' }}>{district}</td>
                    {(['10', '20', '30'] as AreaKey[]).map(area => {
                      const v = getVal(s, area, viewMode);
                      return (
                        <td
                          key={area}
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            backgroundColor: cellBg(v, area),
                            color: v ? '#1a3a5c' : '#bdbdbd',
                          }}
                        >
                          {toUk(v)}
                        </td>
                      );
                    })}
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#9e9e9e', fontSize: '10px' }}>
                      {(['10', '20', '30'] as AreaKey[]).map(a => getCount(s, a, viewMode) ?? 0).join('/')}
                    </td>
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
