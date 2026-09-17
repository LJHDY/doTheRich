/**
 * VirtualPortfolioPanel — 수급 신호 기반 가상 투자 포트폴리오
 *
 * 표시:
 *  - 계좌 요약: 초기잔고 / 현금 / 포지션 평가금액 / 총손익
 *  - 보유 포지션 테이블: 평단가·현재가·수익률·손익금액
 *  - 거래 이력 (최근 50건): 매수/매도·금액·수급신호·실현손익
 */
import React, { useCallback, useEffect, useState } from 'react';
import { getVirtualPortfolio, resetVirtualPortfolio } from '../../services/api';
import { VirtualPortfolio, VirtualPosition, VirtualTrade } from '../../types';

// ── 스타일 상수 ─────────────────────────────────────────────────────────────
const DARK_BLUE = '#1a3a5c';
const BABY_BLUE = '#89CFF0';

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  border: '1px solid #e8f0f8',
  padding: '16px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  marginBottom: '12px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#5c6e8a',
  marginBottom: '10px',
};

const theadTh: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#5c6e8a',
  background: '#f0f8fd',
  textAlign: 'left',
  borderBottom: '1px solid #e8f0f8',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '13px',
  color: DARK_BLUE,
  borderBottom: '1px solid #f0f4f8',
  verticalAlign: 'middle',
};

// ── 포맷 헬퍼 ────────────────────────────────────────────────────────────────

/** 원 → 만원 (ex: 10,000,000 → "1,000만원") */
const fmtWon = (v: number) => `${(v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원`;

/** 원 → 억 단위 (ex: 50,000,000 → "5,000만") */
const fmtWonShort = (v: number) => {
  const man = Math.round(v / 10000);
  if (Math.abs(man) >= 10000) return `${(man / 10000).toFixed(1)}억`;
  return `${man.toLocaleString()}만`;
};

/** 손익 색상: 양수=빨강, 음수=파랑, 0=회색 */
const pnlColor = (v: number | null) => {
  if (v === null) return '#999';
  if (v > 0) return '#e53935';
  if (v < 0) return '#1565c0';
  return '#555';
};

/** 날짜 간단 포맷 */
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────
const VirtualPortfolioPanel: React.FC = () => {
  const [portfolio, setPortfolio] = useState<VirtualPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPortfolio(await getVirtualPortfolio());
    } catch (e) {
      console.error('가상 포트폴리오 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReset = async () => {
    if (!window.confirm('가상 계좌를 초기화할까요?\n모든 포지션과 거래 이력이 삭제되고 5,000만원으로 리셋됩니다.')) return;
    setResetting(true);
    try {
      await resetVirtualPortfolio();
      await load();
    } catch (e) {
      alert('초기화에 실패했습니다.');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#8a9ab8' }}>로딩 중...</div>;
  }

  if (!portfolio) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#8a9ab8' }}>데이터를 불러올 수 없습니다.</div>;
  }

  const { account, positions, trades } = portfolio;

  // 총자산 = 현금 + 포지션 평가금액
  const totalAsset = account.balance + (account.totalCurrentValue ?? account.totalInvested);
  const totalPnlPct = account.totalPnl !== null && account.totalInvested > 0
    ? (account.totalPnl / account.totalInvested * 100)
    : null;

  return (
    <div style={{ padding: '16px', maxWidth: '960px', margin: '0 auto' }}>

      {/* 제목 + 리셋 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: DARK_BLUE, margin: 0 }}>
            💹 가상 투자 포트폴리오
          </h2>
          <p style={{ fontSize: '12px', color: '#8a9ab8', marginTop: '4px' }}>
            외국인+기관 동시 수급 신호 기반 자동 매수/매도 (최대 1,000만원/회)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={load}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #c8d8e4', background: '#f8fbfd', fontSize: '12px', cursor: 'pointer', color: DARK_BLUE }}
          >
            새로고침
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#fee2e2', color: '#b91c1c', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            {resetting ? '초기화 중...' : '계좌 초기화'}
          </button>
        </div>
      </div>

      {/* 계좌 요약 카드 */}
      <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {[
          { label: '초기 잔고', value: fmtWonShort(account.initialBalance), color: '#555' },
          { label: '현금', value: fmtWonShort(account.balance), color: DARK_BLUE },
          { label: '포지션 평가', value: account.totalCurrentValue !== null ? fmtWonShort(account.totalCurrentValue) : '-', color: DARK_BLUE },
          { label: '총 자산', value: fmtWonShort(totalAsset), color: DARK_BLUE },
          {
            label: '미실현 손익',
            value: account.totalPnl !== null
              ? `${account.totalPnl >= 0 ? '+' : ''}${fmtWonShort(account.totalPnl)}${totalPnlPct !== null ? ` (${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}%)` : ''}`
              : '-',
            color: pnlColor(account.totalPnl),
          },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center', padding: '8px 4px' }}>
            <div style={{ fontSize: '11px', color: '#8a9ab8', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 보유 포지션 */}
      <div style={cardStyle}>
        <div style={labelStyle}>보유 포지션 ({positions.length}개)</div>
        {positions.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#8a9ab8', fontSize: '13px' }}>
            보유 중인 포지션이 없습니다.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={theadTh}>종목</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>평단가</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>현재가</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>수익률</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>손익금액</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>투자금</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>평가금</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos: VirtualPosition) => (
                  <tr key={pos.id}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{pos.stockName}</span>
                      <span style={{ fontSize: '11px', color: '#8a9ab8', marginLeft: '4px' }}>({pos.stockCode})</span>
                      <div style={{ fontSize: '11px', color: '#8a9ab8' }}>{pos.shares.toFixed(2)}주</div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pos.avgPrice.toLocaleString()}원</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {pos.currentPrice !== null ? `${pos.currentPrice.toLocaleString()}원` : '-'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: pnlColor(pos.pnl), fontWeight: 600 }}>
                      {pos.pnlPct !== null ? `${pos.pnlPct >= 0 ? '+' : ''}${pos.pnlPct.toFixed(2)}%` : '-'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: pnlColor(pos.pnl), fontWeight: 600 }}>
                      {pos.pnl !== null ? `${pos.pnl >= 0 ? '+' : ''}${fmtWon(pos.pnl)}` : '-'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtWon(pos.totalInvested)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {pos.currentValue !== null ? fmtWon(pos.currentValue) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 거래 이력 */}
      <div style={cardStyle}>
        <div style={labelStyle}>거래 이력 (최근 {trades.length}건)</div>
        {trades.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#8a9ab8', fontSize: '13px' }}>
            거래 이력이 없습니다. 수급 신호가 발생하면 자동으로 기록됩니다.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={theadTh}>일시</th>
                  <th style={{ ...theadTh, textAlign: 'center' }}>구분</th>
                  <th style={theadTh}>종목</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>체결가</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>주수</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>거래금액</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>수급신호</th>
                  <th style={{ ...theadTh, textAlign: 'right' }}>실현손익</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t: VirtualTrade) => (
                  <tr key={t.id} style={{ background: t.action === 'BUY' ? '#f0fdf4' : '#fff5f5' }}>
                    <td style={{ ...tdStyle, fontSize: '12px', color: '#8a9ab8' }}>{fmtDate(t.createdAt)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: t.action === 'BUY' ? '#dcfce7' : '#fee2e2',
                        color: t.action === 'BUY' ? '#166534' : '#b91c1c',
                      }}>
                        {t.action === 'BUY' ? '매수' : '매도'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{t.stockName}</span>
                      <span style={{ fontSize: '11px', color: '#8a9ab8', marginLeft: '4px' }}>({t.stockCode})</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{t.price.toLocaleString()}원</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{t.shares.toFixed(2)}주</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtWon(t.amount)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px' }}>
                      {t.signalForeign !== null && t.signalInst !== null ? (
                        <span style={{ color: t.signalForeign > 0 ? '#166534' : '#b91c1c' }}>
                          외{t.signalForeign >= 0 ? '+' : ''}{t.signalForeign?.toFixed(0)}억
                          <br />
                          기{t.signalInst >= 0 ? '+' : ''}{t.signalInst?.toFixed(0)}억
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: pnlColor(t.pnl) }}>
                      {t.pnl !== null ? `${t.pnl >= 0 ? '+' : ''}${fmtWon(t.pnl)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default VirtualPortfolioPanel;
