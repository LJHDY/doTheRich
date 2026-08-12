import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACCOUNT_GROUPS,
  ASSET_COLUMNS,
  ASSET_LIQUIDITY_COLORS,
  BUDGET_USER_STORAGE_KEY,
  BUDGET_USERS,
  FIXED_EXPENSE_CATEGORIES,
  VARIABLE_EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  INVESTMENT_TYPES,
} from '../../constants/budgetConstants';
import {
  getBudgetEntries,
  createBudgetEntry,
  updateBudgetEntry,
  deleteBudgetEntry,
  getAssets,
  createAsset,
  updateAsset,
  deleteAsset,
} from '../../services/api';
import { Asset, BudgetEntry, formatAmount, formatAmountShort } from '../../types';
import UserSelectModal from './UserSelectModal';

interface Props {
  onClose: () => void;
}

// ─── 유틸 ────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
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
  const [tab, setTab] = useState<Tab>('ENTRIES');
  const [showUserSelect, setShowUserSelect] = useState(false);

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
      <div style={{
        background: '#fff', borderBottom: '3px solid #89CFF0',
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px',
        flexShrink: 0,
      }}>
        <button onClick={onClose} style={btnStyle('#e0f0ff', '#1a3a5c')}>← 닫기</button>
        <span style={{ fontSize: '18px', fontWeight: 700, color: '#1a3a5c', flexGrow: 1 }}>
          💰 가계부
        </span>
        {/* 탭 전환 */}
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
        {/* 사용자 전환 — 클릭 시 선택 모달 */}
        <button onClick={() => setShowUserSelect(true)} style={btnStyle('#f0f8fd', '#1a3a5c')}>
          👤 {userName}
        </button>
        {/* 월 네비게이션 (내역·통합 탭에서 표시) */}
        {(tab === 'ENTRIES' || tab === 'OVERVIEW') && <>
          <button onClick={() => moveMonth(-1)} style={btnStyle('#f0f8fd', '#1a3a5c')}>◀</button>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#344054', minWidth: '100px', textAlign: 'center' }}>
            {displayYearMonth(yearMonth)}
          </span>
          <button onClick={() => moveMonth(1)} style={btnStyle('#f0f8fd', '#1a3a5c')}>▶</button>
          {tab === 'ENTRIES' && <button onClick={openAdd} style={btnStyle('#89CFF0', '#fff')}>+ 추가</button>}
        </>}
      </div>

      {/* ══ 내역 탭 ══════════════════════════════════════════ */}
      {tab === 'ENTRIES' && <>
        {/* ── 요약 카드 */}
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: '12px', flexShrink: 0 }}>
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

        {/* ── 필터 탭 */}
        <div style={{ padding: '10px 20px 0', display: 'flex', gap: '6px', flexShrink: 0 }}>
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

            {/* 통장 대분류 */}
            <FieldRow label="통장 (대분류)">
              <select
                value={form.accountMain ?? ''}
                onChange={e => setForm(f => ({ ...f, accountMain: e.target.value, account: '' }))}
                style={inputStyle}
              >
                <option value="">선택 안함</option>
                {ACCOUNT_GROUPS.map(g => <option key={g.main} value={g.main}>{g.main}</option>)}
              </select>
            </FieldRow>

            {/* 통장 중분류 — 대분류 선택 시만 표시 */}
            {form.accountMain && (() => {
              const group = ACCOUNT_GROUPS.find(g => g.main === form.accountMain);
              const accs = group?.accounts ?? [];
              return accs.length > 0 ? (
                <FieldRow label="통장 (중분류)">
                  <select
                    value={form.account ?? ''}
                    onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">선택 안함</option>
                    {accs.map(a => (
                      <option key={a.name} value={a.name}>
                        {a.name}{a.bankName ? ` (${a.bankName})` : ''}
                      </option>
                    ))}
                  </select>
                </FieldRow>
              ) : null;
            })()}

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
                <span style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '2px', display: 'block' }}>
                  = {formatAmount(Number(form.amountStr))}
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
            <div style={{
              background: '#fff', border: `1px solid ${colors.border}40`,
              borderRadius: '10px', overflow: 'hidden',
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
          </div>
        );
      })}
    </div>
  );
};

// ─── 통합 보기 뷰 ─────────────────────────────────────────────

const OverviewView: React.FC<{ yearMonth: string }> = ({ yearMonth }) => {
  const [assets, setAssets] = useState<{ ldy: Asset[]; juhae: Asset[] }>({ ldy: [], juhae: [] });
  const [entries, setEntries] = useState<{ ldy: BudgetEntry[]; juhae: BudgetEntry[] }>({ ldy: [], juhae: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getAssets(BUDGET_USERS[0].id),
      getAssets(BUDGET_USERS[1].id),
      getBudgetEntries(BUDGET_USERS[0].id, yearMonth),
      getBudgetEntries(BUDGET_USERS[1].id, yearMonth),
    ]).then(([la, ja, le, je]) => {
      setAssets({ ldy: la, juhae: ja });
      setEntries({ ldy: le, juhae: je });
    }).finally(() => setLoading(false));
  }, [yearMonth]);

  const [u0, u1] = BUDGET_USERS; // 동영, 주해

  // assetMap: userId → (assetType → amount)
  const assetMapByUser = useMemo(() => {
    const build = (list: Asset[]) => {
      const m: Record<string, number> = {};
      list.forEach(a => { m[a.assetType] = a.amount; });
      return m;
    };
    return { [u0.id]: build(assets.ldy), [u1.id]: build(assets.juhae) } as Record<string, Record<string, number>>;
  }, [assets, u0.id, u1.id]);

  const getAssetAmt = (userId: string, key: string) => assetMapByUser[userId]?.[key] ?? 0;

  const assetGroupSubtotal = (group: string, userId: string) =>
    ASSET_COLUMNS.filter(c => c.group === group).reduce((s, c) => s + getAssetAmt(userId, c.key), 0);

  const assetGrandTotal = (userId: string) =>
    ASSET_COLUMNS.reduce((s, c) => s + getAssetAmt(userId, c.key), 0);

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
      <TableHeader title="💰 자산 현황" />
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

// ─── 자산 관리 뷰 (스프레드시트 스타일) ──────────────────────

const AssetView: React.FC = () => {
  // assetMap[userId][assetKey] = Asset 레코드
  const [assetMap, setAssetMap] = useState<Record<string, Record<string, Asset>>>({});
  const [loading, setLoading] = useState(false);
  const [editingCell, setEditingCell] = useState<{ userId: string; assetKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a0, a1] = await Promise.all([
        getAssets(BUDGET_USERS[0].id),
        getAssets(BUDGET_USERS[1].id),
      ]);
      const buildMap = (list: Asset[]) => {
        const m: Record<string, Asset> = {};
        list.forEach(a => { m[a.assetType] = a; });
        return m;
      };
      setAssetMap({
        [BUDGET_USERS[0].id]: buildMap(a0),
        [BUDGET_USERS[1].id]: buildMap(a1),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getAmt = (userId: string, key: string) => assetMap[userId]?.[key]?.amount ?? 0;

  const startEdit = (userId: string, key: string) => {
    const amt = getAmt(userId, key);
    setEditingCell({ userId, assetKey: key });
    setEditValue(amt === 0 ? '' : String(amt));
  };

  const saveEdit = async () => {
    if (!editingCell || saving) return;
    const { userId, assetKey } = editingCell;
    const amount = Number(editValue.replace(/[^0-9]/g, '')) || 0;
    setSaving(true);
    try {
      const existing = assetMap[userId]?.[assetKey];
      const updated = existing
        ? await updateAsset(existing.id, { amount })
        : await createAsset({ userId, assetName: assetKey, assetType: assetKey, amount });
      setAssetMap(prev => ({
        ...prev,
        [userId]: { ...prev[userId], [assetKey]: updated },
      }));
    } catch { alert('저장에 실패했습니다'); }
    finally {
      setSaving(false);
      setEditingCell(null);
    }
  };

  const [u0, u1] = BUDGET_USERS;
  const GROUPS = ['즉시 사용 가능', '즉시 사용 불가'] as const;

  const groupSub = (group: string, userId: string) =>
    ASSET_COLUMNS.filter(c => c.group === group).reduce((s, c) => s + getAmt(userId, c.key), 0);
  const grandTotal = (userId: string) =>
    ASSET_COLUMNS.reduce((s, c) => s + getAmt(userId, c.key), 0);

  const COLS: React.CSSProperties = { gridTemplateColumns: '1.6fr 1fr 1fr 1fr' };

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6' }}>불러오는 중…</div>;

  const gt0 = grandTotal(u0.id);
  const gt1 = grandTotal(u1.id);
  const gtSum = gt0 + gt1;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 40px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* ── 총 자산 요약 카드 */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          {[
            { label: '총 자산 합산', amount: gtSum, large: true, color: '#1a3a5c' },
            { label: u0.name, amount: gt0, large: false, color: '#1565c0' },
            { label: u1.name, amount: gt1, large: false, color: '#1565c0' },
          ].map(({ label, amount, large, color }) => (
            <div key={label} style={{
              flex: large ? 2 : 1,
              background: '#fff', borderRadius: '12px', padding: '14px 16px',
              border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '6px' }}>{label}</div>
              <div style={{ fontSize: large ? '20px' : '15px', fontWeight: 800, color }}>
                {amount === 0 ? '—' : (large ? formatAmount(amount) : formatAmountShort(amount))}
              </div>
            </div>
          ))}
        </div>

        {/* ── 유동성 비율 바 */}
        {gtSum > 0 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {GROUPS.map(g => {
              const v = groupSub(g, u0.id) + groupSub(g, u1.id);
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

        {/* ── 안내 */}
        <div style={{ fontSize: '11px', color: '#b0b8c4', textAlign: 'right', marginBottom: '6px' }}>
          ✏️ 금액 셀 클릭하여 수정
        </div>

        {/* ── 메인 테이블 */}
        <div style={{ border: '1px solid #e8ecf0', borderRadius: '12px', overflow: 'hidden' }}>
          {/* 헤더 행 */}
          <div style={{
            display: 'grid', ...COLS,
            padding: '10px 16px', fontSize: '12px', fontWeight: 700,
            background: '#1a3a5c', color: '#fff',
          }}>
            <span>자산 항목</span>
            <span style={{ textAlign: 'right' }}>{u0.name}</span>
            <span style={{ textAlign: 'right' }}>{u1.name}</span>
            <span style={{ textAlign: 'right' }}>합산</span>
          </div>

          {GROUPS.map((group, gi) => {
            const cols = ASSET_COLUMNS.filter(c => c.group === group);
            const lc = ASSET_LIQUIDITY_COLORS[group];
            const sub0 = groupSub(group, u0.id);
            const sub1 = groupSub(group, u1.id);
            return (
              <React.Fragment key={group}>
                {/* 그룹 섹션 헤더 */}
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

                {/* 자산 항목 행 */}
                {cols.map(col => {
                  const a0 = getAmt(u0.id, col.key);
                  const a1 = getAmt(u1.id, col.key);
                  const isEdit0 = editingCell?.userId === u0.id && editingCell?.assetKey === col.key;
                  const isEdit1 = editingCell?.userId === u1.id && editingCell?.assetKey === col.key;
                  return (
                    <div key={col.key} style={{
                      display: 'grid', ...COLS,
                      background: '#fff', alignItems: 'center',
                      borderBottom: '1px solid #f5f5f5',
                    }}>
                      <span style={{ padding: '0 16px', fontSize: '13px', color: '#344054', lineHeight: '42px' }}>
                        {col.label}
                      </span>
                      <AssetCell value={a0} isEditing={isEdit0} editValue={editValue}
                        onStartEdit={() => startEdit(u0.id, col.key)}
                        onEditChange={setEditValue} onSave={saveEdit}
                        onCancel={() => setEditingCell(null)}
                        saving={saving} accentColor={lc.border} />
                      <AssetCell value={a1} isEditing={isEdit1} editValue={editValue}
                        onStartEdit={() => startEdit(u1.id, col.key)}
                        onEditChange={setEditValue} onSave={saveEdit}
                        onCancel={() => setEditingCell(null)}
                        saving={saving} accentColor={lc.border} />
                      <span style={{
                        padding: '0 16px', textAlign: 'right', fontSize: '13px', lineHeight: '42px',
                        fontWeight: 600, color: (a0 + a1) === 0 ? '#dadce0' : '#1a3a5c',
                      }}>
                        {(a0 + a1) === 0 ? '—' : formatAmountShort(a0 + a1)}
                      </span>
                    </div>
                  );
                })}

                {/* 소계 행 */}
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

          {/* 총 자산 행 */}
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
}> = ({ value, isEditing, editValue, onStartEdit, onEditChange, onSave, onCancel, saving, accentColor }) => {
  if (isEditing) {
    return (
      <div style={{ padding: '5px 10px' }}>
        <input
          type="text" inputMode="numeric"
          value={editValue} autoFocus placeholder="0"
          onChange={e => onEditChange(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          onBlur={onSave}
          style={{
            width: '100%', padding: '5px 8px', fontSize: '12px',
            border: `2px solid ${accentColor}`, borderRadius: '6px',
            textAlign: 'right', outline: 'none', boxSizing: 'border-box',
          }}
          disabled={saving}
        />
      </div>
    );
  }
  return (
    <div
      onClick={onStartEdit}
      title="클릭하여 수정"
      style={{
        padding: '0 16px', textAlign: 'right', lineHeight: '42px',
        cursor: 'pointer', fontSize: '13px',
        color: value === 0 ? '#d0d5dd' : '#344054',
        userSelect: 'none',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f0f8fd')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {value === 0 ? '—' : formatAmountShort(value)}
    </div>
  );
};

export default BudgetPage;
