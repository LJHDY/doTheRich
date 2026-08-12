// 가계부 관련 상수 — 변경 시 이 파일만 수정하면 전체 반영

export const BUDGET_USERS = [
  { id: 'ldy',    name: '나' },
  { id: 'juhae',  name: '주해' },
] as const;

export type BudgetUserId = typeof BUDGET_USERS[number]['id'];

// ─── 통장 쪼개기 ─────────────────────────────────────────────
// 구조: 대분류(group) → 개별 통장(account) → 예산/항목/은행카드

export interface AccountInfo {
  name: string;      // 통장명 (폼 드롭다운 + DB 저장값)
  budget: number;    // 월 예산 (원 단위)
  items: string[];   // 이 통장으로 처리하는 지출 항목
  bankName: string;  // 실제 은행/카드명
}

export interface AccountGroup {
  main: string;        // 대분류명
  description: string; // 대분류 설명
  accounts: AccountInfo[];
}

export const ACCOUNT_GROUPS: AccountGroup[] = [
  {
    main: '고정비 통장',
    description: '생활에 꼭 필요한 비용 / 매달 고정되어 있음',
    accounts: [
      {
        name: '고정비 통장(아내)',
        budget: 1_500_000,
        items: ['이자', '월세', '관리비', '통신비', '정기구독', '회비', '보험'],
        bankName: '신한은행',
      },
      {
        name: '고정비 통장(남편)',
        budget: 880_000,
        items: ['이자', '통신비', '보험', '적금'],
        bankName: '새마을금고',
      },
    ],
  },
  {
    main: '변동비 통장',
    description: '줄여볼 수 있는 조율 가능한 비용 / 조금씩의 변동이 있음',
    accounts: [
      {
        name: '용돈 통장(아내)',
        budget: 230_000,
        items: ['식대(회사)', '교통비', '운동/취미', '용돈', '교육/문화'],
        bankName: 'BC카드',
      },
      {
        name: '용돈 통장(남편)',
        budget: 290_000,
        items: ['식대(회사)', '교통비', '운동/취미', '용돈', '교육/문화'],
        bankName: '삼성카드, 체크카드',
      },
      {
        name: '생활비 통장',
        budget: 550_000,
        items: ['식비(마트)', '주유비', '병원/약국/의료', '영양제'],
        bankName: '신한 신용카드',
      },
      {
        name: '데이트통장',
        budget: 100_000,
        items: ['식비(배달)', '식비(외식)'],
        bankName: '토스',
      },
    ],
  },
  {
    main: '이벤트 통장',
    description: '여행, 축의처럼 매달 나가지는 않지만 한번씩 꼭 써야하는 이벤트성 지출을 위해 미리 준비함',
    accounts: [
      {
        name: '여행 통장',
        budget: 100_000,
        items: ['여행'],
        bankName: '토스',
      },
      {
        name: '비상금 통장',
        budget: 200_000,
        items: ['세금', '경조사', '부모님 용돈', '가구/가전', '기타 필수 지출(큰 교육비/미용)'],
        bankName: '',
      },
    ],
  },
];

// 대분류 목록 (폼 드롭다운용)
export const ACCOUNT_MAINS = ACCOUNT_GROUPS.map(g => g.main);

// 중분류 전체 flat 목록 (하위 호환)
export const ACCOUNTS = ACCOUNT_GROUPS.flatMap(g => g.accounts.map(a => a.name));

// ─── 지출 카테고리 ────────────────────────────────────────────

export const EXPENSE_CATEGORIES: { name: string; subcategories: string[] }[] = [
  { name: '식비',      subcategories: ['외식', '장보기', '카페', '배달', '식대(회사)'] },
  { name: '교통',      subcategories: ['대중교통', '주유', '주차', '택시'] },
  { name: '주거',      subcategories: ['월세', '관리비', '공과금', '인터넷', '핸드폰'] },
  { name: '의료/건강', subcategories: ['병원', '약국', '의료비', '헬스/운동', '영양제'] },
  { name: '여가',      subcategories: ['여행', '취미', '운동', '영화/공연', '구독서비스'] },
  { name: '쇼핑',      subcategories: ['의류', '잡화', '생활용품', '온라인쇼핑'] },
  { name: '교육',      subcategories: ['도서', '강의/학원', '교육/문화'] },
  { name: '보험',      subcategories: ['생명보험', '실손보험', '기타보험'] },
  { name: '저축',      subcategories: ['적금', '예금', '청약'] },
  { name: '경조사',    subcategories: ['결혼', '장례', '선물', '부모님 용돈', '용돈'] },
  { name: '고정지출',  subcategories: ['이자', '월세', '회비', '정기구독'] },
  { name: '투자',      subcategories: ['주식', '펀드/ETF', '예금/적금', '부동산', '코인'] },
  { name: '세금/공과', subcategories: ['세금', '4대보험', '기타공과금'] },
  { name: '기타',      subcategories: [] },
];

// ─── 수입 카테고리 ────────────────────────────────────────────

export const INCOME_CATEGORIES: { name: string; subcategories: string[] }[] = [
  { name: '급여',      subcategories: ['월급', '상여/보너스'] },
  { name: '이자/배당', subcategories: ['이자수익', '배당금'] },
  { name: '투자수익',  subcategories: ['매매차익', '배당'] },
  { name: '부수입',    subcategories: ['프리랜서', '판매수익'] },
  { name: '기타수입',  subcategories: [] },
];

// ─── 투자 유형 ────────────────────────────────────────────────

export const INVESTMENT_TYPES = [
  '주식',
  '펀드/ETF',
  '예금/적금',
  '부동산',
  '코인',
  '기타',
] as const;

export const BUDGET_USER_STORAGE_KEY = 'budget_user_id';
