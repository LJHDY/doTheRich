import React, { useEffect, useRef, useCallback } from 'react';
import { ApartmentComplex, formatPrice } from '../types';

interface MapPageProps {
  complexes: ApartmentComplex[];
  selectedComplex: ApartmentComplex | null;
  onComplexSelect: (complex: ApartmentComplex) => void;
  focusLocation?: { lat: number; lng: number } | null;
}

const MapPage: React.FC<MapPageProps> = ({ complexes, selectedComplex, onComplexSelect, focusLocation }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);

  // 네이버 지도 초기화
  useEffect(() => {
    if (!mapRef.current || !window.naver) return;

    const map = new window.naver.maps.Map(mapRef.current, {
      center: new window.naver.maps.LatLng(37.5665, 126.9780),
      zoom: 12,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.TOP_RIGHT,
      },
    });

    mapInstanceRef.current = map;
    infoWindowRef.current = new window.naver.maps.InfoWindow({
      anchorSkew: true,
      borderColor: '#1a73e8',
      borderWidth: 2,
    });

    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };
  }, []);

  // 마커 아이콘 생성
  const createMarkerIcon = useCallback(
    (complex: ApartmentComplex, isSelected: boolean) => {
      // 실제 가격을 억 단위로 변환 (천만 자리에서 반올림) — 없으면 금액대 숫자로 fallback
      const priceUk = complex.price
        ? Math.round(complex.price / 10000000) / 10
        : (() => { const m = complex.priceRange?.match(/^(\d+)/); return m ? parseInt(m[1]) : null; })();
      const label = priceUk !== null ? String(priceUk) : complex.priceRange;

      // 가격 기준 색상 구분: 선택=보라, 10억 미만=파랑, 15억 미만=노랑, 20억 미만=빨강, 그 외=검정
      const baseColor = isSelected
        ? '#6a0dad'
        : priceUk === null ? '#1a73e8'
        : priceUk < 10 ? '#1a73e8'
        : priceUk < 15 ? '#f9ab00'
        : priceUk < 20 ? '#c5221f'
        : '#202124';

      const bgColor = baseColor;

      return {
        content: `
          <div style="
            position: relative;
            display: inline-block;
            text-align: center;
          ">
            <div style="
              background-color: ${bgColor};
              color: white;
              padding: 5px 10px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 700;
              white-space: nowrap;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              border: 2px solid white;
              cursor: pointer;
            ">
              ${label}
            </div>
            <div style="
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 8px solid ${bgColor};
              margin: 0 auto;
              margin-top: -1px;
            "></div>
          </div>
        `,
        anchor: new window.naver.maps.Point(0, 0),
      };
    },
    []
  );

  // 마커 생성 및 업데이트
  useEffect(() => {
    if (!mapInstanceRef.current || !window.naver) return;

    // 기존 마커 제거
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // 한반도 좌표 범위(위도33~38, 경도124~132)를 벗어난 잘못된 좌표 제외
    const validComplexes = complexes.filter(
      (c) => c.latitude && c.longitude &&
        c.latitude >= 33 && c.latitude <= 38 &&
        c.longitude >= 124 && c.longitude <= 132
    );

    if (validComplexes.length === 0) return;

    const bounds = new window.naver.maps.LatLngBounds();

    validComplexes.forEach((complex) => {
      const position = new window.naver.maps.LatLng(complex.latitude, complex.longitude);
      bounds.extend(position);

      const isSelected = selectedComplex?.id === complex.id;
      const marker = new window.naver.maps.Marker({
        position,
        map: mapInstanceRef.current,
        icon: createMarkerIcon(complex, isSelected),
        zIndex: isSelected ? 100 : 10,
      });

      // 마커 클릭 이벤트
      window.naver.maps.Event.addListener(marker, 'click', () => {
        if (infoWindowRef.current) {
          infoWindowRef.current.close();
        }

        // 닫기 버튼 onclick에서 호출할 전역 함수 등록
        (window as any).__closeInfoWindow = () => infoWindowRef.current?.close();

        // 정보 창 내용
        const commuteHtml = complex.commuteTimes?.length > 0
          ? complex.commuteTimes
              .map((ct) => `<span style="margin-right:8px">${ct.destination} <b>${ct.minutes}분</b></span>`)
              .join('')
          : '정보 없음';

        const content = `
          <div style="
            position: relative;
            padding: 14px 16px;
            min-width: 220px;
            max-width: 280px;
            font-family: -apple-system, sans-serif;
            font-size: 13px;
          ">
            <button
              onclick="window.__closeInfoWindow()"
              style="
                position: absolute; top: 6px; right: 6px;
                border: none; background: none; cursor: pointer;
                font-size: 16px; color: #9e9e9e; line-height: 1;
                padding: 2px 4px; border-radius: 4px;
              "
              onmouseover="this.style.backgroundColor='#f0f0f0';this.style.color='#5f6368'"
              onmouseout="this.style.backgroundColor='transparent';this.style.color='#9e9e9e'"
            >×</button>
            <div style="font-weight:700; font-size:15px; color:#202124; margin-bottom:6px; padding-right:20px">
              ${complex.complexName}
            </div>
            <div style="color:#1a73e8; font-size:16px; font-weight:700; margin-bottom:8px">
              ${complex.price ? formatPrice(complex.price) : complex.priceRange}
            </div>
            <div style="color:#5f6368; margin-bottom:4px">
              ${complex.region || ''} | ${complex.builtYear || ''}
            </div>
            <div style="color:#5f6368; margin-bottom:6px">
              ${complex.subwayInfos?.map(s => `${s.stationName} ${s.walkingMinutes ? `(도보 ${s.walkingMinutes}분)` : ''}`).join(', ') || ''}
            </div>
            <div style="font-size:12px; color:#80868b; padding-top:6px; border-top:1px solid #f0f0f0">
              ${commuteHtml}
            </div>
          </div>
        `;

        infoWindowRef.current.setContent(content);
        infoWindowRef.current.open(mapInstanceRef.current, marker);
        onComplexSelect(complex);
      });

      markersRef.current.push(marker);
    });

    // 단지 선택 중이 아닐 때만 fitBounds 적용 — 선택 중 실행하면 포커스가 튀어나감
    if (validComplexes.length > 0 && !selectedComplex) {
      mapInstanceRef.current.fitBounds(bounds, { padding: 60 });
    }
  }, [complexes, selectedComplex, createMarkerIcon, onComplexSelect]);

  // 선택된 단지로 지도 이동
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedComplex || !window.naver) return;
    if (!selectedComplex.latitude || !selectedComplex.longitude) return;

    mapInstanceRef.current.setCenter(
      new window.naver.maps.LatLng(selectedComplex.latitude, selectedComplex.longitude)
    );
    mapInstanceRef.current.setZoom(15);
  }, [selectedComplex]);

  // 검색 결과 위치로 지도 이동
  useEffect(() => {
    if (!mapInstanceRef.current || !focusLocation || !window.naver) return;
    mapInstanceRef.current.setCenter(
      new window.naver.maps.LatLng(focusLocation.lat, focusLocation.lng)
    );
    mapInstanceRef.current.setZoom(16);
  }, [focusLocation]);

  return (
    <div
      ref={mapRef}
      style={{
        flex: 1,
        height: '100%',
        minHeight: '400px',
        backgroundColor: '#e8eaed',
      }}
    />
  );
};

export default MapPage;
