import React, { useState, useCallback, useEffect } from 'react';
import api from '../../services/api';
import { TravelLog } from '../../types';
import {
  getTravelLogs, createTravelLog, updateTravelLog, deleteTravelLog,
  createTravelPlace, updateTravelPlace, deleteTravelPlace, reorderTravelPlaces,
  uploadTravelPlacePhotos, deleteTravelPlacePhoto, generateTravelDraft,
} from '../../services/api';
import { compressImages } from '../../shared/imageUtils';

// 통합 장소 검색 결과 타입 (네이버 장소명 + 카카오 주소 검색 합산)
interface SearchPlaceItem {
  source: 'naver' | 'kakao_addr';
  title: string;
  address: string;
  roadAddress: string;
  lat: number | null;
  lng: number | null;
}

// 지도 전달용 방문지 정보
export interface TravelMapPlace {
  id: number;
  placeName: string;
  lat: number;
  lng: number;
  displayOrder: number;
}

interface Props {
  onClose: () => void;
  isMobile?: boolean;
  /** 지도에 표시할 방문지 목록 변경 콜백 — 빈 배열이면 지도 마커 제거 */
  onMapPlacesChange?: (places: TravelMapPlace[]) => void;
}

// HTML 태그 제거 (네이버 검색 결과 title에 <b> 태그 포함)
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');

const TravelLogPanel: React.FC<Props> = ({ onClose, isMobile, onMapPlacesChange }) => {
  const [logs, setLogs] = useState<TravelLog[]>([]);
  const [loading, setLoading] = useState(false);

  // 카드 펼침/닫힘
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [expandedPlaceIds, setExpandedPlaceIds] = useState<Set<number>>(new Set());

  // 여행 생성 폼
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newWeather, setNewWeather] = useState('');
  const [newTransport, setNewTransport] = useState('');
  const [creating, setCreating] = useState(false);

  // 여행 수정
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editWeather, setEditWeather] = useState('');
  const [editTransport, setEditTransport] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // 메모 인라인 편집
  const [editingMemoId, setEditingMemoId] = useState<number | null>(null);
  const [memoText, setMemoText] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);

  // 방문지 추가 폼 (어느 여행에 추가 중인지)
  const [addingPlaceLogId, setAddingPlaceLogId] = useState<number | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<SearchPlaceItem[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SearchPlaceItem | null>(null);
  const [placeDate, setPlaceDate] = useState('');
  const [placeNote, setPlaceNote] = useState('');
  const [placeAdding, setPlaceAdding] = useState(false);

  // 방문지 메모 인라인 편집
  const [editingPlaceMemoId, setEditingPlaceMemoId] = useState<number | null>(null);
  const [placeMemoText, setPlaceMemoText] = useState('');
  const [placeMemoSaving, setPlaceMemoSaving] = useState(false);

  // 순위 변경 저장 중 상태 (logId → boolean)
  const [reorderSaving, setReorderSaving] = useState<Record<number, boolean>>({});

  // 사진 업로드 중 상태 (placeId → boolean)
  const [photoUploading, setPhotoUploading] = useState<Record<number, boolean>>({});

  // 지도에 표시 중인 여행 id
  const [activeMapLogId, setActiveMapLogId] = useState<number | null>(null);

  // AI 초안 관련 상태
  const [draftLoading, setDraftLoading] = useState<Record<number, boolean>>({});
  const [draftText, setDraftText] = useState<Record<number, string>>({});
  const [draftSaving, setDraftSaving] = useState<Record<number, boolean>>({});
  const [showDraftIds, setShowDraftIds] = useState<Set<number>>(new Set());

  // 삭제 확인 상태
  const [deleteConfirmLogId, setDeleteConfirmLogId] = useState<number | null>(null);
  const [deletePlaceConfirmId, setDeletePlaceConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTravelLogs();
      setLogs(data);
      // 저장된 AI 초안 복원
      const drafts: Record<number, string> = {};
      data.forEach(l => { if (l.aiDraft) drafts[l.id] = l.aiDraft; });
      setDraftText(prev => ({ ...drafts, ...prev }));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // activeMapLogId 변경 시 지도 방문지 마커 갱신
  useEffect(() => {
    if (!activeMapLogId) { onMapPlacesChange?.([]); return; }
    const log = logs.find(l => l.id === activeMapLogId);
    if (!log) { onMapPlacesChange?.([]); return; }
    const places = log.places
      .filter(p => p.latitude != null && p.longitude != null)
      .map(p => ({ id: p.id, placeName: p.placeName, lat: p.latitude!, lng: p.longitude!, displayOrder: p.displayOrder }));
    onMapPlacesChange?.(places);
  }, [activeMapLogId, logs, onMapPlacesChange]);

  // ── 여행일지 CRUD ─────────────────────────────────────────

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const log = await createTravelLog({ title: newTitle.trim(), travelDate: newDate || undefined, endDate: newEndDate || undefined, weather: newWeather || undefined, transportMode: newTransport || undefined });
      setLogs(prev => [...prev, log]);
      setShowCreate(false);
      setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewWeather(''); setNewTransport('');
      setExpandedIds(prev => new Set(Array.from(prev).concat(log.id)));
    } catch { alert('여행 생성에 실패했습니다. 백엔드 API를 확인해주세요.'); }
    setCreating(false);
  };

  const handleEditSave = async (logId: number) => {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    try {
      const updated = await updateTravelLog(logId, { title: editTitle.trim(), travelDate: editDate || undefined, endDate: editEndDate || undefined, weather: editWeather || undefined, transportMode: editTransport || undefined });
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, title: updated.title, travelDate: updated.travelDate, endDate: updated.endDate, weather: updated.weather, transportMode: updated.transportMode } : l));
      setEditingLogId(null);
    } catch { alert('수정에 실패했습니다.'); }
    setEditSaving(false);
  };

  const handleDeleteLog = async (logId: number) => {
    try {
      await deleteTravelLog(logId);
      setLogs(prev => prev.filter(l => l.id !== logId));
      if (activeMapLogId === logId) setActiveMapLogId(null);
      setDeleteConfirmLogId(null);
    } catch { alert('삭제에 실패했습니다.'); }
  };

  const handleMemoSave = async (logId: number) => {
    setMemoSaving(true);
    try {
      await updateTravelLog(logId, { memo: memoText });
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, memo: memoText } : l));
      setEditingMemoId(null);
    } catch { alert('저장 실패'); }
    setMemoSaving(false);
  };

  // ── 방문지 CRUD ───────────────────────────────────────────

  const handlePlaceSearch = async () => {
    if (!placeQuery.trim()) return;
    setPlaceSearching(true);
    setPlaceResults([]);
    setSelectedPlace(null);
    try {
      // 통합 검색 — 네이버(장소명) + 카카오(주소) 병합 결과
      const { data } = await (api as any).get('/api/search/place', { params: { query: placeQuery.trim() } }) as { data: { items: SearchPlaceItem[] } };
      const items: SearchPlaceItem[] = data.items ?? [];
      const q = placeQuery.trim().toLowerCase();
      // 정확히 일치하거나 검색어로 시작하는 짧은 이름을 상위로
      items.sort((a, b) => {
        const aName = a.title.toLowerCase();
        const bName = b.title.toLowerCase();
        const aExact = aName === q ? 0 : aName.startsWith(q) && aName.length - q.length < 6 ? 1 : 2;
        const bExact = bName === q ? 0 : bName.startsWith(q) && bName.length - q.length < 6 ? 1 : 2;
        return aExact - bExact;
      });
      setPlaceResults(items);
    } catch { /* ignore */ }
    setPlaceSearching(false);
  };

  const handleAddPlace = async (logId: number) => {
    if (!selectedPlace) { alert('장소를 검색 후 선택해주세요.'); return; }
    setPlaceAdding(true);
    const lat = selectedPlace.lat ?? 0;
    const lng = selectedPlace.lng ?? 0;
    const log = logs.find(l => l.id === logId)!;
    try {
      const place = await createTravelPlace(logId, {
        placeName: selectedPlace.title,
        latitude: lat,
        longitude: lng,
        address: selectedPlace.roadAddress || selectedPlace.address,
        visitDate: placeDate || undefined,
        memo: placeNote || undefined,
        displayOrder: log.places.length + 1,
      });
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, places: [...l.places, place] } : l));
      // 폼 초기화
      setAddingPlaceLogId(null);
      setPlaceQuery(''); setPlaceResults([]); setSelectedPlace(null);
      setPlaceDate(''); setPlaceNote('');
    } catch { alert('방문지 추가 실패'); }
    setPlaceAdding(false);
  };

  const handleDeletePlace = async (logId: number, placeId: number) => {
    try {
      await deleteTravelPlace(logId, placeId);
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, places: l.places.filter(p => p.id !== placeId) } : l));
      setDeletePlaceConfirmId(null);
    } catch { alert('삭제 실패'); }
  };

  // ▲▼ 순서 변경 — 낙관적 UI 업데이트 후 API 호출
  const handleMovePlace = async (logId: number, placeId: number, dir: 'up' | 'down') => {
    const log = logs.find(l => l.id === logId)!;
    const idx = log.places.findIndex(p => p.id === placeId);
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= log.places.length) return;

    const newPlaces = [...log.places];
    [newPlaces[idx], newPlaces[targetIdx]] = [newPlaces[targetIdx], newPlaces[idx]];
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, places: newPlaces } : l));
    setReorderSaving(prev => ({ ...prev, [logId]: true }));
    try {
      const updated = await reorderTravelPlaces(logId, newPlaces.map(p => p.id));
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, places: updated.places } : l));
    } catch { alert('순서 저장 실패'); await load(); }
    setReorderSaving(prev => ({ ...prev, [logId]: false }));
  };

  const handlePlaceMemoSave = async (logId: number, placeId: number) => {
    setPlaceMemoSaving(true);
    try {
      const updated = await updateTravelPlace(logId, placeId, { memo: placeMemoText });
      setLogs(prev => prev.map(l => l.id === logId ? {
        ...l, places: l.places.map(p => p.id === placeId ? { ...p, memo: updated.memo } : p)
      } : l));
      setEditingPlaceMemoId(null);
    } catch { alert('저장 실패'); }
    setPlaceMemoSaving(false);
  };

  // ── 사진 ──────────────────────────────────────────────────

  const handlePhotoUpload = async (logId: number, placeId: number, files: File[]) => {
    setPhotoUploading(prev => ({ ...prev, [placeId]: true }));
    try {
      const compressed = await compressImages(files);
      const photos = await uploadTravelPlacePhotos(logId, placeId, compressed);
      setLogs(prev => prev.map(l => l.id === logId ? {
        ...l, places: l.places.map(p => p.id === placeId ? { ...p, photos: [...p.photos, ...photos] } : p)
      } : l));
    } catch { alert('사진 업로드 실패'); }
    setPhotoUploading(prev => ({ ...prev, [placeId]: false }));
  };

  const handlePhotoDelete = async (logId: number, placeId: number, photoId: number) => {
    if (!window.confirm('사진을 삭제할까요?')) return;
    try {
      await deleteTravelPlacePhoto(logId, placeId, photoId);
      setLogs(prev => prev.map(l => l.id === logId ? {
        ...l, places: l.places.map(p => p.id === placeId ? { ...p, photos: p.photos.filter(ph => ph.id !== photoId) } : p)
      } : l));
    } catch { alert('사진 삭제 실패'); }
  };

  // ── AI 초안 ───────────────────────────────────────────────

  const handleGenerateDraft = async (logId: number) => {
    setDraftLoading(prev => ({ ...prev, [logId]: true }));
    try {
      const content = await generateTravelDraft(logId);
      setDraftText(prev => ({ ...prev, [logId]: content }));
      setShowDraftIds(prev => new Set(Array.from(prev).concat(logId)));
    } catch { alert('AI 초안 생성 실패. 방문지가 1개 이상 있어야 합니다.'); }
    setDraftLoading(prev => ({ ...prev, [logId]: false }));
  };

  const handleSaveDraft = async (logId: number) => {
    setDraftSaving(prev => ({ ...prev, [logId]: true }));
    try {
      await updateTravelLog(logId, { aiDraft: draftText[logId] ?? '' });
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, aiDraft: draftText[logId] } : l));
    } catch { alert('저장 실패'); }
    setDraftSaving(prev => ({ ...prev, [logId]: false }));
  };

  // ── 렌더링 ────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = {
    width: isMobile ? '100%' : '380px',
    height: '100%',
    background: '#fff',
    borderLeft: isMobile ? 'none' : '1px solid #e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flexShrink: 0,
  };

  const btnBase: React.CSSProperties = { border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 };

  return (
    <div style={panelStyle}>
      {/* 헤더 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#f0f8fd' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c' }}>🗺 여행일지</span>
        <button onClick={onClose} style={{ ...btnBase, background: 'none', fontSize: '18px', color: '#5f6368', padding: '0 4px' }}>×</button>
      </div>

      {/* 콘텐츠 스크롤 영역 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>

        {/* 새 여행 추가 버튼/폼 */}
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            style={{ ...btnBase, width: '100%', padding: '9px', fontSize: '13px', background: '#f0f8fd', border: '1px dashed #89CFF0', color: '#2a6090', marginBottom: '12px' }}
          >
            + 새 여행 추가
          </button>
        ) : (
          <div style={{ padding: '12px', border: '1px solid #89CFF0', borderRadius: '10px', marginBottom: '12px', background: '#f0f8fd' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#2a6090', marginBottom: '8px' }}>새 여행 만들기</div>
            <input
              value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder="여행 제목 *"
              style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '6px', marginBottom: '6px', boxSizing: 'border-box' }}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', color: '#9e9e9e', marginBottom: '2px' }}>시작일</div>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: '100%', padding: '5px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', color: '#9e9e9e', marginBottom: '2px' }}>종료일</div>
                <input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} style={{ width: '100%', padding: '5px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                {['☀️', '🌤️', '⛈️', '🌨️'].map(w => (
                  <button key={w} onClick={() => setNewWeather(prev => prev === w ? '' : w)}
                    style={{ ...btnBase, fontSize: '18px', padding: '3px 5px', background: newWeather === w ? '#e8f4fd' : '#fff', border: `1px solid ${newWeather === w ? '#89CFF0' : '#dadce0'}`, borderRadius: '6px' }}>
                    {w}
                  </button>
                ))}
              </div>
              <input value={newTransport} onChange={e => setNewTransport(e.target.value)} placeholder="🚗 이동수단" style={{ flex: 1, padding: '5px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={handleCreate} disabled={creating || !newTitle.trim()} style={{ ...btnBase, flex: 1, padding: '8px', fontSize: '13px', background: newTitle.trim() ? '#89CFF0' : '#f1f3f4', color: newTitle.trim() ? '#1a3a5c' : '#9e9e9e', cursor: newTitle.trim() ? 'pointer' : 'not-allowed' }}>
                {creating ? '생성 중...' : '추가'}
              </button>
              <button onClick={() => { setShowCreate(false); setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewWeather(''); setNewTransport(''); }} style={{ ...btnBase, padding: '8px 16px', fontSize: '13px', background: '#f1f3f4', color: '#5f6368' }}>취소</button>
            </div>
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', color: '#9e9e9e', padding: '20px', fontSize: '13px' }}>로딩 중...</div>}

        {/* 여행일지 목록 */}
        {logs.map(log => {
          const isExpanded = expandedIds.has(log.id);
          const isMapActive = activeMapLogId === log.id;

          return (
            <div key={log.id} style={{ border: '1px solid #e0e0e0', borderRadius: '10px', marginBottom: '10px', overflow: 'hidden' }}>

              {/* 카드 헤더 */}
              <div
                onClick={() => setExpandedIds(prev => {
                  const next = new Set(prev);
                  next.has(log.id) ? next.delete(log.id) : next.add(log.id);
                  return next;
                })}
                style={{ padding: '11px 14px', background: isExpanded ? '#f0f8fd' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9e9e9e', marginTop: '2px' }}>
                    {log.travelDate
                      ? `${log.travelDate}${log.endDate ? ` ~ ${log.endDate}` : ''}`
                      : '날짜 미설정'}
                    <span style={{ marginLeft: '8px' }}>📍 {log.places.length}개</span>
                    {log.weather && <span style={{ marginLeft: '6px' }}>🌤 {log.weather}</span>}
                    {log.transportMode && <span style={{ marginLeft: '6px' }}>🚗 {log.transportMode}</span>}
                    {log.aiDraft && <span style={{ marginLeft: '6px', color: '#FFD97D' }}>✨</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { setEditingLogId(log.id); setEditTitle(log.title); setEditDate(log.travelDate ?? ''); setEditEndDate(log.endDate ?? ''); setEditWeather(log.weather ?? ''); setEditTransport(log.transportMode ?? ''); }}
                    style={{ ...btnBase, padding: '3px 8px', fontSize: '11px', border: '1px solid #89CFF0', background: '#fff', color: '#2a6090', fontWeight: 500 }}
                  >✏</button>
                  {deleteConfirmLogId === log.id ? (
                    <>
                      <button onClick={() => handleDeleteLog(log.id)} style={{ ...btnBase, padding: '3px 7px', fontSize: '11px', background: '#E06060', color: '#fff' }}>확인</button>
                      <button onClick={() => setDeleteConfirmLogId(null)} style={{ ...btnBase, padding: '3px 7px', fontSize: '11px', background: '#f1f3f4', color: '#5f6368', fontWeight: 500 }}>취소</button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirmLogId(log.id)} style={{ background: 'none', border: 'none', fontSize: '16px', color: '#bdbdbd', cursor: 'pointer', padding: '2px 4px' }}>×</button>
                  )}
                  <span style={{ fontSize: '12px', color: '#bdbdbd', marginLeft: '2px' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* 수정 폼 */}
              {editingLogId === log.id && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0', background: '#f8f9fa' }} onClick={e => e.stopPropagation()}>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="제목 *" style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '6px', marginBottom: '6px', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ flex: 1, padding: '5px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px' }} />
                    <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} style={{ flex: 1, padding: '5px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['☀️', '🌤️', '⛈️', '🌨️'].map(w => (
                        <button key={w} onClick={() => setEditWeather(prev => prev === w ? '' : w)}
                          style={{ ...btnBase, fontSize: '18px', padding: '3px 5px', background: editWeather === w ? '#e8f4fd' : '#fff', border: `1px solid ${editWeather === w ? '#89CFF0' : '#dadce0'}`, borderRadius: '6px' }}>
                          {w}
                        </button>
                      ))}
                    </div>
                    <input value={editTransport} onChange={e => setEditTransport(e.target.value)} placeholder="🚗 이동수단" style={{ flex: 1, padding: '5px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleEditSave(log.id)} disabled={editSaving} style={{ ...btnBase, flex: 1, padding: '6px', fontSize: '12px', background: '#89CFF0', color: '#1a3a5c' }}>저장</button>
                    <button onClick={() => setEditingLogId(null)} style={{ ...btnBase, padding: '6px 12px', fontSize: '12px', background: '#f1f3f4', color: '#5f6368', fontWeight: 500 }}>취소</button>
                  </div>
                </div>
              )}

              {/* 펼친 상태 */}
              {isExpanded && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0' }}>

                  {/* 버튼 바 */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setActiveMapLogId(isMapActive ? null : log.id)}
                      style={{ ...btnBase, padding: '5px 10px', fontSize: '11px', border: '1px solid', borderColor: isMapActive ? '#2a6090' : '#dadce0', background: isMapActive ? '#D4EFFC' : '#fff', color: isMapActive ? '#2a6090' : '#5f6368' }}
                    >
                      🗺 {isMapActive ? '지도 ON' : '지도 보기'}
                    </button>
                    <button
                      onClick={() => {
                        setShowDraftIds(prev => {
                          const next = new Set(prev);
                          next.has(log.id) ? next.delete(log.id) : next.add(log.id);
                          return next;
                        });
                      }}
                      style={{ ...btnBase, padding: '5px 10px', fontSize: '11px', border: '1px solid #dadce0', background: showDraftIds.has(log.id) ? '#fffef0' : '#fff', color: '#6b4400' }}
                    >
                      ✨ AI 초안{showDraftIds.has(log.id) ? ' ▲' : ' ▼'}
                    </button>
                  </div>

                  {/* 여행 메모 */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#9e9e9e', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>메모</span>
                      {editingMemoId !== log.id && (
                        <button onClick={() => { setEditingMemoId(log.id); setMemoText(log.memo ?? ''); }} style={{ fontSize: '11px', background: 'none', border: 'none', color: '#89CFF0', cursor: 'pointer', padding: 0 }}>✏</button>
                      )}
                    </div>
                    {editingMemoId === log.id ? (
                      <>
                        <textarea value={memoText} onChange={e => setMemoText(e.target.value)} rows={3} style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', resize: 'none', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                          <button onClick={() => handleMemoSave(log.id)} disabled={memoSaving} style={{ ...btnBase, flex: 1, padding: '5px', fontSize: '12px', background: '#89CFF0', color: '#1a3a5c' }}>저장</button>
                          <button onClick={() => setEditingMemoId(null)} style={{ ...btnBase, padding: '5px 10px', fontSize: '12px', background: '#f1f3f4', color: '#5f6368', fontWeight: 500 }}>취소</button>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: '12px', color: log.memo ? '#344054' : '#bdbdbd', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{log.memo || '메모 없음'}</div>
                    )}
                  </div>

                  {/* 방문지 목록 */}
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#9e9e9e', marginBottom: '6px' }}>방문지 목록</div>
                  {log.places.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#bdbdbd', textAlign: 'center', padding: '8px 0' }}>등록된 방문지가 없습니다.</div>
                  )}
                  {log.places.map((place, idx) => {
                    const isPlaceExpanded = expandedPlaceIds.has(place.id);
                    return (
                      <div key={place.id} style={{ border: '1px solid #f0f0f0', borderRadius: '8px', marginBottom: '6px', overflow: 'hidden' }}>
                        {/* 방문지 행 */}
                        <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '6px', background: isPlaceExpanded ? '#f8f9fa' : '#fff' }}>
                          {/* 순서 번호 */}
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#89CFF0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#1a3a5c', flexShrink: 0 }}>
                            {idx + 1}
                          </div>
                          {/* ▲▼ 순서 변경 */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                            <button
                              onClick={() => handleMovePlace(log.id, place.id, 'up')}
                              disabled={idx === 0 || !!reorderSaving[log.id]}
                              style={{ width: '16px', height: '13px', padding: 0, fontSize: '8px', border: 'none', borderRadius: '2px', background: idx === 0 ? '#f1f3f4' : '#e8f4fd', color: idx === 0 ? '#bdbdbd' : '#2a6090', cursor: idx === 0 ? 'default' : 'pointer' }}
                            >▲</button>
                            <button
                              onClick={() => handleMovePlace(log.id, place.id, 'down')}
                              disabled={idx === log.places.length - 1 || !!reorderSaving[log.id]}
                              style={{ width: '16px', height: '13px', padding: 0, fontSize: '8px', border: 'none', borderRadius: '2px', background: idx === log.places.length - 1 ? '#f1f3f4' : '#e8f4fd', color: idx === log.places.length - 1 ? '#bdbdbd' : '#2a6090', cursor: idx === log.places.length - 1 ? 'default' : 'pointer' }}
                            >▼</button>
                          </div>
                          {/* 이름 + 날짜 */}
                          <div
                            style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                            onClick={() => setExpandedPlaceIds(prev => {
                              const next = new Set(prev);
                              next.has(place.id) ? next.delete(place.id) : next.add(place.id);
                              return next;
                            })}
                          >
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#344054', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.placeName}</div>
                            {place.visitDate && <div style={{ fontSize: '10px', color: '#9e9e9e' }}>{place.visitDate}</div>}
                          </div>
                          {/* 아이콘 표시 */}
                          <div style={{ display: 'flex', gap: '3px', flexShrink: 0, fontSize: '11px', color: '#9e9e9e' }}>
                            {place.memo && <span title="메모 있음">📝</span>}
                            {place.photos.length > 0 && <span title={`사진 ${place.photos.length}장`}>📷{place.photos.length}</span>}
                          </div>
                          {/* 삭제 */}
                          {deletePlaceConfirmId === place.id ? (
                            <>
                              <button onClick={() => handleDeletePlace(log.id, place.id)} style={{ ...btnBase, padding: '2px 6px', fontSize: '10px', background: '#E06060', color: '#fff' }}>삭제</button>
                              <button onClick={() => setDeletePlaceConfirmId(null)} style={{ ...btnBase, padding: '2px 6px', fontSize: '10px', background: '#f1f3f4', color: '#5f6368', fontWeight: 500 }}>취소</button>
                            </>
                          ) : (
                            <button onClick={() => setDeletePlaceConfirmId(place.id)} style={{ background: 'none', border: 'none', fontSize: '14px', color: '#bdbdbd', cursor: 'pointer', padding: '0 3px' }}>×</button>
                          )}
                        </div>

                        {/* 방문지 상세 (펼친 상태) */}
                        {isPlaceExpanded && (
                          <div style={{ padding: '10px 12px', borderTop: '1px solid #f5f5f5', background: '#fafafa' }}>
                            {place.address && (
                              <div style={{ fontSize: '11px', color: '#9e9e9e', marginBottom: '8px' }}>📍 {place.address}</div>
                            )}

                            {/* 방문지 메모 */}
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9e9e9e', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>메모</span>
                                {editingPlaceMemoId !== place.id && (
                                  <button onClick={() => { setEditingPlaceMemoId(place.id); setPlaceMemoText(place.memo ?? ''); }} style={{ fontSize: '11px', background: 'none', border: 'none', color: '#89CFF0', cursor: 'pointer', padding: 0 }}>✏</button>
                                )}
                              </div>
                              {editingPlaceMemoId === place.id ? (
                                <>
                                  <textarea value={placeMemoText} onChange={e => setPlaceMemoText(e.target.value)} rows={3} style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', resize: 'none', boxSizing: 'border-box' }} />
                                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                    <button onClick={() => handlePlaceMemoSave(log.id, place.id)} disabled={placeMemoSaving} style={{ ...btnBase, flex: 1, padding: '5px', fontSize: '12px', background: '#89CFF0', color: '#1a3a5c' }}>저장</button>
                                    <button onClick={() => setEditingPlaceMemoId(null)} style={{ ...btnBase, padding: '5px 10px', fontSize: '12px', background: '#f1f3f4', color: '#5f6368', fontWeight: 500 }}>취소</button>
                                  </div>
                                </>
                              ) : (
                                <div style={{ fontSize: '12px', color: place.memo ? '#344054' : '#bdbdbd', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{place.memo || '메모 없음'}</div>
                              )}
                            </div>

                            {/* 사진 */}
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9e9e9e', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>사진 ({place.photos.length})</span>
                                <label style={{ fontSize: '11px', padding: '3px 8px', border: '1px solid #89CFF0', borderRadius: '5px', color: '#2a6090', cursor: 'pointer', background: '#fff' }}>
                                  {photoUploading[place.id] ? '업로드 중...' : '+ 사진 추가'}
                                  <input
                                    type="file" multiple accept="image/*" style={{ display: 'none' }}
                                    disabled={!!photoUploading[place.id]}
                                    onChange={e => {
                                      const files = Array.from(e.target.files ?? []);
                                      if (files.length > 0) handlePhotoUpload(log.id, place.id, files);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              </div>
                              {place.photos.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {place.photos.map(photo => (
                                    <div key={photo.id} style={{ position: 'relative', width: '72px', height: '72px' }}>
                                      <img
                                        src={photo.url} alt=""
                                        style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }}
                                        onClick={() => window.open(photo.url, '_blank')}
                                      />
                                      <button
                                        onClick={() => handlePhotoDelete(log.id, place.id, photo.id)}
                                        style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                      >×</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* + 방문지 추가 */}
                  {addingPlaceLogId === log.id ? (
                    <div style={{ border: '1px solid #89CFF0', borderRadius: '8px', padding: '10px', marginBottom: '8px', background: '#f0f8fd' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#2a6090', marginBottom: '8px' }}>방문지 추가 (네이버 검색)</div>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                        <input
                          value={placeQuery} onChange={e => setPlaceQuery(e.target.value)}
                          placeholder="장소명 검색..."
                          style={{ flex: 1, padding: '6px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px' }}
                          onKeyDown={e => { if (e.key === 'Enter') handlePlaceSearch(); }}
                        />
                        <button onClick={handlePlaceSearch} disabled={placeSearching} style={{ ...btnBase, padding: '6px 10px', fontSize: '12px', background: '#89CFF0', color: '#1a3a5c' }}>
                          {placeSearching ? '...' : '검색'}
                        </button>
                      </div>
                      {/* 검색 결과 */}
                      {placeResults.length > 0 && (
                        <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: '6px', marginBottom: '6px', background: '#fff' }}>
                          {placeResults.map((item, i) => (
                            <div
                              key={i}
                              onClick={() => setSelectedPlace(item)}
                              style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', background: selectedPlace === item ? '#D4EFFC' : 'transparent' }}
                            >
                              <div style={{ fontSize: '12px', fontWeight: 600, color: '#344054' }}>{item.title}</div>
                              <div style={{ fontSize: '10px', color: '#9e9e9e' }}>{item.roadAddress || item.address}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 선택된 장소 표시 */}
                      {selectedPlace && (
                        <div style={{ padding: '5px 8px', background: '#D4EFFC', borderRadius: '5px', marginBottom: '6px', fontSize: '12px', color: '#1a3a5c' }}>
                          ✓ {selectedPlace.title}
                        </div>
                      )}
                      <input type="date" value={placeDate} onChange={e => setPlaceDate(e.target.value)} style={{ width: '100%', padding: '5px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', marginBottom: '5px', boxSizing: 'border-box' }} />
                      <textarea value={placeNote} onChange={e => setPlaceNote(e.target.value)} rows={2} placeholder="방문 메모 (선택)" style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', resize: 'none', marginBottom: '6px', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleAddPlace(log.id)}
                          disabled={placeAdding || !selectedPlace}
                          style={{ ...btnBase, flex: 1, padding: '7px', fontSize: '12px', background: selectedPlace ? '#89CFF0' : '#f1f3f4', color: selectedPlace ? '#1a3a5c' : '#9e9e9e', cursor: selectedPlace ? 'pointer' : 'not-allowed' }}
                        >
                          {placeAdding ? '추가 중...' : '추가'}
                        </button>
                        <button
                          onClick={() => { setAddingPlaceLogId(null); setPlaceQuery(''); setPlaceResults([]); setSelectedPlace(null); setPlaceDate(''); setPlaceNote(''); }}
                          style={{ ...btnBase, padding: '7px 12px', fontSize: '12px', background: '#f1f3f4', color: '#5f6368', fontWeight: 500 }}
                        >취소</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingPlaceLogId(log.id)}
                      style={{ width: '100%', padding: '7px', fontSize: '12px', background: 'none', border: '1px dashed #dadce0', borderRadius: '6px', color: '#9e9e9e', cursor: 'pointer', marginBottom: '8px' }}
                    >
                      + 방문지 추가
                    </button>
                  )}

                  {/* AI 블로그 초안 섹션 */}
                  {showDraftIds.has(log.id) && (
                    <div style={{ border: '1px solid #FFD97D', borderRadius: '8px', padding: '10px', background: '#fffef0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b4400', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>✨ AI 블로그 초안</span>
                        <button
                          onClick={() => handleGenerateDraft(log.id)}
                          disabled={!!draftLoading[log.id]}
                          style={{ ...btnBase, padding: '4px 10px', fontSize: '11px', background: '#FFD97D', color: '#6b4400' }}
                        >
                          {draftLoading[log.id] ? '생성 중...' : '🤖 초안 생성'}
                        </button>
                      </div>
                      <textarea
                        value={draftText[log.id] ?? ''}
                        onChange={e => setDraftText(prev => ({ ...prev, [log.id]: e.target.value }))}
                        rows={14}
                        placeholder="'초안 생성' 버튼을 눌러 AI 블로그 초안을 생성하세요.&#10;생성 후 직접 편집하고 저장할 수 있습니다."
                        style={{ width: '100%', padding: '8px', fontSize: '12px', border: '1px solid #FFD97D', borderRadius: '6px', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <button
                          onClick={() => handleSaveDraft(log.id)}
                          disabled={!!draftSaving[log.id] || !draftText[log.id]}
                          style={{ ...btnBase, flex: 1, padding: '7px', fontSize: '12px', background: draftText[log.id] ? '#89CFF0' : '#f1f3f4', color: draftText[log.id] ? '#1a3a5c' : '#9e9e9e', cursor: draftText[log.id] ? 'pointer' : 'not-allowed' }}
                        >
                          {draftSaving[log.id] ? '저장 중...' : '💾 초안 저장'}
                        </button>
                        <button
                          onClick={() => {
                            const text = draftText[log.id] ?? '';
                            if (text) navigator.clipboard?.writeText(text).then(() => alert('클립보드에 복사되었습니다!'));
                          }}
                          style={{ ...btnBase, padding: '7px 12px', fontSize: '12px', background: '#f8f9fa', color: '#5f6368', border: '1px solid #dadce0', fontWeight: 500 }}
                        >
                          📋 복사
                        </button>
                      </div>
                      <div style={{ fontSize: '10px', color: '#9e9e9e', marginTop: '6px', lineHeight: '1.4' }}>
                        💡 네이버 블로그: 복사 후 붙여넣기 &nbsp;|&nbsp; 티스토리: 저장 후 편집
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          );
        })}

        {!loading && logs.length === 0 && (
          <div style={{ textAlign: 'center', color: '#bdbdbd', padding: '40px 20px', fontSize: '13px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🗺</div>
            <div>여행일지가 없습니다.</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>위 버튼으로 첫 여행을 추가하세요!</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TravelLogPanel;
