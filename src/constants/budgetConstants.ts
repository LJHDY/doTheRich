// 가계부 관련 상수 — 변경 시 이 파일만 수정하면 전체 반영

export const BUDGET_USERS = [
  { id: 'ldy', name: '나' },
  { id: 'juhae', name: '주해' },
] as const;

export type BudgetUserId = typeof BUDGET_USERS[number]['id'];

// 통장 쪼개기 — 대분류 → 중분류 2단계 구조
export const ACCOUNT_GROUPS: { main: string; subs: string[] }[] = [
  { main: '고정비통장',  subs: ['고정비'] },
  { main: '변동비통장',  subs: ['용돈(동영)', '용돈(주해)', '생활비', '데이트'] },
  { main: '이벤트통장',  subs: ['여행', '비상금'] },
];

// 대분류 목록
export const ACCOUNT_MAINS = ACCOUNT_GROUPS.map(g => g.main);

// 중분류 전체 flat 목록 (기존 호환용)
export const ACCOUNTS = ACCOUNT_GROUPS.flatMap(g => g.subs);

// 지출 카테고리 (카테고리 → 세부항목)
export const EXPENSE_CATEGORIES: { name: string; subcategories: string[] }[] = [
  { name: '식비',      subcategories: ['외식', '장보기', '카페', '배달'] },
  { name: '교통',      subcategories: ['대중교통', '주유', '주차', '택시'] },
  { name: '주거',      subcategories: ['월세/관리비', '공과금', '인터넷', '핸드폰'] },
  { name: '의료/건강', subcategories: ['병원', '약국', '헬스/운동'] },
  { name: '여가',      subcategories: ['여행', '취미', '영화/공연', '구독서비스'] },
  { name: '쇼핑',      subcategories: ['의류', '잡화', '생활용품', '온라인쇼핑'] },
  { name: '교육',      subcategories: ['도서', '강의/학원'] },
  { name: '경조사',    subcategories: ['결혼', '장례', '선물', '용돈'] },
  { name: '투자',      subcategories: ['주식', '펀드/ETF', '예금/적금', '부동산', '코인'] },
  { name: '대출',      subcategories: ['원금상환', '이자'] },
  { name: '기타',      subcategories: [] },
];

// 수입 카테고리
export const INCOME_CATEGORIES: { name: string; subcategories: string[] }[] = [
  { name: '급여',     subcategories: ['월급', '상여/보너스'] },
  { name: '이자/배당', subcategories: ['이자수익', '배당금'] },
  { name: '투자수익', subcategories: ['매매차익', '배당'] },
  { name: '부수입',   subcategories: ['프리랜서', '판매수익'] },
  { name: '기타수입', subcategories: [] },
];

// 투자 유형 (is_investment=true 일 때 선택)
export const INVESTMENT_TYPES = [
  '주식',
  '펀드/ETF',
  '예금/적금',
  '부동산',
  '코인',
  '기타',
] as const;

export const BUDGET_USER_STORAGE_KEY = 'budget_user_id';
