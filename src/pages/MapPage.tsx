import React, { useEffect, useRef, useCallback } from 'react';
import { ApartmentComplex, OverlayMarker, formatPrice } from '../types';

interface MapPageProps {
  complexes: ApartmentComplex[];
  selectedComplex: ApartmentComplex | null;
  onComplexSelect: (complex: ApartmentComplex) => void;
  focusLocation?: { lat: number; lng: number } | null;
  overlayMarkers?: OverlayMarker[];
}

const MapPage: React.FC<MapPageProps> = ({ complexes, selectedComplex, onComplexSelect, focusLocation, overlayMarkers }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const overlayMarkersRef = useRef<any[]>([]);

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
      borderColor: '#1a73e8',
      borderWidth: 2,
    });

    // body 직속 tooltip — 지도 DOM 바깥이므로 어떤 stacking context도 영향 없음
    const tip = document.createElement('div');
    tip.id = '__mk_tooltip';
    tip.style.cssText = [
      'display:none', 'position:fixed', 'pointer-events:none',
      'z-index:2147483647',  // 최대값
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

    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      document.body.removeChild(tip);
      delete (window as any).__mkTipShow;
      delete (window as any).__mkTipHide;
    };
  }, []);

  // 마커 아이콘 생성 — 회전 정사각형(border-radius+rotate) 핀 스타일, 호버 시 단지명 tooltip
  const createMarkerIcon = useCallback(
    (complex: ApartmentComplex, isSelected: boolean) => {
      // 실제 가격을 억 단위로 변환 (천만 자리에서 반올림) — 없으면 금액대 숫자로 fallback
      const priceUk = complex.price
        ? Math.round(complex.price / 10000000) / 10
        : (() => { const m = complex.priceRange?.match(/^(\d+)/); return m ? parseInt(m[1]) : null; })();
      const label = priceUk !== null ? String(priceUk) : complex.priceRange;

      // 가격 기준 색상 구분: 선택=보라, 10억 미만=파랑, 15억 미만=노랑, 20억 미만=빨강, 그 외=검정
      const bgColor = isSelected
        ? '#6a0dad'
        : priceUk === null ? '#1a73e8'
        : priceUk < 10 ? '#1a73e8'
        : priceUk < 15 ? '#f9ab00'
        : priceUk < 20 ? '#c5221f'
        : '#202124';

      // 글자 수에 따라 폰트 크기 조정
      const fontSize = !label || label.length <= 2 ? 9 : label.length <= 4 ? 8 : 7;

      // XSS 방지: 단지명의 HTML 특수문자 이스케이프
      const safeName = complex.complexName
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const isFav = complex.isFavorite ?? false;

      // 즐겨찾기 단지 — 6각별(헥사그램)+꼬리 핀 마커 (CSS .star-pin 참조, inline 스타일로 변환)
      // 6각별 12꼭짓점 중 하단 외부점을 꼬리 끝(30,76)으로 대체 → 육망성 핀 완성
      // 별 중심 (30,28), 외부반경 24, 내부반경 12
      if (isFav) {
        const starPath = '30,4 36,17.6 50.8,16 42,28 50.8,40 36,38.4 30,63 24,38.4 9.2,40 18,28 9.2,16 24,17.6';
        const starFontSize = !label || label.length <= 2 ? 13 : label.length <= 4 ? 11 : 9;
        return {
          content: `
            <div style="position:relative;display:inline-block;cursor:pointer;"
                 onmouseover="var r=this.getBoundingClientRect();window.__mkTipShow('${safeName}',r.left+r.width/2,r.top);"
                 onmouseout="window.__mkTipHide();">
              <div style="position:relative;width:60px;height:80px;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.22));">
                <svg xmlns="http://www.w3.org/2000/svg" width="60" height="80" viewBox="0 0 60 80" style="display:block;">
                  <polygon points="${starPath}" fill="${bgColor}" stroke="white" stroke-width="3.5" stroke-linejoin="round"/>
                </svg>
                <div style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);
                            color:#fff;font-weight:800;font-size:${starFontSize}px;letter-spacing:-0.3px;
                            text-shadow:0 1px 1px rgba(0,0,0,0.15);white-space:nowrap;pointer-events:none;">
                  ${label}
                </div>
              </div>
            </div>
          `,
          // 꼬리 끝점 (30,63) + stroke 1.75px 확장 고려
          anchor: new window.naver.maps.Point(30, 65),
        };
      }

      return {
        content: `
          <div style="position:relative;display:inline-block;cursor:pointer;"
               onmouseover="var r=this.getBoundingClientRect();window.__mkTipShow('${safeName}',r.left+r.width/2,r.top);"
               onmouseout="window.__mkTipHide();">
            <div style="position:relative;width:30px;height:30px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.22));">
              <div style="position:absolute;inset:0;background:${bgColor};border:2px solid #fff;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);box-shadow:inset 0 1px 0 rgba(255,255,255,0.35);"></div>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${fontSize}px;letter-spacing:-0.3px;text-shadow:0 1px 1px rgba(0,0,0,0.15);">${label}</div>
            </div>
          </div>
        `,
        // rotate(-45deg) 후 bottom-left 꼭짓점 위치: N*(1+√2)/2 = 30*1.207 ≈ 36
        anchor: new window.naver.maps.Point(15, 36),
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

        // 클릭 시 mouseout이 발생하지 않아 tooltip이 남으므로 명시적으로 숨김
        (window as any).__mkTipHide?.();

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

  // 학교·인프라 오버레이 마커 렌더링 — complex 변경 시 갱신
  useEffect(() => {
    if (!mapInstanceRef.current || !window.naver) return;
    overlayMarkersRef.current.forEach(m => m.setMap(null));
    overlayMarkersRef.current = [];

    const SCHOOL_COLORS: Record<string, string> = { MIDDLE: '#1a73e8', ELEMENTARY: '#34a853' };
    const SCHOOL_LABELS: Record<string, string> = { MIDDLE: '중', ELEMENTARY: '초' };
    const INFRA_COLORS: Record<string, string> = {
      DEPARTMENT_STORE: '#9c27b0', MART: '#ff9800', HOSPITAL: '#f44336', ETC: '#607d8b',
    };
    const INFRA_LABELS: Record<string, string> = {
      DEPARTMENT_STORE: '백', MART: '마트', HOSPITAL: '병원', ETC: '기타',
    };

    (overlayMarkers ?? []).forEach(om => {
      const isSchool = om.markerType === 'school';
      const bgColor = isSchool
        ? (SCHOOL_COLORS[om.subType ?? ''] ?? '#34a853')
        : (INFRA_COLORS[om.subType ?? ''] ?? '#607d8b');
      const label = isSchool
        ? (SCHOOL_LABELS[om.subType ?? ''] ?? '학')
        : (INFRA_LABELS[om.subType ?? ''] ?? om.name.slice(0, 2));

      const icon = {
        content: `
          <div style="
            background:${bgColor}; color:#fff;
            padding:3px 7px; border-radius:12px;
            font-size:11px; font-weight:700;
            white-space:nowrap; box-shadow:0 1px 4px rgba(0,0,0,0.3);
            border:2px solid #fff; cursor:default;
          ">${label}</div>`,
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
