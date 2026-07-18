# CLAUDE.md — DoTheRich 프론트엔드 개발 가이드

> **이 파일은 Claude가 개발·수정 전에 반드시 읽고, 작업 완료 후 반드시 업데이트해야 합니다.**

---

## 개발 규칙

- **프론트엔드(doTheRichFront)만 수정.** 백엔드(doTheRichBack)는 절대 수정하지 않는다.
- 백엔드 변경이 필요한 경우, 변경 내용을 텍스트로 설명하고 구현은 사용자에게 맡긴다.
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

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | React 18 (CRA, TypeScript) |
| 지도 | Naver Maps API (CDN) |
| 차트 | Recharts |
| HTTP | Axios (`src/services/api.ts`) |
| 백엔드 | Spring Boot (별도 레포, `http://localhost:8080`) |

---

## 디렉터리 구조

```
src/
├── App.tsx                   # 최상위 — 상태 관리, 레이아웃, 모달 제어
├── index.tsx
├── types/
│   └── index.ts              # 전체 타입 정의 + formatPrice / toUkUnit 유틸
├── services/
│   └── api.ts                # axios 인스턴스 + API 함수
├── pages/
│   └── MapPage.tsx           # 네이버 지도 초기화, 마커 렌더링
└── components/
    ├── PriceRangeFilter.tsx  # 헤더 금액대 필터 버튼
    ├── ComplexListModal.tsx  # 금액대 클릭 시 단지 목록 팝업
    ├── SearchBar.tsx         # 네이버 장소 검색
    ├── RegisterModal.tsx     # 단지 등록 폼 (가격·교통·출퇴근 입력)
    ├── ComplexInfoPanel.tsx  # 우측 단지 상세 패널
    ├── PriceChart.tsx        # 평형×매매/전세 다중 라인 차트
    └── PriceInputForm.tsx    # 시세 기록 추가 폼 (패널 내)
```

---

## 타입 구조 (`src/types/index.ts`)

### 핵심 인터페이스

```typescript
// 단지 대표 정보 (백엔드 ApartmentComplexDto 1:1)
ApartmentComplex {
  id, priceRange, complexName, checkDate, builtYear,
  price, jeonsePrice?, jeonseRate?,
  unitCount, region, address, memo?,
  latitude, longitude,
  commuteTimes: CommuteTime[],
  subwayInfos: SubwayInfo[],
  areaTypes?: string[]                          // 최신 시세 기준 평형 목록
  areaTypePriceRanges?: Record<string, string>  // 평형 → 금액대 매핑 (예: {"전용 59": "11억대", "전용 84": "14억대"})
  priceItems?: PriceItem[]                      // ⚠️ 백엔드가 포함 시에만 채워짐 (현재 미구현)
}

// 지하철 (subwayInfos 배열 — 복수 노선 지원)
SubwayInfo { id, stationName, subwayLines, walkingMinutes }

// 시세 기록 헤더 (날짜별 1개, items 배열 포함)
PriceHistory { id, complexId, complexName, recordDate, memo?, items: PriceHistoryItem[] }

// 시세 기록 아이템 (평형별 1개)
PriceHistoryItem { id, areaType, floor, price, jeonsePrice?, jeonseRate? }

// 단지 등록 요청
ApartmentComplexRequest {
  priceRange, complexName, ...,
  priceItems?: [{ areaType, floor, price, jeonsePrice }],
  subwayInfos?: [{ stationName, subwayLines, walkingMinutes }],
  commuteTimes?: [{ destination, minutes, transportType }]
}

// 시세 기록 추가 요청
PriceHistoryRequest {
  recordDate, memo?, updateGoogleSheet?,
  items: [{ areaType?, floor?, price?, jeonsePrice? }]
}

// 차트용 — 평형 × 매매/전세 다중 시리즈
ChartDataRow  { date: string; [key: '평형-sale'|'평형-jeonse']: number }
ChartSeries   { key, label, areaType, type: 'sale'|'jeonse', color }
```

### 유틸 함수
- `formatPrice(원)` → `"7억 5천만"`
- `toUkUnit(원)` → `7.5` (억 단위, 소수점 2자리)

---

## 백엔드 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/complexes` | 단지 목록 (priceRange 필터 가능) |
| GET | `/api/complexes/:id` | 단지 상세 |
| POST | `/api/complexes/register` | 단지 등록 |
| GET | `/api/complexes/price-ranges` | 금액대 목록 |
| PATCH | `/api/complexes/:id/memo` | 단지 메모 수정 — `{ memo: string }` |
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
- `batchStatus` → 헤더 "시세 수집" 버튼 상태 ('idle'|'loading'|'done'|'error')
  - `POST /api/batch/real-estate-price` 호출, 타임아웃 3분
  - 완료 2초 / 오류 3초 후 idle 복귀
- 검색 결과 선택 시 `fromSearch:true`로 RegisterModal 오픈

### `MapPage.tsx`
- 네이버 지도 초기화 (서울 중심, zoom 12)
- 단지마다 금액 말풍선 커스텀 마커
- 마커 클릭 → InfoWindow (단지명, 가격, 지역, 지하철) + `onComplexSelect`
- 지도 클릭 → 역방향 지오코딩 → `onMapClick` 콜백으로 주소 전달
- `focusLocation` 변경 시 지도 중심/줌(15) 이동

### `RegisterModal.tsx`
- `RegisterInitialData`: complexName, address, lat, lng, fromSearch?
- 섹션: 기본정보 / 가격정보 / 단지정보 / 교통정보 / 출퇴근시간 / 메모
- **가격정보 행**: 평형 | 층수 | 매매가(억) | 전세가(억) | 전세율(자동) | **금액대(자동)** | ×
  - 매매가 입력 시 금액대 자동 계산 (`calcPriceRange`)
  - 금액대 수동 수정 가능
- 교통정보: 역명 입력 후 [조회] → 네이버 API로 호선 목록 자동 조회 + 도보시간 계산
- 출퇴근시간: 강남/시청/여의도/발산/마곡나루 중 선택 + 분 입력
- `POST /api/complexes/register` 호출
- ⚠️ 실거래가 자동조회 (`fromSearch` 시 MOLIT API 호출) — 정확도 문제로 현재 주석처리

### `ComplexInfoPanel.tsx`
- 단지 선택 시 `GET /api/complexes/:id/price-history` 조회
- **차트**: `buildChartData(histories)` → `ChartDataRow[]` + `ChartSeries[]` 변환 후 PriceChart 전달
- 최근 기록: 최신 5건, 날짜별로 items[] 나열 (평형·층수·가격·전세율)
- 지하철: `subwayInfos[]` 배열 순회
- 시세 입력 버튼 클릭 → PriceInputForm 토글

### `PriceChart.tsx`
- props: `rows: ChartDataRow[]`, `series: ChartSeries[]`
- **매매가**: 파란 계열 실선 (`#1a73e8`, `#4285f4`, `#185abc`, `#669df6`)
- **전세가**: 빨간 계열 점선 (`#ea4335`, `#c62828`, `#ef5350`, `#e57373`)
- 전세 데이터 없는 평형은 전세 시리즈 미생성
- 하단 SVG 범례 (실선/점선 아이콘 + 라벨)
- 빈 데이터 시 안내 placeholder 표시

### `PriceInputForm.tsx`
- 날짜 / 금액(한글 파싱: "7억5천") / 층수 / 메모 / 구글시트 여부
- 제출 형식: `PriceHistoryRequest { recordDate, memo, updateGoogleSheet, items: [{price, floor?}] }`

### `PriceRangeFilter.tsx`
- props: `priceRanges`, `selectedRange`, `onSelect`, `onSelectAreaType?`, `complexes?`
- 금액대 셀렉트박스 (오름차순 정렬) + 금액대 선택 시 평형 셀렉트박스 표시
- `appearance: none` + SVG 화살표 오버레이로 현대적 스타일 적용
- `getAreaTypes(range)` — `c.areaTypePriceRanges`에서 해당 금액대인 평형만 추출
  - 예: "14억대" 선택 시 전용84(14억대)는 나오고 전용59(11억대)는 제외됨
  - fallback: `areaTypePriceRanges` 없으면 `c.areaTypes` 사용
- 평형 선택 → `onSelectAreaType(range, areaType)` → 금액대+평형 동시 필터

### `ComplexListModal.tsx`
- props: `range`, `areaType?`, `complexes`, `onClose`, `onSelect`
- 금액대 필터 클릭 시 **헤더 하단 드롭다운 패널**로 표시 (전체화면 모달 아님)
- `position: fixed, top: 56px` — 지도/사이드패널 위에 겹쳐지지 않음
- 투명 백드롭 클릭 시 닫힘
- 단지들을 `grid (auto-fill, minmax 280px)` 로 배치해 가로 공간 활용
- `range` + `areaType` 동시 전달 시: `c.areaTypePriceRanges[areaType] === range` 로 정확 매핑 필터
  - A단지 전용59=11억대, 전용84=14억대 → "14억대+전용59" 조회 시 A단지 제외됨
- `range`만 전달 시: `Object.values(areaTypePriceRanges).includes(range)` 로 해당 금액대 포함 단지 필터
- 타이틀에 선택한 평형 표시: "7억대 · 전용 59 단지 목록"
- 단지 클릭 → `onSelect` → ComplexInfoPanel 열림 + 지도 이동

### `SearchBar.tsx`
- 검색어 입력 → `GET /api/search/local` → 결과 드롭다운
- 선택 시 `SearchSelectData { title, address, roadAddress, lat, lng }` 반환

---

## 백엔드 연동 시 주의사항

### `ApartmentComplexDto` (백엔드 응답)
- `subwayInfos: List<SubwayInfoDto>` 배열로 반환됨 (단일 필드 아님)
- `priceItems` 배열은 **현재 미포함** — 추후 포함 시 필터 평형 표시 자동 동작

### `PriceHistoryDto` (백엔드 응답)
- `items: List<PriceHistoryItemDto>` 배열 구조
- 이전 단일 `price`/`floor` 필드 없음

### MOLIT 실거래가 API
- 서비스 키 `+` 문자 → `%2B` 인코딩 필요 (백엔드에서 처리)
- 구 단위 조회 시 타임아웃 발생 → 동 단위 필터링 필요 (백엔드 개선 필요)

---

## 백엔드 추가 작업 필요 항목

| 항목 | 설명 |
|------|------|
| `ApartmentComplexDto`에 `priceItems` 포함 | 금액대 필터에서 평형 정보 표시 가능 |
| MOLIT 동 단위 필터링 | `getLatestTradePrice/JeonsePrice`에 법정동 기반 포스트 필터링 추가 |
| 실거래가 정확도 개선 | 단지명 매핑 로직 개선 후 RegisterModal 주석 해제 |

---

## 완료된 기능

- [x] 네이버 지도 + 단지 마커
- [x] 지도/검색으로 단지 등록 (가격·교통·출퇴근 입력)
- [x] 금액대 필터 → 단지 목록 팝업
- [x] 단지 상세 패널 (지하철 다중 노선, 소요시간)
- [x] 시세 기록 추가 (items[] 배열 구조)
- [x] 시세 변동 그래프 — 평형별 다중 라인 (매매 파란계열, 전세 빨간계열)
- [x] 가격 행별 금액대 자동 계산 (수동 수정 가능)
- [x] 네이버 역 조회 + 도보 시간 자동 계산

## 미완성 / TODO

- [ ] 실거래가 자동조회 (RegisterModal 주석 해제) — 정확도 개선 필요
- [ ] 금액대 필터 버튼에 평형 표시 — 백엔드 priceItems 포함 필요
- [ ] 시세 기록 삭제 기능
- [ ] 시세 그래프 기간 필터 (3개월 / 6개월 / 1년)
- [ ] 지도 마커 클러스터링
- [ ] 반응형 레이아웃 (모바일)
