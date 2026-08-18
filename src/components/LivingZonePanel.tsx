import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ApartmentComplex, LivingZone, ZoneChecklistResultItem, ChecklistInputType } from '../types';
import {
  getLivingZones, createLivingZone, updateLivingZoneMemo,
  addComplexesToZone, removeComplexFromZone, deleteLivingZone,
  getZoneChecklist, upsertZoneChecklistResult, reorderZoneComplexes,
} from '../services/api';
import { useNumberedTextarea } from '../hooks/useNumberedTextarea';
import ZonePhotoModal from './ZonePhotoModal';

const RATING_LABELS: Record<string, string> = { UPPER: '상', MIDDLE: '중', LOWER: '하' };
const RATING_COLORS: Record<string, { bg: string; color: string }> = {
  UPPER:  { bg: '#F08080', color: '#fff' },
  MIDDLE: { bg: '#FFD97D', color: '#6b4400' },
  LOWER:  { bg: '#89CFF0', color: '#1a3a5c' },
};
const OX_COLORS: Record<string, { bg: string; color: string }> = {
  O: { bg: '#7DC8A0', color: '#1a5030' },
  X: { bg: '#F08080', color: '#fff' },
};

interface Props {
  complexes: ApartmentComplex[];
  onClose: () => void;
  isMobile?: boolean; // 모바일 풀스크린 오버레이 모드
  onStartZoneDrawing?: (zoneId: number) => void; // 구획 그리기 시작 — 지도에서 폴리곤 입력 모드로 전환
  // 생활권 폴리곤 목록 — 지도 오버레이로 표시할 좌표 목록을 상위에 전달 (대장 단지명 포함)
  onZonePolygonsChange?: (polygons: { id: number; name: string; points: { lat: number; lng: number }[]; flagshipComplexName?: string | null }[]) => void;
}

const LivingZonePanel: React.FC<Props> = ({ complexes, onClose, isMobile, onStartZoneDrawing, onZonePolygonsChange }) => {
  const [zones, setZones] = useState<LivingZone[]>([]);
  const [loading, setLoading] = useState(false);

  // 지역구 필터 — '' = 전체
  const [selectedDistrict, setSelectedDistrict] = useState('');

  // 카드 펼침 상태 — 여러 개 동시 펼침 가능
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // 생활권 생성 폼
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDistrict, setNewDistrict] = useState('');
  const [creating, setCreating] = useState(false);

  // 메모 인라인 편집
  const [editingMemoId, setEditingMemoId] = useState<number | null>(null);
  const [memoText, setMemoText] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);

  // 단지 체크박스 패널 — zoneId 단위로 열림, pendingIds는 현재 체크 상태
  const [checkboxZoneId, setCheckboxZoneId] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [checkboxSaving, setCheckboxSaving] = useState(false);

  // 생활권 삭제 확인
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // 사진 모달 — 열린 생활권 id 저장
  const [photoZone, setPhotoZone] = useState<{ id: number; name: string } | null>(null);

  // 순위 변경 저장 중 상태 (zoneId → boolean)
  const [rankingSaving, setRankingSaving] = useState<Record<number, boolean>>({});

  // 생활권별 분위기 체크리스트 (zoneId → items)
  const [zoneChecklists, setZoneChecklists] = useState<Record<number, ZoneChecklistResultItem[]>>({});
  const [checklistLoading, setChecklistLoading] = useState<Record<number, boolean>>({});
  // TEXT 타입 항목 로컬 입력값 ("zoneId-templateId" → text)
  const [zoneLocalTexts, setZoneLocalTexts] = useState<Record<string, string>>({});

  // 메모 자동번호 훅 — 메모 textarea에 적용
  const numberedMemo = useNumberedTextarea(memoText, setMemoText);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLivingZones();
      setZones(data);
      // 폴리곤이 있는 생활권 목록을 지도 오버레이용으로 상위에 전달 (대장 단지명 포함)
      if (onZonePolygonsChange) {
        onZonePolygonsChange(
          data
            .filter(z => z.polygonPoints && z.polygonPoints.length >= 3)
            .map(z => ({ id: z.id, name: z.name, points: z.polygonPoints!, flagshipComplexName: z.flagshipComplexName }))
        );
      }
    } catch {}
    setLoading(false);
  }, [onZonePolygonsChange]);

  useEffect(() => { load(); }, [load]);

  // 기존 생활권에서 지역구 목록 추출 — zones 변경 시에만 재계산
  const districts = useMemo(
    () => Array.from(new Set(zones.map(z => z.district))).sort((a, b) => a.localeCompare(b, 'ko')),
    [zones]
  );

  // 등록된 단지의 region distinct 추출 — complexes 변경 시에만 재계산
  const complexRegions = useMemo(
    () => Array.from(new Set(complexes.map(c => c.region).filter((r): r is string => !!r))).sort((a, b) => a.localeCompare(b, 'ko')),
    [complexes]
  );

  // 필터 적용
  const displayed = selectedDistrict
    ? zones.filter(z => z.district === selectedDistrict)
    : zones;

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(Array.from(prev));
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // 처음 펼칠 때 분위기 체크리스트 로드
        if (!zoneChecklists[id] && !checklistLoading[id]) {
          setChecklistLoading(p => ({ ...p, [id]: true }));
          getZoneChecklist(id)
            .then(items => {
              setZoneChecklists(p => ({ ...p, [id]: items }));
              // TEXT 항목의 기존 memo 값을 로컬 상태에 초기화
              const texts: Record<string, string> = {};
              items.forEach(i => { if (i.memo) texts[`${id}-${i.templateId}`] = i.memo; });
              setZoneLocalTexts(p => ({ ...p, ...texts }));
            })
            .catch(() => {})
            .finally(() => setChecklistLoading(p => ({ ...p, [id]: false })));
        }
      }
      return next;
    });
  };

  const handleZoneRate = async (zoneId: number, templateId: number, rating: string) => {
    const currentItems = zoneChecklists[zoneId] || [];
    const current = currentItems.find(i => i.templateId === templateId)?.rating ?? null;
    const newRating = current === rating ? null : rating;
    try {
      const updated = await upsertZoneChecklistResult(zoneId, templateId, { rating: newRating, memo: null });
      setZoneChecklists(prev => ({
        ...prev,
        [zoneId]: (prev[zoneId] || []).map(i => i.templateId === templateId ? { ...i, rating: updated.rating } : i),
      }));
    } catch {}
  };

  const handleZoneText = async (zoneId: number, templateId: number, text: string) => {
    try {
      const updated = await upsertZoneChecklistResult(zoneId, templateId, { rating: null, memo: text || null });
      setZoneChecklists(prev => ({
        ...prev,
        [zoneId]: (prev[zoneId] || []).map(i => i.templateId === templateId ? { ...i, memo: updated.memo } : i),
      }));
    } catch {}
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newDistrict.trim()) return;
    setCreating(true);
    try {
      const created = await createLivingZone({ district: newDistrict.trim(), name: newName.trim() });
      setZones(prev => [...prev, created]);
      setExpandedIds(prev => new Set([...Array.from(prev), created.id]));
      setNewName('');
      setNewDistrict('');
      setShowCreateForm(false);
    } catch {}
    setCreating(false);
  };

  const handleMemoSave = async (zoneId: number) => {
    setMemoSaving(true);
    try {
      await updateLivingZoneMemo(zoneId, memoText);
      setZones(prev => prev.map(z => z.id === zoneId ? { ...z, memo: memoText } : z));
      setEditingMemoId(null);
    } catch {}
    setMemoSaving(false);
  };

  // 체크박스 패널 열기 — 기존 단지의 complexId로 초기 체크 상태 설정
  const openCheckbox = (zone: LivingZone) => {
    setPendingIds(new Set(zone.complexes.map(c => c.complexId)));
    setCheckboxZoneId(zone.id);
  };

  const togglePending = (complexId: number) => {
    setPendingIds(prev => {
      const next = new Set(Array.from(prev));
      next.has(complexId) ? next.delete(complexId) : next.add(complexId);
      return next;
    });
  };

  // 저장 — 추가는 bulk API 한 번, 제거는 단건 병렬 호출 후 서버 재조회
  const handleSaveComplexes = async (zone: LivingZone) => {
    setCheckboxSaving(true);
    // 기존 단지는 complexId 기준으로 비교 (id는 join 레코드 ID라 단지 식별에 부적합)
    const existingComplexIds = new Set(zone.complexes.map(c => c.complexId));
    const toAdd = Array.from(pendingIds).filter(id => !existingComplexIds.has(id));
    const toRemove = Array.from(existingComplexIds).filter(id => !pendingIds.has(id));
    try {
      const calls: Promise<any>[] = [];
      if (toAdd.length > 0) calls.push(addComplexesToZone(zone.id, toAdd));
      toRemove.forEach(id => calls.push(removeComplexFromZone(zone.id, id)));
      await Promise.all(calls);
      // 서버에서 최신 상태 재조회하여 id/complexId 불일치 방지
      await load();
      setCheckboxZoneId(null);
    } catch {}
    setCheckboxSaving(false);
  };

  // 단지 순위 이동 — direction: 'up'이면 위로, 'down'이면 아래로
  const handleReorder = async (zone: LivingZone, complexId: number, direction: 'up' | 'down') => {
    const ids = zone.complexes.map(c => c.complexId);
    const idx = ids.indexOf(complexId);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= ids.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    setRankingSaving(prev => ({ ...prev, [zone.id]: true }));
    try {
      const updated = await reorderZoneComplexes(zone.id, ids);
      setZones(prev => {
        const next = prev.map(z => z.id === zone.id ? updated : z);
        if (onZonePolygonsChange) {
          onZonePolygonsChange(
            next
              .filter(z => z.polygonPoints && z.polygonPoints.length >= 3)
              .map(z => ({ id: z.id, name: z.name, points: z.polygonPoints!, flagshipComplexName: z.flagshipComplexName }))
          );
        }
        return next;
      });
    } catch {}
    setRankingSaving(prev => ({ ...prev, [zone.id]: false }));
  };

  const handleDeleteZone = async (zoneId: number) => {
    try {
      await deleteLivingZone(zoneId);
      setZones(prev => prev.filter(z => z.id !== zoneId));
    } catch {}
    setDeleteConfirmId(null);
  };

  return (
    <div style={{
      width: isMobile ? '100%' : '380px', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#fff', borderLeft: isMobile ? 'none' : '1px solid #e8eaed', flexShrink: 0,
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '0 16px', height: '56px', backgroundColor: '#89CFF0', color: '#1a3a5c',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: '15px', fontWeight: 700 }}>생활권</span>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
            width: '28px', height: '28px', cursor: 'pointer', color: '#fff',
            fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>

      {/* 필터 + 생활권 추가 버튼 */}
      <div style={{
        padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'center',
        borderBottom: '1px solid #e8eaed', flexShrink: 0,
      }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <select
            value={selectedDistrict}
            onChange={e => setSelectedDistrict(e.target.value)}
            style={{
              width: '100%', border: '1px solid #dadce0', borderRadius: '6px',
              padding: '5px 24px 5px 8px', fontSize: '12px', outline: 'none',
              appearance: 'none', WebkitAppearance: 'none', backgroundColor: '#fff',
              color: selectedDistrict ? '#202124' : '#80868b', cursor: 'pointer',
            }}
          >
            <option value="">전체 지역구</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <svg viewBox="0 0 24 24" fill="none" stroke="#9e9e9e" strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '10px', pointerEvents: 'none' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <button
          onClick={() => setShowCreateForm(v => !v)}
          style={{
            padding: '5px 10px', fontSize: '12px', fontWeight: 600,
            backgroundColor: showCreateForm ? '#D4EFFC' : '#89CFF0',
            color: showCreateForm ? '#89CFF0' : '#fff',
            border: '1px solid #1a73e8', borderRadius: '6px',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >+ 생활권 추가</button>
      </div>

      {/* 생활권 생성 폼 */}
      {showCreateForm && (
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid #e8eaed',
          backgroundColor: '#f8f9fa', flexShrink: 0,
        }}>
          <input
            placeholder="생활권 이름 (예: 봉천역 생활권)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{
              width: '100%', boxSizing: 'border-box', marginBottom: '6px',
              border: '1px solid #dadce0', borderRadius: '6px',
              padding: '6px 8px', fontSize: '12px', outline: 'none',
            }}
          />
          <div style={{ position: 'relative', marginBottom: '8px' }}>
            <select
              value={newDistrict}
              onChange={e => setNewDistrict(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1px solid #dadce0', borderRadius: '6px',
                padding: '6px 24px 6px 8px', fontSize: '12px', outline: 'none',
                appearance: 'none', WebkitAppearance: 'none',
                backgroundColor: '#fff', cursor: 'pointer',
                color: newDistrict ? '#202124' : '#9e9e9e',
              }}
            >
              <option value="">지역구 선택</option>
              {complexRegions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="#9e9e9e" strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '10px', pointerEvents: 'none' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setShowCreateForm(false); setNewName(''); setNewDistrict(''); }}
              style={{
                padding: '5px 10px', fontSize: '12px',
                border: '1px solid #dadce0', borderRadius: '6px',
                cursor: 'pointer', background: '#fff', color: '#5f6368',
              }}
            >취소</button>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newDistrict.trim()}
              style={{
                padding: '5px 10px', fontSize: '12px', fontWeight: 600,
                backgroundColor: '#89CFF0', color: '#1a3a5c',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                opacity: creating || !newName.trim() || !newDistrict.trim() ? 0.5 : 1,
              }}
            >{creating ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      )}

      {/* 사진 모달 */}
      {photoZone && (
        <ZonePhotoModal
          zoneId={photoZone.id}
          zoneName={photoZone.name}
          onClose={() => setPhotoZone(null)}
        />
      )}

      {/* 생활권 목록 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px' }}>
            로딩 중...
          </div>
        )}
        {!loading && displayed.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9e9e9e', fontSize: '13px', lineHeight: 1.8 }}>
            생활권이 없습니다.<br />위에서 추가해보세요.
          </div>
        )}

        {displayed.map(zone => {
          const isExpanded = expandedIds.has(zone.id);
          const isEditingMemo = editingMemoId === zone.id;
          const isCheckboxOpen = checkboxZoneId === zone.id;
          const isDeletingZone = deleteConfirmId === zone.id;

          // 지역구 조건 없이 모든 단지 표시 — 구획 그리기로 추가 시 지역구 무관
          const filteredComplexes = [...complexes]
            .sort((a, b) => a.complexName.localeCompare(b.complexName, 'ko'));

          return (
            <div key={zone.id} style={{ borderBottom: '1px solid #e8eaed' }}>
              {/* 카드 헤더 — 클릭 시 펼침/닫힘 */}
              <div
                onClick={() => toggleExpand(zone.id)}
                style={{
                  padding: '12px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  backgroundColor: isExpanded ? '#f8f9fa' : '#fff',
                }}
              >
                <span style={{ fontSize: '10px', color: '#9e9e9e', flexShrink: 0, lineHeight: 1 }}>
                  {isExpanded ? '▼' : '▶'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#202124', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {zone.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, color: '#4BAAD4',
                      backgroundColor: '#D4EFFC', borderRadius: '8px', padding: '1px 6px',
                    }}>{zone.district}</span>
                    <span style={{ fontSize: '11px', color: '#9e9e9e' }}>단지 {zone.complexes.length}개</span>
                    {zone.memo && (
                      <span style={{ fontSize: '11px', color: '#9e9e9e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                        · {zone.memo}
                      </span>
                    )}
                  </div>
                </div>

                {/* 사진·삭제 버튼 영역 */}
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  {/* 사진 버튼 — 항상 표시 */}
                  {!isDeletingZone && (
                    <button
                      onClick={() => setPhotoZone({ id: zone.id, name: zone.name })}
                      title="생활권 사진"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '15px', padding: '0 2px', lineHeight: 1, color: '#9e9e9e' }}
                    >📷</button>
                  )}
                  {/* 삭제 확인 or 삭제 버튼 */}
                  {isDeletingZone ? (
                    <>
                      <span style={{ fontSize: '11px', color: '#E06060', whiteSpace: 'nowrap' }}>삭제?</span>
                      <button
                        onClick={() => handleDeleteZone(zone.id)}
                        style={{ fontSize: '11px', fontWeight: 700, color: '#fff', backgroundColor: '#E06060', border: 'none', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer' }}
                      >확인</button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        style={{ fontSize: '11px', color: '#5f6368', backgroundColor: '#f1f3f4', border: 'none', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer' }}
                      >취소</button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(zone.id)}
                      title="생활권 삭제"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dadce0', fontSize: '18px', padding: 0, lineHeight: 1 }}
                    >×</button>
                  )}
                </div>
              </div>

              {/* 카드 본문 — 펼쳐진 경우만 */}
              {isExpanded && (
                <div style={{ padding: '12px 16px 14px', backgroundColor: '#f8f9fa' }}>

                  {/* 메모 섹션 */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368' }}>메모</span>
                      {!isEditingMemo && (
                        <button
                          onClick={() => { setEditingMemoId(zone.id); setMemoText(zone.memo || ''); }}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', color: '#4BAAD4', padding: 0 }}
                        >✏</button>
                      )}
                    </div>
                    {isEditingMemo ? (
                      <div>
                        <textarea
                          ref={numberedMemo.ref}
                          value={memoText}
                          onChange={e => setMemoText(e.target.value)}
                          onFocus={numberedMemo.onFocus}
                          onKeyDown={numberedMemo.onKeyDown}
                          onBlur={numberedMemo.onBlur}
                          onCompositionEnd={numberedMemo.onCompositionEnd}
                          autoFocus
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            border: '1px solid #1a73e8', borderRadius: '6px',
                            padding: '7px 9px', fontSize: '12px', outline: 'none',
                            resize: 'none', overflow: 'hidden',
                            fontFamily: 'inherit', lineHeight: 1.6,
                            backgroundColor: '#fff',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '5px' }}>
                          <button
                            onClick={() => setEditingMemoId(null)}
                            style={{ padding: '4px 9px', fontSize: '11px', border: '1px solid #dadce0', borderRadius: '5px', cursor: 'pointer', background: '#fff', color: '#5f6368' }}
                          >취소</button>
                          <button
                            onClick={() => handleMemoSave(zone.id)}
                            disabled={memoSaving}
                            style={{ padding: '4px 9px', fontSize: '11px', fontWeight: 600, backgroundColor: '#89CFF0', color: '#1a3a5c', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                          >{memoSaving ? '저장 중...' : '저장'}</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => { setEditingMemoId(zone.id); setMemoText(zone.memo || ''); }}
                        style={{
                          fontSize: '12px', lineHeight: 1.7,
                          color: zone.memo ? '#202124' : '#bdbdbd',
                          whiteSpace: 'pre-wrap', cursor: 'text',
                          padding: '6px 8px', borderRadius: '5px',
                          backgroundColor: '#fff', border: '1px solid #e8eaed',
                          minHeight: '40px',
                        }}
                      >
                        {zone.memo || '메모를 입력하세요...'}
                      </div>
                    )}
                  </div>

                  {/* 포함 단지 섹션 */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368' }}>포함 단지</span>
                      {/* 단지 추가/수정 토글 버튼 + 구획 그리기 버튼 */}
                      {!isCheckboxOpen && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {onStartZoneDrawing && (
                            <button
                              onClick={() => onStartZoneDrawing(zone.id)}
                              title="지도에서 구획을 그려 단지 자동 추가"
                              style={{
                                border: '1px solid #7DC8A0', background: '#f0faf3', cursor: 'pointer',
                                fontSize: '11px', fontWeight: 600, color: '#2e7d32',
                                padding: '2px 7px', borderRadius: '5px',
                              }}
                            >구획 그리기</button>
                          )}
                          <button
                            onClick={() => openCheckbox(zone)}
                            style={{
                              border: 'none', background: 'none', cursor: 'pointer',
                              fontSize: '11px', fontWeight: 600, color: '#4BAAD4', padding: 0,
                            }}
                          >{zone.complexes.length > 0 ? '단지 수정' : '+ 단지 추가'}</button>
                        </div>
                      )}
                    </div>

                    {/* 추가된 단지 목록 (읽기 전용) */}
                    {!isCheckboxOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {zone.complexes.length === 0 ? (
                          <div style={{ fontSize: '12px', color: '#9e9e9e', padding: '4px 0' }}>단지가 없습니다.</div>
                        ) : (
                          zone.complexes.map((c, idx) => {
                            // 백엔드 DTO에 priceRange 없으므로 complexes prop에서 complexId로 보강
                            const full = complexes.find(fc => fc.id === c.complexId);
                            const isFirst = idx === 0;
                            const isLast = idx === zone.complexes.length - 1;
                            // 2개 이상일 때만 👍/👎 표시
                            const hasRank = zone.complexes.length > 1;
                            return (
                              <div
                                key={c.id}
                                style={{
                                  display: 'flex', alignItems: 'center',
                                  padding: '6px 10px',
                                  backgroundColor: isFirst && hasRank ? '#fff8e1' : isLast && hasRank ? '#fff5f5' : '#fff',
                                  borderRadius: '6px',
                                  border: isFirst && hasRank ? '1px solid #FFD97D' : isLast && hasRank ? '1px solid #ffb3b3' : '1px solid #e8eaed',
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  {hasRank && isFirst && <span style={{ marginRight: '4px', fontSize: '12px' }}>👍</span>}
                                  {hasRank && isLast && <span style={{ marginRight: '4px', fontSize: '12px' }}>👎</span>}
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#202124' }}>{c.complexName}</span>
                                  {full?.priceRange && (
                                    <span style={{
                                      marginLeft: '6px', fontSize: '10px', fontWeight: 700,
                                      color: '#4BAAD4', backgroundColor: '#D4EFFC',
                                      borderRadius: '8px', padding: '1px 5px',
                                    }}>{full.priceRange}</span>
                                  )}
                                </div>
                                {/* 순위 이동 버튼 — 저장 중이거나 이동 불가 시 비활성 */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginLeft: '6px', flexShrink: 0 }}>
                                  <button
                                    onClick={() => handleReorder(zone, c.complexId, 'up')}
                                    disabled={rankingSaving[zone.id] || isFirst}
                                    title="순위 올리기"
                                    style={{
                                      background: 'transparent', border: '1px solid #d0d0d0',
                                      borderRadius: '3px', padding: '0 4px', lineHeight: '14px',
                                      fontSize: '10px', cursor: isFirst ? 'default' : 'pointer',
                                      color: isFirst ? '#ccc' : '#555',
                                    }}
                                  >▲</button>
                                  <button
                                    onClick={() => handleReorder(zone, c.complexId, 'down')}
                                    disabled={rankingSaving[zone.id] || isLast}
                                    title="순위 내리기"
                                    style={{
                                      background: 'transparent', border: '1px solid #d0d0d0',
                                      borderRadius: '3px', padding: '0 4px', lineHeight: '14px',
                                      fontSize: '10px', cursor: isLast ? 'default' : 'pointer',
                                      color: isLast ? '#ccc' : '#555',
                                    }}
                                  >▼</button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* 체크박스 선택 패널 */}
                    {isCheckboxOpen && (
                      <div style={{
                        border: '1px solid #1a73e8', borderRadius: '8px',
                        overflow: 'hidden', backgroundColor: '#fff',
                      }}>
                        {/* 체크박스 목록 */}
                        <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                          {filteredComplexes.length === 0 ? (
                            <div style={{ padding: '16px', fontSize: '12px', color: '#9e9e9e', textAlign: 'center' }}>
                              등록된 단지가 없습니다.
                            </div>
                          ) : (
                            filteredComplexes.map(c => {
                              const checked = pendingIds.has(c.id);
                              return (
                                <label
                                  key={c.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '9px',
                                    padding: '8px 12px', cursor: 'pointer',
                                    borderBottom: '1px solid #f0f0f0',
                                    backgroundColor: checked ? '#f0f6ff' : '#fff',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => togglePending(c.id)}
                                    style={{ width: '15px', height: '15px', accentColor: '#89CFF0', flexShrink: 0, cursor: 'pointer' }}
                                  />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12px', fontWeight: checked ? 700 : 600, color: '#202124' }}>
                                      {c.complexName}
                                    </div>
                                    {c.priceRange && (
                                      <span style={{
                                        fontSize: '10px', fontWeight: 700,
                                        color: '#4BAAD4', backgroundColor: '#D4EFFC',
                                        borderRadius: '8px', padding: '1px 5px',
                                      }}>{c.priceRange}</span>
                                    )}
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>

                        {/* 선택 개수 + 하단 버튼 */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px', borderTop: '1px solid #e8eaed',
                          backgroundColor: '#f8f9fa',
                        }}>
                          <span style={{ fontSize: '11px', color: '#5f6368' }}>
                            {pendingIds.size}개 선택됨
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => setCheckboxZoneId(null)}
                              style={{
                                padding: '4px 10px', fontSize: '11px',
                                border: '1px solid #dadce0', borderRadius: '5px',
                                cursor: 'pointer', background: '#fff', color: '#5f6368',
                              }}
                            >취소</button>
                            <button
                              onClick={() => handleSaveComplexes(zone)}
                              disabled={checkboxSaving}
                              style={{
                                padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                                backgroundColor: '#89CFF0', color: '#1a3a5c',
                                border: 'none', borderRadius: '5px', cursor: 'pointer',
                                opacity: checkboxSaving ? 0.6 : 1,
                              }}
                            >{checkboxSaving ? '저장 중...' : '저장'}</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 분위기 체크리스트 섹션 */}
                  {(() => {
                    const clItems = zoneChecklists[zone.id] || [];
                    const clLoading = checklistLoading[zone.id];
                    if (clLoading) return (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', marginBottom: '5px' }}>분위기 체크리스트</div>
                        <div style={{ fontSize: '12px', color: '#bdbdbd' }}>불러오는 중...</div>
                      </div>
                    );
                    if (clItems.length === 0) return null;
                    // 카테고리 그룹핑
                    const catOrder: string[] = [];
                    const catMap = new Map<string, ZoneChecklistResultItem[]>();
                    for (const ci of [...clItems].sort((a, b) => a.displayOrder - b.displayOrder)) {
                      const cat = ci.category || '';
                      if (!catOrder.includes(cat)) catOrder.push(cat);
                      if (!catMap.has(cat)) catMap.set(cat, []);
                      catMap.get(cat)!.push(ci);
                    }
                    const nocatIdx = catOrder.indexOf('');
                    if (nocatIdx !== -1 && nocatIdx !== catOrder.length - 1) {
                      catOrder.splice(nocatIdx, 1); catOrder.push('');
                    }
                    const hasVal = (ci: ZoneChecklistResultItem) =>
                      ci.rating !== null || (ci.memo !== null && ci.memo !== '');
                    const ratedCount = clItems.filter(hasVal).length;
                    return (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', marginBottom: '6px' }}>
                          분위기 체크리스트
                          <span style={{ fontWeight: 400, color: '#bdbdbd', marginLeft: '5px' }}>{ratedCount}/{clItems.length}</span>
                        </div>
                        {catOrder.map(cat => {
                          const catItems = catMap.get(cat) || [];
                          return (
                            <div key={cat} style={{ marginBottom: '8px' }}>
                              {catOrder.length > 1 && (
                                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9aa0a6', marginBottom: '3px' }}>
                                  {cat || '미분류'}
                                </div>
                              )}
                              {catItems.map(ci => {
                                const inputType: ChecklistInputType = (ci.inputType || 'RATING') as ChecklistInputType;
                                const textKey = `${zone.id}-${ci.templateId}`;
                                return (
                                  <div key={ci.templateId} style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    padding: '5px 0', borderBottom: '1px solid #f5f5f5',
                                  }}>
                                    <span style={{ flex: 1, fontSize: '12px', color: '#202124' }}>{ci.itemName}</span>
                                    {inputType === 'OX' && (['O', 'X'] as const).map(r => {
                                      const active = ci.rating === r;
                                      const col = OX_COLORS[r];
                                      return (
                                        <button key={r} onClick={() => handleZoneRate(zone.id, ci.templateId, r)}
                                          style={{
                                            width: '28px', height: '24px', fontSize: '11px',
                                            fontWeight: active ? 700 : 400,
                                            border: `1px solid ${active ? col.bg : '#dadce0'}`,
                                            borderRadius: '5px',
                                            backgroundColor: active ? col.bg : '#fff',
                                            color: active ? col.color : '#5f6368',
                                            cursor: 'pointer',
                                          }}>{r}</button>
                                      );
                                    })}
                                    {inputType === 'TEXT' && (
                                      <input
                                        value={zoneLocalTexts[textKey] ?? ''}
                                        onChange={e => setZoneLocalTexts(prev => ({ ...prev, [textKey]: e.target.value }))}
                                        onBlur={e => handleZoneText(zone.id, ci.templateId, e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                        placeholder="입력..."
                                        style={{
                                          flex: 1, fontSize: '11px', padding: '3px 7px', maxWidth: '160px',
                                          border: '1px solid #dadce0', borderRadius: '5px', outline: 'none',
                                        }}
                                      />
                                    )}
                                    {inputType === 'RATING' && (['UPPER', 'MIDDLE', 'LOWER'] as const).map(r => {
                                      const active = ci.rating === r;
                                      const col = RATING_COLORS[r];
                                      return (
                                        <button key={r} onClick={() => handleZoneRate(zone.id, ci.templateId, r)}
                                          style={{
                                            width: '30px', height: '24px', fontSize: '11px',
                                            fontWeight: active ? 700 : 400,
                                            border: `1px solid ${active ? col.bg : '#dadce0'}`,
                                            borderRadius: '5px',
                                            backgroundColor: active ? col.bg : '#fff',
                                            color: active ? col.color : '#5f6368',
                                            cursor: 'pointer',
                                          }}>{RATING_LABELS[r]}</button>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LivingZonePanel;
