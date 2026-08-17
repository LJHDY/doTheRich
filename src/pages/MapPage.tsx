import React, { useEffect, useRef, useCallback, useState } from 'react';
import { ApartmentComplex, MapRoute, OverlayMarker, RoutePoint, PublicComplex, formatPrice } from '../types';
import { loadDistrictGeoJson, getFeatureName } from '../utils/districtGeoJson';
import { haversineMeters } from '../utils/geo';

// 저장된 경로마다 순환 사용할 색상 팔레트
const ROUTE_COLORS = ['#e53935', '#1565c0', '#2e7d32', '#e65100', '#6a1b9a', '#00838f', '#ad1457', '#f9a825'];

// ── 현재 위치 마커 HTML — 파란 점 + 방향 삼각형 (heading=null이면 삼각형 생략)
// heading: 북=0, 시계방향(도) — GPS 이동방향 또는 나침반 방위각
const buildLocMarkerContent = (heading: number | null): string => {
  const cone = heading !== null ? `
    <div style="position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:center;transform:rotate(${heading}deg);">
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:14px solid rgba(26,115,232,0.85);margin-top:-11px;"></div>
    </div>
  ` : '';
  return `
    <div style="position:relative;width:28px;height:28px;">
      <div style="position:absolute;inset:-7px;border-radius:50%;background:rgba(26,115,232,0.15);animation:mylocpulse 1.8s ease-out infinite;"></div>
      ${cone}
      <div style="position:absolute;inset:4px;border-radius:50%;background:#1a73e8;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.4);"></div>
    </div>
    <style>@keyframes mylocpulse{0%{transform:scale(1);opacity:0.6;}100%{transform:scale(3.2);opacity:0;}}</style>
  `;
};

// p1 → p2 방향의 방위각 계산 (도, 북=0, 시계방향) — 화살표 마커 회전각 결정에 사용
// Haversine 기반 구면 삼각법으로 정확한 방위각 산출
function calcBearing(p1: RoutePoint, p2: RoutePoint): number {
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  // atan2 결과(-180~180)를 0~360으로 정규화
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

interface MapPageProps {
  complexes: ApartmentComplex[];
  selectedComplex: ApartmentComplex | null;
  onComplexSelect: (complex: ApartmentComplex) => void;
  focusLocation?: { lat: number; lng: number } | null;
  overlayMarkers?: OverlayMarker[];
  radiusCenter?: { lat: number; lng: number } | null;
  routes?: MapRoute[];           // 저장된 경로 목록 — 지도에 폴리라인으로 표시
  drawingPoints?: RoutePoint[];  // 현재 그리는 중인 점 배열 — 파란 점선으로 실시간 표시
  isDrawingRoute?: boolean;      // 경로 그리기 모드 — 지도 클릭이 좌표 추가로 동작
  onRoutePointAdd?: (p: RoutePoint) => void; // 지도 클릭 시 좌표 추가 콜백
  selectedDistrict?: string | null; // 행정구역 경계 표시용 구/시 이름
  roadViewOpen?: boolean;        // 로드뷰 패널 표시 여부
  isMobile?: boolean;            // 모바일 여부 (현재 마커는 공통 카드형 — 예약)
  // 생활권 구획 그리기 — 폴리곤으로 내부 단지 자동 탐지
  isDrawingZone?: boolean;
  drawingZonePoints?: RoutePoint[];
  onZonePointAdd?: (p: RoutePoint) => void;
  // 저장된 생활권 구획 폴리곤 목록 — 지도에 반투명 초록 오버레이로 표시
  zonePolygons?: { id: number; name: string; points: RoutePoint[] }[];
  // 단지 등록 모달 검색 위치 — 임시 핀으로 표시해 실제 아파트 위치 확인용
  previewMarker?: { lat: number; lng: number } | null;
  // ComplexInfoPanel 표시 중 해당 단지의 가장 가까운 한강공원 — 이름 라벨 마커로 표시
  hanRiverParkMarker?: { name: string; lat: number; lng: number } | null;
  // 선택된 구의 공공단지 목록 — 작은 원형 마커로 표시
  publicComplexes?: PublicComplex[];
}

const MapPage: React.FC<MapPageProps> = ({
  complexes, selectedComplex, onComplexSelect, focusLocation, overlayMarkers, radiusCenter,
  routes, drawingPoints, isDrawingRoute, onRoutePointAdd, selectedDistrict, roadViewOpen, isMobile,
  isDrawingZone, drawingZonePoints, onZonePointAdd, zonePolygons, previewMarker, hanRiverParkMarker,
  publicComplexes,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const overlayMarkersRef = useRef<any[]>([]);
  const circleRef = useRef<any>(null);
  const districtPolygonsRef = useRef<any[]>([]); // 행정구역 경계 폴리곤 배열
  const myLocationMarkerRef = useRef<any>(null); // 내 위치 마커
  const [locating, setLocating] = useState(false); // 위치 조회 중 로딩 상태
  // 실시간 위치 추적 — watchPosition + 나침반
  const watchIdRef = useRef<number | null>(null);
  const headingRef = useRef<number | null>(null);               // 나침반·GPS 방위각
  const isFollowingRef = useRef(false);                         // 지도 자동 이동 여부
  const dragListenerRef = useRef<any>(null);                    // 지도 드래그 이벤트 핸들
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const orientationCleanupRef = useRef<(() => void) | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const boundsInitializedRef = useRef(false);
  const routePolylinesRef = useRef<any[]>([]);      // 저장된 경로 폴리라인 배열
  const routeArrowMarkersRef = useRef<any[]>([]);   // 방향 화살표 마커 배열
  const routeKmMarkersRef = useRef<any[]>([]);      // 1km 간격 거리 마커 배열
  const drawingPolylineRef = useRef<any>(null);     // 현재 그리는 중인 폴리라인
  const drawingMarkersRef = useRef<any[]>([]);      // 그리기 모드 점 마커 배열
  const mapClickListenerRef = useRef<any>(null); // 지도 클릭 이벤트 핸들러
  const panoRef = useRef<HTMLDivElement>(null);  // 로드뷰 컨테이너 DOM 참조
  const panoInstanceRef = useRef<any>(null);     // naver.maps.Panorama 인스턴스
  const roadViewClickRef = useRef<any>(null);    // 로드뷰용 지도 클릭 리스너
  const onRoutePointAddRef = useRef(onRoutePointAdd);
  // 생활권 구획 그리기 — 폴리곤 오버레이·마커·클릭 리스너 수명 관리
  const zoneClickListenerRef = useRef<any>(null);
  const zonePolygonRef = useRef<any>(null);
  const zoneMarkersRef = useRef<any[]>([]);
  const onZonePointAddRef = useRef(onZonePointAdd);
  // 저장된 생활권 구획 폴리곤 오버레이 배열
  const zoneSavedPolygonsRef = useRef<any[]>([]);
  const zoneLabelMarkersRef = useRef<any[]>([]);
  // 단지 등록 모달에서 검색한 위치 임시 마커
  const previewMarkerRef = useRef<any>(null);
  // ComplexInfoPanel 선택 단지의 한강공원 라벨 마커
  const hanRiverMarkerRef = useRef<any>(null);
  // 공공단지 마커 목록
  const publicComplexMarkersRef = useRef<any[]>([]);
  // 공공단지 그룹 마커 데이터 — groupId → { marker, complexes, expanded }
  const pcGroupMapRef = useRef<Map<string, { marker: any; complexes: PublicComplex[]; expanded: boolean }>>(new Map());
  // 공공단지 마커 줌 임계값 — 이 줌 이상에서만 표시 (겹침 방지)
  const PUBLIC_COMPLEX_MIN_ZOOM = 14;

  // 마커 diff를 위한 Map — 단지 id → { marker, listenerHandle }
  const markerMapRef = useRef<Map<number, { marker: any; listener: any }>>(new Map());
  // 마커 아이콘 재생성 여부를 결정하는 fingerprint — 단지 id → 문자열
  const fingerprintMapRef = useRef<Map<number, string>>(new Map());

  // 콜백·데이터를 ref로 유지 → 클릭 핸들러가 항상 최신값을 참조 (마커 재생성 불필요)
  const complexesRef = useRef<ApartmentComplex[]>(complexes);
  const onComplexSelectRef = useRef(onComplexSelect);
  useEffect(() => { complexesRef.current = complexes; }, [complexes]);
  useEffect(() => { onComplexSelectRef.current = onComplexSelect; }, [onComplexSelect]);
  useEffect(() => { onRoutePointAddRef.current = onRoutePointAdd; }, [onRoutePointAdd]);
  useEffect(() => { onZonePointAddRef.current = onZonePointAdd; }, [onZonePointAdd]);

  // 네이버 지도 초기화 + body 직속 tooltip div 생성
  // position:fixed를 지도 DOM 안에 두면 Naver Maps의 CSS transform 컨텍스트에 갇혀
  // 다른 마커에 가려지므로, document.body에 직접 append해서 stacking context를 완전히 탈출
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
      borderColor: '#89CFF0',
      borderWidth: 2,
    });

    // cleanup에서 ref.current를 직접 읽으면 effect 종료 후 값이 달라질 수 있어 미리 캡처
    const markerMap = markerMapRef.current;
    const fingerprintMap = fingerprintMapRef.current;
    return () => {
      // 모든 마커 제거
      markerMap.forEach(({ marker, listener }) => {
        marker.setMap(null);
        if (listener) window.naver.maps.Event.removeListener(listener);
      });
      markerMap.clear();
      fingerprintMap.clear();
    };
  }, []);

  // 마커 아이콘 생성 — 모바일·데스크탑 동일한 카드형
  const createMarkerIcon = useCallback(
    (complex: ApartmentComplex, isSelected: boolean) => {
      // 호가 우선, 없으면 매매가, 없으면 금액대 숫자로 fallback — 억 단위 변환
      const basePrice = complex.askingPrice || complex.price;
      const priceUk = basePrice
        ? Math.round(basePrice / 10000000) / 10
        : (() => { const m = complex.priceRange?.match(/^(\d+)/); return m ? parseInt(m[1]) : null; })();

      // 가격 기준 색상 구분: 선택=보라, 10억 미만=파랑, 15억 미만=노랑, 20억 미만=빨강, 그 외=회색
      const bgColor = isSelected
        ? '#BA8BD8'
        : priceUk === null ? '#89CFF0'
        : priceUk < 10 ? '#89CFF0'
        : priceUk < 15 ? '#FFD97D'
        : priceUk < 20 ? '#E06060'
        : '#607d8b';

      const priceDisplay = priceUk !== null ? `${priceUk}억` : (complex.priceRange ?? '-');
      // 표시 가격의 출처 구분 — 호가면 (호), 매매가면 (매), 금액대만 있으면 없음
      const priceTag = complex.askingPrice ? '호' : complex.price ? '매' : null;
      const yearDisplay = complex.builtYear
        ? `${String(complex.builtYear).replace(/[^0-9]/g, '')}년`
        : '-';
      const unitDisplay = complex.unitCount ? `${complex.unitCount}세대` : '-';
      // 단지명 8자 초과 시 말줄임 + XSS 방지
      const shortName = complex.complexName.length > 8
        ? complex.complexName.slice(0, 8) + '…'
        : complex.complexName;
      const safeShortName = shortName
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      // bgColor를 텍스트에 쓸 때 가독성용 어두운 버전
      const priceTextColor = bgColor === '#89CFF0' ? '#2a6090'
        : bgColor === '#FFD97D' ? '#a07600'
        : bgColor === '#BA8BD8' ? '#6a2a9a'
        : bgColor;
      const selBg = isSelected ? '#f8f4ff' : '#fff';
      const borderWidth = isSelected ? '2px' : '1.5px';
      const isFav = complex.isFavorite ?? false;
      // 즐겨찾기 배지 — 카드 우상단 모서리에 절대위치로 얹음
      const favBadge = isFav
        ? `<div style="position:absolute;top:-7px;right:-7px;width:15px;height:15px;background:#F5A623;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.28);line-height:1;">★</div>`
        : '';

      return {
        content: `
          <div style="
            position:relative;
            background:${selBg};
            border:${borderWidth} solid ${bgColor};
            border-left:3px solid ${bgColor};
            border-radius:5px;
            padding:3px 6px 3px 5px;
            box-shadow:0 1px 6px rgba(0,0,0,${isSelected ? '0.25' : '0.14'});
            cursor:pointer;
            font-family:-apple-system,BlinkMacSystemFont,sans-serif;
            white-space:nowrap;
            max-width:120px;
          ">
            ${favBadge}
            <div style="font-size:10px;font-weight:700;color:#1a3a5c;overflow:hidden;text-overflow:ellipsis;max-width:108px;">${safeShortName}</div>
            <div style="font-size:11px;font-weight:800;color:${priceTextColor};margin:1px 0;">${priceDisplay}${priceTag ? `<span style="font-size:9px;font-weight:600;opacity:0.7;margin-left:2px;">(${priceTag})</span>` : ''}</div>
            <div style="font-size:9px;color:#80868b;">${yearDisplay}&nbsp;·&nbsp;${unitDisplay}</div>
          </div>
        `,
        // 카드 너비 약 110px, 높이 약 44px — 좌상단 기준 중심에 앵커
        anchor: new window.naver.maps.Point(55, 22),
      };
    },
    []
  );

  // 마커 diff 업데이트 — 추가/제거/변경된 것만 처리 (전체 재생성 X)
  // 모든 마커를 매번 재생성하면 Naver Maps API 객체 비용이 크기 때문에 diff 방식 사용
  useEffect(() => {
    if (!mapInstanceRef.current || !window.naver) return;

    // 한국 본토 좌표 범위 밖인 단지는 지도에 표시하지 않음 (데이터 오류 방어)
    const validComplexes = complexes.filter(
      (c) => c.latitude && c.longitude &&
        c.latitude >= 33 && c.latitude <= 38 &&
        c.longitude >= 124 && c.longitude <= 132
    );

    // 마커 아이콘 외관을 결정하는 필드만 포함한 fingerprint — 하나라도 바뀌면 아이콘 재생성
    // 선택 상태, 가격, 즐겨찾기, 임장유형, 연식, 세대수가 변경될 때만 setIcon 호출
    const makeFingerprint = (c: ApartmentComplex, isSelected: boolean) =>
      `${isSelected}-${c.price}-${c.askingPrice}-${c.priceRange}-${c.isFavorite}-${c.visitType}-${c.builtYear}-${c.unitCount}`;

    const newIdSet = new Set(validComplexes.map((c) => c.id));

    // 1) 삭제된 단지 마커 제거
    Array.from(markerMapRef.current.keys()).forEach((id) => {
      if (!newIdSet.has(id)) {
        const { marker, listener } = markerMapRef.current.get(id)!;
        marker.setMap(null);
        if (listener) window.naver.maps.Event.removeListener(listener);
        markerMapRef.current.delete(id);
        fingerprintMapRef.current.delete(id);
      }
    });

    const bounds = new window.naver.maps.LatLngBounds();

    validComplexes.forEach((complex) => {
      const isSelected = selectedComplex?.id === complex.id;
      const fp = makeFingerprint(complex, isSelected);
      const position = new window.naver.maps.LatLng(complex.latitude, complex.longitude);
      bounds.extend(position);

      if (!markerMapRef.current.has(complex.id)) {
        // 2) 신규 단지 — 마커 + 클릭 리스너 생성
        const marker = new window.naver.maps.Marker({
          position,
          map: mapInstanceRef.current,
          icon: createMarkerIcon(complex, isSelected),
          zIndex: isSelected ? 100 : 10,
        });

        // 클릭 핸들러는 ref를 통해 최신 데이터를 읽으므로 재생성 불필요
        const listener = window.naver.maps.Event.addListener(marker, 'click', () => {
          if (infoWindowRef.current) infoWindowRef.current.close();
          (window as any).__closeInfoWindow = () => infoWindowRef.current?.close();

          // 클릭 시점의 최신 단지 데이터 참조 (메모·즐겨찾기 등 업데이트 반영)
          const fresh = complexesRef.current.find((c) => c.id === complex.id) ?? complex;

          const commuteHtml = fresh.commuteTimes?.length > 0
            ? fresh.commuteTimes
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
                ${fresh.complexName}
              </div>
              <div style="color:#1a73e8; font-size:16px; font-weight:700; margin-bottom:8px">
                ${fresh.price ? formatPrice(fresh.price) : fresh.priceRange}
              </div>
              <div style="color:#5f6368; margin-bottom:4px">
                ${fresh.region || ''} | ${fresh.builtYear || ''}
              </div>
              <div style="color:#5f6368; margin-bottom:6px">
                ${fresh.subwayInfos?.map(s => `${s.stationName} ${s.walkingMinutes ? `(도보 ${s.walkingMinutes}분)` : ''}`).join(', ') || ''}
              </div>
              <div style="font-size:12px; color:#80868b; padding-top:6px; border-top:1px solid #f0f0f0">
                ${commuteHtml}
              </div>
            </div>
          `;

          infoWindowRef.current.setContent(content);
          infoWindowRef.current.open(mapInstanceRef.current, marker);
          onComplexSelectRef.current(fresh);
        });

        markerMapRef.current.set(complex.id, { marker, listener });
        fingerprintMapRef.current.set(complex.id, fp);

      } else if (fingerprintMapRef.current.get(complex.id) !== fp) {
        // 3) 외관 변경 — setIcon/setZIndex만 호출 (리스너·위치 유지)
        const { marker } = markerMapRef.current.get(complex.id)!;
        marker.setIcon(createMarkerIcon(complex, isSelected));
        marker.setZIndex(isSelected ? 100 : 10);
        fingerprintMapRef.current.set(complex.id, fp);
      }
      // 4) 변경 없음 — 아무 작업 안 함
    });

    // fitBounds 최초 로드 시 1회만
    if (validComplexes.length > 0 && !boundsInitializedRef.current) {
      mapInstanceRef.current.fitBounds(bounds, { padding: 60 });
      boundsInitializedRef.current = true;
    }
  }, [complexes, selectedComplex, createMarkerIcon]);

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

  // 등록 모달 검색 위치 임시 마커 — 주황 핀으로 표시, 모달 닫히면 제거
  useEffect(() => {
    if (!mapInstanceRef.current || !window.naver) return;
    if (previewMarkerRef.current) {
      previewMarkerRef.current.setMap(null);
      previewMarkerRef.current = null;
    }
    if (!previewMarker) return;
    const content = `
      <div style="
        width:28px;height:28px;border-radius:50% 50% 50% 4px;
        background:#FF6B35;border:2px solid #fff;
        transform:rotate(-45deg);
        box-shadow:0 2px 6px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
      ">
        <div style="transform:rotate(45deg);font-size:13px;color:#fff;line-height:1;">📍</div>
      </div>`;
    previewMarkerRef.current = new window.naver.maps.Marker({
      position: new window.naver.maps.LatLng(previewMarker.lat, previewMarker.lng),
      map: mapInstanceRef.current,
      icon: { content, anchor: new window.naver.maps.Point(14, 28) },
      zIndex: 500,
    });
  }, [previewMarker]);

  // 한강공원 라벨 마커 — ComplexInfoPanel 열림/닫힘에 따라 표시·제거
  useEffect(() => {
    if (hanRiverMarkerRef.current) {
      hanRiverMarkerRef.current.setMap(null);
      hanRiverMarkerRef.current = null;
    }
    if (!mapInstanceRef.current || !window.naver || !hanRiverParkMarker) return;
    const content = `
      <div style="
        display:inline-flex; align-items:center; gap:5px;
        background:#1a5c3a; color:#fff;
        padding:5px 10px; border-radius:16px;
        font-size:12px; font-weight:700; white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);
        border:2px solid #fff;
      ">
        🏞 ${hanRiverParkMarker.name}
      </div>`;
    hanRiverMarkerRef.current = new window.naver.maps.Marker({
      position: new window.naver.maps.LatLng(hanRiverParkMarker.lat, hanRiverParkMarker.lng),
      map: mapInstanceRef.current,
      icon: { content, anchor: new window.naver.maps.Point(0, 0) },
      zIndex: 450,
    });
  }, [hanRiverParkMarker]);

  // 공공단지 마커 렌더링 — 좌표 근접 그룹화 + 다중 단지 클릭 펼치기
  useEffect(() => {
    if (!mapInstanceRef.current || !window.naver) return;
    publicComplexMarkersRef.current.forEach(m => m.setMap(null));
    publicComplexMarkersRef.current = [];
    pcGroupMapRef.current.clear();
    if (!publicComplexes?.length) return;

    const map = mapInstanceRef.current;
    const isVisible = () => map.getZoom() >= PUBLIC_COMPLEX_MIN_ZOOM;
    const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // 단지 정보 행 생성 헬퍼
    const pcRows = (pc: PublicComplex) => {
      const r1 = [
        pc.useAprDay ? pc.useAprDay.slice(0,4)+'년' : null,
        pc.hhldCnt   ? pc.hhldCnt+'세대'             : null,
      ].filter(Boolean).join(' · ');
      const r2 = [
        pc.vlRat     ? '용적 '+pc.vlRat+'%'  : null,
        pc.parkingCnt? '주차 '+pc.parkingCnt+'대' : null,
      ].filter(Boolean).join(' · ');
      return { r1, r2 };
    };

    // 마커 카드 HTML 생성 — collapsed=이름만 나열, expanded=각 단지 상세
    const buildContent = (complexes: PublicComplex[], expanded: boolean, groupId: string) => {
      const isMulti = complexes.length > 1;
      const baseStyle = `
        background:rgba(255,255,255,0.92);border:1px solid #89CFF0;border-radius:4px;
        padding:3px 7px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.15);
      `;
      if (!isMulti) {
        // 단일 단지 — pointer-events:none 유지
        const { r1, r2 } = pcRows(complexes[0]);
        return `<div style="${baseStyle}pointer-events:none;">
          <div style="font-size:10px;font-weight:600;color:#1a3a5c;line-height:1.4;">${esc(complexes[0].bldNm ?? '')}</div>
          ${r1 ? `<div class="pc-detail" style="font-size:8px;color:#666;line-height:1.3;">${r1}</div>` : ''}
          ${r2 ? `<div class="pc-detail" style="font-size:8px;color:#888;line-height:1.3;">${r2}</div>` : ''}
        </div>`;
      }
      if (!expanded) {
        // 다중 단지 접힘 — 이름 목록 + ▼
        const names = complexes.map(pc =>
          `<div style="font-size:10px;font-weight:600;color:#1a3a5c;line-height:1.4;">${esc(pc.bldNm ?? '')}</div>`
        ).join('');
        return `<div class="pc-multi" onclick="window.__pcGroupClick('${groupId}')"
          style="${baseStyle}cursor:pointer;">
          ${names}
          <div style="font-size:8px;color:#89CFF0;text-align:right;margin-top:1px;">▼ ${complexes.length}개</div>
        </div>`;
      }
      // 다중 단지 펼침 — 각 단지 상세
      const items = complexes.map((pc, i) => {
        const { r1, r2 } = pcRows(pc);
        return `<div style="${i > 0 ? 'border-top:1px solid #d6edf9;margin-top:3px;padding-top:3px;' : ''}">
          <div style="font-size:10px;font-weight:600;color:#1a3a5c;line-height:1.4;">${esc(pc.bldNm ?? '')}</div>
          ${r1 ? `<div style="font-size:8px;color:#666;line-height:1.3;">${r1}</div>` : ''}
          ${r2 ? `<div style="font-size:8px;color:#888;line-height:1.3;">${r2}</div>` : ''}
        </div>`;
      }).join('');
      return `<div class="pc-multi" onclick="window.__pcGroupClick('${groupId}')"
        style="${baseStyle}cursor:pointer;">
        ${items}
        <div style="font-size:8px;color:#89CFF0;text-align:right;margin-top:3px;">▲ 닫기</div>
      </div>`;
    };

    // 좌표 근접(0.0003°≈30m) 단지를 하나의 그룹으로 묶기
    const DEDUP_THRESHOLD = 0.0003;
    const assigned = new Set<string>();
    const groups: PublicComplex[][] = [];
    const sorted = publicComplexes.slice().sort((a, b) => (b.hhldCnt ?? 0) - (a.hhldCnt ?? 0));
    sorted.forEach(pc => {
      if (assigned.has(pc.id)) return;
      const group: PublicComplex[] = [pc];
      assigned.add(pc.id);
      sorted.forEach(other => {
        if (assigned.has(other.id)) return;
        if (Math.abs(other.latitude - pc.latitude) < DEDUP_THRESHOLD &&
            Math.abs(other.longitude - pc.longitude) < DEDUP_THRESHOLD) {
          group.push(other);
          assigned.add(other.id);
        }
      });
      groups.push(group);
    });

    // 그룹별 마커 생성
    groups.forEach(complexes => {
      const groupId = complexes[0].id;
      const rep = complexes[0]; // 세대수 최대 단지가 대표 좌표
      const content = buildContent(complexes, false, groupId);
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(rep.latitude, rep.longitude),
        map: isVisible() ? map : null,
        icon: { content, anchor: new window.naver.maps.Point(0, 0) },
        zIndex: 100,
      });
      publicComplexMarkersRef.current.push(marker);
      pcGroupMapRef.current.set(groupId, { marker, complexes, expanded: false });
    });

    // 전역 클릭 핸들러 — 그룹 토글
    (window as any).__pcGroupClick = (groupId: string) => {
      const entry = pcGroupMapRef.current.get(groupId);
      if (!entry) return;
      entry.expanded = !entry.expanded;
      const newContent = buildContent(entry.complexes, entry.expanded, groupId);
      entry.marker.setIcon({ content: newContent, anchor: new window.naver.maps.Point(0, 0) });
    };

    // 줌 변경 시 show/hide + 단일 마커 세부정보 토글
    const updateDetailVisibility = (zoom: number) => {
      let styleEl = document.getElementById('pc-zoom-style') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'pc-zoom-style';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `.pc-detail { display: ${zoom >= 15 ? 'block' : 'none'}; }`;
    };
    updateDetailVisibility(map.getZoom());

    const zoomListener = window.naver.maps.Event.addListener(map, 'zoom_changed', () => {
      const zoom = map.getZoom();
      const show = zoom >= PUBLIC_COMPLEX_MIN_ZOOM;
      publicComplexMarkersRef.current.forEach(m => m.setMap(show ? map : null));
      updateDetailVisibility(zoom);
    });

    return () => {
      window.naver.maps.Event.removeListener(zoomListener);
    };
  }, [publicComplexes]);

  // 경로/구획 그리기 모드일 때 다중 단지 마커 클릭 차단 (pointer-events 전환)
  useEffect(() => {
    let styleEl = document.getElementById('pc-multi-style') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'pc-multi-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `.pc-multi { pointer-events: ${(isDrawingRoute || isDrawingZone) ? 'none' : 'auto'}; }`;
  }, [isDrawingRoute, isDrawingZone]);

  // 학교·인프라 오버레이 마커 렌더링 — complex 변경 시 갱신
  useEffect(() => {
    if (!mapInstanceRef.current || !window.naver) return;
    overlayMarkersRef.current.forEach(m => m.setMap(null));
    overlayMarkersRef.current = [];

    const SCHOOL_COLORS: Record<string, string> = { MIDDLE: '#89CFF0', ELEMENTARY: '#7DC8A0' };
    const INFRA_COLORS: Record<string, string> = {
      DEPARTMENT_STORE: '#BA8BD8', MART: '#FFBE76', HOSPITAL: '#F08080', ETC: '#90A4AE',
    };
    const INFRA_LABELS: Record<string, string> = {
      DEPARTMENT_STORE: '백화점', MART: '마트', HOSPITAL: '병원', ETC: '기타',
    };

    // "XX중학교" → "XX중", "XX초등학교" → "XX초" (등학교/학교 suffix 제거)
    const truncateSchoolName = (name?: string) =>
      (name ?? '').replace(/등학교$/, '').replace(/학교$/, '') || '학교';

    (overlayMarkers ?? []).forEach(om => {
      const isSchool = om.markerType === 'school';
      const isHazard = om.markerType === 'hazard';
      const bgColor = isSchool
        ? (SCHOOL_COLORS[om.subType ?? ''] ?? '#7DC8A0')
        : (INFRA_COLORS[om.subType ?? ''] ?? '#607d8b');

      let content: string;
      if (isHazard) {
        // 검정 채운 삼각형 — 위를 가리키는 ▲, 매크로 카테고리명 표시
        const label = om.subType ?? (om.name ?? '').slice(0, 4);
        content = `
          <div style="display:flex;flex-direction:column;align-items:center;cursor:default;">
            <div style="
              width:0; height:0;
              border-left:8px solid transparent;
              border-right:8px solid transparent;
              border-bottom:14px solid #000;
              margin-bottom:1px;
            "></div>
            <div style="
              font-size:9px; font-weight:700; color:#000;
              white-space:nowrap; line-height:1.2; text-align:center;
            ">${label}</div>
          </div>`;
      } else if (isSchool) {
        const shortName = truncateSchoolName(om.name);
        const isMiddle = om.subType === 'MIDDLE';
        const topLine = isMiddle
          ? (om.achievementScore != null ? `<div style="font-size:9px;font-weight:600;opacity:0.9;line-height:1.2;">${om.achievementScore}%</div>` : '')
          : (om.walkingMinutes != null ? `<div style="font-size:9px;font-weight:600;opacity:0.9;line-height:1.2;">${om.walkingMinutes}분</div>` : '');
        content = `
          <div style="
            background:${bgColor}; color:#fff;
            padding:3px 6px; border-radius:3px;
            font-size:11px; font-weight:700;
            white-space:nowrap; box-shadow:0 1px 4px rgba(0,0,0,0.3);
            border:2px solid #fff; cursor:default; text-align:center; line-height:1.3;
          ">${topLine}${shortName}</div>`;
      } else {
        const label = INFRA_LABELS[om.subType ?? ''] ?? (om.name ?? '').slice(0, 3);
        content = `
          <div style="
            background:${bgColor}; color:#fff;
            padding:3px 6px; border-radius:3px;
            font-size:11px; font-weight:700;
            white-space:nowrap; box-shadow:0 1px 4px rgba(0,0,0,0.3);
            border:2px solid #fff; cursor:default;
          ">${label}</div>`;
      }

      const icon = {
        content,
        anchor: new window.naver.maps.Point(0, 0),
      };

      const m = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(om.lat, om.lng),
        map: mapInstanceRef.current,
        icon,
        zIndex: 15,
        title: om.name,
      });
      overlayMarkersRef.current.push(m);
    });
  }, [overlayMarkers]);

  // 도보 30분 반경 원 — radiusCenter 변경 시 이전 원 제거 후 새로 그리기
  // 도보 속도 4km/h × 0.5h = 2km 반경
  useEffect(() => {
    if (!mapInstanceRef.current || !window.naver) return;
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }
    if (!radiusCenter) return;
    circleRef.current = new window.naver.maps.Circle({
      map: mapInstanceRef.current,
      center: new window.naver.maps.LatLng(radiusCenter.lat, radiusCenter.lng),
      radius: 2000,
      fillColor: '#89CFF0',
      fillOpacity: 0.07,
      strokeColor: '#89CFF0',
      strokeOpacity: 0.5,
      strokeWeight: 2,
      strokeStyle: 'shortdash',
    });
  }, [radiusCenter]);

  // 행정구역 경계 폴리곤 — selectedDistrict 변경 시 기존 제거 후 새 경계 그리기
  // Polygon에 clickable:false 설정 → 경로 그리기 클릭 이벤트를 가리지 않음
  useEffect(() => {
    const map = mapInstanceRef.current;
    districtPolygonsRef.current.forEach(p => p.setMap(null));
    districtPolygonsRef.current = [];

    if (!selectedDistrict || !map || !window.naver) return;

    loadDistrictGeoJson()
      .then(data => {
        const feature = (data.features ?? []).find(
          (f: any) => getFeatureName(f) === selectedDistrict
        );
        if (!feature) return;

        const geometry = feature.geometry;

        // GeoJSON 좌표 [lng, lat] → Naver LatLng(lat, lng) 변환
        const toLatLng = (c: [number, number]) =>
          new window.naver.maps.LatLng(c[1], c[0]);

        // 각 ring(외곽 + 홀)을 LatLng 배열로 변환 → Polygon paths
        const ringsToNaverPaths = (rings: any[][]) =>
          rings.map(ring => ring.map(toLatLng));

        const polygonConfigs: any[][][] = [];

        if (geometry.type === 'Polygon') {
          polygonConfigs.push(ringsToNaverPaths(geometry.coordinates));
        } else if (geometry.type === 'MultiPolygon') {
          // MultiPolygon: 각 polygon을 독립된 Polygon 오버레이로 생성
          geometry.coordinates.forEach((polyCoords: any[][]) => {
            polygonConfigs.push(ringsToNaverPaths(polyCoords));
          });
        }

        polygonConfigs.forEach(paths => {
          const polygon = new window.naver.maps.Polygon({
            map,
            paths,
            fillColor: '#FF6F00',
            fillOpacity: 0.08,
            strokeColor: '#FF6F00',
            strokeOpacity: 1,
            strokeWeight: 3,
            clickable: false, // 마우스 이벤트 미차단 — 경로 그리기와 충돌 방지
          });
          districtPolygonsRef.current.push(polygon);
        });

        // 선택한 구역으로 지도 이동 (현재 뷰포트 밖에 있을 수 있으므로)
        if (districtPolygonsRef.current.length > 0) {
          const bounds = new window.naver.maps.LatLngBounds();
          (geometry.type === 'Polygon'
            ? [geometry.coordinates[0]]
            : geometry.coordinates.map((p: any[][]) => p[0])
          ).forEach((ring: any[]) => ring.forEach((c: any) => bounds.extend(toLatLng(c))));
          map.fitBounds(bounds, { padding: 60 });
        }
      })
      .catch(() => {});
  }, [selectedDistrict]);

  // 경로 그리기 모드 — isDrawingRoute 토글 시 지도 클릭 리스너 추가·제거
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.naver) return;
    if (mapClickListenerRef.current) {
      window.naver.maps.Event.removeListener(mapClickListenerRef.current);
      mapClickListenerRef.current = null;
    }
    if (!isDrawingRoute) return;
    mapClickListenerRef.current = window.naver.maps.Event.addListener(map, 'click', (e: any) => {
      onRoutePointAddRef.current?.({ lat: e.coord.lat(), lng: e.coord.lng() });
    });
  }, [isDrawingRoute]);

  // 저장된 경로 — routes 변경 시 폴리라인 + 방향 화살표 + 1km 마커 재렌더링
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.naver) return;

    routePolylinesRef.current.forEach(p => p.setMap(null));
    routePolylinesRef.current = [];
    routeArrowMarkersRef.current.forEach(m => m.setMap(null));
    routeArrowMarkersRef.current = [];
    routeKmMarkersRef.current.forEach(m => m.setMap(null));
    routeKmMarkersRef.current = [];

    (routes ?? []).forEach((route, idx) => {
      if (route.points.length < 2) return;
      const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
      const pts: RoutePoint[] = route.points;

      // 폴리라인
      const polyline = new window.naver.maps.Polyline({
        path: pts.map(p => new window.naver.maps.LatLng(p.lat, p.lng)),
        strokeColor: color,
        strokeWeight: 4,
        strokeOpacity: 0.85,
        map,
      });
      routePolylinesRef.current.push(polyline);

      // 각 점마다 진행 방향 ❯ 화살표 마커
      // ❯ 는 기본 오른쪽(East=90°)을 가리키므로, CSS rotation = bearing - 90
      pts.forEach((p, i) => {
        const isLast = i === pts.length - 1;
        const bearing = isLast
          ? calcBearing(pts[i - 1], pts[i])
          : calcBearing(pts[i], pts[i + 1]);
        const rotation = bearing - 90;

        const m = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(p.lat, p.lng),
          map,
          icon: {
            content: `<div style="position:relative;pointer-events:none;width:0;height:0;">
              <div style="position:absolute;transform:translate(-50%,-50%) rotate(${rotation}deg);color:${color};font-size:18px;font-weight:900;text-shadow:0 0 3px #fff,0 0 5px #fff;line-height:1;">❯</div>
            </div>`,
            anchor: new window.naver.maps.Point(0, 0),
          },
          zIndex: 25,
        });
        routeArrowMarkersRef.current.push(m);
      });

      // 1km 간격 거리 마커 — 경로 위에 1km, 2km... 누적 거리 표시
      // t(보간 비율) = (목표거리 - 현재까지 누적) / 현재 선분 길이
      let cumDist = 0;
      let kmCount = 1;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const segDist = haversineMeters(p1, p2);

        // 이 선분 안에 km 경계가 하나 이상 있으면 보간 위치마다 마커 생성
        while (cumDist + segDist >= kmCount * 1000) {
          // 선분 내 보간 비율 — 선형 보간으로 정확한 1km 지점 좌표 산출
          const t = (kmCount * 1000 - cumDist) / segDist;
          const lat = p1.lat + t * (p2.lat - p1.lat);
          const lng = p1.lng + t * (p2.lng - p1.lng);

          const kmMarker = new window.naver.maps.Marker({
            position: new window.naver.maps.LatLng(lat, lng),
            map,
            icon: {
              content: `<div style="position:relative;pointer-events:none;width:0;height:0;">
                <div style="position:absolute;transform:translate(-50%,-130%);background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);white-space:nowrap;">${kmCount}km</div>
              </div>`,
              anchor: new window.naver.maps.Point(0, 0),
            },
            zIndex: 22,
          });
          routeKmMarkersRef.current.push(kmMarker);
          kmCount++;
        }
        cumDist += segDist;
      }
    });
  }, [routes]);

  // 그리기 중인 경로 — drawingPoints 변경 시 점선 폴리라인 + 점 마커 갱신
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.naver) return;
    // 기존 그리기 폴리라인·마커 제거
    if (drawingPolylineRef.current) { drawingPolylineRef.current.setMap(null); drawingPolylineRef.current = null; }
    drawingMarkersRef.current.forEach(m => m.setMap(null));
    drawingMarkersRef.current = [];

    const pts = drawingPoints ?? [];
    if (pts.length === 0) return;

    // 점 마커 — 작은 파란 원
    pts.forEach((p, i) => {
      const m = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(p.lat, p.lng),
        map,
        icon: {
          content: `<div style="width:10px;height:10px;border-radius:50%;background:${i === pts.length - 1 ? '#E06060' : '#89CFF0'};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
          anchor: new window.naver.maps.Point(5, 5),
        },
        zIndex: 20,
      });
      drawingMarkersRef.current.push(m);
    });

    // 폴리라인 — 점선 파란선 (점 2개 이상부터)
    if (pts.length < 2) return;
    drawingPolylineRef.current = new window.naver.maps.Polyline({
      path: pts.map(p => new window.naver.maps.LatLng(p.lat, p.lng)),
      strokeColor: '#89CFF0',
      strokeWeight: 3,
      strokeOpacity: 0.9,
      strokeStyle: 'shortdash',
      map,
    });
  }, [drawingPoints]);

  // 위치 추적 종료 — watchPosition·나침반·드래그 리스너 해제 + 마커 제거
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    orientationCleanupRef.current?.();
    orientationCleanupRef.current = null;
    if (dragListenerRef.current && window.naver) {
      window.naver.maps.Event.removeListener(dragListenerRef.current);
      dragListenerRef.current = null;
    }
    if (myLocationMarkerRef.current) {
      myLocationMarkerRef.current.setMap(null);
      myLocationMarkerRef.current = null;
    }
    headingRef.current = null;
    lastPositionRef.current = null;
    isFollowingRef.current = false;
    setIsTracking(false);
    setIsFollowing(false);
  }, []);

  // 내 위치 버튼 핸들러
  // - 비활성 → 추적 시작 + 지도 따라가기
  // - 추적 중 + 따라가기 중 → 탭 시 추적 종료
  // - 추적 중 + 드래그로 멈춤 → 탭 시 지도를 현재 위치로 재중심 + 따라가기 재개
  const handleMyLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
      return;
    }

    if (isTracking) {
      if (!isFollowing) {
        // 따라가기 재개 + 현재 위치로 지도 이동
        isFollowingRef.current = true;
        setIsFollowing(true);
        if (lastPositionRef.current && mapInstanceRef.current && window.naver) {
          const { lat, lng } = lastPositionRef.current;
          mapInstanceRef.current.panTo(new window.naver.maps.LatLng(lat, lng));
          mapInstanceRef.current.setZoom(16);
        }
      } else {
        stopTracking();
      }
      return;
    }

    // 추적 시작
    setLocating(true);

    // 나침반 이벤트 핸들러 — iOS: webkitCompassHeading, Android: absolute alpha
    const orientationHandler = (e: DeviceOrientationEvent) => {
      let h: number | null = null;
      const wch = (e as any).webkitCompassHeading;
      if (wch != null && wch >= 0) {
        h = wch; // iOS: 자북 기준 시계방향 방위각
      } else if ((e as any).absolute && e.alpha != null) {
        h = (360 - e.alpha) % 360; // Android: alpha 반시계 → 시계방향 변환
      }
      if (h === null) return;
      headingRef.current = h;
      // 마커가 이미 있으면 방향 아이콘 즉시 갱신
      if (myLocationMarkerRef.current && window.naver) {
        myLocationMarkerRef.current.setIcon({
          content: buildLocMarkerContent(h),
          anchor: new window.naver.maps.Point(14, 14),
        });
      }
    };

    // iOS 13+는 DeviceOrientationEvent 사용 전 사용자 권한 요청 필요
    try {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        const perm = await (DeviceOrientationEvent as any).requestPermission();
        if (perm === 'granted') {
          window.addEventListener('deviceorientationabsolute', orientationHandler as any, true);
          window.addEventListener('deviceorientation', orientationHandler as any, true);
          orientationCleanupRef.current = () => {
            window.removeEventListener('deviceorientationabsolute', orientationHandler as any, true);
            window.removeEventListener('deviceorientation', orientationHandler as any, true);
          };
        }
      } else {
        window.addEventListener('deviceorientationabsolute', orientationHandler as any, true);
        window.addEventListener('deviceorientation', orientationHandler as any, true);
        orientationCleanupRef.current = () => {
          window.removeEventListener('deviceorientationabsolute', orientationHandler as any, true);
          window.removeEventListener('deviceorientation', orientationHandler as any, true);
        };
      }
    } catch {}

    // 지도 드래그 시 따라가기 일시 중지
    const map = mapInstanceRef.current;
    if (map && window.naver) {
      if (dragListenerRef.current) window.naver.maps.Event.removeListener(dragListenerRef.current);
      dragListenerRef.current = window.naver.maps.Event.addListener(map, 'dragstart', () => {
        if (isFollowingRef.current) {
          isFollowingRef.current = false;
          setIsFollowing(false);
        }
      });
    }

    isFollowingRef.current = true;
    setIsFollowing(true);
    setIsTracking(true);

    let firstFix = true;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, heading: gpsH } = pos.coords;
        lastPositionRef.current = { lat, lng };
        // 이동 중 GPS 방향 우선, 정지 시 나침반 fallback
        const effectiveH = (gpsH != null && gpsH >= 0) ? gpsH : headingRef.current;
        const content = buildLocMarkerContent(effectiveH);
        const anchor = new window.naver.maps.Point(14, 14);
        const mapInst = mapInstanceRef.current;
        if (!mapInst || !window.naver) return;

        const naverPos = new window.naver.maps.LatLng(lat, lng);
        if (myLocationMarkerRef.current) {
          myLocationMarkerRef.current.setPosition(naverPos);
          myLocationMarkerRef.current.setIcon({ content, anchor });
        } else {
          myLocationMarkerRef.current = new window.naver.maps.Marker({
            position: naverPos,
            map: mapInst,
            icon: { content, anchor },
            zIndex: 200,
          });
        }

        if (isFollowingRef.current) {
          mapInst.panTo(naverPos);
          if (firstFix) { mapInst.setZoom(16); firstFix = false; }
        }
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        stopTracking();
        if (err.code === err.PERMISSION_DENIED) {
          alert('위치 권한이 거부됐습니다. 브라우저 설정에서 위치 접근을 허용해주세요.');
        } else {
          alert('위치를 가져오지 못했습니다.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [isTracking, isFollowing, stopTracking]);

  // 언마운트 시 위치 추적 리소스 정리
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      orientationCleanupRef.current?.();
      if (dragListenerRef.current && (window as any).naver) {
        (window as any).naver.maps.Event.removeListener(dragListenerRef.current);
      }
    };
  }, []);

  // 로드뷰 초기화 — roadViewOpen이 true가 될 때 Panorama 인스턴스 생성 (최초 1회)
  // panoRef.current는 조건부 렌더링이므로 DOM 마운트 후 setTimeout으로 접근
  useEffect(() => {
    if (!roadViewOpen) {
      // 로드뷰 닫힐 때 지도 클릭 리스너 제거
      if (roadViewClickRef.current && window.naver) {
        window.naver.maps.Event.removeListener(roadViewClickRef.current);
        roadViewClickRef.current = null;
      }
      return;
    }
    const timer = setTimeout(() => {
      if (!panoRef.current || !(window.naver?.maps as any)?.Panorama) return;
      if (!panoInstanceRef.current) {
        panoInstanceRef.current = new (window.naver.maps as any).Panorama(panoRef.current, {
          position: new window.naver.maps.LatLng(37.5665, 126.978),
          pov: { pan: 0, tilt: 0, fov: 100 },
        });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [roadViewOpen]);

  // 로드뷰 지도 클릭 — 경로 그리기 중이 아닐 때만 파노라마 위치 업데이트
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.naver) return;
    if (roadViewClickRef.current) {
      window.naver.maps.Event.removeListener(roadViewClickRef.current);
      roadViewClickRef.current = null;
    }
    if (!roadViewOpen || isDrawingRoute) return;
    roadViewClickRef.current = window.naver.maps.Event.addListener(map, 'click', (e: any) => {
      if (panoInstanceRef.current) {
        panoInstanceRef.current.setPosition(new window.naver.maps.LatLng(e.coord.lat(), e.coord.lng()));
      }
    });
  }, [roadViewOpen, isDrawingRoute]);

  // 저장된 생활권 구획 폴리곤 — zonePolygons 변경 시 오버레이 갱신
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.naver) return;
    zoneSavedPolygonsRef.current.forEach(p => p.setMap(null));
    zoneSavedPolygonsRef.current = [];
    zoneLabelMarkersRef.current.forEach(m => m.setMap(null));
    zoneLabelMarkersRef.current = [];

    (zonePolygons ?? []).forEach(zone => {
      if (zone.points.length < 3) return;
      const path = zone.points.map(p => new window.naver.maps.LatLng(p.lat, p.lng));

      const polygon = new window.naver.maps.Polygon({
        paths: [path],
        fillColor: '#7DC8A0',
        fillOpacity: 0.12,
        strokeColor: '#2e7d32',
        strokeWeight: 2,
        strokeOpacity: 0.7,
        strokeStyle: 'shortdash',
        map,
        clickable: false,
      });
      zoneSavedPolygonsRef.current.push(polygon);

      // 폴리곤 중심점에 생활권 이름 라벨 표시
      const lats = zone.points.map(p => p.lat);
      const lngs = zone.points.map(p => p.lng);
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      const safeZoneName = zone.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const labelMarker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(centerLat, centerLng),
        map,
        icon: {
          content: `<div style="
            background:rgba(46,125,50,0.85);color:#fff;
            padding:3px 8px;border-radius:10px;
            font-size:11px;font-weight:700;white-space:nowrap;
            box-shadow:0 1px 4px rgba(0,0,0,0.2);
            pointer-events:none;
          ">${safeZoneName}</div>`,
          anchor: new window.naver.maps.Point(0, 0),
        },
        zIndex: 12,
        clickable: false,
      });
      zoneLabelMarkersRef.current.push(labelMarker);
    });
  }, [zonePolygons]);

  // 생활권 구획 그리기 모드 — isDrawingZone 토글 시 지도 클릭 리스너 추가·제거
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.naver) return;
    if (zoneClickListenerRef.current) {
      window.naver.maps.Event.removeListener(zoneClickListenerRef.current);
      zoneClickListenerRef.current = null;
    }
    if (!isDrawingZone) return;
    zoneClickListenerRef.current = window.naver.maps.Event.addListener(map, 'click', (e: any) => {
      onZonePointAddRef.current?.({ lat: e.coord.lat(), lng: e.coord.lng() });
    });
  }, [isDrawingZone]);

  // 구획 폴리곤 렌더링 — drawingZonePoints 변경 시 마커·폴리곤 갱신
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.naver) return;
    // 기존 오버레이 제거
    if (zonePolygonRef.current) { zonePolygonRef.current.setMap(null); zonePolygonRef.current = null; }
    zoneMarkersRef.current.forEach(m => m.setMap(null));
    zoneMarkersRef.current = [];

    const pts = drawingZonePoints ?? [];
    if (pts.length === 0) return;

    // 꼭지점 마커 — 초록 원
    pts.forEach((p, i) => {
      const isFirst = i === 0;
      const m = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(p.lat, p.lng),
        map,
        icon: {
          content: `<div style="width:10px;height:10px;border-radius:50%;background:${isFirst ? '#2e7d32' : '#7DC8A0'};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
          anchor: new window.naver.maps.Point(5, 5),
        },
        zIndex: 20,
      });
      zoneMarkersRef.current.push(m);
    });

    // 3개 이상 점이면 폴리곤 표시, 미만이면 폴리라인만
    if (pts.length >= 3) {
      zonePolygonRef.current = new window.naver.maps.Polygon({
        paths: [pts.map(p => new window.naver.maps.LatLng(p.lat, p.lng))],
        fillColor: '#7DC8A0',
        fillOpacity: 0.2,
        strokeColor: '#2e7d32',
        strokeWeight: 2.5,
        strokeOpacity: 0.9,
        strokeStyle: 'shortdash',
        map,
        clickable: false,
      });
    } else if (pts.length >= 2) {
      zonePolygonRef.current = new window.naver.maps.Polyline({
        path: pts.map(p => new window.naver.maps.LatLng(p.lat, p.lng)),
        strokeColor: '#2e7d32',
        strokeWeight: 2.5,
        strokeOpacity: 0.9,
        strokeStyle: 'shortdash',
        map,
      });
    }
  }, [drawingZonePoints]);

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 지도 + 내 위치 버튼 — 로드뷰 패널 위에 남은 공간 전부 사용 */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div
          ref={mapRef}
          style={{
            width: '100%',
            height: '100%',
            minHeight: '200px',
            backgroundColor: '#e8eaed',
            cursor: (isDrawingRoute || isDrawingZone) ? 'crosshair' : 'default',
          }}
        />
        {/* 내 위치 / 실시간 추적 버튼 — 상태별 색상
            · 비활성: 흰 배경 / 회색 테두리
            · 추적+따라가기: 파란 배경 (📍 흰색)
            · 추적+멈춤: 흰 배경 / 파란 테두리 (탭 시 재중심) */}
        <button
          onClick={handleMyLocation}
          disabled={locating}
          title={
            !isTracking ? '실시간 위치 추적 시작' :
            !isFollowing ? '현재 위치로 이동' : '위치 추적 종료'
          }
          style={{
            position: 'absolute', top: '12px', left: '12px',
            width: '40px', height: '40px', borderRadius: '8px',
            backgroundColor: (isTracking && isFollowing) ? '#1a73e8' : '#fff',
            border: (isTracking && !isFollowing) ? '2px solid #1a73e8' : '1px solid #dadce0',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
            cursor: locating ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', zIndex: 50,
            opacity: locating ? 0.6 : 1,
            transition: 'background-color 0.2s, border 0.2s',
            color: (isTracking && isFollowing) ? '#fff' : 'inherit',
          }}
        >
          {locating ? '⌛' : '📍'}
        </button>
      </div>
      {/* 로드뷰 패널 — 항상 DOM에 유지 (Panorama 인스턴스가 div에 바인딩된 상태를 유지하기 위해)
          roadViewOpen=false 시 height:0 + overflow:hidden으로 숨김 처리 */}
      <div style={{
        height: roadViewOpen ? '300px' : '0',
        flexShrink: 0,
        overflow: 'hidden',
        borderTop: roadViewOpen ? '2px solid #1a73e8' : 'none',
        backgroundColor: '#000',
        transition: 'height 0.2s ease',
      }}>
        <div ref={panoRef} style={{ width: '100%', height: '300px' }} />
      </div>
    </div>
  );
};

export default MapPage;
