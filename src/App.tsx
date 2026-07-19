import React, { useState, useEffect, useCallback } from 'react';
import { ApartmentComplex } from './types';
import { getComplexes, getPriceRanges, runBatchRealEstatePrice } from './services/api';
import MapPage from './pages/MapPage';
import PriceRangeFilter from './components/PriceRangeFilter';
import ComplexInfoPanel from './components/ComplexInfoPanel';
import ComplexListModal from './components/ComplexListModal';
import SearchBar, { SearchSelectData } from './components/SearchBar';
import RegisterModal, { RegisterInitialData } from './components/RegisterModal';

const App: React.FC = () => {
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

  // 목록에서 단지 선택 시 사이드패널 표시 + 좌표가 있으면 지도도 이동
  const handleListSelect = (complex: ApartmentComplex) => {
    setSelectedComplex(complex);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* 헤더 */}
      <header style={{
        display: 'flex', alignItems: 'center', padding: '0 16px', height: '56px',
        backgroundColor: '#fff', borderBottom: '1px solid #e8eaed',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flexShrink: 0, gap: '16px', zIndex: 10,
      }}>
        {/* 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{
            width: '32px', height: '32px', backgroundColor: '#1a73e8', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '16px', fontWeight: 800,
          }}>D</div>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#202124', whiteSpace: 'nowrap' }}>
            DoTheRich
          </span>
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#e8eaed', flexShrink: 0 }} />

        {/* 금액대 버튼 → 팝업 오픈 */}
        <PriceRangeFilter
          priceRanges={priceRanges}
          selectedRange={null}
          onSelect={handlePriceRangeSelect}
          onSelectAreaType={handleAreaTypeSelect}
          complexes={complexes}
        />

        {/* 검색바 */}
        <div style={{ marginLeft: 'auto' }}>
          <SearchBar onSelect={handleSearchSelect} />
        </div>

        {/* 실거래가 배치 수집 버튼 — 백엔드 202 즉시 반환, 백그라운드 처리 */}
        <button
          onClick={handleBatch}
          disabled={batchLoading}
          style={{
            padding: '5px 11px', fontSize: '12px', fontWeight: 600,
            border: '1px solid #dadce0', borderRadius: '6px',
            backgroundColor: '#fff',
            color: batchLoading ? '#9e9e9e' : '#5f6368',
            cursor: batchLoading ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {batchLoading ? '요청 중...' : '시세 수집'}
        </button>

        {/* 단지 수 */}
        <div style={{ fontSize: '13px', color: '#80868b', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {loading ? '로딩...' : `${complexes.length}개 단지`}
        </div>
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

      {/* 본문: 지도 + 사이드패널 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <MapPage
          complexes={complexes}
          selectedComplex={selectedComplex}
          onComplexSelect={setSelectedComplex}
          focusLocation={focusLocation}
          onMapClick={(data) => setRegisterData({
            complexName: data.complexName,
            address: data.roadAddress || data.address,
            latitude: data.lat,
            longitude: data.lng,
          })}
        />
        {selectedComplex && (
          <ComplexInfoPanel
            complex={selectedComplex}
            onClose={() => {
              (window as any).__closeInfoWindow?.();
              setSelectedComplex(null);
            }}
            onMemoUpdate={handleMemoUpdate}
            onDelete={handleComplexDelete}
          />
        )}
      </div>

      {/* 금액대별 단지 목록 팝업 */}
      {listModalRange !== null && (
        <ComplexListModal
          range={listModalRange}
          areaType={listModalAreaType ?? undefined}
          complexes={complexes}
          onClose={() => { setListModalRange(null); setListModalAreaType(null); }}
          onSelect={handleListSelect}
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
