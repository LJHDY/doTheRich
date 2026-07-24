import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApartmentComplex, OverlayMarker } from './types';
import { getComplexes, getPriceRanges, runBatchRealEstatePrice } from './services/api';
import MapPage from './pages/MapPage';
import PriceRangeFilter from './components/PriceRangeFilter';
import ComplexInfoPanel from './components/ComplexInfoPanel';
import ComplexListModal from './components/ComplexListModal';
import CompareListModal from './components/CompareListModal';
import CompareCard from './components/CompareCard';
import SearchBar, { SearchSelectData } from './components/SearchBar';
import RegisterModal, { RegisterInitialData } from './components/RegisterModal';
import LivingZonePanel from './components/LivingZonePanel';
import AffordabilityPanel from './components/AffordabilityPanel';
import { useIsMobile } from './hooks/useIsMobile';

const App: React.FC = () => {
  const isMobile = useIsMobile();
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
  // null = 팝업 닫힘, '' = 전체, '7억대' = 특정 금액대
  const [listModalRange, setListModalRange] = useState<string | null>(null);
  // 평형 필터 — null이면 전체, '전용 59' 등 선택 시 해당 평형 단지만 표시
  const [listModalAreaType, setListModalAreaType] = useState<string | null>(null);
  // 모달 닫기 시 PriceRangeFilter 내부 상태 초기화용 key — 증가할 때마다 컴포넌트 재마운트
  const [filterResetKey, setFilterResetKey] = useState(0);

  // 학교·인프라 위치 오버레이 마커 — ComplexInfoPanel이 단지 선택 시 채워줌
  const [overlayMarkers, setOverlayMarkers] = useState<OverlayMarker[]>([]);

  // 도보 30분 반경 원 중심 좌표 — ComplexInfoPanel 토글 버튼으로 켜고 끔
  const [radiusCenter, setRadiusCenter] = useState<{ lat: number; lng: number } | null>(null);

  // 생활권 패널 — ComplexInfoPanel과 동일 슬롯, 동시에 열리지 않음
  const [livingZoneOpen, setLivingZoneOpen] = useState(false);

  // 구매 가능 분석 패널 — 생활권·단지패널과 상호 배타
  const [affordOpen, setAffordOpen] = useState(false);

  // 비교하기 — 최대 3개 단지 선택, 선택 시 화면 3등분 카드 뷰로 전환
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);

  // 체크박스 토글 — 3개 초과 시 alert, 이미 선택된 경우 해제
  const handleCompareToggle = (id: number) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) { alert('최대 3개까지만 비교할 수 있습니다.'); return prev; }
      return [...prev, id];
    });
  };

  // 비교 모드 종료 — 선택 목록도 초기화
  const handleCompareClose = () => {
    setCompareOpen(false);
    setCompareIds([]);
  };

  // 앱 최초 마운트 시 금액대 목록을 서버에서 가져와 필터 버튼 생성
  useEffect(() => {
    getPriceRanges()
      .then(setPriceRanges)
      .catch(() => {});
  }, []);

  // useCallback으로 메모이제이션 — 등록 성공 후 onSuccess 콜백으로도 재사용
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

  useEffect(() => { loadComplexes(); }, [loadComplexes]);

  const [batchLoading, setBatchLoading] = useState(false);

  // 202 즉시 반환 — 백그라운드 처리이므로 성공/실패 피드백 불필요
  const handleBatch = async () => {
    if (batchLoading) return;
    setBatchLoading(true);
    try { await runBatchRealEstatePrice(); } catch {}
    setBatchLoading(false);
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

  // 학군/인프라 추가·편집 후 단지 정보 전체 갱신 — complexes 배열과 selectedComplex 동시 업데이트
  const handleComplexUpdate = (updated: ApartmentComplex) => {
    setComplexes(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelectedComplex(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* 헤더 — 데스크탑: 1줄 56px / 모바일: 2줄 (Row1 로고+버튼, Row2 검색+필터) */}
      <header ref={headerRef} style={{
        backgroundColor: '#fff', borderBottom: '1px solid #e8eaed',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flexShrink: 0, zIndex: 10,
        ...(isMobile ? {} : {
          display: 'flex', alignItems: 'center', padding: '0 16px', height: '56px', gap: '16px',
        }),
      }}>
        {isMobile ? (
          <>
            {/* 모바일 Row1: 로고 + 단지수 + 액션 버튼 */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', height: '48px', gap: '6px' }}>
              <img src="/do_the_rich.png" alt="DoTheRich" style={{ width: '26px', height: '26px', borderRadius: '6px', objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#202124', whiteSpace: 'nowrap' }}>DoTheRich</span>
              <span style={{ fontSize: '11px', color: '#80868b', whiteSpace: 'nowrap' }}>
                {loading ? '' : `${complexes.length}개`}
              </span>
              <div style={{ flex: 1 }} />
              {/* 생활권 */}
              <button
                onClick={() => {
                  const next = !livingZoneOpen;
                  setLivingZoneOpen(next);
                  if (next) { setSelectedComplex(null); setRadiusCenter(null); setAffordOpen(false); }
                }}
                style={{
                  padding: '4px 8px', fontSize: '11px', fontWeight: 600,
                  border: '1px solid', borderColor: livingZoneOpen ? '#1a73e8' : '#dadce0',
                  borderRadius: '6px', backgroundColor: livingZoneOpen ? '#e8f0fe' : '#fff',
                  color: livingZoneOpen ? '#1a73e8' : '#5f6368', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >생활권</button>
              {/* 대출 */}
              <button
                onClick={() => {
                  const next = !affordOpen;
                  setAffordOpen(next);
                  if (next) { setSelectedComplex(null); setRadiusCenter(null); setLivingZoneOpen(false); }
                }}
                style={{
                  padding: '4px 8px', fontSize: '11px', fontWeight: 600,
                  border: '1px solid', borderColor: affordOpen ? '#0b8043' : '#dadce0',
                  borderRadius: '6px', backgroundColor: affordOpen ? '#e6f4ea' : '#fff',
                  color: affordOpen ? '#0b8043' : '#5f6368', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >대출</button>
              {/* 비교 */}
              <button
                onClick={() => setCompareOpen(prev => !prev)}
                style={{
                  padding: '4px 8px', fontSize: '11px', fontWeight: 600,
                  border: '1px solid',
                  borderColor: compareOpen || compareIds.length > 0 ? '#1a73e8' : '#dadce0',
                  borderRadius: '6px',
                  backgroundColor: compareOpen || compareIds.length > 0 ? '#e8f0fe' : '#fff',
                  color: compareOpen || compareIds.length > 0 ? '#1a73e8' : '#5f6368',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >{compareIds.length > 0 ? `비교${compareIds.length}` : '비교'}</button>
            </div>
            {/* 모바일 Row2: 검색바 + 금액대 필터 */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px 8px', gap: '8px' }}>
              <SearchBar onSelect={handleSearchSelect} fluid />
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
            {/* 데스크탑: 기존 단일 행 레이아웃 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <img src="/do_the_rich.png" alt="DoTheRich" style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'contain' }} />
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#202124', whiteSpace: 'nowrap' }}>DoTheRich</span>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: '#e8eaed', flexShrink: 0 }} />
            <PriceRangeFilter
              key={filterResetKey}
              priceRanges={priceRanges}
              selectedRange={null}
              onSelect={handlePriceRangeSelect}
              onSelectAreaType={handleAreaTypeSelect}
              complexes={complexes}
            />
            <div style={{ marginLeft: 'auto' }}>
              <SearchBar onSelect={handleSearchSelect} />
            </div>
            <button
              onClick={() => {
                const next = !livingZoneOpen;
                setLivingZoneOpen(next);
                if (next) { setSelectedComplex(null); setRadiusCenter(null); setAffordOpen(false); }
              }}
              style={{
                padding: '5px 11px', fontSize: '12px', fontWeight: 600,
                border: '1px solid', borderColor: livingZoneOpen ? '#1a73e8' : '#dadce0',
                borderRadius: '6px', backgroundColor: livingZoneOpen ? '#e8f0fe' : '#fff',
                color: livingZoneOpen ? '#1a73e8' : '#5f6368', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >생활권</button>
            <button
              onClick={() => {
                const next = !affordOpen;
                setAffordOpen(next);
                if (next) { setSelectedComplex(null); setRadiusCenter(null); setLivingZoneOpen(false); }
              }}
              style={{
                padding: '5px 11px', fontSize: '12px', fontWeight: 600,
                border: '1px solid', borderColor: affordOpen ? '#0b8043' : '#dadce0',
                borderRadius: '6px', backgroundColor: affordOpen ? '#e6f4ea' : '#fff',
                color: affordOpen ? '#0b8043' : '#5f6368', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >대출분석</button>
            <button
              onClick={() => setCompareOpen(prev => !prev)}
              style={{
                padding: '5px 11px', fontSize: '12px', fontWeight: 600,
                border: '1px solid',
                borderColor: compareOpen || compareIds.length > 0 ? '#1a73e8' : '#dadce0',
                borderRadius: '6px',
                backgroundColor: compareOpen || compareIds.length > 0 ? '#e8f0fe' : '#fff',
                color: compareOpen || compareIds.length > 0 ? '#1a73e8' : '#5f6368',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >{compareIds.length > 0 ? `비교 중 ${compareIds.length}/3` : '비교하기'}</button>
            <button
              onClick={handleBatch}
              disabled={batchLoading}
              style={{
                padding: '5px 11px', fontSize: '12px', fontWeight: 600,
                border: '1px solid #dadce0', borderRadius: '6px', backgroundColor: '#fff',
                color: batchLoading ? '#9e9e9e' : '#5f6368',
                cursor: batchLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >{batchLoading ? '요청 중...' : '시세 수집'}</button>
            <div style={{ fontSize: '13px', color: '#80868b', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {loading ? '로딩...' : `${complexes.length}개 단지`}
            </div>
          </>
        )}
      </header>

      {/* 에러 배너 */}
      {error && (
        <div style={{
          padding: '10px 16px', backgroundColor: '#fce8e6', color: '#c5221f',
          fontSize: '13px', borderBottom: '1px solid #f5c6c6', flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* 본문: 지도 + 사이드패널 (비교 모드에서는 비교 카드 뷰로 전환) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {compareIds.length > 0 ? (
          /* 비교 뷰 — 모바일에서 overflow-x: auto로 가로 스크롤, 각 카드 minWidth: 280px */
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
            {/* 빈 슬롯 — 3개 미만일 때 "+ 단지 추가" 안내 */}
            {compareIds.length < 3 && (
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
            )}
          </div>
        ) : (
          /* 기본 뷰 — 지도는 항상 전체 렌더, 사이드패널은 모바일에서 fixed 오버레이 */
          <>
            <MapPage
              complexes={complexes}
              selectedComplex={selectedComplex}
              onComplexSelect={handleComplexSelect}
              focusLocation={focusLocation}
              overlayMarkers={overlayMarkers}
              radiusCenter={radiusCenter}
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
                  complexes={complexes}
                  onClose={() => setLivingZoneOpen(false)}
                  isMobile={isMobile}
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
          </>
        )}
      </div>

      {/* 비교하기 단지 선택 패널 */}
      {compareOpen && (
        <CompareListModal
          complexes={complexes}
          priceRanges={priceRanges}
          selectedIds={compareIds}
          onToggle={handleCompareToggle}
          onClose={() => setCompareOpen(false)}
          top={headerHeight}
        />
      )}

      {/* 비교 모드 종료 플로팅 버튼 — 비교 카드가 보일 때 표시 */}
      {compareIds.length > 0 && (
        <button
          onClick={handleCompareClose}
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 400,
            padding: '10px 18px', fontSize: '13px', fontWeight: 600,
            backgroundColor: '#c5221f', color: '#fff',
            border: 'none', borderRadius: '20px', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          비교 종료
        </button>
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

      {/* 단지 등록 모달 */}
      {registerData && (
        <RegisterModal
          initialData={registerData}
          onClose={() => setRegisterData(null)}
          onSuccess={loadComplexes}
        />
      )}
    </div>
  );
};

export default App;
