import React, { useState, useEffect, useCallback } from 'react';
import { ApartmentComplex, LivingZone } from '../types';
import {
  getLivingZones, createLivingZone, updateLivingZoneMemo,
  addComplexToZone, removeComplexFromZone, deleteLivingZone,
} from '../services/api';

interface Props {
  complexes: ApartmentComplex[];
  onClose: () => void;
}

const LivingZonePanel: React.FC<Props> = ({ complexes, onClose }) => {
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

  // 단지 추가 UI — zoneId 단위로 펼침
  const [addingComplexZoneId, setAddingComplexZoneId] = useState<number | null>(null);
  const [selectedComplexId, setSelectedComplexId] = useState('');
  const [addingSaving, setAddingSaving] = useState(false);

  // 삭제 확인 — 생활권 삭제
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  // 단지 제거 확인
  const [removeConfirm, setRemoveConfirm] = useState<{ zoneId: number; complexId: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLivingZones();
      setZones(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 기존 생활권에서 지역구 목록 추출 — 셀렉트 옵션으로 사용
  const districts = Array.from(new Set(zones.map(z => z.district))).sort((a, b) => a.localeCompare(b, 'ko'));

  // 필터 적용
  const displayed = selectedDistrict
    ? zones.filter(z => z.district === selectedDistrict)
    : zones;

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(Array.from(prev));
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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

  const handleAddComplex = async (zoneId: number) => {
    if (!selectedComplexId) return;
    setAddingSaving(true);
    try {
      await addComplexToZone(zoneId, parseInt(selectedComplexId));
      // 로컬 상태 즉시 갱신 — 서버 재조회 없이 반영
      const added = complexes.find(c => c.id === parseInt(selectedComplexId));
      if (added) {
        setZones(prev => prev.map(z => z.id === zoneId ? {
          ...z,
          complexes: [...z.complexes, { id: added.id, complexName: added.complexName, priceRange: added.priceRange, region: added.region }],
        } : z));
      }
      setAddingComplexZoneId(null);
      setSelectedComplexId('');
    } catch {}
    setAddingSaving(false);
  };

  const handleRemoveComplex = async (zoneId: number, complexId: number) => {
    try {
      await removeComplexFromZone(zoneId, complexId);
      setZones(prev => prev.map(z =>
        z.id === zoneId ? { ...z, complexes: z.complexes.filter(c => c.id !== complexId) } : z
      ));
    } catch {}
    setRemoveConfirm(null);
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
      width: '380px', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#fff', borderLeft: '1px solid #e8eaed', flexShrink: 0,
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '0 16px', height: '56px', backgroundColor: '#1a73e8', color: '#fff',
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
            backgroundColor: showCreateForm ? '#e8f0fe' : '#1a73e8',
            color: showCreateForm ? '#1a73e8' : '#fff',
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
          <input
            placeholder="지역구 (예: 서울 관악구)"
            value={newDistrict}
            onChange={e => setNewDistrict(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            list="district-suggestions"
            style={{
              width: '100%', boxSizing: 'border-box', marginBottom: '8px',
              border: '1px solid #dadce0', borderRadius: '6px',
              padding: '6px 8px', fontSize: '12px', outline: 'none',
            }}
          />
          {/* 기존 지역구 자동완성 */}
          <datalist id="district-suggestions">
            {districts.map(d => <option key={d} value={d} />)}
          </datalist>
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
                backgroundColor: '#1a73e8', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                opacity: creating || !newName.trim() || !newDistrict.trim() ? 0.5 : 1,
              }}
            >{creating ? '저장 중...' : '저장'}</button>
          </div>
        </div>
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
            생활권이 없습니다.<br />
            위에서 추가해보세요.
          </div>
        )}

        {displayed.map(zone => {
          const isExpanded = expandedIds.has(zone.id);
          const isEditingMemo = editingMemoId === zone.id;
          const isAddingComplex = addingComplexZoneId === zone.id;
          const isDeletingZone = deleteConfirmId === zone.id;

          // 이미 추가된 단지 제외한 선택 가능 목록
          const addedIds = new Set(zone.complexes.map(c => c.id));
          const available = complexes.filter(c => !addedIds.has(c.id));

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
                      fontSize: '10px', fontWeight: 700, color: '#1a73e8',
                      backgroundColor: '#e8f0fe', borderRadius: '8px', padding: '1px 6px',
                    }}>{zone.district}</span>
                    <span style={{ fontSize: '11px', color: '#9e9e9e' }}>단지 {zone.complexes.length}개</span>
                    {zone.memo && (
                      <span style={{ fontSize: '11px', color: '#9e9e9e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                        · {zone.memo}
                      </span>
                    )}
                  </div>
                </div>

                {/* 삭제 확인 or 삭제 버튼 */}
                {isDeletingZone ? (
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', color: '#c5221f', whiteSpace: 'nowrap' }}>삭제?</span>
                    <button
                      onClick={() => handleDeleteZone(zone.id)}
                      style={{ fontSize: '11px', fontWeight: 700, color: '#fff', backgroundColor: '#c5221f', border: 'none', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer' }}
                    >확인</button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      style={{ fontSize: '11px', color: '#5f6368', backgroundColor: '#f1f3f4', border: 'none', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer' }}
                    >취소</button>
                  </div>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteConfirmId(zone.id); }}
                    title="생활권 삭제"
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dadce0', fontSize: '18px', padding: 0, lineHeight: 1, flexShrink: 0 }}
                  >×</button>
                )}
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
                          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', color: '#1a73e8', padding: 0 }}
                        >✏</button>
                      )}
                    </div>
                    {isEditingMemo ? (
                      <div>
                        <textarea
                          value={memoText}
                          onChange={e => setMemoText(e.target.value)}
                          rows={4}
                          autoFocus
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            border: '1px solid #1a73e8', borderRadius: '6px',
                            padding: '7px 9px', fontSize: '12px', outline: 'none',
                            resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
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
                            style={{ padding: '4px 9px', fontSize: '11px', fontWeight: 600, backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
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

                  {/* 포함 단지 목록 */}
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368' }}>포함 단지</span>

                    <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {zone.complexes.length === 0 && !isAddingComplex && (
                        <div style={{ fontSize: '12px', color: '#9e9e9e', padding: '4px 0' }}>단지가 없습니다.</div>
                      )}

                      {zone.complexes.map(c => {
                        const isRemoving = removeConfirm?.zoneId === zone.id && removeConfirm?.complexId === c.id;
                        return (
                          <div
                            key={c.id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '6px 10px',
                              backgroundColor: '#fff', borderRadius: '6px',
                              border: '1px solid #e8eaed',
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: '#202124' }}>{c.complexName}</span>
                              {c.priceRange && (
                                <span style={{
                                  marginLeft: '6px', fontSize: '10px', fontWeight: 700,
                                  color: '#1a73e8', backgroundColor: '#e8f0fe',
                                  borderRadius: '8px', padding: '1px 5px',
                                }}>{c.priceRange}</span>
                              )}
                              {c.region && (
                                <div style={{ fontSize: '10px', color: '#9e9e9e', marginTop: '1px' }}>{c.region}</div>
                              )}
                            </div>

                            {isRemoving ? (
                              <div style={{ display: 'flex', gap: '3px', flexShrink: 0, marginLeft: '8px' }}>
                                <button
                                  onClick={() => handleRemoveComplex(zone.id, c.id)}
                                  style={{ fontSize: '10px', color: '#fff', backgroundColor: '#c5221f', border: 'none', borderRadius: '3px', padding: '2px 6px', cursor: 'pointer' }}
                                >제거</button>
                                <button
                                  onClick={() => setRemoveConfirm(null)}
                                  style={{ fontSize: '10px', color: '#5f6368', backgroundColor: '#f1f3f4', border: 'none', borderRadius: '3px', padding: '2px 6px', cursor: 'pointer' }}
                                >취소</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setRemoveConfirm({ zoneId: zone.id, complexId: c.id })}
                                title="단지 제거"
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#bdbdbd', fontSize: '16px', padding: 0, lineHeight: 1, flexShrink: 0, marginLeft: '8px' }}
                              >×</button>
                            )}
                          </div>
                        );
                      })}

                      {/* 단지 추가 UI */}
                      {isAddingComplex ? (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                          <select
                            value={selectedComplexId}
                            onChange={e => setSelectedComplexId(e.target.value)}
                            autoFocus
                            style={{
                              flex: 1, border: '1px solid #1a73e8', borderRadius: '6px',
                              padding: '5px 7px', fontSize: '11px', outline: 'none',
                              backgroundColor: '#fff',
                            }}
                          >
                            <option value="">단지 선택...</option>
                            {available.sort((a, b) => (a.region || '').localeCompare(b.region || '', 'ko') || a.complexName.localeCompare(b.complexName, 'ko')).map(c => (
                              <option key={c.id} value={c.id}>
                                {c.complexName}{c.region ? ` (${c.region})` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAddComplex(zone.id)}
                            disabled={!selectedComplexId || addingSaving}
                            style={{
                              padding: '5px 9px', fontSize: '11px', fontWeight: 600,
                              backgroundColor: '#1a73e8', color: '#fff',
                              border: 'none', borderRadius: '6px', cursor: 'pointer',
                              opacity: selectedComplexId && !addingSaving ? 1 : 0.5,
                            }}
                          >{addingSaving ? '...' : '추가'}</button>
                          <button
                            onClick={() => { setAddingComplexZoneId(null); setSelectedComplexId(''); }}
                            style={{
                              padding: '5px 7px', fontSize: '11px',
                              border: '1px solid #dadce0', borderRadius: '6px',
                              cursor: 'pointer', background: '#fff', color: '#5f6368',
                            }}
                          >취소</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddingComplexZoneId(zone.id); setSelectedComplexId(''); }}
                          style={{
                            marginTop: '2px', width: '100%', padding: '6px',
                            fontSize: '11px', fontWeight: 600, color: '#1a73e8',
                            backgroundColor: '#e8f0fe', border: '1px dashed #a8c7fa',
                            borderRadius: '6px', cursor: 'pointer',
                          }}
                        >+ 단지 추가</button>
                      )}
                    </div>
                  </div>
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
