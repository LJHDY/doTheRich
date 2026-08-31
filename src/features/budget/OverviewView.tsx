// ─── 통합 보기 뷰 ─────────────────────────────────────────────
// 최신 자산 스냅샷 + 월별 가계부 요약을 동영/주해/합산 3열 테이블로 표시
// BudgetPage의 OVERVIEW 탭에서 렌더링
import React, { useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { getAllAssetSnapshots, getBudgetEntries } from '../../services/api';
import { AssetSnapshotCell, BudgetEntry } from '../../types';
import {
  ASSET_COLUMNS,
  ASSET_LIQUIDITY_COLORS,
  BUDGET_USERS,
} from './budgetConstants';
import { formatAmountShort } from '../../types';

const EXCHANGE_RATE_KEY = 'asset_exchange_rate';

/** yearMonth 문자열을 "YYYY년 M월" 형식으로 변환 */
const displayYearMonth = (ym: string) =>
  `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`;

const OverviewView: React.FC<{ yearMonth: string }> = ({ yearMonth }) => {
  const isMobile = useIsMobile();
  const [allSnapshots, setAllSnapshots] = useState<AssetSnapshotCell[]>([]);
  const [entries, setEntries] = useState<{ ldy: BudgetEntry[]; juhae: BudgetEntry[] }>({ ldy: [], juhae: [] });
  const [loading, setLoading] = useState(false);

  // 통합 보기에서도 최신 스냅샷 사용 (localStorage의 환율 참조)
  const exchangeRate = Number(localStorage.getItem(EXCHANGE_RATE_KEY)) || 1450;

  // 스냅샷은 월별 가계부와 독립 — 마운트 시 1회만 조회
  useEffect(() => {
    getAllAssetSnapshots().then(setAllSnapshots);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getBudgetEntries(BUDGET_USERS[0].id, yearMonth),
      getBudgetEntries(BUDGET_USERS[1].id, yearMonth),
    ]).then(([le, je]) => {
      setEntries({ ldy: le, juhae: je });
    }).finally(() => setLoading(false));
  }, [yearMonth]);

  const [u0, u1] = BUDGET_USERS; // 동영, 주해

  // 가장 최근 스냅샷 날짜의 데이터를 자산 현황에 사용
  const latestDate = useMemo(() => {
    const dates = Array.from(new Set(allSnapshots.map(s => s.snapshotDate))).sort().reverse();
    return dates[0] ?? '';
  }, [allSnapshots]);

  const getAssetAmt = (userId: string, key: string) => {
    const cell = allSnapshots.find(
      s => s.snapshotDate === latestDate && s.userId === userId && s.assetType === key
    );
    return cell?.amount ?? 0;
  };

  // USD 컬럼(미국주식·달러 현금) → KRW 환산, 그 외 원화 그대로
  const isUsdCol = (key: string) => ASSET_COLUMNS.find(c => c.key === key)?.isDollar === true;
  const toKrw = (key: string, amount: number) =>
    isUsdCol(key) ? Math.round(amount * exchangeRate) : amount;

  const assetGroupSubtotal = (group: string, userId: string) =>
    ASSET_COLUMNS.filter(c => c.group === group).reduce(
      (s, c) => s + toKrw(c.key, getAssetAmt(userId, c.key)), 0
    );

  const assetGrandTotal = (userId: string) =>
    ASSET_COLUMNS.reduce((s, c) => s + toKrw(c.key, getAssetAmt(userId, c.key)), 0);

  // 가계부 요약
  const entrySummary = useMemo(() => {
    // isTransfer 플래그 또는 category='이체' 두 조건 모두 이체로 판정
    const isXfer = (e: BudgetEntry) => e.isTransfer || e.category === '이체';
    const calc = (list: BudgetEntry[]) => ({
      income:   list.filter(e => e.entryType === 'INCOME' && !isXfer(e)).reduce((s, e) => s + e.amount, 0),
      expense:  list.filter(e => e.entryType === 'EXPENSE' && !e.isInvestment && !isXfer(e)).reduce((s, e) => s + e.amount, 0),
      fixed:    list.filter(e => e.entryType === 'EXPENSE' && e.isFixed && !e.isInvestment && !isXfer(e)).reduce((s, e) => s + e.amount, 0),
      variable: list.filter(e => e.entryType === 'EXPENSE' && !e.isFixed && !e.isInvestment && !isXfer(e)).reduce((s, e) => s + e.amount, 0),
      invest:   list.filter(e => e.isInvestment && !isXfer(e)).reduce((s, e) => s + e.amount, 0),
    });
    return { ldy: calc(entries.ldy), juhae: calc(entries.juhae) };
  }, [entries]);

  const LIQUIDITY_GROUPS = ['즉시 사용 가능', '즉시 사용 불가'] as const;

  // 모바일: 숫자 열 고정폭(최소 보장) → 넘치면 가로 스크롤
  const GRID = isMobile ? '58px 95px 95px 95px' : '120px 1fr 1fr 1fr';
  const FS = isMobile ? '11px' : '13px'; // 행 폰트 크기
  const ROW_H = isMobile ? '34px' : '40px';

  // 열 구분선 공통 스타일
  const cellBorder = '1px solid #e8ecf0';
  const numCell = (extra?: React.CSSProperties): React.CSSProperties => ({
    textAlign: 'right', borderLeft: cellBorder, padding: '0 8px', ...extra,
  });

  // 3열 행 렌더 헬퍼
  const Row3 = ({
    label, v0, v1, bold = false, colored = false, isBalance = false,
  }: { label: string; v0: number; v1: number; bold?: boolean; colored?: boolean; isBalance?: boolean }) => {
    const sum = v0 + v1;
    const fmt = (v: number) => v === 0 ? '—' : `${v < 0 ? '-' : ''}${formatAmountShort(Math.abs(v))}`;
    const color = (v: number) => isBalance
      ? (v >= 0 ? '#1565c0' : '#E06060')
      : colored ? '#E06060' : '#344054';
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: GRID,
        fontSize: FS, borderBottom: '1px solid #f0f0f0',
        fontWeight: bold ? 700 : 400,
        background: bold ? '#fafbfc' : '#fff',
        minHeight: ROW_H, alignItems: 'center',
      }}>
        <span style={{ color: '#5f6368', padding: '0 6px 0 10px' }}>{label}</span>
        <span style={numCell({ color: color(v0) })}>{fmt(v0)}</span>
        <span style={numCell({ color: color(v1) })}>{fmt(v1)}</span>
        <span style={numCell({ color: color(sum), fontWeight: 700 })}>{fmt(sum)}</span>
      </div>
    );
  };

  // 테이블 헤더
  const TableHeader = ({ title }: { title: string }) => (
    <>
      <div style={{ fontSize: isMobile ? '13px' : '14px', fontWeight: 800, color: '#1a3a5c', marginBottom: '8px', marginTop: '24px' }}>{title}</div>
      <div style={{
        display: 'grid', gridTemplateColumns: GRID,
        fontSize: isMobile ? '11px' : '12px', fontWeight: 700, color: '#fff',
        background: '#89CFF0', borderRadius: '8px 8px 0 0',
        minHeight: isMobile ? '30px' : '36px', alignItems: 'center',
      }}>
        <span style={{ padding: '0 6px 0 10px' }}>항목</span>
        <span style={{ textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '0 8px' }}>{u0.name}</span>
        <span style={{ textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '0 8px' }}>{u1.name}</span>
        <span style={{ textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '0 8px' }}>합산</span>
      </div>
    </>
  );

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6' }}>불러오는 중…</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 40px' }}>

      {/* ── 자산 현황 테이블 (유동성 그룹별 소계) */}
      <div style={{ overflowX: 'auto' }}>
        <TableHeader title={`💰 자산 현황${latestDate ? ` (${latestDate})` : ''}`} />
        <div style={{ border: '1px solid #f0f0f0', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          {LIQUIDITY_GROUPS.map(g => {
            const v0 = assetGroupSubtotal(g, u0.id);
            const v1 = assetGroupSubtotal(g, u1.id);
            const lc = ASSET_LIQUIDITY_COLORS[g];
            const label = isMobile
              ? (g === '즉시 사용 가능' ? '즉시 O' : '즉시 X')
              : g;
            return (
              <div key={g} style={{
                display: 'grid', gridTemplateColumns: GRID,
                fontSize: FS, borderBottom: '1px solid #f0f0f0', background: '#fff',
                minHeight: ROW_H, alignItems: 'center',
              }}>
                <span style={{ padding: '0 6px 0 10px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 5px', borderRadius: '4px', background: lc.bg, color: lc.text, whiteSpace: 'nowrap' }}>{label}</span>
                </span>
                <span style={numCell({ color: '#344054' })}>{v0 ? formatAmountShort(v0) : '—'}</span>
                <span style={numCell({ color: '#344054' })}>{v1 ? formatAmountShort(v1) : '—'}</span>
                <span style={numCell({ fontWeight: 700, color: '#1a3a5c' })}>{(v0 + v1) ? formatAmountShort(v0 + v1) : '—'}</span>
              </div>
            );
          })}
          <div style={{
            display: 'grid', gridTemplateColumns: GRID,
            fontSize: FS, fontWeight: 800,
            background: '#f0f8fd', borderTop: '2px solid #89CFF040',
            minHeight: ROW_H, alignItems: 'center',
          }}>
            <span style={{ color: '#1a3a5c', padding: '0 6px 0 10px' }}>총 자산</span>
            <span style={numCell({ color: '#1565c0' })}>{assetGrandTotal(u0.id) ? formatAmountShort(assetGrandTotal(u0.id)) : '—'}</span>
            <span style={numCell({ color: '#1565c0' })}>{assetGrandTotal(u1.id) ? formatAmountShort(assetGrandTotal(u1.id)) : '—'}</span>
            <span style={numCell({ color: '#1a3a5c' })}>
              {formatAmountShort(assetGrandTotal(u0.id) + assetGrandTotal(u1.id))}
            </span>
          </div>
        </div>
      </div>

      {/* ── 월별 가계부 테이블 */}
      <div style={{ overflowX: 'auto' }}>
        <TableHeader title={`📒 가계부 — ${displayYearMonth(yearMonth)}`} />
        <div style={{ border: '1px solid #f0f0f0', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          <Row3 label="총 수입" v0={entrySummary.ldy.income} v1={entrySummary.juhae.income} bold />
          <Row3 label="총 지출" v0={entrySummary.ldy.expense} v1={entrySummary.juhae.expense} colored />
          <Row3
            label="잔액"
            v0={entrySummary.ldy.income - entrySummary.ldy.expense - entrySummary.ldy.invest}
            v1={entrySummary.juhae.income - entrySummary.juhae.expense - entrySummary.juhae.invest}
            bold isBalance
          />
          <Row3 label="고정비" v0={entrySummary.ldy.fixed} v1={entrySummary.juhae.fixed} />
          <Row3 label="변동비" v0={entrySummary.ldy.variable} v1={entrySummary.juhae.variable} />
          <Row3 label="투자" v0={entrySummary.ldy.invest} v1={entrySummary.juhae.invest} />
        </div>
      </div>

    </div>
  );
};

export default OverviewView;
