import React, { useEffect, useRef, useCallback, useState } from 'react';
import { ApartmentComplex, MapRoute, OverlayMarker, RoutePoint, formatPrice } from '../types';
import { loadDistrictGeoJson, getFeatureName } from '../utils/districtGeoJson';
import { haversineMeters } from '../utils/geo';

// 저장된 경로마다 순환 사용할 색상 팔레트
const ROUTE_COLORS = ['#e53935', '#43a047', '#8e24aa', '#fb8c00', '#039be5', '#6d4c41', '#00acc1', '#546e7a'];

// p1 → p2 방향의 방위각 (도, 북=0, 시계방향)
function calcBearing(p1: RoutePoint, p2: RoutePoint): number {
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
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
}

const MapPage: React.FC<MapPageProps> = ({
  complexes, selectedComplex, onComplexSelect, focusLocation, overlayMarkers, radiusCenter,
  routes, drawingPoints, isDrawingRoute, onRoutePointAdd, selectedDistrict, roadViewOpen,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const overlayMarkersRef = useRef<any[]>([]);
  const circleRef = useRef<any>(null);
  const districtPolygonsRef = useRef<any[]>([]); // 행정구역 경계 폴리곤 배열
  const myLocationMarkerRef = useRef<any>(null); // 내 위치 마커
  const [locating, setLocating] = useState(false); // 위치 조회 중 로딩 상태
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

    // body 직속 tooltip — 지도 DOM 바깥이므로 어떤 stacking context도 영향 없음
    const tip = document.createElement('div');
    tip.id = '__mk_tooltip';
    tip.style.cssText = [
      'display:none', 'position:fixed', 'pointer-events:none',
      'z-index:2147483647',
      'background:rgba(33,33,33,0.85)', 'color:#fff',
      'padding:3px 9px', 'border-radius:4px',
      'font-size:11px', 'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
      'white-space:nowrap', 'box-shadow:0 1px 4px rgba(0,0,0,0.3)',
      'transform:translate(-50%,calc(-100% - 6px))',
    ].join(';');
    document.body.appendChild(tip);

    (window as any).__mkTipShow = (name: string, cx: number, cy: number) => {
      tip.textContent = name;
      tip.style.left = cx + 'px';
      tip.style.top = cy + 'px';
      tip.style.display = 'block';
    };
    (window as any).__mkTipHide = () => { tip.style.display = 'none'; };

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
      document.body.removeChild(tip);
      delete (window as any).__mkTipShow;
      delete (window as any).__mkTipHide;
    };
  }, []);

  // 마커 아이콘 생성 — 회전 정사각형(border-radius+rotate) 핀 스타일, 호버 시 단지명 tooltip
  const createMarkerIcon = useCallback(
    (complex: ApartmentComplex, isSelected: boolean) => {
      // 실제 가격을 억 단위로 변환 (천만 자리에서 반올림) — 없으면 금액대 숫자로 fallback
      // price가 있는 평형의 최신 날짜가 다를 경우에도 백엔드가 올바른 값을 내려주므로 여기서 추가 처리 불필요
      const priceUk = complex.price
        ? Math.round(complex.price / 10000000) / 10
        : (() => { const m = complex.priceRange?.match(/^(\d+)/); return m ? parseInt(m[1]) : null; })();
      // 가격 정보가 전혀 없으면 '?' 표시 — undefined/null이 마커에 그대로 노출되는 것 방지
      const label = priceUk !== null ? String(priceUk) : (complex.priceRange ?? '?');

      // 가격 기준 색상 구분: 선택=보라, 10억 미만=파랑, 15억 미만=노랑, 20억 미만=빨강, 그 외=검정
      const bgColor = isSelected
        ? '#BA8BD8'
        : priceUk === null ? '#89CFF0'
        : priceUk < 10 ? '#89CFF0'
        : priceUk < 15 ? '#FFD97D'
        : priceUk < 20 ? '#E06060'
        : '#607d8b';

      // 글자 수에 따라 폰트 크기 조정
      const fontSize = !label || label.length <= 2 ? 9 : label.length <= 4 ? 8 : 7;
      // 밝은 파스텔 배경에서는 다크 텍스트로 가독성 확보
      const textColor = (bgColor === '#89CFF0' || bgColor === '#FFD97D') ? '#1a3a5c' : '#fff';

      // XSS 방지: 단지명의 HTML 특수문자 이스케이프
      const safeName = complex.complexName
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const isFav = complex.isFavorite ?? false;

      // 임장 유형별 테두리 색상 — NONE(미입력 포함)은 흰색
      const VISIT_BORDER: Record<string, string> = {
        ATMOSPHERE: '#A8D8A0', COMPLEX: '#7DC8A0', LISTING: '#5AAF84',
      };
      const visitBorder = VISIT_BORDER[complex.visitType ?? ''] ?? '#ffffff';

      // 즐겨찾기 단지 — 6각별(헥사그램)+꼬리 핀 마커
      if (isFav) {
        const starPath = '30,4 36,17.6 50.8,16 42,28 50.8,40 36,38.4 30,63 24,38.4 9.2,40 18,28 9.2,16 24,17.6';
        return {
          content: `
            <div style="position:relative;display:inline-block;cursor:pointer;"
                 onmouseover="var r=this.getBoundingClientRect();window.__mkTipShow('${safeName}',r.left+r.width/2,r.top);"
                 onmouseout="window.__mkTipHide();">
              <div style="position:relative;width:43px;height:56px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.22));">
                <svg xmlns="http://www.w3.org/2000/svg" width="43" height="56" viewBox="0 0 60 80" style="display:block;">
                  <polygon points="${starPath}" fill="${bgColor}" stroke="${visitBorder}" stroke-width="3.5" stroke-linejoin="round"/>
                </svg>
                <div style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);
                            color:${textColor};font-weight:800;font-size:${fontSize}px;letter-spacing:-0.3px;
                            text-shadow:0 1px 1px rgba(0,0,0,0.08);white-space:nowrap;pointer-events:none;">
                  ${label}
                </div>
              </div>
            </div>
          `,
          anchor: new window.naver.maps.Point(22, 47),
        };
      }

      return {
        content: `
          <div style="position:relative;display:inline-block;cursor:pointer;"
               onmouseover="var r=this.getBoundingClientRect();window.__mkTipShow('${safeName}',r.left+r.width/2,r.top);"
               onmouseout="window.__mkTipHide();">
            <div style="position:relative;width:30px;height:30px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.22));">
              <div style="position:absolute;inset:0;background:${bgColor};border:2px solid ${visitBorder};border-radius:50% 50% 50% 4px;transform:rotate(-45deg);box-shadow:inset 0 1px 0 rgba(255,255,255,0.35);"></div>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${textColor};font-weight:800;font-size:${fontSize}px;letter-spacing:-0.3px;text-shadow:0 1px 1px rgba(0,0,0,0.08);">${label}</div>
            </div>
          </div>
        `,
        // rotate(-45deg) 후 bottom-left 꼭짓점 위치: N*(1+√2)/2 = 30*1.207 ≈ 36
        anchor: new window.naver.maps.Point(15, 36),
      };
    },
    []
  );

  // 마커 diff 업데이트 — 추가/제거/변경된 것만 처리 (전체 재생성 X)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.naver) return;

    // 좌표 유효성 검사
    const validComplexes = complexes.filter(
      (c) => c.latitude && c.longitude &&
        c.latitude >= 33 && c.latitude <= 38 &&
        c.longitude >= 124 && c.longitude <= 132
    );

    // 마커 아이콘 외관을 결정하는 필드만 포함한 fingerprint
    // selectedId·price·priceRange·isFavorite·visitType 중 하나라도 바뀌면 아이콘 재생성
    const makeFingerprint = (c: ApartmentComplex, isSelected: boolean) =>
      `${isSelected}-${c.price}-${c.priceRange}-${c.isFavorite}-${c.visitType}`;

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
          (window as any).__mkTipHide?.();
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
            fillColor: '#89CFF0',
            fillOpacity: 0.07,
            strokeColor: '#89CFF0',
            strokeOpacity: 0.75,
            strokeWeight: 2.5,
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

      // 1km 간격 거리 마커
      let cumDist = 0;
      let kmCount = 1;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const segDist = haversineMeters(p1, p2);

        while (cumDist + segDist >= kmCount * 1000) {
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

  // 내 위치 버튼 핸들러 — Geolocation API로 현재 위치 조회 후 마커 표시
  const handleMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const map = mapInstanceRef.current;
        if (!map || !window.naver) { setLocating(false); return; }

        // 기존 내 위치 마커 제거 후 새로 생성
        if (myLocationMarkerRef.current) myLocationMarkerRef.current.setMap(null);
        myLocationMarkerRef.current = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(lat, lng),
          map,
          icon: {
            content: `
              <div style="position:relative;width:20px;height:20px;">
                <div style="
                  position:absolute;inset:0;border-radius:50%;
                  background:rgba(26,115,232,0.2);
                  animation:mylocpulse 1.8s ease-out infinite;
                "></div>
                <div style="
                  position:absolute;inset:4px;border-radius:50%;
                  background:#1a73e8;border:2.5px solid #fff;
                  box-shadow:0 1px 4px rgba(0,0,0,0.35);
                "></div>
              </div>
              <style>
                @keyframes mylocpulse {
                  0%   { transform:scale(1);   opacity:0.7; }
                  100% { transform:scale(2.8); opacity:0; }
                }
              </style>
            `,
            anchor: new window.naver.maps.Point(10, 10),
          },
          zIndex: 200,
        });

        map.setCenter(new window.naver.maps.LatLng(lat, lng));
        map.setZoom(15);
        setLocating(false);
      },
      err => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          alert('위치 권한이 거부됐습니다. 브라우저 설정에서 위치 접근을 허용해주세요.');
        } else {
          alert('위치를 가져오지 못했습니다.');
        }
      },
      { timeout: 10000, maximumAge: 30000 }
    );
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
            cursor: isDrawingRoute ? 'crosshair' : 'default',
          }}
        />
        {/* 내 위치 플로팅 버튼 — 왼쪽 상단 고정 (모바일에서 경로 목록 버튼과 겹침 방지) */}
        <button
          onClick={handleMyLocation}
          disabled={locating}
          title="내 위치로 이동"
          style={{
            position: 'absolute', top: '12px', left: '12px',
            width: '40px', height: '40px', borderRadius: '8px',
            backgroundColor: '#fff', border: '1px solid #dadce0',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
            cursor: locating ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', zIndex: 50,
            opacity: locating ? 0.6 : 1,
            transition: 'opacity 0.2s',
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
