// 가계부 관련 상수 — 변경 시 이 파일만 수정하면 전체 반영

export const BUDGET_USERS = [
  { id: 'ldy',    name: '동영' },
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
        name: '고정비 통장(주해)',
        budget: 1_500_000,
        items: ['이자', '월세', '관리비', '통신비', '정기구독', '회비', '보험'],
        bankName: '신한은행',
      },
      {
        name: '고정비 통장(동영)',
        budget: 880_000,
        items: ['이자', '통신비', '보험', '적금'],
        bankName: 'KB국민',
      },
    ],
  },
  {
    main: '변동비 통장',
    description: '줄여볼 수 있는 조율 가능한 비용 / 조금씩의 변동이 있음',
    accounts: [
      {
        name: '용돈 통장(주해)',
        budget: 230_000,
        items: ['식대(회사)', '교통비', '운동/취미', '용돈', '교육/문화'],
        bankName: '',
      },
      {
        name: '용돈 통장(동영)',
        budget: 290_000,
        items: ['식대(회사)', '교통비', '운동/취미', '용돈', '교육/문화'],
        bankName: '',
      },
      {
        name: '생활비 통장',
        budget: 550_000,
        items: ['식비(마트)', '주유비', '병원/약국/의료', '영양제'],
        bankName: '',
      },
      {
        name: '데이트통장',
        budget: 100_000,
        items: ['식비(배달)', '식비(외식)'],
        bankName: '',
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
        bankName: '',
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
// 고정비: 매달 거의 동일하게 나가는 항목
// 변동비: 달마다 달라지는 항목

export const FIXED_EXPENSE_CATEGORIES: string[] = [
  '월세',
  '통신비',
  '관리비',
  '공과금',
  '정기구독',
  '회비',
  '보험',
  '이자',
  '적금',
  '미분류',
];

export const VARIABLE_EXPENSE_CATEGORIES: string[] = [
  '교육/문화',
  '식비(마트)',
  '식대(회사)',
  '식비(배달)',
  '식비(외식)',
  '카페',
  '간식',
  '병원/약국/의료',
  '미용/패션/쇼핑',
  '용돈',
  '경조사',
  '선물',
  '모임',
  '세금',
  '주유비',
  '주차비',
  '영양제',
  '교통비',
  '여행',
  '부모님 용돈',
  '운동/취미',
  '생필품',
  '가구/가전',
  '결혼준비',
  '미분류',
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
  'ISA',
  '예금/적금',
  '부동산',
  '코인',
  '기타',
] as const;

export const BUDGET_USER_STORAGE_KEY = 'budget_user_id';

// ─── 공통코드 그룹 키 (카테고리 DB 관리) ──────────────────────────
// CommonCodeModal에서 해당 그룹명으로 조회·편집 가능
export const BUDGET_CAT_CODES = {
  VAR_EXPENSE:  'BUDGET_VAR_CAT',    // 변동비 카테고리
  FIX_EXPENSE:  'BUDGET_FIX_CAT',    // 고정비 카테고리
  FE_ITEM:      'BUDGET_FE_CAT',     // 고정비 항목 카테고리 (고정비 관리 폼)
  INCOME:       'BUDGET_INCOME_CAT', // 수입 카테고리 (detailCodeName: "이름|서브1,서브2")
  INVEST:       'BUDGET_INVEST_TYPE',// 투자 유형
} as const;

// ─── 고정비 항목 카테고리 ─────────────────────────────────────────
// 이 목록에 카테고리를 추가하면 고정비 관리 폼 드롭다운에 반영됨
export const FIXED_EXPENSE_ITEM_CATEGORIES: string[] = [
  '주거비',
  '공과금',
  '통신비',
  '구독료',
  '기부',
  '고정 투자비',
  '비정기',
  '취미',
  '모임 고정비',
  '교통비',
  '보험료',
];

// ─── 자산 항목 ────────────────────────────────────────────────
// 즉시 사용 가능: 보증금·현금·주식·퇴직금(수령완료)
// 즉시 사용 불가: 주택청약저축·퇴직연금·ISA·미국주식·국채·달러 현금

export interface AssetColumn {
  key: string;      // DB assetType 저장값 (유니크, 한글)
  label: string;    // 화면 표시명
  group: '즉시 사용 가능' | '즉시 사용 불가';
  codeKey: string;  // 공통코드 detail_code 영문 접두사 (ASSET_CELL 그룹, {codeKey}_{USER} 조합)
  isDollar?: boolean; // true이면 USD로 입력·저장, 표시 시 KRW 환산 병기
}

export const ASSET_COLUMNS: AssetColumn[] = [
  { key: '보증금',       label: '보증금',       group: '즉시 사용 가능', codeKey: 'DEPOSIT'        },
  { key: '현금',         label: '현금',         group: '즉시 사용 가능', codeKey: 'CASH'           },
  { key: '주식',         label: '주식',         group: '즉시 사용 가능', codeKey: 'STOCK'          },
  { key: '퇴직금',       label: '퇴직금',       group: '즉시 사용 가능', codeKey: 'SEVERANCE'      },
  { key: '주택청약저축', label: '주택청약저축', group: '즉시 사용 불가', codeKey: 'HOUSING_SAVINGS' },
  { key: '퇴직연금',     label: '퇴직연금',     group: '즉시 사용 불가', codeKey: 'PENSION'        },
  { key: 'ISA',          label: 'ISA',          group: '즉시 사용 불가', codeKey: 'ISA'            },
  { key: '미국주식',     label: '미국주식',     group: '즉시 사용 불가', codeKey: 'US_STOCK',  isDollar: true },
  { key: '국채',         label: '국채',         group: '즉시 사용 불가', codeKey: 'GOV_BOND'       },
  { key: '달러 현금',    label: '달러 현금',    group: '즉시 사용 불가', codeKey: 'DOLLAR_CASH', isDollar: true },
];

/**
 * 자산 셀 공통코드 복합키 생성
 * common_code = 'ASSET_CELL', detail_code = '{codeKey}_{USER_SUFFIX}'
 * 예: STOCK_LDY, STOCK_JUHAE
 */
export const buildAssetCellCode = (codeKey: string, userId: string): string =>
  `${codeKey}_${userId.toUpperCase()}`;

export const ASSET_LIQUIDITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '즉시 사용 가능': { bg: '#E8F5E9', text: '#1B5E20', border: '#4CAF50' },
  '즉시 사용 불가': { bg: '#FFF3E0', text: '#E65100', border: '#FF9800' },
};
