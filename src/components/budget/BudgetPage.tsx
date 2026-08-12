import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACCOUNTS,
  BUDGET_USER_STORAGE_KEY,
  BUDGET_USERS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  INVESTMENT_TYPES,
} from '../../constants/budgetConstants';
import {
  getBudgetEntries,
  createBudgetEntry,
  updateBudgetEntry,
  deleteBudgetEntry,
} from '../../services/api';
import { BudgetEntry, formatAmount, formatAmountShort } from '../../types';

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
  account: ACCOUNTS[0],
  amountStr: '',
  isFixed: false,
  isInvestment: false,
  investmentType: '',
  memo: '',
});

type Filter = 'ALL' | 'INCOME' | 'EXPENSE' | 'FIXED' | 'INVEST';

// ─── 컴포넌트 ─────────────────────────────────────────────────
const BudgetPage: React.FC<Props> = ({ onClose }) => {
  const [userId, setUserId] = useState<string>(
    () => localStorage.getItem(BUDGET_USER_STORAGE_KEY) ?? BUDGET_USERS[0].id
  );
  const [yearMonth, setYearMonth] = useState<string>(toYearMonth(new Date()));
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');

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

    // 통장별 합산
    const accountMap: Record<string, { income: number; expense: number }> = {};
    entries.forEach(e => {
      const key = e.account || '미분류';
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

  const cats = form.entryType === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const selectedCat = cats.find(c => c.name === form.category);

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

  const switchUser = () => {
    const other = BUDGET_USERS.find(u => u.id !== userId);
    if (!other) return;
    localStorage.setItem(BUDGET_USER_STORAGE_KEY, other.id);
    setUserId(other.id);
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
        {/* 사용자 전환 */}
        <button onClick={switchUser} style={btnStyle('#f0f8fd', '#1a3a5c')}>
          👤 {userName}
        </button>
        {/* 월 네비게이션 */}
        <button onClick={() => moveMonth(-1)} style={btnStyle('#f0f8fd', '#1a3a5c')}>◀</button>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#344054', minWidth: '100px', textAlign: 'center' }}>
          {displayYearMonth(yearMonth)}
        </span>
        <button onClick={() => moveMonth(1)} style={btnStyle('#f0f8fd', '#1a3a5c')}>▶</button>
        <button onClick={openAdd} style={btnStyle('#89CFF0', '#fff')}>+ 추가</button>
      </div>

      {/* ── 요약 카드 ─────────────────────────────────────────── */}
      <div style={{ padding: '16px 20px 0', display: 'flex', gap: '12px', flexShrink: 0 }}>
        <SummaryCard label="총 수입" amount={summary.totalIncome} color="#4CAF50" sign="+" />
        <SummaryCard label="총 지출" amount={summary.totalExpense} color="#E06060" sign="-" />
        <SummaryCard label="잔액" amount={summary.totalIncome - summary.totalExpense}
          color={summary.totalIncome >= summary.totalExpense ? '#1565c0' : '#E06060'} sign="" />
      </div>

      {/* ── 고정/변동/투자 소요약 ──────────────────────────────── */}
      <div style={{ padding: '8px 20px 0', display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: '고정비', val: summary.fixedExpense, color: '#9C27B0' },
          { label: '변동비', val: summary.varExpense, color: '#FF9800' },
          { label: '투자',   val: summary.totalInvest, color: '#2196F3' },
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

      {/* ── 통장별 현황 ──────────────────────────────────────── */}
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

      {/* ── 필터 탭 ──────────────────────────────────────────── */}
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

      {/* ── 항목 목록 ─────────────────────────────────────────── */}
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

      {/* ── 입력 폼 모달 ─────────────────────────────────────── */}
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
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {(['EXPENSE', 'INCOME'] as const).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, entryType: t, category: '', subcategory: '' }))}
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

            {/* 날짜 */}
            <FieldRow label="날짜">
              <input type="date" value={form.entryDate ?? today()} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} style={inputStyle} />
            </FieldRow>

            {/* 카테고리 */}
            <FieldRow label="카테고리">
              <select value={form.category ?? ''} onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: '' }))} style={inputStyle}>
                <option value="">선택</option>
                {cats.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </FieldRow>

            {/* 세부항목 */}
            {selectedCat && selectedCat.subcategories.length > 0 && (
              <FieldRow label="세부항목">
                <select value={form.subcategory ?? ''} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))} style={inputStyle}>
                  <option value="">선택 안함</option>
                  {selectedCat.subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FieldRow>
            )}

            {/* 통장 */}
            <FieldRow label="통장">
              <select value={form.account ?? ''} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} style={inputStyle}>
                <option value="">선택 안함</option>
                {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
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
                <span style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '2px', display: 'block' }}>
                  = {formatAmount(Number(form.amountStr))}
                </span>
              )}
            </FieldRow>

            {/* 고정비 (지출일 때만) */}
            {form.entryType === 'EXPENSE' && (
              <FieldRow label="고정비">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.isFixed ?? false}
                    onChange={e => setForm(f => ({ ...f, isFixed: e.target.checked }))} />
                  <span style={{ fontSize: '13px', color: '#344054' }}>매월 반복되는 고정비</span>
                </label>
              </FieldRow>
            )}

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
        {entry.account && (
          <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '2px' }}>
            {entry.account}{entry.memo ? ` · ${entry.memo}` : ''}
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

export default BudgetPage;
