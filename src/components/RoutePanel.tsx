import React from 'react';
import { MapRoute } from '../types';

const ROUTE_COLORS = ['#e53935', '#43a047', '#8e24aa', '#fb8c00', '#039be5', '#6d4c41', '#00acc1', '#546e7a'];

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
  isMobile?: boolean;
}

const RoutePanel: React.FC<RoutePanelProps> = ({
  routes, activeRouteIds, isDrawingRoute, editingRouteId,
  onToggleActive, onStartDrawing, onStartEdit, onDelete, onClose,
  isMobile = false,
}) => {
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
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#80868b', padding: 0 }}
        >×</button>
      </div>

      {/* 신규 경로 그리기 버튼 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <button
          onClick={onStartDrawing}
          disabled={isDrawingRoute}
          style={{
            width: '100%', padding: '10px', fontSize: '13px', fontWeight: 600,
            border: '1px dashed', borderColor: isDrawingRoute ? '#9e9e9e' : '#1a73e8',
            borderRadius: '8px', cursor: isDrawingRoute ? 'not-allowed' : 'pointer',
            backgroundColor: isDrawingRoute && editingRouteId === null ? '#f5f5f5' : '#e8f0fe',
            color: isDrawingRoute && editingRouteId === null ? '#9e9e9e' : '#1a73e8',
          }}
        >
          {isDrawingRoute && editingRouteId === null ? '그리는 중... (지도를 클릭하세요)' : '+ 신규 경로 그리기'}
        </button>
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
                  </div>

                  {/* 삭제 버튼 */}
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(route.id); }}
                    style={{
                      border: 'none', background: 'none', cursor: 'pointer',
                      fontSize: '16px', color: '#dadce0', flexShrink: 0, padding: 0, lineHeight: 1,
                    }}
                    title="경로 삭제"
                  >×</button>
                </div>

                {/* 수정 버튼 — 활성화된 경로에서만 표시 */}
                {isActive && !isDrawingRoute && (
                  <div style={{ padding: '0 16px 10px', display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => onStartEdit(route)}
                      style={{
                        padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid #1a73e8', borderRadius: '6px',
                        backgroundColor: '#e8f0fe', color: '#1a73e8', cursor: 'pointer',
                      }}
                    >✏ 경로 수정</button>
                  </div>
                )}

                {/* 수정 중 상태 표시 */}
                {isEditing && (
                  <div style={{
                    padding: '6px 16px 10px',
                    fontSize: '12px', color: '#0b8043', fontWeight: 600,
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
