import React, { useMemo, useRef } from 'react';
import { MapRoute } from '../../types';
import { haversineMeters } from './utils/geo';

function calcRouteStats(points: { lat: number; lng: number }[]): { km: string; minutes: number } {
  if (points.length < 2) return { km: '0.0', minutes: 0 };
  let totalM = 0;
  for (let i = 0; i < points.length - 1; i++) totalM += haversineMeters(points[i], points[i + 1]);
  return {
    km: (Math.round(totalM / 100) / 10).toFixed(1),
    minutes: Math.round(totalM * 60 / 4000),
  };
}

const ROUTE_COLORS = ['#e53935', '#43a047', '#BA8BD8', '#fb8c00', '#039be5', '#6d4c41', '#00acc1', '#546e7a'];

// 경로 포인트를 GPX XML 문자열로 변환 후 .gpx 파일로 다운로드
function downloadGpx(route: MapRoute) {
  const trkpts = route.points
    .map(p => `      <trkpt lat="${p.lat}" lon="${p.lng}" />`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DoTheRich" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${route.name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
  const blob = new Blob([xml], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${route.name}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

interface RoutePanelProps {
  routes: MapRoute[];
  activeRouteIds: Set<number>;
  isDrawingRoute: boolean;
  editingRouteId: number | null;
  onToggleActive: (id: number) => void;
  onStartDrawing: () => void;
  onStartEdit: (route: MapRoute) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
  onImportGpx: (name: string, points: { lat: number; lng: number }[]) => Promise<void>;
  onShowMap?: () => void; // 모바일: 지도 뷰로 전환
  isMobile?: boolean;
}

const RoutePanel: React.FC<RoutePanelProps> = ({
  routes, activeRouteIds, isDrawingRoute, editingRouteId,
  onToggleActive, onStartDrawing, onStartEdit, onDelete, onClose, onImportGpx, onShowMap,
  isMobile = false,
}) => {
  const gpxInputRef = useRef<HTMLInputElement>(null);

  // GPX 파일 선택 시 파싱 후 onImportGpx 호출
  const handleGpxFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'application/xml');

    // 파싱 오류 확인
    if (doc.querySelector('parsererror')) {
      alert('GPX 파일을 읽을 수 없습니다.');
      e.target.value = '';
      return;
    }

    // 경로명: trk > name → 파일명 순으로 fallback
    const nameEl = doc.querySelector('trk > name') ?? doc.querySelector('name');
    const name = nameEl?.textContent?.trim() || file.name.replace(/\.gpx$/i, '');

    // trkpt 우선, 없으면 wpt (웨이포인트) 사용
    const ptEls = Array.from(doc.querySelectorAll('trkpt'));
    const fallbackPts = ptEls.length > 0 ? ptEls : Array.from(doc.querySelectorAll('wpt'));
    const points = fallbackPts
      .map(el => ({ lat: parseFloat(el.getAttribute('lat') ?? ''), lng: parseFloat(el.getAttribute('lon') ?? '') }))
      .filter(p => !isNaN(p.lat) && !isNaN(p.lng));

    if (points.length < 2) {
      alert('GPX 파일에 유효한 좌표가 2개 이상 필요합니다.');
      e.target.value = '';
      return;
    }

    await onImportGpx(name, points);
    e.target.value = ''; // 같은 파일 재업로드 허용
  };

  // 경로별 거리·도보시간 사전 계산 — routes가 바뀔 때만 재계산
  const routeStatsMap = useMemo(() => {
    const map = new Map<number, { km: string; minutes: number }>();
    routes.forEach(route => map.set(route.id, calcRouteStats(route.points)));
    return map;
  }, [routes]);

  return (
    <div style={{
      width: isMobile ? '100%' : '320px',
      height: '100%',
      backgroundColor: '#fff',
      borderLeft: '1px solid #e8eaed',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid #e8eaed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#202124' }}>경로 관리</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 모바일에서만 표시 — 지도 뷰로 전환해 경로 확인 */}
          {isMobile && onShowMap && (
            <button
              onClick={onShowMap}
              style={{
                padding: '4px 10px', fontSize: '12px', fontWeight: 600,
                border: '1px solid #0b8043', borderRadius: '6px',
                backgroundColor: '#e6f4ea', color: '#5AAF84', cursor: 'pointer',
              }}
            >지도 보기</button>
          )}
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#80868b', padding: 0 }}
          >×</button>
        </div>
      </div>

      {/* 신규 경로 그리기 / GPX 불러오기 버튼 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={onStartDrawing}
          disabled={isDrawingRoute}
          style={{
            width: '100%', padding: '10px', fontSize: '13px', fontWeight: 600,
            border: '1px dashed', borderColor: isDrawingRoute ? '#9e9e9e' : '#89CFF0',
            borderRadius: '8px', cursor: isDrawingRoute ? 'not-allowed' : 'pointer',
            backgroundColor: isDrawingRoute && editingRouteId === null ? '#f5f5f5' : '#D4EFFC',
            color: isDrawingRoute && editingRouteId === null ? '#9e9e9e' : '#89CFF0',
          }}
        >
          {isDrawingRoute && editingRouteId === null ? '그리는 중... (지도를 클릭하세요)' : '+ 신규 경로 그리기'}
        </button>
        {/* 숨겨진 파일 입력 — GPX 불러오기 버튼 클릭 시 트리거 */}
        <input
          ref={gpxInputRef}
          type="file"
          accept=".gpx"
          style={{ display: 'none' }}
          onChange={handleGpxFile}
        />
        <button
          onClick={() => gpxInputRef.current?.click()}
          disabled={isDrawingRoute}
          style={{
            width: '100%', padding: '8px', fontSize: '13px', fontWeight: 600,
            border: '1px solid', borderColor: isDrawingRoute ? '#9e9e9e' : '#5AAF84',
            borderRadius: '8px', cursor: isDrawingRoute ? 'not-allowed' : 'pointer',
            backgroundColor: isDrawingRoute ? '#f5f5f5' : '#e6f4ea',
            color: isDrawingRoute ? '#9e9e9e' : '#5AAF84',
          }}
        >↑ GPX 불러오기</button>
      </div>

      {/* 저장된 경로 목록 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {routes.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
            저장된 경로가 없습니다.
          </div>
        ) : (
          routes.map((route, idx) => {
            const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
            const isActive = activeRouteIds.has(route.id);
            const isEditing = editingRouteId === route.id;
            const date = route.createdAt ? route.createdAt.slice(0, 10) : '';
            const stats = routeStatsMap.get(route.id) ?? { km: '0.0', minutes: 0 };

            return (
              <div
                key={route.id}
                style={{
                  borderBottom: '1px solid #f5f5f5',
                  backgroundColor: isActive ? '#f8fffe' : '#fff',
                }}
              >
                {/* 경로 행 — 클릭 시 지도 표시 토글 */}
                <div
                  onClick={() => !isDrawingRoute && onToggleActive(route.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '12px 16px',
                    cursor: isDrawingRoute ? 'default' : 'pointer',
                  }}
                >
                  {/* 색상 점 — 활성화 시 크게 표시 */}
                  <div style={{
                    width: isActive ? '14px' : '10px',
                    height: isActive ? '14px' : '10px',
                    borderRadius: '50%',
                    backgroundColor: color,
                    flexShrink: 0,
                    transition: 'all 0.15s',
                    boxShadow: isActive ? `0 0 0 3px ${color}30` : 'none',
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: isActive ? 700 : 600, color: '#202124',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{route.name}</div>
                    <div style={{ fontSize: '11px', color: '#9e9e9e', marginTop: '2px' }}>
                      {route.points.length}개 점 · {date}
                    </div>
                    <div style={{ fontSize: '11px', color: '#5f6368', marginTop: '2px', fontWeight: 500 }}>
                      {stats.km}km · 약 {stats.minutes}분 (4km/h)
                    </div>
                  </div>

                  {/* 삭제 버튼 */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`"${route.name}" 경로를 삭제하시겠습니까?`)) onDelete(route.id);
                    }}
                    style={{
                      border: 'none', background: 'none', cursor: 'pointer',
                      fontSize: '16px', color: '#dadce0', flexShrink: 0, padding: 0, lineHeight: 1,
                    }}
                    title="경로 삭제"
                  >×</button>
                </div>

                {/* 수정·GPX 버튼 — 활성화된 경로에서만 표시 */}
                {isActive && !isDrawingRoute && (
                  <div style={{ padding: '0 16px 10px', display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => onStartEdit(route)}
                      style={{
                        padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid #1a73e8', borderRadius: '6px',
                        backgroundColor: '#D4EFFC', color: '#4BAAD4', cursor: 'pointer',
                      }}
                    >✏ 경로 수정</button>
                    <button
                      onClick={e => { e.stopPropagation(); downloadGpx(route); }}
                      style={{
                        padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid #0b8043', borderRadius: '6px',
                        backgroundColor: '#e6f4ea', color: '#5AAF84', cursor: 'pointer',
                      }}
                      title="GPX 파일 다운로드"
                    >↓ GPX</button>
                  </div>
                )}

                {/* 수정 중 상태 표시 */}
                {isEditing && (
                  <div style={{
                    padding: '6px 16px 10px',
                    fontSize: '12px', color: '#5AAF84', fontWeight: 600,
                  }}>
                    ✎ 수정 중 — 지도를 클릭해 점을 추가하세요
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RoutePanel;
