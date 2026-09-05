import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ApartmentComplex, MapRoute, OverlayMarker, RoutePoint, ActiveFilters, EMPTY_FILTERS, isFiltersActive, PublicComplex } from './types';
import { getComplexes, getPriceRanges, getRoutes, createRoute, updateRoute, deleteRoute, addComplexesToZone, updateLivingZonePolygon, getPublicComplexGuList, collectPublicComplexes, getPublicComplexes, startCollectAllTradeHistory, getCollectAllStatus, BatchCollectStatus } from './services/api';
import { pointInPolygon } from './features/map/utils/geo';
import { HAN_RIVER_PARKS } from './features/complex/constants/hanRiverParks';
import MapPage from './features/map/MapPage';
import PriceRangeFilter from './features/map/PriceRangeFilter';
import ComplexInfoPanel from './features/complex/ComplexInfoPanel';
import ComplexListModal from './features/complex/ComplexListModal';
import CompareListModal from './features/compare/CompareListModal';
import CompareCard from './features/compare/CompareCard';
import ComparisonEvalPanel from './features/compare/ComparisonEvalPanel';
import SearchBar, { SearchSelectData } from './features/map/SearchBar';
import RegisterModal, { RegisterInitialData } from './features/complex/RegisterModal';
import LivingZonePanel from './features/living-zone/LivingZonePanel';
import AffordabilityPanel from './features/complex/AffordabilityPanel';
import RoutePanel from './features/map/RoutePanel';
import ChecklistTemplatePanel from './features/checklist/ChecklistTemplatePanel';
import DistrictStatsPanel from './features/district-stats/DistrictStatsPanel';
import FilterPanel, { applyFilters } from './features/map/FilterPanel';
import DistrictSelector from './features/map/DistrictSelector';
import { useIsMobile } from './hooks/useIsMobile';
import PasswordGate, { isSessionValid } from './shared/PasswordGate';
import BudgetPage from './features/budget/BudgetPage';
import UserSelectModal from './features/budget/UserSelectModal';
import { BUDGET_USER_STORAGE_KEY } from './features/budget/budgetConstants';
import RealEstateAnalysisModal from './features/complex/RealEstateAnalysisModal';
import CalendarModal from './features/schedule/CalendarModal';
import ContactsModal from './features/contacts/ContactsModal';
import InvestmentMemoModal from './features/investment-memo/InvestmentMemoModal';
import TravelLogPanel, { TravelMapPlace } from './features/travel/TravelLogPanel';
import CameraStampButton from './shared/CameraStampButton';
import TradeHistoryModal from './features/complex/TradeHistoryModal';

const TRADE_COMPARE_COLORS = ['#4285f4', '#e53935', '#43a047', '#ff8f00'];

const App: React.FC = () => {
  const isMobile = useIsMobile();
  // 로컬(개발) 환경은 무조건 통과, 운영 환경은 세션 유효성 확인
  const [unlocked, setUnlocked] = useState<boolean>(
    () => process.env.NODE_ENV === 'development' || isSessionValid()
  );
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(56);

  // 헤더 높이를 동적으로 측정 — 모바일 2줄 / 데스크탑 1줄 전환 시 자동 반영
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    setHeaderHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [complexes, setComplexes] = useState<ApartmentComplex[]>([]);
  const [priceRanges, setPriceRanges] = useState<string[]>([]);
  const [selectedComplex, setSelectedComplex] = useState<ApartmentComplex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusLocation, setFocusLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [registerData, setRegisterData] = useState<RegisterInitialData | null>(null);
  const [registerMapView, setRegisterMapView] = useState(false); // 모바일 등록 모달 "지도 보기" 상태
  // null = 팝업 닫힘, '' = 전체, '7억대' = 특정 금액대
  const [listModalRange, setListModalRange] = useState<string | null>(null);
  const [favoriteListOpen, setFavoriteListOpen] = useState(false);
  const [myComplexListOpen, setMyComplexListOpen] = useState(false);
  // 평형 필터 — null이면 전체, '전용 59' 등 선택 시 해당 평형 단지만 표시
  const [listModalAreaType, setListModalAreaType] = useState<string | null>(null);
  // 모달 닫기 시 PriceRangeFilter 내부 상태 초기화용 key — 증가할 때마다 컴포넌트 재마운트
  const [filterResetKey, setFilterResetKey] = useState(0);

  // 학교·인프라 위치 오버레이 마커 — ComplexInfoPanel이 단지 선택 시 채워줌
  const [overlayMarkers, setOverlayMarkers] = useState<OverlayMarker[]>([]);

  // 도보 30분 반경 원 중심 좌표 — ComplexInfoPanel 토글 버튼으로 켜고 끔
  const [radiusCenter, setRadiusCenter] = useState<{ lat: number; lng: number } | null>(null);

  // 생활권 패널 — ComplexInfoPanel과 동일 슬롯, 동시에 열리지 않음
  const [livingZoneOpen, setLivingZoneOpen] = useState(() => sessionStorage.getItem('panel_living') === 'true');

  // 경로 관리 패널 + 그리기/수정 모드
  const [routePanelOpen, setRoutePanelOpen] = useState(() => sessionStorage.getItem('panel_route') === 'true');
  // 모바일 전용: 'list'=경로 목록 패널 / 'map'=지도에서 경로 확인
  const [mobileRouteView, setMobileRouteView] = useState<'list' | 'map'>('list');
  // 모바일 햄버거 풀다운 메뉴 열림 여부
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [routes, setRoutes] = useState<MapRoute[]>([]);
  const [activeRouteIds, setActiveRouteIds] = useState<Set<number>>(new Set());
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null); // 수정 중인 기존 경로 id
  const [isDrawingRoute, setIsDrawingRoute] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<RoutePoint[]>([]);
  const [routeName, setRouteName] = useState('');

  // 생활권 구획 그리기 — 폴리곤으로 내부 단지를 탐지해 생활권에 자동 추가
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [drawingZonePoints, setDrawingZonePoints] = useState<RoutePoint[]>([]);
  const [targetZoneId, setTargetZoneId] = useState<number | null>(null);
  const [zoneDrawingSaving, setZoneDrawingSaving] = useState(false);
  // 구획 추가 완료 시 LivingZonePanel 데이터 리로드용 key
  const [livingZoneRefreshKey, setLivingZoneRefreshKey] = useState(0);
  // 생활권 패널에서 지도에 표시할 구획 폴리곤 목록 — 생활권 로드 시 패널이 채워줌 (대장 단지명 포함)
  const [zonePolygons, setZonePolygons] = useState<{ id: number; name: string; points: RoutePoint[]; flagshipComplexName?: string | null }[]>([]);

  // 행정구역 경계 표시 — 선택한 구/시 폴리곤을 지도에 오버레이
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(() => sessionStorage.getItem('selected_district') || null);

  // 로드뷰 패널 — 지도 하단 분할 뷰
  const [roadViewOpen, setRoadViewOpen] = useState(false);

  // 필터 패널
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  // 체크리스트 항목 관리 패널
  const [checklistPanelOpen, setChecklistPanelOpen] = useState(() => sessionStorage.getItem('panel_checklist') === 'true');

  // 구별 시세 현황 패널
  const [districtStatsOpen, setDistrictStatsOpen] = useState(() => sessionStorage.getItem('panel_district') === 'true');

  // 가계부 — 새로고침 후에도 열린 상태 복원
  const [budgetOpen, setBudgetOpen] = useState(() => sessionStorage.getItem('budget_open') === 'true');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [travelLogOpen, setTravelLogOpen] = useState(() => sessionStorage.getItem('panel_travel') === 'true');
  // 여행일지 지도 표시 방문지 목록 — TravelLogPanel에서 콜백으로 갱신
  const [activeTravelPlaces, setActiveTravelPlaces] = useState<TravelMapPlace[]>([]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [investmentMemoOpen, setInvestmentMemoOpen] = useState(false);
  useEffect(() => { sessionStorage.setItem('budget_open', String(budgetOpen)); }, [budgetOpen]);

  // 유저 미선택 시 선택 모달 표시 — 가계부 열기 시점에 확인
  const [showUserSelect, setShowUserSelect] = useState(false);

  // 공공단지 수집 패널
  const [collectPanelOpen, setCollectPanelOpen] = useState(false);
  const [guList, setGuList] = useState<{ guName: string; sigunguCd: string; province?: string }[]>([]);
  const [selectedCollectGu, setSelectedCollectGu] = useState('');
  const [collectStatus, setCollectStatus] = useState<'idle' | 'collecting' | 'done' | 'error'>('idle');
  const [publicComplexes, setPublicComplexes] = useState<PublicComplex[]>([]);
  const [showPublicComplexes, setShowPublicComplexes] = useState(true);
  const [showMyComplexes, setShowMyComplexes] = useState(true);

  // 전역 토스트 알림 — 수집 완료 등 일회성 메시지
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // 필터 적용된 단지 목록 — 지도 마커에 사용
  const filteredComplexes = useMemo(
    () => isFiltersActive(activeFilters) ? complexes.filter(c => applyFilters(c, activeFilters)) : complexes,
    [complexes, activeFilters]
  );

  // 현재 지도에 표시 중인 경로만 추출 — 매 렌더마다 filter() 새 배열 생성 방지
  const activeRoutes = useMemo(
    () => routes.filter(r => activeRouteIds.has(r.id)),
    [routes, activeRouteIds]
  );

  // 구매 가능 분석 패널 — 생활권·단지패널과 상호 배타
  const [affordOpen, setAffordOpen] = useState(() => sessionStorage.getItem('panel_afford') === 'true');

  // 비교하기 — 일반(최대 3개) / 비교평가(1:1) 모드
  const [compareOpen, setCompareOpen] = useState(() => sessionStorage.getItem('panel_compare') === 'true');
  const [realEstateAiOpen, setRealEstateAiOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('compare_ids') || '[]'); } catch { return []; }
  });
  const [compareMode, setCompareMode] = useState<'normal' | 'evaluation'>('normal');
  const [tradeCompareOpen, setTradeCompareOpen] = useState(false);

  // 데스크탑 Row 2 드롭다운 열림 상태 — 한 번에 하나만 열림
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // 일괄 수집 상태
  const [batchStatus, setBatchStatus] = useState<BatchCollectStatus | null>(null);
  const [batchPanelOpen, setBatchPanelOpen] = useState(false);
  const batchPollRef = useRef<NodeJS.Timeout | null>(null);

  const startBatchCollect = useCallback(async () => {
    try {
      await startCollectAllTradeHistory();
      setBatchPanelOpen(true);
      // 3초마다 폴링
      if (batchPollRef.current) clearInterval(batchPollRef.current);
      batchPollRef.current = setInterval(async () => {
        try {
          const s = await getCollectAllStatus();
          setBatchStatus(s);
          if (!s.running) clearInterval(batchPollRef.current!);
        } catch { /* ignore */ }
      }, 3000);
    } catch { alert('일괄 수집 시작 실패'); }
  }, []);

  const checkBatchStatus = useCallback(async () => {
    try {
      const s = await getCollectAllStatus();
      setBatchStatus(s);
      setBatchPanelOpen(true);
      if (s.running && !batchPollRef.current) {
        batchPollRef.current = setInterval(async () => {
          try {
            const s2 = await getCollectAllStatus();
            setBatchStatus(s2);
            if (!s2.running) clearInterval(batchPollRef.current!);
          } catch { /* ignore */ }
        }, 3000);
      }
    } catch { /* ignore */ }
  }, []);

  // 전체 패널 열림 상태 → sessionStorage 동기화 (새로고침 후 복원용)
  useEffect(() => {
    sessionStorage.setItem('panel_living',      String(livingZoneOpen));
    sessionStorage.setItem('panel_route',       String(routePanelOpen));
    sessionStorage.setItem('panel_district',    String(districtStatsOpen));
    sessionStorage.setItem('panel_afford',      String(affordOpen));
    sessionStorage.setItem('panel_checklist',   String(checklistPanelOpen));
    sessionStorage.setItem('panel_compare',     String(compareOpen));
    sessionStorage.setItem('panel_travel',      String(travelLogOpen));
    sessionStorage.setItem('compare_ids',       JSON.stringify(compareIds));
    sessionStorage.setItem('selected_district', selectedDistrict ?? '');
  }, [livingZoneOpen, routePanelOpen, districtStatsOpen, affordOpen, checklistPanelOpen, compareOpen, travelLogOpen, compareIds, selectedDistrict]);

  // 체크박스 토글 — 모드별 최대값 체크 후 추가/해제
  const handleCompareToggle = (id: number) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      // 비교평가 모드: 최대 2개 / 일반 비교 모드: 최대 3개
      const max = compareMode === 'evaluation' ? 2 : 3;
      if (prev.length >= max) {
        alert(`비교평가 모드는 최대 2개까지 선택할 수 있습니다.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  // 모드 변경 — evaluation으로 전환 시 기존 3개 선택이 있으면 앞 2개만 유지
  const handleCompareModeChange = (mode: 'normal' | 'evaluation') => {
    setCompareMode(mode);
    if (mode === 'evaluation') {
      // 비교평가는 1:1만 지원 → 초과 선택분 잘라내기
      setCompareIds(prev => prev.slice(0, 2));
    }
  };

  // 저장된 비교평가 선택 — 두 단지를 비교평가 모드로 바로 진입
  const handleSelectComparison = (complexId1: number, complexId2: number) => {
    setCompareMode('evaluation');
    setCompareIds([complexId1, complexId2]);
    setCompareOpen(false);
  };

  // 비교 모드 종료 — 선택 목록·모드 초기화
  const handleCompareClose = () => {
    setCompareOpen(false);
    setCompareIds([]);
    setCompareMode('normal');
  };

  // 앱 최초 마운트 시 금액대 목록 + 단지 목록 병렬 로드 — 순차 대기 제거
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPriceRanges().catch(() => [] as string[]),
      getComplexes(undefined).catch(() => [] as ApartmentComplex[]),
    ]).then(([ranges, data]) => {
      setPriceRanges(ranges);
      setComplexes(data);
    }).catch(() => {
      setError('단지 데이터를 불러오지 못했습니다. 백엔드 서버를 확인해주세요.');
    }).finally(() => {
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 명시적 새로고침용 — 목록 수정 후 재조회 (등록 시엔 사용 안 함)
  const loadComplexes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getComplexes(undefined);
      setComplexes(data);
    } catch {
      setError('단지 데이터를 불러오지 못했습니다. 백엔드 서버를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 경로 목록 초기 로드
  useEffect(() => {
    getRoutes().then(setRoutes).catch(() => {});
  }, []);

  // 신규 경로 그리기 시작
  const handleStartDrawing = () => {
    setEditingRouteId(null);
    setIsDrawingRoute(true);
    setDrawingPoints([]);
    setRouteName('');
  };

  // 기존 경로 수정 시작 — 기존 점 로드 후 그리기 모드 진입
  const handleStartEditRoute = (route: MapRoute) => {
    setEditingRouteId(route.id);
    setIsDrawingRoute(true);
    setDrawingPoints([...route.points]);
    setRouteName(route.name);
  };

  // 로고 클릭 — 페이지 전체 새로고침
  const handleGoHome = () => {
    window.location.href = '/';
  };

  // 패널 닫기 — 지도의 경로·그리기 상태 모두 초기화
  const handleClosRoutePanel = () => {
    setRoutePanelOpen(false);
    setMobileRouteView('list');
    setActiveRouteIds(new Set());
    setIsDrawingRoute(false);
    setEditingRouteId(null);
    setDrawingPoints([]);
    setRouteName('');
  };

  // 경로 활성화 토글 — 클릭 시 지도에 표시/숨김
  const handleToggleActiveRoute = (id: number) => {
    setActiveRouteIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // 지도 클릭 시 좌표 추가
  const handleRoutePointAdd = (p: RoutePoint) => {
    setDrawingPoints(prev => [...prev, p]);
  };

  // 직전 점 삭제 (undo)
  const handleUndoLastPoint = useCallback(() => {
    setDrawingPoints(prev => prev.slice(0, -1));
  }, []);

  // 경로 그리기 중 Backspace → 직전 점 삭제 (input/textarea에 포커스 없을 때만)
  useEffect(() => {
    if (!isDrawingRoute) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      e.preventDefault();
      handleUndoLastPoint();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDrawingRoute, handleUndoLastPoint]);

  // 구획 그리기 중 Backspace → 직전 점 삭제
  useEffect(() => {
    if (!isDrawingZone) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      e.preventDefault();
      setDrawingZonePoints(prev => prev.slice(0, -1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDrawingZone]);

  // 구 목록 마운트 시 한 번 로드 (수집 패널 + 공공단지 조회에 공통 사용)
  useEffect(() => {
    if (guList.length > 0) return;
    getPublicComplexGuList().then(list => {
      setGuList(list);
      if (list.length > 0) setSelectedCollectGu(list[0].guName);
    }).catch(() => {});
  }, [guList.length]);

  // 구 경계 선택 시 해당 구의 공공단지 조회
  useEffect(() => {
    if (!selectedDistrict) { setPublicComplexes([]); return; }
    const gu = guList.find(g => g.guName === selectedDistrict);
    if (!gu) return;
    setShowPublicComplexes(true);
    setShowMyComplexes(true);
    getPublicComplexes(gu.sigunguCd).then(setPublicComplexes).catch(() => setPublicComplexes([]));
  }, [selectedDistrict, guList]);

  const handleCollect = async () => {
    if (!selectedCollectGu) return;
    if (!window.confirm(`${selectedCollectGu} 공공단지 수집을 시작합니다.\n수집에는 수 분이 소요될 수 있습니다.`)) return;
    setCollectStatus('collecting');
    try {
      await collectPublicComplexes(selectedCollectGu);
      setCollectStatus('done');
    } catch {
      setCollectStatus('error');
    }
  };

  // 경로 저장 — 신규면 POST, 수정이면 PATCH
  const handleSaveRoute = async () => {
    if (!routeName.trim() || drawingPoints.length < 2) return;
    try {
      if (editingRouteId !== null) {
        const updated = await updateRoute(editingRouteId, routeName.trim(), drawingPoints);
        setRoutes(prev => prev.map(r => r.id === editingRouteId ? updated : r));
        // 수정 후 활성 상태 유지
        setActiveRouteIds(prev => new Set(Array.from(prev).concat(editingRouteId)));
      } else {
        const saved = await createRoute(routeName.trim(), drawingPoints);
        setRoutes(prev => [saved, ...prev]);
        setActiveRouteIds(prev => new Set(Array.from(prev).concat(saved.id)));
      }
      setIsDrawingRoute(false);
      setEditingRouteId(null);
      setDrawingPoints([]);
      setRouteName('');
    } catch {}
  };

  // 경로 그리기/수정 취소
  const handleCancelDrawing = () => {
    setIsDrawingRoute(false);
    setEditingRouteId(null);
    setDrawingPoints([]);
    setRouteName('');
  };

  // 생활권 구획 그리기 시작 — LivingZonePanel의 "구획 그리기" 버튼 클릭 시 호출
  const handleStartZoneDrawing = (zoneId: number) => {
    setTargetZoneId(zoneId);
    setIsDrawingZone(true);
    setDrawingZonePoints([]);
  };

  // 구획 꼭지점 추가 — 지도 클릭 시 호출
  const handleZonePointAdd = (p: RoutePoint) => {
    setDrawingZonePoints(prev => [...prev, p]);
  };

  // 구획 그리기 취소
  const handleCancelZoneDrawing = () => {
    setIsDrawingZone(false);
    setDrawingZonePoints([]);
    setTargetZoneId(null);
  };

  // 구획 확인 — 폴리곤 내부 단지 탐지 후 생활권에 추가
  const handleConfirmZoneDrawing = async () => {
    if (drawingZonePoints.length < 3) {
      alert('구획을 완성하려면 3개 이상의 점을 찍어야 합니다.');
      return;
    }
    if (targetZoneId === null) return;

    // 좌표가 있는 단지 중 폴리곤 내부에 포함된 단지 탐지
    const matched = complexes.filter(c =>
      c.latitude && c.longitude &&
      pointInPolygon({ lat: c.latitude, lng: c.longitude }, drawingZonePoints)
    );

    if (matched.length === 0) {
      alert('구획 내에 저장된 단지가 없습니다.');
      return;
    }

    if (!window.confirm(`구획 내 단지 ${matched.length}개를 생활권에 추가하시겠습니까?\n\n${matched.map(c => c.complexName).join(', ')}`)) {
      return;
    }

    setZoneDrawingSaving(true);
    try {
      // 단지 추가 + 폴리곤 좌표 저장 병렬 처리
      await Promise.all([
        addComplexesToZone(targetZoneId, matched.map(c => c.id)),
        updateLivingZonePolygon(targetZoneId, drawingZonePoints),
      ]);
      handleCancelZoneDrawing();
      // 생활권 패널 데이터 리로드 — key 변경으로 컴포넌트 리마운트
      setLivingZoneRefreshKey(k => k + 1);
    } catch {
      alert('단지 추가에 실패했습니다.');
    }
    setZoneDrawingSaving(false);
  };

  // 경로 삭제
  const handleDeleteRoute = async (id: number) => {
    try {
      await deleteRoute(id);
      setRoutes(prev => prev.filter(r => r.id !== id));
      setActiveRouteIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      if (editingRouteId === id) handleCancelDrawing();
    } catch {}
  };

  // GPX 불러오기 — 파싱된 이름·좌표로 신규 경로 저장
  const handleImportGpx = async (name: string, points: RoutePoint[]) => {
    try {
      const saved = await createRoute(name, points);
      setRoutes(prev => [saved, ...prev]);
      setActiveRouteIds(prev => new Set(Array.from(prev).concat(saved.id)));
    } catch {
      alert('경로 저장에 실패했습니다.');
    }
  };


  // null 클릭 = '전체' 버튼 → 빈 문자열로 변환해 모달을 전체 목록으로 오픈
  const handlePriceRangeSelect = (range: string | null) => {
    setListModalAreaType(null); // 평형 필터 초기화
    setListModalRange(range === null ? '' : range);
  };

  // 평형 pill 클릭 → 금액대 + 평형 동시 필터로 목록 팝업 오픈
  const handleAreaTypeSelect = (range: string, areaType: string) => {
    setListModalAreaType(areaType);
    setListModalRange(range);
  };

  // 검색 결과 선택 시 지도 이동 + 등록 모달 오픈 (fromSearch=true → 실거래가 자동 조회)
  const handleSearchSelect = (data: SearchSelectData) => {
    setFocusLocation({ lat: data.lat, lng: data.lng });
    setRegisterData({
      complexName: data.title,
      address: data.roadAddress || data.address,
      latitude: data.lat,
      longitude: data.lng,
      fromSearch: true,
    });
  };

  // 지도 마커 또는 목록에서 단지 선택 — 생활권·분석 패널은 닫고 단지 패널 오픈
  const handleComplexSelect = (complex: ApartmentComplex) => {
    setSelectedComplex(complex);
    setLivingZoneOpen(false);
    setAffordOpen(false);
  };

  // 목록에서 단지 선택 시 사이드패널 표시 + 좌표가 있으면 지도도 이동
  const handleListSelect = (complex: ApartmentComplex) => {
    handleComplexSelect(complex);
    if (complex.latitude && complex.longitude) {
      setFocusLocation({ lat: complex.latitude, lng: complex.longitude });
    }
  };

  // 메모 저장 성공 시 complexes 배열과 selectedComplex를 즉시 갱신 — 재조회 없이 반영
  const handleMemoUpdate = (complexId: number, memo: string) => {
    setComplexes(prev => prev.map(c => c.id === complexId ? { ...c, memo } : c));
    setSelectedComplex(prev => prev && prev.id === complexId ? { ...prev, memo } : prev);
  };

  // 단지 삭제 성공 시 목록에서 즉시 제거
  const handleComplexDelete = (complexId: number) => {
    setComplexes(prev => prev.filter(c => c.id !== complexId));
  };

  // 단지 정보 갱신 — 상세 조회(getComplexById)는 목록용 computed 필드를 포함하지 않을 수 있으므로
  // 기존 항목의 priceRange·areaTypes·areaTypePriceRanges를 fallback으로 유지
  // (ComplexInfoPanel이 학군/인프라 수정 후 재조회할 때 지도 마커 금액대 정보 손실 방지)
  const handleComplexUpdate = (updated: ApartmentComplex) => {
    setComplexes(prev => prev.map(c => {
      if (c.id !== updated.id) return c;
      return {
        ...updated,
        priceRange: updated.priceRange || c.priceRange,
        areaTypes: updated.areaTypes ?? c.areaTypes,
        areaTypePriceRanges: updated.areaTypePriceRanges ?? c.areaTypePriceRanges,
      };
    }));
    setSelectedComplex(updated);
  };

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* 헤더 — 데스크탑: 1줄 56px / 모바일: 2줄 (Row1 로고+버튼, Row2 검색+필터) */}
      <header ref={headerRef} style={{
        backgroundColor: '#fff', borderBottom: '1px solid #e8eaed',
        borderTop: '3px solid #89CFF0',
        boxShadow: '0 1px 6px rgba(137,207,240,0.15)', flexShrink: 0, zIndex: 10,
        ...(isMobile ? {} : {
          display: 'flex', flexDirection: 'column',
        }),
      }}>
        {isMobile ? (
          <>
            {/* 모바일 Row1: 로고 + 단지수 + 활성 뱃지 + ☰ 메뉴 버튼 */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', height: '48px', gap: '6px' }}>
              <img src="/do_the_rich.png" alt="DoTheRich" onClick={handleGoHome} style={{ width: '26px', height: '26px', borderRadius: '6px', objectFit: 'contain', flexShrink: 0, cursor: 'pointer' }} />
              <span onClick={handleGoHome} style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap', cursor: 'pointer' }}>DoTheRich</span>
              <span style={{ fontSize: '11px', color: '#80868b', whiteSpace: 'nowrap' }}>
                {loading ? '' : `${complexes.length}개`}
              </span>
              {/* 활성 기능 뱃지 — 어떤 패널이 열려있는지 한눈에 표시 */}
              <div style={{ flex: 1, display: 'flex', gap: '4px', flexWrap: 'nowrap', overflow: 'hidden', alignItems: 'center' }}>
                {compareIds.length > 0 && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#4BAAD4', backgroundColor: '#D4EFFC', padding: '2px 6px', borderRadius: '8px', whiteSpace: 'nowrap' }}>
                    비교 {compareIds.length}
                  </span>
                )}
                {livingZoneOpen && <span style={{ fontSize: '10px', fontWeight: 700, color: '#4BAAD4', backgroundColor: '#D4EFFC', padding: '2px 6px', borderRadius: '8px' }}>생활권</span>}
                {routePanelOpen && <span style={{ fontSize: '10px', fontWeight: 700, color: '#5AAF84', backgroundColor: '#e6f4ea', padding: '2px 6px', borderRadius: '8px' }}>경로</span>}
                {affordOpen && <span style={{ fontSize: '10px', fontWeight: 700, color: '#5AAF84', backgroundColor: '#e6f4ea', padding: '2px 6px', borderRadius: '8px' }}>대출</span>}
                {/* 동영 전용 다짐 문구 */}
                {localStorage.getItem(BUDGET_USER_STORAGE_KEY) === 'ldy' && (
                  <span style={{
                    fontFamily: "'Nanum Brush Script', cursive",
                    fontSize: '15px',
                    fontWeight: 700,
                    color: '#1a3a5c',
                    whiteSpace: 'nowrap',
                    marginLeft: 'auto',
                    opacity: 0.85,
                    flexShrink: 0,
                  }}>
                    나는 해야 한다. 그러므로 할 수 있다.
                  </span>
                )}
              </div>
              {/* 햄버거 버튼 */}
              <button
                onClick={() => setMobileMenuOpen(v => !v)}
                style={{
                  padding: '6px 10px', fontSize: '18px', lineHeight: 1,
                  border: '1px solid', borderColor: mobileMenuOpen ? '#89CFF0' : '#dadce0',
                  borderRadius: '8px', backgroundColor: mobileMenuOpen ? '#D4EFFC' : '#fff',
                  color: mobileMenuOpen ? '#2a6090' : '#5f6368', cursor: 'pointer', flexShrink: 0,
                }}
                aria-label="메뉴"
              >☰</button>
            </div>

            {/* 풀다운 메뉴 — ☰ 클릭 시 펼침 */}
            {mobileMenuOpen && (
              <div style={{
                padding: '8px 10px 10px',
                borderTop: '1px solid #f0f0f0',
              }}>
              {/* 구 경계 선택 */}
              <div style={{ marginBottom: '8px' }}>
                <DistrictSelector value={selectedDistrict} onChange={v => { setSelectedDistrict(v); setMobileMenuOpen(false); }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {/* 내 단지 */}
                {([
                  {
                    label: isFiltersActive(activeFilters) ? `필터 ${filteredComplexes.length}/${complexes.length}` : '필터',
                    active: filterOpen || isFiltersActive(activeFilters),
                    activeColor: '#BA8BD8', activeBg: '#f3e5f5',
                    onClick: () => { setFilterOpen(v => !v); setMobileMenuOpen(false); },
                  },
                  {
                    label: '내 단지', active: myComplexListOpen,
                    activeColor: '#2a6090', activeBg: '#D4EFFC',
                    onClick: () => { setMyComplexListOpen(v => !v); setMobileMenuOpen(false); },
                  },
                  {
                    label: '★ 즐겨찾기', active: favoriteListOpen,
                    activeColor: '#FFD97D', activeBg: '#fef9e7',
                    onClick: () => { setFavoriteListOpen(v => !v); setMobileMenuOpen(false); },
                  },
                  {
                    label: '경로', active: routePanelOpen,
                    activeColor: '#5AAF84', activeBg: '#e6f4ea',
                    onClick: () => { routePanelOpen ? handleClosRoutePanel() : setRoutePanelOpen(true); setMobileMenuOpen(false); },
                  },
                  {
                    label: '생활권', active: livingZoneOpen,
                    activeColor: '#2a6090', activeBg: '#D4EFFC',
                    onClick: () => {
                      const next = !livingZoneOpen;
                      setLivingZoneOpen(next);
                      if (next) { setSelectedComplex(null); setRadiusCenter(null); setAffordOpen(false); }
                      setMobileMenuOpen(false);
                    },
                  },
                  {
                    label: '대출', active: affordOpen,
                    activeColor: '#5AAF84', activeBg: '#e6f4ea',
                    onClick: () => {
                      const next = !affordOpen;
                      setAffordOpen(next);
                      if (next) { setSelectedComplex(null); setRadiusCenter(null); setLivingZoneOpen(false); }
                      setMobileMenuOpen(false);
                    },
                  },
                  {
                    label: '로드뷰', active: roadViewOpen,
                    activeColor: '#5AAF84', activeBg: '#e6f4ea',
                    onClick: () => { setRoadViewOpen(v => !v); setMobileMenuOpen(false); },
                  },
                  {
                    label: compareIds.length > 0 ? `비교 ${compareIds.length}` : '비교하기',
                    active: compareOpen || compareIds.length > 0,
                    activeColor: '#2a6090', activeBg: '#D4EFFC',
                    onClick: () => { setCompareOpen(prev => !prev); setMobileMenuOpen(false); },
                  },
                  {
                    label: '구별 시세',
                    active: districtStatsOpen,
                    activeColor: '#2a6090', activeBg: '#D4EFFC',
                    onClick: () => { setDistrictStatsOpen(v => !v); setMobileMenuOpen(false); },
                  },
                  {
                    label: '체크리스트',
                    active: checklistPanelOpen,
                    activeColor: '#b07d00', activeBg: '#fef9e7',
                    onClick: () => { setChecklistPanelOpen(v => !v); setMobileMenuOpen(false); },
                  },
                  {
                    label: '💰 가계부',
                    active: budgetOpen,
                    activeColor: '#2a6090', activeBg: '#e0f8ff',
                    onClick: () => {
                      if (!localStorage.getItem(BUDGET_USER_STORAGE_KEY)) {
                        setShowUserSelect(true);
                      } else {
                        setBudgetOpen(true);
                      }
                      setMobileMenuOpen(false);
                    },
                  },
                  {
                    label: '📅 달력',
                    active: calendarOpen,
                    activeColor: '#2a6090', activeBg: '#e0f8ff',
                    onClick: () => { setCalendarOpen(v => !v); setMobileMenuOpen(false); },
                  },
                ] as { label: string; active: boolean; activeColor: string; activeBg: string; onClick: () => void }[]).map(item => (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    style={{
                      padding: '8px 4px', fontSize: '12px', fontWeight: 600,
                      border: '1px solid', borderRadius: '8px', cursor: 'pointer',
                      borderColor: item.active ? item.activeColor : '#dadce0',
                      backgroundColor: item.active ? item.activeBg : '#fff',
                      color: item.active ? item.activeColor : '#5f6368',
                    }}
                  >{item.label}</button>
                ))}
              </div>
              </div>
            )}

            {/* 모바일 Row2: 검색바 */}
            <div style={{ padding: '0 10px 4px' }}>
              <SearchBar onSelect={handleSearchSelect} fluid />
            </div>
            {/* 모바일 Row3: 금액대 필터 */}
            <div style={{ padding: '0 10px 8px', borderTop: '1px solid #d4edfb', backgroundColor: '#f0f8fd' }}>
              <PriceRangeFilter
                key={filterResetKey}
                priceRanges={priceRanges}
                selectedRange={null}
                onSelect={handlePriceRangeSelect}
                onSelectAreaType={handleAreaTypeSelect}
                complexes={complexes}
              />
            </div>
          </>
        ) : (
          <>
            {/* 데스크탑 Row 1: 로고 + 검색(가변) + 버튼들 */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: '48px', gap: '8px' }}>
              {/* 로고 */}
              <div onClick={handleGoHome} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, cursor: 'pointer' }}>
                <img src="/do_the_rich.png" alt="DoTheRich" style={{ width: '28px', height: '28px', borderRadius: '8px', objectFit: 'contain' }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap' }}>DoTheRich</span>
              </div>
              <div style={{ width: '1px', height: '20px', backgroundColor: '#e8eaed', flexShrink: 0 }} />
              {/* 검색바 — 남은 공간 채우되 최대 480px */}
              <div style={{ flex: 1, maxWidth: '480px' }}>
                <SearchBar onSelect={handleSearchSelect} fluid />
              </div>
              <div style={{ width: '1px', height: '20px', backgroundColor: '#e8eaed', flexShrink: 0 }} />
              {/* 내 단지 */}
              <button
                onClick={() => setMyComplexListOpen(v => !v)}
                style={{
                  padding: '4px 10px', fontSize: '12px', fontWeight: 600,
                  border: '1px solid', borderColor: myComplexListOpen ? '#89CFF0' : '#dadce0',
                  borderRadius: '6px', backgroundColor: myComplexListOpen ? '#D4EFFC' : '#fff',
                  color: myComplexListOpen ? '#2a6090' : '#5f6368', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >내 단지</button>
              {/* ★ 즐겨찾기 */}
              <button
                onClick={() => setFavoriteListOpen(v => !v)}
                style={{
                  padding: '4px 10px', fontSize: '12px', fontWeight: 600,
                  border: '1px solid', borderColor: favoriteListOpen ? '#FFD97D' : '#dadce0',
                  borderRadius: '6px', backgroundColor: favoriteListOpen ? '#fef9e7' : '#fff',
                  color: favoriteListOpen ? '#a07600' : '#9e9e9e', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >★ 즐겨찾기</button>
              {/* 비교하기 */}
              <button
                onClick={() => setCompareOpen(prev => !prev)}
                style={{
                  padding: '4px 10px', fontSize: '12px', fontWeight: 600,
                  border: '1px solid',
                  borderColor: compareOpen || compareIds.length > 0 ? '#89CFF0' : '#dadce0',
                  borderRadius: '6px',
                  backgroundColor: compareOpen || compareIds.length > 0 ? '#D4EFFC' : '#fff',
                  color: compareOpen || compareIds.length > 0 ? '#2a6090' : '#5f6368',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >{compareIds.length > 0 ? `비교 중 ${compareIds.length}/3` : '비교하기'}</button>
              {/* 단지 수 뱃지 */}
              <div style={{
                fontSize: '11px', color: '#80868b', whiteSpace: 'nowrap', flexShrink: 0,
                background: '#f1f3f4', borderRadius: '12px', padding: '3px 8px',
              }}>
                {loading ? '로딩...' : `${complexes.length}개`}
              </div>
              {/* 동영 전용 다짐 문구 */}
              {localStorage.getItem(BUDGET_USER_STORAGE_KEY) === 'ldy' && (
                <span style={{
                  fontFamily: "'Nanum Brush Script', cursive",
                  fontSize: '17px',
                  fontWeight: 700,
                  color: '#1a3a5c',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  marginLeft: 'auto',
                  opacity: 0.85,
                  letterSpacing: '0.3px',
                }}>
                  나는 해야 한다. 그러므로 할 수 있다.
                </span>
              )}
            </div>

            {/* 데스크탑 Row 2: 금액대 + 필터 + 5개 목적별 드롭다운 메뉴 */}
            <div style={{
              display: 'flex', alignItems: 'center', padding: '0 16px', height: '36px', gap: '6px',
              borderTop: '1px solid #d4edfb', backgroundColor: '#f0f8fd',
            }}>
              {/* 금액대 필터 */}
              <PriceRangeFilter
                key={filterResetKey}
                priceRanges={priceRanges}
                selectedRange={null}
                onSelect={handlePriceRangeSelect}
                onSelectAreaType={handleAreaTypeSelect}
                complexes={complexes}
              />
              {/* 필터 — Row 2로 이동, 금액대 바로 옆에 배치 */}
              <button
                onClick={() => setFilterOpen(v => !v)}
                style={{
                  padding: '3px 9px', fontSize: '12px', fontWeight: 600,
                  border: '1px solid',
                  borderColor: filterOpen || isFiltersActive(activeFilters) ? '#BA8BD8' : '#dadce0',
                  borderRadius: '6px',
                  backgroundColor: filterOpen || isFiltersActive(activeFilters) ? '#f3e5f5' : '#fff',
                  color: filterOpen || isFiltersActive(activeFilters) ? '#BA8BD8' : '#5f6368',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <span>필터</span>
                {isFiltersActive(activeFilters) && (
                  <span style={{
                    backgroundColor: '#BA8BD8', color: '#fff', borderRadius: '8px',
                    fontSize: '10px', fontWeight: 700, padding: '1px 5px',
                  }}>
                    {filteredComplexes.length}/{complexes.length}
                  </span>
                )}
              </button>
              <div style={{ width: '1px', height: '18px', backgroundColor: '#e8eaed', flexShrink: 0 }} />

              {/* 드롭다운 외부 클릭 시 닫기용 투명 오버레이 */}
              {openMenu && (
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                  onClick={() => setOpenMenu(null)}
                />
              )}

              {/* ─── 🗺 지도 드롭다운 ─── */}
              {(() => {
                const key = 'map';
                const isOpen = openMenu === key;
                const isActive = roadViewOpen || routePanelOpen || !!selectedDistrict;
                const menuItemStyle = (active: boolean, color: string): React.CSSProperties => ({
                  padding: '7px 12px', borderRadius: '6px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: active ? 700 : 500,
                  color: active ? color : '#344054',
                  backgroundColor: active ? `${color}22` : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  userSelect: 'none',
                });
                return (
                  <div style={{ position: 'relative', flexShrink: 0, zIndex: isOpen ? 1000 : 1 }}>
                    <button
                      onClick={() => setOpenMenu(isOpen ? null : key)}
                      style={{
                        padding: '3px 9px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid',
                        borderColor: isOpen ? '#4BAAD4' : isActive ? '#89CFF0' : '#dadce0',
                        borderRadius: '6px',
                        backgroundColor: isOpen ? '#D4EFFC' : isActive ? '#f0f8fd' : '#fff',
                        color: isOpen || isActive ? '#2a6090' : '#5f6368',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      🗺 지도 <span style={{ fontSize: '9px', opacity: 0.6 }}>{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                        background: '#fff', border: '1px solid #dadce0', borderRadius: '10px',
                        padding: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1000,
                        minWidth: '210px', display: 'flex', flexDirection: 'column', gap: '2px',
                      }}>
                        {/* 로드뷰 */}
                        <div style={menuItemStyle(roadViewOpen, '#5AAF84')}
                          onClick={() => { setRoadViewOpen(v => !v); setOpenMenu(null); }}>
                          로드뷰 {roadViewOpen && <span style={{ fontSize: '10px', color: '#5AAF84' }}>ON</span>}
                        </div>
                        {/* 경로 */}
                        <div style={menuItemStyle(routePanelOpen, '#5AAF84')}
                          onClick={() => { routePanelOpen ? handleClosRoutePanel() : setRoutePanelOpen(true); setOpenMenu(null); }}>
                          경로 {routePanelOpen && <span style={{ fontSize: '10px', color: '#5AAF84' }}>ON</span>}
                        </div>
                        <div style={{ height: '1px', background: '#f0f0f0', margin: '2px 0' }} />
                        {/* 구 경계 */}
                        <div style={{ padding: '4px 10px' }}>
                          <div style={{ fontSize: '11px', color: '#9aa0a6', marginBottom: '4px', fontWeight: 600 }}>구 경계</div>
                          <DistrictSelector value={selectedDistrict} onChange={setSelectedDistrict} />
                        </div>
                        {/* 내단지 / 아파트 토글 — 구 선택 시에만 */}
                        {selectedDistrict && (
                          <div style={{ padding: '2px 10px', display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => setShowMyComplexes(v => !v)}
                              style={{
                                flex: 1, padding: '5px 0', fontSize: '11px', fontWeight: 600,
                                border: '1px solid', borderColor: showMyComplexes ? '#89CFF0' : '#dadce0',
                                borderRadius: '6px', backgroundColor: showMyComplexes ? '#f0f8fd' : '#fff',
                                color: showMyComplexes ? '#1a6a9a' : '#5f6368', cursor: 'pointer',
                              }}
                            >내단지</button>
                            {publicComplexes.length > 0 && (
                              <button
                                onClick={() => setShowPublicComplexes(v => !v)}
                                style={{
                                  flex: 1, padding: '5px 0', fontSize: '11px', fontWeight: 600,
                                  border: '1px solid', borderColor: showPublicComplexes ? '#89CFF0' : '#dadce0',
                                  borderRadius: '6px', backgroundColor: showPublicComplexes ? '#f0f8fd' : '#fff',
                                  color: showPublicComplexes ? '#1a6a9a' : '#5f6368', cursor: 'pointer',
                                }}
                              >아파트</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ─── 📋 임장 드롭다운 ─── */}
              {(() => {
                const key = 'checklist';
                const isOpen = openMenu === key;
                const isActive = checklistPanelOpen || livingZoneOpen;
                const menuItemStyle = (active: boolean, color: string): React.CSSProperties => ({
                  padding: '7px 12px', borderRadius: '6px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: active ? 700 : 500,
                  color: active ? color : '#344054',
                  backgroundColor: active ? `${color}22` : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  userSelect: 'none',
                });
                return (
                  <div style={{ position: 'relative', flexShrink: 0, zIndex: isOpen ? 1000 : 1 }}>
                    <button
                      onClick={() => setOpenMenu(isOpen ? null : key)}
                      style={{
                        padding: '3px 9px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid',
                        borderColor: isOpen ? '#4BAAD4' : isActive ? '#FFD97D' : '#dadce0',
                        borderRadius: '6px',
                        backgroundColor: isOpen ? '#D4EFFC' : isActive ? '#fef9e7' : '#fff',
                        color: isOpen ? '#2a6090' : isActive ? '#b07d00' : '#5f6368',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      📋 임장 <span style={{ fontSize: '9px', opacity: 0.6 }}>{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                        background: '#fff', border: '1px solid #dadce0', borderRadius: '10px',
                        padding: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1000,
                        minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '2px',
                      }}>
                        <div style={menuItemStyle(checklistPanelOpen, '#b07d00')}
                          onClick={() => { setChecklistPanelOpen(v => !v); setOpenMenu(null); }}>
                          체크리스트 {checklistPanelOpen && <span style={{ fontSize: '10px', color: '#b07d00' }}>ON</span>}
                        </div>
                        <div style={menuItemStyle(livingZoneOpen, '#2a6090')}
                          onClick={() => {
                            const next = !livingZoneOpen;
                            setLivingZoneOpen(next);
                            if (next) { setSelectedComplex(null); setRadiusCenter(null); setAffordOpen(false); }
                            setOpenMenu(null);
                          }}>
                          생활권 {livingZoneOpen && <span style={{ fontSize: '10px', color: '#2a6090' }}>ON</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ─── 📊 시세분석 드롭다운 ─── */}
              {(() => {
                const key = 'stats';
                const isOpen = openMenu === key;
                const isActive = districtStatsOpen || affordOpen;
                const menuItemStyle = (active: boolean, color: string): React.CSSProperties => ({
                  padding: '7px 12px', borderRadius: '6px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: active ? 700 : 500,
                  color: active ? color : '#344054',
                  backgroundColor: active ? `${color}22` : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  userSelect: 'none',
                });
                return (
                  <div style={{ position: 'relative', flexShrink: 0, zIndex: isOpen ? 1000 : 1 }}>
                    <button
                      onClick={() => setOpenMenu(isOpen ? null : key)}
                      style={{
                        padding: '3px 9px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid',
                        borderColor: isOpen ? '#4BAAD4' : isActive ? '#89CFF0' : '#dadce0',
                        borderRadius: '6px',
                        backgroundColor: isOpen ? '#D4EFFC' : isActive ? '#f0f8fd' : '#fff',
                        color: isOpen || isActive ? '#2a6090' : '#5f6368',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      📊 시세분석 <span style={{ fontSize: '9px', opacity: 0.6 }}>{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                        background: '#fff', border: '1px solid #dadce0', borderRadius: '10px',
                        padding: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1000,
                        minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '2px',
                      }}>
                        <div style={menuItemStyle(districtStatsOpen, '#2a6090')}
                          onClick={() => { setDistrictStatsOpen(v => !v); setOpenMenu(null); }}>
                          구별 시세 {districtStatsOpen && <span style={{ fontSize: '10px', color: '#2a6090' }}>ON</span>}
                        </div>
                        <div style={menuItemStyle(affordOpen, '#5AAF84')}
                          onClick={() => {
                            const next = !affordOpen;
                            setAffordOpen(next);
                            if (next) { setSelectedComplex(null); setRadiusCenter(null); setLivingZoneOpen(false); }
                            setOpenMenu(null);
                          }}>
                          대출 분석 {affordOpen && <span style={{ fontSize: '10px', color: '#5AAF84' }}>ON</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ─── 📅 생활 드롭다운 ─── */}
              {(() => {
                const key = 'life';
                const isOpen = openMenu === key;
                const isActive = calendarOpen || budgetOpen || travelLogOpen;
                const menuItemStyle = (active: boolean, color: string): React.CSSProperties => ({
                  padding: '7px 12px', borderRadius: '6px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: active ? 700 : 500,
                  color: active ? color : '#344054',
                  backgroundColor: active ? `${color}22` : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  userSelect: 'none',
                });
                return (
                  <div style={{ position: 'relative', flexShrink: 0, zIndex: isOpen ? 1000 : 1 }}>
                    <button
                      onClick={() => setOpenMenu(isOpen ? null : key)}
                      style={{
                        padding: '3px 9px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid',
                        borderColor: isOpen ? '#4BAAD4' : isActive ? '#89CFF0' : '#dadce0',
                        borderRadius: '6px',
                        backgroundColor: isOpen ? '#D4EFFC' : isActive ? '#f0f8fd' : '#fff',
                        color: isOpen || isActive ? '#2a6090' : '#5f6368',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      📅 생활 <span style={{ fontSize: '9px', opacity: 0.6 }}>{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                        background: '#fff', border: '1px solid #dadce0', borderRadius: '10px',
                        padding: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1000,
                        minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '2px',
                      }}>
                        <div style={menuItemStyle(calendarOpen, '#2a6090')}
                          onClick={() => { setCalendarOpen(v => !v); setOpenMenu(null); }}>
                          📅 달력 {calendarOpen && <span style={{ fontSize: '10px', color: '#2a6090' }}>ON</span>}
                        </div>
                        <div style={menuItemStyle(budgetOpen, '#2a6090')}
                          onClick={() => {
                            if (!localStorage.getItem(BUDGET_USER_STORAGE_KEY)) {
                              setShowUserSelect(true);
                            } else {
                              setBudgetOpen(true);
                            }
                            setOpenMenu(null);
                          }}>
                          💰 가계부 {budgetOpen && <span style={{ fontSize: '10px', color: '#2a6090' }}>ON</span>}
                        </div>
                        <div style={menuItemStyle(travelLogOpen, '#6a1b9a')}
                          onClick={() => {
                            const next = !travelLogOpen;
                            setTravelLogOpen(next);
                            if (next) { setSelectedComplex(null); setRadiusCenter(null); setLivingZoneOpen(false); setAffordOpen(false); }
                            setOpenMenu(null);
                          }}>
                          🗺 여행일지 {travelLogOpen && <span style={{ fontSize: '10px', color: '#6a1b9a' }}>ON</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ─── ⚙ 데이터 드롭다운 ─── */}
              {(() => {
                const key = 'data';
                const isOpen = openMenu === key;
                const isActive = !!(batchStatus?.running) || collectPanelOpen;
                const menuItemStyle = (active: boolean, color: string): React.CSSProperties => ({
                  padding: '7px 12px', borderRadius: '6px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: active ? 700 : 500,
                  color: active ? color : '#344054',
                  backgroundColor: active ? `${color}22` : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  userSelect: 'none',
                });
                return (
                  <div style={{ position: 'relative', flexShrink: 0, zIndex: isOpen ? 1000 : 1 }}>
                    <button
                      onClick={() => setOpenMenu(isOpen ? null : key)}
                      style={{
                        padding: '3px 9px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid',
                        borderColor: isOpen ? '#4BAAD4' : isActive ? '#E06060' : '#dadce0',
                        borderRadius: '6px',
                        backgroundColor: isOpen ? '#D4EFFC' : isActive ? '#fdecea' : '#fff',
                        color: isOpen ? '#2a6090' : isActive ? '#E06060' : '#5f6368',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      ⚙ 데이터 <span style={{ fontSize: '9px', opacity: 0.6 }}>{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                        background: '#fff', border: '1px solid #dadce0', borderRadius: '10px',
                        padding: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1000,
                        minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '2px',
                      }}>
                        {/* 거래이력 수집 */}
                        <div style={menuItemStyle(!!(batchStatus?.running), '#43a047')}
                          onClick={() => { batchStatus ? setBatchPanelOpen(v => !v) : checkBatchStatus(); setOpenMenu(null); }}>
                          거래이력 수집
                          {batchStatus?.running
                            ? <span style={{ fontSize: '10px', color: '#43a047' }}>{batchStatus.done}/{batchStatus.total}</span>
                            : null}
                        </div>
                        {/* 공공단지 수집 */}
                        <div style={menuItemStyle(collectPanelOpen, '#E06060')}
                          onClick={() => { setCollectPanelOpen(v => !v); setCollectStatus('idle'); }}>
                          공공단지 수집 {collectPanelOpen && <span style={{ fontSize: '10px', color: '#E06060' }}>ON</span>}
                        </div>
                        {/* 공공단지 수집 인라인 패널 */}
                        {collectPanelOpen && (
                          <div style={{
                            margin: '2px 4px', background: '#fafafa', border: '1px solid #f0f0f0',
                            borderRadius: '8px', padding: '8px',
                            display: 'flex', flexDirection: 'column', gap: '6px',
                          }}>
                            <div style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>수도권 지역 선택</div>
                            <select
                              value={selectedCollectGu}
                              onChange={e => { setSelectedCollectGu(e.target.value); setCollectStatus('idle'); }}
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: '12px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #dadce0' }}
                            >
                              {['서울', '경기', '인천'].map(prov => {
                                const items = guList.filter(g => g.province === prov);
                                if (items.length === 0) return null;
                                return (
                                  <optgroup key={prov} label={prov}>
                                    {items.map(g => <option key={g.guName} value={g.guName}>{g.guName}</option>)}
                                  </optgroup>
                                );
                              })}
                            </select>
                            <button
                              onClick={e => { e.stopPropagation(); handleCollect(); }}
                              disabled={collectStatus === 'collecting' || !selectedCollectGu}
                              style={{
                                padding: '5px', fontSize: '12px', fontWeight: 600, borderRadius: '6px',
                                border: 'none', cursor: collectStatus === 'collecting' ? 'not-allowed' : 'pointer',
                                background: collectStatus === 'collecting' ? '#ccc' : '#E06060', color: '#fff',
                              }}
                            >{collectStatus === 'collecting' ? '수집 중…' : '수집 시작'}</button>
                            {collectStatus === 'done' && (
                              <div style={{ fontSize: '11px', color: '#2e7d32', fontWeight: 600 }}>
                                ✅ 수집 요청 완료 (백그라운드 진행)
                              </div>
                            )}
                            {collectStatus === 'error' && (
                              <div style={{ fontSize: '11px', color: '#E06060', fontWeight: 600 }}>
                                ❌ 수집 실패 — 서버 로그 확인
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </header>

      {/* 에러 배너 */}
      {error && (
        <div style={{
          padding: '10px 16px', backgroundColor: '#FFE8E8', color: '#E06060',
          fontSize: '13px', borderBottom: '1px solid #f5c6c6', flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* 본문: 지도 + 사이드패널 (비교 모드에서는 비교 카드 뷰로 전환) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {compareIds.length > 0 ? (
          /* 비교 뷰 — 일반: 최대 3카드 / 비교평가: 2카드 + 평가 패널 */
          <div style={{ display: 'flex', flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
            {compareIds.map(id => {
              const c = complexes.find(x => x.id === id);
              if (!c) return null;
              return (
                <CompareCard
                  key={id}
                  complex={c}
                  onClose={() => handleCompareToggle(id)}
                />
              );
            })}

            {/* 거래량 이력 비교 플로팅 버튼 */}
            <button
              onClick={() => setTradeCompareOpen(true)}
              title="거래량 이력 비교"
              style={{
                position: 'absolute', bottom: '20px', right: '20px',
                zIndex: 50,
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 16px',
                background: '#fff',
                border: '1.5px solid #4BAAD4',
                borderRadius: '24px',
                color: '#4BAAD4', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(75,170,212,0.25)',
              }}
            >
              📊 거래량 이력
            </button>

            {compareMode === 'evaluation' ? (
              compareIds.length < 2 ? (
                /* 비교평가 — 1개만 선택됐을 때 빈 슬롯 */
                <div
                  onClick={() => setCompareOpen(true)}
                  style={{
                    flex: 1, minWidth: isMobile ? '200px' : 0, height: '100%',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: '10px', cursor: 'pointer',
                    backgroundColor: '#f0faf3', borderRight: '1px solid #ceead6',
                    color: '#7DC8A0',
                  }}
                >
                  <div style={{ fontSize: '36px', color: '#a8d5b5' }}>+</div>
                  <span style={{ fontSize: '13px' }}>비교할 단지 1개 더 추가</span>
                </div>
              ) : (
                /* 비교평가 — 2개 선택 시 평가 패널 표시 */
                (() => {
                  const c1 = complexes.find(x => x.id === compareIds[0]);
                  const c2 = complexes.find(x => x.id === compareIds[1]);
                  if (!c1 || !c2) return null;
                  return (
                    <ComparisonEvalPanel
                      key={`${c1.id}-${c2.id}`}
                      complex1={c1}
                      complex2={c2}
                      onComparisonChange={() => {}}
                    />
                  );
                })()
              )
            ) : (
              /* 일반 비교 — 3개 미만일 때 빈 슬롯 */
              compareIds.length < 3 && (
                <div
                  onClick={() => setCompareOpen(true)}
                  style={{
                    flex: 1, minWidth: isMobile ? '200px' : 0, height: '100%',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: '10px', cursor: 'pointer',
                    backgroundColor: '#f8f9fa', borderRight: '1px solid #e8eaed',
                    color: '#9e9e9e',
                  }}
                >
                  <div style={{ fontSize: '36px', color: '#dadce0' }}>+</div>
                  <span style={{ fontSize: '13px' }}>단지 추가</span>
                </div>
              )
            )}
          </div>
        ) : (
          /* 기본 뷰 — 지도는 항상 전체 렌더, 사이드패널은 모바일에서 fixed 오버레이 */
          <>
            <MapPage
              complexes={showMyComplexes ? filteredComplexes : []}
              selectedComplex={selectedComplex}
              onComplexSelect={handleComplexSelect}
              focusLocation={focusLocation}
              overlayMarkers={overlayMarkers}
              radiusCenter={radiusCenter}
              routes={routePanelOpen ? activeRoutes : []}
              drawingPoints={drawingPoints}
              isDrawingRoute={isDrawingRoute}
              onRoutePointAdd={handleRoutePointAdd}
              selectedDistrict={selectedDistrict}
              roadViewOpen={roadViewOpen}
              isMobile={isMobile}
              isDrawingZone={isDrawingZone}
              drawingZonePoints={drawingZonePoints}
              onZonePointAdd={handleZonePointAdd}
              zonePolygons={zonePolygons}
              publicComplexes={showPublicComplexes ? publicComplexes : []}
              travelPlaces={activeTravelPlaces}
              previewMarker={registerData ? { lat: registerData.latitude, lng: registerData.longitude } : null}
              hanRiverParkMarker={(() => {
                const name = selectedComplex?.hanRiverParkName;
                if (!name) return null;
                const park = HAN_RIVER_PARKS.find(p => p.name === name);
                return park ? { name, lat: park.lat, lng: park.lng } : null;
              })()}
            />
            {selectedComplex && !livingZoneOpen && (
              /* 모바일: 화면 전체를 덮는 fixed 오버레이 / 데스크탑: flex 옆 패널 */
              <div style={isMobile ? {
                position: 'fixed', inset: 0, zIndex: 500,
                display: 'flex', flexDirection: 'column',
              } : {}}>
                <ComplexInfoPanel
                  complex={selectedComplex}
                  onClose={() => {
                    (window as any).__closeInfoWindow?.();
                    setSelectedComplex(null);
                    setOverlayMarkers([]);
                    setRadiusCenter(null);
                  }}
                  onMemoUpdate={handleMemoUpdate}
                  onDelete={handleComplexDelete}
                  onOverlayMarkersChange={setOverlayMarkers}
                  onComplexUpdate={handleComplexUpdate}
                  onRadiusToggle={setRadiusCenter}
                  isMobile={isMobile}
                />
              </div>
            )}
            {livingZoneOpen && (
              <div style={isMobile ? {
                position: 'fixed', inset: 0, zIndex: 500,
                display: 'flex', flexDirection: 'column',
              } : {}}>
                <LivingZonePanel
                  key={livingZoneRefreshKey}
                  complexes={complexes}
                  onClose={() => { setLivingZoneOpen(false); setZonePolygons([]); }}
                  isMobile={isMobile}
                  onStartZoneDrawing={handleStartZoneDrawing}
                  onZonePolygonsChange={setZonePolygons}
                />
              </div>
            )}
            {affordOpen && (
              <div style={isMobile ? {
                position: 'fixed', inset: 0, zIndex: 500,
                display: 'flex', flexDirection: 'column',
              } : {}}>
                <AffordabilityPanel
                  complexes={complexes}
                  onClose={() => setAffordOpen(false)}
                  isMobile={isMobile}
                />
              </div>
            )}
            {/* 여행일지 패널 */}
            {travelLogOpen && (
              <div style={isMobile ? {
                position: 'fixed', inset: 0, zIndex: 500,
                display: 'flex', flexDirection: 'column',
              } : {}}>
                <TravelLogPanel
                  onClose={() => { setTravelLogOpen(false); setActiveTravelPlaces([]); }}
                  isMobile={isMobile}
                  onMapPlacesChange={setActiveTravelPlaces}
                />
              </div>
            )}
            {/* 모바일: 'list' 뷰일 때만 패널 표시 / 데스크탑: 항상 패널 표시 */}
            {filterOpen && (
              <div style={isMobile ? {
                position: 'fixed', inset: 0, zIndex: 500,
                display: 'flex', flexDirection: 'column',
              } : {}}>
                <FilterPanel
                  complexes={complexes}
                  filters={activeFilters}
                  onChange={setActiveFilters}
                  onClose={() => setFilterOpen(false)}
                  onSelect={c => { handleListSelect(c); if (isMobile) setFilterOpen(false); }}
                  isMobile={isMobile}
                />
              </div>
            )}
            {routePanelOpen && (!isMobile || mobileRouteView === 'list') && (
              <div style={isMobile ? {
                position: 'fixed', inset: 0, zIndex: 500,
                display: 'flex', flexDirection: 'column',
              } : {}}>
                <RoutePanel
                  routes={routes}
                  activeRouteIds={activeRouteIds}
                  isDrawingRoute={isDrawingRoute}
                  editingRouteId={editingRouteId}
                  onToggleActive={handleToggleActiveRoute}
                  onStartDrawing={handleStartDrawing}
                  onStartEdit={handleStartEditRoute}
                  onDelete={handleDeleteRoute}
                  onClose={handleClosRoutePanel}
                  onImportGpx={handleImportGpx}
                  onShowMap={isMobile ? () => setMobileRouteView('map') : undefined}
                  isMobile={isMobile}
                />
              </div>
            )}
            {/* 체크리스트 항목 관리 패널 */}
            {checklistPanelOpen && (
              <div style={isMobile ? {
                position: 'fixed', inset: 0, zIndex: 500,
                display: 'flex', flexDirection: 'column',
              } : {}}>
                <ChecklistTemplatePanel
                  onClose={() => setChecklistPanelOpen(false)}
                  isMobile={isMobile}
                />
              </div>
            )}
            {/* 구별 시세 현황 패널 */}
            {districtStatsOpen && (
              <div style={isMobile ? {
                position: 'fixed', inset: 0, zIndex: 500,
                display: 'flex', flexDirection: 'column',
              } : {}}>
                <DistrictStatsPanel
                  onClose={() => setDistrictStatsOpen(false)}
                  onToast={showToast}
                  isMobile={isMobile}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* 달력 모달 */}
      {calendarOpen && <CalendarModal onClose={() => setCalendarOpen(false)} />}
      {contactsOpen && <ContactsModal onClose={() => setContactsOpen(false)} />}
      {investmentMemoOpen && <InvestmentMemoModal onClose={() => setInvestmentMemoOpen(false)} />}

      {/* 가계부 전체화면 */}
      {budgetOpen && <BudgetPage onClose={() => setBudgetOpen(false)} />}

      {/* 유저 미선택 시 선택 모달 */}
      {showUserSelect && (
        <UserSelectModal onSelect={() => { setShowUserSelect(false); setBudgetOpen(true); }} />
      )}

      {/* 비교하기 단지 선택 패널 */}
      {compareOpen && (
        <CompareListModal
          complexes={complexes}
          priceRanges={priceRanges}
          selectedIds={compareIds}
          onToggle={handleCompareToggle}
          onClose={() => setCompareOpen(false)}
          compareMode={compareMode}
          onModeChange={handleCompareModeChange}
          onSelectComparison={handleSelectComparison}
          top={headerHeight}
          onOpenAiHistory={() => { setCompareOpen(false); setRealEstateAiOpen(true); }}
        />
      )}

      {/* 모바일 경로 지도 뷰 — 경로 목록 버튼 (지도 보는 중에 목록으로 돌아가기) */}
      {isMobile && routePanelOpen && mobileRouteView === 'map' && (
        <button
          onClick={() => setMobileRouteView('list')}
          style={{
            position: 'fixed', bottom: '24px', right: '16px', zIndex: 500,
            padding: '10px 16px', fontSize: '13px', fontWeight: 600,
            backgroundColor: '#5AAF84', color: '#fff',
            border: 'none', borderRadius: '20px', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          ☰ 경로 목록
        </button>
      )}

      {/* 경로 그리기 플로팅 바 — 지도를 클릭해 점을 찍고 이름 입력 후 저장 */}
      {isDrawingRoute && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, display: 'flex', alignItems: 'center', gap: '8px',
          backgroundColor: '#fff', borderRadius: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          padding: '10px 16px',
        }}>
          <span style={{ fontSize: '13px', color: '#5f6368', whiteSpace: 'nowrap' }}>
            📍 {drawingPoints.length}개 점
          </span>
          <button
            onClick={handleUndoLastPoint}
            disabled={drawingPoints.length === 0}
            style={{
              padding: '6px 10px', fontSize: '12px', fontWeight: 600,
              backgroundColor: drawingPoints.length === 0 ? '#f1f3f4' : '#FFE8E8',
              color: drawingPoints.length === 0 ? '#bdbdbd' : '#E06060',
              border: 'none', borderRadius: '8px',
              cursor: drawingPoints.length === 0 ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="직전 점 삭제"
          >↩ 삭제</button>
          <input
            type="text"
            value={routeName}
            onChange={e => setRouteName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveRoute(); }}
            placeholder="경로 이름 입력"
            style={{
              fontSize: '13px', padding: '6px 12px', border: '1px solid #dadce0',
              borderRadius: '8px', outline: 'none', width: '140px',
            }}
            autoFocus={!editingRouteId}
          />
          <button
            onClick={handleSaveRoute}
            disabled={drawingPoints.length < 2 || !routeName.trim()}
            style={{
              padding: '6px 14px', fontSize: '13px', fontWeight: 600,
              backgroundColor: drawingPoints.length < 2 || !routeName.trim() ? '#f1f3f4' : '#89CFF0',
              color: drawingPoints.length < 2 || !routeName.trim() ? '#9e9e9e' : '#1a3a5c',
              border: 'none', borderRadius: '8px',
              cursor: drawingPoints.length < 2 || !routeName.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >저장</button>
          <button
            onClick={handleCancelDrawing}
            style={{
              padding: '6px 14px', fontSize: '13px', fontWeight: 600,
              backgroundColor: '#f1f3f4', color: '#5f6368',
              border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >취소</button>
        </div>
      )}

      {/* 생활권 구획 그리기 플로팅 바 */}
      {isDrawingZone && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, display: 'flex', alignItems: 'center', gap: '8px',
          backgroundColor: '#fff', borderRadius: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          padding: '10px 16px',
        }}>
          <span style={{ fontSize: '13px', color: '#2e7d32', fontWeight: 600, whiteSpace: 'nowrap' }}>
            🗺️ 구획 {drawingZonePoints.length}개 점
          </span>
          <button
            onClick={() => setDrawingZonePoints(prev => prev.slice(0, -1))}
            disabled={drawingZonePoints.length === 0}
            style={{
              padding: '6px 10px', fontSize: '12px', fontWeight: 600,
              backgroundColor: drawingZonePoints.length === 0 ? '#f1f3f4' : '#FFE8E8',
              color: drawingZonePoints.length === 0 ? '#bdbdbd' : '#E06060',
              border: 'none', borderRadius: '8px',
              cursor: drawingZonePoints.length === 0 ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="직전 점 삭제"
          >↩ 삭제</button>
          <button
            onClick={handleConfirmZoneDrawing}
            disabled={drawingZonePoints.length < 3 || zoneDrawingSaving}
            style={{
              padding: '6px 14px', fontSize: '13px', fontWeight: 600,
              backgroundColor: drawingZonePoints.length < 3 || zoneDrawingSaving ? '#f1f3f4' : '#7DC8A0',
              color: drawingZonePoints.length < 3 || zoneDrawingSaving ? '#9e9e9e' : '#1a3a5c',
              border: 'none', borderRadius: '8px',
              cursor: drawingZonePoints.length < 3 || zoneDrawingSaving ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >{zoneDrawingSaving ? '추가 중...' : '확인'}</button>
          <button
            onClick={handleCancelZoneDrawing}
            style={{
              padding: '6px 14px', fontSize: '13px', fontWeight: 600,
              backgroundColor: '#f1f3f4', color: '#5f6368',
              border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >취소</button>
        </div>
      )}

      {/* 비교 모드 플로팅 버튼 영역 — 비교 카드가 보일 때 표시 */}
      {compareIds.length > 0 && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 400, display: 'flex', gap: '10px' }}>
          {/* AI 투자 분석 버튼 — 2개 이상 선택 시 활성 */}
          {compareIds.length >= 2 && (
            <button
              onClick={() => setRealEstateAiOpen(true)}
              style={{
                padding: '10px 18px', fontSize: '13px', fontWeight: 600,
                backgroundColor: '#89CFF0', color: '#fff',
                border: 'none', borderRadius: '20px', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(137,207,240,0.5)',
              }}
            >
              🤖 AI 투자 분석
            </button>
          )}
          <button
            onClick={handleCompareClose}
            style={{
              padding: '10px 18px', fontSize: '13px', fontWeight: 600,
              backgroundColor: '#E06060', color: '#fff',
              border: 'none', borderRadius: '20px', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            비교 종료
          </button>
        </div>
      )}

      {/* AI 부동산 투자 분석 모달 — 이력 조회는 단지 선택 없이도 가능 */}
      {realEstateAiOpen && (
        <RealEstateAnalysisModal
          complexes={compareIds.map(id => complexes.find(c => c.id === id)!).filter(Boolean)}
          onClose={() => setRealEstateAiOpen(false)}
        />
      )}

      {/* 거래이력 일괄 수집 상태 패널 */}
      {batchPanelOpen && (
        <div style={{
          position: 'fixed', top: `${headerHeight + 8}px`, right: '16px', zIndex: 9500,
          background: '#fff', borderRadius: '14px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          border: '1px solid #e0e0e0', width: '340px', maxHeight: '70vh',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* 헤더 */}
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a2e' }}>거래이력 일괄 수집</div>
              {batchStatus && (
                <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '2px' }}>
                  {batchStatus.running
                    ? `진행 중 — ${batchStatus.done + batchStatus.failed}/${batchStatus.total}`
                    : `완료 — 성공 ${batchStatus.done}건 / 실패 ${batchStatus.failed}건`}
                </div>
              )}
            </div>
            <button onClick={() => setBatchPanelOpen(false)} style={{ border: 'none', background: '#f0f0f0', borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer', fontSize: '14px', color: '#5f6368' }}>×</button>
          </div>

          {/* 진행 바 */}
          {batchStatus && batchStatus.total > 0 && (
            <div style={{ padding: '10px 16px 0' }}>
              <div style={{ height: '6px', borderRadius: '3px', background: '#f0f0f0', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '3px',
                  background: batchStatus.running ? '#43a047' : '#4BAAD4',
                  width: `${Math.round((batchStatus.done + batchStatus.failed) / batchStatus.total * 100)}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
              {batchStatus.running && batchStatus.current && (
                <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ▶ {batchStatus.current}
                </div>
              )}
            </div>
          )}

          {/* 시작 버튼 (미시작 or 완료 후 재시작) */}
          {(!batchStatus || !batchStatus.running) && (
            <div style={{ padding: '10px 16px' }}>
              <button
                onClick={startBatchCollect}
                style={{
                  width: '100%', padding: '8px', fontSize: '13px', fontWeight: 700,
                  background: '#4BAAD4', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer',
                }}
              >{batchStatus ? '다시 수집 시작' : '지금 시작'}</button>
              <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '6px', textAlign: 'center' }}>
                미수집 단지 우선 → 수집된 단지는 증분 업데이트
              </div>
            </div>
          )}

          {/* 결과 목록 */}
          {batchStatus && batchStatus.results.length > 0 && (
            <div style={{ overflowY: 'auto', padding: '6px 16px 14px', flex: 1 }}>
              <div style={{ fontSize: '11px', color: '#9aa0a6', marginBottom: '6px', fontWeight: 600 }}>수집 결과</div>
              {[...batchStatus.results].reverse().map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '4px 0', borderBottom: '1px solid #f8f8f8', fontSize: '12px',
                }}>
                  <span style={{ color: r.ok ? '#43a047' : '#e53935', fontSize: '11px', flexShrink: 0 }}>{r.ok ? '✓' : '✗'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#344054' }}>{r.name}</span>
                  {r.ok && (r as any).collectedMonths != null && (
                    <span style={{ color: '#9aa0a6', fontSize: '11px', flexShrink: 0 }}>{(r as any).collectedMonths}개월</span>
                  )}
                  {!r.ok && r.reason && (
                    <span style={{ color: '#e53935', fontSize: '10px', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>{r.reason}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 거래량 이력 비교 모달 */}
      {tradeCompareOpen && compareIds.length > 0 && (
        <TradeHistoryModal
          entries={compareIds.map((id, idx) => {
            const c = complexes.find(x => x.id === id);
            return { complexId: id, complexName: c?.complexName ?? String(id), color: TRADE_COMPARE_COLORS[idx % TRADE_COMPARE_COLORS.length] };
          })}
          onClose={() => setTradeCompareOpen(false)}
        />
      )}

      {/* 금액대별 단지 목록 팝업 */}
      {listModalRange !== null && (
        <ComplexListModal
          range={listModalRange}
          areaType={listModalAreaType ?? undefined}
          complexes={complexes}
          onClose={() => { setListModalRange(null); setListModalAreaType(null); setFilterResetKey(k => k + 1); }}
          onSelect={handleListSelect}
          top={headerHeight}
        />
      )}

      {/* 즐겨찾기 단지 목록 팝업 */}
      {favoriteListOpen && (
        <ComplexListModal
          range=""
          complexes={complexes}
          favoritesOnly
          onClose={() => setFavoriteListOpen(false)}
          onSelect={c => { handleListSelect(c); setFavoriteListOpen(false); }}
          top={headerHeight}
        />
      )}

      {/* 내가 등록한 단지 조회/검색 팝업 — 단지명 검색으로 위치 이동 */}
      {myComplexListOpen && (
        <ComplexListModal
          range=""
          complexes={complexes}
          onClose={() => setMyComplexListOpen(false)}
          onSelect={c => { handleListSelect(c); setMyComplexListOpen(false); }}
          top={headerHeight}
          showCleanup
          onRefresh={loadComplexes}
          onContactsOpen={() => { setMyComplexListOpen(false); setContactsOpen(true); }}
          onInvestmentMemoOpen={() => { setMyComplexListOpen(false); setInvestmentMemoOpen(true); }}
        />
      )}

      {/* 단지 등록 모달 — 모바일에서 "지도 보기" 클릭 시 hidden으로 숨김(상태 유지), 돌아가기로 복귀 */}
      {registerData && (
        <RegisterModal
          initialData={registerData}
          onClose={() => { setRegisterData(null); setRegisterMapView(false); }}
          onSuccess={(newComplex) => {
            // 전체 재조회 없이 새 단지만 목록 앞에 추가 — 서버 왕복 1회 절감
            setComplexes(prev => [newComplex, ...prev]);
            setRegisterMapView(false);
          }}
          isMobile={isMobile}
          hidden={isMobile && registerMapView}
          onShowMap={() => setRegisterMapView(true)}
        />
      )}
      {/* 모바일 지도 보기 중 돌아가기 버튼 */}
      {isMobile && registerMapView && registerData && (
        <button
          onClick={() => setRegisterMapView(false)}
          style={{
            position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 1100, padding: '10px 24px', fontSize: '13px', fontWeight: 700,
            backgroundColor: '#1a3a5c', color: '#fff', border: 'none',
            borderRadius: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >← 등록으로 돌아가기</button>
      )}

      {/* 모바일 전용 타임스탬프 카메라 */}
      <CameraStampButton isMobile={isMobile} />

      {/* 전역 토스트 알림 */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '60px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, pointerEvents: 'none',
          backgroundColor: toast.type === 'success' ? '#1a3a5c' : '#c0392b',
          color: '#fff', padding: '11px 20px', borderRadius: '10px',
          fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
          animation: 'dtr-toast-in 0.25s ease',
        }}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.msg}
        </div>
      )}
      <style>{`
        @keyframes dtr-toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* 하단 푸터 */}
      <footer style={{
        flexShrink: 0,
        height: '30px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderTop: '1px solid #d4edfb',
        background: 'linear-gradient(180deg, #f0f8fd 0%, #f7fbfe 100%)',
      }}>
        <span style={{
          fontFamily: "'Dancing Script', cursive",
          fontSize: '15px',
          fontWeight: 600,
          color: '#4BAAD4',
          letterSpacing: '0.3px',
        }}>
          For a happy future with my love, Juhae.
        </span>
      </footer>
    </div>
  );
};

export default App;
