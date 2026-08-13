# CLAUDE.md — DoTheRich 프론트엔드 개발 가이드

> **이 파일은 Claude가 개발·수정 전에 반드시 읽고, 작업 완료 후 반드시 업데이트해야 합니다.**

---

## 개발 규칙

- **프론트엔드(doTheRichFront)만 수정.** 백엔드(doTheRichBack)는 원칙적으로 수정하지 않는다.
- 백엔드 변경이 필요한 경우, 변경 내용을 텍스트로 설명하고 구현은 사용자에게 맡긴다. (단, 사용자가 명시적으로 요청 시 직접 수정 가능)
- 모든 소스 파일에 **한국어 주석** 작성 (로직 설명, Why 위주).
- TypeScript 타입 오류 없이 `npx tsc --noEmit` 통과 확인 후 완료 보고.
- **API 응답은 반드시 camelCase로 변환** — 백엔드(Python)는 snake_case 반환. `api.ts` 내 함수에서 `data.map(item => ({ camelCaseKey: item.snake_key }))` 변환 레이어 적용. `return data` 그대로 쓰지 않는다.
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
├── constants/
│   └── hazardCategories.ts   # 유해시설 매크로 카테고리 매핑 (11개 파일 → 7개 그룹), 폐기물/화학 세분류 정리
├── utils/
│   └── districtGeoJson.ts    # EPSG:5179 → WGS84 변환 (proj4), 행정구역 GeoJSON 캐시
├── pages/
│   └── MapPage.tsx           # 네이버 지도 초기화, 마커 렌더링
└── components/
    ├── PriceRangeFilter.tsx  # 헤더 금액대 필터 버튼
    ├── ComplexListModal.tsx  # 금액대 클릭 시 단지 목록 팝업
    ├── CompareListModal.tsx  # 비교하기 단지 선택 패널 (헤더 하단 드롭다운) + 비교평가 모드 토글
    ├── ComparisonEvalPanel.tsx # 1:1 비교평가 패널 (사진+메모, 가치평가, 가격비교, 결론)
    ├── CompareCard.tsx       # 비교 뷰 단지 카드 (ComplexInfoPanel과 동일 표시, 수정/삭제 기능 제외)
    ├── ChecklistSection.tsx  # 임장 체크리스트 섹션 (ComplexInfoPanel 내부 사용)
    ├── CommuteGradeBadge.tsx # 입지 등급 배지 (S/A/B/C) — 공통 컴포넌트
    ├── DistrictSelector.tsx  # 행정구역 경계 선택 드롭다운
    ├── FilterPanel.tsx       # 종합 필터 패널
    ├── SearchBar.tsx         # 네이버 장소 검색
    ├── RegisterModal.tsx     # 단지 등록 폼 (가격·교통·출퇴근 입력)
    ├── ComplexInfoPanel.tsx  # 우측 단지 상세 패널
    ├── LivingZonePanel.tsx   # 우측 생활권 관리 패널 (ComplexInfoPanel과 상호 배타)
    ├── RoutePanel.tsx        # 우측 경로 관리 패널 (지도 클릭 경로 그리기·수정·삭제)
    ├── PriceChart.tsx        # 평형×매매/전세 다중 라인 차트
    └── PriceInputForm.tsx    # 시세 기록 추가 폼 (패널 내)
public/
├── favicon.ico               # 파비콘
├── do_the_rich.png           # 헤더 로고 이미지
└── data/                     # 유해시설 JSON 데이터 (공공데이터 기반, 브라우저에서 fetch)
    ├── waste-facilities.json            # 폐기물 처리시설 (10,568개)
    ├── chemical-facilities.json         # 화학·위험 제조시설 (3,588개)
    ├── construction-material-factories.json # 건설재료 공장 (2,086개)
    ├── funeral-homes.json               # 장례식장 (901개)
    ├── animal-shelters.json             # 동물보호소 (332개)
    ├── cemeteries.json                  # 묘지 (340개)
    ├── columbarium-facilities.json      # 납골당 (226개)
    ├── natural-burial-sites.json        # 자연장지 (78개)
    ├── crematoriums.json                # 화장시설 (58개)
    ├── correctional-facilities.json     # 교정시설 (55개)
    └── energy-storage-bases.json        # 에너지 저장소 (9개)
```

---

## 타입 구조 (`src/types/index.ts`)

### 핵심 인터페이스

```typescript
// 지도 오버레이 마커 (학교·인프라·유해시설 위치 표시)
OverlayMarker { id, name, lat, lng, markerType: 'school'|'infra'|'hazard', subType? }

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

// 유해시설 정보 (카테고리 분류 포함)
HazardInfo { id, hazardName, distanceM?, macroCategory?, subCategory? }

// 출퇴근 시간 (직선거리 포함)
CommuteTime { destination, minutes?, transfers?, transportMode?, transferLines?, distanceKm? }

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

// 경로 좌표 한 점
RoutePoint { lat: number; lng: number }

// 저장된 지도 경로
MapRoute { id: number; name: string; points: RoutePoint[]; createdAt: string }

// 체크리스트 입력 유형 — 항목별 저장 방식 결정
ChecklistInputType = 'RATING' | 'OX' | 'TEXT'
ChecklistRating = 'UPPER' | 'MIDDLE' | 'LOWER' | 'O' | 'X' | null

// 체크리스트 템플릿 항목
ChecklistTemplate { id, visitType: 'ATMOSPHERE'|'COMPLEX'|'PROPERTY', category?: string, itemName, displayOrder, inputType?: ChecklistInputType }
// category: 카테고리 그룹 (null=미분류). 분위기=[직장/교통/학군/환경], 매물=[거실/베란다/방/주방/기타] 등 사용자 정의
// inputType: RATING=상중하(default), OX=O/X 버튼, TEXT=자유 텍스트 입력

// 단지 체크 결과 (미체크 항목도 rating=null로 포함)
ChecklistResultItem { id, templateId, itemName, visitType, category?, displayOrder, inputType?: ChecklistInputType, rating: ChecklistRating, memo: string|null }

// 생활권 분위기 체크 결과 (ATMOSPHERE 타입 템플릿만 포함)
ZoneChecklistResultItem { id, templateId, itemName, category?, displayOrder, inputType?: ChecklistInputType, rating: ChecklistRating, memo: string|null }

// 매물 임장 체크리스트 결과 (PROPERTY 타입 템플릿 기준)
PropertyVisitResultItem { id, templateId, itemName, category?, displayOrder, inputType?: ChecklistInputType, rating: ChecklistRating, memo?: string|null }

// 매물 임장 기록 1건 (부동산·동호수·평형·금액 + 체크리스트 results 배열 포함)
PropertyVisit { id, complexId, visitDate?, agentName?, officePhone?, mobilePhone?, dong?, hosu?, areaType?, price?, memo?, createdAt, results: PropertyVisitResultItem[] }

// 공공단지 (건축물대장 API 수집, 150세대↑ 공동주택)
PublicComplex { id, guName?, bldNm?, address?, hhldCnt?, vlRat?, parkingCnt?, useAprDay?, latitude, longitude }
// useAprDay: YYYYMMDD 형식 사용승인일

// 공통코드 — DB로 관리하는 코드 그룹 테이블
CommonCode { id, commonCode, commonCodeName, detailCode, detailCodeName, sortOrder, createdAt }
// UNIQUE(commonCode, detailCode) 제약
// 자산 셀 복합키: common_code='ASSET_CELL', detail_code='{codeKey}_{USERID}' (예: STOCK_LDY)
//   detailCodeName을 ','로 split → 세부 내역 모달 계좌명 템플릿으로 사용
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
| GET | `/api/living-zones` | 생활권 목록 (district 쿼리 파라미터로 필터) |
| POST | `/api/living-zones` | 생활권 등록 |
| PATCH | `/api/living-zones/:id/memo` | 생활권 메모 수정 |
| POST | `/api/living-zones/:id/complexes` | 생활권에 단지 추가 |
| DELETE | `/api/living-zones/:id/complexes/:complexId` | 생활권에서 단지 제거 |
| DELETE | `/api/living-zones/:id` | 생활권 삭제 |
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
| PATCH | `/api/complexes/:id/basic-info` | 연식·세대수 수정 — `{ builtYear?, unitCount? }` |
| PATCH | `/api/complexes/:id/visit-type` | 임장 유형 수정 — `{ visitType: string }` |
| PATCH | `/api/complexes/:id/commute-times` | 출퇴근 시간 일괄 교체 — `CommuteTimeRequest[]` (기존 삭제 후 재삽입) |
| GET | `/api/routes` | 경로 목록 조회 |
| POST | `/api/routes` | 경로 저장 (201) — `{ name, points: RoutePoint[] }` |
| PATCH | `/api/routes/:id` | 경로 수정 — `{ name, points: RoutePoint[] }` |
| DELETE | `/api/routes/:id` | 경로 삭제 (204) |
| GET | `/api/checklists/templates` | 체크리스트 템플릿 목록 (visitType 필터 가능) |
| POST | `/api/checklists/templates` | 템플릿 항목 추가 — `{ visitType, itemName, displayOrder? }` |
| PATCH | `/api/checklists/templates/:id` | 템플릿 항목 수정 — `{ itemName?, displayOrder? }` |
| DELETE | `/api/checklists/templates/:id` | 템플릿 항목 삭제 (연결 결과 CASCADE, 204) |
| GET | `/api/complexes/:id/checklists` | 단지 체크 결과 조회 (미체크 항목도 포함, visitType 필터 가능) |
| PATCH | `/api/complexes/:id/checklists/:templateId` | 체크 결과 upsert — `{ rating?, memo? }` (rating/memo 모두 null이면 결과 행 삭제) |
| GET | `/api/living-zones?complexId=X` | 특정 단지가 포함된 생활권 목록 조회 |
| GET | `/api/living-zones/:id/checklists` | 생활권 분위기 체크리스트 조회 (ATMOSPHERE 템플릿, 미체크 포함) |
| PATCH | `/api/living-zones/:id/checklists/:templateId` | 생활권 체크 결과 upsert — `{ rating?, memo? }` |
| PATCH | `/api/living-zones/:id/polygon` | 생활권 구획 폴리곤 저장 — `{ polygonPoints: [{lat,lng},...] \| null }` |
| GET | `/api/complexes/:id/property-visits` | 매물 임장 기록 목록 (created_at 내림차순, PROPERTY 템플릿 결과 포함) |
| POST | `/api/complexes/:id/property-visits` | 매물 임장 기록 추가 (201) — `PropertyVisitRequest` |
| PATCH | `/api/complexes/:id/property-visits/:visitId` | 매물 임장 기록 수정 — `PropertyVisitRequest` |
| DELETE | `/api/complexes/:id/property-visits/:visitId` | 매물 임장 기록 삭제 (결과 CASCADE, 204) |
| PATCH | `/api/complexes/:id/property-visits/:visitId/checklists/:templateId` | 매물 체크 결과 upsert — `{ rating? }` |
| GET | `/api/district-stats` | 구별 시세 통계 조회 — `?trade_month=YYYYMM` (미지정 시 최신 월) |
| POST | `/api/district-stats/collect` | 서울 25구 MOLIT 시세 수집 (202 백그라운드) |
| GET | `/api/public-complexes/gu-list` | 서울 25구 목록 (guName + sigunguCd) |
| GET | `/api/public-complexes?sigungu_cd=` | 공공단지 목록 (좌표 있는 것만, snake_case 반환 → api.ts에서 camelCase 변환) |
| GET | `/api/public-complexes/gu-list` | 수도권 지역 목록 — `{ guName, sigunguCd, province }[]` |
| POST | `/api/public-complexes/collect` | 지정 지역 공공단지 수집 — `{ gu_name }` (백그라운드 실행) |
| GET | `/api/budget/entries?user_id=&year_month=` | 월별 가계부 항목 목록 |
| POST | `/api/budget/entries` | 가계부 항목 추가 (201) |
| PATCH | `/api/budget/entries/:id` | 가계부 항목 수정 |
| DELETE | `/api/budget/entries/:id` | 가계부 항목 삭제 (204) |
| GET | `/api/budget/summary?user_id=&year_month=` | 월별 가계부 요약 |
| GET | `/api/assets?user_id=` | 자산 목록 조회 (레거시) |
| POST | `/api/assets` | 자산 추가 (레거시, 201) |
| PATCH | `/api/assets/:id` | 자산 수정 (레거시) |
| DELETE | `/api/assets/:id` | 자산 삭제 (레거시, 204) |
| GET | `/api/assets/snapshots/all` | 전체 유저 스냅샷 목록 (그래프·통합 보기용) |
| GET | `/api/assets/snapshots?user_id=` | 특정 유저 스냅샷 목록 |
| PUT | `/api/assets/snapshots/cell` | 단일 셀 upsert — `{user_id, snapshot_date, asset_type, amount}` |
| POST | `/api/assets/snapshots/copy` | 날짜 간 스냅샷 복사 — `{user_id, from_date, to_date}` |
| DELETE | `/api/assets/snapshots/{snapshot_date}?user_id=` | 특정 날짜 스냅샷 전체 삭제 |
| GET | `/api/assets/snapshots/details?snapshot_date=` | 특정 날짜 세부 항목 목록 (전체 유저) |
| POST | `/api/assets/snapshots/details/bulk` | 세부 항목 일괄 저장 + 스냅샷 셀 합산 자동 업데이트 — `{snapshot_date, items:[{user_id, asset_type, account_name, amount}]}` |
| GET | `/api/common-codes?common_code=` | 공통코드 목록 (그룹 필터 가능) |
| POST | `/api/common-codes` | 공통코드 등록 (201) |
| PATCH | `/api/common-codes/:id` | 공통코드 수정 |
| DELETE | `/api/common-codes/:id` | 공통코드 삭제 (204) |

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
- `livingZoneOpen` → LivingZonePanel 표시 (ComplexInfoPanel과 상호 배타)
  - 생활권 버튼 클릭 시 selectedComplex 초기화 → ComplexInfoPanel 닫힘
  - 마커 클릭 시 `handleComplexSelect` → livingZoneOpen 닫힘
- **생활권 구획 그리기 상태**:
  - `isDrawingZone` — 구획 그리기 모드 (지도 클릭이 꼭지점 추가로 동작)
  - `drawingZonePoints: RoutePoint[]` — 현재 그리는 중인 폴리곤 꼭지점 배열
  - `targetZoneId: number | null` — 구획을 지정할 대상 생활권 ID
  - `zonePolygons` — 저장된 구획 폴리곤 목록 (MapPage 오버레이용, LivingZonePanel이 채워줌)
  - `handleStartZoneDrawing(zoneId)`: 구획 그리기 시작
  - `handleConfirmZoneDrawing()`: 3개 미만 점 → alert, 내부 단지 없음 → alert, confirm 후 단지 추가 + 폴리곤 저장 병렬 처리, 완료 시 `livingZoneRefreshKey` 증가로 패널 리로드
  - 구획 플로팅 바: 점 개수 · ↩ 삭제 · 확인(3개 이상 활성) · 취소
- `myComplexListOpen` → ComplexListModal(전체, 단지명 검색) 오픈 (헤더 "내 단지" 버튼)
- **공공단지 상태**:
  - `guList` — 서울 25구 목록 (앱 마운트 시 1회 로드)
  - `publicComplexes: PublicComplex[]` — 선택 구의 공공단지 목록 (좌표 있는 것만)
  - `showPublicComplexes` / `showMyComplexes` — 지도 마커 on/off 토글 (구 변경 시 둘 다 true로 초기화)
  - 구 선택 시 헤더에 **내단지** / **아파트** 버튼 표시 → 각각 내 단지 마커 / 공공단지 마커 토글
  - MapPage에 `showMyComplexes ? filteredComplexes : []` / `showPublicComplexes ? publicComplexes : []` 전달
- 검색 결과 선택 시 `fromSearch:true`로 RegisterModal 오픈
- **경로 상태**:
  - `routePanelOpen` → RoutePanel 표시 (헤더 "경로" 버튼)
  - `routes: MapRoute[]` — 저장된 경로 목록
  - `activeRouteIds: Set<number>` — 지도에 표시할 경로 ID 집합
  - `isDrawingRoute` — 경로 그리기 모드 (클릭 시 점 추가)
  - `drawingPoints: RoutePoint[]` — 현재 그리는 중인 점 배열
  - `editingRouteId: number | null` — 수정 중인 경로 ID (null=신규)
  - `routeName` — 저장할 경로 이름 입력
  - `handleClosRoutePanel()`: 패널 닫기 + 경로 상태 전체 초기화 → MapPage에 빈 경로 배열 전달
  - `handleToggleActiveRoute(id)`: activeRouteIds에서 id 토글
  - `handleStartEditRoute(route)`: editingRouteId 설정 + 기존 점 로드 + isDrawingRoute=true
  - `handleUndoLastPoint()`: drawingPoints 마지막 점 제거
  - `handleSaveRoute()`: editingRouteId 있으면 PATCH, 없으면 POST
  - MapPage에 전달: `routePanelOpen ? routes.filter(r => activeRouteIds.has(r.id)) : []`

### `LivingZonePanel.tsx`
- 헤더 "생활권" 버튼 클릭 시 우측 사이드패널로 표시
- 지역구 셀렉트 필터 (기존 생활권에서 추출) + "+ 생활권 추가" 버튼
- 생활권 생성 폼: 이름 + 지역구 셀렉트 (`complexes`의 `region` distinct 목록), Enter/저장
- 생활권 카드: 클릭 펼침/닫힘, 지역구 배지 + 단지 수 + 메모 미리보기
- 메모 인라인 편집 (✏ 버튼 or 텍스트 클릭)
- 단지 목록: 이름·금액대·지역 읽기전용 표시 (× 버튼 없음)
- **단지 선택 체크박스 패널**: "단지 수정" / "+ 단지 추가" 버튼 클릭 시 펼침
  - ⚠️ 지역구 조건 없이 모든 단지 표시 (기존에는 `zone.district === c.region` 조건 있었으나 제거)
  - 기존 포함된 단지 미리 체크 (`pendingIds` Set 초기화)
  - 체크/해제로 추가·제거 예약, 저장 시 `Promise.all`로 일괄 반영
  - 하단 "X개 선택됨" + 취소/저장 버튼
- **구획 그리기**: 포함 단지 섹션 헤더의 "구획 그리기" 버튼 → `onStartZoneDrawing(zoneId)` 콜백 → 지도 폴리곤 입력 모드
- 생활권 삭제: 카드 우측 × → 2단계 확인
- 신규 생활권 생성 후 자동 펼침
- `onZonePolygonsChange` prop: 생활권 로드 시 폴리곤이 있는 생활권 좌표 목록을 App.tsx에 전달 → MapPage 오버레이 갱신

### `MapPage.tsx`
- 네이버 지도 초기화 (서울 중심, zoom 12)
- 단지마다 CSS 회전 핀 마커 (30×30px, `border-radius:50% 50% 50% 4px` + `rotate(-45deg)`)
  - 색상: 10억 미만=파랑, 15억 미만=노랑, 20억 미만=빨강, 그 외=검정
  - 마커 hover 시 단지명 tooltip 표시 — tooltip은 `document.body` 직속 div (`z-index:2147483647`)로 생성해 Naver Maps의 CSS transform stacking context를 탈출, 항상 최상위 렌더링
  - `window.__mkTipShow / __mkTipHide` 전역 함수로 마커 인라인 이벤트에서 제어
- 마커 클릭 → InfoWindow + `onComplexSelect`
- 지도 클릭 → 역방향 지오코딩 → `onMapClick` 콜백으로 주소 전달
- `focusLocation` 변경 시 지도 중심/줌(15) 이동
- `overlayMarkers` 변경 시 학교·인프라·유해시설 오버레이 마커 렌더링
  - 학교: 중=파랑/초=초록
  - 인프라: 백화점=보라/마트=주황/병원=빨강/기타=회색
  - 유해시설: 검정 CSS border 삼각형 ▲ + 시설명 4글자 (markerType='hazard')
- `radiusCenter` prop 변경 시 도보 30분 반경 원(2km, 파란 점선) 그리기/제거 (`circleRef`로 단일 인스턴스 관리)
- 내 위치 버튼: 지도 **좌상단** (top: 12px, left: 12px) 📍 플로팅 버튼 (모바일에서 경로 목록 버튼에 가리지 않도록 이동)
- **경로 그리기**:
  - `isDrawingRoute=true` 시 지도 커서 `crosshair`, 클릭 리스너 등록 → `onRoutePointAdd(lat, lng)` 콜백
  - `drawingPoints` 변경 시: 첫 점=빨간 Marker, 나머지=파란 Marker + 점 2개부터 `shortdash` Polyline
  - `routes` 변경 시: `ROUTE_COLORS` 팔레트 순서로 Polyline 그리기 (strokeWeight 4)
  - `routePolylinesRef` / `drawingPolylineRef` / `drawingMarkersRef`로 오버레이 수명 관리
- **생활권 구획 그리기**:
  - `isDrawingZone=true` 시 지도 커서 `crosshair`, 별도 클릭 리스너 등록 → `onZonePointAdd(lat, lng)` 콜백
  - `drawingZonePoints` 변경 시: 초록 원 꼭지점 마커 + 3개 이상이면 반투명 초록 Polygon / 2개 이하면 Polyline
  - `zonePolygons` 변경 시: 저장된 구획을 반투명 초록 `shortdash` Polygon + 생활권 이름 라벨 마커로 표시
  - `zoneClickListenerRef` / `zonePolygonRef` / `zoneMarkersRef` / `zoneSavedPolygonsRef` / `zoneLabelMarkersRef`로 수명 관리
- **공공단지 마커** (`publicComplexes` prop):
  - 줌 14 미만: 숨김 / 줌 14~14: 단지명만 / 줌 15+: 연식·세대수·용적·주차 세부정보 (CSS `pc-detail` 클래스로 마커 재생성 없이 토글)
  - **좌표 근접 그룹화** (0.0003°≈30m 이내): 세대수 내림차순 정렬 후 greedy grouping
    - 단일 단지: `pointer-events:none` 카드 (경로 그리기 방해 없음)
    - 다중 단지(2개+): `class="pc-multi"` → 이름 목록 + `▼ N개` 표시, 클릭 시 각 단지 상세 펼침 / 재클릭 시 `▲ 닫기`로 접힘
  - `window.__pcGroupClick(groupId)` 전역 함수로 토글, `pcGroupMapRef`에 {marker, complexes, expanded} 저장
  - `isDrawingRoute || isDrawingZone` 시 CSS `pc-multi { pointer-events:none }` 자동 전환 (별도 useEffect)
  - `publicComplexMarkersRef` / `pcGroupMapRef`로 수명 관리, 빈 배열 전달 시 전체 제거

### `RegisterModal.tsx`
- 섹션: 기본정보 / 가격정보 / 단지정보 / 교통정보 / 출퇴근시간 / 유해시설 / 메모
- **가격정보 행**: 평형 | 층수 | 매매가 | 전세가 | 전세율 | 금액대(자동) | ×
  - **참고가 서브행**: 호가 | 전고점 | 전저점 | 10년 등락(A-B 패턴 자동계산) | 등락률
- 교통정보: 역명 → 네이버 API 호선 자동 조회 + 도보시간 계산
- 출퇴근시간: 강남/시청/여의도/발산/마곡나루 + 분 입력
  - 직선거리(`distanceKm`) 자동 계산 — `DESTINATION_COORDS`로 단지 좌표와 Haversine 거리 계산, "조회" 버튼 옆에 `{km}km` 표시
- **유해시설 자동탐지**: 단지 좌표 기준 2km 반경 내 시설 자동 제안
  - `Promise.allSettled`로 11개 JSON 파일 병렬 fetch
  - `동물병원` 포함 시설명 필터링 제외
  - `FACILITY_MACRO_CATEGORY` + `getSimplifiedCategory`로 매크로/서브 카테고리 자동 분류
  - 매크로 카테고리 배지(빨강) + 서브 카테고리 배지(회색) 표시
- ⚠️ 실거래가 자동조회 — 정확도 문제로 주석처리

### `RoutePanel.tsx`
- 헤더 "경로" 버튼 클릭 시 우측 사이드패널로 표시
- "+ 신규 경로 그리기" 버튼 → `isDrawingRoute=true` (그리는 중엔 비활성화)
- 저장된 경로 목록: `ROUTE_COLORS` 팔레트 순서대로 색상 점 표시
  - 클릭 시 지도 표시 토글 (`activeRouteIds` 기반), 활성 시 색상 점 확대 + glow
  - 활성 경로에 거리(km) + 도보시간(분) 표시 (`haversineMeters` + `calcRouteStats`)
  - "✏ 경로 수정" 버튼: 활성 + 비그리기 상태에서만 표시 → `onStartEdit`
  - 삭제 버튼(×): `window.confirm()` 후 `onDelete`
- `isMobile` prop으로 너비 조절 (`'100%'` or `'320px'`)

### `ComplexInfoPanel.tsx`
- 단지 선택 시 `GET /api/complexes/:id/price-history` 조회
- **섹션 순서**: 단지정보(참고가·메모) → 종합평가 → 체크리스트 → 지하철 → 직장 → 교통 → 학군 → 환경 → 유해시설 → 재개발정보 → 임장유형 → 시세변동 → 최근기록
- **종합평가**: 직장·교통·학군·환경 4칸 그리드, 각 S/A/B/C 배지 (데이터 없으면 `-`) — 클릭 시 해당 섹션으로 스크롤 (섹션 없으면 무동작)
- **직장**: `complex.grade` 기반 배지 + 종사자수·사업체수 (`RegionWorkplaceConst`, DB 미저장)
- **교통**: 항상 표시. 데이터 없으면 안내 문구. ✏ 버튼 → 편집 모드: 5개 고정 목적지 카드 스타일(강남/시청/여의도/발산/마곡나루), "조회" 버튼으로 네이버 지도 대중교통 경로 팝업, 분·환승횟수·환승노선(➡️ 구분자)·교통수단 입력 후 PATCH `/commute-times` (일괄 교체). `CommuteGradeBadge` 배지 표시. 환승 노선은 `transferLines` 필드(`' ➡️ '` join 문자열)로 저장·표시
  - **읽기 모드**: 목적지명 옆에 직선거리 `{distanceKm}km` 표시 (데이터 있을 때만)
- **학군**: 중학교 `achievementScore` 기준 등급 배지 (S≥95/A≥90/B≥85/C) — 중학교 없으면 배지 미표시
- **환경**: 주변 인프라, 항상 등급 배지 표시 (백화점 2개↑=S / 1개=A / 마트 1개↑=B / 나머지=C)
- **유해시설**: 항상 섹션 표시. 등록된 유해시설이 없을 때 자동탐지 실행
  - `useEffect(complex?.id)` 트리거 → `Promise.allSettled` 11개 JSON 병렬 fetch
  - 단지 좌표 기준 2km 이내 + `동물병원` 미포함 시설 필터링
  - `getSimplifiedCategory`로 매크로(빨강 배지) + 서브 카테고리(회색 배지) 분류
  - 지도 오버레이 마커에도 hazardInfos 포함 (좌표 있는 항목만, markerType='hazard')
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
- 단지명 검색 입력 + 즐겨찾기 필터 + 금액대 필터 + 체크박스 목록
- **비교평가 모드 토글** (헤더 내 버튼): normal(최대 3개) / evaluation(최대 2개)
- 선택 행 파란 배경 하이라이트

### `ComparisonEvalPanel.tsx`
- 비교평가 모드에서 2개 단지 선택 시 우측에 표시되는 패널
- 마운트 시 `GET /api/comparisons`로 두 단지에 해당하는 기존 비교 자동 로드
- **사진**: 업로드(POST + multipart), 메모 인라인 편집(PATCH), 삭제(DELETE), 썸네일 클릭 시 원본 새 탭
- **텍스트 필드**: 가치 평가 / 가격 비교 평가 / 메모 / 결론 (textarea)
- **저장**: 기존 없으면 POST, 있으면 PATCH (저장 후 사진 업로드 활성화)
- **삭제**: 전체 비교 평가 + CASCADE 사진 삭제
- 저장 전에는 사진 업로드 비활성 + 안내 문구 표시

### `CompareCard.tsx`
- 비교 뷰에서 1/3 너비로 표시되는 단지 카드 (ComplexInfoPanel과 동일 내용, 수정/삭제 기능 제외)
- **섹션 순서**: 헤더(파랑) → 단지정보(참고가) → 종합평가 → 지하철 → 직장 → 교통 → 학군 → 환경 → 유해시설 → 재개발정보 → 임장유형 → 시세변동 → 최근 5건
- **종합평가 동기화 스크롤**: 어느 카드에서든 직장·교통·학군·환경 클릭 시 `window` 커스텀 이벤트(`compare-section-scroll`) 발행 → 마운트된 모든 카드가 각자의 해당 섹션으로 동시 스크롤 (섹션 없는 카드는 무동작)
- `latestItemPerAreaType` Map으로 전체 이력에서 평형별 최신 시세 항목 집계 (ComplexInfoPanel과 동일 방식)
- `buildChartData` dateMap 머징 — 같은 날짜 기록 하나의 X축 포인트로 합산
- 참고가: 평형별 `latestItemPerAreaType` 기준 (호가·전고점·전저점·10년등락 chips)
- 교통: 항상 표시, 데이터 없으면 "출퇴근 시간 정보 없음" 안내. 목적지명 옆 직선거리(`distanceKm`) 표시
- 환경: 항상 표시 + 인프라 등급 배지, 데이터 없으면 "인프라 정보 없음" 안내
- 유해시설: 등록된 데이터 있을 때만 표시. 매크로 카테고리(빨강 배지) + 서브 카테고리(회색 배지) + 거리(m) 표시
- 임장유형: 항상 표시 (`VISIT_TYPE_LABELS`, NONE 포함)
- 최근 기록: 5건, ▲/▼ 변동(억+%) + KB가 + 참고가 chips
- ComplexInfoPanel과 동일한 등급 로직·레이블 맵 내장 (`calcSchoolGrade`, `calcInfraGrade`, `GRADE_COLORS`, `Tag` 등)
- 닫기(×) 버튼 → 비교 목록 제거 + 체크박스 해제

### `ChecklistTemplatePanel.tsx`
- 헤더 "체크리스트" 버튼 클릭 시 우측 사이드패널 (300px)
- visitType 탭(분위기/단지/매물) + **카테고리 2레벨 UI**
  - 카테고리 헤더 + 항목 목록 + 항목 추가 입력 (카테고리별)
  - 카테고리 추가: 하단 입력창 → 로컬 pendingCats 상태로 관리 (첫 항목 추가 시 DB 반영)
  - 카테고리 삭제: 해당 카테고리 모든 항목 일괄 deleteChecklistTemplate (confirm 후)
  - 항목 추가 시 **입력 유형 선택** (상중하/O/X/텍스트 세그먼트 토글) — `InputTypeToggle` 인라인 컴포넌트
  - 항목 수정: ✏ 버튼 → 인라인 편집 (Enter 저장, Esc 취소) + 입력 유형 변경 가능
  - 기존 항목에 inputType 배지 표시 (상중하=파랑, O/X=초록, 텍스트=주황)
  - 항목 삭제: × 버튼 → confirm 후 삭제
  - `category` 없는 항목은 "미분류" 그룹으로 표시 (카테고리 삭제 버튼 없음)

### `ChecklistModal.tsx`
- 단지 체크리스트 모달 (600px, 86vh)
- **분위기/단지 탭**: 카테고리별 그룹 헤더, `renderItemInput(item)` 헬퍼로 inputType별 렌더링
  - RATING: 상/중/하 버튼 즉시 저장
  - OX: O(초록)/X(빨강) 버튼 즉시 저장 (rating 필드 활용)
  - TEXT: 텍스트 input, blur/Enter 시 저장 (memo 필드 활용, `localTexts` 로컬 상태)
- **매물 탭**: 매물 임장 기록 카드 UI, `renderVisitItemInput(visit, item)` 헬퍼 동일 방식
  - `getPropertyVisits(complexId)`로 기록 목록 로드 (탭 전환 시 로드)
  - "+ 새 매물 기록 추가" 버튼 → 인라인 폼 (방문일·부동산·동·호수·평형·금액만원·메모)
  - 카드 헤더: 부동산명, 동호수, 평형 배지, 금액, 날짜, 체크N/M — 클릭으로 펼침/닫힘
  - 카드별 ✏ 수정 / × 삭제 버튼 (수정 시 기존 results 유지)
  - 금액 입력은 만원 단위 (화면 표시는 `formatPrice`로 억 단위)

### `LivingZonePanel.tsx`
- 생활권 카드 펼칠 때 `getZoneChecklist(zoneId)`로 분위기 체크리스트 로드
- **분위기 체크리스트 섹션**: "포함 단지" 섹션 아래에 표시
  - 카테고리별 그룹핑, inputType별 렌더링 (상중하/OX/텍스트)
  - OX: OX_COLORS 기반 O/X 버튼, TEXT: input blur/Enter 저장 (`zoneLocalTexts` 로컬 상태)
  - 체크리스트 없으면 섹션 미표시

### `CommuteGradeBadge.tsx`
- `commuteTimes` 받아서 S/A/B/C 배지 렌더링
- `ComplexInfoPanel`과 `CompareCard`에서 공통 사용
- 등급 로직은 `types/index.ts`의 `calcCommuteGrade()`로 단일 관리

### `DistrictStatsPanel.tsx`
- 헤더 "구별 시세" 버튼 클릭 시 우측 사이드패널 (640px, 모바일 전체화면)
- 상단 컨트롤: 거래월 셀렉트 + 매매/전세 탭 + 시세 수집 버튼 + 새로고침 버튼
- 테이블: 서울 25구 × 5개 평형대(18평/21평/24평/26평/33평) 평균가 + 거래 건수
  - 평형 구간 (전용면적 ±3m² 공차): 18평(전용59㎡) 56~62m², 21평(전용69㎡) 66~72m², 24평(전용79㎡) 76~82m², 26평(전용85㎡) 82~88m², 33평(전용109㎡) 106~112m²
  - 직거래(`dealing_gbn='직거래'`) 제외, `deal_year+deal_month` 기준 해당 월 거래만 집계
  - 현재 월은 수집·표시 제외; 직전 3개월 대상
  - 히트맵 색상 (낮=파랑 → 높=빨강, 평형대 내 상대적 비율 기준)
  - 값 표시: 억 단위 소수점 1자리 (1억 미만은 천만 단위), 건수 괄호 표시
  - 정렬: 데이터 있는 평형의 평균가 내림차순 (null 평형 제외, 합산 아님)
- "시세 수집" 클릭 → `POST /api/district-stats/collect` (202) → 5초 폴링, `collectedAt` 갱신 감지 시 완료 toast
- 매월 1일 02:00 자동 수집 (APScheduler CronTrigger)
- 하단 안내: 전용면적 기준 + 출처 표기

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
- `range` + `areaType` + `searchQuery` 동시 필터 지원
- 단지명 검색 입력 (실시간 필터, `useMemo` 의존배열에 `searchQuery` 포함 필수)
- 단지 클릭 → `onSelect` → ComplexInfoPanel + 지도 이동
- **2단계 그룹핑**: 지역구 sticky 헤더 → 평형 서브헤더(`전용 59` 형식, 숫자 오름차순) → 단지 그리드
  - 평형 정보 없는 경우 서브헤더 없이 표시
  - 한 단지가 여러 평형에 해당하면 각 평형 서브그룹에 각각 노출
  - 각 단지 카드: 금액대 배지(해당 평형 금액대) + 단지명 + 평형별 가격
- ⚠️ `useMemo` 의존배열에 `favoritesOnly`, `searchQuery` 누락 시 필터 미동작 버그 주의

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

### 완료된 백엔드 추가 작업
- ✅ `hazard_info` 테이블: `macro_category VARCHAR(50)`, `sub_category VARCHAR(50)` 컬럼 추가 (앱 시작 시 idempotent `ALTER TABLE` 마이그레이션)
- ✅ `commute_time` 테이블: `distance_km DOUBLE` 컬럼 추가 (동일 방식)
- ✅ `HazardInfoDto`/`HazardInfoRequest`: `macro_category`, `sub_category` 포함
- ✅ `CommuteTimeDto`/`CommuteTimeRequest`: `distance_km` 포함
- ✅ `complex_service.py`: `add_hazard_infos`, `update_hazard_info`, `update_commute_times`, `register` 함수에서 새 필드 저장

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
- [x] 메모 textarea 번호 목록 자동 서식 (`useNumberedTextarea` 훅, RegisterModal·ComplexInfoPanel·LivingZonePanel·ChecklistModal 매물 메모 공통 적용)
  - IME Enter 버그 수정: `isComposing=true` 시 기본 줄바꿈 차단 → `pendingEnterRef` → `onCompositionEnd`에서 처리 (윗줄 글자 복사 방지)
  - `onCompositionEnd` 핸들러 추가, 모든 사용처에 연결
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
- [x] 사진 등록·조회·삭제·슬라이드 (RegisterModal 업로드, ComplexInfoPanel 📷 버튼, PhotoSlideModal 무한슬라이드, 이미지 압축 절반 JPEG 0.85)
- [x] ComplexInfoPanel 참고가 평형별 탭 + 인라인 편집 (✏ 버튼, PATCH price-history-items)
- [x] ComplexInfoPanel 임장유형 항상 표시 + 인라인 셀렉트 편집 (PATCH /api/complexes/:id/visit-type)
- [x] ComplexInfoPanel 헤더 금액대 = areaType 숫자 최대값 기준, 평형별 가격 `|` 구분 표시
- [x] 지도 마커 임장유형 테두리 색상 (ATMOSPHERE=연초록/COMPLEX=초록/LISTING=진초록/NONE=흰색)
- [x] PriceRangeFilter 금액대 옵션에 해당 평형 목록 표시, 평형 셀렉트 controlled 상태, 닫기 시 초기화 (filterResetKey)
- [x] ComplexListModal 백드롭 클릭 닫힘 제거 (닫기 버튼만 닫힘)
- [x] ComplexListModal·CompareListModal 금액대 매칭 평형 배지 + 평형별 가격 표시
- [x] ComplexListModal 2단계 그룹핑 (지역 → 평형 서브그룹, 숫자 오름차순, `전용 XX` 형식)
- [x] CompareCard 메모 내용 label 아래 줄에 표시
- [x] 최근 기록 시세 변동률 표시 (직전 기록 동일 areaType 대비 ▲/▼ 억+%, 상승=빨강/하락=파랑)
- [x] 도보 30분 반경 원 토글 (ComplexInfoPanel 헤더 지역구명 옆 `반경` 버튼 → Naver Maps Circle 2km, 패널 닫기·단지 변경 시 자동 제거)
- [x] 생활권 관리 사이드패널 (헤더 "생활권" 버튼 → LivingZonePanel, ComplexInfoPanel과 상호 배타)
  - 생활권 CRUD (생성·메모편집·단지추가·단지제거·삭제), 지역구 필터, 카드 펼침/닫힘
  - 생활권 생성 지역구: 기존 단지 region distinct 셀렉트 박스로 선택
  - 단지 선택: 체크박스 패널 (지역구 일치 단지만, 기존 체크 유지, 일괄 저장)
- [x] 연식·세대수 인라인 편집 (ComplexInfoPanel ✏ 버튼, PATCH /api/complexes/:id/basic-info, 연식 저장 시 '년' 자동 추가)
- [x] 참고가 평형탭 1개여도 표시, + 평형 버튼으로 새 areaType 추가 (POST new history → PATCH 전환)
- [x] 내 단지 조회/검색 — 헤더 "내 단지" 버튼 → ComplexListModal(전체, 단지명 검색 입력, 선택 시 지도 이동)
- [x] ComplexListModal·CompareListModal 단지명 검색 입력 (실시간 필터)
- [x] + 평형 추가 버그 수정 — `setSelectedRefTab('')` 선행 호출로 POST/PATCH 경로 올바르게 분기
- [x] 임장용 단지 사진(📷)·즐겨찾기(★) 버튼 항상 표시 (가격 데이터 유무와 무관)
- [x] 임장유형 없을 때 NONE 라벨 표시, 수정 버튼 무조건 표시 (조건 제거)
- [x] 경로 그리기 기능 — 지도 클릭으로 점 추가, Polyline 실시간 표시, 이름 입력 후 저장 (POST)
- [x] 경로 수정 기능 — RoutePanel "✏ 경로 수정" → 기존 점 로드 후 추가/undo, 저장 시 PATCH
- [x] 직전 점 삭제(Undo) — floating bar "↩ 삭제" 버튼 (drawingPoints 1개 미만 시 비활성)
- [x] 경로 지도 표시 토글 — 패널에서 경로 클릭 시 activeRouteIds 토글, 패널 닫기 시 전체 제거
- [x] 경로 삭제 confirm — `window.confirm()` 후 DELETE
- [x] 경로 백엔드 CRUD — SQLAlchemy Route 모델(points=JSON Text), FastAPI 라우터, 서비스 계층, 앱 시작 시 테이블 자동 생성
- [x] ComplexInfoPanel 교통(출퇴근 시간) 인라인 편집 — ✏ 버튼으로 편집 진입, 5개 고정 목적지(강남/시청/여의도/발산/마곡나루) 행 표시, "조회" 버튼으로 네이버 지도 대중교통 팝업, 분·환승·교통수단 입력 후 PATCH /commute-times 저장 (일괄 교체)
- [x] 시세 차트 동일 날짜 중복 포인트 버그 수정 — dateMap 머징으로 같은 날짜 기록을 하나의 X축 포인트로 합산
- [x] ComplexInfoPanel 헤더 평형별 금액 표시 — `latestItemPerAreaType`으로 전체 이력에서 평형별 최신 가격 집계 (단건 POST로 추가된 평형도 모두 표시)
- [x] CompareCard 전면 재작성 — ComplexInfoPanel과 표시 내용 완전 동기화 (수정/삭제 기능 제외), 참고가·교통·환경·임장유형·최근5건 동일 표시
- [x] 비교평가 기능 — CompareListModal에 모드 토글(normal/evaluation), 비교평가 모드 선택 시 1:1 비교 후 우측 ComparisonEvalPanel 표시 (사진+메모, 가치평가, 가격비교, 결론, CRUD)
- [x] 출퇴근 시간 `transferLines`(환승 노선) 필드 추가 — `CommuteTime` 타입에 `transferLines?: string` 추가, `updateCommuteTimes` API 파라미터에 포함, RegisterModal/ComplexInfoPanel 편집 UI 카드 스타일로 재작성 + 환승 횟수 > 0 시 노선 입력칸 표시 (➡️ 구분자), 읽기 모드에서 환승 노선 문자열 표시 (ComplexInfoPanel·CompareCard 공통)
- [x] 유해시설(HazardInfo) CUD — RegisterModal 입력 섹션 추가 (시설명 네이버 검색·거리m 자동계산), ComplexInfoPanel 인라인 추가·수정·삭제 (빨간 테마, isComposing 가드·시퀀스 번호 적용), `HazardInfo` 타입·API 함수(`addHazardInfos`/`updateHazardInfo`/`deleteHazardInfo`) 추가
- [x] 섹션 제목 스타일 개선 — ComplexInfoPanel(13→14px) / CompareCard(12→13px), 색상 `#344054`
- [x] 학군/인프라/유해시설 섹션 헤더에 `+ 추가` 버튼 배치, 항상 표시, 하단 no-data 버튼 제거
- [x] 섹션 헤더 편집 버튼 → "수정" 초록 테두리 버튼 통일, 행별 편집 버튼은 연필(✏) 유지
- [x] 행정구역 경계 표시 — 헤더 "구 경계" 드롭다운 (서울 25구 + 경기도 42개 시군구), 선택 시 폴리곤 오버레이 + fitBounds 이동
  - 데이터 출처: statgarten/maps (통계청 SGIS 기반, EPSG:5179 고정밀)
  - proj4로 런타임 EPSG:5179 → WGS84 변환 (`src/utils/districtGeoJson.ts`)
  - `DistrictSelector.tsx` 신규 컴포넌트, GeoJSON 모듈 레벨 캐시
  - `polygon.clickable:false` → 경로 그리기와 충돌 없음
- [x] 내 위치 버튼 — 지도 우하단 📍 플로팅 버튼, Geolocation API → 파란 pulse 마커 + 지도 이동
- [x] 로드뷰 — 헤더 "로드뷰" 버튼 → 지도 하단 300px 고정 분할 뷰 (naver.maps.Panorama)
  - 지도 클릭 시 해당 위치 파노라마로 이동 (경로 그리기 중에는 비활성화)
  - Panorama div 항상 DOM 유지(height 0↔300px 토글)로 재마운트 시 검정화면 방지
- [x] 유해시설 공공데이터 11종 저장 — `public/data/` 에 JSON 파일로 저장 (폐기물/화학/건설재료/장례식장/동물보호소/묘지/납골당/자연장지/화장시설/교정시설/에너지저장소)
- [x] 유해시설 카테고리 분류 — `src/constants/hazardCategories.ts`: 11개 파일 → 7개 매크로 그룹, 폐기물(41→6), 화학(33→10) 세분류 매핑
- [x] 유해시설 카테고리 배지 — ComplexInfoPanel/CompareCard 읽기 모드에서 매크로(빨강) + 서브(회색) 배지 표시
- [x] 유해시설 자동탐지 — ComplexInfoPanel 오픈 시 등록된 유해시설 없으면 2km 반경 자동 탐지 (`useEffect(complex?.id)`, `Promise.allSettled`, `동물병원` 필터링)
- [x] 유해시설 지도 오버레이 마커 — 검정 CSS border 삼각형 ▲ + 매크로 카테고리명 표시 (subType에 macroCategory 전달, fallback: 시설명 4글자)
- [x] 백엔드 유해시설 `macro_category`/`sub_category` 컬럼 추가 + 관련 API 연동
- [x] 출퇴근 직선거리(`distanceKm`) — 단지 등록 시 5개 목적지 Haversine 자동계산, 저장/표시 (ComplexInfoPanel·CompareCard 읽기 모드, RegisterModal 조회 버튼 옆)
- [x] 백엔드 출퇴근 `distance_km` 컬럼 추가 + 관련 API 연동
- [x] 현재 위치 버튼 좌상단 이동 — 모바일 경로 목록 버튼에 가려지지 않도록 (top: 12px, left: 12px)
- [x] CompareCard 유해시설 섹션 추가 + distanceKm 표시 — ComplexInfoPanel과 표시 내용 완전 동기화
- [x] areaType별 시세 기록 전체 삭제 — ComplexInfoPanel 참고가 탭 선택 시 "삭제" 버튼 표시, 확인 후 `DELETE /api/complexes/:id/price-history/area-type/:areaType` (백엔드: 빈 history 자동 정리)
- [x] 임장 체크리스트 전면 개편
  - **전역 템플릿 패널** (`ChecklistTemplatePanel`): 헤더 "체크리스트" 버튼 → 사이드패널
    - 분위기/단지/매물 탭 + **카테고리 2레벨** 구조 (카테고리 → 항목)
    - 카테고리 추가/삭제, 항목 추가/수정/삭제 (Enter 저장, Esc 취소)
    - 미분류 항목은 "미분류" 그룹으로 자동 분류
    - `ChecklistTemplate.category` 필드 추가 (백엔드: `VARCHAR(100)` + idempotent ALTER TABLE)
  - **단지 체크 모달** (`ChecklistModal`): ComplexInfoPanel 내 버튼으로 모달 열기
    - 카테고리별 그룹핑 표시, 상/중/하 즉시 저장, 동일 버튼 재클릭=해제
  - **생활권 분위기 체크리스트**: 생활권(LivingZonePanel) 내 분위기 체크리스트 섹션
    - 생활권 펼칠 때 ATMOSPHERE 템플릿 로드 + 카테고리별 그룹핑
    - `living_zone_checklist_result` 테이블 + API 2개 (GET/PATCH)
  - **ComplexInfoPanel 생활권 분위기 섹션**: 단지가 속한 생활권의 분위기 체크리스트 표시
    - 단지 선택 시 `GET /api/living-zones?complexId=X`로 소속 생활권 조회
    - 각 생활권의 분위기 체크리스트 표시 + 인라인 평가 (상/중/하)
  - 백엔드: `checklist_template.category` 컬럼, `living_zone_checklist_result` 테이블
- [x] 매물 임장 기록 기능 (`PropertyVisit`)
  - **ChecklistModal "매물" 탭** 재설계 — 단순 항목 목록 → 매물 단위 기록 카드 UI
    - 카드 헤더: 부동산명·동호수·평형·금액·날짜, 클릭 시 체크리스트 펼침/닫힘
    - 추가/수정 폼: 방문일·부동산·동·호수·평형·금액(만원)·메모 6개 필드
    - 카드별 체크리스트: PROPERTY 템플릿 기준, 카테고리별 그룹핑, 상/중/하 즉시 저장
    - 삭제: confirm 후 cascade 삭제
  - 새 타입: `PropertyVisit`, `PropertyVisitResultItem` (`src/types/index.ts`)
  - 새 API 함수: `getPropertyVisits`, `createPropertyVisit`, `updatePropertyVisit`, `deletePropertyVisit`, `upsertPropertyVisitResult` (`src/services/api.ts`)
  - 백엔드: `property_visit` / `property_visit_result` 테이블, 스키마·서비스·라우터 추가
    - API: `GET/POST /api/complexes/:id/property-visits`, `PATCH/DELETE /api/complexes/:id/property-visits/:visitId`, `PATCH .../checklists/:templateId`
- [x] 선정 단지(selected_complex_id) — ComparisonEvalPanel 결론 아래 두 단지 선택 버튼(👑 강조), 저장 시 PK 전송
  - CompareListModal 저장된 비교평가 목록에서 선정 단지 이름 앞 👑 표시
  - `Comparison` 타입에 `selectedComplexId` 추가, `createComparison`/`updateComparison` API 파라미터 포함
- [x] 체크리스트 입력 유형 3종 지원 (상중하/O×X/텍스트)
  - `ChecklistInputType = 'RATING' | 'OX' | 'TEXT'`, `ChecklistRating` 확장 타입 추가
  - ChecklistTemplatePanel: 항목 추가/수정 시 InputTypeToggle 세그먼트 버튼으로 유형 선택
  - ChecklistModal: `renderItemInput` / `renderVisitItemInput` 헬퍼로 분위기·단지·매물 탭 전체 지원
  - LivingZonePanel: 분위기 체크리스트 OX/텍스트 렌더링 추가 (`zoneLocalTexts` 상태)
  - OX → rating 필드 저장, 텍스트 → memo 필드 저장 (백엔드 `input_type` 컬럼 + `DEFAULT 'RATING'` 마이그레이션)
- [x] 전체 사이트 메인 컬러 → 베이비 블루 (`#89CFF0`) 파스텔 테마
  - 기본 포인트: `#89CFF0` (베이비블루), `#FFD97D` (파스텔 노랑), `#E06060` (파스텔 빨강)
  - 헤더: 상단 3px border `#89CFF0`, toolbar 배경 `#f0f8fd`, 브랜드명 `#1a3a5c`
  - ROUTE_COLORS: `['#e53935', '#1565c0', '#2e7d32', '#e65100', '#6a1b9a', ...]` 고채도 팔레트
  - 선택 마커: `#BA8BD8` (파스텔 보라)
  - `calcCommuteGrade` 색상: S→`#F08080`, A→`#FFD97D`, B→`#7DC8A0`, C→`#89CFF0`
- [x] 푸터 추가 — Dancing Script 필기체, "For a happy future with my love, Juhae.", 베이비블루(`#4BAAD4`)
- [x] 지도 마커 카드형 통합 — 모바일·데스크탑 동일한 카드형 (단지명/가격/연식/세대수, 즐겨찾기=★ 접두사, 핀형·별형·tooltip 제거)
- [x] 생활권 구획 그리기 — 지도에서 폴리곤을 그려 내부 단지 자동 추가 + 구획 좌표 DB 저장 + 지도 오버레이 표시
  - `src/utils/geo.ts` `pointInPolygon()` Ray casting 알고리즘 추가
  - LivingZonePanel "구획 그리기" 버튼 → `isDrawingZone` 모드, 지도 클릭으로 꼭지점 추가
  - 플로팅 바: 점 개수 · ↩ 삭제 · 확인(3개↑ 활성) · 취소
  - 확인 시 폴리곤 내 단지 탐지 + `addComplexesToZone` + `updateLivingZonePolygon` 병렬 처리
  - 저장된 구획: 생활권 패널 로드 시 `onZonePolygonsChange` → MapPage에 반투명 초록 Polygon + 이름 라벨 오버레이
  - 단지 체크박스 목록 지역구 조건 제거 (구획 추가로 지역구 무관하게 추가 가능)
  - 백엔드: `living_zone.polygon_points TEXT` 컬럼 (idempotent ALTER TABLE), `PATCH /api/living-zones/:id/polygon`
- [x] 지도 마커 가격 = 호가(`askingPrice`) 우선, 없으면 매매가(`price`) fallback
  - 백엔드: `_build_price_maps()`에 SQL 쿼리 3 추가 → `asking_price_map` 반환
  - `_to_dto()` `latest_asking_price` 파라미터 추가, `ApartmentComplexDto.asking_price` 설정
  - `get_complex_by_id()` 에서도 최신 asking_price 조회 추가
  - 프론트: `ApartmentComplex.askingPrice?: number` 타입 추가, `MapPage.tsx` `basePrice = askingPrice || price`
- [x] 구별 시세 현황 기능 (`DistrictStatsPanel`)
  - 서울 25개 구 × 5개 평형대(18평/21평/24평/26평/33평) × 매매/전세 평균가 테이블 표시
  - 평형 구간 (전용면적 ±3m² 공차): 18평(전용59㎡) 56~62m², 21평(전용69㎡) 66~72m², 24평(전용79㎡) 76~82m², 26평(전용85㎡) 82~88m², 33평(전용109㎡) 106~112m²
  - 직거래(`dealing_gbn='직거래'`) 제외, `deal_year+deal_month` 기준 해당 월 거래만 집계
  - 직전 3개월 수집 (현재 월 제외), 가격 합산 기준 내림차순 정렬
  - 히트맵 색상 (낮=파랑 → 높=빨강, 평형대 내 상대적 비율) + 거래 건수 괄호 표시
  - 헤더 Row2 "구별 시세" 버튼 → 우측 사이드패널 (640px, 모바일 전체화면)
  - "시세 수집" 버튼 → `POST /api/district-stats/collect` (202) → 5초 폴링, `collectedAt` 갱신 감지 시 완료 toast
  - 매월 1일 02:00 APScheduler 자동 수집
  - 거래월 셀렉트박스 (수집된 월 목록, 최신순), 매매/전세 탭 전환
  - 백엔드: `district_price_stats` 테이블 (SQLAlchemy, `_18/_21/_24/_33` 컬럼), `district_stats_service.py`, `routers/district_stats.py`
    - `GET /api/district-stats?trade_month=YYYYMM` — 저장 데이터 + 사용 가능 월 목록 반환
    - `POST /api/district-stats/collect` — 서울 25구 병렬(5 workers) MOLIT API 호출 → 평형별 평균 계산 → upsert
    - 구형 컬럼(`avg_trade_10`) 감지 시 테이블 DROP 후 재생성 (idempotent 마이그레이션)
  - 타입: `DistrictStat` (src/types/index.ts), API: `getDistrictStats`, `collectDistrictStats` (src/services/api.ts)

- [x] 공공단지 수집 및 지도 표시 기능 (수도권 확장)
  - 백엔드: 건축물대장 API로 수도권(서울 25구 + 경기도 33개 + 인천 8구) 150세대↑ 공동주택 수집 (`public_complex` 테이블)
  - `REGION_MAP`: 지역명 → `{sigunguCd, province}` (서울/경기/인천 분류)
  - 인천 중구/동구: "인천 중구"/"인천 동구"로 키 설정 (서울 중구와 충돌 방지)
  - 경기 광주시: "광주시"로 키 설정 (GeoJSON feature 이름과 일치)
  - 법정동코드 `BJDONG_SCAN_RANGE = range(10100, 30000, 100)` 전체 스캔
  - 지오코딩: Naver local search API (`openapi.naver.com`) — 단지명+구명 1차, 주소 2차 fallback
  - 프론트: `PublicComplex` 타입, `getPublicComplexes` API (snake_case → camelCase 변환)
  - `getPublicComplexGuList` 반환 타입에 `province?: string` 추가 → 수집 드롭다운 optgroup 그룹핑
  - GeoJSON: 서울+경기+인천 병렬 fetch, 인천 "중구"→"인천 중구", "동구"→"인천 동구" 리네임 (`disambiguateIncheon`)
  - `isIncheon()` 헬퍼 추가 (id 23xxx 판별)
  - 구 경계 선택 시 해당 구 공공단지 자동 로드 → 지도 마커 표시
  - 마커: 좌표 근접(30m) 그룹화 → 단일=카드형, 다중=이름 목록+클릭 펼치기/접기
  - 줌 14+ 표시, 줌 15+에서 세부정보 노출 (CSS 토글, 마커 재생성 없음)
  - 경로/구획 그리기 모드 시 다중 마커 클릭 자동 차단 (`pointer-events` style 태그 전환)
  - 헤더 토글 버튼: **내단지** / **아파트** (구 선택 시에만 표시, 구 변경 시 ON으로 초기화)
  - 수집 패널 레이블: "서울 구 선택" → "수도권 지역 선택", optgroup(서울/경기/인천)으로 구분

- [x] 가계부 기능 (`BudgetPage`, `UserSelectModal`)
  - 헤더 "💰 가계부" 버튼 → 전체화면 오버레이 (z-index 9000)
  - localStorage `budget_user_id`로 세션 유저 저장, 👤 버튼 클릭 시 `UserSelectModal`로 재선택 가능
  - **내역 탭**: 총 수입/지출/잔액 카드, 고정비/변동비/투자 소요약, 통장별 현황, 필터(전체/수입/지출/고정비/투자), 항목 목록
  - **통장 관리 탭**: `ACCOUNT_GROUPS` 상수 기반 읽기 전용 참고 테이블 (통장명/예산/항목/은행카드/합계)
  - **자산 탭 (스냅샷 기반)**: 현황/이력/그래프 서브탭
    - **현황**: 날짜 선택 + 이전 날짜 복사, 스프레드시트 테이블 (동영|주해|합산), 셀 클릭 편집 (콤마 구분 합산), 달러 현금 USD 입력 + 환율 자동 환산
    - **이력**: 날짜별 합산 + 전기 대비 변동(억) 목록, 클릭 시 해당 날짜 현황으로 이동
    - **그래프**: Recharts LineChart, 유저별/유동성별 토글, Y축 억 단위
    - 달러 환율 입력 (localStorage 저장, `EXCHANGE_RATE_KEY`), `달러 현금`은 USD 금액 저장 → KRW 합산 시 환율 적용
    - `ASSET_COLUMNS` (10개 항목, 즉시사용가능/불가 2그룹), `AssetSnapshotCell` 타입, snapshot API 5종
    - 백엔드: `asset_snapshot` 테이블, `asset_snapshot_service.py`, snapshot 라우트 5개 (`/api/assets/snapshots/*`)
  - **통합 보기 탭**: 최신 스냅샷 기준 자산 현황 + 월별 가계부 요약 (동영|주해|합산 3열)
- [x] 자산 세부 내역 기능 (`AssetDetailModal`)
  - 자산 현황 탭 우측 상단 "📋 세부 내역" 버튼 → 모달 오픈
  - 모달: ASSET_COLUMNS × BUDGET_USERS 구조, 자산 항목별/유저별 [계좌명, 금액(만원)] 행 추가·삭제
  - 저장 시: 입력 만원 × 10,000 → 원 환산, 합산 자동으로 스냅샷 셀 업데이트 (없어진 항목 → 0)
  - 재오픈 시 저장된 세부 항목 그대로 표시·수정 가능
  - `AssetSnapshotDetail` 타입, `getAssetSnapshotDetails` / `bulkSaveAssetSnapshotDetails` API
  - 백엔드: `asset_snapshot_detail` 테이블, `asset_snapshot_detail_service.py`, 라우트 2개
- [x] AI 재무 분석 리포트 (`AIReportView`, `financial_report` 테이블)
  - 가계부 "🤖 AI 분석" 탭 — 월별 리포트 선택·조회, "✨ 지금 분석" 버튼으로 즉시 생성 요청
  - 매달 25일 오전 9시 APScheduler 자동 생성 (직전 3개월 가계부 + 최근 6개 자산 스냅샷 → Claude API)
  - DB 월별 1건 upsert, 마크다운 렌더링 (헤더·굵기·글머리)
  - 백엔드: `financial_report` 테이블, `financial_report_service.py`, `routers/financial_report.py`
    - `GET /api/financial-reports` — 저장 리포트 목록 (최신순)
    - `POST /api/financial-reports/generate?report_month=YYYYMM` — 즉시 생성 (202 백그라운드)
  - `GEMINI_API_KEY` 환경변수 필요 (Railway에 추가, `aistudio.google.com` → Get API Key)
  - `google-generativeai==0.8.3` 패키지 추가 (requirements.txt), 모델: `gemini-1.5-flash` (무료 티어)
- [x] 공통코드 관리 (`CommonCodeModal`, `common_code` 테이블)
  - 통장 관리 탭 하단 "⚙ 공통코드 관리" 버튼 → `CommonCodeModal` 오픈
  - 모달 구조: 좌측 공통코드 그룹 목록 / 우측 상세코드 테이블 (추가·인라인수정·삭제·정렬순서)
  - 그룹은 첫 번째 상세코드 등록 시 자동 생성 (그룹만 단독 추가 불가)
  - `CommonCode` 타입 (`types/index.ts`), CRUD API 4종 (`api.ts`)
  - 백엔드: `common_code` 테이블, UNIQUE(common_code, detail_code), `common_code_service.py`, `routers/common_code.py`
  - **자산 셀 공통코드 연동** (`ASSET_CELL` 그룹):
    - `ASSET_COLUMNS`에 `codeKey` 필드 추가 (영문 식별자: STOCK, CASH, DEPOSIT 등)
    - `buildAssetCellCode(codeKey, userId)` → `{codeKey}_{USERID}` 복합키 생성 (예: STOCK_LDY)
    - 세부 내역 모달 오픈 시 `ASSET_CELL` 그룹에서 `detail_code === cellCode` 조회
    - `detailCodeName`을 `,` 기준으로 split → 템플릿 계좌명 목록으로 행 자동 생성
    - 기존 저장 금액은 accountName 매칭으로 자동 채움, 템플릿 외 수동 추가 항목도 유지
    - 공통코드 미등록 셀은 기존 방식(빈 상태 시작) 그대로

## 미완성 / TODO

- [x] 학군·인프라 검색 드롭다운 이중표시 버그 수정 — IME Enter 이중발화(`isComposing` 가드) + 시퀀스 번호로 stale 비동기 결과 폐기 + 결과 1건이면 자동선택
- [x] 경사도(slopeType)/아파트구조(buildingStructure)/용적률(floorAreaRatio) 추가 — RegisterModal 입력, ComplexInfoPanel 표시+인라인편집, CompareCard 표시전용
- [x] 종합 필터 기능 — FilterPanel 컴포넌트, 헤더 "필터" 버튼 (활성 시 `필터 N/M` 뱃지)
  - 필터 항목: 즐겨찾기, 지역구, 임장유형, 세대수, 연식, 직장밀도·입지·학군·환경 등급, 재개발, 경사도, 구조
  - `ActiveFilters` / `EMPTY_FILTERS` / `isFiltersActive()` → `types/index.ts`
  - `applyFilters()` → `FilterPanel.tsx` export, App.tsx에서 `filteredComplexes = useMemo(...)`
  - MapPage에 `filteredComplexes` 전달 → 필터 적용 단지만 지도 마커 표시
  - 결과 목록: 등급 배지(교/학/환) + 단지명 검색, 클릭 시 지도 이동 + 패널 오픈
- [ ] 실거래가 자동조회 (RegisterModal 주석 해제) — 정확도 개선 필요
- [ ] 금액대 필터 버튼에 평형 표시 — 백엔드 priceItems 포함 필요
- [ ] 시세 기록 삭제 기능
- [ ] 시세 그래프 기간 필터 (3개월 / 6개월 / 1년)
- [ ] 지도 마커 클러스터링
- [ ] 반응형 레이아웃 (모바일)
