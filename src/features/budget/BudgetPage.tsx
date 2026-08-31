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
  getCardSpendingByDate,
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
  getSharedAccountEntries,
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
  generatePremarketReport,
  deleteMarketReport,
  getScreeningReports,
  generateScreeningReport,
  getIntegratedReports,
  generateIntegratedReport,
  getTickerHistory,
  TickerHistoryPoint,
  analyzeCompany,
  getCompanyAnalysisReports,
  deleteCompanyAnalysisReport,
  CompanyAnalysisResult,
} from '../../services/api';
import { AssetSnapshotCell, AssetSnapshotDetail, BudgetEntry, CommonCode, FixedExpense, IntegratedReport, KrInvestorDayFlow, KrSectorData, KrTopGainer, MarketReport, PaymentMethod, ScreeningRankItem, ScreeningReport, ScreeningTopPick, formatAmount, formatAmountShort } from '../../types';
import UserSelectModal from './UserSelectModal';
import WorkoutTab from './WorkoutTab';
// ── 분리된 뷰 컴포넌트 임포트 (각 파일에서 default export)
import MarketReportView from './MarketReportView';
import { CommonCodeModal } from './MarketReportView';
import AccountManagementView, { SharedAccountSection } from './AccountManagementView';
import OverviewView from './OverviewView';
import AssetView from './AssetView';
import AIReportView from './AIReportView';

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

// ── 25일 사이클 정산 로직 ─────────────────────────────────────────
/** 정산 기준일: 매달 25일 */
const SETTLE_DAY = 25;

/** KST 로컬 날짜 포맷 (toISOString은 UTC 변환으로 KST 하루 밀림 방지) */
const fmtLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * entry_date를 25일 사이클 기준 yearMonth로 변환
 *   day >= 25 → 다음달 yearMonth (예: 8/26 → "202509")
 *   day <  25 → 같은달  yearMonth (예: 9/03 → "202509")
 * "202509" budget = Aug 25 ~ Sep 24 사이의 항목
 */
const toSettledYearMonth = (dateStr: string): string => {
  const day   = Number(dateStr.slice(8, 10));
  const year  = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7)); // 1-indexed
  if (day >= SETTLE_DAY) {
    // JS Date: month는 0-indexed → month(1-indexed) = 다음달(0-indexed)
    const next = new Date(year, month, 1);
    return `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}`;
  }
  return `${year}${String(month).padStart(2, '0')}`;
};

/** 카드 결산 기간 계산 — 시작일/종료일 모두 직접 설정
 * 예: startDay=24, endDay=23, yearMonth='202608' → { from:'2026-07-24', to:'2026-08-23', label:'7/24~8/23' }
 * 종료일이 시작일보다 크면 같은 달, 작으면 다음달 기준
 */
const getCardBillingPeriod = (billingStartDay: number, billingEndDay: number, yearMonth: string) => {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(4)); // 1-indexed
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // 해당 월의 실제 마지막 날짜로 clamp (31일 설정 시 30일짜리 월에서 다음달로 넘어가는 버그 방지)
  const clamp = (targetYear: number, targetMonth1: number, day: number) => {
    const lastDay = new Date(targetYear, targetMonth1, 0).getDate();
    return Math.min(day, lastDay);
  };

  let fromDate: Date;
  let toDate: Date;
  if (billingEndDay < billingStartDay) {
    // 전달~이번달 경계 결산 (예: 24일 시작 → 23일 종료)
    fromDate = new Date(year, month - 2, clamp(year, month - 1, billingStartDay));
    toDate   = new Date(year, month - 1, clamp(year, month,     billingEndDay));
  } else {
    // 당월 결산 (예: 1일~31일)
    fromDate = new Date(year, month - 1, clamp(year, month, billingStartDay));
    toDate   = new Date(year, month - 1, clamp(year, month, billingEndDay));
  }
  const label = `${fromDate.getMonth() + 1}/${fromDate.getDate()}~${toDate.getMonth() + 1}/${toDate.getDate()}`;
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

type Filter = 'ALL' | 'INCOME' | 'EXPENSE' | 'FIXED' | 'INVEST' | 'TRANSFER' | 'BANK_EXP' | 'CARD_SPEND';
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
  const [otherUserEntries, setOtherUserEntries] = useState<BudgetEntry[]>([]); // 상대방 항목 — 공용 통장 카드 합산용
  const [prevMonthEntries, setPrevMonthEntries] = useState<BudgetEntry[]>([]); // 카드 청구 기간 계산용 전달 항목
  const [nextMonthBoundary, setNextMonthBoundary] = useState<BudgetEntry[]>([]); // 다음달 yearMonth지만 이번달 날짜(day>=25)인 항목 — 목록 표시용
  const [calViewMode, setCalViewMode] = useState<'cycle' | 'calendar'>('cycle'); // '25일 사이클' vs '캘린더 월' 보기
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [accountFilter, setAccountFilter] = useState<string | null>(null); // 통장 단위 필터
  const [cardFilter, setCardFilter] = useState<string | null>(null);      // 카드 단위 필터
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('budget_tab') as Tab) || 'ENTRIES');
  useEffect(() => { sessionStorage.setItem('budget_tab', tab); }, [tab]);
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [showSumTooltip, setShowSumTooltip] = useState(false);
  // 공용 통장 클릭 시 양쪽 유저 내역을 보여주는 팝업 상태
  const [sharedPopup, setSharedPopup] = useState<{
    accName: string;
    loading: boolean;
    entries: BudgetEntry[];
  } | null>(null);
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
      const otherUserId = BUDGET_USERS.find(u => u.id !== userId)?.id ?? '';
      const [data, otherData] = await Promise.all([
        getBudgetEntries(userId, yearMonth),
        otherUserId ? getBudgetEntries(otherUserId, yearMonth) : Promise.resolve([]),
      ]);
      setEntries(data);
      setOtherUserEntries(otherData);
    } catch {
      setEntries([]);
      setOtherUserEntries([]);
    } finally {
      setLoading(false);
    }
  }, [userId, yearMonth]);

  useEffect(() => { load(); }, [load]);

  // ─── 전달 + 전전달 항목 로드 — 카드 결산 기간이 두 달에 걸칠 때 정확한 계산을 위해
  useEffect(() => {
    const year = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(4));
    const prevYm = toYearMonth(new Date(year, month - 2, 1));
    getBudgetEntries(userId, prevYm)
      .then(setPrevMonthEntries)
      .catch(() => setPrevMonthEntries([]));
  }, [userId, yearMonth]);

  // ─── nextMonthBoundary 로드 — 다음달 yearMonth 중 이번달 날짜(day>=25) 항목 조회
  // 25일 사이클에서 예를 들어 "202508" 화면일 때 8/25~8/31 항목은 DB에 yearMonth='202509'로 저장되지만
  // 이번달 달력 날짜에도 표시("다음달 정산" 배지)해야 하므로 미리 로드 — 현재 유저만 포함
  // (상대방 항목은 filtered/summary/paidCardNames 오염을 막기 위해 별도 상태로 관리)
  useEffect(() => {
    const year  = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(4));
    const nextYm = toYearMonth(new Date(year, month, 1)); // 다음달 yearMonth (month는 0-indexed이므로 month = 현재달)
    const calYear  = yearMonth.slice(0, 4);
    const calMonth = yearMonth.slice(4).padStart(2, '0');
    getBudgetEntries(userId, nextYm)
      .then(data => {
        // 이번달 달력 날짜(day>=25)인 항목만 boundary로 포함
        setNextMonthBoundary(data.filter(e => e.entryDate.startsWith(`${calYear}-${calMonth}-`)));
      })
      .catch(() => setNextMonthBoundary([]));
  }, [userId, yearMonth]);

  // ─── 월 이동 ─────────────────────────────────────────────────
  const moveMonth = (delta: number) => {
    const y = Number(yearMonth.slice(0, 4));
    const m = Number(yearMonth.slice(4)) + delta;
    const d = new Date(y, m - 1, 1);
    setYearMonth(toYearMonth(d));
  };

  // ─── 요약 계산 — 25일 사이클 기준 ─────────────────────────────
  const summary = useMemo(() => {
    // 이체 판정: isTransfer 플래그 또는 category='이체' (마이그레이션 이전 항목 대응)
    const isXfer    = (e: BudgetEntry) => e.isTransfer || e.category === '이체';
    // 카드 납부: 통장에서 카드값 갚는 출금 (totalExpense 집계에서 제외 — 카드 구매 시 이미 집계됨)
    const isCardPay = (e: BudgetEntry) => !!e.isCardPayment;
    // 카드 구매: cardName 있음 + 납부처리 아님 + 투자 아님
    const isCardSpend = (e: BudgetEntry) => !!e.cardName && !isCardPay(e) && !e.isInvestment;

    // calViewMode에 따라 집계 대상 결정
    const calYear  = yearMonth.slice(0, 4);
    const calMonth = yearMonth.slice(4).padStart(2, '0');
    const prefix   = `${calYear}-${calMonth}-`;
    const base = calViewMode === 'calendar'
      ? (() => {
          // 캘린더 월 모드: entries + nextMonthBoundary 중 이번달 날짜(prefix) 항목만, 중복 제거
          const all  = [...entries, ...nextMonthBoundary];
          const ids  = new Set<number>();
          return all.filter(e => e.entryDate.startsWith(prefix) && !ids.has(e.id) && ids.add(e.id));
        })()
      : entries; // 25일 사이클 모드: yearMonth=M 항목만 (boundary는 다음달 budget이므로 제외)

    const totalIncome  = base.filter(e => e.entryType === 'INCOME' && !isXfer(e)).reduce((s, e) => s + e.amount, 0);
    const totalInvest  = base.filter(e => e.isInvestment && !isXfer(e)).reduce((s, e) => s + e.amount, 0);

    // B = 통장 직접 지출 (cardName 없는 지출, 이체/투자/카드납부 제외)
    const bankDirectExp = base.filter(e =>
      e.entryType === 'EXPENSE' && !isXfer(e) && !e.isInvestment && !e.cardName && !isCardPay(e)
    ).reduce((s, e) => s + e.amount, 0);
    // P = 카드 납부 (isCardPayment=true — 통장에서 카드값 갚는 출금)
    const cardPayExp  = base.filter(e => isCardPay(e) && !isXfer(e)).reduce((s, e) => s + e.amount, 0);
    // C = 카드 구매 지출 (납부 처리 항목 제외)
    const cardSpendExp = base.filter(e => isCardSpend(e) && !isXfer(e)).reduce((s, e) => s + e.amount, 0);

    // 통장 지출 = B + P (실제 통장에서 나간 돈)
    const totalBank = bankDirectExp + cardPayExp;
    // 카드 지출 제외 잔액 = 수입 - 통장지출 - 투자 (실제 통장 현금 잔액)
    const balanceExCard  = totalIncome - totalBank - totalInvest;
    // 카드 지출 포함 잔액 = 수입 - B - C - 투자 (카드빚 포함 실질 잔액)
    const balanceIncCard = totalIncome - bankDirectExp - cardSpendExp - totalInvest;

    // 고정비/변동비 (통장 직접 지출 기준, 카드 납부 제외)
    const fixedExpense = base.filter(e =>
      e.entryType === 'EXPENSE' && e.isFixed && !isXfer(e) && !e.isInvestment && !e.cardName && !isCardPay(e)
    ).reduce((s, e) => s + e.amount, 0);
    const varExpense = base.filter(e =>
      e.entryType === 'EXPENSE' && !e.isFixed && !isXfer(e) && !e.isInvestment && !e.cardName && !isCardPay(e)
    ).reduce((s, e) => s + e.amount, 0);

    // 통장별 잔액 — 항상 25일 사이클 entries 기준 (calViewMode 무관)
    // 카드 구매는 cardName 키로 별도 집계 (통장 잔액에 즉시 미반영)
    const accountMap: Record<string, { income: number; expense: number }> = {};
    entries.forEach(e => {
      let key: string;
      if (isCardPay(e))    key = e.account || e.accountMain || '미분류'; // 납부 → 통장 출금
      else if (isCardSpend(e)) key = e.cardName!;                        // 카드 구매 → 카드명 키
      else                 key = e.account || e.accountMain || '미분류';
      if (!accountMap[key]) accountMap[key] = { income: 0, expense: 0 };
      if (e.entryType === 'INCOME') accountMap[key].income += e.amount;
      else accountMap[key].expense += e.amount;
    });

    return { totalIncome, totalBank, cardSpendExp, cardPayExp, totalInvest, balanceExCard, balanceIncCard, fixedExpense, varExpense, accountMap };
  }, [entries, nextMonthBoundary, calViewMode, yearMonth]);

  // ─── 필터링된 항목 ───────────────────────────────────────────
  const filtered = useMemo(() => {
    const isXfer = (e: BudgetEntry) => e.isTransfer || e.category === '이체';

    // ─ 목록 표시 기준: calViewMode에 따라 원본 pool 결정 ─────────
    const calYear2  = yearMonth.slice(0, 4);
    const calMonth2 = yearMonth.slice(4).padStart(2, '0');
    const prefix2   = `${calYear2}-${calMonth2}-`;
    let base: BudgetEntry[];
    if (calViewMode === 'calendar') {
      // 캘린더 월 모드: entries + nextMonthBoundary 중 이번달 날짜 항목만, 중복 제거
      const all  = [...entries, ...nextMonthBoundary];
      const ids  = new Set<number>();
      base = all.filter(e => e.entryDate.startsWith(prefix2) && !ids.has(e.id) && ids.add(e.id));
    } else {
      // 25일 사이클 모드: entries + nextMonthBoundary(이번달 날짜인 것) 합산
      // nextMonthBoundary는 다음달 yearMonth지만 이번달 날짜(day>=25)인 항목
      const cycleIds = new Set(entries.map(e => e.id));
      base = [...entries, ...nextMonthBoundary.filter(e => !cycleIds.has(e.id))];
    }

    // 카드 결산 기간이 설정된 카드 필터 활성 시 → 전달 항목 중 결산 시작일 이후 것도 합산
    if (cardFilter) {
      const pm = paymentMethods.find(p => p.name === cardFilter && p.type === '카드');
      if (pm?.billingStartDay && pm?.billingEndDay && prevMonthEntries.length > 0) {
        const { from } = getCardBillingPeriod(pm.billingStartDay, pm.billingEndDay, yearMonth);
        const prevInPeriod = prevMonthEntries.filter(e => e.entryDate >= from);
        // 중복 방지: 현재 pool의 ID와 겹치지 않는 것만 추가
        const currentIds = new Set(base.map(e => e.id));
        const toAdd = prevInPeriod.filter(e => !currentIds.has(e.id));
        if (toAdd.length > 0) base = [...toAdd, ...base];
      }
    }
    if (filter === 'TRANSFER') {
      base = base.filter(e => isXfer(e));
    } else {
      // 이체는 내 돈 이동이므로 수입/지출 목록에서 제외
      base = base.filter(e => !isXfer(e));
      if (filter === 'INCOME') base = base.filter(e => e.entryType === 'INCOME');
      else if (filter === 'EXPENSE') base = base.filter(e => e.entryType === 'EXPENSE');
      else if (filter === 'FIXED') base = base.filter(e => e.entryType === 'EXPENSE' && e.isFixed);
      else if (filter === 'INVEST') base = base.filter(e => e.isInvestment);
      else if (filter === 'BANK_EXP') base = base.filter(e =>
        e.entryType === 'EXPENSE' && !e.isInvestment && (e.isCardPayment || !e.cardName)
      );
      else if (filter === 'CARD_SPEND') base = base.filter(e =>
        e.entryType === 'EXPENSE' && !!e.cardName && !e.isCardPayment && !e.isInvestment
      );
    }
    if (categoryFilters.size > 0) base = base.filter(e => categoryFilters.has(e.category));
    // 통장 필터 — account(중분류) 또는 accountMain(대분류) 일치
    // accountMainFilter: 해당 pm의 accountMain값도 같이 매칭 (accountMain-only 수입 항목 포함)
    if (accountFilter === '__UNASSIGNED__') {
      // 미분류: 통장도 카드도 지정되지 않은 항목 (카드 지출은 카드 섹션에서 별도 표시)
      const bankAccounts = paymentMethods.filter(p => p.type === '통장');
      const bankNames = new Set([
        ...bankAccounts.map(p => p.name),
        ...bankAccounts.filter(p => p.accountMain).map(p => p.accountMain!),
      ]);
      const cardNamesSet = new Set(paymentMethods.filter(p => p.type === '카드').map(p => p.name));
      base = base.filter(e => {
        const key = e.account || e.accountMain || '';
        if (bankNames.has(key)) return false;
        if (e.cardName && cardNamesSet.has(e.cardName)) return false;
        if (!e.cardName && e.account && cardNamesSet.has(e.account)) return false; // 레거시 카드
        return true;
      });
    } else if (accountFilter) {
      const pm = paymentMethods.find(p => p.name === accountFilter);
      base = base.filter(e =>
        e.account === accountFilter ||
        e.accountMain === accountFilter ||
        (pm?.accountMain && (e.account === pm.accountMain || e.accountMain === pm.accountMain))
      );
    }
    // 카드 필터 — cardName 일치, 카드납부(isCardPayment) 항목은 제외 (통장 차감만 하므로 카드 지출 아님)
    if (cardFilter) {
      const cardNames = new Set(paymentMethods.filter(p => p.type === '카드').map(p => p.name));
      base = base.filter(e =>
        !e.isCardPayment && (
          e.cardName === cardFilter ||
          (!e.cardName && e.account === cardFilter && cardNames.has(cardFilter))
        )
      );
    }
    // entry_date DESC, id DESC 정렬 — nextMonthBoundary를 append하면 순서가 뒤섞이므로 항상 재정렬
    base.sort((a, b) => {
      if (b.entryDate !== a.entryDate) return b.entryDate < a.entryDate ? -1 : 1;
      return b.id - a.id;
    });
    return base;
  }, [entries, nextMonthBoundary, calViewMode, filter, categoryFilters, accountFilter, cardFilter, paymentMethods, prevMonthEntries, yearMonth]);

  // ─── 납부된 카드명 Set — 카드 구매 항목 목록에 납부완료 배지 표시용 ─
  const paidCardNames = useMemo(() => {
    const all = [...entries, ...nextMonthBoundary];
    return new Set(
      all.filter(e => e.isCardPayment).map(e => e.cardName).filter((n): n is string => !!n)
    );
  }, [entries, nextMonthBoundary]);

  // ─── 다음달 정산 항목 ID Set — 이번달 달력 날짜지만 다음달 yearMonth에 속하는 항목
  // EntryRow에서 "다음달 정산" 배지 표시에 사용
  const boundaryEntryIds = useMemo(
    () => new Set(nextMonthBoundary.map(e => e.id)),
    [nextMonthBoundary],
  );

  // ─── 전달 미납 카드 — 전달 카드 결산 기간 지출 중 이번달 납부 처리가 없는 카드 ─
  // 결산기간(billingStartDay~billingEndDay)이 설정된 카드는 날짜 기준으로 집계
  // ─── 전달 미납 카드 — 백엔드 entry_date 범위 직접 쿼리로 정확히 계산 ─
  const [unpaidPrevCards, setUnpaidPrevCards] = useState<{ name: string; amount: number }[]>([]);

  useEffect(() => {
    const cardPMs = paymentMethods.filter(p => p.type === '카드' && p.isActive);
    if (cardPMs.length === 0) { setUnpaidPrevCards([]); return; }

    const year  = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(4));
    const prevYm = toYearMonth(new Date(year, month - 2, 1));
    const prevYear  = Number(prevYm.slice(0, 4));
    const prevMonth = Number(prevYm.slice(4));
    // 전달 1일~말일 (결산 기간 미설정 카드 기본값)
    const prevFirst = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const lastDay   = new Date(prevYear, prevMonth, 0).getDate(); // 전달 말일
    const prevLast  = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    Promise.all(
      cardPMs.map(async pm => {
        const { from, to } = pm.billingStartDay && pm.billingEndDay
          ? getCardBillingPeriod(pm.billingStartDay, pm.billingEndDay, prevYm)
          : { from: prevFirst, to: prevLast };
        const amount = await getCardSpendingByDate(userId, pm.name, from, to);
        return { name: pm.name, amount };
      })
    ).then(results => {
      setUnpaidPrevCards(results.filter(r => r.amount > 0 && !paidCardNames.has(r.name)));
    }).catch(() => setUnpaidPrevCards([]));
  }, [userId, yearMonth, paymentMethods, paidCardNames]);

  // 카드 납부 처리 팝업 상태
  const [cardPayForm, setCardPayForm] = useState<{
    cardName: string; amount: number; date: string; account: string; accountMain: string;
  } | null>(null);

  // 카드 납부 처리 — isCardPayment=true 항목 생성
  const handleCardPayment = async () => {
    if (!cardPayForm) return;
    const { cardName, amount, date, account, accountMain } = cardPayForm;
    if (!account && !accountMain) { alert('납부 통장을 선택해주세요'); return; }
    const resolvedYearMonth = toSettledYearMonth(date);
    try {
      const entry = await createBudgetEntry({
        userId,
        yearMonth: resolvedYearMonth,
        entryDate: date,
        entryType: 'EXPENSE',
        category: '카드납부',
        cardName,
        accountMain: accountMain || undefined,
        account: account || undefined,
        amount,
        isFixed: false,
        isInvestment: false,
        isCardPayment: true,
        merchant: `${cardName} 납부`,
      });
      addToDisplay(entry);
      setCardPayForm(null);
    } catch { alert('납부 처리에 실패했습니다'); }
  };

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

  /**
   * 저장된 항목을 표시 목록에 추가 — yearMonth 기준으로 entries 또는 nextMonthBoundary에 분기
   * 25일 사이클에서 day>=25인 항목은 다음달 yearMonth로 저장되지만
   * 이번달 날짜(calMonth prefix 일치)이면 nextMonthBoundary에 포함해 현재 화면에 표시
   */
  const addToDisplay = (e: BudgetEntry) => {
    if (e.yearMonth === yearMonth) {
      setEntries(prev => [e, ...prev]);
    } else {
      // 다음달 yearMonth지만 이번달 달력 날짜(day>=25) → nextMonthBoundary에 추가
      const calY = yearMonth.slice(0, 4);
      const calM = yearMonth.slice(4).padStart(2, '0');
      if (e.entryDate.startsWith(`${calY}-${calM}-`)) {
        setNextMonthBoundary(prev => [e, ...prev]);
      }
      // 다른달 날짜인 경우는 현재 화면에 미표시 (별도 월로 이동 후 확인)
    }
  };

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
    // 25일 사이클 기준 yearMonth 결정 (day>=25 → 다음달)
    const resolvedYearMonth = toSettledYearMonth(entryDate);
    const label = `이체: ${transferFrom} → ${transferTo}`;
    const base = { userId, yearMonth: resolvedYearMonth, entryDate, isFixed: false, isInvestment: false, isTransfer: true, memo: form.memo || undefined };
    try {
      // 순차 생성: 출금 먼저 → 입금 생성 시 출금 id 참조 → 출금 PATCH로 입금 id 역참조
      const exp = await createBudgetEntry({ ...base, entryType: 'EXPENSE', category: '이체', account: transferFrom, amount, merchant: label });
      const inc = await createBudgetEntry({ ...base, entryType: 'INCOME',  category: '이체', account: transferTo,   amount, merchant: label, transferPairId: exp.id });
      const updatedExp = await updateBudgetEntry(exp.id, { transferPairId: inc.id });
      // 이체는 이체 상대 통장 간 이동 — cross-month boundary 표시 생략
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
    // yearMonth는 25일 사이클 기준 파생 (day>=25 → 다음달, 현재 탭 월과 무관하게 저장)
    const resolvedYearMonth = toSettledYearMonth(entryDate);
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
          setNextMonthBoundary(prev => prev.filter(e => e.id !== editingId));
        } else {
          setEntries(prev => prev.map(e => e.id === editingId ? updated : e));
          setNextMonthBoundary(prev => prev.map(e => e.id === editingId ? updated : e));
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
          // KST 로컬 날짜 포맷 (toISOString UTC 변환 방지) + 25일 사이클 yearMonth 적용
          const monthEntryDate = fmtLocalDate(d);
          const monthYearMonth = toSettledYearMonth(monthEntryDate);
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
        addToDisplay(created1);
      } else {
        // 일반 단건 저장
        const created = await createBudgetEntry({ ...basePayload, amount });
        addToDisplay(created);
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
        setNextMonthBoundary(prev => prev.filter(e => !deletedIds.has(e.id)));
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
          await deleteBudgetEntriesByGroup(entry.installmentGroupId);
          setEntries(prev => prev.filter(e => e.installmentGroupId !== entry.installmentGroupId));
          setNextMonthBoundary(prev => prev.filter(e => e.installmentGroupId !== entry.installmentGroupId));
        } else {
          await deleteBudgetEntry(entry.id);
          setEntries(prev => prev.filter(e => e.id !== entry.id));
          setNextMonthBoundary(prev => prev.filter(e => e.id !== entry.id));
        }
      } catch { alert('삭제에 실패했습니다'); }
      return;
    }
    if (!window.confirm(`"${entry.category}" 항목을 삭제할까요?`)) return;
    try {
      await deleteBudgetEntry(entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      setNextMonthBoundary(prev => prev.filter(e => e.id !== entry.id));
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
                {/* 25일 사이클 vs 캘린더 월 보기 토글 — 내역 탭에서만 */}
                {tab === 'ENTRIES' && (
                  <button
                    onClick={() => setCalViewMode(v => v === 'cycle' ? 'calendar' : 'cycle')}
                    style={{
                      fontSize: '11px', padding: '3px 7px', borderRadius: '12px', cursor: 'pointer',
                      background: calViewMode === 'calendar' ? '#89CFF0' : '#f0f4f8',
                      color: calViewMode === 'calendar' ? '#fff' : '#5c6e8a',
                      border: '1px solid #c8d8e4', fontWeight: 600, whiteSpace: 'nowrap',
                    }}
                  >{calViewMode === 'cycle' ? '25일 사이클' : '캘린더 월'}</button>
                )}
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
              {/* 25일 사이클 vs 캘린더 월 보기 토글 — 내역 탭에서만 */}
              {tab === 'ENTRIES' && (
                <button
                  onClick={() => setCalViewMode(v => v === 'cycle' ? 'calendar' : 'cycle')}
                  style={{
                    fontSize: '11px', padding: '3px 8px', borderRadius: '12px', cursor: 'pointer',
                    background: calViewMode === 'calendar' ? '#89CFF0' : '#f0f4f8',
                    color: calViewMode === 'calendar' ? '#fff' : '#5c6e8a',
                    border: '1px solid #c8d8e4', fontWeight: 600,
                  }}
                >{calViewMode === 'cycle' ? '25일 사이클' : '캘린더 월'}</button>
              )}
              {tab === 'ENTRIES' && <button onClick={openAdd} style={btnStyle('#89CFF0', '#fff')}>+ 추가</button>}
            </>}
          </div>
        )}
      </div>

      {/* ══ 내역 탭 ══════════════════════════════════════════ */}
      {tab === 'ENTRIES' && (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* ── 요약 카드 Row1: 수입 / 통장지출 / 카드지출 / 투자 */}
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <SummaryCard label="총 수입" amount={summary.totalIncome} color="#4CAF50" sign="+" />
          <SummaryCard
            label="통장 지출" amount={summary.totalBank} color="#E06060" sign="-"
            isActive={filter === 'BANK_EXP'}
            onClick={() => setFilter(f => f === 'BANK_EXP' ? 'ALL' : 'BANK_EXP')}
          />
          <SummaryCard
            label="카드 지출" amount={summary.cardSpendExp} color="#FF9800" sign="-"
            isActive={filter === 'CARD_SPEND'}
            onClick={() => setFilter(f => f === 'CARD_SPEND' ? 'ALL' : 'CARD_SPEND')}
          />
          <SummaryCard label="투자" amount={summary.totalInvest} color="#2196F3" sign="" />
        </div>

        {/* ── 잔액 카드: 카드 제외 잔액 (실제 통장) vs 카드 포함 잔액 (실질) */}
        <div style={{ padding: '8px 20px 0', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {/* 카드 지출 제외 잔액 — 실제 통장 현금 잔액 */}
          {(() => {
            const color = summary.balanceExCard >= 0 ? '#1565c0' : '#E06060';
            return (
              <div style={{
                flex: 1, minWidth: '120px',
                background: '#fff', border: `1px solid ${color}40`,
                borderRadius: '12px', padding: '14px 16px',
                boxShadow: `0 2px 8px ${color}20`,
              }}>
                <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '6px' }}>통장 잔액</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color }}>
                  {summary.balanceExCard < 0 ? '-' : ''}{formatAmountShort(Math.abs(summary.balanceExCard))}
                </div>
                <div style={{ fontSize: '10px', color: '#9aa0a6', marginTop: '3px' }}>수입 - 통장지출 - 투자</div>
              </div>
            );
          })()}
          {/* 카드 지출 포함 잔액 — 카드빚 포함 실질 잔액 */}
          {(() => {
            const color = summary.balanceIncCard >= 0 ? '#2e7d32' : '#E06060';
            return (
              <div style={{
                flex: 1, minWidth: '120px',
                background: '#fff', border: `1px solid ${color}40`,
                borderRadius: '12px', padding: '14px 16px',
                boxShadow: `0 2px 8px ${color}20`,
              }}>
                <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '6px' }}>실질 잔액</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color }}>
                  {summary.balanceIncCard < 0 ? '-' : ''}{formatAmountShort(Math.abs(summary.balanceIncCard))}
                </div>
                <div style={{ fontSize: '10px', color: '#9aa0a6', marginTop: '3px' }}>수입 - 통장지출 - 카드지출 - 투자</div>
              </div>
            );
          })()}
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
          // 공용 통장 중복 제거: 같은 이름이면 내 것 우선, 없으면 상대방 공용 PM 사용
          const bankAccounts = (() => {
            const seen = new Map<string, PaymentMethod>();
            paymentMethods.filter(p => p.type === '통장' && p.userId === userId).forEach(p => seen.set(p.name, p));
            paymentMethods.filter(p => p.type === '통장' && p.userId !== userId && p.isShared).forEach(p => {
              if (!seen.has(p.name)) seen.set(p.name, p);
            });
            return Array.from(seen.values());
          })();
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
                const AccountCard = ({ accName, opening, income, expense, dimmed = false, isSharedAccount = false }: {
                  accName: string; opening: number; income: number; expense: number;
                  dimmed?: boolean; isSharedAccount?: boolean;
                }) => {
                  const closing = opening + income - expense;
                  const isEditing = editingOpeningAccount === accName;
                  // 공용 통장: 클릭 시 양쪽 내역 팝업 / 일반 통장: 내역 필터링
                  const isSelected = !dimmed && !isSharedAccount && accountFilter === accName;
                  const handleCardClick = () => {
                    if (dimmed) return;
                    if (isSharedAccount) {
                      setSharedPopup({ accName, loading: true, entries: [] });
                      getSharedAccountEntries(accName, yearMonth)
                        .then(es => setSharedPopup(p => p ? { ...p, loading: false, entries: es } : null))
                        .catch(() => setSharedPopup(p => p ? { ...p, loading: false } : null));
                    } else {
                      setCardFilter(null);
                      setAccountFilter(prev => prev === accName ? null : accName);
                    }
                  };
                  return (
                    <div
                      onClick={handleCardClick}
                      style={{
                        background: isSelected ? '#e8f4fd' : (dimmed ? '#fafafa' : '#fff'),
                        border: `1px solid ${isSelected ? '#89CFF0' : isSharedAccount ? '#a8d8a8' : (dimmed ? '#e0e0e0' : '#e8ecf0')}`,
                        borderRadius: '10px', padding: '10px 14px', minWidth: '160px', fontSize: '12px',
                        cursor: dimmed ? 'default' : 'pointer',
                        boxShadow: isSelected ? '0 0 0 2px #89CFF080' : isSharedAccount ? '0 0 0 1px #a8d8a840' : 'none',
                        transition: 'all 0.15s',
                        position: 'relative',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: dimmed ? '#9aa0a6' : '#1a3a5c', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {isSharedAccount && <span style={{ fontSize: '9px', background: '#4CAF50', color: '#fff', padding: '1px 5px', borderRadius: '8px', fontWeight: 700, flexShrink: 0 }}>공용</span>}
                        {accName}
                      </div>
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
                        {isSharedAccount && <div style={{ fontSize: '10px', color: '#9aa0a6', marginTop: '2px' }}>클릭 → 동영·주해 전체 내역</div>}
                      </div>
                    </div>
                  );
                };

                // 공용 통장용 — 상대방 entries를 account/accountMain 키로 집계
                const otherAccountMap: Record<string, { income: number; expense: number }> = {};
                otherUserEntries.forEach(e => {
                  const key = e.account || e.accountMain || '미분류';
                  if (!otherAccountMap[key]) otherAccountMap[key] = { income: 0, expense: 0 };
                  if (e.entryType === 'INCOME') otherAccountMap[key].income += e.amount;
                  else otherAccountMap[key].expense += e.amount;
                });

                // 등록된 통장 카드 — pm.name(중분류) + pm.accountMain(대분류) 두 키 모두 합산
                // 공용 통장(isShared)은 상대방 항목도 합산
                const cards = bankAccounts.map(pm => {
                  const accName = pm.name;
                  const opening = openingBalances[accName] ?? 0;
                  const byName = summary.accountMap[accName] ?? { income: 0, expense: 0 };
                  const byMain = pm.accountMain && pm.accountMain !== accName
                    ? (summary.accountMap[pm.accountMain] ?? { income: 0, expense: 0 })
                    : { income: 0, expense: 0 };
                  // 공용 통장이면 상대방 contributions 추가
                  const otherByName = pm.isShared ? (otherAccountMap[accName] ?? { income: 0, expense: 0 }) : { income: 0, expense: 0 };
                  const otherByMain = pm.isShared && pm.accountMain && pm.accountMain !== accName
                    ? (otherAccountMap[pm.accountMain] ?? { income: 0, expense: 0 })
                    : { income: 0, expense: 0 };
                  return (
                    <AccountCard key={accName} accName={accName} opening={opening}
                      income={byName.income + byMain.income + otherByName.income + otherByMain.income}
                      expense={byName.expense + byMain.expense + otherByName.expense + otherByMain.expense}
                      isSharedAccount={pm.isShared} />
                  );
                });

                // 미분류 — 통장·카드 어느 것도 미해당 항목 (카드는 아래 카드 섹션에서 별도 표시)
                const bankNames = new Set([
                  ...bankAccounts.map(p => p.name),
                  ...bankAccounts.filter(p => p.accountMain).map(p => p.accountMain!),
                ]);
                const cardNamesSet = new Set(paymentMethods.filter(p => p.type === '카드').map(p => p.name));
                const unassigned = { income: 0, expense: 0 };
                entries.forEach(e => {
                  const key = e.account || e.accountMain || '';
                  if (bankNames.has(key)) return;                            // 통장 할당됨
                  if (e.cardName && cardNamesSet.has(e.cardName)) return;   // 카드 할당됨
                  if (!e.cardName && e.account && cardNamesSet.has(e.account)) return; // 레거시 카드
                  if (e.entryType === 'INCOME') unassigned.income += e.amount;
                  else unassigned.expense += e.amount;
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
                  <>
                  {/* 공용 통장 팝업 — 동영·주해 합산 내역 */}
                  {sharedPopup && (
                    <div
                      onClick={() => setSharedPopup(null)}
                      style={{
                        position: 'fixed', inset: 0, background: '#00000040', zIndex: 3000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          background: '#fff', borderRadius: '14px', padding: '20px',
                          width: '92%', maxWidth: '520px', maxHeight: '80vh',
                          display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px #00000030',
                        }}
                      >
                        {/* 팝업 헤더 */}
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
                          <span style={{ fontSize: '9px', background: '#4CAF50', color: '#fff', padding: '2px 7px', borderRadius: '8px', fontWeight: 700, marginRight: '8px' }}>공용</span>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', flex: 1 }}>{sharedPopup.accName}</span>
                          <span style={{ fontSize: '11px', color: '#9aa0a6', marginRight: '12px' }}>{yearMonth.slice(0,4)}.{yearMonth.slice(4)}</span>
                          <button
                            onClick={() => setSharedPopup(null)}
                            style={{ fontSize: '16px', color: '#9aa0a6', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                          >×</button>
                        </div>

                        {sharedPopup.loading ? (
                          <div style={{ textAlign: 'center', color: '#9aa0a6', padding: '30px 0', fontSize: '13px' }}>불러오는 중…</div>
                        ) : sharedPopup.entries.length === 0 ? (
                          <div style={{ textAlign: 'center', color: '#9aa0a6', padding: '30px 0', fontSize: '13px' }}>이 통장의 거래 내역이 없습니다.</div>
                        ) : (() => {
                          // 유저별 소계
                          const USER_LABELS: Record<string, string> = { ldy: '동영', juhae: '주해' };
                          const USER_COLORS: Record<string, string> = { ldy: '#1565c0', juhae: '#AD1457' };
                          const isXferE = (e: BudgetEntry) => e.isTransfer || e.category === '이체';
                          const byUser: Record<string, { xferIn: number; xferOut: number; expense: number }> = {};
                          sharedPopup.entries.forEach(e => {
                            if (!byUser[e.userId]) byUser[e.userId] = { xferIn: 0, xferOut: 0, expense: 0 };
                            if (isXferE(e) && e.entryType === 'INCOME') byUser[e.userId].xferIn += e.amount;
                            else if (isXferE(e) && e.entryType === 'EXPENSE') byUser[e.userId].xferOut += e.amount;
                            else if (!isXferE(e) && e.entryType === 'EXPENSE') byUser[e.userId].expense += e.amount;
                          });
                          return (
                            <>
                              {/* 유저별 소계 */}
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                {Object.entries(byUser).map(([uid, s]) => (
                                  <div key={uid} style={{
                                    flex: 1, minWidth: '120px', background: '#f8fafc',
                                    border: `1px solid ${USER_COLORS[uid] ?? '#ccc'}30`,
                                    borderRadius: '8px', padding: '8px 12px', fontSize: '11px',
                                  }}>
                                    <div style={{ fontWeight: 700, color: USER_COLORS[uid] ?? '#344054', marginBottom: '4px' }}>{USER_LABELS[uid] ?? uid}</div>
                                    {s.xferIn > 0 && <div><span style={{ color: '#9aa0a6' }}>이체입금 </span><span style={{ color: '#2e7d32', fontWeight: 600 }}>+{formatAmountShort(s.xferIn)}</span></div>}
                                    {s.xferOut > 0 && <div><span style={{ color: '#9aa0a6' }}>이체출금 </span><span style={{ color: '#e65100', fontWeight: 600 }}>-{formatAmountShort(s.xferOut)}</span></div>}
                                    {s.expense > 0 && <div><span style={{ color: '#9aa0a6' }}>지출 </span><span style={{ color: '#E06060', fontWeight: 600 }}>-{formatAmountShort(s.expense)}</span></div>}
                                  </div>
                                ))}
                              </div>
                              {/* 전체 내역 목록 — 이체 포함 날짜 내림차순 */}
                              <div style={{ overflowY: 'auto', flex: 1, borderTop: '1px solid #f0f4f8' }}>
                                {[...sharedPopup.entries]
                                  .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.id - a.id)
                                  .map(e => {
                                  const isXfer = isXferE(e);
                                  const isIncome = e.entryType === 'INCOME';
                                  const uid = e.userId;
                                  const userColor = USER_COLORS[uid] ?? '#344054';
                                  const userLabel = USER_LABELS[uid] ?? uid;
                                  return (
                                    <div key={e.id} style={{
                                      display: 'flex', alignItems: 'center', gap: '8px',
                                      padding: '8px 4px', borderBottom: '1px solid #f5f5f5', fontSize: '12px',
                                      background: isXfer ? (isIncome ? '#f0fff4' : '#fff8f0') : '#fff',
                                    }}>
                                      <span style={{ color: '#9aa0a6', fontSize: '11px', minWidth: '38px', flexShrink: 0 }}>{e.entryDate.slice(5)}</span>
                                      <span style={{
                                        fontSize: '9px', padding: '1px 5px', borderRadius: '8px', fontWeight: 700,
                                        background: `${userColor}18`, color: userColor, flexShrink: 0,
                                      }}>{userLabel}</span>
                                      {isXfer && (
                                        <span style={{
                                          fontSize: '9px', padding: '1px 5px', borderRadius: '8px', fontWeight: 700,
                                          background: isIncome ? '#e8f5e9' : '#fff3e0',
                                          color: isIncome ? '#2e7d32' : '#e65100', flexShrink: 0,
                                        }}>{isIncome ? '↓ 이체입금' : '↑ 이체출금'}</span>
                                      )}
                                      <span style={{ flex: 1, color: '#344054', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {isXfer ? (e.merchant || '이체') : `${e.category}${e.merchant ? ` · ${e.merchant}` : ''}`}
                                      </span>
                                      <span style={{ fontWeight: 700, color: isIncome ? '#4CAF50' : '#E06060', flexShrink: 0 }}>
                                        {isIncome ? '+' : '-'}{formatAmountShort(e.amount)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-start' }}>
                    {cards}
                    {unassignedCard}
                    {/* 합계 — 요약 잔액과 일치해야 함 */}
                    <div style={{ position: 'relative' }}>
                      <div
                        onClick={() => setShowSumTooltip(v => !v)}
                        style={{
                          background: '#f0f8fd', border: '1px solid #89CFF0', borderRadius: '10px',
                          padding: '10px 14px', minWidth: '160px', fontSize: '12px', cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#1a3a5c', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          합계 <span style={{ fontSize: '10px', color: '#89CFF0' }}>ⓘ</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: '#5f6368' }}>
                          {totalIncome > 0 && <div><span style={{ minWidth: '52px', display: 'inline-block' }}>+ 수입</span><span style={{ color: '#4CAF50', fontWeight: 600 }}>{formatAmountShort(totalIncome)}</span></div>}
                          {totalExpense > 0 && <div><span style={{ minWidth: '52px', display: 'inline-block' }}>- 지출</span><span style={{ color: '#E06060', fontWeight: 600 }}>{formatAmountShort(totalExpense)}</span></div>}
                          <div style={{ borderTop: '1px solid #89CFF0', marginTop: '4px', paddingTop: '4px' }}>
                            <span style={{ minWidth: '52px', display: 'inline-block' }}>잔액</span>
                            <span style={{ fontWeight: 700, color: totalBalance >= 0 ? '#1565c0' : '#E06060', fontSize: '13px' }}>{totalBalance < 0 ? '-' : ''}{formatAmountShort(Math.abs(totalBalance))}</span>
                          </div>
                        </div>
                      </div>
                      {showSumTooltip && (
                        <div
                          onClick={e => e.stopPropagation()}
                          style={{
                            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
                            background: '#fff', border: '1px solid #89CFF0', borderRadius: '10px',
                            padding: '12px 14px', minWidth: '240px', fontSize: '11px',
                            boxShadow: '0 4px 16px #00000018', color: '#344054', lineHeight: 1.7,
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#1a3a5c', marginBottom: '8px', fontSize: '12px' }}>합계 계산 방식</div>
                          <div style={{ color: '#666', marginBottom: '6px' }}>이체 항목 제외 후 집계</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div><span style={{ color: '#4CAF50', fontWeight: 600 }}>+ 수입</span> — 이체 제외 INCOME 합산</div>
                            <div><span style={{ color: '#E06060', fontWeight: 600 }}>- 지출</span> — 이체 제외 EXPENSE 합산</div>
                            <div style={{ paddingLeft: '8px', color: '#888', fontSize: '10px' }}>= 통장직접지출 + 카드납부 + 카드구매</div>
                            <div style={{ marginTop: '4px' }}><span style={{ fontWeight: 600 }}>잔액</span> = 이월잔액합계 + 수입 − 지출</div>
                          </div>
                          <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #e0e0e0', color: '#999', fontSize: '10px' }}>
                            ※ 개별 통장 카드는 이체 포함 집계이므로<br />합계와 지출 숫자가 다를 수 있음
                          </div>
                          <button
                            onClick={() => setShowSumTooltip(false)}
                            style={{ marginTop: '8px', fontSize: '10px', padding: '2px 8px', border: '1px solid #ddd', borderRadius: '6px', background: '#f5f5f5', cursor: 'pointer', color: '#666' }}
                          >닫기</button>
                        </div>
                      )}
                    </div>
                  </div>
                  </>
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
              const isSameMonth = pm.billingEndDay >= pm.billingStartDay;
              if (isSameMonth) {
                // 당월 결산 (1~31 등): 이번달 entries만 날짜 범위 필터
                pool = entries.filter(e => e.entryDate >= from && e.entryDate <= to);
              } else {
                // 전달~이번달 경계 결산 (24~23 등): 전달 후반 + 이번달 전반
                pool = [
                  ...prevMonthEntries.filter(e => e.entryDate >= from),
                  ...entries.filter(e => e.entryDate <= to),
                ];
              }
              pool = pool.filter(e => e.entryType === 'EXPENSE' && !isXfer(e) && !e.isCardPayment);
            } else {
              pool = entries.filter(e => e.entryType === 'EXPENSE' && !isXfer(e) && !e.isCardPayment);
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

        {/* ── 전달 미납 카드 — 전달 카드 지출 중 이번달 납부 처리 안 된 카드 */}
        {unpaidPrevCards.length > 0 && (() => {
          const year = Number(yearMonth.slice(0, 4));
          const month = Number(yearMonth.slice(4));
          const prevYm = toYearMonth(new Date(year, month - 2, 1));
          return (
            <div style={{ padding: '8px 20px 0' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#c62828', marginBottom: '6px' }}>
                ⚠️ 전달 미납 카드
                <span style={{ fontSize: '10px', color: '#9aa0a6', fontWeight: 400, marginLeft: '6px' }}>
                  {displayYearMonth(prevYm)} 청구분 미납
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {unpaidPrevCards.map(({ name, amount }) => (
                  <div
                    key={name}
                    style={{
                      background: '#fff5f5', border: '1px solid #f5c6cb',
                      borderRadius: '10px', padding: '10px 14px', minWidth: '140px', fontSize: '12px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#c62828', marginBottom: '2px' }}>{name}</div>
                    <div style={{ color: '#E06060', fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
                      -{formatAmountShort(amount)}
                    </div>
                    <button
                      onClick={() => setCardPayForm({ cardName: name, amount, date: today(), account: '', accountMain: '' })}
                      style={{
                        fontSize: '11px', padding: '4px 10px', borderRadius: '6px',
                        border: '1px solid #E06060', background: '#fff', color: '#E06060',
                        cursor: 'pointer', fontWeight: 600, width: '100%',
                      }}
                    >💳 납부 처리</button>
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
              entries={[...entries, ...nextMonthBoundary]} // 25일 사이클 — 이번달 날짜(day>=25)인 다음달 항목도 달력에 표시
              selectedDate={calSelectedDate}
              onSelectDate={d => setCalSelectedDate(prev => prev === d ? null : d)}
              onEdit={openEdit}
              onDelete={handleDelete}
              userId={userId}
              onEntriesAdded={newEntries => newEntries.forEach(addToDisplay)} // 25일 사이클 라우팅 적용
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
              const cardNameSet = new Set(paymentMethods.filter(p => p.type === '카드').map(p => p.name));
              const bankNameSet = new Set(paymentMethods.filter(p => p.type === '통장').map(p => p.name));
              return filtered.map(entry => (
                <EntryRow key={entry.id} entry={entry} onEdit={openEdit} onDelete={handleDelete}
                  myAccountNames={myAccountNames} otherUserName={otherUserName}
                  cardNameSet={cardNameSet} bankNameSet={bankNameSet}
                  paidCardNames={paidCardNames}
                  isBoundary={boundaryEntryIds.has(entry.id)} />
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

          {/* 공용 통장 현황 — 동영/주해 양쪽 이체·사용 내역 통합 조회 */}
          <SharedAccountSection defaultYearMonth={yearMonth} />

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

      {/* ── 카드 납부 처리 팝업 */}
      {cardPayForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001,
        }}>
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '24px',
            width: Math.min(320, window.innerWidth - 32), boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c', marginBottom: '4px' }}>💳 카드 납부 처리</div>
            <div style={{ fontSize: '13px', color: '#E06060', fontWeight: 700, marginBottom: '16px' }}>
              {cardPayForm.cardName} · -{formatAmountShort(cardPayForm.amount)}
            </div>
            {/* 납부일 */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: '#5f6368', fontWeight: 600, display: 'block', marginBottom: '4px' }}>납부일</label>
              <input
                type="date" value={cardPayForm.date}
                onChange={e => setCardPayForm(f => f ? { ...f, date: e.target.value } : null)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dadce0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
            {/* 납부 통장 선택 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: '#5f6368', fontWeight: 600, display: 'block', marginBottom: '4px' }}>납부 통장</label>
              <select
                value={cardPayForm.account}
                onChange={e => {
                  const pm = paymentMethods.find(p => p.name === e.target.value && p.type === '통장');
                  setCardPayForm(f => f ? { ...f, account: e.target.value, accountMain: pm?.accountMain ?? '' } : null);
                }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dadce0', borderRadius: '8px', fontSize: '13px' }}
              >
                <option value="">통장 선택</option>
                {paymentMethods.filter(p => p.type === '통장').map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setCardPayForm(null)}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #dadce0', background: '#f0f4f8', cursor: 'pointer', fontSize: '13px' }}
              >취소</button>
              <button
                onClick={handleCardPayment}
                style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', background: '#E06060', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}
              >납부 완료 처리</button>
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

const SummaryCard: React.FC<{ label: string; amount: number; color: string; sign: string; subText?: string; onClick?: () => void; isActive?: boolean }> = ({ label, amount, color, sign, subText, onClick, isActive }) => (
  <div
    onClick={onClick}
    style={{
      flex: 1, background: isActive ? `${color}15` : '#fff', borderRadius: '12px',
      padding: '14px 16px', border: `1px solid ${isActive ? color : color + '30'}`,
      boxShadow: isActive ? `0 2px 8px ${color}40` : '0 1px 4px rgba(0,0,0,0.06)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.15s',
    }}
  >
    <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '6px' }}>{label}</div>
    <div style={{ fontSize: '16px', fontWeight: 700, color }}>
      {sign}{formatAmountShort(Math.abs(amount))}
    </div>
    {subText && (
      <div style={{ fontSize: '10px', color: '#E06060', marginTop: '3px', fontWeight: 500 }}>{subText}</div>
    )}
    {isActive && (
      <div style={{ fontSize: '9px', color, marginTop: '2px', fontWeight: 500 }}>▼ 목록 필터 중</div>
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
        yearMonth: toSettledYearMonth(selectedDate), // 25일 사이클 기준 정산 월
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
                cardNameSet={new Set(paymentMethods.filter(p => p.type === '카드').map(p => p.name))}
                bankNameSet={new Set(paymentMethods.filter(p => p.type === '통장').map(p => p.name))}
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
  cardNameSet?: Set<string>;    // 카드명 Set — accountMain이 카드명이면 카드 배지로 표시
  bankNameSet?: Set<string>;    // 통장명 Set — accountMain이 통장명이면 통장 배지로 표시
  paidCardNames?: Set<string>;  // 납부 완료된 카드명 Set — 카드 구매 항목에 납부완료 배지 표시
  isBoundary?: boolean;         // 이번달 달력 날짜지만 다음달 정산에 속하는 항목 (day >= 25)
}> = ({ entry, onEdit, onDelete, myAccountNames, otherUserName, cardNameSet, bankNameSet, paidCardNames, isBoundary }) => {
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
          {/* 카드 구매 항목에 납부완료 배지 — isCardPayment=true인 납부 항목이 있으면 초록 배지 */}
          {entry.cardName && !entry.isCardPayment && paidCardNames?.has(entry.cardName) && (
            <span style={{ fontSize: '10px', background: '#E8F5E9', color: '#2e7d32', border: '1px solid #A5D6A7', borderRadius: '4px', padding: '1px 5px' }}>납부완료</span>
          )}
          {entry.isCardPayment && (
            <span style={{ fontSize: '10px', background: '#F3E5F5', color: '#7B1FA2', borderRadius: '4px', padding: '1px 5px' }}>카드납부</span>
          )}
          {/* 이번달 날짜지만 다음달 정산으로 분류되는 항목 (25일 이후) */}
          {isBoundary && (
            <span style={{ fontSize: '10px', background: '#FFF8E1', color: '#F57F17', border: '1px solid #FFE082', borderRadius: '4px', padding: '1px 5px' }}>다음달 정산</span>
          )}
        </div>
        {(entry.merchant || entry.accountMain || entry.account || entry.cardName || entry.memo) && (
          <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '2px' }}>
            {entry.merchant && <span style={{ color: '#5f6368', fontWeight: 600 }}>{entry.merchant}</span>}
            {entry.accountMain && (
              cardNameSet?.has(entry.accountMain) ? (
                <span style={{
                  marginLeft: entry.merchant ? '4px' : undefined,
                  fontSize: '10px', background: '#fff3e0',
                  color: '#E65100', border: '1px solid #FFB74D',
                  borderRadius: '4px', padding: '1px 5px',
                }}>💳 {entry.accountMain}</span>
              ) : bankNameSet?.has(entry.accountMain) ? (
                <span style={{
                  marginLeft: entry.merchant ? '4px' : undefined,
                  fontSize: '10px', background: '#e3f2fd',
                  color: '#1565c0', border: '1px solid #90CAF9',
                  borderRadius: '4px', padding: '1px 5px',
                }}>🏦 {entry.accountMain}</span>
              ) : (
                <span>{entry.merchant ? ' · ' : ''}{entry.accountMain}</span>
              )
            )}
            {entry.account && (() => {
              const isCard = cardNameSet?.has(entry.account);
              const isBank = bankNameSet?.has(entry.account);
              const badge = isCard ? (
                <span style={{ fontSize: '10px', background: '#fff3e0', color: '#E65100', border: '1px solid #FFB74D', borderRadius: '4px', padding: '1px 5px' }}>
                  💳 {entry.account}
                </span>
              ) : isBank ? (
                <span style={{ fontSize: '10px', background: '#e3f2fd', color: '#1565c0', border: '1px solid #90CAF9', borderRadius: '4px', padding: '1px 5px' }}>
                  🏦 {entry.account}
                </span>
              ) : (
                <span> › {entry.account}</span>
              );
              return (
                <>
                  {(isCard || isBank) ? <span style={{ marginLeft: '4px' }}>{badge}</span> : badge}
                  {myAccountNames && !myAccountNames.has(entry.account) && otherUserName && (
                    <span style={{ marginLeft: '4px', fontSize: '10px', background: '#f0f0f0', color: '#344054', border: '1px solid #d0d0d0', borderRadius: '4px', padding: '1px 5px' }}>
                      {otherUserName}
                    </span>
                  )}
                </>
              );
            })()}
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
                  <span style={{ marginLeft: '3px', fontSize: '10px', background: '#f0f0f0', color: '#344054', border: '1px solid #d0d0d0', borderRadius: '4px', padding: '1px 5px' }}>
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
  isShared: boolean;           // 공용 통장 여부
  // 카드 전용
  cardAlias: string;
  billingDayStr: string;       // 결제일
  billingStartDayStr: string;  // 결산 시작일
  billingEndDayStr: string;    // 결산 종료일
};

const emptyPmForm = (): PmForm => ({
  name: '', type: '통장', accountMain: '', accountNumber: '', isShared: false,
  cardAlias: '', billingDayStr: '', billingStartDayStr: '', billingEndDayStr: '',
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
      isShared: pm.isShared,
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
        isShared: form.type === '통장' ? form.isShared : false,
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

  // 내 결제수단만 관리 대상 (상대방 공용 통장은 읽기 전용으로 별도 표시)
  const banks = paymentMethods.filter(p => p.type === '통장' && p.userId === userId);
  const cards = paymentMethods.filter(p => p.type === '카드' && p.userId === userId);
  const partnerShared = paymentMethods.filter(p => p.userId !== userId && p.isShared);

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
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: form.isShared ? '#2e7d32' : '#5f6368' }}>
                  <input
                    type="checkbox"
                    checked={form.isShared}
                    onChange={e => setForm(f => ({ ...f, isShared: e.target.checked }))}
                    style={{ width: '14px', height: '14px', accentColor: '#4CAF50', cursor: 'pointer' }}
                  />
                  공용 통장 — 동영·주해 모두에게 표시, 잔액 카드 클릭 시 양쪽 내역 조회 가능
                </label>
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

      {/* 상대방 공용 통장 — 읽기 전용 표시 */}
      {partnerShared.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#2e7d32', marginBottom: '4px' }}>공용 통장 (상대방 등록)</div>
          {partnerShared.map(pm => (
            <div key={pm.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 10px', background: '#f6fdf6',
              border: '1px solid #a8d8a8', borderRadius: '8px', marginBottom: '4px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: '#2e7d32', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {pm.name}
                  <span style={{ fontSize: '9px', background: '#4CAF50', color: '#fff', padding: '1px 5px', borderRadius: '8px', fontWeight: 700 }}>공용</span>
                </div>
                <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '1px' }}>
                  {pm.accountMain && <span style={{ marginRight: '8px' }}>{pm.accountMain}</span>}
                  <span>{pm.userId === 'ldy' ? '동영' : '주해'} 등록</span>
                </div>
              </div>
            </div>
          ))}
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
                  <div style={{ fontSize: '13px', color: '#344054', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {pm.name}
                    {pm.isShared && (
                      <span style={{ fontSize: '9px', background: '#4CAF50', color: '#fff', padding: '1px 5px', borderRadius: '8px', fontWeight: 700, flexShrink: 0 }}>공용</span>
                    )}
                  </div>
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
    // 25일 사이클 적용: 25일 이후 납부는 다음달 정산으로 기록
    const ym = toSettledYearMonth(payDate);
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
                {entries.map(([method, total]) => {
                  const isCard = paymentMethods.some(p => p.type === '카드' && p.name === method);
                  const isBank = paymentMethods.some(p => p.type === '통장' && p.name === method);
                  const methodBadge = isCard
                    ? <span style={{ fontSize: '10px', background: '#fff3e0', color: '#E65100', border: '1px solid #FFB74D', borderRadius: '4px', padding: '1px 5px', marginRight: '3px' }}>💳 {method}</span>
                    : isBank
                    ? <span style={{ fontSize: '10px', background: '#e3f2fd', color: '#1565c0', border: '1px solid #90CAF9', borderRadius: '4px', padding: '1px 5px', marginRight: '3px' }}>🏦 {method}</span>
                    : <span style={{ color: '#7B1FA2', fontWeight: 600, marginRight: '3px' }}>{method}</span>;
                  return (
                    <span key={method} style={{ fontSize: '11px', color: '#344054', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      {methodBadge}
                      <span style={{ fontWeight: 700 }}>{formatAmountKorean(total)}</span>
                    </span>
                  );
                })}
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
                        {fe.account && (() => {
                          const isCard = paymentMethods.some(p => p.type === '카드' && p.name === fe.account);
                          const isBank = paymentMethods.some(p => p.type === '통장' && p.name === fe.account);
                          if (isCard) return (
                            <span style={{ fontSize: '10px', background: '#fff3e0', color: '#E65100', border: '1px solid #FFB74D', borderRadius: '4px', padding: '1px 5px' }}>
                              💳 {fe.account}
                            </span>
                          );
                          if (isBank) return (
                            <span style={{ fontSize: '10px', background: '#e3f2fd', color: '#1565c0', border: '1px solid #90CAF9', borderRadius: '4px', padding: '1px 5px' }}>
                              🏦 {fe.account}
                            </span>
                          );
                          return <span style={{ color: '#9aa0a6' }}>· {fe.account}</span>;
                        })()}
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
