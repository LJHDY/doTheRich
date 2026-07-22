# CLAUDE.md — DoTheRich 프론트엔드 개발 가이드

> **이 파일은 Claude가 개발·수정 전에 반드시 읽고, 작업 완료 후 반드시 업데이트해야 합니다.**

---

## 개발 규칙

- **프론트엔드(doTheRichFront)만 수정.** 백엔드(doTheRichBack)는 원칙적으로 수정하지 않는다.
- 백엔드 변경이 필요한 경우, 변경 내용을 텍스트로 설명하고 구현은 사용자에게 맡긴다. (단, 사용자가 명시적으로 요청 시 직접 수정 가능)
- 모든 소스 파일에 **한국어 주석** 작성 (로직 설명, Why 위주).
- TypeScript 타입 오류 없이 `npx tsc --noEmit` 통과 확인 후 완료 보고.
- 작업 완료 후 이 파일의 해당 섹션을 업데이트한다.

---

## 프로젝트 개요

**DoTheRich** — 부동산 시세 트래킹 앱 (개인용)

- 지도 위에 아파트 단지 마커 표시
- 단지별 매매가/전세가 시세 기록 추적
- 평형별 시세 변동 그래프 시각화
- 네이버 검색으로 단지 등록, 지하철 도보 시간 자동 계산
- 단지 비교 기능 (최대 3개 동시 비교)
- 주요 지구 소요시간 기반 입지 등급 (S/A/B/C)

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | React 18 (CRA, TypeScript) |
| 지도 | Naver Maps API (CDN) |
| 차트 | Recharts |
| HTTP | Axios (`src/services/api.ts`) |
| 백엔드 | Python + FastAPI (로컬: `http://localhost:8000`, 운영: Railway) |

---

## 배포 환경

| 구분 | 서비스 | URL |
|------|--------|-----|
| 프론트엔드 | Vercel | `https://do-the-rich-raew.vercel.app` |
| 백엔드 | Railway | `https://dotherichback-production.up.railway.app` |
| DB | Railway MySQL | Railway 내부 연결 |

### 환경변수
- **Vercel**: `REACT_APP_API_URL=https://dotherichback-production.up.railway.app`
- **로컬 개발**: 환경변수 없으면 `localhost:8000` 자동 fallback

### 배포 시 주의사항
- CRA는 환경변수를 **빌드 시점**에 주입 → Vercel에서 env var 변경 후 반드시 Redeploy 필요
- `REACT_APP_*` prefix 필수 (CRA 규칙)

---

## 디렉터리 구조

```
src/
├── App.tsx                   # 최상위 — 상태 관리, 레이아웃, 모달 제어
├── index.tsx
├── types/
│   └── index.ts              # 전체 타입 정의 + formatPrice / toUkUnit / calcCommuteGrade 유틸
├── services/
│   └── api.ts                # axios 인스턴스 + API 함수
├── pages/
│   └── MapPage.tsx           # 네이버 지도 초기화, 마커 렌더링
└── components/
    ├── PriceRangeFilter.tsx  # 헤더 금액대 필터 버튼
    ├── ComplexListModal.tsx  # 금액대 클릭 시 단지 목록 팝업
    ├── CompareListModal.tsx  # 비교하기 단지 선택 패널 (헤더 하단 드롭다운)
    ├── CompareCard.tsx       # 비교 뷰 단지 카드 (ComplexInfoPanel 간소화 버전)
    ├── CommuteGradeBadge.tsx # 입지 등급 배지 (S/A/B/C) — 공통 컴포넌트
    ├── SearchBar.tsx         # 네이버 장소 검색
    ├── RegisterModal.tsx     # 단지 등록 폼 (가격·교통·출퇴근 입력)
    ├── ComplexInfoPanel.tsx  # 우측 단지 상세 패널
    ├── PriceChart.tsx        # 평형×매매/전세 다중 라인 차트
    └── PriceInputForm.tsx    # 시세 기록 추가 폼 (패널 내)
public/
├── favicon.ico               # 파비콘
└── do_the_rich.png           # 헤더 로고 이미지
```

---

## 타입 구조 (`src/types/index.ts`)

### 핵심 인터페이스

```typescript
// 지도 오버레이 마커 (학교·인프라 위치 표시)
OverlayMarker { id, name, lat, lng, markerType: 'school'|'infra', subType? }

// 단지 대표 정보 (백엔드 ApartmentComplexDto 1:1)
ApartmentComplex {
  id, priceRange, complexName, checkDate, builtYear,
  price, jeonsePrice?, jeonseRate?,
  unitCount, region, address, memo?,
  latitude, longitude,
  redevelopType?, redevelopStage?, visitType?,  // 재개발 유형·단계, 임장 유형
  commuteTimes: CommuteTime[],
  subwayInfos: SubwayInfo[],
  schoolInfos?: SchoolInfo[],   // 학군 정보
  infraInfos?: InfraInfo[],     // 주변 인프라
  areaTypes?: string[]                          // 최신 시세 기준 평형 목록
  areaTypePriceRanges?: Record<string, string>  // 평형 → 금액대 매핑
  priceItems?: PriceItem[]                      // ⚠️ 백엔드가 포함 시에만 채워짐 (현재 미구현)
  grade?: string;       // 지역 직장 밀도 등급 (S/A/B/C) — RegionWorkplaceConst 기준, DB 미저장
  employees?: number;   // 지역 종사자수
  businesses?: number;  // 지역 사업체수
  isFavorite?: boolean; // 즐겨찾기 여부
}

// 학군·인프라 좌표 포함 (Naver 검색 결과 선택 시 mapx/mapy 저장)
SchoolInfo { ..., latitude?, longitude? }
InfraInfo  { ..., latitude?, longitude? }

// 시세 기록 아이템 (평형별 1개) — 참고가 필드 포함
PriceHistoryItem {
  id, areaType, floor, price, jeonsePrice?, jeonseRate?,
  askingPrice?,       // 호가
  highestPrice?,      // 전고점
  lowestPrice?,       // 전저점
  tenYearChangeRate?,   // 10년 등락률 (%)
  tenYearChangeAmount?, // 10년 등락 금액 (원)
}

// 시세 기록 헤더
PriceHistory { id, complexId, complexName, recordDate, memo?, items: PriceHistoryItem[] }
```

### 유틸 함수
- `formatPrice(원)` → `"7억 5천만"`
- `toUkUnit(원)` → `7.5` (억 단위, 소수점 2자리)
- `calcCommuteGrade(commuteTimes)` → `{ grade: 'S'|'A'|'B'|'C', color: string } | null`
  - S(빨강): 강남 30분 이하
  - A(노랑): 강남 60분 이하 or 시청·여의도 중 하나 30분 이하
  - B(초록): 시청·여의도 중 하나 60분 이하
  - C(파랑): 나머지

---

## 백엔드 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/complexes` | 단지 목록 (priceRange 필터 가능) |
| GET | `/api/complexes/:id` | 단지 상세 |
| POST | `/api/complexes/register` | 단지 등록 |
| DELETE | `/api/complexes/:id` | 단지 삭제 |
| GET | `/api/complexes/price-ranges` | 금액대 목록 |
| PATCH | `/api/complexes/:id/memo` | 단지 메모 수정 — `{ memo: string }` |
| PATCH | `/api/complexes/:id/favorite` | 즐겨찾기 토글 — `{ isFavorite: boolean }` |
| POST | `/api/complexes/:id/school-infos` | 학군 정보 단건 추가 (201) |
| PATCH | `/api/complexes/:id/school-infos/:sid` | 학군 정보 단건 수정 |
| POST | `/api/complexes/:id/infra-infos` | 인프라 정보 단건 추가 (201) |
| PATCH | `/api/complexes/:id/infra-infos/:iid` | 인프라 정보 단건 수정 |
| GET | `/api/complexes/:id/price-history` | 시세 기록 목록 |
| POST | `/api/complexes/:id/price-history` | 시세 기록 추가 |
| GET | `/api/search/local?query=` | 네이버 장소 검색 (지도 역 조회 등) |
| GET | `/api/directions/walking` | 네이버 도보 경로 (분) |
| GET | `/api/real-estate/trade/latest` | 실거래가 조회 (MOLIT) — ⚠️ 주석처리 중 |
| GET | `/api/real-estate/jeonse/latest` | 전세가 조회 (MOLIT) — ⚠️ 주석처리 중 |
| POST | `/api/batch/real-estate-price` | 실거래가/전세가 배치 수집 (수동 실행) |

---

## 컴포넌트별 현황

### `App.tsx`
- 단지 목록 (`complexes`) / 금액대 목록 (`priceRanges`) 전역 상태 보관
- `selectedComplex` → ComplexInfoPanel 표시
- `focusLocation` → MapPage 지도 이동
- `registerData` → RegisterModal 오픈
- `listModalRange` → ComplexListModal 오픈 (null=닫힘, ''=전체)
- `compareOpen` / `compareIds` → 비교하기 상태 관리
  - `compareIds.length > 0` 시 지도 대신 비교 카드 뷰 표시
  - 최대 3개, 초과 시 alert
- 검색 결과 선택 시 `fromSearch:true`로 RegisterModal 오픈

### `MapPage.tsx`
- 네이버 지도 초기화 (서울 중심, zoom 12)
- 단지마다 CSS 회전 핀 마커 (30×30px, `border-radius:50% 50% 50% 4px` + `rotate(-45deg)`)
  - 색상: 10억 미만=파랑, 15억 미만=노랑, 20억 미만=빨강, 그 외=검정
  - 마커 hover 시 단지명 tooltip 표시 — tooltip은 `document.body` 직속 div (`z-index:2147483647`)로 생성해 Naver Maps의 CSS transform stacking context를 탈출, 항상 최상위 렌더링
  - `window.__mkTipShow / __mkTipHide` 전역 함수로 마커 인라인 이벤트에서 제어
- 마커 클릭 → InfoWindow + `onComplexSelect`
- 지도 클릭 → 역방향 지오코딩 → `onMapClick` 콜백으로 주소 전달
- `focusLocation` 변경 시 지도 중심/줌(15) 이동
- `overlayMarkers` 변경 시 학교·인프라 오버레이 마커 렌더링 (중=파랑/초=초록, 백화점=보라/마트=주황/병원=빨강/기타=회색)

### `RegisterModal.tsx`
- 섹션: 기본정보 / 가격정보 / 단지정보 / 교통정보 / 출퇴근시간 / 메모
- **가격정보 행**: 평형 | 층수 | 매매가 | 전세가 | 전세율 | 금액대(자동) | ×
  - **참고가 서브행**: 호가 | 전고점 | 전저점 | 10년 등락(A-B 패턴 자동계산) | 등락률
- 교통정보: 역명 → 네이버 API 호선 자동 조회 + 도보시간 계산
- 출퇴근시간: 강남/시청/여의도/발산/마곡나루 + 분 입력
- ⚠️ 실거래가 자동조회 — 정확도 문제로 주석처리

### `ComplexInfoPanel.tsx`
- 단지 선택 시 `GET /api/complexes/:id/price-history` 조회
- **섹션 순서**: 단지정보(참고가·메모) → 종합평가 → 지하철 → 직장 → 교통 → 학군 → 환경 → 재개발정보 → 임장유형 → 시세변동 → 최근기록
- **종합평가**: 직장·교통·학군·환경 4칸 그리드, 각 S/A/B/C 배지 (데이터 없으면 `-`) — 클릭 시 해당 섹션으로 스크롤 (섹션 없으면 무동작)
- **직장**: `complex.grade` 기반 배지 + 종사자수·사업체수 (`RegionWorkplaceConst`, DB 미저장)
- **교통**: 주요 지구 소요시간, `CommuteGradeBadge` 배지 표시
- **학군**: 중학교 `achievementScore` 기준 등급 배지 (S≥95/A≥90/B≥85/C) — 중학교 없으면 배지 미표시
- **환경**: 주변 인프라, 항상 등급 배지 표시 (백화점 2개↑=S / 1개=A / 마트 1개↑=B / 나머지=C)
- **재개발 정보**: 유형 + 진행단계, 단계 레이블 `?` 아이콘 호버 시 ①~⑦ 설명 tooltip
- **차트**: 평형별 다중 라인 (매매 파란계열, 전세 빨간계열)
- 최근 기록: 최신 5건 (참고가 chips 포함)
- 단지 삭제: 2단계 확인 후 `DELETE /api/complexes/:id`
- 메모 인라인 편집
- **학군 인라인 추가·편집**: 연필(✏) 버튼 → 편집 폼 / 섹션 하단 "+ 학교 추가" / 삭제버튼 위 "+ 학군 추가" (데이터 없을 때만)
- **인프라 인라인 추가·편집**: 동일 패턴, 유형 셀렉트 + 이름 검색 + 도보거리 자동계산
- 저장 후 `getComplexById` 재조회 → `onComplexUpdate` 콜백으로 부모 상태 갱신 + 오버레이 마커 갱신
- 내부 헬퍼: `calcSchoolGrade`, `calcInfraGrade`, `GRADE_COLORS`, `formatCount`, `Tag`, `stripHtml`, `haversineKm`, `INFRA_TYPES_LIST`, `editInputStyle`

### `CompareListModal.tsx`
- 헤더 "비교하기" 버튼 클릭 시 헤더 하단 드롭다운 패널
- 금액대 필터 + 체크박스 목록 (최대 3개)
- 선택 행 파란 배경 하이라이트

### `CompareCard.tsx`
- 비교 뷰에서 1/3 너비로 표시되는 단지 카드
- **섹션 순서**: 헤더(파랑) → 단지정보 → 종합평가 → 지하철 → 직장 → 교통 → 학군 → 환경 → 재개발정보 → 임장유형 → 시세변동 → 최근 3건
- **종합평가 동기화 스크롤**: 어느 카드에서든 직장·교통·학군·환경 클릭 시 `window` 커스텀 이벤트(`compare-section-scroll`) 발행 → 마운트된 모든 카드가 각자의 해당 섹션으로 동시 스크롤 (섹션 없는 카드는 무동작)
- ComplexInfoPanel과 동일한 등급 로직·레이블 맵 내장 (`calcSchoolGrade`, `calcInfraGrade`, `GRADE_COLORS`, `Tag` 등)
- 닫기(×) 버튼 → 비교 목록 제거 + 체크박스 해제

### `CommuteGradeBadge.tsx`
- `commuteTimes` 받아서 S/A/B/C 배지 렌더링
- `ComplexInfoPanel`과 `CompareCard`에서 공통 사용
- 등급 로직은 `types/index.ts`의 `calcCommuteGrade()`로 단일 관리

### `PriceChart.tsx`
- props: `rows: ChartDataRow[]`, `series: ChartSeries[]`
- 매매가: 파란 계열 실선 / 전세가: 빨간 계열 점선
- 하단 SVG 범례, 빈 데이터 시 placeholder

### `PriceInputForm.tsx`
- 날짜 / 금액(한글 파싱: "7억5천") / 층수 / 메모 / 구글시트 여부
- 참고가 서브행: 호가·전고점·전저점·10년등락·등락률 (평형별)

### `PriceRangeFilter.tsx`
- 금액대 셀렉트박스 + 금액대 선택 시 평형 셀렉트박스 표시
- `getAreaTypes(range)` — `areaTypePriceRanges`에서 해당 금액대 평형만 추출

### `ComplexListModal.tsx`
- 헤더 하단 드롭다운 패널 (`position: fixed, top: 56px`)
- `range` + `areaType` 동시 필터 지원
- 단지 클릭 → `onSelect` → ComplexInfoPanel + 지도 이동

---

## 백엔드 연동 시 주의사항

### `PriceHistoryItem` 참고가 필드
- `askingPrice`, `highestPrice`, `lowestPrice`, `tenYearChangeRate`, `tenYearChangeAmount` 모두 **item 레벨**에 있음 (history 레벨 아님)
- ComplexInfoPanel에서는 `latestHistory?.items[0]` 기준으로 표시

### MOLIT 실거래가 API
- 서비스 키 `+` 문자 → `%2B` 인코딩 필요 (백엔드에서 처리)
- 구 단위 조회 시 타임아웃 발생 → 동 단위 필터링 필요 (백엔드 개선 필요)

---

## 백엔드 추가 작업 필요 항목

> 백엔드: **Python + FastAPI** (SQLAlchemy ORM 또는 직접 SQL)

| 항목 | 설명 |
|------|------|
| `SchoolInfo` / `InfraInfo` 모델에 `latitude`, `longitude` (Float) 추가 | 단지 선택 시 지도 오버레이 마커 표시에 사용 |
| `ApartmentComplex` 응답에 `priceItems` 포함 | 금액대 필터에서 평형 정보 표시 가능 |
| MOLIT 동 단위 필터링 | 법정동 기반 포스트 필터링 추가 |
| 실거래가 정확도 개선 | 단지명 매핑 로직 개선 후 RegisterModal 주석 해제 |

---

## 완료된 기능

- [x] 네이버 지도 + 단지 마커 (실제 금액 억 단위 표시)
- [x] 지도/검색으로 단지 등록 (가격·교통·출퇴근 입력)
- [x] 금액대 필터 → 단지 목록 팝업
- [x] 단지 상세 패널 (지하철 다중 노선, 소요시간, 참고가)
- [x] 단지 삭제 기능 (2단계 확인)
- [x] 시세 기록 추가 (참고가 평형별 관리)
- [x] 시세 변동 그래프 — 평형별 다중 라인
- [x] 가격 행별 금액대 자동 계산 + 참고가 입력
- [x] 네이버 역 조회 + 도보 시간 자동 계산
- [x] 비교하기 기능 (최대 3개, 3등분 카드 뷰)
- [x] 입지 등급 배지 (S/A/B/C) — 공통 컴포넌트
- [x] favicon + 로고 이미지
- [x] Vercel(프론트) + Railway(백엔드+MySQL) 배포
- [x] 메모 textarea 번호 목록 자동 서식 (`useNumberedTextarea` 훅, RegisterModal·ComplexInfoPanel 공통 적용)
- [x] RegisterModal 학군 정보 섹션 (네이버 검색 + 도보거리 자동 계산, 학교유형·학업성취도·전교생수)
- [x] RegisterModal 주변 인프라 섹션 (유형 셀렉트 key 전송, 네이버 검색 + 도보거리 자동 계산)
- [x] RegisterModal 재개발·재건축·리모델링 섹션 (유형 체크박스 + 진행단계 셀렉트)
- [x] RegisterModal 임장 유형 섹션 (분위기/단지/매물/임장X)
- [x] ComplexInfoPanel 학군·인프라·재개발·임장·직장밀도 섹션 표시
- [x] ComplexInfoPanel / CompareCard 종합평가 섹션 (직장·교통·학군·환경 S/A/B/C 4칸 그리드)
- [x] 지역 직장 밀도 등급 표시 (`RegionWorkplaceConst` 기반, `grade`/`employees`/`businesses`)
- [x] 학군 등급 배지 (중학교 achievementScore 기준) / 인프라 등급 배지 (백화점·마트 기준)
- [x] CompareCard를 ComplexInfoPanel 기준으로 전 섹션 동기화
- [x] ComplexInfoPanel / CompareCard 섹션 순서 재정렬 (직장→교통→학군→환경) 및 제목 변경
- [x] 종합평가 카드 클릭 시 해당 섹션 스크롤 (ComplexInfoPanel: 개별 스크롤 / CompareCard: window 이벤트로 전체 카드 동기화)
- [x] 학교·인프라 좌표 DB 저장 (RegisterModal 검색 선택 시 mapx/mapy → latitude/longitude 저장 후 백엔드 전송)
- [x] 단지 선택 시 학교·인프라 오버레이 마커 지도 표시 (좌표 있는 항목만, 패널 닫으면 제거)
- [x] ComplexInfoPanel 학군/인프라 인라인 추가·편집 (연필 버튼, 네이버 검색, 도보거리 자동계산, 저장 후 재조회)
- [x] 백엔드 학군/인프라 단건 추가(POST)·수정(PATCH) 엔드포인트 추가 (`complex_service`, `complexes.py`)
- [x] 지도 마커 CSS 핀 스타일 변경 (회전 정사각형, `border-radius+rotate`) + hover 단지명 tooltip (body 직속 div로 stacking context 탈출)
- [x] 즐겨찾기 기능 (`isFavorite` 필드, `PATCH /api/complexes/:id/favorite`, RegisterModal 별 버튼, ComplexInfoPanel 낙관적 토글, CompareCard 읽기전용 표시, 지도 즐겨찾기 단지 별 모양 SVG 마커)

## 미완성 / TODO

- [ ] 실거래가 자동조회 (RegisterModal 주석 해제) — 정확도 개선 필요
- [ ] 금액대 필터 버튼에 평형 표시 — 백엔드 priceItems 포함 필요
- [ ] 시세 기록 삭제 기능
- [ ] 시세 그래프 기간 필터 (3개월 / 6개월 / 1년)
- [ ] 지도 마커 클러스터링
- [ ] 반응형 레이아웃 (모바일)
