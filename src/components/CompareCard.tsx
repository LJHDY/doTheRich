import React, { useState, useEffect, useCallback } from 'react';
import { ApartmentComplex, PriceHistory, ChartDataRow, ChartSeries, formatPrice, toUkUnit } from '../types';
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
