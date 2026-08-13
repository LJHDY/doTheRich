# DoTheRich

부동산 임장·시세 트래킹 개인 앱. 네이버 지도 위에 아파트 단지를 등록하고 시세 변동, 학군, 교통, 유해시설, 임장 체크리스트까지 한 곳에서 관리한다.

---

## 주요 기능

### 지도 & 단지 관리
- 네이버 지도에 단지 마커 표시 (금액대별 색상 구분, 즐겨찾기 별 모양)
- 임장 유형(분위기/단지/매물) 별 마커 테두리 색상 구분
- 네이버 장소 검색으로 단지 등록
- 금액대 · 평형 · 지역구 · 임장유형 · 등급 등 다중 필터
- 단지 비교 (최대 3개 동시 카드 뷰)
- 비교평가 모드 (1:1 사진·메모·가치평가·결론, 최종 선정 단지 표시)

### 시세 관리
- 날짜별 시세 기록 (평형·층수·매매가·전세가)
- 참고가 (호가·전고점·전저점·10년 등락률) 평형별 관리
- 평형별 매매/전세 다중 라인 차트
- 직전 기록 대비 시세 변동률 표시 (▲/▼)

### 입지 분석
- **학군**: 초·중학교 도보거리·학업성취도·전교생수, S/A/B/C 등급 배지
- **교통(출퇴근)**: 강남·시청·여의도·발산·마곡나루 소요시간 + 환승 노선, 입지 등급 S/A/B/C
- **인프라**: 백화점·마트·병원 유형별 등록, 환경 등급 배지
- **직장 밀도**: 지역 종사자수·사업체수 기반 등급 (RegionWorkplace 상수)
- **유해시설**: 반경 2km 자동 탐지 (공공데이터 11종, 매크로·서브 카테고리 분류), 지도 오버레이 마커
- **종합평가**: 직장·교통·학군·환경 4개 등급 한눈에 비교, 클릭 시 해당 섹션 스크롤

### 임장 체크리스트
- 분위기/단지/매물 3가지 유형, 카테고리 2레벨 구조로 템플릿 관리
- 단지별·생활권별 체크리스트 (상/중/하 즉시 저장)
- **매물 임장 기록**: 부동산·동호수·평형·금액·연락처 단위로 기록, 매물별 PROPERTY 체크리스트

### 생활권 관리
- 지역구 단위로 단지를 묶어 생활권 생성
- 생활권 메모, 단지 추가/제거
- 생활권별 분위기 체크리스트

### 지도 부가 기능
- **경로 그리기**: 클릭으로 점 추가, Polyline 표시, 이름 저장, 거리·도보시간 계산
- **행정구역 경계**: 서울 25구 + 경기 42개 시군구 폴리곤 오버레이 (EPSG:5179 → WGS84 변환)
- **로드뷰**: 지도 하단 분할 뷰 (Naver Panorama)
- **도보 반경 원**: 단지 기준 2km(도보 30분) 원 토글
- **내 위치**: Geolocation API → 파란 pulse 마커
- **공공단지 마커**: 건축물대장 API 수집 150세대↑ 단지, 줌 14+ 표시, 근접 그룹화

### 구별 시세 현황
- 서울 25구 × 5개 평형대(18/21/24/26/33평) 평균 매매·전세가 테이블
- 히트맵 색상 (평형대 내 상대 비율, 낮=파랑 → 높=빨강)
- 매월 1일 02:00 APScheduler 자동 수집, 수동 수집 버튼 제공

### 가계부
- 유저별(동영·주해) 월별 수입·지출·투자 기록 관리
- **잔액 공식**: `잔액 = 총수입 - 총지출 - 투자` (이체는 수입·지출 모두에서 제외)
- 이체 항목: `isTransfer` 또는 `category='이체'`로 판정, 수입·지출 집계에서 제외
- 통장별 잔액 현황 (이월 잔액 + 이번 달 수입/지출, 합계 카드는 이체 제외)
- 고정비·변동비·투자 필터, 카테고리 필터, 캘린더·목록 뷰 전환

### 자산 관리
- 스냅샷 기반 자산 현황 (즉시사용가능·불가 2그룹, 10개 항목)
- 날짜별 스냅샷, 이전 날짜 복사, 달러 현금 USD→KRW 환율 자동 환산
- 세부 내역 모달 (계좌명·금액 행 추가, 합산 자동 업데이트)
- 공통코드(`ASSET_CELL` 그룹)로 계좌명 템플릿 관리
- 통합 보기: 최신 자산 현황 + 월별 가계부 요약 (동영|주해|합산 3열)

### AI 재무 분석
- 매달 25일 09:00 APScheduler 자동 생성 (직전 3개월 가계부 + 최근 자산 스냅샷 → Gemini API)
- 마크다운 렌더링, 월별 리포트 선택·조회, 즉시 생성 버튼

---

## 기술 스택

| 구분 | 내용 |
|------|------|
| 프레임워크 | React 18 (CRA, TypeScript) |
| 지도 | Naver Maps API v3 (CDN) |
| 차트 | Recharts |
| HTTP | Axios |
| 좌표 변환 | proj4 (EPSG:5179 → WGS84) |
| 백엔드 | Python 3.12 + FastAPI |
| ORM | SQLAlchemy |
| DB | MySQL 8 |
| 스케줄러 | APScheduler (매월 말일 실거래가 캐시 갱신) |
| 배포 | Vercel (프론트) + Railway (백엔드 + MySQL) |

---

## 배포 환경

| 구분 | 서비스 | URL |
|------|--------|-----|
| 프론트엔드 | Vercel | `https://do-the-rich-raew.vercel.app` |
| 백엔드 | Railway | `https://dotherichback-production.up.railway.app` |
| DB | Railway MySQL | Railway 내부 연결 |

---

## 로컬 개발 환경 설정

### 사전 요구사항
- Node.js 18+
- Python 3.12+
- MySQL 8 (Docker 사용 가능)

### 백엔드 실행

```bash
# MySQL 컨테이너 실행
docker run -d \
  --name mysql-dotherich \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -e MYSQL_DATABASE=dotherich \
  -p 3306:3306 \
  mysql:8.0

# 백엔드 클론 & 의존성 설치
git clone https://github.com/LJHDY/doTheRichBack.git
cd doTheRichBack
pip install -r requirements.txt

# 환경변수 설정
cp .env.example .env
# .env 파일에서 DATABASE_URL 및 외부 API 키 입력

# 서버 실행 (포트 8000)
uvicorn app.main:app --reload --port 8000
```

### 프론트엔드 실행

```bash
git clone https://github.com/LJHDY/doTheRich.git
cd doTheRich
npm install
npm start   # http://localhost:3000
```

환경변수 없으면 `http://localhost:8000`으로 자동 연결된다.

### 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `REACT_APP_API_URL` | 백엔드 URL | `http://localhost:8000` |

> CRA는 빌드 시점에 환경변수를 주입하므로 Vercel에서 변경 후 Redeploy 필요.

---

## 프로젝트 구조

```
src/
├── App.tsx                     # 전역 상태, 레이아웃, 모달 제어
├── types/index.ts              # 전체 타입 정의 + formatPrice 등 유틸
├── services/api.ts             # Axios 인스턴스 + API 함수 전체
├── constants/
│   └── hazardCategories.ts    # 유해시설 11종 → 7개 매크로 그룹 매핑
├── utils/
│   └── districtGeoJson.ts     # 행정구역 GeoJSON + 좌표 변환 캐시
├── pages/
│   └── MapPage.tsx            # 네이버 지도 초기화, 마커·경로·오버레이 렌더링
└── components/
    ├── ComplexInfoPanel.tsx    # 단지 상세 우측 패널
    ├── LivingZonePanel.tsx     # 생활권 관리 우측 패널
    ├── RoutePanel.tsx          # 경로 관리 우측 패널
    ├── ChecklistTemplatePanel.tsx  # 체크리스트 템플릿 관리 패널
    ├── ChecklistModal.tsx      # 단지 체크리스트 + 매물 임장 기록 모달
    ├── CompareCard.tsx         # 비교 뷰 단지 카드
    ├── CompareListModal.tsx    # 비교 단지 선택 드롭다운
    ├── ComparisonEvalPanel.tsx # 1:1 비교평가 패널
    ├── RegisterModal.tsx       # 단지 등록 폼
    ├── FilterPanel.tsx         # 종합 필터 패널
    ├── PriceChart.tsx          # 시세 변동 차트
    ├── PriceInputForm.tsx      # 시세 기록 입력 폼
    ├── CommuteGradeBadge.tsx   # 입지 등급 배지 공통 컴포넌트
    ├── DistrictSelector.tsx    # 행정구역 경계 선택
    ├── DistrictStatsPanel.tsx  # 구별 시세 현황 패널
    ├── SearchBar.tsx           # 네이버 장소 검색
    ├── PriceRangeFilter.tsx    # 헤더 금액대 필터
    ├── ComplexListModal.tsx    # 단지 목록 팝업
    └── budget/
        └── BudgetPage.tsx     # 가계부·자산·AI분석·통합보기 전체 (단일 파일)
public/data/                   # 유해시설 공공데이터 JSON (11종)
```

---

## 주요 데이터 흐름

```
사용자 → SearchBar → 네이버 장소 검색 API
                           ↓
                    RegisterModal (가격·교통·학군·유해시설 입력)
                           ↓
                    POST /api/complexes/register
                           ↓
                    MapPage 마커 렌더링
                           ↓
                    ComplexInfoPanel (상세·편집·체크리스트)
```

---

## 유해시설 데이터

`public/data/` 에 공공데이터 기반 JSON 11종이 포함되어 있다. 브라우저에서 직접 fetch하므로 별도 서버 연동 없이 동작한다.

| 파일 | 설명 | 건수 |
|------|------|------|
| waste-facilities.json | 폐기물 처리시설 | 10,568 |
| chemical-facilities.json | 화학·위험 제조시설 | 3,588 |
| construction-material-factories.json | 건설재료 공장 | 2,086 |
| funeral-homes.json | 장례식장 | 901 |
| animal-shelters.json | 동물보호소 | 332 |
| cemeteries.json | 묘지 | 340 |
| columbarium-facilities.json | 납골당 | 226 |
| natural-burial-sites.json | 자연장지 | 78 |
| crematoriums.json | 화장시설 | 58 |
| correctional-facilities.json | 교정시설 | 55 |
| energy-storage-bases.json | 에너지 저장소 | 9 |

---

## 라이선스

개인 프로젝트 — 비공개 사용 목적.
