import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ReferenceLine,
  PieChart, Pie, Cell, Tooltip as PieTooltip,
} from 'recharts';
import {
  ACCOUNT_GROUPS,
  ACCOUNT_MAINS,
  ASSET_COLUMNS,
  ASSET_LIQUIDITY_COLORS,
  BUDGET_CAT_CODES,
  BUDGET_USER_STORAGE_KEY,
  BUDGET_USERS,
  FIXED_EXPENSE_CATEGORIES,
  FIXED_EXPENSE_ITEM_CATEGORIES,
  VARIABLE_EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  INVESTMENT_TYPES,
  buildAssetCellCode,
} from './budgetConstants';
import {
  getBudgetEntries,
  createBudgetEntry,
  updateBudgetEntry,
  deleteBudgetEntry,
  deleteBudgetEntriesByGroup,
  bulkCreateBudgetEntries,
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
  getAccountBalances,
  upsertAccountBalance,
  carryOverAccountBalances,
  getCommonCodes,
  createCommonCode,
  updateCommonCode,
  deleteCommonCode,
  invalidateCommonCodeCache,
  getFinancialReports,
  generateFinancialReport,
  FinancialReport as FinancialReportType,
  getMarketReports,
  generateMarketReport,
  generateKrCloseReport,
  deleteMarketReport,
} from '../../services/api';
import { AssetSnapshotCell, BudgetEntry, CommonCode, FixedExpense, KrInvestorDayFlow, KrSectorData, KrTopGainer, MarketReport, PaymentMethod, formatAmount, formatAmountShort } from '../../types';
import UserSelectModal from './UserSelectModal';
import WorkoutTab from './WorkoutTab';

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

/** 카드 결산 기간 계산 — 시작일/종료일 모두 직접 설정
 * 예: startDay=24, endDay=23, yearMonth='202608' → { from:'2026-07-24', to:'2026-08-23', label:'7/24~8/23' }
 * 종료일이 시작일보다 크면 같은 달, 작으면 다음달 기준
 */
const getCardBillingPeriod = (billingStartDay: number, billingEndDay: number, yearMonth: string) => {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(4)); // 1-indexed
  const fromDate = new Date(year, month - 2, billingStartDay); // 전달 시작일
  // 종료일이 시작일 이상이면 전달 기준, 미만이면 이번달 기준
  const toDate = billingEndDay >= billingStartDay
    ? new Date(year, month - 2, billingEndDay)   // 전달 종료 (예: 1일~31일 같은 달)
    : new Date(year, month - 1, billingEndDay);  // 이번달 종료 (예: 24일~23일)
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const label = `${fromDate.getMonth() + 1}/${billingStartDay}~${toDate.getMonth() + 1}/${billingEndDay}`;
  return { from: fmt(fromDate), to: fmt(toDate), label };
};

const initialForm = (): Partial<BudgetEntry> & { amountStr: string } => ({
  entryDate: today(),
  entryType: 'EXPENSE',
  category: '',
  subcategory: '',
  accountMain: '',
  account: '',
  cardName: '',
  amountStr: '',
  isFixed: false,
  isInvestment: false,
  investmentType: '',
  merchant: '',
  memo: '',
});

type Filter = 'ALL' | 'INCOME' | 'EXPENSE' | 'FIXED' | 'INVEST' | 'TRANSFER';
type Tab = 'ENTRIES' | 'ACCOUNTS' | 'ASSETS' | 'OVERVIEW' | 'WORKOUT' | 'AI'; // 가계부 내역 / 통장 관리 / 자산 관리 / 통합 보기 / 운동 / AI 분석

// 파이차트 범례 항목 — 모듈 레벨 정의로 IIFE 내 재마운트 방지
// hover 시 즉시 금액/건수 툴팁 표시 (title 속성의 브라우저 딜레이 없음)
const CategoryTip: React.FC<{
  color: string; name: string; pct: number; tipLabel: string;
  isActive: boolean; onClick: () => void;
}> = ({ color, name, pct, tipLabel, isActive, onClick }) => {
  const [show, setShow] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: '4px',
        cursor: 'pointer', borderRadius: '4px', padding: '2px 4px',
        background: isActive ? `${color}22` : 'transparent',
        border: isActive ? `1px solid ${color}` : '1px solid transparent',
      }}
    >
      <span style={{ width: '8px', height: '8px', borderRadius: '2px', flexShrink: 0, background: color }} />
      <span style={{ fontSize: '11px', color: '#344054', whiteSpace: 'nowrap' }}>{name}</span>
      <span style={{ fontSize: '11px', color: '#9aa0a6', whiteSpace: 'nowrap' }}>{pct}%</span>
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 5px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(40,40,40,0.88)', color: '#fff',
          fontSize: '11px', padding: '3px 8px', borderRadius: '4px',
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9999,
        }}>
          {tipLabel}
        </div>
      )}
    </div>
  );
};

// ─── 컴포넌트 ─────────────────────────────────────────────────
const BudgetPage: React.FC<Props> = ({ onClose }) => {
  const [userId, setUserId] = useState<string>(
    () => localStorage.getItem(BUDGET_USER_STORAGE_KEY) ?? BUDGET_USERS[0].id
  );
  const [yearMonth, setYearMonth] = useState<string>(toYearMonth(new Date()));
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [prevMonthEntries, setPrevMonthEntries] = useState<BudgetEntry[]>([]); // 카드 청구 기간 계산용 전달 항목
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [accountFilter, setAccountFilter] = useState<string | null>(null); // 통장 단위 필터
  const [cardFilter, setCardFilter] = useState<string | null>(null);      // 카드 단위 필터
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('budget_tab') as Tab) || 'ENTRIES');
  useEffect(() => { sessionStorage.setItem('budget_tab', tab); }, [tab]);
  const [showUserSelect, setShowUserSelect] = useState(false);
  const isMobile = useIsMobile();

  // ─── 카테고리 — 공통코드 DB에서 로드, 없으면 상수로 자동 seed ───
  const [varExpCats, setVarExpCats] = useState<string[]>(VARIABLE_EXPENSE_CATEGORIES);
  const [fixExpCats, setFixExpCats] = useState<string[]>(FIXED_EXPENSE_CATEGORIES);
  const [feItemCats, setFeItemCats] = useState<string[]>(FIXED_EXPENSE_ITEM_CATEGORIES);
  const [incomeCatsDB, setIncomeCatsDB] = useState<{ name: string; subcategories: string[] }[]>(INCOME_CATEGORIES);
  const [investTypesDB, setInvestTypesDB] = useState<string[]>([...INVESTMENT_TYPES]);

  useEffect(() => {
    /** 공통코드 그룹이 비어있으면 상수 값으로 자동 seed */
    const seedGroup = async (
      code: string, codeName: string,
      entries: { detailCode: string; detailCodeName: string }[],
    ) => {
      await Promise.all(entries.map((e, i) =>
        createCommonCode({ common_code: code, common_code_name: codeName, detail_code: e.detailCode, detail_code_name: e.detailCodeName, sort_order: i + 1 })
      ));
      invalidateCommonCodeCache(code);
    };

    const load = async () => {
      const [varCodes, fixCodes, feCodes, incomeCodes, investCodes] = await Promise.all([
        getCommonCodes(BUDGET_CAT_CODES.VAR_EXPENSE),
        getCommonCodes(BUDGET_CAT_CODES.FIX_EXPENSE),
        getCommonCodes(BUDGET_CAT_CODES.FE_ITEM),
        getCommonCodes(BUDGET_CAT_CODES.INCOME),
        getCommonCodes(BUDGET_CAT_CODES.INVEST),
      ]);

      if (varCodes.length > 0) {
        setVarExpCats(varCodes.sort((a, b) => a.sortOrder - b.sortOrder).map(c => c.detailCodeName));
      } else {
        await seedGroup(BUDGET_CAT_CODES.VAR_EXPENSE, '변동비 카테고리',
          VARIABLE_EXPENSE_CATEGORIES.map(n => ({ detailCode: n, detailCodeName: n })));
      }

      if (fixCodes.length > 0) {
        setFixExpCats(fixCodes.sort((a, b) => a.sortOrder - b.sortOrder).map(c => c.detailCodeName));
      } else {
        await seedGroup(BUDGET_CAT_CODES.FIX_EXPENSE, '고정비 카테고리',
          FIXED_EXPENSE_CATEGORIES.map(n => ({ detailCode: n, detailCodeName: n })));
      }

      if (feCodes.length > 0) {
        setFeItemCats(feCodes.sort((a, b) => a.sortOrder - b.sortOrder).map(c => c.detailCodeName));
      } else {
        await seedGroup(BUDGET_CAT_CODES.FE_ITEM, '고정비 항목 카테고리',
          FIXED_EXPENSE_ITEM_CATEGORIES.map(n => ({ detailCode: n, detailCodeName: n })));
      }

      if (incomeCodes.length > 0) {
        // detailCodeName 형식: "카테고리명|서브1,서브2" (서브 없으면 파이프 생략)
        setIncomeCatsDB(incomeCodes.sort((a, b) => a.sortOrder - b.sortOrder).map(c => {
          const [name, subs] = c.detailCodeName.split('|');
          return { name: name.trim(), subcategories: subs ? subs.split(',').map(s => s.trim()).filter(Boolean) : [] };
        }));
      } else {
        await seedGroup(BUDGET_CAT_CODES.INCOME, '수입 카테고리',
          INCOME_CATEGORIES.map(c => ({
            detailCode: c.name,
            detailCodeName: c.subcategories.length > 0 ? `${c.name}|${c.subcategories.join(',')}` : c.name,
          })));
      }

      if (investCodes.length > 0) {
        setInvestTypesDB(investCodes.sort((a, b) => a.sortOrder - b.sortOrder).map(c => c.detailCodeName));
      } else {
        await seedGroup(BUDGET_CAT_CODES.INVEST, '투자 유형',
          [...INVESTMENT_TYPES].map(n => ({ detailCode: n, detailCodeName: n })));
      }
    };
    load().catch(() => {});
  // 마운트 시 1회만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 결제수단 목록 (userId 변경 시 재로드)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // 결제수단 로드
  useEffect(() => {
    getPaymentMethods(userId).then(setPaymentMethods).catch(() => {});
  }, [userId]);

  // 고정비 관리 모달
  const [fixedExpenseOpen, setFixedExpenseOpen] = useState(false);

  // 통장 이월 잔액 (account_balance 테이블)
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  const [editingOpeningAccount, setEditingOpeningAccount] = useState<string | null>(null);
  const [editingOpeningStr, setEditingOpeningStr] = useState('');

  useEffect(() => {
    getAccountBalances(userId, yearMonth)
      .then(rows => {
        const map: Record<string, number> = {};
        rows.forEach(r => { map[r.accountName] = r.openingBalance; });
        setOpeningBalances(map);
      })
      .catch(() => {});
  }, [userId, yearMonth]);

  // 이체 폼 상태
  const [isTransfer, setIsTransfer] = useState(false);
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');

  // 입력 폼
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm());
  const [isShared, setIsShared] = useState(false); // 공용 지출 — 두 유저에게 절반씩 저장
  const [isInstallment, setIsInstallment] = useState(false);   // 할부 여부
  const [installmentMonths, setInstallmentMonths] = useState(2); // 할부 개월수
  const [isInterestFree, setIsInterestFree] = useState(false);  // 무이자 여부

  // 달력/목록 뷰 전환 상태
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null); // "YYYY-MM-DD"

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

  // ─── 카드 청구 기간용 전달 항목 로드 — billingDay 있는 카드가 1개라도 있을 때만 실행
  useEffect(() => {
    const hasBillingCards = paymentMethods.some(p => p.type === '카드' && p.billingStartDay && p.billingEndDay);
    if (!hasBillingCards) { setPrevMonthEntries([]); return; }
    const year = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(4));
    const prevYm = toYearMonth(new Date(year, month - 2, 1)); // 전달 yearMonth
    getBudgetEntries(userId, prevYm)
      .then(setPrevMonthEntries)
      .catch(() => setPrevMonthEntries([]));
  }, [userId, yearMonth, paymentMethods]);

  // ─── 월 이동 ─────────────────────────────────────────────────
  const moveMonth = (delta: number) => {
    const y = Number(yearMonth.slice(0, 4));
    const m = Number(yearMonth.slice(4)) + delta;
    const d = new Date(y, m - 1, 1);
    setYearMonth(toYearMonth(d));
  };

  // ─── 요약 계산 ───────────────────────────────────────────────
  const summary = useMemo(() => {
    // isTransfer 플래그 또는 category='이체' 두 조건 모두 이체로 판정
    // (is_transfer DB 컬럼 마이그레이션 이전에 생성된 항목도 대응)
    const isXfer = (e: BudgetEntry) => e.isTransfer || e.category === '이체';

    const totalIncome = entries.filter(e => e.entryType === 'INCOME' && !isXfer(e)).reduce((s, e) => s + e.amount, 0);
    const totalInvest = entries.filter(e => e.isInvestment && !isXfer(e)).reduce((s, e) => s + e.amount, 0);
    const totalExpense = entries.filter(e => e.entryType === 'EXPENSE' && !e.isInvestment && !isXfer(e)).reduce((s, e) => s + e.amount, 0);
    const fixedExpense = entries.filter(e => e.entryType === 'EXPENSE' && e.isFixed && !e.isInvestment && !isXfer(e)).reduce((s, e) => s + e.amount, 0);
    const varExpense = entries.filter(e => e.entryType === 'EXPENSE' && !e.isFixed && !e.isInvestment && !isXfer(e)).reduce((s, e) => s + e.amount, 0);

    // 통장별 잔액 계산용 — 이체 포함, account(중분류) 우선 / 없으면 accountMain(대분류)으로 분류
    const accountMap: Record<string, { income: number; expense: number }> = {};
    entries.forEach(e => {
      const key = e.account || e.accountMain || '미분류';
      if (!accountMap[key]) accountMap[key] = { income: 0, expense: 0 };
      if (e.entryType === 'INCOME') accountMap[key].income += e.amount;
      else accountMap[key].expense += e.amount;
    });

    return { totalIncome, totalExpense, fixedExpense, varExpense, totalInvest, accountMap };
  }, [entries]);

  // ─── 필터링된 항목 ───────────────────────────────────────────
  const filtered = useMemo(() => {
    const isXfer = (e: BudgetEntry) => e.isTransfer || e.category === '이체';
    let base = entries;
    if (filter === 'TRANSFER') {
      base = base.filter(e => isXfer(e));
    } else {
      // 이체는 내 돈 이동이므로 수입/지출 목록에서 제외
      base = base.filter(e => !isXfer(e));
      if (filter === 'INCOME') base = base.filter(e => e.entryType === 'INCOME');
      else if (filter === 'EXPENSE') base = base.filter(e => e.entryType === 'EXPENSE');
      else if (filter === 'FIXED') base = base.filter(e => e.entryType === 'EXPENSE' && e.isFixed);
      else if (filter === 'INVEST') base = base.filter(e => e.isInvestment);
    }
    if (categoryFilters.size > 0) base = base.filter(e => categoryFilters.has(e.category));
    // 통장 필터 — account(중분류) 또는 accountMain(대분류) 일치
    // accountMainFilter: 해당 pm의 accountMain값도 같이 매칭 (accountMain-only 수입 항목 포함)
    if (accountFilter === '__UNASSIGNED__') {
      // 미분류: 내 결제수단(통장·카드) 어느 것도 해당 안 되는 항목
      const myNames = new Set([
        ...paymentMethods.map(p => p.name),
        ...paymentMethods.filter(p => p.accountMain).map(p => p.accountMain!),
      ]);
      base = base.filter(e =>
        !myNames.has(e.account ?? '') &&
        !myNames.has(e.accountMain ?? '') &&
        !myNames.has(e.cardName ?? '')
      );
    } else if (accountFilter) {
      const pm = paymentMethods.find(p => p.name === accountFilter);
      base = base.filter(e =>
        e.account === accountFilter ||
        e.accountMain === accountFilter ||
        (pm?.accountMain && (e.account === pm.accountMain || e.accountMain === pm.accountMain))
      );
    }
    // 카드 필터 — cardName 일치 또는 레거시(이전에 카드를 account 필드에 저장한 항목)도 포함
    if (cardFilter) {
      const cardNames = new Set(paymentMethods.filter(p => p.type === '카드').map(p => p.name));
      base = base.filter(e =>
        e.cardName === cardFilter ||
        (!e.cardName && e.account === cardFilter && cardNames.has(cardFilter))
      );
    }
    return base;
  }, [entries, filter, categoryFilters, accountFilter, cardFilter, paymentMethods]);

  // ─── 폼 핸들러 ───────────────────────────────────────────────
  const resetInstallment = () => { setIsInstallment(false); setInstallmentMonths(2); setIsInterestFree(false); };
  const openAdd = () => { setEditingId(null); setForm(initialForm()); setIsShared(false); setIsTransfer(false); setTransferFrom(''); setTransferTo(''); resetInstallment(); setFormOpen(true); };
  const openEdit = (e: BudgetEntry) => {
    setEditingId(e.id);
    setForm({ ...e, amountStr: String(e.amount) });
    setIsShared(false);
    setIsTransfer(e.isTransfer ?? false);
    resetInstallment();
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditingId(null); setIsTransfer(false); setTransferFrom(''); setTransferTo(''); resetInstallment(); };

  // 이체 저장 — from 통장에서 출금(EXPENSE) + to 통장에 입금(INCOME) 두 항목 생성
  const handleTransferSave = async () => {
    const amount = Number(form.amountStr?.replace(/,/g, '') ?? 0);
    if (!transferFrom || !transferTo) { alert('출금·입금 통장을 모두 선택해주세요'); return; }
    if (transferFrom === transferTo) { alert('출금·입금 통장이 같습니다'); return; }
    if (!amount) { alert('금액을 입력해주세요'); return; }
    // 보내는 통장 잔액 확인 — 잔액 부족 시 이체 불가
    const fromAcc = summary.accountMap[transferFrom] ?? { income: 0, expense: 0 };
    const fromBalance = fromAcc.income - fromAcc.expense;
    if (fromBalance < amount) {
      alert(`잔액 부족: ${transferFrom} 잔액 ${fromBalance.toLocaleString()}원 < 이체 금액 ${amount.toLocaleString()}원`);
      return;
    }
    const entryDate = form.entryDate ?? today();
    const resolvedYearMonth = entryDate.replace(/-/g, '').slice(0, 6);
    const label = `이체: ${transferFrom} → ${transferTo}`;
    const base = { userId, yearMonth: resolvedYearMonth, entryDate, isFixed: false, isInvestment: false, isTransfer: true, memo: form.memo || undefined };
    try {
      // 순차 생성: 출금 먼저 → 입금 생성 시 출금 id 참조 → 출금 PATCH로 입금 id 역참조
      const exp = await createBudgetEntry({ ...base, entryType: 'EXPENSE', category: '이체', account: transferFrom, amount, merchant: label });
      const inc = await createBudgetEntry({ ...base, entryType: 'INCOME',  category: '이체', account: transferTo,   amount, merchant: label, transferPairId: exp.id });
      const updatedExp = await updateBudgetEntry(exp.id, { transferPairId: inc.id });
      if (resolvedYearMonth === yearMonth) setEntries(prev => [updatedExp, inc, ...prev]);
      closeForm();
    } catch { alert('이체 저장에 실패했습니다'); }
  };

  // 지출: isFixed 값에 따라 고정비/변동비 카테고리 목록 결정
  const expenseCats = form.isFixed ? fixExpCats : varExpCats;
  const incomeCats = incomeCatsDB;
  const selectedIncomeCat = form.entryType === 'INCOME'
    ? incomeCats.find(c => c.name === form.category)
    : undefined;

  const handleSave = async () => {
    const amount = Number(form.amountStr?.replace(/,/g, '') ?? 0);
    const isInvest = form.isInvestment ?? false;
    // 투자 항목은 카테고리 불필요 (투자 유형으로 대체)
    if (!isInvest && !form.category) { alert('카테고리를 선택해주세요'); return; }
    if (!amount) { alert('금액을 입력해주세요'); return; }
    if (form.entryType === 'EXPENSE' && !form.accountMain && !form.account && !form.cardName) { alert('통장/카드를 선택해주세요'); return; }
    // 투자 항목의 카테고리는 투자 유형 값으로 자동 설정
    const resolvedCategory = isInvest ? (form.investmentType || '투자') : (form.category ?? '');
    const entryDate = form.entryDate ?? today();
    // yearMonth는 입력한 날짜 기준으로 파생 (현재 탭 월과 무관하게 저장)
    const resolvedYearMonth = entryDate.replace(/-/g, '').slice(0, 6);
    const basePayload = {
      userId,
      yearMonth: resolvedYearMonth,
      entryDate,
      entryType: form.entryType as 'INCOME' | 'EXPENSE',
      category: resolvedCategory,
      subcategory: form.subcategory || undefined,
      accountMain: form.accountMain || undefined,
      account: form.account || undefined,
      cardName: form.cardName || undefined,
      isFixed: form.isFixed ?? false,
      isInvestment: form.isInvestment ?? false,
      investmentType: form.isInvestment ? (form.investmentType || undefined) : undefined,
      merchant: form.merchant || undefined,
      memo: form.memo || undefined,
    };
    try {
      if (editingId !== null) {
        // 수정 모드: 할부 미지원 (단건 수정)
        const updated = await updateBudgetEntry(editingId, { ...basePayload, amount });
        if (updated.yearMonth !== yearMonth) {
          setEntries(prev => prev.filter(e => e.id !== editingId));
        } else {
          setEntries(prev => prev.map(e => e.id === editingId ? updated : e));
        }
      } else if (isInstallment && form.entryType === 'EXPENSE' && form.cardName) {
        // ── 할부 분할 저장 ──────────────────────────────────────────
        const months = Math.max(2, installmentMonths);
        const perMonth = Math.floor(amount / months);
        const remainder = amount - perMonth * months; // 첫 달에 나머지 추가
        const otherUserId = BUDGET_USERS.find(u => u.id !== userId)?.id ?? '';
        const baseDate = new Date(entryDate);
        const groupId = crypto.randomUUID(); // 같은 할부 묶음 ID
        const newEntries: BudgetEntry[] = [];

        // 카드 결제일(billingDay) 기준: 결제 다음 달 결제일부터 시작
        // billingDay 없으면 구매일 기준 다음 달부터 (fallback)
        const cardPM = paymentMethods.find(p => p.name === form.cardName && p.type === '카드');
        const billingDay = cardPM?.billingDay ?? null;

        for (let i = 0; i < months; i++) {
          // 1회차: 구매월+1의 결제일, 2회차: 구매월+2의 결제일 …
          const targetMonth = baseDate.getMonth() + 1 + i; // 0-based month + 1 (다음 달) + i
          const d = billingDay
            ? new Date(baseDate.getFullYear(), targetMonth, billingDay)
            : new Date(baseDate.getFullYear(), targetMonth, baseDate.getDate());
          const monthEntryDate = d.toISOString().slice(0, 10);
          const monthYearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
          const monthAmount = perMonth + (i === 0 ? remainder : 0);
          // 할부 정보는 DB 컬럼으로 관리 (메모 오염 없음)
          const payload = {
            ...basePayload,
            entryDate: monthEntryDate,
            yearMonth: monthYearMonth,
            installmentMonths: months,
            installmentSeq: i + 1,
            installmentGroupId: groupId,
            isInterestFree,
          };

          if (isShared) {
            // 공용: 두 유저에게 각각 절반
            const half = Math.round(monthAmount / 2);
            const [e1] = await Promise.all([
              createBudgetEntry({ ...payload, userId, amount: half }),
              createBudgetEntry({ ...payload, userId: otherUserId, amount: half }),
            ]);
            if (e1.yearMonth === yearMonth) newEntries.push(e1);
          } else {
            const created = await createBudgetEntry({ ...payload, amount: monthAmount });
            if (created.yearMonth === yearMonth) newEntries.push(created);
          }
        }
        if (newEntries.length > 0) setEntries(prev => [...newEntries, ...prev]);
      } else if (isShared && form.entryType === 'EXPENSE') {
        // 공용 지출 (일시불): 두 유저에게 각각 절반
        const halfAmount = Math.round(amount / 2);
        const otherUserId = BUDGET_USERS.find(u => u.id !== userId)?.id ?? '';
        const [created1] = await Promise.all([
          createBudgetEntry({ ...basePayload, userId, amount: halfAmount }),
          createBudgetEntry({ ...basePayload, userId: otherUserId, amount: halfAmount }),
        ]);
        if (created1.yearMonth === yearMonth) setEntries(prev => [created1, ...prev]);
      } else {
        // 일반 단건 저장
        const created = await createBudgetEntry({ ...basePayload, amount });
        if (created.yearMonth === yearMonth) setEntries(prev => [created, ...prev]);
      }
      closeForm();
    } catch { alert('저장에 실패했습니다'); }
  };

  const handleDelete = async (entry: BudgetEntry) => {
    // 이체 항목 — transferPairId로 연결된 상대 항목 함께 삭제
    const isXfer = entry.isTransfer || entry.category === '이체';
    if (isXfer) {
      const paired = entry.transferPairId ? entries.find(e => e.id === entry.transferPairId) : undefined;
      const confirmMsg = paired
        ? `이체 항목을 삭제할까요?\n\n연결된 ${paired.entryType === 'INCOME' ? '입금' : '출금'} 항목 (${paired.account ?? paired.accountMain ?? ''})도 함께 삭제됩니다.`
        : `이체 항목을 삭제할까요? (연결 항목 없음)`;
      if (!window.confirm(confirmMsg)) return;
      try {
        const toDelete = paired ? [entry.id, paired.id] : [entry.id];
        await Promise.all(toDelete.map(id => deleteBudgetEntry(id)));
        const deletedIds = new Set(toDelete);
        setEntries(prev => prev.filter(e => !deletedIds.has(e.id)));
      } catch { alert('삭제에 실패했습니다'); }
      return;
    }
    // 할부 항목은 단건 vs 전체 선택
    if (entry.installmentGroupId && entry.installmentMonths && entry.installmentMonths > 1) {
      const choice = window.confirm(
        `💳 할부 항목입니다 (${entry.installmentSeq}/${entry.installmentMonths}회차)\n\n` +
        `[확인] 할부 전체 삭제 (${entry.installmentMonths}개월 분)\n` +
        `[취소] 이 항목만 삭제`
      );
      try {
        if (choice) {
          // 전체 삭제: group_id 기준
          await deleteBudgetEntriesByGroup(entry.installmentGroupId);
          setEntries(prev => prev.filter(e => e.installmentGroupId !== entry.installmentGroupId));
        } else {
          await deleteBudgetEntry(entry.id);
          setEntries(prev => prev.filter(e => e.id !== entry.id));
        }
      } catch { alert('삭제에 실패했습니다'); }
      return;
    }
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
                {([['ENTRIES', '내역'], ['ACCOUNTS', '통장'], ['ASSETS', '자산'], ['OVERVIEW', '통합'], ['WORKOUT', '💪'], ['AI', '🤖']] as [Tab, string][]).map(([t, label]) => (
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
              {([['ENTRIES', '내역'], ['ACCOUNTS', '통장 관리'], ['ASSETS', '자산'], ['OVERVIEW', '통합 보기'], ['WORKOUT', '💪 운동'], ['AI', '🤖 AI 분석']] as [Tab, string][]).map(([t, label]) => (
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
      {tab === 'ENTRIES' && (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* ── 요약 카드 */}
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <SummaryCard label="총 수입" amount={summary.totalIncome} color="#4CAF50" sign="+" />
          <SummaryCard label="총 지출" amount={summary.totalExpense} color="#E06060" sign="-" />
          <SummaryCard label="투자" amount={summary.totalInvest} color="#2196F3" sign="" />
          <SummaryCard label="잔액" amount={summary.totalIncome - summary.totalExpense - summary.totalInvest}
            color={summary.totalIncome >= summary.totalExpense + summary.totalInvest ? '#1565c0' : '#E06060'}
            sign={summary.totalIncome - summary.totalExpense - summary.totalInvest < 0 ? '-' : ''} />
        </div>

        {/* ── 고정/변동/투자 소요약 */}
        <div style={{ padding: '8px 20px 0', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

        {/* ── 통장 잔액 현황 */}
        {(() => {
          // 등록된 통장(type='통장') 기준으로 잔액 표시
          const bankAccounts = paymentMethods.filter(p => p.type === '통장');
          if (bankAccounts.length === 0) return null;

          const prevMonth = (() => {
            const y = Number(yearMonth.slice(0, 4));
            const m = Number(yearMonth.slice(4, 6));
            const pm = m === 1 ? 12 : m - 1;
            const py = m === 1 ? y - 1 : y;
            return `${py}${String(pm).padStart(2, '0')}`;
          })();

          return (
            <div style={{ padding: '8px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#344054' }}>통장 잔액</span>
                <button
                  onClick={async () => {
                    // 이전 달 종료 잔액을 이번 달 이월로 자동 가져오기
                    // 이전 달 openingBalances + 이전 달 entries 합산이 필요하므로 API로 처리
                    const prevBalances = await getAccountBalances(userId, prevMonth);
                    if (prevBalances.length === 0) { alert('이전 달 이월 잔액 데이터가 없습니다. 직접 입력해주세요.'); return; }
                    const closing: Record<string, number> = {};
                    prevBalances.forEach(r => { closing[r.accountName] = r.openingBalance; });
                    await carryOverAccountBalances(userId, prevMonth, yearMonth, closing);
                    const updated = await getAccountBalances(userId, yearMonth);
                    const map: Record<string, number> = {};
                    updated.forEach(r => { map[r.accountName] = r.openingBalance; });
                    setOpeningBalances(map);
                    alert('이월 잔액을 가져왔습니다.');
                  }}
                  style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', border: '1px solid #89CFF0', background: '#f0f8fd', color: '#1a3a5c', cursor: 'pointer' }}
                >
                  ← 이전달 이월
                </button>
              </div>
              {(() => {
                // 계좌 카드 공통 렌더러
                const AccountCard = ({ accName, opening, income, expense, dimmed = false }: {
                  accName: string; opening: number; income: number; expense: number; dimmed?: boolean;
                }) => {
                  const closing = opening + income - expense;
                  const isEditing = editingOpeningAccount === accName;
                  // 통장 카드 클릭 시 해당 통장으로 내역 필터링 (dimmed 카드는 비활성, 카드 필터는 해제)
                  const isSelected = !dimmed && accountFilter === accName;
                  const handleCardClick = () => {
                    if (dimmed) return;
                    setCardFilter(null);
                    setAccountFilter(prev => prev === accName ? null : accName);
                  };
                  return (
                    <div
                      onClick={handleCardClick}
                      style={{
                        background: isSelected ? '#e8f4fd' : (dimmed ? '#fafafa' : '#fff'),
                        border: `1px solid ${isSelected ? '#89CFF0' : (dimmed ? '#e0e0e0' : '#e8ecf0')}`,
                        borderRadius: '10px', padding: '10px 14px', minWidth: '160px', fontSize: '12px',
                        cursor: dimmed ? 'default' : 'pointer',
                        boxShadow: isSelected ? '0 0 0 2px #89CFF080' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: dimmed ? '#9aa0a6' : '#1a3a5c', marginBottom: '6px' }}>{accName}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: '#5f6368' }}>
                        {!dimmed && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ minWidth: '52px' }}>이월 잔액</span>
                            {isEditing ? (
                              <input
                                autoFocus type="text" inputMode="numeric"
                                value={editingOpeningStr}
                                onChange={e => setEditingOpeningStr(e.target.value.replace(/[^0-9-]/g, ''))}
                                onBlur={async () => {
                                  const v = Number(editingOpeningStr || '0');
                                  await upsertAccountBalance(userId, accName, yearMonth, v);
                                  setOpeningBalances(prev => ({ ...prev, [accName]: v }));
                                  setEditingOpeningAccount(null);
                                }}
                                onKeyDown={async e => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                  if (e.key === 'Escape') setEditingOpeningAccount(null);
                                }}
                                style={{ width: '90px', padding: '1px 5px', fontSize: '11px', border: '1px solid #89CFF0', borderRadius: '4px', outline: 'none' }}
                              />
                            ) : (
                              <span
                                onClick={e => { e.stopPropagation(); setEditingOpeningAccount(accName); setEditingOpeningStr(String(opening)); }}
                                style={{ cursor: 'text', borderBottom: '1px dashed #89CFF0', color: '#344054', fontWeight: 600 }}
                                title="클릭하여 이월 잔액 수정"
                              >
                                {formatAmountShort(opening)}
                              </span>
                            )}
                          </div>
                        )}
                        {income > 0 && <div><span style={{ minWidth: '52px', display: 'inline-block' }}>+ 수입</span><span style={{ color: '#4CAF50', fontWeight: 600 }}>{formatAmountShort(income)}</span></div>}
                        {expense > 0 && <div><span style={{ minWidth: '52px', display: 'inline-block' }}>- 지출</span><span style={{ color: '#E06060', fontWeight: 600 }}>{formatAmountShort(expense)}</span></div>}
                        <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '4px', paddingTop: '4px' }}>
                          <span style={{ minWidth: '52px', display: 'inline-block' }}>잔액</span>
                          <span style={{ fontWeight: 700, color: closing >= 0 ? '#1565c0' : '#E06060', fontSize: '13px' }}>{formatAmountShort(closing)}</span>
                        </div>
                      </div>
                    </div>
                  );
                };

                // 등록된 통장 카드 — pm.name(중분류) + pm.accountMain(대분류) 두 키 모두 합산
                const cards = bankAccounts.map(pm => {
                  const accName = pm.name;
                  const opening = openingBalances[accName] ?? 0;
                  const byName = summary.accountMap[accName] ?? { income: 0, expense: 0 };
                  // accountMain이 pm.name과 다를 때: accountMain 키로 저장된 수입/지출도 합산
                  // (수입 항목에 통장 미지정 → accountMain만 저장된 경우 대응)
                  const byMain = pm.accountMain && pm.accountMain !== accName
                    ? (summary.accountMap[pm.accountMain] ?? { income: 0, expense: 0 })
                    : { income: 0, expense: 0 };
                  return (
                    <AccountCard key={accName} accName={accName} opening={opening}
                      income={byName.income + byMain.income}
                      expense={byName.expense + byMain.expense} />
                  );
                });

                // 미분류 — 통장·accountMain 모두 미해당 항목
                const knownNames = new Set([
                  ...bankAccounts.map(p => p.name),
                  ...bankAccounts.filter(p => p.accountMain).map(p => p.accountMain!),
                ]);
                const unassigned = { income: 0, expense: 0 };
                Object.entries(summary.accountMap).forEach(([k, v]) => {
                  if (!knownNames.has(k)) { unassigned.income += v.income; unassigned.expense += v.expense; }
                });
                const unassignedCard = (unassigned.income > 0 || unassigned.expense > 0) ? (
                  <div
                    key="미분류"
                    onClick={() => { setCardFilter(null); setAccountFilter(prev => prev === '__UNASSIGNED__' ? null : '__UNASSIGNED__'); }}
                    style={{
                      background: accountFilter === '__UNASSIGNED__' ? '#fef9e7' : '#fafafa',
                      border: `1px solid ${accountFilter === '__UNASSIGNED__' ? '#f0c040' : '#e0e0e0'}`,
                      borderRadius: '10px', padding: '10px 14px', minWidth: '160px', fontSize: '12px',
                      cursor: 'pointer',
                      boxShadow: accountFilter === '__UNASSIGNED__' ? '0 0 0 2px #f0c04060' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#9aa0a6', marginBottom: '6px' }}>미분류 (통장 미지정)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: '#5f6368' }}>
                      {unassigned.income > 0 && <div><span style={{ minWidth: '52px', display: 'inline-block' }}>+ 수입</span><span style={{ color: '#4CAF50', fontWeight: 600 }}>{formatAmountShort(unassigned.income)}</span></div>}
                      {unassigned.expense > 0 && <div><span style={{ minWidth: '52px', display: 'inline-block' }}>- 지출</span><span style={{ color: '#E06060', fontWeight: 600 }}>{formatAmountShort(unassigned.expense)}</span></div>}
                    </div>
                    <div style={{ fontSize: '10px', color: '#bbb', marginTop: '6px' }}>클릭하여 이력 보기</div>
                  </div>
                ) : null;

                // 합계 카드 — 이체 제외 수입/지출 (요약의 총수입·총지출과 일치)
                const isXfer = (e: BudgetEntry) => e.isTransfer || e.category === '이체';
                const totalOpening = bankAccounts.reduce((s, pm) => s + (openingBalances[pm.name] ?? 0), 0);
                const totalIncome = entries.filter(e => e.entryType === 'INCOME' && !isXfer(e)).reduce((s, e) => s + e.amount, 0);
                const totalExpense = entries.filter(e => e.entryType === 'EXPENSE' && !isXfer(e)).reduce((s, e) => s + e.amount, 0);
                const totalBalance = totalOpening + totalIncome - totalExpense;

                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-start' }}>
                    {cards}
                    {unassignedCard}
                    {/* 합계 — 요약 잔액과 일치해야 함 */}
                    <div style={{
                      background: '#f0f8fd', border: '1px solid #89CFF0', borderRadius: '10px',
                      padding: '10px 14px', minWidth: '160px', fontSize: '12px',
                    }}>
                      <div style={{ fontWeight: 700, color: '#1a3a5c', marginBottom: '6px' }}>합계</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: '#5f6368' }}>
                        {totalIncome > 0 && <div><span style={{ minWidth: '52px', display: 'inline-block' }}>+ 수입</span><span style={{ color: '#4CAF50', fontWeight: 600 }}>{formatAmountShort(totalIncome)}</span></div>}
                        {totalExpense > 0 && <div><span style={{ minWidth: '52px', display: 'inline-block' }}>- 지출</span><span style={{ color: '#E06060', fontWeight: 600 }}>{formatAmountShort(totalExpense)}</span></div>}
                        <div style={{ borderTop: '1px solid #89CFF0', marginTop: '4px', paddingTop: '4px' }}>
                          <span style={{ minWidth: '52px', display: 'inline-block' }}>잔액</span>
                          <span style={{ fontWeight: 700, color: totalBalance >= 0 ? '#1565c0' : '#E06060', fontSize: '13px' }}>{totalBalance < 0 ? '-' : ''}{formatAmountShort(Math.abs(totalBalance))}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* ── 카드별 지출 현황 — billingDay 있으면 청구 기간 기준, 없으면 이번달 전체 */}
        {(() => {
          const isXfer = (e: BudgetEntry) => e.isTransfer || e.category === '이체';
          const cardPMs = paymentMethods.filter(p => p.type === '카드');
          if (cardPMs.length === 0) return null;

          const cardNames = new Set(cardPMs.map(p => p.name));

          // 카드별 청구 기간 기준 지출 합산 (billingStartDay+billingEndDay 모두 설정 시 결산 기간 기준, 없으면 이번달 전체)
          const cardData: Record<string, { spent: number; period?: string }> = {};
          for (const pm of cardPMs) {
            let pool: BudgetEntry[];
            let period: string | undefined;
            if (pm.billingStartDay && pm.billingEndDay) {
              const { from, to, label } = getCardBillingPeriod(pm.billingStartDay, pm.billingEndDay, yearMonth);
              period = label;
              // 전달 항목 중 from 이후 + 이번달 항목 중 to 이하를 합산
              pool = [
                ...prevMonthEntries.filter(e => e.entryDate >= from),
                ...entries.filter(e => e.entryDate <= to),
              ].filter(e => e.entryType === 'EXPENSE' && !isXfer(e));
            } else {
              pool = entries.filter(e => e.entryType === 'EXPENSE' && !isXfer(e));
            }
            const spent = pool.reduce((s, e) => {
              if (e.cardName === pm.name) return s + e.amount;
              if (!e.cardName && e.account === pm.name) return s + e.amount; // 레거시
              return s;
            }, 0);
            cardData[pm.name] = { spent, period };
          }

          // 등록되지 않은 카드명으로 지출된 항목 (이번달 전체 기준)
          const legacyMap: Record<string, number> = {};
          for (const e of entries.filter(e => e.entryType === 'EXPENSE' && !isXfer(e))) {
            if (e.cardName && !cardNames.has(e.cardName)) {
              legacyMap[e.cardName] = (legacyMap[e.cardName] ?? 0) + e.amount;
            } else if (!e.cardName && e.account && cardNames.has(e.account) && !cardData[e.account]) {
              legacyMap[e.account] = (legacyMap[e.account] ?? 0) + e.amount;
            }
          }

          const hasAnyData = cardPMs.some(pm => cardData[pm.name]?.spent > 0) || Object.keys(legacyMap).length > 0;
          if (!hasAnyData) return null;

          return (
            <div style={{ padding: '8px 20px 0' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#344054', marginBottom: '6px' }}>💳 카드별 지출</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {cardPMs.map(pm => {
                  const { spent, period } = cardData[pm.name] ?? { spent: 0 };
                  if (spent === 0) return null;
                  const isSelected = cardFilter === pm.name;
                  return (
                    <div
                      key={pm.name}
                      onClick={() => { setAccountFilter(null); setCardFilter(prev => prev === pm.name ? null : pm.name); }}
                      style={{
                        background: isSelected ? '#fff3e0' : '#fff',
                        border: `1px solid ${isSelected ? '#FF9800' : '#e8ecf0'}`,
                        borderRadius: '10px', padding: '10px 14px', minWidth: '140px',
                        fontSize: '12px', cursor: 'pointer',
                        boxShadow: isSelected ? '0 0 0 2px #FF980040' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: isSelected ? '#E65100' : '#1a3a5c', marginBottom: '2px' }}>
                        {pm.name}
                        {pm.billingDay && <span style={{ fontSize: '10px', color: '#9aa0a6', marginLeft: '4px' }}>결제일 {pm.billingDay}일</span>}
                      </div>
                      {/* 결산 기간 표시 */}
                      {period && (
                        <div style={{ fontSize: '10px', color: '#4BAAD4', marginBottom: '4px' }}>결산 {period}</div>
                      )}
                      <div style={{ color: '#E06060', fontWeight: 700, fontSize: '13px' }}>
                        -{formatAmountShort(spent)}
                      </div>
                    </div>
                  );
                })}
                {/* 등록 안된 카드로 지출된 항목 */}
                {Object.entries(legacyMap).map(([name, spent]) => (
                  <div
                    key={name}
                    onClick={() => { setAccountFilter(null); setCardFilter(prev => prev === name ? null : name); }}
                    style={{
                      background: cardFilter === name ? '#fff3e0' : '#fafafa',
                      border: `1px solid ${cardFilter === name ? '#FF9800' : '#e0e0e0'}`,
                      borderRadius: '10px', padding: '10px 14px', minWidth: '140px',
                      fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#9aa0a6', marginBottom: '4px' }}>{name}</div>
                    <div style={{ color: '#E06060', fontWeight: 700, fontSize: '13px' }}>-{formatAmountShort(spent)}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── 카테고리별 지출 & 투자 파이 차트 */}
        {(() => {
          const COLORS = [
            '#89CFF0','#FFD97D','#E06060','#9C27B0','#4CAF50',
            '#FF9800','#2196F3','#E91E63','#00BCD4','#8BC34A',
            '#FF5722','#607D8B','#795548','#673AB7','#03A9F4',
          ];
          const INVEST_COLORS = [
            '#2196F3','#1565c0','#4FC3F7','#0288D1','#29B6F6',
            '#0097A7','#006064','#01579B',
          ];

          const isXfer = (e: BudgetEntry) => e.isTransfer || e.category === '이체';

          // 지출 (투자·이체 제외) — 금액 + 건수 집계
          const expenseMap: Record<string, { value: number; count: number }> = {};
          for (const e of entries.filter(e => e.entryType === 'EXPENSE' && !e.isInvestment && !isXfer(e))) {
            const key = e.category || '미분류';
            if (!expenseMap[key]) expenseMap[key] = { value: 0, count: 0 };
            expenseMap[key].value += e.amount;
            expenseMap[key].count += 1;
          }
          const expenseData = Object.entries(expenseMap)
            .sort((a, b) => b[1].value - a[1].value)
            .map(([name, { value, count }]) => ({ name, value, count }));
          const expenseTotal = expenseData.reduce((s, d) => s + d.value, 0);

          // 투자 (이체 제외) — 금액 + 건수 집계
          const investMap: Record<string, { value: number; count: number }> = {};
          for (const e of entries.filter(e => e.isInvestment && !isXfer(e))) {
            const key = e.investmentType || e.category || '기타';
            if (!investMap[key]) investMap[key] = { value: 0, count: 0 };
            investMap[key].value += e.amount;
            investMap[key].count += 1;
          }
          const investData = Object.entries(investMap)
            .sort((a, b) => b[1].value - a[1].value)
            .map(([name, { value, count }]) => ({ name, value, count }));
          const investTotal = investData.reduce((s, d) => s + d.value, 0);

          if (expenseData.length === 0 && investData.length === 0) return null;

          // 파이 + 범례 렌더러
          const renderChart = (
            title: string,
            data: { name: string; value: number; count: number }[],
            total: number,
            colors: string[],
          ) => {
            if (data.length === 0) return null;
            return (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#344054', marginBottom: '4px' }}>{title}</div>
                {/* 파이 */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <PieChart width={120} height={120}>
                    <Pie data={data} cx={55} cy={55} innerRadius={28} outerRadius={52} dataKey="value" stroke="none">
                      {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                    </Pie>
                    <PieTooltip
                      formatter={(value: number, name: string) => [
                        `${formatAmountShort(value)}원 (${Math.round(value / total * 100)}%)`, name,
                      ]}
                      contentStyle={{ fontSize: '11px', padding: '4px 8px' }}
                    />
                  </PieChart>
                </div>
                {/* 범례 — 파이 아래, 클릭 시 카테고리 필터 적용 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: '6px' }}>
                  {data.map((d, i) => (
                    <CategoryTip
                      key={d.name}
                      color={colors[i % colors.length]}
                      name={d.name}
                      pct={Math.round(d.value / total * 100)}
                      tipLabel={`${d.value.toLocaleString()}원 / ${d.count}건`}
                      isActive={categoryFilters.has(d.name)}
                      onClick={() => setCategoryFilters(prev => {
                        const next = new Set(prev);
                        next.has(d.name) ? next.delete(d.name) : next.add(d.name);
                        return next;
                      })}
                    />
                  ))}
                </div>
              </div>
            );
          };

          const expenseChart = renderChart('카테고리별 지출', expenseData, expenseTotal, COLORS);
          const investChart = renderChart('카테고리별 투자', investData, investTotal, INVEST_COLORS);
          return (
            <div style={{ padding: '8px 20px 0', display: 'flex', gap: '0', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {expenseChart && <div style={{ flex: 1, minWidth: isMobile ? '100%' : '220px', paddingRight: investChart ? '20px' : 0 }}>{expenseChart}</div>}
              {expenseChart && investChart && (
                <div style={{ width: '1px', background: '#e8ecf0', alignSelf: 'stretch', flexShrink: 0, marginRight: '20px' }} />
              )}
              {investChart && <div style={{ flex: 1, minWidth: isMobile ? '100%' : '220px' }}>{investChart}</div>}
            </div>
          );
        })()}

        {/* ── 지출처 분석 */}
        {(() => {
          const isXfer = (e: BudgetEntry) => e.isTransfer || e.category === '이체';
          const merchantEntries = entries.filter(e => e.entryType === 'EXPENSE' && !isXfer(e) && e.merchant);
          if (merchantEntries.length === 0) return null;

          const map: Record<string, { count: number; total: number }> = {};
          for (const e of merchantEntries) {
            const key = e.merchant!;
            if (!map[key]) map[key] = { count: 0, total: 0 };
            map[key].count += 1;
            map[key].total += e.amount;
          }

          const rows = Object.entries(map).map(([name, v]) => ({ name, ...v }));

          return (
            <MerchantStatsSection rows={rows} />
          );
        })()}

        {/* 카테고리 필터 활성 배지 + 선택 합산 */}
        {categoryFilters.size > 0 && (() => {
          const selectedTotal = filtered
            .filter((e: BudgetEntry) => e.entryType === 'EXPENSE' && !e.isTransfer && e.category !== '이체')
            .reduce((s: number, e: BudgetEntry) => s + e.amount, 0);
          const catList = Array.from(categoryFilters);
          return (
            <div style={{ padding: '6px 20px 0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#5f6368' }}>카테고리 필터:</span>
              {catList.map(cat => (
                <span
                  key={cat}
                  onClick={() => setCategoryFilters(prev => { const next = new Set(prev); next.delete(cat); return next; })}
                  style={{
                    fontSize: '12px', fontWeight: 700, color: '#1a3a5c',
                    background: '#e0f0ff', border: '1px solid #89CFF0',
                    borderRadius: '12px', padding: '2px 10px', cursor: 'pointer',
                  }}
                >
                  {cat} ×
                </span>
              ))}
              <span
                onClick={() => setCategoryFilters(new Set())}
                style={{ fontSize: '11px', color: '#9aa0a6', cursor: 'pointer', marginLeft: '2px' }}
              >
                전체 해제
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: '12px', fontWeight: 700,
                color: '#b71c1c', background: '#fff5f5',
                border: '1px solid #ffcdd2', borderRadius: '12px', padding: '2px 12px',
              }}>
                합계 {selectedTotal.toLocaleString()}원
              </span>
            </div>
          );
        })()}

        {/* 통장 필터 활성 배지 */}
        {accountFilter && (
          <div style={{ padding: '6px 20px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#5f6368' }}>통장 필터:</span>
            <span
              onClick={() => setAccountFilter(null)}
              style={{
                fontSize: '12px', fontWeight: 700,
                color: accountFilter === '__UNASSIGNED__' ? '#7d6608' : '#1565c0',
                background: accountFilter === '__UNASSIGNED__' ? '#fef9e7' : '#e0f0ff',
                border: `1px solid ${accountFilter === '__UNASSIGNED__' ? '#f0c040' : '#4BAAD4'}`,
                borderRadius: '12px', padding: '2px 10px', cursor: 'pointer',
              }}
            >
              {accountFilter === '__UNASSIGNED__' ? '미분류 ×' : `🏦 ${accountFilter} ×`}
            </span>
          </div>
        )}

        {/* 카드 필터 활성 배지 */}
        {cardFilter && (
          <div style={{ padding: '6px 20px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#5f6368' }}>카드 필터:</span>
            <span
              onClick={() => setCardFilter(null)}
              style={{
                fontSize: '12px', fontWeight: 700, color: '#E65100',
                background: '#fff3e0', border: '1px solid #FF9800',
                borderRadius: '12px', padding: '2px 10px', cursor: 'pointer',
              }}
            >
              💳 {cardFilter} ×
            </span>
          </div>
        )}

        {/* ── 고정비 관리 버튼 + 필터 탭 + 뷰 토글 */}
        <div style={{ padding: '10px 20px 0', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
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
            ['FIXED', '고정비'], ['INVEST', '투자'], ['TRANSFER', '이체'],
          ] as [Filter, string][]).map(([val, label]) => (
            <button key={val} onClick={() => { setFilter(val); setCategoryFilters(new Set()); }} style={{
              padding: '5px 12px', fontSize: '12px', borderRadius: '20px',
              border: `1px solid ${filter === val ? '#89CFF0' : '#dadce0'}`,
              background: filter === val ? '#89CFF0' : '#fff',
              color: filter === val ? '#fff' : '#5f6368',
              cursor: 'pointer', fontWeight: filter === val ? 700 : 400,
            }}>
              {label}
            </button>
          ))}
          {/* 목록/달력 뷰 토글 */}
          <button
            onClick={() => {
              setViewMode(v => v === 'list' ? 'calendar' : 'list');
              setCalSelectedDate(null);
            }}
            style={{
              marginLeft: 'auto', padding: '5px 12px', fontSize: '12px', borderRadius: '20px',
              border: `1px solid ${viewMode === 'calendar' ? '#4BAAD4' : '#dadce0'}`,
              background: viewMode === 'calendar' ? '#e0f0ff' : '#fff',
              color: viewMode === 'calendar' ? '#1a3a5c' : '#5f6368',
              cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {viewMode === 'calendar' ? '📋 목록' : '📅 달력'}
          </button>
        </div>

        {/* ── 달력 뷰 */}
        {viewMode === 'calendar' ? (
          <div style={{ padding: '10px 20px 20px' }}>
            <CalendarView
              yearMonth={yearMonth}
              entries={entries}
              selectedDate={calSelectedDate}
              onSelectDate={d => setCalSelectedDate(prev => prev === d ? null : d)}
              onEdit={openEdit}
              onDelete={handleDelete}
              userId={userId}
              onEntriesAdded={newEntries => setEntries(prev => [...newEntries, ...prev])}
              paymentMethods={paymentMethods}
              incomeCats={incomeCatsDB}
              varExpCats={varExpCats}
            />
          </div>
        ) : (
          /* ── 목록 뷰 */
          <div style={{ padding: '10px 20px 20px' }}>
            {/* 데스크탑: 목록 바로 위 추가 버튼 */}
            {!isMobile && (
              <button
                onClick={openAdd}
                style={{
                  width: '100%', marginBottom: '10px', padding: '9px',
                  fontSize: '13px', fontWeight: 700, borderRadius: '8px',
                  border: '1px dashed #89CFF0', background: '#f0f8fd',
                  color: '#1a3a5c', cursor: 'pointer',
                }}
              >
                + 새 항목 추가
              </button>
            )}
            {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6' }}>불러오는 중…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6', fontSize: '14px' }}>
                항목이 없습니다. + 추가로 기록을 시작하세요.
              </div>
            )}
            {!loading && (() => {
              const myAccountNames = new Set(paymentMethods.map(p => p.name));
              const otherUserName = BUDGET_USERS.find(u => u.id !== userId)?.name;
              return filtered.map(entry => (
                <EntryRow key={entry.id} entry={entry} onEdit={openEdit} onDelete={handleDelete}
                  myAccountNames={myAccountNames} otherUserName={otherUserName} />
              ));
            })()}
          </div>
        )}
      </div>
      )}

      {/* ══ 통장 관리 탭 ═════════════════════════════════════ */}
      {tab === 'ACCOUNTS' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* 결제수단 관리 패널 (통장/카드 CRUD) */}
          <PaymentMethodPanel userId={userId} paymentMethods={paymentMethods} onChanged={setPaymentMethods} />

          {/* 섹션 구분선 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            margin: '8px 0 24px',
          }}>
            <div style={{ flex: 1, height: '2px', background: 'linear-gradient(to right, #89CFF0, #e0f0ff)' }} />
            <span style={{
              fontSize: '12px', fontWeight: 700, color: '#4BAAD4',
              padding: '4px 14px', border: '1.5px solid #89CFF0',
              borderRadius: '20px', background: '#f0f8fd', whiteSpace: 'nowrap',
            }}>
              통장 배분 현황 (예시)
            </span>
            <div style={{ flex: 1, height: '2px', background: 'linear-gradient(to left, #89CFF0, #e0f0ff)' }} />
          </div>

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

      {/* ══ 운동 탭 ══════════════════════════════════════════ */}
      {tab === 'WORKOUT' && (
        <WorkoutTab userId={userId} />
      )}

      {/* ══ AI 재무 분석 탭 ══════════════════════════════════ */}
      {tab === 'AI' && (
        <AIReportView />
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

            {/* 이체 체크박스 (신규 추가 시에만 표시) */}
            {editingId === null && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: isTransfer ? '#1565c0' : '#5f6368' }}>
                <input type="checkbox" checked={isTransfer} onChange={e => { setIsTransfer(e.target.checked); setTransferFrom(''); setTransferTo(''); }}
                  style={{ width: '15px', height: '15px', accentColor: '#1565c0', cursor: 'pointer' }} />
                🔄 이체 (통장 간 자금 이동)
              </label>
            )}

            {/* ── 이체 모드 폼 */}
            {isTransfer && editingId === null ? (
              <>
                {/* 날짜 */}
                <FieldRow label="날짜">
                  <input type="date" value={form.entryDate ?? today()} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} style={inputStyle} />
                </FieldRow>
                {/* from → to */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'end', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: 600, marginBottom: '5px' }}>출금 통장 (From)</label>
                    <select value={transferFrom} onChange={e => setTransferFrom(e.target.value)} style={inputStyle}>
                      <option value="">선택</option>
                      {paymentMethods.filter(p => p.type === '통장').map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                  <span style={{ fontSize: '20px', color: '#89CFF0', paddingBottom: '2px', textAlign: 'center' }}>→</span>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: 600, marginBottom: '5px' }}>입금 통장 (To)</label>
                    <select value={transferTo} onChange={e => setTransferTo(e.target.value)} style={inputStyle}>
                      <option value="">선택</option>
                      {paymentMethods.filter(p => p.type === '통장').map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                {/* 금액 */}
                <FieldRow label="금액 (원)">
                  <input type="text" inputMode="numeric" value={form.amountStr ?? ''} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, amountStr: e.target.value.replace(/[^0-9]/g, '') }))} style={inputStyle} />
                  {form.amountStr && Number(form.amountStr) > 0 && (
                    <span style={{ fontSize: '12px', color: '#4BAAD4', marginTop: '3px', display: 'block', fontWeight: 600 }}>= {formatAmountKorean(Number(form.amountStr))}</span>
                  )}
                </FieldRow>
                {/* 메모 */}
                <FieldRow label="메모 (선택)">
                  <input type="text" value={form.memo ?? ''} placeholder="메모" onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} style={inputStyle} />
                </FieldRow>
                <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                  <button onClick={closeForm} style={{ ...btnStyle('#f0f4f8', '#5f6368'), flex: 1, padding: '12px' }}>취소</button>
                  <button onClick={handleTransferSave} style={{ ...btnStyle('#1565c0', '#fff'), flex: 2, padding: '12px', fontWeight: 700 }}>이체 저장</button>
                </div>
              </>
            ) : (<>

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

            {/* 카테고리 + 지출처 (지출 시 나란히 표시, 투자 체크 시 숨김) */}
            {form.entryType === 'EXPENSE' && !form.isInvestment ? (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '5px' }}>
                  <label style={{ flex: 1, fontSize: '12px', color: '#5f6368', fontWeight: 600 }}>카테고리</label>
                  <label style={{ flex: 1, fontSize: '12px', color: '#5f6368', fontWeight: 600 }}>지출처</label>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={form.category ?? ''}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  >
                    <option value="">선택</option>
                    {expenseCats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="예: 스타벅스"
                    value={form.merchant ?? ''}
                    onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  />
                </div>
              </div>
            ) : (
              <FieldRow label="카테고리">
                <select value={form.category ?? ''} onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: '' }))} style={inputStyle}>
                  <option value="">선택</option>
                  {incomeCats.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </FieldRow>
            )}

            {/* 수입 세부항목 (수입 카테고리에만) */}
            {selectedIncomeCat && selectedIncomeCat.subcategories.length > 0 && (
              <FieldRow label="세부항목">
                <select value={form.subcategory ?? ''} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))} style={inputStyle}>
                  <option value="">선택 안함</option>
                  {selectedIncomeCat.subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FieldRow>
            )}

            {/* 데스크탑: 날짜 · 결제수단 · 금액 한 줄 / 모바일: 각 행으로 분리 */}
            {isMobile ? (
              <>
                <FieldRow label="날짜">
                  <input type="date" value={form.entryDate ?? today()} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} style={inputStyle} />
                </FieldRow>
                <FieldRow label="통장">
                  {/* 통장 선택 시 카드 초기화 — 동시 선택 불가 */}
                  <select value={form.account ?? ''} onChange={e => setForm(f => ({ ...f, account: e.target.value, cardName: undefined }))} style={inputStyle}>
                    <option value="">선택 안함</option>
                    {paymentMethods.filter(p => p.type === '통장').map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </FieldRow>
                {paymentMethods.some(p => p.type === '카드') && (
                  <FieldRow label="카드">
                    {/* 카드 선택 시 통장 초기화 — 동시 선택 불가 */}
                    <select value={form.cardName ?? ''} onChange={e => setForm(f => ({ ...f, cardName: e.target.value || undefined, account: e.target.value ? '' : f.account }))} style={inputStyle}>
                      <option value="">선택 안함</option>
                      {paymentMethods.filter(p => p.type === '카드').map(p => (
                        <option key={p.id} value={p.name}>{p.name}{p.billingDay ? ` (결제일 ${p.billingDay}일)` : ''}</option>
                      ))}
                    </select>
                  </FieldRow>
                )}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <label style={{ fontSize: '12px', color: '#5f6368', fontWeight: 600 }}>금액 (원)</label>
                    {form.entryType === 'EXPENSE' && editingId === null && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: isShared ? '#1a7c4a' : '#5f6368' }}>
                        <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} style={{ width: '14px', height: '14px', accentColor: '#2e7d32', cursor: 'pointer' }} />
                        공용 (÷2)
                      </label>
                    )}
                  </div>
                  <input type="text" inputMode="numeric" value={form.amountStr ?? ''} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, amountStr: e.target.value.replace(/[^0-9]/g, '') }))} style={inputStyle} />
                  {form.amountStr && Number(form.amountStr) > 0 && (
                    <span style={{ fontSize: '12px', color: isShared ? '#1a7c4a' : '#4BAAD4', marginTop: '3px', display: 'block', fontWeight: 600 }}>
                      {isShared ? `각 ${formatAmountKorean(Math.round(Number(form.amountStr) / 2))} (동영·주해 각각 저장)` : `= ${formatAmountKorean(Number(form.amountStr))}`}
                    </span>
                  )}
                </div>
              </>
            ) : (
              /* 데스크탑: 3열 그리드 */
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                {/* 날짜 */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: 600, marginBottom: '5px' }}>날짜</label>
                  <input type="date" value={form.entryDate ?? today()} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} style={inputStyle} />
                </div>
                {/* 통장 + 카드 (결제수단 분리) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: 600, marginBottom: '5px' }}>통장</label>
                    {/* 통장 선택 시 카드 초기화 — 동시 선택 불가 */}
                    <select value={form.account ?? ''} onChange={e => setForm(f => ({ ...f, account: e.target.value, cardName: undefined }))} style={inputStyle}>
                      <option value="">선택 안함</option>
                      {paymentMethods.filter(p => p.type === '통장').map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {paymentMethods.some(p => p.type === '카드') && (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: 600, marginBottom: '5px' }}>카드</label>
                      {/* 카드 선택 시 통장 초기화 — 동시 선택 불가 */}
                      <select value={form.cardName ?? ''} onChange={e => setForm(f => ({ ...f, cardName: e.target.value || undefined, account: e.target.value ? '' : f.account }))} style={inputStyle}>
                        <option value="">선택 안함</option>
                        {paymentMethods.filter(p => p.type === '카드').map(p => (
                          <option key={p.id} value={p.name}>{p.name}{p.billingDay ? ` (${p.billingDay}일)` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {/* 금액 */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <label style={{ fontSize: '12px', color: '#5f6368', fontWeight: 600 }}>금액 (원)</label>
                    {form.entryType === 'EXPENSE' && editingId === null && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: isShared ? '#1a7c4a' : '#5f6368' }}>
                        <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} style={{ width: '12px', height: '12px', accentColor: '#2e7d32', cursor: 'pointer' }} />
                        공용(÷2)
                      </label>
                    )}
                  </div>
                  <input type="text" inputMode="numeric" value={form.amountStr ?? ''} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, amountStr: e.target.value.replace(/[^0-9]/g, '') }))} style={inputStyle} />
                  {form.amountStr && Number(form.amountStr) > 0 && (
                    <span style={{ fontSize: '11px', color: isShared ? '#1a7c4a' : '#4BAAD4', marginTop: '3px', display: 'block', fontWeight: 600 }}>
                      {isShared ? `각 ${formatAmountKorean(Math.round(Number(form.amountStr) / 2))}` : `= ${formatAmountKorean(Number(form.amountStr))}`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 할부 — 카드 선택 + 지출 + 신규 등록 시에만 표시 */}
            {form.cardName && form.entryType === 'EXPENSE' && editingId === null && (
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#f0f8fd', borderRadius: '8px', border: '1px solid #c9e8f8' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: isInstallment ? '10px' : 0 }}>
                  <input type="checkbox" checked={isInstallment} onChange={e => setIsInstallment(e.target.checked)}
                    style={{ width: '14px', height: '14px', accentColor: '#4BAAD4', cursor: 'pointer' }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a3a5c' }}>💳 할부</span>
                </label>
                {isInstallment && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="number" min={2} max={36} value={installmentMonths}
                        onChange={e => setInstallmentMonths(Math.max(2, Math.min(36, Number(e.target.value))))}
                        style={{ ...inputStyle, width: '64px', textAlign: 'center' }} />
                      <span style={{ fontSize: '13px', color: '#344054' }}>개월</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={isInterestFree} onChange={e => setIsInterestFree(e.target.checked)}
                        style={{ width: '14px', height: '14px', accentColor: '#4CAF50', cursor: 'pointer' }} />
                      <span style={{ fontSize: '13px', color: isInterestFree ? '#2e7d32' : '#5f6368', fontWeight: isInterestFree ? 700 : 400 }}>무이자</span>
                    </label>
                    {/* 월 납부금액 미리보기 */}
                    {form.amountStr && Number(form.amountStr) > 0 && (
                      <span style={{ fontSize: '12px', color: '#4BAAD4', fontWeight: 600 }}>
                        {isShared
                          ? `매달 각 ${formatAmountKorean(Math.round(Math.floor(Number(form.amountStr) / installmentMonths) / 2))}`
                          : `매달 ${formatAmountKorean(Math.floor(Number(form.amountStr) / installmentMonths))}`
                        }
                        {` × ${installmentMonths}개월`}
                        {isInterestFree && <span style={{ color: '#2e7d32', marginLeft: '4px' }}>무이자</span>}
                      </span>
                    )}
                  </div>
                )}
              </div>
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
                  {investTypesDB.map(t => <option key={t} value={t}>{t}</option>)}
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
            </>)}
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
          feItemCats={feItemCats}
          onClose={() => setFixedExpenseOpen(false)}
          onPaid={entry => { setEntries(prev => [entry, ...prev]); }}
        />
      )}
    </div>
  );
};

// ─── 하위 컴포넌트 ────────────────────────────────────────────

// ─── 지출처 분석 섹션 ────────────────────────────────────────────
type MerchantRow = { name: string; count: number; total: number };
type MerchantSort = 'count' | 'total';

const MerchantStatsSection: React.FC<{ rows: MerchantRow[] }> = ({ rows }) => {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<MerchantSort>('count');

  const sorted = [...rows].sort((a, b) => b[sort] - a[sort]);
  const maxVal = sorted[0]?.[sort] ?? 1;

  return (
    <div style={{ padding: '8px 20px 0', flexShrink: 0 }}>
      {/* 헤더 — 클릭으로 펼침/닫힘 */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', padding: '6px 0',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#344054' }}>
          🏪 지출처 분석
          <span style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 400, marginLeft: '6px' }}>
            {rows.length}곳
          </span>
        </span>
        <span style={{ fontSize: '11px', color: '#9aa0a6' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ marginTop: '8px' }}>
          {/* 정렬 토글 */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            {([['count', '빈도순'], ['total', '금액순']] as [MerchantSort, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setSort(val)}
                style={{
                  padding: '4px 12px', fontSize: '11px', fontWeight: sort === val ? 700 : 400,
                  borderRadius: '20px',
                  border: `1px solid ${sort === val ? '#4BAAD4' : '#dadce0'}`,
                  background: sort === val ? '#e0f0ff' : '#fff',
                  color: sort === val ? '#1a3a5c' : '#5f6368',
                  cursor: 'pointer',
                }}
              >{label}</button>
            ))}
          </div>

          {/* 지출처 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
            {sorted.map((row, i) => {
              const barPct = Math.round((row[sort] / maxVal) * 100);
              return (
                <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* 순위 */}
                  <span style={{ fontSize: '11px', color: '#9aa0a6', minWidth: '16px', textAlign: 'right', flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  {/* 지출처명 */}
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#344054', minWidth: '70px', flexShrink: 0 }}>
                    {row.name}
                  </span>
                  {/* 바 */}
                  <div style={{ flex: 1, background: '#f0f0f0', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${barPct}%`, height: '100%', borderRadius: '4px',
                      background: i === 0 ? '#4BAAD4' : i === 1 ? '#89CFF0' : '#b0d8f0',
                    }} />
                  </div>
                  {/* 빈도 + 금액 */}
                  <span style={{ fontSize: '11px', color: '#E06060', fontWeight: 700, minWidth: '28px', textAlign: 'right', flexShrink: 0 }}>
                    {row.count}회
                  </span>
                  <span style={{ fontSize: '11px', color: '#344054', minWidth: '72px', textAlign: 'right', flexShrink: 0 }}>
                    {formatAmountShort(row.total)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; amount: number; color: string; sign: string; subText?: string }> = ({ label, amount, color, sign, subText }) => (
  <div style={{
    flex: 1, background: '#fff', borderRadius: '12px',
    padding: '14px 16px', border: `1px solid ${color}30`,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '6px' }}>{label}</div>
    <div style={{ fontSize: '16px', fontWeight: 700, color }}>
      {sign}{formatAmountShort(Math.abs(amount))}
    </div>
    {subText && (
      <div style={{ fontSize: '10px', color: '#E06060', marginTop: '3px', fontWeight: 500 }}>{subText}</div>
    )}
  </div>
);

// ─── 달력 뷰 ─────────────────────────────────────────────────

type BulkRow = {
  key: number;
  entryType: 'INCOME' | 'EXPENSE';
  category: string;
  merchant: string;
  account: string;
  amountStr: string;
};

let _bulkKey = 0;
const mkBulkRow = (): BulkRow => ({
  key: _bulkKey++, entryType: 'EXPENSE', category: '', merchant: '', account: '', amountStr: '',
});

const CalendarView: React.FC<{
  yearMonth: string;
  entries: BudgetEntry[];
  selectedDate: string | null;
  onSelectDate: (d: string) => void;
  onEdit: (e: BudgetEntry) => void;
  onDelete: (e: BudgetEntry) => void;
  userId: string;
  onEntriesAdded: (newEntries: BudgetEntry[]) => void;
  paymentMethods: PaymentMethod[];
  incomeCats: { name: string; subcategories: string[] }[];
  varExpCats: string[];
}> = ({ yearMonth, entries, selectedDate, onSelectDate, onEdit, onDelete, userId, onEntriesAdded, paymentMethods, incomeCats, varExpCats }) => {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(4)) - 1;

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 날짜별 수입/지출 합산 맵
  const dayMap: Record<string, { income: number; expense: number }> = {};
  for (const e of entries) {
    if (!dayMap[e.entryDate]) dayMap[e.entryDate] = { income: 0, expense: 0 };
    if (e.entryType === 'INCOME') dayMap[e.entryDate].income += e.amount;
    else dayMap[e.entryDate].expense += e.amount;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
  const toDateStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const selectedEntries = selectedDate ? entries.filter(e => e.entryDate === selectedDate) : [];

  // 날짜 선택 시 상세 영역으로 자동 스크롤
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedDate && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedDate]);

  // 일괄 등록 폼 상태
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([mkBulkRow()]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // 날짜 변경 시 bulk form 초기화
  useEffect(() => {
    setShowBulkForm(false);
    setBulkRows([mkBulkRow()]);
  }, [selectedDate]);

  const updateBulkRow = (key: number, patch: Partial<BulkRow>) =>
    setBulkRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));

  const handleBulkSave = async () => {
    if (!selectedDate) return;
    const validRows = bulkRows.filter(r => r.category && r.amountStr && Number(r.amountStr.replace(/,/g, '')) > 0);
    if (validRows.length === 0) { alert('카테고리와 금액을 입력해주세요.'); return; }
    setBulkSaving(true);
    try {
      const payload = validRows.map(r => ({
        userId,
        yearMonth,
        entryDate: selectedDate,
        entryType: r.entryType,
        category: r.category,
        merchant: r.merchant || undefined,
        account: r.account || undefined,
        amount: Number(r.amountStr.replace(/,/g, '')),
        isFixed: false,
        isInvestment: false,
        subcategory: undefined as string | undefined,
        accountMain: undefined as string | undefined,
        investmentType: undefined as string | undefined,
        memo: undefined as string | undefined,
      }));
      const created = await bulkCreateBudgetEntries(payload);
      onEntriesAdded(created);
      setShowBulkForm(false);
      setBulkRows([mkBulkRow()]);
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setBulkSaving(false);
    }
  };

  const bulkInputStyle: React.CSSProperties = {
    padding: '5px 7px', fontSize: '12px', borderRadius: '6px',
    border: '1px solid #dadce0', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div>
      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '2px' }}>
        {DAY_LABELS.map((d, i) => (
          <div key={d} style={{
            textAlign: 'center', fontSize: '11px', fontWeight: 700,
            color: i === 0 ? '#E06060' : i === 6 ? '#4BAAD4' : '#5f6368',
            padding: '4px 0',
          }}>{d}</div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const dateStr = toDateStr(day);
          const data = dayMap[dateStr];
          const isSelected = selectedDate === dateStr;
          const isToday = dateStr === todayStr;
          const dow = (firstWeekday + day - 1) % 7;

          return (
            <div
              key={idx}
              onClick={() => onSelectDate(dateStr)}
              style={{
                background: isSelected ? '#e0f0ff' : '#fff',
                border: isSelected ? '1.5px solid #4BAAD4' : isToday ? '1.5px solid #89CFF0' : '1px solid #f0f0f0',
                borderRadius: '8px',
                padding: '5px 4px 6px',
                cursor: 'pointer',
                minHeight: '56px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              }}
            >
              <span style={{
                fontSize: '12px', fontWeight: isToday ? 800 : 600,
                color: dow === 0 ? '#E06060' : dow === 6 ? '#4BAAD4' : isSelected ? '#1a3a5c' : '#344054',
              }}>{day}</span>
              {data?.income ? (
                <span style={{ fontSize: '10px', color: '#4CAF50', fontWeight: 700, lineHeight: 1.2 }}>
                  +{formatAmountShort(data.income)}
                </span>
              ) : null}
              {data?.expense ? (
                <span style={{ fontSize: '10px', color: '#E06060', fontWeight: 700, lineHeight: 1.2 }}>
                  -{formatAmountShort(data.expense)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 선택된 날짜 상세 */}
      {selectedDate && (
        <div ref={detailRef} style={{ marginTop: '16px' }}>
          {/* 날짜 헤더 + 일괄 등록 버튼 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '8px', paddingBottom: '6px', borderBottom: '2px solid #e0f0ff',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c' }}>
              {Number(selectedDate.slice(5, 7))}월 {Number(selectedDate.slice(8))}일
              <span style={{ fontSize: '12px', color: '#9aa0a6', fontWeight: 400, marginLeft: '6px' }}>
                {selectedEntries.length}건
              </span>
            </span>
            <button
              onClick={() => setShowBulkForm(v => !v)}
              style={{
                padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                borderRadius: '20px', border: '1px solid #4BAAD4',
                background: showBulkForm ? '#e0f0ff' : '#fff',
                color: '#1a3a5c', cursor: 'pointer',
              }}
            >
              {showBulkForm ? '✕ 닫기' : '+ 일괄 등록'}
            </button>
          </div>

          {/* 일괄 등록 폼 */}
          {showBulkForm && (
            <div style={{
              background: '#f7fafd', border: '1px solid #e0f0ff', borderRadius: '10px',
              padding: '12px', marginBottom: '12px',
            }}>
              {/* 행 목록 */}
              {bulkRows.map((row) => {
                const cats = row.entryType === 'INCOME'
                  ? incomeCats.map((c: { name: string }) => c.name)
                  : varExpCats;
                return (
                  <div key={row.key} style={{ display: 'flex', gap: '4px', marginBottom: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* 수입/지출 토글 */}
                    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #dadce0', flexShrink: 0 }}>
                      {(['EXPENSE', 'INCOME'] as const).map(t => (
                        <button key={t} onClick={() => updateBulkRow(row.key, { entryType: t, category: '' })} style={{
                          padding: '5px 8px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
                          background: row.entryType === t ? (t === 'EXPENSE' ? '#E06060' : '#4CAF50') : '#fff',
                          color: row.entryType === t ? '#fff' : '#9aa0a6',
                        }}>
                          {t === 'EXPENSE' ? '지출' : '수입'}
                        </button>
                      ))}
                    </div>
                    {/* 카테고리 */}
                    <select
                      value={row.category}
                      onChange={e => updateBulkRow(row.key, { category: e.target.value })}
                      style={{ ...bulkInputStyle, flex: '1 1 90px', minWidth: '80px' }}
                    >
                      <option value="">카테고리</option>
                      {cats.map((c: string) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {/* 지출처 (지출만) */}
                    {row.entryType === 'EXPENSE' && (
                      <input
                        type="text"
                        placeholder="지출처"
                        value={row.merchant}
                        onChange={e => updateBulkRow(row.key, { merchant: e.target.value })}
                        style={{ ...bulkInputStyle, flex: '1 1 80px', minWidth: '70px' }}
                      />
                    )}
                    {/* 결제수단 */}
                    <select
                      value={row.account}
                      onChange={e => updateBulkRow(row.key, { account: e.target.value })}
                      style={{ ...bulkInputStyle, flex: '1 1 90px', minWidth: '80px' }}
                    >
                      <option value="">결제수단</option>
                      {(['통장', '카드'] as const).map(type => {
                        const group = paymentMethods.filter(p => p.type === type);
                        if (group.length === 0) return null;
                        return (
                          <optgroup key={type} label={type}>
                            {group.map(p => (
                              <option key={p.id} value={p.name}>{p.name}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                    {/* 금액 */}
                    <input
                      type="text" inputMode="numeric"
                      placeholder="금액(원)"
                      value={row.amountStr}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        updateBulkRow(row.key, { amountStr: raw });
                      }}
                      style={{ ...bulkInputStyle, flex: '1 1 80px', minWidth: '70px' }}
                    />
                    {/* 삭제 */}
                    {bulkRows.length > 1 && (
                      <button
                        onClick={() => setBulkRows(prev => prev.filter(r => r.key !== row.key))}
                        style={{ background: 'none', border: 'none', color: '#dadce0', cursor: 'pointer', fontSize: '16px', padding: '0 2px', flexShrink: 0 }}
                      >×</button>
                    )}
                  </div>
                );
              })}

              {/* 행 추가 + 저장 버튼 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <button
                  onClick={() => setBulkRows(prev => [...prev, mkBulkRow()])}
                  style={{
                    padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                    borderRadius: '20px', border: '1px solid #dadce0',
                    background: '#fff', color: '#5f6368', cursor: 'pointer',
                  }}
                >+ 행 추가</button>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => { setShowBulkForm(false); setBulkRows([mkBulkRow()]); }}
                    style={{
                      padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                      borderRadius: '20px', border: '1px solid #dadce0',
                      background: '#fff', color: '#5f6368', cursor: 'pointer',
                    }}
                  >취소</button>
                  <button
                    onClick={handleBulkSave}
                    disabled={bulkSaving}
                    style={{
                      padding: '5px 16px', fontSize: '12px', fontWeight: 700,
                      borderRadius: '20px', border: 'none', cursor: bulkSaving ? 'default' : 'pointer',
                      background: bulkSaving ? '#b0c4de' : '#4BAAD4', color: '#fff',
                    }}
                  >
                    {bulkSaving ? '저장 중…' : `일괄 저장 ${bulkRows.filter(r => r.category && r.amountStr).length}건`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 항목 목록 */}
          {selectedEntries.length === 0 && !showBulkForm ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#9aa0a6', fontSize: '13px' }}>
              이 날 기록이 없습니다. 일괄 등록으로 추가해보세요.
            </div>
          ) : (
            selectedEntries.map(e => (
              <EntryRow key={e.id} entry={e} onEdit={onEdit} onDelete={onDelete}
                myAccountNames={new Set(paymentMethods.map(p => p.name))}
                otherUserName={BUDGET_USERS.find(u => u.id !== userId)?.name}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

const EntryRow: React.FC<{
  entry: BudgetEntry;
  onEdit: (e: BudgetEntry) => void;
  onDelete: (e: BudgetEntry) => void;
  myAccountNames?: Set<string>; // 내 결제수단 이름 Set — 미포함 시 상대방 결제수단으로 표시
  otherUserName?: string;       // 상대방 이름 (예: '주해')
}> = ({ entry, onEdit, onDelete, myAccountNames, otherUserName }) => {
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
            {entry.isInvestment
              ? `투자(${entry.investmentType || entry.category || '기타'})`
              : `${entry.category}${entry.subcategory ? ` › ${entry.subcategory}` : ''}`}
          </span>
          {entry.isFixed && (
            <span style={{ fontSize: '10px', background: '#9C27B020', color: '#9C27B0', borderRadius: '4px', padding: '1px 5px' }}>고정</span>
          )}
          {entry.isInvestment && (
            <span style={{ fontSize: '10px', background: '#2196F320', color: '#2196F3', borderRadius: '4px', padding: '1px 5px' }}>투자</span>
          )}
          {entry.isTransfer && (
            <span style={{ fontSize: '10px', background: '#E3F2FD', color: '#1565c0', borderRadius: '4px', padding: '1px 5px' }}>이체</span>
          )}
        </div>
        {(entry.merchant || entry.accountMain || entry.account || entry.cardName || entry.memo) && (
          <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '2px' }}>
            {entry.merchant && <span style={{ color: '#5f6368', fontWeight: 600 }}>{entry.merchant}</span>}
            {entry.accountMain && <span>{entry.merchant ? ' · ' : ''}{entry.accountMain}</span>}
            {entry.account && (
              <>
                <span> › {entry.account}</span>
                {myAccountNames && !myAccountNames.has(entry.account) && otherUserName && (
                  <span style={{ marginLeft: '4px', fontSize: '10px', background: '#fce4ec', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: '4px', padding: '1px 5px' }}>
                    {otherUserName}
                  </span>
                )}
              </>
            )}
            {entry.cardName && (
              <>
                <span style={{
                  marginLeft: '4px', fontSize: '10px', background: '#fff3e0',
                  color: '#E65100', border: '1px solid #FFB74D',
                  borderRadius: '4px', padding: '1px 5px',
                }}>
                  💳 {entry.cardName}
                </span>
                {myAccountNames && !myAccountNames.has(entry.cardName) && otherUserName && (
                  <span style={{ marginLeft: '3px', fontSize: '10px', background: '#fce4ec', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: '4px', padding: '1px 5px' }}>
                    {otherUserName}
                  </span>
                )}
              </>
            )}
            {/* 할부 배지 — installment_seq/months DB 컬럼 기반 */}
            {entry.installmentSeq && entry.installmentMonths && (
              <span style={{
                marginLeft: '4px', fontSize: '10px',
                background: entry.isInterestFree ? '#E8F5E9' : '#EDE7F6',
                color: entry.isInterestFree ? '#2E7D32' : '#6A1B9A',
                border: `1px solid ${entry.isInterestFree ? '#A5D6A7' : '#CE93D8'}`,
                borderRadius: '4px', padding: '1px 5px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {entry.installmentSeq}/{entry.installmentMonths}{entry.isInterestFree ? ' 무이자' : ''}
              </span>
            )}
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
  billingDayStr: string;       // 결제일
  billingStartDayStr: string;  // 결산 시작일
  billingEndDayStr: string;    // 결산 종료일
};

const emptyPmForm = (): PmForm => ({
  name: '', type: '통장', accountMain: '', accountNumber: '', cardAlias: '',
  billingDayStr: '', billingStartDayStr: '', billingEndDayStr: '',
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
      billingStartDayStr: pm.billingStartDay ? String(pm.billingStartDay) : '',
      billingEndDayStr: pm.billingEndDay ? String(pm.billingEndDay) : '',
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
        billingStartDay: form.type === '카드' && form.billingStartDayStr ? Number(form.billingStartDayStr) : undefined,
        billingEndDay: form.type === '카드' && form.billingEndDayStr ? Number(form.billingEndDayStr) : undefined,
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
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>결산 시작일</label>
                <input type="number" min={1} max={31} value={form.billingStartDayStr}
                  onChange={e => setForm(f => ({ ...f, billingStartDayStr: e.target.value }))}
                  placeholder="예: 24" style={inputSt} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>결산 종료일</label>
                <input type="number" min={1} max={31} value={form.billingEndDayStr}
                  onChange={e => setForm(f => ({ ...f, billingEndDayStr: e.target.value }))}
                  placeholder="예: 23" style={inputSt} />
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

// ─── 공통코드 관리 모달 ────────────────────────────────────────

const CommonCodeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [codes, setCodes] = useState<CommonCode[]>([]);
  const [loading, setLoading] = useState(true);

  // 선택된 그룹 (공통코드)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // 그룹 추가 폼
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupCode, setNewGroupCode] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  // 상세코드 추가 폼
  const [showDetailForm, setShowDetailForm] = useState(false);
  const [newDetailCode, setNewDetailCode] = useState('');
  const [newDetailName, setNewDetailName] = useState('');
  const [newDetailSort, setNewDetailSort] = useState('0');

  // 인라인 수정 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingSort, setEditingSort] = useState('');

  useEffect(() => {
    getCommonCodes().then(data => {
      setCodes(data);
      if (data.length > 0) setSelectedGroup(data[0].commonCode);
    }).finally(() => setLoading(false));
  }, []);

  // 그룹 목록 (distinct)
  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    codes.forEach(c => { if (!seen.has(c.commonCode)) seen.set(c.commonCode, c.commonCodeName); });
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name }));
  }, [codes]);

  // 선택 그룹의 상세코드 목록
  const details = useMemo(() =>
    codes.filter(c => c.commonCode === selectedGroup),
    [codes, selectedGroup]
  );

  // 그룹 코드/명 확인 후 상세코드 추가 폼으로 전환 (그룹은 첫 상세코드 등록 시 함께 생성)
  const handleAddGroup = () => {
    const gc = newGroupCode.trim().toUpperCase();
    const gn = newGroupName.trim();
    if (!gc || !gn) return alert('공통코드와 공통코드명을 입력하세요.');
    setSelectedGroup(gc);
    setShowGroupForm(false);
    setShowDetailForm(true);
    setNewDetailCode('');
    setNewDetailName('');
    setNewDetailSort('0');
  };

  // 실제 그룹+첫 상세코드 함께 등록
  const handleAddDetail = async () => {
    const dc = newDetailCode.trim();
    const dn = newDetailName.trim();
    if (!dc || !dn) return alert('상세코드와 상세코드명을 입력하세요.');

    // 선택된 그룹 정보 조회
    const grp = groups.find(g => g.code === selectedGroup);
    const gc = grp?.code ?? newGroupCode.trim().toUpperCase();
    const gn = grp?.name ?? newGroupName.trim();
    if (!gc || !gn) return alert('공통코드명을 확인할 수 없습니다.');

    const created = await createCommonCode({
      common_code: gc,
      common_code_name: gn,
      detail_code: dc,
      detail_code_name: dn,
      sort_order: Number(newDetailSort) || 0,
    });
    invalidateCommonCodeCache(gc);
    setCodes(prev => [...prev, created]);
    setNewDetailCode('');
    setNewDetailName('');
    setNewDetailSort('0');
    setShowDetailForm(false);
    setNewGroupCode('');
    setNewGroupName('');
    setSelectedGroup(gc);
  };

  const handleEditSave = async (id: number) => {
    const dn = editingName.trim();
    if (!dn) return;
    const updated = await updateCommonCode(id, { detail_code_name: dn, sort_order: Number(editingSort) || 0 });
    invalidateCommonCodeCache(updated.commonCode);
    setCodes(prev => prev.map(c => c.id === id ? updated : c));
    setEditingId(null);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`'${name}' 상세코드를 삭제하시겠습니까?`)) return;
    await deleteCommonCode(id);
    invalidateCommonCodeCache(selectedGroup || undefined);
    setCodes(prev => prev.filter(c => c.id !== id));
  };

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: '13px', border: '1px solid #dadce0',
    borderRadius: '6px', outline: 'none', background: '#fff',
  };
  const btnStyle = (bg: string, color: string): React.CSSProperties => ({
    padding: '6px 12px', fontSize: '12px', fontWeight: 600,
    border: 'none', borderRadius: '6px', background: bg, color, cursor: 'pointer',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9500,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '820px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #e8ecf0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#1a3a5c' }}>공통코드 관리</div>
            <div style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '2px' }}>그룹(공통코드) 및 상세코드를 등록·수정·삭제합니다.</div>
          </div>
          <button onClick={onClose} style={{ fontSize: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#9aa0a6', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* 좌측: 그룹 목록 */}
          <div style={{
            width: '220px', flexShrink: 0, borderRight: '1px solid #e8ecf0',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368' }}>공통코드 그룹</span>
              <button onClick={() => { setShowGroupForm(v => !v); setShowDetailForm(false); }} style={btnStyle('#e8f5e9', '#2e7d32')}>+ 그룹</button>
            </div>

            {/* 그룹 추가 폼 */}
            {showGroupForm && (
              <div style={{ padding: '10px 12px', background: '#f8fffe', borderBottom: '1px solid #e8ecf0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input placeholder="그룹코드 (영문대문자)" value={newGroupCode}
                  onChange={e => setNewGroupCode(e.target.value.toUpperCase())}
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                <input placeholder="그룹명" value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleAddGroup} style={{ ...btnStyle('#1a3a5c', '#fff'), flex: 1 }}>다음 →</button>
                  <button onClick={() => setShowGroupForm(false)} style={{ ...btnStyle('#f0f0f0', '#5f6368'), flex: 1 }}>취소</button>
                </div>
              </div>
            )}

            {/* 그룹 목록 */}
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9aa0a6', fontSize: '13px' }}>로딩 중...</div>
            ) : groups.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9aa0a6', fontSize: '12px' }}>등록된 그룹이 없습니다.</div>
            ) : (
              groups.map(g => (
                <div key={g.code} onClick={() => { setSelectedGroup(g.code); setShowDetailForm(false); }}
                  style={{
                    padding: '10px 16px', cursor: 'pointer',
                    background: selectedGroup === g.code ? '#e8f0fe' : '#fff',
                    borderLeft: selectedGroup === g.code ? '3px solid #1565c0' : '3px solid transparent',
                    borderBottom: '1px solid #f5f5f5',
                  }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: selectedGroup === g.code ? '#1565c0' : '#344054' }}>{g.code}</div>
                  <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '1px' }}>{g.name}</div>
                </div>
              ))
            )}
          </div>

          {/* 우측: 상세코드 목록 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedGroup ? (
              <>
                {/* 상세코드 헤더 */}
                <div style={{
                  padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa',
                }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c' }}>{selectedGroup}</span>
                    <span style={{ fontSize: '12px', color: '#9aa0a6', marginLeft: '8px' }}>
                      {groups.find(g => g.code === selectedGroup)?.name ?? newGroupName}
                    </span>
                  </div>
                  <button onClick={() => { setShowDetailForm(v => !v); setNewDetailCode(''); setNewDetailName(''); setNewDetailSort('0'); }}
                    style={btnStyle('#e8f0fe', '#1565c0')}>+ 상세코드</button>
                </div>

                {/* 상세코드 추가 폼 */}
                {showDetailForm && (
                  <div style={{ padding: '10px 16px', background: '#f0f8ff', borderBottom: '1px solid #e8ecf0', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>상세코드</label>
                      <input placeholder="예: HOUSING" value={newDetailCode}
                        onChange={e => setNewDetailCode(e.target.value.toUpperCase())}
                        style={{ ...inputStyle, width: '140px' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>상세코드명</label>
                      <input placeholder="예: 주거비" value={newDetailName}
                        onChange={e => setNewDetailName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddDetail()}
                        style={{ ...inputStyle, width: '150px' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>정렬</label>
                      <input type="number" placeholder="0" value={newDetailSort}
                        onChange={e => setNewDetailSort(e.target.value)}
                        style={{ ...inputStyle, width: '60px' }} />
                    </div>
                    <button onClick={handleAddDetail} style={btnStyle('#1a3a5c', '#fff')}>등록</button>
                    <button onClick={() => setShowDetailForm(false)} style={btnStyle('#f0f0f0', '#5f6368')}>취소</button>
                  </div>
                )}

                {/* 상세코드 테이블 헤더 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 2fr 60px 80px',
                  padding: '8px 16px', fontSize: '11px', fontWeight: 700,
                  color: '#fff', background: '#1a3a5c',
                }}>
                  <span>상세코드</span>
                  <span>상세코드명</span>
                  <span style={{ textAlign: 'center' }}>정렬</span>
                  <span style={{ textAlign: 'center' }}>액션</span>
                </div>

                {/* 상세코드 행 목록 */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {details.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#9aa0a6', fontSize: '13px' }}>
                      상세코드가 없습니다. "+ 상세코드" 버튼으로 추가하세요.
                    </div>
                  ) : (
                    details.map((d, i) => (
                      <div key={d.id} style={{
                        display: 'grid', gridTemplateColumns: '1fr 2fr 60px 80px',
                        padding: '10px 16px', fontSize: '13px', alignItems: 'center',
                        background: i % 2 === 0 ? '#fff' : '#fafafa',
                        borderBottom: '1px solid #f0f0f0',
                      }}>
                        <span style={{ fontWeight: 600, color: '#344054', fontFamily: 'monospace', fontSize: '12px' }}>{d.detailCode}</span>

                        {editingId === d.id ? (
                          <>
                            <input value={editingName} onChange={e => setEditingName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleEditSave(d.id); if (e.key === 'Escape') setEditingId(null); }}
                              style={{ ...inputStyle, padding: '4px 8px' }} autoFocus />
                            <input type="number" value={editingSort} onChange={e => setEditingSort(e.target.value)}
                              style={{ ...inputStyle, padding: '4px 6px', textAlign: 'center' }} />
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button onClick={() => handleEditSave(d.id)} style={btnStyle('#1a3a5c', '#fff')}>저장</button>
                              <button onClick={() => setEditingId(null)} style={btnStyle('#f0f0f0', '#5f6368')}>취소</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span style={{ color: '#344054' }}>{d.detailCodeName}</span>
                            <span style={{ textAlign: 'center', color: '#9aa0a6', fontSize: '12px' }}>{d.sortOrder}</span>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button onClick={() => { setEditingId(d.id); setEditingName(d.detailCodeName); setEditingSort(String(d.sortOrder)); }}
                                style={{ padding: '3px 8px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '5px', background: '#fff', cursor: 'pointer' }}>✏</button>
                              <button onClick={() => handleDelete(d.id, d.detailCodeName)}
                                style={{ padding: '3px 8px', fontSize: '12px', border: '1px solid #fecaca', borderRadius: '5px', background: '#fff', color: '#E06060', cursor: 'pointer' }}>×</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa0a6', fontSize: '13px' }}>
                좌측에서 그룹을 선택하세요.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── 시장 리포트 뷰 (AIReportView 내 서브탭으로 표시) ──────────

// 티커 그룹 정의 (화면 표시용) — accent: 섹션 헤더 및 카드 왼쪽 테두리 색상
// 기준금리 → 채권 → 증시 순서, vix는 별도 공포/변동성 섹션에서 F&G와 함께 표시
const TICKER_GROUPS = [
  { label: '기준금리',      keys: ['rate_us', 'rate_kr', 'rate_jp'],  accent: '#3b7dd8' },
  { label: '미국 채권',     keys: ['us10y', 'us30y', 'us3m'],         accent: '#2a9d8f' },
  { label: '미국 증시',     keys: ['sp500', 'nasdaq', 'dow'],          accent: '#40a060' },
  { label: '원자재',        keys: ['wti', 'gold'],                     accent: '#c8882a' },
  { label: '환율 / 달러',  keys: ['dxy', 'usdkrw', 'usdjpy'],         accent: '#d4704a' },
  { label: '한국 / 아시아', keys: ['kospi', 'kosdaq', 'nikkei'],       accent: '#c0404a' },
];

const MarketReportView: React.FC = () => {
  const isMobile = useIsMobile();
  const [reports, setReports] = useState<MarketReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingKr, setGeneratingKr] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [vixTipOpen, setVixTipOpen] = useState(false);
  // 상승 종목 테이블 접기/펼치기 (기본 접힘)
  const [gainersOpen, setGainersOpen] = useState<Record<string, boolean>>({});
  // 투자자 순매수 동향 뷰 토글 (table | chart)
  const [investorFlowView, setInvestorFlowView] = useState<'table' | 'chart'>('table');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getMarketReports();
      setReports(data);
      if (data.length > 0 && selectedId === null) setSelectedId(data[0].id);
    } catch (e: any) {
      // 네트워크 오류나 파싱 오류 시 에러 메시지 표시 (빈 목록으로 오인하지 않도록)
      setLoadError(e?.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 생성 요청 → 5초 폴링으로 완료 감지
  // 신규: id 변경 / 재생성(upsert): updatedAt 변경 둘 다 감지
  const handleGenerate = async () => {
    setGenerating(true);
    setToast('분석 요청 중…');
    try {
      await generateMarketReport();
      setToast('시장 데이터를 수집하고 분석 중입니다. 잠시 후 업데이트됩니다.');
      const prevTopId = reports.length > 0 ? reports[0].id : null;
      const prevTopUpdatedAt = reports.length > 0 ? reports[0].updatedAt : null;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const data = await getMarketReports();
        const isNew = data.length > 0 && (
          data[0].id !== prevTopId ||
          data[0].updatedAt !== prevTopUpdatedAt
        );
        if (isNew || tries >= 36) {
          clearInterval(poll);
          setReports(data);
          if (data.length > 0) setSelectedId(data[0].id);
          setGenerating(false);
          setToast(isNew ? '✅ 분석 완료!' : '⚠️ 시간 초과. 잠시 후 새로고침해주세요.');
          setTimeout(() => setToast(''), 4000);
        }
      }, 5000);
    } catch {
      setGenerating(false);
      setToast('❌ 요청에 실패했습니다.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleGenerateKrClose = async () => {
    setGeneratingKr(true);
    setToast('국내 장 마감 분석 요청 중…');
    try {
      await generateKrCloseReport();
      setToast('섹터 데이터를 수집하고 분석 중입니다. 잠시 후 업데이트됩니다.');
      const prevTopId = reports.length > 0 ? reports[0].id : null;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const data = await getMarketReports();
        const isNew = data.length > 0 && data[0].id !== prevTopId;
        if (isNew || tries >= 36) {
          clearInterval(poll);
          setReports(data);
          if (data.length > 0) setSelectedId(data[0].id);
          setGeneratingKr(false);
          setToast(isNew ? '✅ 국내장마감 분석 완료!' : '⚠️ 시간 초과. 잠시 후 새로고침해주세요.');
          setTimeout(() => setToast(''), 4000);
        }
      }, 5000);
    } catch {
      setGeneratingKr(false);
      setToast('❌ 요청에 실패했습니다.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleDelete = async () => {
    if (selectedId === null) return;
    const target = reports.find(r => r.id === selectedId);
    if (!window.confirm(`[${target?.reportDate}] 리포트를 삭제할까요?`)) return;
    try {
      await deleteMarketReport(selectedId);
      const next = reports.filter(r => r.id !== selectedId);
      setReports(next);
      setSelectedId(next.length > 0 ? next[0].id : null);
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  // 마크다운 → JSX (AIReportView와 동일 패턴)
  // **bold** 및 [text](url) 마크다운을 JSX로 변환하는 인라인 렌더러
  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]*\]\([^)]+\))/g);
    return parts.map((p, j) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={j}>{p.slice(2, -2)}</strong>;
      const linkMatch = p.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
      if (linkMatch) return <a key={j} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#1a6fa0', textDecoration: 'underline' }}>{linkMatch[1]}</a>;
      return p;
    });
  };

  const renderContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('## ')) {
        return <h2 key={i} style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c', margin: '18px 0 8px', borderBottom: '2px solid #e0f0ff', paddingBottom: '4px' }}>{line.slice(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={i} style={{ fontSize: '13px', fontWeight: 700, color: '#344054', margin: '12px 0 5px' }}>{line.slice(4)}</h3>;
      }
      if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
        return <p key={i} style={{ fontWeight: 700, color: '#1a3a5c', margin: '8px 0 4px', fontSize: '13px' }}>{line.slice(2, -2)}</p>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const content = line.slice(2);
        // 뉴스 시사점 카드 패턴: [제목](url) → 시장영향
        const newsMatch = content.match(/^\[([^\]]*)\]\(([^)]+)\)\s*(?:→|->)\s*(.+)$/);
        if (newsMatch) {
          // Gemini가 [- 제목](url) 형식으로 줄 때 앞의 '- ' 제거
          const title = newsMatch[1].replace(/^[-·\s]+/, '').trim();
          const url = newsMatch[2];
          const impact = newsMatch[3];
          return (
            <div key={i} style={{
              background: '#f8fcff', border: '1px solid #dceefa',
              borderLeft: '3px solid #89CFF0', borderRadius: '8px',
              padding: '11px 14px', margin: '6px 0',
            }}>
              <div style={{ fontWeight: 700, color: '#1a3a5c', fontSize: '13px', marginBottom: '5px', lineHeight: '1.5' }}>
                {title}
              </div>
              <p style={{ fontSize: '12px', color: '#444', margin: '0 0 8px', lineHeight: '1.65' }}>
                {impact}
              </p>
              <a href={url} target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: '12px', color: '#4baad4', textDecoration: 'underline' }}>
                🔗 기사 보기
              </a>
            </div>
          );
        }
        // 일반 bullet
        return (
          <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
            <span style={{ color: '#89CFF0', flexShrink: 0 }}>•</span>
            <span>{renderInline(content)}</span>
          </div>
        );
      }
      if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />;
      return (
        <p key={i} style={{ fontSize: '13px', color: '#444', margin: '3px 0', lineHeight: '1.6' }}>
          {renderInline(line)}
        </p>
      );
    });
  };

  const selected = reports.find(r => r.id === selectedId);

  const formatKST = (iso: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // change_pct 양수=초록, 음수=빨강, 0=회색
  const changeColor = (v: number | null) => v == null ? '#9aa0a6' : v > 0 ? '#2e7d32' : v < 0 ? '#c62828' : '#9aa0a6';
  const changeSign = (v: number | null) => v == null ? '' : v > 0 ? '+' : '';

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>

      {/* 컨트롤 바 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {reports.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '10px', color: '#9aa0a6' }}>매일 오전 7시(글로벌) / 오후 4시(국내장마감) 자동 생성</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                value={selectedId ?? ''}
                onChange={e => setSelectedId(Number(e.target.value))}
                style={{ padding: '5px 10px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '8px', background: '#fff', color: '#344054', maxWidth: '280px' }}
              >
                {reports.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.reportType === 'kr_close' ? '🇰🇷' : r.reportType === 'premarket' ? '🌙' : '🌏'} {r.reportDate} · {formatKST(r.updatedAt ?? r.createdAt)}
                  </option>
                ))}
              </select>
              <button
                onClick={handleDelete}
                title="선택 리포트 삭제"
                style={{ padding: '5px 9px', fontSize: '13px', border: '1px solid #f5c6c6', borderRadius: '8px', background: '#fff5f5', color: '#c0392b', cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>
          </div>
        )}
        <button
          onClick={handleGenerate}
          disabled={generating || generatingKr}
          style={{
            padding: '6px 16px', fontSize: '13px', fontWeight: 600, border: 'none',
            borderRadius: '8px', cursor: (generating || generatingKr) ? 'default' : 'pointer',
            background: generating ? '#b0c4de' : '#89CFF0', color: '#fff',
          }}
        >
          {generating ? '생성 중…' : '🌏 글로벌 생성'}
        </button>
        <button
          onClick={handleGenerateKrClose}
          disabled={generating || generatingKr}
          style={{
            padding: '6px 16px', fontSize: '13px', fontWeight: 600, border: 'none',
            borderRadius: '8px', cursor: (generating || generatingKr) ? 'default' : 'pointer',
            background: generatingKr ? '#b0c4de' : '#e06060', color: '#fff',
          }}
        >
          {generatingKr ? '생성 중…' : '🇰🇷 장마감 생성'}
        </button>
        <button onClick={load} style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '8px', background: '#fff', cursor: 'pointer', color: '#5f6368' }}>↺</button>
      </div>

      {/* 본문 */}
      <div>
          {toast && (
            <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', padding: '10px 16px', marginBottom: '14px', fontSize: '13px', color: '#1b5e20' }}>
              {toast}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6' }}>불러오는 중…</div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#c0392b', fontSize: '14px' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
              <div>데이터를 불러오지 못했습니다.</div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#9aa0a6' }}>{loadError}</div>
              <button onClick={load} style={{ marginTop: '16px', padding: '8px 20px', background: '#89CFF0', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>다시 시도</button>
            </div>
          ) : reports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6', fontSize: '14px' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>📊</div>
              <div>아직 시장 리포트가 없어요.</div>
              <div style={{ marginTop: '8px', fontSize: '12px' }}><strong>✨ 즉시 생성</strong> 버튼으로 첫 번째 리포트를 만들어보세요.</div>
            </div>
          ) : selected ? (
            <div>
              {/* 시장 데이터 티커 그리드 */}
              {Object.keys(selected.marketData).length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  {TICKER_GROUPS.map((group) => {
                    // close가 null인 티커(NaN 소독 결과)는 카드 표시 제외
                    const tickers = group.keys.map(k => ({ key: k, data: selected.marketData[k] })).filter(t => t.data && t.data.close != null);
                    if (tickers.length === 0) return null;

                    // 섹션 헤더: 액센트 컬러 왼쪽 바 + 라벨
                    const sectionHeader = (label: string, accent: string) => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                        <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: accent, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#344054', letterSpacing: '0.3px' }}>{label}</span>
                      </div>
                    );

                    // 공통 카드 쉘: 흰 배경 + 그림자 + 액센트 왼쪽 테두리
                    const cardStyle = (accent: string): React.CSSProperties => ({
                      background: '#fff',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      border: '1px solid #dde4ed',
                      borderLeft: `3px solid ${accent}`,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
                    });

                    const tickerCard = (key: string, data: typeof tickers[0]['data']) => {
                      // rate_ 접두사: 기준금리 — close에 % 단위, 변화량은 pp로 표시
                      const isRate = key.startsWith('rate_');
                      return (
                        <div key={key} style={cardStyle(group.accent)}>
                          <div style={{ fontSize: '11px', color: '#7a8fa6', marginBottom: '2px' }}>{data.label}</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c' }}>
                            {data.close.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}{isRate ? '%' : ''}
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: changeColor(isRate ? data.change : data.changePct) }}>
                            {isRate ? (
                              data.change != null
                                ? <>{changeSign(data.change)}{data.change.toFixed(2)}<span style={{ fontSize: '10px', fontWeight: 400 }}>pp</span></>
                                : <span style={{ color: '#9aa0a6' }}>-</span>
                            ) : (
                              <>
                                {changeSign(data.changePct)}{data.changePct?.toFixed(2) ?? '-'}%
                                {data.change != null && (
                                  <span style={{ fontWeight: 400, marginLeft: '4px', color: changeColor(data.change) }}>
                                    ({changeSign(data.change)}{data.change.toLocaleString('ko-KR', { maximumFractionDigits: 4 })})
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          <div style={{ fontSize: '10px', color: '#b0bec5', marginTop: '2px' }}>{data.date}</div>
                        </div>
                      );
                    };

                    const FEAR_ACCENT = '#8e44ad';

                    return (
                      <React.Fragment key={group.label}>
                        <div style={{ marginBottom: '16px' }}>
                          {sectionHeader(group.label, group.accent)}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                            {tickers.map(({ key, data }) => tickerCard(key, data))}
                          </div>
                        </div>

                        {/* 미국 증시 다음에 공포/변동성 섹션 (VIX + F&G) 삽입 */}
                        {group.label === '미국 증시' && (
                          <div style={{ marginBottom: '16px' }}>
                            {sectionHeader('공포 / 변동성', FEAR_ACCENT)}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>

                              {/* VIX 카드 — 우측 상단 ℹ 툴팁 */}
                              {selected.marketData.vix?.close != null && (() => {
                                const vix = selected.marketData.vix!;
                                return (
                                  <div style={{ position: 'relative', ...cardStyle(FEAR_ACCENT) }}>
                                    {/* ⓘ 버튼: 탭/클릭으로 팝오버 토글 (모바일 hover 미지원 대응) */}
                                    <div style={{ position: 'absolute', top: '6px', right: '8px' }}>
                                      <div
                                        onClick={() => setVixTipOpen(v => !v)}
                                        style={{ fontSize: '12px', color: '#c0c8d0', cursor: 'pointer', userSelect: 'none', lineHeight: 1 }}
                                      >ⓘ</div>
                                      {vixTipOpen && (
                                        <div
                                          onClick={() => setVixTipOpen(false)}
                                          style={{ position: 'absolute', right: 0, top: '18px', zIndex: 99, background: '#1a3a5c', color: '#fff', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', lineHeight: '1.8', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
                                        >
                                          <div style={{ fontWeight: 700, marginBottom: '6px' }}>VIX 수준 해석</div>
                                          <div>20 미만 &nbsp;│ 안정적, 낮은 불안감</div>
                                          <div>30 이상 &nbsp;│ 불안감 증가, 높은 변동성</div>
                                          <div>40 이상 &nbsp;│ 극도 불안, 공포 지배</div>
                                          <div>60 이상 &nbsp;│ 극단적 시장 위기</div>
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#7a8fa6', marginBottom: '2px' }}>{vix.label}</div>
                                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c' }}>
                                      {vix.close.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                                    </div>
                                    <div style={{ fontSize: '12px', color: changeColor(vix.changePct), fontWeight: 600 }}>
                                      {changeSign(vix.changePct)}{vix.changePct?.toFixed(2) ?? '-'}%
                                      {vix.change != null && (
                                        <span style={{ fontWeight: 400, marginLeft: '4px', color: changeColor(vix.change) }}>
                                          ({changeSign(vix.change)}{vix.change.toLocaleString('ko-KR', { maximumFractionDigits: 4 })})
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#b0bec5', marginTop: '2px' }}>{vix.date}</div>
                                  </div>
                                );
                              })()}

                              {/* Fear & Greed 카드 — 미니 게이지 + 이전값 */}
                              {selected.fearGreed && (() => {
                                const fg = selected.fearGreed!;
                                const FG_LABEL: Record<string, { ko: string; emoji: string; color: string }> = {
                                  'Extreme Fear': { ko: '극도의 공포', emoji: '😱', color: '#c62828' },
                                  'Fear':         { ko: '공포',        emoji: '😟', color: '#e65100' },
                                  'Neutral':      { ko: '중립',        emoji: '😐', color: '#f9a825' },
                                  'Greed':        { ko: '탐욕',        emoji: '😊', color: '#558b2f' },
                                  'Extreme Greed':{ ko: '극도의 탐욕', emoji: '🤑', color: '#1b5e20' },
                                };
                                const info = FG_LABEL[fg.rating] ?? { ko: fg.rating, emoji: '📊', color: '#888' };
                                return (
                                  <div style={cardStyle(FEAR_ACCENT)}>
                                    <div style={{ fontSize: '11px', color: '#7a8fa6', marginBottom: '3px' }}>CNN Fear &amp; Greed</div>
                                    <div style={{ fontSize: '15px', fontWeight: 700, color: info.color }}>{info.emoji} {fg.score.toFixed(1)}</div>
                                    <div style={{ fontSize: '12px', color: info.color, fontWeight: 600, marginBottom: '5px' }}>{info.ko}</div>
                                    {/* 미니 게이지 */}
                                    <div style={{ position: 'relative', height: '5px', borderRadius: '3px',
                                      background: 'linear-gradient(to right, #c62828 0%, #e65100 25%, #f9a825 50%, #7cb342 75%, #1b5e20 100%)',
                                    }}>
                                      <div style={{
                                        position: 'absolute', top: '50%',
                                        left: `clamp(4px, ${fg.score}%, calc(100% - 4px))`,
                                        transform: 'translate(-50%, -50%)',
                                        width: '9px', height: '9px', borderRadius: '50%',
                                        background: info.color, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                      }} />
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#b0bec5', marginTop: '5px' }}>
                                      전일 {fg.previousClose.toFixed(1)} · 1주 {fg.previous1Week.toFixed(1)} · 1개월 {fg.previous1Month.toFixed(1)}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}

              {/* 섹터 등락률 + 주도주 — kr_close 리포트 전용 */}
              {selected.reportType === 'kr_close' && (selected.krSectors.length > 0 || selected.krTopGainers.length > 0) && (() => {
                const accent = '#c0404a';

                const SectionHeader = ({ label }: { label: string }) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: accent, flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#344054' }}>{label}</span>
                  </div>
                );

                const SectorTable = ({ title, items }: { title: string; items: KrSectorData[] }) => {
                  if (items.length === 0) return null;
                  const maxAbs = Math.max(...items.map(s => Math.abs(s.changePct)));
                  return (
                    <div style={{ marginBottom: '14px' }}>
                      <SectionHeader label={`${title} 섹터별 등락률`} />
                      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dde4ed', overflow: 'hidden' }}>
                        {items.map((s, i) => {
                          const isPos = s.changePct >= 0;
                          const barW = maxAbs > 0 ? Math.abs(s.changePct) / maxAbs * 100 : 0;
                          return (
                            <div key={i} style={{
                              display: 'grid', gridTemplateColumns: '1fr 60px 1fr',
                              alignItems: 'center', padding: '5px 12px',
                              borderBottom: i < items.length - 1 ? '1px solid #f0f4f8' : 'none',
                            }}>
                              <span style={{ fontSize: '12px', color: '#344054', fontWeight: 500 }}>{s.sector}</span>
                              <span style={{ fontSize: '12px', fontWeight: 700, textAlign: 'right', color: isPos ? '#2e7d32' : '#c62828' }}>
                                {isPos ? '+' : ''}{s.changePct.toFixed(2)}%
                              </span>
                              <div style={{ paddingLeft: '8px' }}>
                                <div style={{ height: '7px', borderRadius: '4px', width: `${barW}%`, background: isPos ? '#66bb6a' : '#ef5350', minWidth: barW > 0 ? '3px' : '0' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                };

                const GainerTable = ({ marketKey, title, items }: { marketKey: string; title: string; items: KrTopGainer[] }) => {
                  if (items.length === 0) return null;
                  const isOpen = !!gainersOpen[marketKey];
                  const toggle = () => setGainersOpen(prev => ({ ...prev, [marketKey]: !prev[marketKey] }));
                  return (
                    <div style={{ marginBottom: '14px' }}>
                      {/* 헤더 — 클릭으로 접기/펼치기 */}
                      <div
                        onClick={toggle}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '6px' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: accent, flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#344054' }}>{title} 상승률 상위 종목</span>
                          <span style={{ fontSize: '11px', color: '#9aa0a6' }}>({items.length}개)</span>
                        </div>
                        <span style={{ fontSize: '12px', color: '#9aa0a6', userSelect: 'none' }}>{isOpen ? '▲ 접기' : '▼ 펼치기'}</span>
                      </div>
                      {isOpen && (
                        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dde4ed', overflow: 'hidden' }}>
                          {/* 테이블 헤더 */}
                          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 70px 80px', alignItems: 'center', padding: '5px 12px', background: '#f8fafc', borderBottom: '1px solid #e8edf3' }}>
                            {['#', '종목명', '등락률', '종가'].map((h, i) => (
                              <span key={i} style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
                            ))}
                          </div>
                          {items.map((g, i) => {
                            const isPos = g.changePct >= 0;
                            return (
                              <div key={i} style={{
                                display: 'grid', gridTemplateColumns: '24px 1fr 70px 80px',
                                alignItems: 'center', padding: '6px 12px',
                                borderBottom: i < items.length - 1 ? '1px solid #f0f4f8' : 'none',
                              }}>
                                <span style={{ fontSize: '11px', color: '#b0bec5', fontWeight: 600 }}>{i + 1}</span>
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#1a3a5c' }}>{g.name}</div>
                                  <div style={{ fontSize: '10px', color: '#b0bec5' }}>{g.ticker}</div>
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', color: isPos ? '#2e7d32' : '#c62828' }}>
                                  {isPos ? '+' : ''}{g.changePct.toFixed(2)}%
                                </span>
                                <span style={{ fontSize: '12px', textAlign: 'right', color: '#344054' }}>
                                  {g.close != null ? g.close.toLocaleString() : '-'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                };

                const kospiSec    = selected.krSectors.filter(s => s.market === 'KOSPI');
                const kosdaqSec   = selected.krSectors.filter(s => s.market === 'KOSDAQ');
                const kospiGain   = selected.krTopGainers.filter(g => g.market === 'KOSPI');
                const kosdaqGain  = selected.krTopGainers.filter(g => g.market === 'KOSDAQ');

                return (
                  <div style={{ marginBottom: '20px' }}>
                    {/* KOSPI */}
                    {(kospiSec.length > 0 || kospiGain.length > 0) && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '10px', paddingBottom: '4px', borderBottom: '2px solid #fce4e4' }}>🇰🇷 KOSPI</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                          <SectorTable title="섹터" items={kospiSec} />
                          <GainerTable marketKey="KOSPI" title="주도주" items={kospiGain} />
                        </div>
                      </div>
                    )}
                    {/* KOSDAQ */}
                    {(kosdaqSec.length > 0 || kosdaqGain.length > 0) && (
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '10px', paddingBottom: '4px', borderBottom: '2px solid #fce4e4' }}>📊 KOSDAQ</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                          <SectorTable title="섹터" items={kosdaqSec} />
                          <GainerTable marketKey="KOSDAQ" title="주도주" items={kosdaqGain} />
                        </div>
                      </div>
                    )}
                    {/* 네이버 증권 바로가기 */}
                    <div style={{ marginTop: '12px', textAlign: 'right' }}>
                      <a
                        href="https://stock.naver.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          fontSize: '12px', color: '#03c75a', fontWeight: 600,
                          textDecoration: 'none', padding: '5px 12px',
                          border: '1px solid #03c75a', borderRadius: '20px',
                          background: '#f0fff7',
                        }}
                      >
                        <span style={{ fontSize: '14px' }}>N</span> 네이버 증권
                      </a>
                    </div>
                  </div>
                );
              })()}

              {/* 투자자별 순매수 동향 — kr_close 리포트 전용 */}
              {selected.reportType === 'kr_close' && selected.krInvestorFlow && selected.krInvestorFlow.length > 0 && (() => {
                const flow: KrInvestorDayFlow[] = selected.krInvestorFlow;
                // 표시할 투자자 컬럼 순서 (백엔드 key 기준)
                const COLS: { key: string; label: string }[] = [
                  { key: 'individual',    label: '개인' },
                  { key: 'foreign',       label: '외국인' },
                  { key: 'institution',   label: '기관계' },
                  { key: 'financial_inv', label: '금융투자' },
                  { key: 'insurance',     label: '보험' },
                  { key: 'trust_samo',    label: '투신사모' },
                  { key: 'bank',          label: '은행' },
                  { key: 'other_fin',     label: '기타금융' },
                  { key: 'pension',       label: '연기금' },
                  { key: 'other_corp',    label: '기타법인' },
                ];
                // 데이터가 있는 컬럼만 필터
                const activeCols = COLS.filter(c =>
                  flow.some(d => d.investors[c.key] !== undefined)
                );
                const fmtAmt = (v: number) => {
                  const abs = Math.abs(v);
                  const str = abs >= 10000
                    ? `${(abs / 10000).toFixed(1).replace(/\.0$/, '')}조`
                    : `${abs.toLocaleString()}억`;
                  return v >= 0 ? `+${str}` : `-${str}`;
                };
                const cellColor = (v: number) => v >= 0 ? '#1b5e20' : '#b71c1c';
                const cellBg    = (v: number) => v >= 0 ? '#f1f8f1' : '#fff5f5';
                // 날짜 포맷: YYYYMMDD → MM/DD
                const fmtDate = (d: string) => d.length === 8 ? `${d.slice(4, 6)}/${d.slice(6, 8)}` : d;

                // 그래프용 데이터: 날짜별 주요 투자자 순매수 (개인/외국인/기관계)
                const CHART_COLS = [
                  { key: 'individual', label: '개인',   color: '#4e79a7' },
                  { key: 'foreign',    label: '외국인', color: '#f28e2b' },
                  { key: 'institution', label: '기관계', color: '#59a14f' },
                ];
                const chartData = flow.map(day => {
                  const row: Record<string, string | number> = { date: fmtDate(day.date) };
                  CHART_COLS.forEach(c => {
                    row[c.key] = day.investors[c.key]?.diffHundredMillion ?? 0;
                  });
                  return row;
                });

                return (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                      <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: '#c0404a', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#344054' }}>KOSPI 투자자별 순매수 동향 (억원)</span>
                      <button
                        onClick={() => setInvestorFlowView(v => v === 'table' ? 'chart' : 'table')}
                        style={{
                          marginLeft: 'auto', fontSize: '11px', fontWeight: 600,
                          padding: '3px 10px', borderRadius: '14px', cursor: 'pointer',
                          border: '1px solid #89CFF0', color: investorFlowView === 'chart' ? '#fff' : '#1a3a5c',
                          background: investorFlowView === 'chart' ? '#89CFF0' : '#f0f8fd',
                        }}
                      >
                        {investorFlowView === 'chart' ? '표로 보기' : '그래프로 보기'}
                      </button>
                    </div>

                    {investorFlowView === 'table' ? (
                      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #dde4ed', background: '#fff' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '480px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e0e6ef' }}>
                              <th style={{ padding: '6px 10px', textAlign: 'left', color: '#9aa0a6', fontWeight: 600, whiteSpace: 'nowrap' }}>날짜</th>
                              {activeCols.map(c => (
                                <th key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: '#9aa0a6', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {flow.map((day, i) => (
                              <tr key={day.date} style={{ borderBottom: i < flow.length - 1 ? '1px solid #f0f4f8' : 'none' }}>
                                <td style={{ padding: '6px 10px', color: '#344054', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtDate(day.date)}</td>
                                {activeCols.map(c => {
                                  const inv = day.investors[c.key];
                                  const val = inv ? inv.diffHundredMillion : 0;
                                  return (
                                    <td key={c.key} style={{
                                      padding: '5px 8px', textAlign: 'right', fontWeight: 600,
                                      color: inv ? cellColor(val) : '#ccc',
                                      background: inv ? cellBg(val) : 'transparent',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {inv ? fmtAmt(val) : '-'}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dde4ed', padding: '12px 8px 8px 0' }}>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9aa0a6' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#9aa0a6' }} tickFormatter={(v: number) => `${(v / 1).toFixed(0)}`} />
                            <Tooltip
                              formatter={(value: number, name: string) => [fmtAmt(value), name]}
                              labelStyle={{ fontSize: 11, fontWeight: 700 }}
                              contentStyle={{ fontSize: 11 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={0} stroke="#aaa" strokeWidth={1} />
                            {CHART_COLS.map(c => (
                              <Bar key={c.key} dataKey={c.key} name={c.label} fill={c.color} radius={[3, 3, 0, 0]} maxBarSize={20} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Gemini 분석 본문 */}
              {selected.content && (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e0f0ff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e0f0ff' }}>
                    {selected.reportType === 'kr_close' ? '🇰🇷 국내장마감 분석' : selected.reportType === 'premarket' ? '🌙 미국장 프리마켓 브리핑' : '🌏 글로벌 시장 분석'} · {selected.reportDate}
                    {(selected.updatedAt ?? selected.createdAt) && (
                      <span style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 400, marginLeft: '10px' }}>{formatKST(selected.updatedAt ?? selected.createdAt)} 업데이트</span>
                    )}
                  </div>
                  <div>{renderContent(selected.content)}</div>
                </div>
              )}

            </div>
          ) : null}
      </div>
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
  const [showCommonCode, setShowCommonCode] = useState(false);

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

      {/* 하단 버튼 행 */}
      <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowCommonCode(true)}
          style={{
            padding: '10px 24px', fontSize: '13px', fontWeight: 600,
            border: '1.5px dashed #b0c4de', borderRadius: '10px',
            background: '#f8fafd', color: '#5f7fa0', cursor: 'pointer',
          }}
        >
          ⚙ 공통코드 관리
        </button>
      </div>

      {/* 공통코드 관리 모달 */}
      {showCommonCode && <CommonCodeModal onClose={() => setShowCommonCode(false)} />}
    </div>
  );
};

// ─── 통합 보기 뷰 ─────────────────────────────────────────────

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

// ─── 자산 관리 뷰 (스냅샷 기반) ──────────────────────────────────

type AssetSubTab = 'CURRENT' | 'HISTORY' | 'CHART';

const AssetView: React.FC = () => {
  const isMobile = useIsMobile();
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
  const [detailTarget, setDetailTarget] = useState<{ userId: string; assetType: string; userName: string; assetLabel: string; cellCode: string } | null>(null);
  // ASSET_CELL 공통코드 — 마운트 시 1회 조회, AssetDetailModal에 주입
  const [assetCellCodes, setAssetCellCodes] = useState<CommonCode[]>([]);

  useEffect(() => {
    getCommonCodes('ASSET_CELL').then(setAssetCellCodes);
  }, []);

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

  // USD 컬럼(미국주식·달러 현금) → KRW 환산, 그 외 원화 그대로
  const isUsdCol = (key: string) => ASSET_COLUMNS.find(c => c.key === key)?.isDollar === true;
  const toKrw = (assetType: string, amount: number) =>
    isUsdCol(assetType) ? Math.round(amount * exchangeRate) : amount;

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
    const isDollarCell = ASSET_COLUMNS.find(c => c.key === assetKey)?.isDollar === true;
    const amount = editValue
      .split(',')
      .map(s => Number(s.trim().replace(isDollarCell ? /[^0-9.]/g : /[^0-9]/g, '')) || 0)
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

  // ── 그래프 옵션 상태 ──────────────────────────────────────────────────
  const [chartMode, setChartMode] = useState<'USER' | 'LIQUIDITY'>('USER');
  // 제외할 자산 항목 키 (기본: 보증금·퇴직금·주택청약저축 — 변동이 적어 그래프 왜곡 유발)
  const [chartExcludeKeys, setChartExcludeKeys] = useState<Set<string>>(
    new Set(['보증금', '퇴직금', '주택청약저축'])
  );
  const toggleChartExclude = (key: string) =>
    setChartExcludeKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  // 유저별 모드에서 개인 라인 표시 여부 (false = 합산만)
  const [chartShowSplit, setChartShowSplit] = useState(true);

  // ── 차트 데이터 계산 — cellMap/dates를 직접 참조해 deps 명시 ──────────
  const chartDataByUser = useMemo(() => {
    const toKrwLocal = (assetType: string, amount: number) =>
      ASSET_COLUMNS.find(c => c.key === assetType)?.isDollar ? Math.round(amount * exchangeRate) : amount;
    const cols = ASSET_COLUMNS.filter(c => !chartExcludeKeys.has(c.key));
    const grandKrwLocal = (date: string, userId: string) =>
      cols.reduce((s, c) => s + toKrwLocal(c.key, cellMap[date]?.[userId]?.[c.key] ?? 0), 0);
    return [...dates].reverse().map(date => {
      const v0 = grandKrwLocal(date, u0.id);
      const v1 = grandKrwLocal(date, u1.id);
      const toUk = (v: number) => Math.round(v / 1e6) / 100;
      return {
        label: date.slice(5),
        fullDate: date,
        [u0.name]: toUk(v0),
        [u1.name]: toUk(v1),
        '합산': toUk(v0 + v1),
      };
    });
  }, [cellMap, dates, exchangeRate, u0, u1, chartExcludeKeys]);

  const chartDataByLiquidity = useMemo(() => {
    const toKrwLocal = (assetType: string, amount: number) =>
      ASSET_COLUMNS.find(c => c.key === assetType)?.isDollar ? Math.round(amount * exchangeRate) : amount;
    const getKrwLocal = (date: string, userId: string, key: string) =>
      toKrwLocal(key, cellMap[date]?.[userId]?.[key] ?? 0);
    const cols = ASSET_COLUMNS.filter(c => !chartExcludeKeys.has(c.key));
    return [...dates].reverse().map(date => {
      const toUk = (v: number) => Math.round(v / 1e6) / 100;
      const liquid = cols
        .filter(c => c.group === '즉시 사용 가능')
        .reduce((s, c) => s + BUDGET_USERS.reduce((us, u) => us + getKrwLocal(date, u.id, c.key), 0), 0);
      const illiquid = cols
        .filter(c => c.group === '즉시 사용 불가')
        .reduce((s, c) => s + BUDGET_USERS.reduce((us, u) => us + getKrwLocal(date, u.id, c.key), 0), 0);
      return {
        label: date.slice(5),
        fullDate: date,
        '즉시 사용 가능': toUk(liquid),
        '즉시 사용 불가': toUk(illiquid),
        '합산': toUk(liquid + illiquid),
      };
    });
  }, [cellMap, dates, exchangeRate, chartExcludeKeys]);

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
          {isMobile ? (
            /* 모바일: 합산 full width 상단, 동영/주해 나란히 하단 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              <div style={{ background: '#fff', borderRadius: '12px', padding: '12px 16px', border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '5px' }}>{`총 자산 합산 (${selectedDate})`}</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1a3a5c' }}>{gtSum === 0 ? '—' : formatAmount(gtSum)}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[{ label: u0.name, amount: gt0 }, { label: u1.name, amount: gt1 }].map(({ label, amount }) => (
                  <div key={label} style={{ flex: 1, background: '#fff', borderRadius: '12px', padding: '12px 16px', border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '5px' }}>{label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#1565c0' }}>{amount === 0 ? '—' : formatAmountKorean(amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
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
          )}

          {/* 유동성 비율 바 */}
          {gtSum > 0 && (
            <div style={{ display: 'flex', gap: isMobile ? '8px' : '6px', marginBottom: '12px' }}>
              {GROUPS.map(g => {
                const v = groupKrw(selectedDate, g, u0.id) + groupKrw(selectedDate, g, u1.id);
                if (v === 0) return null;
                const lc = ASSET_LIQUIDITY_COLORS[g];
                const pct = (v / gtSum * 100).toFixed(0);
                return isMobile ? (
                  /* 모바일: 균등 2칸, 세로 레이아웃으로 텍스트 깨짐 방지 */
                  <div key={g} style={{
                    flex: 1,
                    background: lc.bg, border: `1.5px solid ${lc.border}80`,
                    borderRadius: '10px', padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: '3px',
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: lc.text, whiteSpace: 'nowrap' }}>{g}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: lc.text }}>{formatAmountShort(v)}원</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: lc.border }}>{pct}%</span>
                  </div>
                ) : (
                  /* PC: 비율 비례 가로 바 */
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
            ✏️ 금액 셀 클릭하여 수정 · 미국주식·달러 현금은 USD($) 금액 입력
          </div>

          {/* 메인 테이블 */}
          <div style={{ overflowX: isMobile ? 'visible' : 'auto' }}>
          <div style={{ border: '1px solid #e8ecf0', borderRadius: '12px', overflow: 'hidden', minWidth: isMobile ? 'unset' : '360px' }}>
            <div style={{
              display: 'grid', ...COLS,
              padding: '10px 16px', fontSize: '12px', fontWeight: 700,
              background: '#1a3a5c', color: '#fff',
            }}>
              <span>자산 항목</span>
              <span style={{ textAlign: 'right' }}>{u0.name}</span>
              <span style={{ textAlign: 'right' }}>{u1.name}</span>
              <span style={{ textAlign: 'right' }}>{isMobile ? '합산' : '합산 (KRW)'}</span>
            </div>

            {GROUPS.map((group, gi) => {
              const cols = ASSET_COLUMNS.filter(c => c.group === group);
              const lc = ASSET_LIQUIDITY_COLORS[group];
              const sub0 = groupKrw(selectedDate, group, u0.id);
              const sub1 = groupKrw(selectedDate, group, u1.id);
              return (
                <React.Fragment key={group}>
                  {isMobile ? (
                    /* 모바일: 그룹명을 상단 타이틀 바로 표시 (4열 그리드 제거) */
                    <div style={{
                      padding: '6px 16px', fontSize: '11px', fontWeight: 800,
                      background: lc.bg, color: lc.text,
                      borderTop: gi > 0 ? '2px solid #e8ecf0' : 'none',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span>{group}</span>
                      <span style={{ fontWeight: 400, opacity: 0.7, fontSize: '10px' }}>금액 클릭 시 수정</span>
                    </div>
                  ) : (
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
                  )}

                  {cols.map(col => {
                    const isDollar = col.isDollar === true;
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
                        minHeight: '42px', overflow: 'hidden',
                      }}>
                        <div
                          title={col.label}
                          style={{
                            padding: isDollar ? '8px 16px' : '0 16px',
                            fontSize: '13px', color: '#344054',
                            /* 긴 항목명 말줄임 처리 */
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '42px',
                          }}
                        >
                          <span>{col.label}</span>
                          {isDollar && <span style={{ fontSize: '10px', color: '#9aa0a6', marginTop: '2px' }}>USD 입력 · 환율 {exchangeRate.toLocaleString()}원/$</span>}

                        </div>
                        <AssetCell
                          value={raw0} isEditing={isEdit0} editValue={editValue}
                          onStartEdit={() => startEdit(u0.id, col.key)}
                          onEditChange={setEditValue} onSave={saveEdit}
                          onCancel={() => setEditingCell(null)}
                          saving={saving} accentColor={lc.border}
                          isDollar={isDollar} exchangeRate={exchangeRate}
                          onDetailClick={() => setDetailTarget({ userId: u0.id, assetType: col.key, userName: u0.name, assetLabel: col.label, cellCode: buildAssetCellCode(col.codeKey, u0.id) })} />
                        <AssetCell
                          value={raw1} isEditing={isEdit1} editValue={editValue}
                          onStartEdit={() => startEdit(u1.id, col.key)}
                          onEditChange={setEditValue} onSave={saveEdit}
                          onCancel={() => setEditingCell(null)}
                          saving={saving} accentColor={lc.border}
                          isDollar={isDollar} exchangeRate={exchangeRate}
                          onDetailClick={() => setDetailTarget({ userId: u1.id, assetType: col.key, userName: u1.name, assetLabel: col.label, cellCode: buildAssetCellCode(col.codeKey, u1.id) })} />
                        <span style={{
                          padding: '0 16px', textAlign: 'right', fontSize: '13px', lineHeight: '42px',
                          fontWeight: 600, color: (krw0 + krw1) === 0 ? '#dadce0' : '#1a3a5c',
                        }}>
                          {(krw0 + krw1) === 0 ? '—' : formatAmountShort(krw0 + krw1)}
                        </span>
                      </div>
                    );
                  })}

                  {isMobile ? (
                    /* 모바일: 소계 레이블 + 합계를 한 줄, 개인별은 아래 */
                    <div style={{ padding: '8px 16px', background: lc.bg, color: lc.text }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>소계</span>
                        <span style={{ fontSize: '15px', fontWeight: 800 }}>
                          {(sub0 + sub1) ? formatAmountKorean(sub0 + sub1) : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '3px', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '11px', opacity: 0.8 }}>{u0.name} {sub0 ? formatAmountKorean(sub0) : '—'}</span>
                        <span style={{ fontSize: '11px', opacity: 0.8 }}>{u1.name} {sub1 ? formatAmountKorean(sub1) : '—'}</span>
                      </div>
                    </div>
                  ) : (
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
                  )}
                </React.Fragment>
              );
            })}

            {isMobile ? (
              /* 모바일: 총 자산 카드형 */
              <div style={{
                padding: '10px 16px', background: '#f0f8fd', color: '#1a3a5c',
                borderTop: '2px solid #89CFF060',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800 }}>총 자산</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px' }}>
                    {gtSum ? formatAmountKorean(gtSum) : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '12px', color: '#5f6368' }}>{u0.name} <b>{gt0 ? formatAmountKorean(gt0) : '—'}</b></span>
                  <span style={{ fontSize: '12px', color: '#5f6368' }}>{u1.name} <b>{gt1 ? formatAmountKorean(gt1) : '—'}</b></span>
                </div>
              </div>
            ) : (
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
                  {gtSum ? formatAmountKorean(gtSum) : '—'}
                </span>
              </div>
            )}
          </div>
          </div> {/* overflowX wrapper */}
        </>)}

        {/* ══ 이력 탭 ═══════════════════════════════════════════ */}
        {subTab === 'HISTORY' && (
          isMobile ? (
            /* 모바일: 카드형 이력 목록 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                const prevTotal = prevDate ? grandKrw(prevDate, u0.id) + grandKrw(prevDate, u1.id) : null;
                const diff = prevTotal !== null ? total - prevTotal : null;
                return (
                  <div key={date}
                    onClick={() => { setSelectedDate(date); setSubTab('CURRENT'); }}
                    style={{
                      background: '#fff', borderRadius: '10px', padding: '12px 16px',
                      border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1565c0' }}>{date}</span>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#1a3a5c' }}>{total ? formatAmountKorean(total) : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px', color: '#5f6368' }}>
                        {u0.name} <b style={{ color: '#344054' }}>{v0 ? formatAmountKorean(v0) : '—'}</b>
                        <span style={{ margin: '0 6px', color: '#ddd' }}>|</span>
                        {u1.name} <b style={{ color: '#344054' }}>{v1 ? formatAmountKorean(v1) : '—'}</b>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: diff === null ? '#9aa0a6' : diff >= 0 ? '#4CAF50' : '#E06060' }}>
                        {diff === null ? '—' : `${diff >= 0 ? '+' : '-'}${formatAmountKorean(Math.abs(diff))}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
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
                        {diff === null ? '—' : `${diff >= 0 ? '+' : '-'}${formatAmountKorean(Math.abs(diff))}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              </div> {/* minWidth wrapper */}
            </div>
          )
        )}

        {/* ══ 그래프 탭 ═════════════════════════════════════════ */}
        {subTab === 'CHART' && (
          <div>
            {/* 모드 토글 */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {([['USER', '유저별'], ['LIQUIDITY', '유동성별']] as ['USER' | 'LIQUIDITY', string][]).map(([m, label]) => (
                <button key={m} onClick={() => setChartMode(m)} style={{
                  padding: '6px 16px', fontSize: '12px', fontWeight: chartMode === m ? 700 : 400,
                  borderRadius: '20px', border: `1px solid ${chartMode === m ? '#89CFF0' : '#dadce0'}`,
                  background: chartMode === m ? '#89CFF0' : '#fff',
                  color: chartMode === m ? '#fff' : '#5f6368',
                  cursor: 'pointer',
                }}>{label}</button>
              ))}
              {/* 유저별 모드에서만: 합산만/개인+합산 토글 */}
              {chartMode === 'USER' && (
                <button onClick={() => setChartShowSplit(p => !p)} style={{
                  padding: '6px 16px', fontSize: '12px', fontWeight: chartShowSplit ? 400 : 700,
                  borderRadius: '20px', border: `1px solid ${chartShowSplit ? '#dadce0' : '#4CAF50'}`,
                  background: chartShowSplit ? '#fff' : '#4CAF50',
                  color: chartShowSplit ? '#5f6368' : '#fff',
                  cursor: 'pointer',
                }}>{chartShowSplit ? '합산만 보기' : '개인별 보기'}</button>
              )}
            </div>

            {/* 자산 항목 제외 토글 칩 */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#9aa0a6', marginRight: '2px' }}>제외:</span>
              {ASSET_COLUMNS.map(col => {
                const excluded = chartExcludeKeys.has(col.key);
                return (
                  <button key={col.key} onClick={() => toggleChartExclude(col.key)} style={{
                    padding: '3px 10px', fontSize: '11px',
                    borderRadius: '12px',
                    border: `1px solid ${excluded ? '#dadce0' : '#1565c0'}`,
                    background: excluded ? '#f5f5f5' : '#e8f0fe',
                    color: excluded ? '#aaa' : '#1565c0',
                    textDecoration: excluded ? 'line-through' : 'none',
                    cursor: 'pointer',
                  }}>{col.label}</button>
                );
              })}
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
                      formatter={(value: number, name: string) => [
                        // 차트값은 억 단위(소수)이므로 원화로 역산 후 한글 표기
                        formatAmountKorean(Math.round(value * 1e8)) || '0원',
                        name,
                      ]}
                      labelFormatter={label => `날짜: ${label}`}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {chartMode === 'USER' ? (<>
                      {chartShowSplit && <Line type="monotone" dataKey={u0.name} stroke="#1565c0" strokeWidth={2} dot={{ r: 4 }} />}
                      {chartShowSplit && <Line type="monotone" dataKey={u1.name} stroke="#E06060" strokeWidth={2} dot={{ r: 4 }} />}
                      <Line type="monotone" dataKey="합산" stroke="#4CAF50" strokeWidth={2.5} dot={{ r: 5 }} />
                    </>) : (<>
                      <Line type="monotone" dataKey="즉시 사용 가능" stroke="#4CAF50" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="즉시 사용 불가" stroke="#FF9800" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="합산" stroke="#1565c0" strokeWidth={2.5} dot={{ r: 5 }} />
                    </>)}
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ fontSize: '11px', color: '#9aa0a6', textAlign: 'right', marginTop: '8px' }}>
                  Y축: 억 단위 · 미국주식·달러 현금은 {exchangeRate.toLocaleString()}원/$ 환율 적용
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
        cellCode={detailTarget.cellCode}
        assetCellCodes={assetCellCodes}
        isDollar={ASSET_COLUMNS.find(c => c.key === detailTarget.assetType)?.isDollar}
        exchangeRate={exchangeRate}
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
  cellCode: string;          // 공통코드 복합키 — ASSET_CELL 그룹의 detail_code (예: STOCK_LDY)
  assetCellCodes: CommonCode[]; // 상위(AssetView)에서 1회 조회 후 주입 — 모달 열 때마다 재조회 방지
  isDollar?: boolean;        // true이면 USD 단위 입력·표시
  exchangeRate?: number;     // USD → KRW 환산 (isDollar=true 시 필수)
  onClose: () => void;
  onSaved: () => void;
}> = ({ snapshotDate, userId, assetType, userName, assetLabel, cellCode, assetCellCodes, isDollar, exchangeRate, onClose, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 이 셀의 편집 가능 항목 (원 단위 입력)
  const [cellItems, setCellItems] = useState<LocalDetail[]>([]);
  // 이 셀에 매핑된 공통코드 정보 (ASSET_CELL 그룹)
  const [cellCommonCode, setCellCommonCode] = useState<CommonCode | null>(null);

  useEffect(() => {
    // 세부 내역 조회 후 공통코드(상위 주입)와 머징
    getAssetSnapshotDetails(snapshotDate).then(detailData => {
      // 공통코드: ASSET_CELL 그룹에서 detail_code === cellCode 매칭
      const cc = assetCellCodes.find(c => c.detailCode === cellCode) ?? null;
      setCellCommonCode(cc);

      // 이 셀의 기존 저장 데이터
      const savedItems = detailData.filter(d => d.userId === userId && d.assetType === assetType);
      // accountName → 저장 데이터 맵 (금액 조회용)
      const savedMap = new Map(savedItems.map(d => [d.accountName, d]));

      if (cc?.detailCodeName) {
        // 공통코드 detail_code_name을 ','로 split → 템플릿 계좌명 목록
        const templateNames = cc.detailCodeName.split(',').map(n => n.trim()).filter(Boolean);

        // 템플릿 순서대로 행 생성, 기존 저장 금액이 있으면 매핑
        const templateItems: LocalDetail[] = templateNames.map(name => {
          const saved = savedMap.get(name);
          return {
            key: saved ? String(saved.id) : `new-${name}-${Date.now()}-${Math.random()}`,
            userId,
            assetType,
            accountName: name,
            amountStr: saved && saved.amount > 0 ? String(saved.amount) : '',
          };
        });

        // 템플릿에 없는 추가 저장 항목도 유지 (수동 추가분)
        const templateNameSet = new Set(templateNames);
        const extraItems: LocalDetail[] = savedItems
          .filter(d => !templateNameSet.has(d.accountName))
          .map(d => ({
            key: String(d.id),
            userId,
            assetType,
            accountName: d.accountName,
            amountStr: d.amount > 0 ? String(d.amount) : '',
          }));

        setCellItems([...templateItems, ...extraItems]);
      } else {
        // 공통코드 미등록 시 기존 방식 그대로
        setCellItems(
          savedItems.map(d => ({
            key: String(d.id),
            userId: d.userId,
            assetType: d.assetType,
            accountName: d.accountName,
            amountStr: d.amount > 0 ? String(d.amount) : '',
          }))
        );
      }

      setLoading(false);
    });
  }, [snapshotDate, userId, assetType, cellCode, assetCellCodes]);

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
      // 이 셀(userId+assetType)의 항목만 전송 — 백엔드가 해당 조합만 삭제·재삽입하므로
      // 다른 유저 데이터는 건드리지 않아 동시 저장 시 충돌 없음
      const thisPayload = cellItems
        .filter(i => Number(i.amountStr.replace(/,/g, '')) > 0)
        .map(i => ({
          userId: i.userId, assetType: i.assetType,
          accountName: i.accountName.trim(),
          amount: Number(i.amountStr.replace(/,/g, '')) || 0,
        }));
      await bulkSaveAssetSnapshotDetails(snapshotDate, userId, assetType, thisPayload);
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
            {/* 공통코드 표시 — ASSET_CELL 그룹에 등록된 경우에만 */}
            {cellCommonCode && (
              <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', background: '#e8f0fe', color: '#1565c0', borderRadius: '4px', padding: '1px 6px', fontWeight: 700 }}>
                  {cellCommonCode.detailCode}
                </span>
                <span style={{ fontSize: '11px', color: '#5f6368' }}>{cellCommonCode.detailCodeName}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6', lineHeight: 1 }}>×</button>
        </div>

        {/* 안내 */}
        <div style={{ padding: '7px 20px', background: '#f0f8fd', borderBottom: '1px solid #e8ecf0', flexShrink: 0, fontSize: '11px', color: '#4BAAD4' }}>
          금액 단위: <strong>{isDollar ? 'USD ($)' : '원'}</strong>
          {isDollar && exchangeRate && <span style={{ marginLeft: '6px', color: '#9aa0a6' }}>· 환율 {exchangeRate.toLocaleString()}원/$</span>}
          <span style={{ marginLeft: '6px' }}>· 저장 시 합산이 자산 현황에 자동 반영됩니다</span>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {isDollar && <span style={{ fontSize: '13px', color: '#5f6368', fontWeight: 600 }}>$</span>}
                      <input
                        type="text"
                        placeholder={isDollar ? '달러 금액' : '금액'}
                        value={item.amountStr}
                        onChange={e => updateItem(item.key, 'amountStr', e.target.value.replace(/[^0-9.]/g, ''))}
                        style={{ width: '110px', padding: '6px 10px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '6px', outline: 'none', textAlign: 'right' }}
                      />
                      {!isDollar && <span style={{ fontSize: '11px', color: '#9aa0a6', whiteSpace: 'nowrap' }}>원</span>}
                    </div>
                    {Number(item.amountStr) > 0 && isDollar && exchangeRate && (
                      <span style={{ fontSize: '10px', color: '#4BAAD4', fontWeight: 600 }}>
                        ≈ {formatAmountKorean(Math.round(Number(item.amountStr) * exchangeRate))}
                      </span>
                    )}
                    {Number(item.amountStr) > 0 && !isDollar && (
                      <span style={{ fontSize: '10px', color: '#4BAAD4', fontWeight: 600 }}>{formatAmountKorean(Number(item.amountStr))}</span>
                    )}
                  </div>
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
                  {isDollar ? (
                    <>
                      합계: ${total.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                      {exchangeRate && <span style={{ fontSize: '11px', color: '#5f6368', fontWeight: 400, marginLeft: '8px' }}>≈ {formatAmountKorean(Math.round(total * exchangeRate))}</span>}
                    </>
                  ) : (
                    <>합계: {total.toLocaleString('ko-KR')} 원</>
                  )}
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
    // USD: 소수점 허용 / 원화: 정수만
    const parts = isDollar
      ? editValue.split(',').map(s => Number(s.trim().replace(/[^0-9.]/g, '')) || 0)
      : editValue.split(',').map(s => Number(s.trim().replace(/[^0-9]/g, '')) || 0);
    const previewSum = parts.reduce((a, b) => a + b, 0);
    const showPreview = editValue.includes(',') && previewSum > 0;
    const krwPreview = isDollar && exchangeRate ? Math.round(previewSum * exchangeRate) : null;

    return (
      <div style={{ padding: '4px 8px' }}>
        <input
          type="text"
          value={editValue} autoFocus placeholder={isDollar ? '$금액' : '숫자, 숫자, ...'}
          onChange={e => onEditChange(e.target.value.replace(isDollar ? /[^0-9.,\s]/g : /[^0-9,\s]/g, ''))}
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
  feItemCats: string[];
  onClose: () => void;
  onPaid: (entry: BudgetEntry) => void;
}> = ({ userId, userName, yearMonth, paymentMethods, feItemCats, onClose, onPaid }) => {
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
    const amount = Number(editingAmountStr.replace(/,/g, '') || '0');
    if (editingAmountStr.trim() === '') { setEditingAmountId(null); return; }
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
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>금액 (원)</label>
                      <input value={form.amountStr} onChange={e => setForm(f => ({ ...f, amountStr: e.target.value.replace(/[^0-9]/g, '') }))}
                        placeholder="매달 변동 시 비워두기 가능" style={inputSt} />
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
                        value={feItemCats.includes(form.category) ? form.category : (form.category ? '__custom__' : '')}
                        onChange={e => {
                          if (e.target.value === '__custom__') return;
                          setForm(f => ({ ...f, category: e.target.value }));
                        }}
                        style={inputSt}
                      >
                        <option value="">선택 안 함</option>
                        {feItemCats.map(c => <option key={c} value={c}>{c}</option>)}
                        {form.category && !feItemCats.includes(form.category) && (
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
                        {/* 금액 클릭 시 인라인 편집 (모든 항목) */}
                        {editingAmountId === fe.id ? (
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
                            onClick={() => { setEditingAmountId(fe.id); setEditingAmountStr(String(fe.amount)); }}
                            style={{ cursor: 'text', borderBottom: '1px dashed #89CFF0' }}
                            title="클릭하여 금액 수정"
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

// ─── AI 재무 분석 탭 ─────────────────────────────────────────

const AIReportView: React.FC = () => {
  const isMobile = useIsMobile();
  // 서브탭: AI 재무분석 / 시장 리포트
  const [aiSubTab, setAiSubTab] = useState<'financial' | 'market'>('financial');

  const [reports, setReports] = useState<FinancialReportType[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  // 분석 기간 선택: false=직전 3개월(기본) / true=이번달 포함
  const [includeCurrentMonth, setIncludeCurrentMonth] = useState(false);

  // 리포트 목록 불러오기
  const load = async () => {
    setLoading(true);
    try {
      const data = await getFinancialReports();
      setReports(data);
      if (data.length > 0 && selectedId === null) setSelectedId(data[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // AI 분석 생성 요청 → 5초 간격 폴링으로 완료 감지 (새 id 등장 기준)
  const handleGenerate = async () => {
    setGenerating(true);
    setToast('분석 요청 중…');
    try {
      await generateFinancialReport(undefined, includeCurrentMonth);
      setToast('Gemini가 분석 중입니다. 잠시 후 자동으로 업데이트됩니다.');
      const prevTopId = reports.length > 0 ? reports[0].id : null;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const data = await getFinancialReports();
        const isNew = data.length > 0 && data[0].id !== prevTopId;
        if (isNew || tries >= 36) {
          clearInterval(poll);
          setReports(data);
          if (data.length > 0) setSelectedId(data[0].id);
          setGenerating(false);
          setToast(isNew ? '✅ 분석 완료!' : '⚠️ 분석 시간이 초과되었습니다. 잠시 후 새로고침해주세요.');
          setTimeout(() => setToast(''), 4000);
        }
      }, 5000);
    } catch {
      setGenerating(false);
      setToast('❌ 요청에 실패했습니다.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  // 마크다운 → 간단한 JSX 변환 (굵기·줄바꿈·헤더만 처리)
  const renderContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('## ')) {
        return <h2 key={i} style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c', margin: '20px 0 8px', borderBottom: '2px solid #e0f0ff', paddingBottom: '4px' }}>{line.slice(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={i} style={{ fontSize: '14px', fontWeight: 700, color: '#344054', margin: '14px 0 6px' }}>{line.slice(4)}</h3>;
      }
      if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
        return <p key={i} style={{ fontWeight: 700, color: '#1a3a5c', margin: '8px 0 4px', fontSize: '13px' }}>{line.slice(2, -2)}</p>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        // 인라인 **bold** 처리
        const parts = line.slice(2).split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
            <span style={{ color: '#89CFF0', flexShrink: 0 }}>•</span>
            <span>{parts.map((p, j) => p.startsWith('**') && p.endsWith('**')
              ? <strong key={j}>{p.slice(2, -2)}</strong>
              : p
            )}</span>
          </div>
        );
      }
      if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />;
      // 일반 텍스트 — 인라인 **bold** 처리
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} style={{ fontSize: '13px', color: '#444', margin: '3px 0', lineHeight: '1.6' }}>
          {parts.map((p, j) => p.startsWith('**') && p.endsWith('**')
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : p
          )}
        </p>
      );
    });
  };

  const selected = reports.find(r => r.id === selectedId);

  const formatMonth = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`;

  // ISO 문자열(UTC, 'Z' 포함) → 한국 시간 표시
  const formatKST = (iso: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 드롭다운 옵션 레이블: "2025년 8월 (8월 13일 오후 03:22)"
  const formatOptionLabel = (r: FinancialReportType) =>
    `${formatMonth(r.reportMonth)} · ${formatKST(r.createdAt)}`;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 40px' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>

        {/* ── 서브탭 */}
        <div style={{ display: 'flex', border: '1px solid #dadce0', borderRadius: '10px', overflow: 'hidden', marginBottom: '18px', alignSelf: 'flex-start', width: 'fit-content' }}>
          {([['financial', '🤖 AI 재무분석'], ['market', '📈 시장 리포트']] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setAiSubTab(tab)}
              style={{
                padding: '8px 20px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: aiSubTab === tab ? 700 : 400,
                background: aiSubTab === tab ? '#89CFF0' : '#fff',
                color: aiSubTab === tab ? '#fff' : '#5f6368',
              }}
            >{label}</button>
          ))}
        </div>

        {/* ── 시장 리포트 탭 */}
        {aiSubTab === 'market' && <MarketReportView />}

        {/* ── AI 재무분석 탭 */}
        {aiSubTab === 'financial' && <>

        {/* ── 컨트롤 바 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {/* 리포트 선택 — 요청 건별로 표시 */}
          {reports.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ fontSize: '10px', color: '#9aa0a6' }}>매월 25일 오전 9시 자동 생성</span>
              <select
                value={selectedId ?? ''}
                onChange={e => setSelectedId(Number(e.target.value))}
                style={{ padding: '5px 10px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '8px', background: '#fff', color: '#344054', maxWidth: isMobile ? '200px' : '320px' }}
              >
                {reports.map(r => (
                  <option key={r.id} value={r.id}>{formatOptionLabel(r)}</option>
                ))}
              </select>
            </div>
          )}
          {/* 분석 기간 토글 */}
          <div style={{ display: 'flex', border: '1px solid #dadce0', borderRadius: '8px', overflow: 'hidden', fontSize: '12px' }}>
            {([false, true] as const).map(val => (
              <button
                key={String(val)}
                onClick={() => setIncludeCurrentMonth(val)}
                style={{
                  padding: '5px 12px', border: 'none', cursor: 'pointer', fontWeight: includeCurrentMonth === val ? 700 : 400,
                  background: includeCurrentMonth === val ? '#89CFF0' : '#fff',
                  color: includeCurrentMonth === val ? '#fff' : '#5f6368',
                }}
              >
                {val ? '이번달 포함' : '직전 3개월'}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              marginLeft: 'auto', padding: '6px 16px', fontSize: '13px', fontWeight: 600,
              border: 'none', borderRadius: '8px', cursor: generating ? 'default' : 'pointer',
              background: generating ? '#b0c4de' : '#89CFF0', color: '#fff',
            }}
          >
            {generating ? '분석 중…' : '✨ 지금 분석'}
          </button>
          <button onClick={load} style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '8px', background: '#fff', cursor: 'pointer', color: '#5f6368' }}>↺</button>
        </div>

        {/* ── toast */}
        {toast && (
          <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', padding: '10px 16px', marginBottom: '14px', fontSize: '13px', color: '#1b5e20' }}>
            {toast}
          </div>
        )}

        {/* ── 본문 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6' }}>불러오는 중…</div>
        ) : reports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6', fontSize: '14px' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🤖</div>
            <div>아직 분석 리포트가 없어요.</div>
            <div style={{ marginTop: '8px', fontSize: '12px' }}>위의 <strong>✨ 지금 분석</strong> 버튼을 눌러 첫 번째 리포트를 생성해보세요!</div>
            <div style={{ marginTop: '6px', fontSize: '12px' }}>매달 25일 오전 9시에 자동으로 생성됩니다.</div>
          </div>
        ) : selected ? (
          <div style={{ background: '#fff', borderRadius: '12px', padding: isMobile ? '16px' : '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e0f0ff' }}>
            {/* 리포트 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #e0f0ff' }}>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c' }}>{formatMonth(selected.reportMonth)} 재무 분석</span>
                {selected.createdAt && (
                  <span style={{ fontSize: '11px', color: '#9aa0a6', marginLeft: '10px' }}>
                    {formatKST(selected.createdAt)} 생성
                  </span>
                )}
              </div>
            </div>
            {/* 리포트 본문 */}
            <div>{renderContent(selected.content)}</div>
          </div>
        ) : null}

        </> /* aiSubTab === 'financial' */}

      </div>
    </div>
  );
};

export default BudgetPage;
