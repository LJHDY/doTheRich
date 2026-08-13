import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip as PieTooltip,
} from 'recharts';
import {
  ACCOUNT_GROUPS,
  ACCOUNT_MAINS,
  ASSET_COLUMNS,
  ASSET_LIQUIDITY_COLORS,
  BUDGET_USER_STORAGE_KEY,
  BUDGET_USERS,
  FIXED_EXPENSE_CATEGORIES,
  FIXED_EXPENSE_ITEM_CATEGORIES,
  VARIABLE_EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  INVESTMENT_TYPES,
} from '../../constants/budgetConstants';
import {
  getBudgetEntries,
  createBudgetEntry,
  updateBudgetEntry,
  deleteBudgetEntry,
  getAllAssetSnapshots,
  upsertAssetSnapshotCell,
  copyAssetSnapshot,
  deleteAssetSnapshotDate,
  getAssetSnapshotDetails,
  bulkSaveAssetSnapshotDetails,
  getFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  payFixedExpense,
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from '../../services/api';
import { AssetSnapshotCell, BudgetEntry, FixedExpense, PaymentMethod, formatAmount, formatAmountShort } from '../../types';
import UserSelectModal from './UserSelectModal';

const EXCHANGE_RATE_KEY = 'asset_exchange_rate';

interface Props {
  onClose: () => void;
}

// ─── 유틸 ────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);

/** 원 단위 금액을 한글로 표기 — 예: 1500000 → "150만원", 150000000 → "1억 5000만원" */
const formatAmountKorean = (won: number): string => {
  if (!won || won <= 0) return '';
  const uk = Math.floor(won / 1e8);
  const man = Math.floor((won % 1e8) / 1e4);
  const remainder = won % 1e4;
  const parts: string[] = [];
  if (uk > 0) parts.push(`${uk}억`);
  if (man > 0) parts.push(`${man}만`);
  if (remainder > 0) parts.push(`${remainder}원`);
  return parts.join(' ');
};
const toYearMonth = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
const displayYearMonth = (ym: string) =>
  `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`;

const initialForm = (): Partial<BudgetEntry> & { amountStr: string } => ({
  entryDate: today(),
  entryType: 'EXPENSE',
  category: '',
  subcategory: '',
  accountMain: '',
  account: '',
  amountStr: '',
  isFixed: false,
  isInvestment: false,
  investmentType: '',
  memo: '',
});

type Filter = 'ALL' | 'INCOME' | 'EXPENSE' | 'FIXED' | 'INVEST';
type Tab = 'ENTRIES' | 'ACCOUNTS' | 'ASSETS' | 'OVERVIEW'; // 가계부 내역 / 통장 관리 / 자산 관리 / 통합 보기

// ─── 컴포넌트 ─────────────────────────────────────────────────
const BudgetPage: React.FC<Props> = ({ onClose }) => {
  const [userId, setUserId] = useState<string>(
    () => localStorage.getItem(BUDGET_USER_STORAGE_KEY) ?? BUDGET_USERS[0].id
  );
  const [yearMonth, setYearMonth] = useState<string>(toYearMonth(new Date()));
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('budget_tab') as Tab) || 'ENTRIES');
  useEffect(() => { sessionStorage.setItem('budget_tab', tab); }, [tab]);
  const [showUserSelect, setShowUserSelect] = useState(false);
  const isMobile = useIsMobile();

  // 결제수단 목록 (userId 변경 시 재로드)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // 결제수단 로드
  useEffect(() => {
    getPaymentMethods(userId).then(setPaymentMethods).catch(() => {});
  }, [userId]);

  // 고정비 관리 모달
  const [fixedExpenseOpen, setFixedExpenseOpen] = useState(false);

  // 입력 폼
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm());

  // ─── 데이터 로드 ─────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBudgetEntries(userId, yearMonth);
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [userId, yearMonth]);

  useEffect(() => { load(); }, [load]);

  // ─── 월 이동 ─────────────────────────────────────────────────
  const moveMonth = (delta: number) => {
    const y = Number(yearMonth.slice(0, 4));
    const m = Number(yearMonth.slice(4)) + delta;
    const d = new Date(y, m - 1, 1);
    setYearMonth(toYearMonth(d));
  };

  // ─── 요약 계산 ───────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalIncome = entries.filter(e => e.entryType === 'INCOME').reduce((s, e) => s + e.amount, 0);
    const totalExpense = entries.filter(e => e.entryType === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
    const fixedExpense = entries.filter(e => e.entryType === 'EXPENSE' && e.isFixed).reduce((s, e) => s + e.amount, 0);
    const varExpense = entries.filter(e => e.entryType === 'EXPENSE' && !e.isFixed).reduce((s, e) => s + e.amount, 0);
    const totalInvest = entries.filter(e => e.isInvestment).reduce((s, e) => s + e.amount, 0);

    // 통장 대분류 기준 합산
    const accountMap: Record<string, { income: number; expense: number }> = {};
    entries.forEach(e => {
      const key = e.accountMain || e.account || '미분류';
      if (!accountMap[key]) accountMap[key] = { income: 0, expense: 0 };
      if (e.entryType === 'INCOME') accountMap[key].income += e.amount;
      else accountMap[key].expense += e.amount;
    });

    return { totalIncome, totalExpense, fixedExpense, varExpense, totalInvest, accountMap };
  }, [entries]);

  // ─── 필터링된 항목 ───────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filter === 'INCOME') return entries.filter(e => e.entryType === 'INCOME');
    if (filter === 'EXPENSE') return entries.filter(e => e.entryType === 'EXPENSE');
    if (filter === 'FIXED') return entries.filter(e => e.entryType === 'EXPENSE' && e.isFixed);
    if (filter === 'INVEST') return entries.filter(e => e.isInvestment);
    return entries;
  }, [entries, filter]);

  // ─── 폼 핸들러 ───────────────────────────────────────────────
  const openAdd = () => { setEditingId(null); setForm(initialForm()); setFormOpen(true); };
  const openEdit = (e: BudgetEntry) => {
    setEditingId(e.id);
    setForm({ ...e, amountStr: String(e.amount) });
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditingId(null); };

  // 지출: isFixed 값에 따라 고정비/변동비 카테고리 목록 결정
  const expenseCats = form.isFixed ? FIXED_EXPENSE_CATEGORIES : VARIABLE_EXPENSE_CATEGORIES;
  const incomeCats = INCOME_CATEGORIES;
  const selectedIncomeCat = form.entryType === 'INCOME'
    ? incomeCats.find(c => c.name === form.category)
    : undefined;

  const handleSave = async () => {
    const amount = Number(form.amountStr?.replace(/,/g, '') ?? 0);
    if (!form.category || !amount) { alert('카테고리와 금액을 입력해주세요'); return; }
    const payload = {
      userId,
      yearMonth,
      entryDate: form.entryDate ?? today(),
      entryType: form.entryType as 'INCOME' | 'EXPENSE',
      category: form.category ?? '',
      subcategory: form.subcategory || undefined,
      accountMain: form.accountMain || undefined,
      account: form.account || undefined,
      amount,
      isFixed: form.isFixed ?? false,
      isInvestment: form.isInvestment ?? false,
      investmentType: form.isInvestment ? (form.investmentType || undefined) : undefined,
      memo: form.memo || undefined,
    };
    try {
      if (editingId !== null) {
        const updated = await updateBudgetEntry(editingId, payload);
        setEntries(prev => prev.map(e => e.id === editingId ? updated : e));
      } else {
        const created = await createBudgetEntry(payload);
        setEntries(prev => [created, ...prev]);
      }
      closeForm();
    } catch { alert('저장에 실패했습니다'); }
  };

  const handleDelete = async (entry: BudgetEntry) => {
    if (!window.confirm(`"${entry.category}" 항목을 삭제할까요?`)) return;
    try {
      await deleteBudgetEntry(entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch { alert('삭제에 실패했습니다'); }
  };

  const handleUserSelect = (id: string) => {
    setUserId(id);
    setShowUserSelect(false);
  };

  const userName = BUDGET_USERS.find(u => u.id === userId)?.name ?? userId;

  // ─── 렌더 ─────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: '#f7fafd', display: 'flex', flexDirection: 'column',
      fontFamily: 'inherit',
    }}>
      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '3px solid #89CFF0', flexShrink: 0 }}>
        {isMobile ? (
          /* 모바일: 3행 레이아웃 */
          <>
            {/* 행 1: 닫기 + 타이틀 + 유저 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px 6px' }}>
              <button onClick={onClose} style={btnStyle('#e0f0ff', '#1a3a5c')}>← 닫기</button>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c', flexGrow: 1 }}>💰 가계부</span>
              <button onClick={() => setShowUserSelect(true)} style={btnStyle('#f0f8fd', '#1a3a5c')}>👤 {userName}</button>
            </div>
            {/* 행 2: 탭 전환 */}
            <div style={{ padding: '0 14px 6px' }}>
              <div style={{ display: 'flex', gap: '3px', background: '#f0f4f8', borderRadius: '8px', padding: '3px' }}>
                {([['ENTRIES', '내역'], ['ACCOUNTS', '통장'], ['ASSETS', '자산'], ['OVERVIEW', '통합']] as [Tab, string][]).map(([t, label]) => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    flex: 1, padding: '6px 4px', fontSize: '12px', fontWeight: tab === t ? 700 : 400,
                    borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: tab === t ? '#fff' : 'transparent',
                    color: tab === t ? '#1a3a5c' : '#5f6368',
                    boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {/* 행 3: 월 네비게이션 (내역·통합 탭에서만) */}
            {(tab === 'ENTRIES' || tab === 'OVERVIEW') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px 10px' }}>
                <button onClick={() => moveMonth(-1)} style={btnStyle('#f0f8fd', '#1a3a5c')}>◀</button>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#344054', flexGrow: 1, textAlign: 'center' }}>
                  {displayYearMonth(yearMonth)}
                </span>
                <button onClick={() => moveMonth(1)} style={btnStyle('#f0f8fd', '#1a3a5c')}>▶</button>
                {tab === 'ENTRIES' && <button onClick={openAdd} style={btnStyle('#89CFF0', '#fff')}>+ 추가</button>}
              </div>
            )}
          </>
        ) : (
          /* 데스크탑: 1행 레이아웃 (기존) */
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px' }}>
            <button onClick={onClose} style={btnStyle('#e0f0ff', '#1a3a5c')}>← 닫기</button>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#1a3a5c', flexGrow: 1 }}>💰 가계부</span>
            <div style={{ display: 'flex', gap: '4px', background: '#f0f4f8', borderRadius: '8px', padding: '3px' }}>
              {([['ENTRIES', '내역'], ['ACCOUNTS', '통장 관리'], ['ASSETS', '자산'], ['OVERVIEW', '통합 보기']] as [Tab, string][]).map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '4px 10px', fontSize: '12px', fontWeight: tab === t ? 700 : 400,
                  borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: tab === t ? '#fff' : 'transparent',
                  color: tab === t ? '#1a3a5c' : '#5f6368',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>{label}</button>
              ))}
            </div>
            <button onClick={() => setShowUserSelect(true)} style={btnStyle('#f0f8fd', '#1a3a5c')}>👤 {userName}</button>
            {(tab === 'ENTRIES' || tab === 'OVERVIEW') && <>
              <button onClick={() => moveMonth(-1)} style={btnStyle('#f0f8fd', '#1a3a5c')}>◀</button>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#344054', minWidth: '100px', textAlign: 'center' }}>
                {displayYearMonth(yearMonth)}
              </span>
              <button onClick={() => moveMonth(1)} style={btnStyle('#f0f8fd', '#1a3a5c')}>▶</button>
              {tab === 'ENTRIES' && <button onClick={openAdd} style={btnStyle('#89CFF0', '#fff')}>+ 추가</button>}
            </>}
          </div>
        )}
      </div>

      {/* ══ 내역 탭 ══════════════════════════════════════════ */}
      {tab === 'ENTRIES' && <>
        {/* ── 요약 카드 */}
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
          <SummaryCard label="총 수입" amount={summary.totalIncome} color="#4CAF50" sign="+" />
          <SummaryCard label="총 지출" amount={summary.totalExpense} color="#E06060" sign="-" />
          <SummaryCard label="잔액" amount={summary.totalIncome - summary.totalExpense}
            color={summary.totalIncome >= summary.totalExpense ? '#1565c0' : '#E06060'} sign="" />
        </div>

        {/* ── 고정/변동/투자 소요약 */}
        <div style={{ padding: '8px 20px 0', display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
          {[
            { label: '고정비', val: summary.fixedExpense, color: '#9C27B0' },
            { label: '변동비', val: summary.varExpense,   color: '#FF9800' },
            { label: '투자',   val: summary.totalInvest,  color: '#2196F3' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              background: '#fff', border: `1px solid ${color}30`, borderRadius: '8px',
              padding: '6px 14px', display: 'flex', gap: '8px', alignItems: 'center',
            }}>
              <span style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>{label}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color }}>{formatAmountShort(val)}</span>
            </div>
          ))}
        </div>

        {/* ── 통장별 현황 */}
        {Object.keys(summary.accountMap).length > 0 && (
          <div style={{ padding: '8px 20px 0', display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
            {Object.entries(summary.accountMap).map(([acc, { income, expense }]) => (
              <div key={acc} style={{
                background: '#fff', border: '1px solid #dadce0', borderRadius: '8px',
                padding: '6px 14px', fontSize: '12px',
              }}>
                <span style={{ fontWeight: 600, color: '#344054' }}>{acc}</span>
                {income > 0 && <span style={{ color: '#4CAF50', marginLeft: '6px' }}>+{formatAmountShort(income)}</span>}
                {expense > 0 && <span style={{ color: '#E06060', marginLeft: '4px' }}>-{formatAmountShort(expense)}</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── 카테고리별 지출 파이 차트 */}
        {(() => {
          const expenseEntries = entries.filter(e => e.entryType === 'EXPENSE');
          if (expenseEntries.length === 0) return null;
          const catMap: Record<string, number> = {};
          for (const e of expenseEntries) {
            const key = e.category || '미분류';
            catMap[key] = (catMap[key] ?? 0) + e.amount;
          }
          const chartData = Object.entries(catMap)
            .sort((a, b) => b[1] - a[1])
            .map(([name, value]) => ({ name, value }));
          const COLORS = [
            '#89CFF0','#FFD97D','#E06060','#9C27B0','#4CAF50',
            '#FF9800','#2196F3','#E91E63','#00BCD4','#8BC34A',
            '#FF5722','#607D8B','#795548','#673AB7','#03A9F4',
          ];
          const total = chartData.reduce((s, d) => s + d.value, 0);
          return (
            <div style={{ padding: '8px 20px 0', flexShrink: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#344054', marginBottom: '4px' }}>카테고리별 지출</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* 파이 차트 */}
                <PieChart width={130} height={130}>
                  <Pie
                    data={chartData} cx={60} cy={60}
                    innerRadius={32} outerRadius={58}
                    dataKey="value" stroke="none"
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <PieTooltip
                    formatter={(value: number, name: string) => [
                      `${formatAmountShort(value)}원 (${Math.round(value / total * 100)}%)`, name,
                    ]}
                    contentStyle={{ fontSize: '11px', padding: '4px 8px' }}
                  />
                </PieChart>
                {/* 범례 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', flex: 1 }}>
                  {chartData.map((d, i) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '80px' }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '2px', flexShrink: 0,
                        background: COLORS[i % COLORS.length],
                      }} />
                      <span style={{ fontSize: '11px', color: '#344054', whiteSpace: 'nowrap' }}>
                        {d.name}
                      </span>
                      <span style={{ fontSize: '11px', color: '#9aa0a6', whiteSpace: 'nowrap' }}>
                        {Math.round(d.value / total * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── 고정비 관리 버튼 + 필터 탭 */}
        <div style={{ padding: '10px 20px 0', display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setFixedExpenseOpen(true)}
            style={{
              padding: '5px 12px', fontSize: '12px', borderRadius: '20px',
              border: '1px solid #9C27B0', background: '#f3e5f5',
              color: '#7B1FA2', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >📌 고정비 관리</button>
          <div style={{ width: '1px', height: '16px', background: '#e0e0e0', flexShrink: 0 }} />
          {([
            ['ALL', '전체'], ['INCOME', '수입'], ['EXPENSE', '지출'],
            ['FIXED', '고정비'], ['INVEST', '투자'],
          ] as [Filter, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              padding: '5px 12px', fontSize: '12px', borderRadius: '20px',
              border: `1px solid ${filter === val ? '#89CFF0' : '#dadce0'}`,
              background: filter === val ? '#89CFF0' : '#fff',
              color: filter === val ? '#fff' : '#5f6368',
              cursor: 'pointer', fontWeight: filter === val ? 700 : 400,
            }}>
              {label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9aa0a6', alignSelf: 'center' }}>
            {filtered.length}건
          </span>
        </div>

        {/* ── 항목 목록 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px 20px' }}>
          {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6' }}>불러오는 중…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6', fontSize: '14px' }}>
              항목이 없습니다. + 추가로 기록을 시작하세요.
            </div>
          )}
          {!loading && filtered.map(entry => (
            <EntryRow key={entry.id} entry={entry} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      </>}

      {/* ══ 통장 관리 탭 ═════════════════════════════════════ */}
      {tab === 'ACCOUNTS' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* 결제수단 관리 패널 (통장/카드 CRUD) */}
          <PaymentMethodPanel userId={userId} paymentMethods={paymentMethods} onChanged={setPaymentMethods} />
          <AccountManagementView />
        </div>
      )}

      {/* ══ 자산 탭 ══════════════════════════════════════════ */}
      {tab === 'ASSETS' && (
        <AssetView />
      )}

      {/* ── 입력 폼 모달 ─────────────────────────────────────── */}
      {/* ══ 통합 보기 탭 ═════════════════════════════════════ */}
      {tab === 'OVERVIEW' && (
        <OverviewView yearMonth={yearMonth} />
      )}

      {/* ── 사용자 선택 모달 ─────────────────────────────────── */}
      {showUserSelect && (
        <UserSelectModal onSelect={handleUserSelect} />
      )}

      {formOpen && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-end',
        }} onClick={e => { if (e.target === e.currentTarget) closeForm(); }}>
          <div style={{
            width: '100%', background: '#fff', borderRadius: '16px 16px 0 0',
            padding: '24px 24px 32px', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c', flex: 1 }}>
                {editingId !== null ? '항목 수정' : '새 항목 추가'}
              </span>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6' }}>×</button>
            </div>

            {/* 수입 / 지출 토글 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {(['EXPENSE', 'INCOME'] as const).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, entryType: t, category: '', subcategory: '', isFixed: false }))}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 700, fontSize: '14px',
                    border: `2px solid ${form.entryType === t ? (t === 'INCOME' ? '#4CAF50' : '#E06060') : '#dadce0'}`,
                    background: form.entryType === t ? (t === 'INCOME' ? '#e8f5e9' : '#fdecea') : '#fff',
                    color: form.entryType === t ? (t === 'INCOME' ? '#4CAF50' : '#E06060') : '#5f6368',
                    cursor: 'pointer',
                  }}>
                  {t === 'INCOME' ? '수입' : '지출'}
                </button>
              ))}
            </div>

            {/* 지출일 때: 고정비 / 변동비 서브 토글 */}
            {form.entryType === 'EXPENSE' && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                {([true, false] as const).map(fixed => (
                  <button key={String(fixed)} onClick={() => setForm(f => ({ ...f, isFixed: fixed, category: '' }))}
                    style={{
                      flex: 1, padding: '8px', borderRadius: '8px', fontWeight: 600, fontSize: '13px',
                      border: `2px solid ${form.isFixed === fixed ? (fixed ? '#9C27B0' : '#FF9800') : '#dadce0'}`,
                      background: form.isFixed === fixed ? (fixed ? '#F3E5F5' : '#FFF3E0') : '#fff',
                      color: form.isFixed === fixed ? (fixed ? '#9C27B0' : '#FF9800') : '#9aa0a6',
                      cursor: 'pointer',
                    }}>
                    {fixed ? '🔒 고정비' : '🔄 변동비'}
                  </button>
                ))}
              </div>
            )}

            {/* 날짜 */}
            <FieldRow label="날짜">
              <input type="date" value={form.entryDate ?? today()} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} style={inputStyle} />
            </FieldRow>

            {/* 카테고리 */}
            <FieldRow label="카테고리">
              {form.entryType === 'EXPENSE' ? (
                <select value={form.category ?? ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                  <option value="">선택</option>
                  {expenseCats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <select value={form.category ?? ''} onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: '' }))} style={inputStyle}>
                  <option value="">선택</option>
                  {incomeCats.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              )}
            </FieldRow>

            {/* 수입 세부항목 (수입 카테고리에만) */}
            {selectedIncomeCat && selectedIncomeCat.subcategories.length > 0 && (
              <FieldRow label="세부항목">
                <select value={form.subcategory ?? ''} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))} style={inputStyle}>
                  <option value="">선택 안함</option>
                  {selectedIncomeCat.subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FieldRow>
            )}

            {/* 결제수단 — 등록된 통장/카드에서 선택 */}
            <FieldRow label="결제수단">
              <select
                value={form.account ?? ''}
                onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
                style={inputStyle}
              >
                <option value="">선택 안함</option>
                {(['통장', '카드'] as const).map(type => {
                  const group = paymentMethods.filter(p => p.type === type);
                  if (group.length === 0) return null;
                  return (
                    <optgroup key={type} label={type}>
                      {group.map(p => (
                        <option key={p.id} value={p.name}>
                          {p.name}{p.billingDay ? ` (결제일 ${p.billingDay}일)` : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </FieldRow>

            {/* 금액 */}
            <FieldRow label="금액 (원)">
              <input
                type="text" inputMode="numeric"
                value={form.amountStr ?? ''}
                placeholder="0"
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setForm(f => ({ ...f, amountStr: raw }));
                }}
                style={inputStyle}
              />
              {form.amountStr && Number(form.amountStr) > 0 && (
                <span style={{ fontSize: '12px', color: '#4BAAD4', marginTop: '3px', display: 'block', fontWeight: 600 }}>
                  = {formatAmountKorean(Number(form.amountStr))}
                </span>
              )}
            </FieldRow>

            {/* 투자 여부 */}
            <FieldRow label="투자">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isInvestment ?? false}
                  onChange={e => setForm(f => ({ ...f, isInvestment: e.target.checked }))} />
                <span style={{ fontSize: '13px', color: '#344054' }}>투자 관련 항목</span>
              </label>
            </FieldRow>

            {/* 투자 유형 (투자 체크 시) */}
            {form.isInvestment && (
              <FieldRow label="투자 유형">
                <select value={form.investmentType ?? ''} onChange={e => setForm(f => ({ ...f, investmentType: e.target.value }))} style={inputStyle}>
                  <option value="">선택 안함</option>
                  {INVESTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FieldRow>
            )}

            {/* 메모 */}
            <FieldRow label="메모">
              <input type="text" value={form.memo ?? ''} placeholder="메모 (선택)"
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} style={inputStyle} />
            </FieldRow>

            {/* 저장/취소 버튼 */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={closeForm} style={{ ...btnStyle('#f0f4f8', '#5f6368'), flex: 1, padding: '12px' }}>취소</button>
              <button onClick={handleSave} style={{ ...btnStyle('#89CFF0', '#fff'), flex: 2, padding: '12px', fontWeight: 700 }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 고정비 관리 모달 */}
      {fixedExpenseOpen && (
        <FixedExpenseModal
          userId={userId}
          userName={userName}
          yearMonth={yearMonth}
          paymentMethods={paymentMethods}
          onClose={() => setFixedExpenseOpen(false)}
          onPaid={entry => { setEntries(prev => [entry, ...prev]); }}
        />
      )}
    </div>
  );
};

// ─── 하위 컴포넌트 ────────────────────────────────────────────

const SummaryCard: React.FC<{ label: string; amount: number; color: string; sign: string }> = ({ label, amount, color, sign }) => (
  <div style={{
    flex: 1, background: '#fff', borderRadius: '12px',
    padding: '14px 16px', border: `1px solid ${color}30`,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '6px' }}>{label}</div>
    <div style={{ fontSize: '16px', fontWeight: 700, color }}>
      {sign}{formatAmountShort(Math.abs(amount))}
    </div>
  </div>
);

const EntryRow: React.FC<{
  entry: BudgetEntry;
  onEdit: (e: BudgetEntry) => void;
  onDelete: (e: BudgetEntry) => void;
}> = ({ entry, onEdit, onDelete }) => {
  const isIncome = entry.entryType === 'INCOME';
  const dateStr = entry.entryDate.slice(5); // "08-12"

  return (
    <div style={{
      background: '#fff', borderRadius: '10px', marginBottom: '8px',
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px',
      border: '1px solid #f0f0f0', cursor: 'pointer',
    }}
      onClick={() => onEdit(entry)}>
      {/* 날짜 */}
      <span style={{ fontSize: '12px', color: '#9aa0a6', minWidth: '36px', flexShrink: 0 }}>{dateStr}</span>

      {/* 카테고리 + 세부 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#344054' }}>
            {entry.category}{entry.subcategory ? ` › ${entry.subcategory}` : ''}
          </span>
          {entry.isFixed && (
            <span style={{ fontSize: '10px', background: '#9C27B020', color: '#9C27B0', borderRadius: '4px', padding: '1px 5px' }}>고정</span>
          )}
          {entry.isInvestment && (
            <span style={{ fontSize: '10px', background: '#2196F320', color: '#2196F3', borderRadius: '4px', padding: '1px 5px' }}>
              투자{entry.investmentType ? `·${entry.investmentType}` : ''}
            </span>
          )}
        </div>
        {(entry.accountMain || entry.account || entry.memo) && (
          <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '2px' }}>
            {entry.accountMain && <span>{entry.accountMain}</span>}
            {entry.account && <span> › {entry.account}</span>}
            {entry.memo && <span> · {entry.memo}</span>}
          </div>
        )}
      </div>

      {/* 금액 */}
      <span style={{ fontSize: '14px', fontWeight: 700, color: isIncome ? '#4CAF50' : '#E06060', flexShrink: 0 }}>
        {isIncome ? '+' : '-'}{formatAmountShort(entry.amount)}
      </span>

      {/* 삭제 버튼 */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(entry); }}
        style={{
          background: 'none', border: 'none', color: '#dadce0', cursor: 'pointer',
          fontSize: '16px', lineHeight: 1, padding: '0 2px', flexShrink: 0,
        }}
      >×</button>
    </div>
  );
};

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: '14px' }}>
    <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: 600, marginBottom: '5px' }}>
      {label}
    </label>
    {children}
  </div>
);

// ─── 공통 스타일 ─────────────────────────────────────────────
const btnStyle = (bg: string, color: string): React.CSSProperties => ({
  padding: '6px 12px', fontSize: '12px', fontWeight: 600,
  borderRadius: '6px', border: 'none', background: bg, color,
  cursor: 'pointer',
});

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: '14px',
  borderRadius: '8px', border: '1px solid #dadce0',
  boxSizing: 'border-box', outline: 'none',
};

// ─── 결제수단 관리 패널 ─────────────────────────────────────────
// 통장 탭 상단에 표시되며, 결제수단(통장/카드) CRUD 기능 제공
type PmForm = {
  name: string;
  type: '통장' | '카드';
  // 통장 전용
  accountMain: string;
  accountNumber: string;
  // 카드 전용
  cardAlias: string;
  billingDayStr: string;
};

const emptyPmForm = (): PmForm => ({
  name: '', type: '통장', accountMain: '', accountNumber: '', cardAlias: '', billingDayStr: '',
});

const PaymentMethodPanel: React.FC<{
  userId: string;
  paymentMethods: PaymentMethod[];
  onChanged: (methods: PaymentMethod[]) => void;
}> = ({ userId, paymentMethods, onChanged }) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PmForm>(emptyPmForm());
  const [saving, setSaving] = useState(false);

  const inputSt: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: '13px',
    border: '1px solid #dadce0', borderRadius: '6px', outline: 'none',
    boxSizing: 'border-box',
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyPmForm());
    setFormOpen(true);
  };

  const openEdit = (pm: PaymentMethod) => {
    setEditingId(pm.id);
    setForm({
      name: pm.name,
      type: pm.type,
      accountMain: pm.accountMain ?? '',
      accountNumber: pm.accountNumber ?? '',
      cardAlias: pm.cardAlias ?? '',
      billingDayStr: pm.billingDay ? String(pm.billingDay) : '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('결제수단 이름을 입력해주세요'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        accountMain: form.type === '통장' ? (form.accountMain || undefined) : undefined,
        accountNumber: form.type === '통장' ? (form.accountNumber.trim() || undefined) : undefined,
        cardAlias: form.type === '카드' ? (form.cardAlias.trim() || undefined) : undefined,
        billingDay: form.type === '카드' && form.billingDayStr ? Number(form.billingDayStr) : undefined,
      };
      if (editingId !== null) {
        const updated = await updatePaymentMethod(editingId, payload);
        onChanged(paymentMethods.map(p => p.id === editingId ? updated : p));
      } else {
        const created = await createPaymentMethod({ userId, ...payload });
        onChanged([...paymentMethods, created]);
      }
      setFormOpen(false);
    } catch { alert('저장에 실패했습니다'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (pm: PaymentMethod) => {
    if (!window.confirm(`"${pm.name}"을(를) 삭제할까요?`)) return;
    try {
      await deletePaymentMethod(pm.id);
      onChanged(paymentMethods.filter(p => p.id !== pm.id));
    } catch { alert('삭제에 실패했습니다'); }
  };

  const banks = paymentMethods.filter(p => p.type === '통장');
  const cards = paymentMethods.filter(p => p.type === '카드');

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto 24px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', flex: 1 }}>💳 결제수단 관리</span>
        <button onClick={openAdd} style={{
          padding: '5px 12px', fontSize: '12px', fontWeight: 700,
          background: '#89CFF0', color: '#fff', border: 'none',
          borderRadius: '6px', cursor: 'pointer',
        }}>+ 추가</button>
      </div>

      {/* 추가/수정 폼 */}
      {formOpen && (
        <div style={{
          border: '1px solid #89CFF0', borderRadius: '10px',
          padding: '12px 14px', marginBottom: '12px', background: '#f0f8fd',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            {/* 공통 */}
            <div>
              <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>이름 *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={form.type === '통장' ? '예: 신한 입출금 통장' : '예: KB국민 체크카드'}
                style={inputSt} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>종류</label>
              <select value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as '통장' | '카드' }))}
                style={inputSt}>
                <option value="통장">통장</option>
                <option value="카드">카드</option>
              </select>
            </div>

            {/* 통장 전용 */}
            {form.type === '통장' && (<>
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>통장 구분</label>
                <select value={form.accountMain} onChange={e => setForm(f => ({ ...f, accountMain: e.target.value }))} style={inputSt}>
                  <option value="">선택 안 함</option>
                  {ACCOUNT_MAINS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>계좌번호</label>
                <input value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
                  placeholder="예: 110-123-456789" style={inputSt} />
              </div>
            </>)}

            {/* 카드 전용 */}
            {form.type === '카드' && (<>
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>카드번호 / 별칭</label>
                <input value={form.cardAlias} onChange={e => setForm(f => ({ ...f, cardAlias: e.target.value }))}
                  placeholder="예: 1234 또는 주해 생활비카드" style={inputSt} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>결제일</label>
                <input type="number" min={1} max={31} value={form.billingDayStr}
                  onChange={e => setForm(f => ({ ...f, billingDayStr: e.target.value }))}
                  placeholder="예: 14" style={inputSt} />
              </div>
            </>)}
          </div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button onClick={() => setFormOpen(false)}
              style={{ padding: '5px 12px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>
              취소
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '5px 12px', fontSize: '12px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* 빈 상태 안내 */}
      {paymentMethods.length === 0 && !formOpen && (
        <div style={{ fontSize: '12px', color: '#9aa0a6', padding: '10px 0' }}>
          등록된 결제수단이 없습니다. + 추가 버튼으로 통장/카드를 등록하세요.
        </div>
      )}

      {/* 통장 / 카드 그룹별 목록 */}
      {[{ label: '통장', items: banks }, { label: '카드', items: cards }].map(({ label, items }) =>
        items.length === 0 ? null : (
          <div key={label} style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', marginBottom: '4px' }}>{label}</div>
            {items.map(pm => (
              <div key={pm.id} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 10px', background: '#fff',
                border: '1px solid #e8ecf0', borderRadius: '8px', marginBottom: '4px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: '#344054', fontWeight: 600 }}>{pm.name}</div>
                  <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '1px' }}>
                    {pm.type === '통장' && pm.accountMain && <span style={{ marginRight: '8px' }}>{pm.accountMain}</span>}
                    {pm.type === '통장' && pm.accountNumber && <span>{pm.accountNumber}</span>}
                    {pm.type === '카드' && pm.cardAlias && <span style={{ marginRight: '8px' }}>{pm.cardAlias}</span>}
                    {pm.type === '카드' && pm.billingDay && <span>결제일 {pm.billingDay}일</span>}
                  </div>
                </div>
                {pm.type === '카드' && pm.billingDay && (
                  <span style={{ fontSize: '11px', color: '#7B1FA2', background: '#f3e5f5', padding: '1px 7px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                    {pm.billingDay}일
                  </span>
                )}
                {pm.type === '통장' && pm.accountMain && (
                  <span style={{ fontSize: '11px', color: '#1565c0', background: '#e3f2fd', padding: '1px 7px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                    {pm.accountMain}
                  </span>
                )}
                <button onClick={() => openEdit(pm)}
                  style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #dadce0', borderRadius: '5px', background: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                  ✏
                </button>
                <button onClick={() => handleDelete(pm)}
                  style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #dadce0', borderRadius: '5px', background: '#fff', color: '#E06060', cursor: 'pointer', flexShrink: 0 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

// ─── 통장 관리 뷰 ─────────────────────────────────────────────
const GROUP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  '고정비 통장':  { bg: '#FFF3E0', border: '#FF9800', text: '#E65100' },
  '변동비 통장':  { bg: '#E8F5E9', border: '#4CAF50', text: '#1B5E20' },
  '이벤트 통장':  { bg: '#E3F2FD', border: '#2196F3', text: '#0D47A1' },
};

const AccountManagementView: React.FC = () => {
  const totalBudget = ACCOUNT_GROUPS.flatMap(g => g.accounts).reduce((s, a) => s + a.budget, 0);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* 전체 월 예산 합계 */}
      <div style={{
        background: '#fff', borderRadius: '12px', padding: '16px 20px',
        marginBottom: '20px', border: '1px solid #dadce0',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#344054' }}>전체 월 예산 합계</span>
        <span style={{ fontSize: '20px', fontWeight: 800, color: '#E06060' }}>
          {formatAmount(totalBudget)}
        </span>
      </div>

      {ACCOUNT_GROUPS.map(group => {
        const groupTotal = group.accounts.reduce((s, a) => s + a.budget, 0);
        const colors = GROUP_COLORS[group.main] ?? { bg: '#f5f5f5', border: '#9aa0a6', text: '#344054' };

        return (
          <div key={group.main} style={{ marginBottom: '28px' }}>
            {/* 대분류 헤더 */}
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: '12px',
              marginBottom: '8px',
            }}>
              <span style={{
                fontSize: '16px', fontWeight: 800, color: colors.text,
                borderBottom: `3px solid ${colors.border}`, paddingBottom: '2px',
              }}>
                {group.main}
              </span>
              <span style={{ fontSize: '12px', color: '#5f6368', fontStyle: 'italic' }}>
                {group.description}
              </span>
            </div>

            {/* 통장 테이블 */}
            <div style={{ overflowX: 'auto' }}>
            <div style={{
              background: '#fff', border: `1px solid ${colors.border}40`,
              borderRadius: '10px', overflow: 'hidden', minWidth: '480px',
            }}>
              {/* 테이블 헤더 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.2fr 3fr 1.5fr',
                background: colors.bg,
                padding: '10px 16px',
                fontSize: '12px', fontWeight: 700, color: colors.text,
                borderBottom: `1px solid ${colors.border}40`,
              }}>
                <span>통장</span>
                <span style={{ textAlign: 'right' }}>예산 금액</span>
                <span style={{ paddingLeft: '16px' }}>통장 항목</span>
                <span style={{ paddingLeft: '16px' }}>은행 / 카드</span>
              </div>

              {/* 통장 행 */}
              {group.accounts.map((acc, i) => (
                <div key={acc.name} style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.2fr 3fr 1.5fr',
                  padding: '12px 16px', fontSize: '13px',
                  borderBottom: i < group.accounts.length - 1 ? '1px solid #f0f0f0' : 'none',
                  alignItems: 'start',
                }}>
                  <span style={{ fontWeight: 600, color: '#344054' }}>{acc.name}</span>
                  <span style={{ textAlign: 'right', fontWeight: 700, color: '#E06060' }}>
                    {formatAmount(acc.budget)}
                  </span>
                  <span style={{ paddingLeft: '16px', color: '#5f6368', lineHeight: 1.6 }}>
                    {acc.items.join(', ')}
                  </span>
                  <span style={{ paddingLeft: '16px', color: '#9aa0a6' }}>
                    {acc.bankName || '-'}
                  </span>
                </div>
              ))}

              {/* 합계 행 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.2fr 3fr 1.5fr',
                padding: '10px 16px',
                background: colors.bg,
                borderTop: `2px solid ${colors.border}60`,
                fontSize: '13px', fontWeight: 700,
              }}>
                <span style={{ color: colors.text }}>합계</span>
                <span style={{ textAlign: 'right', color: '#E06060' }}>{formatAmount(groupTotal)}</span>
                <span style={{ paddingLeft: '16px', color: '#9aa0a6' }}>-</span>
                <span style={{ paddingLeft: '16px', color: '#9aa0a6' }}>-</span>
              </div>
            </div>
            </div> {/* overflowX wrapper */}
          </div>
        );
      })}
    </div>
  );
};

// ─── 통합 보기 뷰 ─────────────────────────────────────────────

const OverviewView: React.FC<{ yearMonth: string }> = ({ yearMonth }) => {
  const [allSnapshots, setAllSnapshots] = useState<AssetSnapshotCell[]>([]);
  const [entries, setEntries] = useState<{ ldy: BudgetEntry[]; juhae: BudgetEntry[] }>({ ldy: [], juhae: [] });
  const [loading, setLoading] = useState(false);

  // 통합 보기에서도 최신 스냅샷 사용 (localStorage의 환율 참조)
  const exchangeRate = Number(localStorage.getItem(EXCHANGE_RATE_KEY)) || 1450;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getAllAssetSnapshots(),
      getBudgetEntries(BUDGET_USERS[0].id, yearMonth),
      getBudgetEntries(BUDGET_USERS[1].id, yearMonth),
    ]).then(([snapshots, le, je]) => {
      setAllSnapshots(snapshots);
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

  // 달러 현금은 USD → KRW 환산
  const toKrw = (key: string, amount: number) =>
    key === '달러 현금' ? Math.round(amount * exchangeRate) : amount;

  const assetGroupSubtotal = (group: string, userId: string) =>
    ASSET_COLUMNS.filter(c => c.group === group).reduce(
      (s, c) => s + toKrw(c.key, getAssetAmt(userId, c.key)), 0
    );

  const assetGrandTotal = (userId: string) =>
    ASSET_COLUMNS.reduce((s, c) => s + toKrw(c.key, getAssetAmt(userId, c.key)), 0);

  // 가계부 요약
  const entrySummary = useMemo(() => {
    const calc = (list: BudgetEntry[]) => ({
      income:   list.filter(e => e.entryType === 'INCOME').reduce((s, e) => s + e.amount, 0),
      expense:  list.filter(e => e.entryType === 'EXPENSE').reduce((s, e) => s + e.amount, 0),
      fixed:    list.filter(e => e.entryType === 'EXPENSE' && e.isFixed).reduce((s, e) => s + e.amount, 0),
      variable: list.filter(e => e.entryType === 'EXPENSE' && !e.isFixed).reduce((s, e) => s + e.amount, 0),
      invest:   list.filter(e => e.isInvestment).reduce((s, e) => s + e.amount, 0),
    });
    return { ldy: calc(entries.ldy), juhae: calc(entries.juhae) };
  }, [entries]);

  const LIQUIDITY_GROUPS = ['즉시 사용 가능', '즉시 사용 불가'] as const;

  // 3열 행 렌더 헬퍼
  const Row3 = ({
    label, v0, v1, bold = false, colored = false, isBalance = false,
  }: { label: string; v0: number; v1: number; bold?: boolean; colored?: boolean; isBalance?: boolean }) => {
    const sum = v0 + v1;
    const fmt = (v: number) => v === 0 ? '—' : formatAmountShort(v);
    const color = (v: number) => isBalance
      ? (v >= 0 ? '#1565c0' : '#E06060')
      : colored ? '#E06060' : '#344054';
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
        padding: '10px 16px', fontSize: '13px',
        borderBottom: '1px solid #f0f0f0',
        fontWeight: bold ? 700 : 400,
        background: bold ? '#fafbfc' : '#fff',
      }}>
        <span style={{ color: '#5f6368' }}>{label}</span>
        <span style={{ textAlign: 'right', color: color(v0) }}>{fmt(v0)}</span>
        <span style={{ textAlign: 'right', color: color(v1) }}>{fmt(v1)}</span>
        <span style={{ textAlign: 'right', color: color(sum), fontWeight: 700 }}>{fmt(sum)}</span>
      </div>
    );
  };

  // 테이블 헤더
  const TableHeader = ({ title }: { title: string }) => (
    <>
      <div style={{ fontSize: '14px', fontWeight: 800, color: '#1a3a5c', marginBottom: '8px', marginTop: '24px' }}>{title}</div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
        padding: '8px 16px', fontSize: '12px', fontWeight: 700, color: '#fff',
        background: '#89CFF0', borderRadius: '8px 8px 0 0',
      }}>
        <span>항목</span>
        <span style={{ textAlign: 'right' }}>{u0.name}</span>
        <span style={{ textAlign: 'right' }}>{u1.name}</span>
        <span style={{ textAlign: 'right' }}>합산</span>
      </div>
    </>
  );

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6' }}>불러오는 중…</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 40px' }}>

      {/* ── 자산 현황 테이블 (유동성 그룹별 소계) */}
      <TableHeader title={`💰 자산 현황${latestDate ? ` (${latestDate})` : ''}`} />
      <div style={{ border: '1px solid #f0f0f0', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
        {LIQUIDITY_GROUPS.map(g => {
          const v0 = assetGroupSubtotal(g, u0.id);
          const v1 = assetGroupSubtotal(g, u1.id);
          const lc = ASSET_LIQUIDITY_COLORS[g];
          return (
            <div key={g} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
              padding: '10px 16px', fontSize: '13px',
              borderBottom: '1px solid #f0f0f0', background: '#fff',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: lc.bg, color: lc.text, alignSelf: 'center', width: 'fit-content' }}>{g}</span>
              <span style={{ textAlign: 'right', color: '#344054' }}>{v0 ? formatAmountShort(v0) : '—'}</span>
              <span style={{ textAlign: 'right', color: '#344054' }}>{v1 ? formatAmountShort(v1) : '—'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: '#1a3a5c' }}>{(v0 + v1) ? formatAmountShort(v0 + v1) : '—'}</span>
            </div>
          );
        })}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
          padding: '12px 16px', fontSize: '13px', fontWeight: 800,
          background: '#f0f8fd', borderTop: '2px solid #89CFF040',
        }}>
          <span style={{ color: '#1a3a5c' }}>총 자산</span>
          <span style={{ textAlign: 'right', color: '#1565c0' }}>{assetGrandTotal(u0.id) ? formatAmountShort(assetGrandTotal(u0.id)) : '—'}</span>
          <span style={{ textAlign: 'right', color: '#1565c0' }}>{assetGrandTotal(u1.id) ? formatAmountShort(assetGrandTotal(u1.id)) : '—'}</span>
          <span style={{ textAlign: 'right', color: '#1a3a5c', fontSize: '15px' }}>
            {formatAmountShort(assetGrandTotal(u0.id) + assetGrandTotal(u1.id))}
          </span>
        </div>
      </div>

      {/* ── 월별 가계부 테이블 */}
      <TableHeader title={`📒 가계부 — ${displayYearMonth(yearMonth)}`} />
      <div style={{ border: '1px solid #f0f0f0', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
        <Row3 label="총 수입" v0={entrySummary.ldy.income} v1={entrySummary.juhae.income} bold />
        <Row3 label="총 지출" v0={entrySummary.ldy.expense} v1={entrySummary.juhae.expense} colored />
        <Row3
          label="잔액"
          v0={entrySummary.ldy.income - entrySummary.ldy.expense}
          v1={entrySummary.juhae.income - entrySummary.juhae.expense}
          bold isBalance
        />
        <Row3 label="고정비" v0={entrySummary.ldy.fixed} v1={entrySummary.juhae.fixed} />
        <Row3 label="변동비" v0={entrySummary.ldy.variable} v1={entrySummary.juhae.variable} />
        <Row3 label="투자" v0={entrySummary.ldy.invest} v1={entrySummary.juhae.invest} />
      </div>

    </div>
  );
};

// ─── 자산 관리 뷰 (스냅샷 기반) ──────────────────────────────────

type AssetSubTab = 'CURRENT' | 'HISTORY' | 'CHART';

const AssetView: React.FC = () => {
  const [allSnapshots, setAllSnapshots] = useState<AssetSnapshotCell[]>([]);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState<AssetSubTab>('CURRENT');
  const [selectedDate, setSelectedDate] = useState<string>(today());
  // 환율 (달러 현금 USD → KRW 환산, localStorage 저장)
  const [exchangeRate, setExchangeRate] = useState<number>(
    () => Number(localStorage.getItem(EXCHANGE_RATE_KEY) || '0') || 1450
  );
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [editingCell, setEditingCell] = useState<{ userId: string; assetKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  // 셀별 세부 내역 모달 대상 (null=닫힘)
  const [detailTarget, setDetailTarget] = useState<{ userId: string; assetType: string; userName: string; assetLabel: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllAssetSnapshots();
      setAllSnapshots(data);
      // 최신 날짜를 기본 선택 (오늘 날짜에 데이터 없으면 최신 날짜로)
      const existingDates = Array.from(new Set(data.map(s => s.snapshotDate))).sort().reverse();
      if (existingDates.length > 0 && !data.some(s => s.snapshotDate === today())) {
        setSelectedDate(existingDates[0]);
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // 날짜 목록 (최신순)
  const dates = useMemo(() =>
    Array.from(new Set(allSnapshots.map(s => s.snapshotDate))).sort().reverse(),
    [allSnapshots]
  );

  // cellMap[date][userId][assetType] = amount
  const cellMap = useMemo(() => {
    const m: Record<string, Record<string, Record<string, number>>> = {};
    allSnapshots.forEach(s => {
      if (!m[s.snapshotDate]) m[s.snapshotDate] = {};
      if (!m[s.snapshotDate][s.userId]) m[s.snapshotDate][s.userId] = {};
      m[s.snapshotDate][s.userId][s.assetType] = s.amount;
    });
    return m;
  }, [allSnapshots]);

  const getAmt = (date: string, userId: string, key: string) =>
    cellMap[date]?.[userId]?.[key] ?? 0;

  // 달러 현금은 USD → KRW 환산, 그 외 원화 그대로
  const toKrw = (assetType: string, amount: number) =>
    assetType === '달러 현금' ? Math.round(amount * exchangeRate) : amount;

  const getKrw = (date: string, userId: string, key: string) =>
    toKrw(key, getAmt(date, userId, key));

  const [u0, u1] = BUDGET_USERS;
  const GROUPS = ['즉시 사용 가능', '즉시 사용 불가'] as const;

  const groupKrw = (date: string, group: string, userId: string) =>
    ASSET_COLUMNS.filter(c => c.group === group).reduce((s, c) => s + getKrw(date, userId, c.key), 0);

  const grandKrw = (date: string, userId: string) =>
    ASSET_COLUMNS.reduce((s, c) => s + getKrw(date, userId, c.key), 0);

  // 셀 편집 시작
  const startEdit = (userId: string, key: string) => {
    const amt = getAmt(selectedDate, userId, key);
    setEditingCell({ userId, assetKey: key });
    setEditValue(amt === 0 ? '' : String(amt));
  };

  // 셀 저장 (upsert to snapshot)
  const saveEdit = async () => {
    if (!editingCell || saving) return;
    const { userId, assetKey } = editingCell;
    const amount = editValue
      .split(',')
      .map(s => Number(s.trim().replace(/[^0-9]/g, '')) || 0)
      .reduce((a, b) => a + b, 0);
    setSaving(true);
    try {
      const cell = await upsertAssetSnapshotCell({
        userId, snapshotDate: selectedDate, assetType: assetKey, amount,
      });
      setAllSnapshots(prev => {
        const idx = prev.findIndex(
          s => s.userId === userId && s.snapshotDate === selectedDate && s.assetType === assetKey
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = cell;
          return next;
        }
        return [...prev, cell];
      });
    } catch { alert('저장에 실패했습니다'); }
    finally { setSaving(false); setEditingCell(null); }
  };

  // 이전 최신 날짜에서 복사
  const handleCopyFromLatest = async () => {
    if (!dates.length) return;
    const fromDate = dates[0];
    try {
      const copied = (await Promise.all(
        BUDGET_USERS.map(u => copyAssetSnapshot(u.id, fromDate, selectedDate))
      )).flat();
      setAllSnapshots(prev => [
        ...prev.filter(s => s.snapshotDate !== selectedDate),
        ...copied,
      ]);
    } catch { alert('복사에 실패했습니다'); }
  };

  // 선택 날짜 스냅샷 삭제
  const handleDeleteDate = async () => {
    if (!window.confirm(`${selectedDate} 스냅샷을 삭제할까요?`)) return;
    try {
      await Promise.all(BUDGET_USERS.map(u => deleteAssetSnapshotDate(u.id, selectedDate)));
      setAllSnapshots(prev => prev.filter(s => s.snapshotDate !== selectedDate));
      const next = dates.filter(d => d !== selectedDate);
      if (next.length > 0) setSelectedDate(next[0]);
    } catch { alert('삭제에 실패했습니다'); }
  };

  // 환율 저장
  const saveRate = () => {
    const r = Number(rateInput.replace(/[^0-9]/g, ''));
    if (r > 0) {
      setExchangeRate(r);
      localStorage.setItem(EXCHANGE_RATE_KEY, String(r));
    }
    setEditingRate(false);
  };

  const COLS: React.CSSProperties = { gridTemplateColumns: '1.6fr 1fr 1fr 1fr' };
  const hasData = dates.includes(selectedDate);
  const gt0 = grandKrw(selectedDate, u0.id);
  const gt1 = grandKrw(selectedDate, u1.id);
  const gtSum = gt0 + gt1;

  // ── 차트 데이터 계산 ──────────────────────────────────────────
  const chartDataByUser = useMemo(() => {
    return [...dates].reverse().map(date => {
      const v0 = grandKrw(date, u0.id);
      const v1 = grandKrw(date, u1.id);
      const toUk = (v: number) => Math.round(v / 1e6) / 100;
      return {
        label: date.slice(5),
        fullDate: date,
        [u0.name]: toUk(v0),
        [u1.name]: toUk(v1),
        '합산': toUk(v0 + v1),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSnapshots, exchangeRate]);

  const chartDataByLiquidity = useMemo(() => {
    return [...dates].reverse().map(date => {
      const toUk = (v: number) => Math.round(v / 1e6) / 100;
      const liquid = ASSET_COLUMNS
        .filter(c => c.group === '즉시 사용 가능')
        .reduce((s, c) => s + BUDGET_USERS.reduce((us, u) => us + getKrw(date, u.id, c.key), 0), 0);
      const illiquid = ASSET_COLUMNS
        .filter(c => c.group === '즉시 사용 불가')
        .reduce((s, c) => s + BUDGET_USERS.reduce((us, u) => us + getKrw(date, u.id, c.key), 0), 0);
      return {
        label: date.slice(5),
        fullDate: date,
        '즉시 사용 가능': toUk(liquid),
        '즉시 사용 불가': toUk(illiquid),
        '합산': toUk(liquid + illiquid),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSnapshots, exchangeRate]);

  const [chartMode, setChartMode] = useState<'USER' | 'LIQUIDITY'>('USER');

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6' }}>불러오는 중…</div>;

  return (
    <>
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 40px' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>

        {/* ── 환율 + 서브탭 영역 ───────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {/* 서브탭 */}
          <div style={{ display: 'flex', gap: '4px', background: '#f0f4f8', borderRadius: '8px', padding: '3px' }}>
            {([['CURRENT', '현황'], ['HISTORY', '이력'], ['CHART', '그래프']] as [AssetSubTab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setSubTab(t)} style={{
                padding: '4px 12px', fontSize: '12px', fontWeight: subTab === t ? 700 : 400,
                borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: subTab === t ? '#fff' : 'transparent',
                color: subTab === t ? '#1a3a5c' : '#5f6368',
                boxShadow: subTab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{label}</button>
            ))}
          </div>

          {/* 환율 입력 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', fontSize: '12px' }}>
            <span style={{ color: '#5f6368', fontWeight: 600 }}>달러 환율</span>
            {editingRate ? (
              <>
                <input
                  type="text" value={rateInput} autoFocus
                  onChange={e => setRateInput(e.target.value.replace(/[^0-9]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') saveRate(); if (e.key === 'Escape') setEditingRate(false); }}
                  onBlur={saveRate}
                  style={{ width: '80px', padding: '3px 6px', fontSize: '12px', border: '1px solid #89CFF0', borderRadius: '6px', textAlign: 'right' }}
                />
                <span style={{ color: '#5f6368' }}>원/$</span>
              </>
            ) : (
              <button
                onClick={() => { setRateInput(String(exchangeRate)); setEditingRate(true); }}
                style={{ background: '#f0f8fd', border: '1px solid #dadce0', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer', color: '#1a3a5c', fontWeight: 700 }}
              >
                {exchangeRate.toLocaleString('ko-KR')}원/$
              </button>
            )}
          </div>
        </div>

        {/* ══ 현황 탭 ═══════════════════════════════════════════ */}
        {subTab === 'CURRENT' && (<>

          {/* 날짜 선택 */}
          <div style={{
            background: '#fff', border: '1px solid #e8ecf0', borderRadius: '10px',
            padding: '12px 16px', marginBottom: '14px',
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '12px', color: '#5f6368', fontWeight: 600 }}>날짜</span>
            <input
              type="date" value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '6px' }}
            />
            {/* 기존 날짜 빠른 선택 */}
            {dates.length > 0 && (
              <select
                value={dates.includes(selectedDate) ? selectedDate : ''}
                onChange={e => e.target.value && setSelectedDate(e.target.value)}
                style={{ padding: '5px 8px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', color: '#5f6368' }}
              >
                <option value="">기록된 날짜 선택</option>
                {dates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            {/* 복사 버튼: 데이터 없는 날짜에서만 */}
            {!hasData && dates.length > 0 && (
              <button onClick={handleCopyFromLatest} style={btnStyle('#E8F5E9', '#1B5E20')}>
                ← {dates[0]}에서 복사
              </button>
            )}
            {/* 삭제 버튼: 데이터 있을 때만 */}
            {hasData && (
              <button onClick={handleDeleteDate} style={{ ...btnStyle('#fdecea', '#E06060'), marginLeft: 'auto' }}>
                삭제
              </button>
            )}
          </div>

          {!hasData && (
            <div style={{ fontSize: '12px', color: '#9aa0a6', marginBottom: '10px', textAlign: 'center' }}>
              이 날짜에 데이터가 없습니다. 셀을 클릭하여 입력하거나 이전 날짜에서 복사하세요.
            </div>
          )}

          {/* 총 자산 요약 카드 */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {[
              { label: `총 자산 합산 (${selectedDate})`, amount: gtSum, large: true, color: '#1a3a5c' },
              { label: u0.name, amount: gt0, large: false, color: '#1565c0' },
              { label: u1.name, amount: gt1, large: false, color: '#1565c0' },
            ].map(({ label, amount, large, color }) => (
              <div key={label} style={{
                flex: large ? 2 : 1,
                background: '#fff', borderRadius: '12px', padding: '12px 16px',
                border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '5px' }}>{label}</div>
                <div style={{ fontSize: large ? '18px' : '14px', fontWeight: 800, color }}>
                  {amount === 0 ? '—' : (large ? formatAmount(amount) : formatAmountShort(amount))}
                </div>
              </div>
            ))}
          </div>

          {/* 유동성 비율 바 */}
          {gtSum > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {GROUPS.map(g => {
                const v = groupKrw(selectedDate, g, u0.id) + groupKrw(selectedDate, g, u1.id);
                if (v === 0) return null;
                const lc = ASSET_LIQUIDITY_COLORS[g];
                const pct = (v / gtSum * 100).toFixed(0);
                return (
                  <div key={g} style={{
                    flex: v, background: lc.bg, border: `1px solid ${lc.border}60`,
                    borderRadius: '8px', padding: '6px 12px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: lc.text }}>{g}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: lc.text }}>{formatAmountShort(v)}</span>
                    <span style={{ fontSize: '11px', color: lc.border, marginLeft: 'auto' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 안내 */}
          <div style={{ fontSize: '11px', color: '#b0b8c4', textAlign: 'right', marginBottom: '6px' }}>
            ✏️ 금액 셀 클릭하여 수정 · 달러 현금은 USD 금액 입력
          </div>

          {/* 메인 테이블 */}
          <div style={{ overflowX: 'auto' }}>
          <div style={{ border: '1px solid #e8ecf0', borderRadius: '12px', overflow: 'hidden', minWidth: '360px' }}>
            <div style={{
              display: 'grid', ...COLS,
              padding: '10px 16px', fontSize: '12px', fontWeight: 700,
              background: '#1a3a5c', color: '#fff',
            }}>
              <span>자산 항목</span>
              <span style={{ textAlign: 'right' }}>{u0.name}</span>
              <span style={{ textAlign: 'right' }}>{u1.name}</span>
              <span style={{ textAlign: 'right' }}>합산 (KRW)</span>
            </div>

            {GROUPS.map((group, gi) => {
              const cols = ASSET_COLUMNS.filter(c => c.group === group);
              const lc = ASSET_LIQUIDITY_COLORS[group];
              const sub0 = groupKrw(selectedDate, group, u0.id);
              const sub1 = groupKrw(selectedDate, group, u1.id);
              return (
                <React.Fragment key={group}>
                  <div style={{
                    display: 'grid', ...COLS,
                    padding: '7px 16px', fontSize: '11px', fontWeight: 800,
                    background: lc.bg, color: lc.text,
                    borderTop: gi > 0 ? '2px solid #e8ecf0' : 'none',
                  }}>
                    <span>{group}</span>
                    <span style={{ textAlign: 'right', fontWeight: 400, opacity: 0.7 }}>클릭 수정</span>
                    <span style={{ textAlign: 'right', fontWeight: 400, opacity: 0.7 }}>클릭 수정</span>
                    <span />
                  </div>

                  {cols.map(col => {
                    const isDollar = col.key === '달러 현금';
                    const raw0 = getAmt(selectedDate, u0.id, col.key);
                    const raw1 = getAmt(selectedDate, u1.id, col.key);
                    const krw0 = toKrw(col.key, raw0);
                    const krw1 = toKrw(col.key, raw1);
                    const isEdit0 = editingCell?.userId === u0.id && editingCell?.assetKey === col.key;
                    const isEdit1 = editingCell?.userId === u1.id && editingCell?.assetKey === col.key;
                    return (
                      <div key={col.key} style={{
                        display: 'grid', ...COLS,
                        background: '#fff', alignItems: 'center',
                        borderBottom: '1px solid #f5f5f5',
                      }}>
                        <span style={{ padding: '0 16px', fontSize: '13px', color: '#344054', lineHeight: isDollar ? '1.3' : '42px', paddingTop: isDollar ? '8px' : '0', paddingBottom: isDollar ? '8px' : '0' }}>
                          {col.label}
                          {isDollar && <div style={{ fontSize: '10px', color: '#9aa0a6' }}>USD 입력 · 환율 {exchangeRate.toLocaleString()}원/$</div>}
                        </span>
                        <AssetCell
                          value={raw0} isEditing={isEdit0} editValue={editValue}
                          onStartEdit={() => startEdit(u0.id, col.key)}
                          onEditChange={setEditValue} onSave={saveEdit}
                          onCancel={() => setEditingCell(null)}
                          saving={saving} accentColor={lc.border}
                          isDollar={isDollar} exchangeRate={exchangeRate}
                          onDetailClick={() => setDetailTarget({ userId: u0.id, assetType: col.key, userName: u0.name, assetLabel: col.label })} />
                        <AssetCell
                          value={raw1} isEditing={isEdit1} editValue={editValue}
                          onStartEdit={() => startEdit(u1.id, col.key)}
                          onEditChange={setEditValue} onSave={saveEdit}
                          onCancel={() => setEditingCell(null)}
                          saving={saving} accentColor={lc.border}
                          isDollar={isDollar} exchangeRate={exchangeRate}
                          onDetailClick={() => setDetailTarget({ userId: u1.id, assetType: col.key, userName: u1.name, assetLabel: col.label })} />
                        <span style={{
                          padding: '0 16px', textAlign: 'right', fontSize: '13px', lineHeight: '42px',
                          fontWeight: 600, color: (krw0 + krw1) === 0 ? '#dadce0' : '#1a3a5c',
                        }}>
                          {(krw0 + krw1) === 0 ? '—' : formatAmountShort(krw0 + krw1)}
                        </span>
                      </div>
                    );
                  })}

                  <div style={{
                    display: 'grid', ...COLS,
                    padding: '9px 16px', fontSize: '13px', fontWeight: 700,
                    background: lc.bg, color: lc.text,
                  }}>
                    <span>소계</span>
                    <span style={{ textAlign: 'right' }}>{sub0 ? formatAmountShort(sub0) : '—'}</span>
                    <span style={{ textAlign: 'right' }}>{sub1 ? formatAmountShort(sub1) : '—'}</span>
                    <span style={{ textAlign: 'right', fontSize: '14px' }}>
                      {(sub0 + sub1) ? formatAmountShort(sub0 + sub1) : '—'}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}

            <div style={{
              display: 'grid', ...COLS,
              padding: '14px 16px', fontSize: '14px', fontWeight: 800,
              background: '#f0f8fd', color: '#1a3a5c',
              borderTop: '2px solid #89CFF060',
            }}>
              <span>총 자산</span>
              <span style={{ textAlign: 'right' }}>{gt0 ? formatAmountShort(gt0) : '—'}</span>
              <span style={{ textAlign: 'right' }}>{gt1 ? formatAmountShort(gt1) : '—'}</span>
              <span style={{ textAlign: 'right', fontSize: '16px' }}>
                {gtSum ? formatAmount(gtSum) : '—'}
              </span>
            </div>
          </div>
          </div> {/* overflowX wrapper */}
        </>)}

        {/* ══ 이력 탭 ═══════════════════════════════════════════ */}
        {subTab === 'HISTORY' && (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: '420px' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '130px 1fr 1fr 1fr 100px',
              padding: '10px 16px', fontSize: '12px', fontWeight: 700, color: '#fff',
              background: '#1a3a5c', borderRadius: '8px 8px 0 0',
            }}>
              <span>날짜</span>
              <span style={{ textAlign: 'right' }}>{u0.name}</span>
              <span style={{ textAlign: 'right' }}>{u1.name}</span>
              <span style={{ textAlign: 'right' }}>합산</span>
              <span style={{ textAlign: 'right' }}>변동</span>
            </div>
            <div style={{ border: '1px solid #e8ecf0', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              {dates.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6', fontSize: '13px' }}>
                  스냅샷 이력이 없습니다.
                </div>
              )}
              {dates.map((date, i) => {
                const v0 = grandKrw(date, u0.id);
                const v1 = grandKrw(date, u1.id);
                const total = v0 + v1;
                const prevDate = dates[i + 1];
                const prevTotal = prevDate
                  ? grandKrw(prevDate, u0.id) + grandKrw(prevDate, u1.id)
                  : null;
                const diff = prevTotal !== null ? total - prevTotal : null;
                return (
                  <div key={date}
                    onClick={() => { setSelectedDate(date); setSubTab('CURRENT'); }}
                    style={{
                      display: 'grid', gridTemplateColumns: '130px 1fr 1fr 1fr 100px',
                      padding: '11px 16px', fontSize: '13px',
                      borderBottom: i < dates.length - 1 ? '1px solid #f0f0f0' : 'none',
                      background: '#fff', cursor: 'pointer', alignItems: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f8fd')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                  >
                    <span style={{ fontWeight: 700, color: '#1565c0' }}>{date}</span>
                    <span style={{ textAlign: 'right', color: '#344054' }}>{v0 ? formatAmountShort(v0) : '—'}</span>
                    <span style={{ textAlign: 'right', color: '#344054' }}>{v1 ? formatAmountShort(v1) : '—'}</span>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: '#1a3a5c' }}>{total ? formatAmountShort(total) : '—'}</span>
                    <span style={{
                      textAlign: 'right', fontWeight: 600,
                      color: diff === null ? '#9aa0a6' : diff >= 0 ? '#4CAF50' : '#E06060',
                    }}>
                      {diff === null ? '—' : `${diff >= 0 ? '+' : ''}${(diff / 1e8).toFixed(2)}억`}
                    </span>
                  </div>
                );
              })}
            </div>
            </div> {/* minWidth wrapper */}
          </div>
        )}

        {/* ══ 그래프 탭 ═════════════════════════════════════════ */}
        {subTab === 'CHART' && (
          <div>
            {/* 모드 토글 */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
              {([['USER', '유저별'], ['LIQUIDITY', '유동성별']] as ['USER' | 'LIQUIDITY', string][]).map(([m, label]) => (
                <button key={m} onClick={() => setChartMode(m)} style={{
                  padding: '6px 16px', fontSize: '12px', fontWeight: chartMode === m ? 700 : 400,
                  borderRadius: '20px', border: `1px solid ${chartMode === m ? '#89CFF0' : '#dadce0'}`,
                  background: chartMode === m ? '#89CFF0' : '#fff',
                  color: chartMode === m ? '#fff' : '#5f6368',
                  cursor: 'pointer',
                }}>{label}</button>
              ))}
            </div>

            {dates.length < 2 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6', fontSize: '13px' }}>
                그래프를 보려면 스냅샷이 2개 이상 필요합니다.
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: '12px', padding: '20px' }}>
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart
                    data={chartMode === 'USER' ? chartDataByUser : chartDataByLiquidity}
                    margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9aa0a6' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9aa0a6' }}
                      tickFormatter={v => `${v}억`}
                      width={50}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value}억`, name]}
                      labelFormatter={label => `날짜: ${label}`}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {chartMode === 'USER' ? (<>
                      <Line type="monotone" dataKey={u0.name} stroke="#1565c0" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey={u1.name} stroke="#E06060" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="합산" stroke="#4CAF50" strokeWidth={2.5} dot={{ r: 5 }} />
                    </>) : (<>
                      <Line type="monotone" dataKey="즉시 사용 가능" stroke="#4CAF50" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="즉시 사용 불가" stroke="#FF9800" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="합산" stroke="#1565c0" strokeWidth={2.5} dot={{ r: 5 }} />
                    </>)}
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ fontSize: '11px', color: '#9aa0a6', textAlign: 'right', marginTop: '8px' }}>
                  Y축: 억 단위 · 달러 현금은 {exchangeRate.toLocaleString()}원/$ 환율 적용
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* 셀별 세부 내역 모달 — 스크롤 div 밖에서 렌더 (clipping 방지) */}
    {detailTarget && (
      <AssetDetailModal
        snapshotDate={selectedDate}
        userId={detailTarget.userId}
        assetType={detailTarget.assetType}
        userName={detailTarget.userName}
        assetLabel={detailTarget.assetLabel}
        onClose={() => setDetailTarget(null)}
        onSaved={() => { load(); }}
      />
    )}
    </>
  );
};

// ─── 자산 세부 내역 모달 (셀 단위) ──────────────────────────────────

type LocalDetail = {
  key: string;
  userId: string;
  assetType: string;
  accountName: string;
  amountStr: string; // 원 단위 입력값
};

const AssetDetailModal: React.FC<{
  snapshotDate: string;
  userId: string;
  assetType: string;
  userName: string;
  assetLabel: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ snapshotDate, userId, assetType, userName, assetLabel, onClose, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 다른 셀의 기존 데이터 (저장 시 그대로 포함, 원 단위)
  const [otherItems, setOtherItems] = useState<Array<{ userId: string; assetType: string; accountName: string; amountWon: number }>>([]);
  // 이 셀의 편집 가능 항목 (원 단위 입력)
  const [cellItems, setCellItems] = useState<LocalDetail[]>([]);

  useEffect(() => {
    getAssetSnapshotDetails(snapshotDate).then(data => {
      setOtherItems(
        data
          .filter(d => !(d.userId === userId && d.assetType === assetType))
          .map(d => ({ userId: d.userId, assetType: d.assetType, accountName: d.accountName, amountWon: d.amount }))
      );
      setCellItems(
        data
          .filter(d => d.userId === userId && d.assetType === assetType)
          .map(d => ({
            key: String(d.id),
            userId: d.userId,
            assetType: d.assetType,
            accountName: d.accountName,
            amountStr: d.amount > 0 ? String(d.amount) : '',
          }))
      );
      setLoading(false);
    });
  }, [snapshotDate, userId, assetType]);

  const addItem = () => setCellItems(prev => [...prev, {
    key: `new-${Date.now()}-${Math.random()}`,
    userId, assetType, accountName: '', amountStr: '',
  }]);

  const removeItem = (key: string) => setCellItems(prev => prev.filter(i => i.key !== key));

  const updateItem = (key: string, field: 'accountName' | 'amountStr', value: string) =>
    setCellItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i));

  // 현재 셀 합산 (원 단위) — 실시간 미리보기
  const total = useMemo(
    () => cellItems.reduce((s, i) => s + (Number(i.amountStr.replace(/,/g, '')) || 0), 0),
    [cellItems]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      // 다른 셀 그대로 + 이 셀 새 항목 병합 후 일괄 저장
      const othersPayload = otherItems.map(i => ({
        userId: i.userId, assetType: i.assetType,
        accountName: i.accountName, amount: i.amountWon,
      }));
      const thisPayload = cellItems
        .filter(i => Number(i.amountStr.replace(/,/g, '')) > 0)
        .map(i => ({
          userId: i.userId, assetType: i.assetType,
          accountName: i.accountName.trim(),
          amount: Number(i.amountStr.replace(/,/g, '')) || 0,
        }));
      await bulkSaveAssetSnapshotDetails(snapshotDate, [...othersPayload, ...thisPayload]);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: '16px',
        width: '440px', maxWidth: '96vw',
        maxHeight: '72vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #e8ecf0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c' }}>📋 {assetLabel}</span>
            <span style={{ fontSize: '12px', color: '#4BAAD4', marginLeft: '8px', fontWeight: 600 }}>{userName}</span>
            <span style={{ fontSize: '11px', color: '#9aa0a6', marginLeft: '6px' }}>{snapshotDate}</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6', lineHeight: 1 }}>×</button>
        </div>

        {/* 안내 */}
        <div style={{ padding: '7px 20px', background: '#f0f8fd', borderBottom: '1px solid #e8ecf0', flexShrink: 0, fontSize: '11px', color: '#4BAAD4' }}>
          금액 단위: <strong>원</strong> · 저장 시 합산이 자산 현황에 자동 반영됩니다
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 10px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6' }}>불러오는 중…</div>
          ) : (
            <>
              {/* 세부 항목 목록 */}
              {cellItems.map(item => (
                <div key={item.key} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="계좌명"
                    value={item.accountName}
                    onChange={e => updateItem(item.key, 'accountName', e.target.value)}
                    style={{ flex: 2, padding: '6px 10px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '6px', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    <input
                      type="text"
                      placeholder="금액"
                      value={item.amountStr}
                      onChange={e => updateItem(item.key, 'amountStr', e.target.value.replace(/[^0-9]/g, ''))}
                      style={{ width: '110px', padding: '6px 10px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '6px', outline: 'none', textAlign: 'right' }}
                    />
                    {Number(item.amountStr) > 0 && (
                      <span style={{ fontSize: '10px', color: '#4BAAD4', fontWeight: 600 }}>{formatAmountKorean(Number(item.amountStr))}</span>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: '#9aa0a6', whiteSpace: 'nowrap' }}>원</span>
                  <button
                    onClick={() => removeItem(item.key)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#bdbdbd', fontSize: '18px', padding: '0 2px', lineHeight: 1 }}
                  >×</button>
                </div>
              ))}

              {/* + 항목 추가 */}
              <button
                onClick={addItem}
                style={{ width: '100%', padding: '8px', fontSize: '12px', border: '1px dashed #89CFF0', borderRadius: '6px', background: 'transparent', color: '#4BAAD4', cursor: 'pointer', marginTop: '4px' }}
              >
                + 항목 추가
              </button>

              {/* 합산 미리보기 */}
              {total > 0 && (
                <div style={{ marginTop: '12px', padding: '8px 12px', background: '#f0f8fd', borderRadius: '8px', fontSize: '13px', textAlign: 'right', color: '#1a3a5c', fontWeight: 700 }}>
                  합계: {total.toLocaleString('ko-KR')} 원
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #e8ecf0',
          display: 'flex', gap: '8px', justifyContent: 'flex-end', flexShrink: 0,
          background: '#fafbfc',
        }}>
          <button onClick={onClose} style={{ ...btnStyle('#f0f4f8', '#5f6368'), padding: '8px 20px' }}>취소</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...btnStyle('#1a3a5c', '#fff'), padding: '8px 20px', fontWeight: 700 }}
          >
            {saving ? '저장 중…' : '저장 · 합산 반영'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── 셀 단위 편집 컴포넌트
const AssetCell: React.FC<{
  value: number;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  accentColor: string;
  isDollar?: boolean;
  exchangeRate?: number;
  onDetailClick?: () => void;
}> = ({ value, isEditing, editValue, onStartEdit, onEditChange, onSave, onCancel, saving, accentColor, isDollar, exchangeRate, onDetailClick }) => {
  if (isEditing) {
    const parts = editValue.split(',').map(s => Number(s.trim().replace(/[^0-9]/g, '')) || 0);
    const previewSum = parts.reduce((a, b) => a + b, 0);
    const showPreview = editValue.includes(',') && previewSum > 0;
    const krwPreview = isDollar && exchangeRate ? Math.round(previewSum * exchangeRate) : null;

    return (
      <div style={{ padding: '4px 8px' }}>
        <input
          type="text"
          value={editValue} autoFocus placeholder={isDollar ? '$금액' : '숫자, 숫자, ...'}
          onChange={e => onEditChange(e.target.value.replace(/[^0-9,\s]/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          onBlur={onSave}
          style={{
            width: '100%', padding: '4px 8px', fontSize: '12px',
            border: `2px solid ${accentColor}`, borderRadius: '6px',
            textAlign: 'right', outline: 'none', boxSizing: 'border-box',
          }}
          disabled={saving}
        />
        {showPreview && (
          <div style={{ fontSize: '11px', color: accentColor, textAlign: 'right', marginTop: '2px', fontWeight: 700 }}>
            = {isDollar ? `$${previewSum.toLocaleString('ko-KR')}` : previewSum.toLocaleString('ko-KR')}
            {krwPreview ? ` (≈${krwPreview.toLocaleString('ko-KR')}원)` : ''}
          </div>
        )}
      </div>
    );
  }

  // 세부 내역 버튼 (항상 우측 하단에 작게 표시)
  const detailBtn = onDetailClick ? (
    <button
      onClick={e => { e.stopPropagation(); onDetailClick(); }}
      title="세부 내역"
      style={{
        border: 'none', background: 'none', cursor: 'pointer',
        fontSize: '11px', color: '#c0cfe0', padding: '0 2px', lineHeight: 1,
        flexShrink: 0, userSelect: 'none',
      }}
    >≡</button>
  ) : null;

  // 달러 현금: USD 금액 표시 + KRW 환산 부기
  if (isDollar && value > 0 && exchangeRate) {
    const krw = Math.round(value * exchangeRate);
    return (
      <div
        title="클릭하여 수정 (USD 입력)"
        style={{
          padding: '6px 16px 6px 8px', display: 'flex', alignItems: 'center', gap: '4px',
          userSelect: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f0f8fd')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div onClick={onStartEdit} style={{ flex: 1, textAlign: 'right', cursor: 'pointer' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#344054' }}>
            ${value.toLocaleString('ko-KR')}
          </div>
          <div style={{ fontSize: '10px', color: '#9aa0a6' }}>
            ≈ {krw.toLocaleString('ko-KR')}원
          </div>
        </div>
        {detailBtn}
      </div>
    );
  }

  return (
    <div
      title="클릭하여 수정"
      style={{
        padding: '0 8px 0 16px', display: 'flex', alignItems: 'center', gap: '4px',
        userSelect: 'none', minHeight: '42px',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f0f8fd')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        onClick={onStartEdit}
        style={{ flex: 1, textAlign: 'right', cursor: 'pointer', fontSize: '13px', color: value === 0 ? '#d0d5dd' : '#344054' }}
      >
        {value === 0 ? '—' : formatAmountShort(value)}
      </span>
      {detailBtn}
    </div>
  );
};

// ─── 고정비 관리 모달 ────────────────────────────────────────────

type FeForm = {
  name: string;
  amountStr: string;   // 원 단위 입력
  account: string;     // 결제수단 이름 (PaymentMethod.name)
  paymentDay: string;
  category: string;
};

const emptyFeForm = (): FeForm => ({
  name: '', amountStr: '', account: '', paymentDay: '', category: '',
});

const FixedExpenseModal: React.FC<{
  userId: string;
  userName: string;
  yearMonth: string;
  paymentMethods: PaymentMethod[];
  onClose: () => void;
  onPaid: (entry: BudgetEntry) => void;
}> = ({ userId, userName, yearMonth, paymentMethods, onClose, onPaid }) => {
  const [items, setItems] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FeForm>(emptyFeForm());
  const [saving, setSaving] = useState(false);
  // 공과금 항목 금액 인라인 편집
  const [editingAmountId, setEditingAmountId] = useState<number | null>(null);
  const [editingAmountStr, setEditingAmountStr] = useState('');

  // 납부일 오름차순 정렬 (미설정은 뒤로)
  const sortByPaymentDay = (arr: FixedExpense[]) =>
    [...arr].sort((a, b) => {
      if (a.paymentDay == null && b.paymentDay == null) return 0;
      if (a.paymentDay == null) return 1;
      if (b.paymentDay == null) return -1;
      return a.paymentDay - b.paymentDay;
    });
  // 납부 확인 중인 항목 ID → 납부일 입력값
  const [payingId, setPayingId] = useState<number | null>(null);
  const [payDate, setPayDate] = useState<string>(today());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFixedExpenses(userId);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyFeForm());
    setFormOpen(true);
  };

  const openEdit = (fe: FixedExpense) => {
    setEditingId(fe.id);
    setForm({
      name: fe.name,
      amountStr: fe.amount > 0 ? String(fe.amount) : '',
      account: fe.account ?? '',
      paymentDay: fe.paymentDay ? String(fe.paymentDay) : '',
      category: fe.category ?? '',
    });
    setFormOpen(true);
  };

  const handleSaveForm = async () => {
    if (!form.name.trim()) { alert('고정비 내역을 입력해주세요'); return; }
    const amount = Number(form.amountStr.replace(/,/g, '') || '0');
    const amountOptional = ['공과금', '교통비'].includes(form.category);
    if (!amountOptional && amount <= 0) { alert('금액을 입력해주세요'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        amount,
        account: form.account || undefined,
        paymentDay: form.paymentDay ? Number(form.paymentDay) : undefined,
        category: form.category || '미분류',
      };
      if (editingId !== null) {
        const updated = await updateFixedExpense(editingId, payload);
        setItems(prev => sortByPaymentDay(prev.map(i => i.id === editingId ? updated : i)));
      } else {
        const created = await createFixedExpense({ userId, ...payload });
        setItems(prev => sortByPaymentDay([...prev, created]));
      }
      setFormOpen(false);
    } catch { alert('저장에 실패했습니다'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (fe: FixedExpense) => {
    if (!window.confirm(`"${fe.name}" 고정비를 삭제할까요?`)) return;
    try {
      await deleteFixedExpense(fe.id);
      setItems(prev => prev.filter(i => i.id !== fe.id));
    } catch { alert('삭제에 실패했습니다'); }
  };

  const handleAmountSave = async (fe: FixedExpense) => {
    const amount = Number(editingAmountStr.replace(/,/g, ''));
    if (!amount || amount <= 0) { setEditingAmountId(null); return; }
    try {
      const updated = await updateFixedExpense(fe.id, { amount });
      setItems(prev => sortByPaymentDay(prev.map(i => i.id === fe.id ? updated : i)));
    } catch { alert('금액 저장에 실패했습니다'); }
    setEditingAmountId(null);
  };

  // 납부일(day)과 yearMonth(YYYYMM)로 YYYY-MM-DD 조합
  const buildPayDate = (fe: FixedExpense): string => {
    const year = yearMonth.slice(0, 4);
    const month = yearMonth.slice(4, 6);
    const day = fe.paymentDay
      ? String(fe.paymentDay).padStart(2, '0')
      : new Date().getDate().toString().padStart(2, '0');
    // 해당 월 말일 초과 시 말일로 클램프
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const clampedDay = Math.min(Number(day), lastDay).toString().padStart(2, '0');
    return `${year}-${month}-${clampedDay}`;
  };

  const handlePay = async (fe: FixedExpense) => {
    if (!payDate) { alert('납부일을 입력해주세요'); return; }
    // yearMonth는 payDate의 연월이 아닌 현재 탭의 연월 사용
    const ym = yearMonth;
    try {
      const entry = await payFixedExpense(fe.id, ym, payDate);
      onPaid(entry);
      setPayingId(null);
      alert(`✓ "${fe.name}" 납부 처리 완료 (${formatAmountShort(fe.amount)}원)`);
    } catch { alert('납부 처리에 실패했습니다'); }
  };

  const inputSt: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: '13px',
    border: '1px solid #dadce0', borderRadius: '6px', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9600,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: '16px',
        width: '480px', maxWidth: '96vw',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
      }} onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #e8ecf0', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c', flex: 1 }}>
            📌 고정비 관리
          </span>
          <span style={{ fontSize: '12px', color: '#7B1FA2', fontWeight: 600, background: '#f3e5f5', padding: '2px 10px', borderRadius: '12px' }}>
            {userName}
          </span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6', lineHeight: 1 }}>×</button>
        </div>

        {/* 안내 */}
        <div style={{ padding: '6px 20px', background: '#f3e5f5', borderBottom: '1px solid #e8ecf0', flexShrink: 0, fontSize: '11px', color: '#7B1FA2' }}>
          납부 버튼을 누르면 지출 내역에 자동 등록됩니다
        </div>

        {/* 결제수단별 합계 */}
        {items.length > 0 && (() => {
          // account 필드 기준으로 합산
          const byMethod: Record<string, number> = {};
          for (const fe of items) {
            const key = fe.account || '미지정';
            byMethod[key] = (byMethod[key] ?? 0) + fe.amount;
          }
          const entries = Object.entries(byMethod).sort((a, b) => b[1] - a[1]);
          const grandTotal = items.reduce((s, fe) => s + fe.amount, 0);
          return (
            <div style={{ borderBottom: '1px solid #e8ecf0', flexShrink: 0 }}>
              {/* 결제수단별 합계 */}
              <div style={{ padding: '6px 20px', display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                {entries.map(([method, total]) => (
                  <span key={method} style={{ fontSize: '11px', color: '#344054' }}>
                    <span style={{ color: '#7B1FA2', fontWeight: 600 }}>{method}</span>
                    {' '}
                    <span style={{ fontWeight: 700 }}>{formatAmountKorean(total)}</span>
                  </span>
                ))}
              </div>
              {/* 총 합산 */}
              <div style={{ padding: '4px 20px 6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#5f6368' }}>총 고정비</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c' }}>{formatAmountKorean(grandTotal)}</span>
              </div>
            </div>
          );
        })()}

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6' }}>불러오는 중…</div>
          ) : (
            <>
              {/* 항목 추가 버튼 */}
              {!formOpen && (
                <button
                  onClick={openAdd}
                  style={{
                    width: '100%', padding: '9px', marginBottom: '12px',
                    fontSize: '13px', fontWeight: 600, border: '1px dashed #9C27B0',
                    borderRadius: '8px', background: 'transparent', color: '#7B1FA2', cursor: 'pointer',
                  }}
                >+ 고정비 항목 추가</button>
              )}

              {/* 추가/수정 폼 */}
              {formOpen && (
                <div style={{
                  border: '1px solid #CE93D8', borderRadius: '10px',
                  padding: '14px 14px 10px', marginBottom: '14px', background: '#fdf6ff',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#7B1FA2', marginBottom: '10px' }}>
                    {editingId !== null ? '✏ 항목 수정' : '+ 새 항목 추가'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>고정비 내역 *</label>
                      <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="예: 월세, 통신비" style={inputSt} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>
                        금액 (원){['공과금', '교통비'].includes(form.category) ? '' : ' *'}
                      </label>
                      <input value={form.amountStr} onChange={e => setForm(f => ({ ...f, amountStr: e.target.value.replace(/[^0-9]/g, '') }))}
                        placeholder={['공과금', '교통비'].includes(form.category) ? '매달 변동 (선택)' : '예: 800000'} style={inputSt} />
                      {Number(form.amountStr) > 0 && (
                        <span style={{ fontSize: '11px', color: '#4BAAD4', fontWeight: 600, marginTop: '2px', display: 'block' }}>
                          = {formatAmountKorean(Number(form.amountStr))}
                        </span>
                      )}
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>납부 결제수단</label>
                      <select value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} style={inputSt}>
                        <option value="">선택 안 함</option>
                        {(['통장', '카드'] as const).map(type => {
                          const group = paymentMethods.filter(p => p.type === type);
                          if (group.length === 0) return null;
                          return (
                            <optgroup key={type} label={type}>
                              {group.map(p => (
                                <option key={p.id} value={p.name}>
                                  {p.name}{p.billingDay ? ` (결제일 ${p.billingDay}일)` : ''}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>납부일</label>
                      <input type="number" min={1} max={31} value={form.paymentDay}
                        onChange={e => setForm(f => ({ ...f, paymentDay: e.target.value }))}
                        placeholder="예: 25" style={inputSt} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>카테고리</label>
                      <select
                        value={FIXED_EXPENSE_ITEM_CATEGORIES.includes(form.category) ? form.category : (form.category ? '__custom__' : '')}
                        onChange={e => {
                          if (e.target.value === '__custom__') return;
                          setForm(f => ({ ...f, category: e.target.value }));
                        }}
                        style={inputSt}
                      >
                        <option value="">선택 안 함</option>
                        {FIXED_EXPENSE_ITEM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        {form.category && !FIXED_EXPENSE_ITEM_CATEGORIES.includes(form.category) && (
                          <option value="__custom__">{form.category} (직접입력)</option>
                        )}
                      </select>
                      {/* 직접 입력 필드 */}
                      <input
                        value={form.category}
                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                        placeholder="직접 입력 가능"
                        style={{ ...inputSt, marginTop: '4px', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button onClick={() => setFormOpen(false)} style={{ ...btnStyle('#f0f4f8', '#5f6368'), padding: '6px 16px' }}>취소</button>
                    <button onClick={handleSaveForm} disabled={saving}
                      style={{ ...btnStyle('#7B1FA2', '#fff'), padding: '6px 16px', fontWeight: 700 }}>
                      {saving ? '저장 중…' : '저장'}
                    </button>
                  </div>
                </div>
              )}

              {/* 고정비 목록 */}
              {items.length === 0 && !formOpen && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6', fontSize: '13px' }}>
                  등록된 고정비가 없습니다.
                </div>
              )}
              {items.map(fe => (
                <div key={fe.id} style={{
                  border: '1px solid #e8ecf0', borderRadius: '10px',
                  marginBottom: '8px', overflow: 'hidden',
                }}>
                  {/* 항목 행 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', background: '#fff',
                  }}>
                    {/* 납부일 배지 */}
                    <span style={{
                      fontSize: '11px', fontWeight: 700, color: '#7B1FA2',
                      background: '#f3e5f5', padding: '2px 8px', borderRadius: '10px',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {fe.paymentDay ? `${fe.paymentDay}일` : '—'}
                    </span>
                    {/* 내역 + 금액 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fe.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#5f6368', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        {/* 공과금·교통비는 금액 클릭 시 인라인 편집 */}
                        {['공과금', '교통비'].includes(fe.category) && editingAmountId === fe.id ? (
                          <input
                            autoFocus
                            type="text" inputMode="numeric"
                            value={editingAmountStr}
                            onChange={e => setEditingAmountStr(e.target.value.replace(/[^0-9]/g, ''))}
                            onBlur={() => handleAmountSave(fe)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAmountSave(fe);
                              if (e.key === 'Escape') setEditingAmountId(null);
                            }}
                            style={{
                              width: '100px', padding: '1px 5px', fontSize: '11px',
                              border: '1px solid #89CFF0', borderRadius: '4px', outline: 'none',
                            }}
                          />
                        ) : (
                          <span
                            onClick={['공과금', '교통비'].includes(fe.category) ? () => { setEditingAmountId(fe.id); setEditingAmountStr(String(fe.amount)); } : undefined}
                            style={{
                              cursor: ['공과금', '교통비'].includes(fe.category) ? 'text' : 'default',
                              borderBottom: ['공과금', '교통비'].includes(fe.category) ? '1px dashed #89CFF0' : 'none',
                            }}
                            title={['공과금', '교통비'].includes(fe.category) ? '클릭하여 금액 수정' : undefined}
                          >
                            {formatAmountShort(fe.amount)}원
                          </span>
                        )}
                        {fe.account && <span style={{ color: '#9aa0a6' }}>· {fe.account}</span>}
                        {fe.category && fe.category !== '미분류' && <span style={{ color: '#CE93D8' }}>#{fe.category}</span>}
                      </div>
                    </div>
                    {/* 버튼들 */}
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => { setPayingId(payingId === fe.id ? null : fe.id); setPayDate(buildPayDate(fe)); }}
                        style={{
                          padding: '4px 10px', fontSize: '12px', fontWeight: 700,
                          border: '1px solid #4CAF50', borderRadius: '6px',
                          background: payingId === fe.id ? '#4CAF50' : '#fff',
                          color: payingId === fe.id ? '#fff' : '#2e7d32',
                          cursor: 'pointer',
                        }}
                      >납부</button>
                      <button
                        onClick={() => { openEdit(fe); setPayingId(null); }}
                        style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', color: '#5f6368', cursor: 'pointer' }}
                      >✏</button>
                      <button
                        onClick={() => handleDelete(fe)}
                        style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', color: '#E06060', cursor: 'pointer' }}
                      >×</button>
                    </div>
                  </div>

                  {/* 납부 확인 행 (납부 버튼 클릭 시 펼침) */}
                  {payingId === fe.id && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 14px', background: '#f1fdf3', borderTop: '1px solid #C8E6C9',
                    }}>
                      <span style={{ fontSize: '12px', color: '#2e7d32', fontWeight: 600, whiteSpace: 'nowrap' }}>📅 납부일</span>
                      <input
                        type="date" value={payDate}
                        onChange={e => setPayDate(e.target.value)}
                        style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #A5D6A7', borderRadius: '6px', outline: 'none' }}
                      />
                      <button
                        onClick={() => handlePay(fe)}
                        style={{ ...btnStyle('#2e7d32', '#fff'), padding: '5px 14px', fontWeight: 700, fontSize: '12px' }}
                      >✓ 납부 처리</button>
                      <button
                        onClick={() => setPayingId(null)}
                        style={{ ...btnStyle('#f0f4f8', '#5f6368'), padding: '5px 10px', fontSize: '12px' }}
                      >취소</button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BudgetPage;
