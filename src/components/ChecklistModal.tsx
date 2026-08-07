import React, { useState, useEffect, useCallback } from 'react';
import { ChecklistResultItem } from '../types';
import {
  getChecklistTemplates, createChecklistTemplate, deleteChecklistTemplate,
  getComplexChecklist, upsertChecklistResult,
} from '../services/api';

const VISIT_TYPES = [
  { key: 'ATMOSPHERE' as const, label: '분위기' },
  { key: 'COMPLEX'    as const, label: '단지' },
  { key: 'PROPERTY'  as const, label: '매물' },
];

type VisitTypeKey = 'ATMOSPHERE' | 'COMPLEX' | 'PROPERTY';

const RATING_LABELS: Record<string, string> = { UPPER: '상', MIDDLE: '중', LOWER: '하' };
const RATING_COLORS: Record<string, { bg: string; color: string }> = {
  UPPER:  { bg: '#ea4335', color: '#fff' },
  MIDDLE: { bg: '#f9ab00', color: '#fff' },
  LOWER:  { bg: '#1a73e8', color: '#fff' },
};

interface Props {
  complexId: number;
  complexName: string;
  onClose: () => void;
}

const ChecklistModal: React.FC<Props> = ({ complexId, complexName, onClose }) => {
  // getComplexChecklist는 전체 템플릿(미체크 포함)을 반환 — 단일 상태로 관리
  const [items, setItems] = useState<ChecklistResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<VisitTypeKey>('ATMOSPHERE');
  const [newItemName, setNewItemName] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await getComplexChecklist(complexId);
      setItems(results);
      // 체크된 항목이 있는 첫 번째 타입 탭으로 초기화
      const firstRatedType = VISIT_TYPES.find(vt =>
        results.some(r => r.visitType === vt.key && r.rating !== null)
      );
      if (firstRatedType) setActiveTab(firstRatedType.key);
    } catch { }
    finally { setLoading(false); }
  }, [complexId]);

  useEffect(() => { load(); }, [load]);

  // 현재 탭의 항목 목록 (displayOrder 정렬)
  const tabItems = items
    .filter(i => i.visitType === activeTab)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // 체크된 항목이 하나라도 있으면 결과 존재 = 삭제 버튼 비표시
  const hasAnyRating = items.some(i => i.rating !== null);

  // 상/중/하 선택 — 동일 버튼 재클릭 시 해제, 즉시 저장
  const handleRate = async (templateId: number, rating: string) => {
    const current = items.find(i => i.templateId === templateId)?.rating ?? null;
    const newRating = current === rating ? null : rating;
    try {
      const updated = await upsertChecklistResult(complexId, templateId, { rating: newRating, memo: null });
      setItems(prev => prev.map(i => i.templateId === templateId ? { ...i, rating: updated.rating } : i));
    } catch { }
  };

  // 새 항목 추가 — 전역 템플릿 생성 후 items에 반영
  const handleAdd = async () => {
    const name = newItemName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const maxOrder = tabItems.reduce((m, t) => Math.max(m, t.displayOrder), -1);
      const created = await createChecklistTemplate({ visitType: activeTab, itemName: name, displayOrder: maxOrder + 1 });
      setItems(prev => [...prev, {
        id: 0, templateId: created.id, itemName: created.itemName,
        visitType: created.visitType as VisitTypeKey,
        displayOrder: created.displayOrder, rating: null, memo: null,
      }]);
      setNewItemName('');
    } catch { }
    finally { setAdding(false); }
  };

  // 항목 삭제 — 체크 결과가 없을 때만 표시 (전역 템플릿 삭제)
  const handleDelete = async (templateId: number, itemName: string) => {
    if (!window.confirm(`"${itemName}" 항목을 삭제하면 모든 단지의 해당 체크 결과도 삭제됩니다.`)) return;
    try {
      await deleteChecklistTemplate(templateId);
      setItems(prev => prev.filter(i => i.templateId !== templateId));
    } catch { }
  };

  const checkedCount = items.filter(i => i.rating !== null).length;
  const totalCount = items.length;

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: '#fff', borderRadius: '14px',
        width: '540px', maxWidth: 'calc(100vw - 32px)',
        maxHeight: '82vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #e8eaed',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#202124' }}>임장 체크리스트</div>
            <div style={{ fontSize: '12px', color: '#80868b', marginTop: '3px' }}>
              {complexName} · {checkedCount}/{totalCount}개 체크됨
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '22px', color: '#80868b', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* 타입 탭 */}
        <div style={{ display: 'flex', gap: '6px', padding: '12px 22px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          {VISIT_TYPES.map(vt => {
            const tabRated = items.filter(i => i.visitType === vt.key && i.rating !== null).length;
            const tabTotal = items.filter(i => i.visitType === vt.key).length;
            const isActive = activeTab === vt.key;
            return (
              <button key={vt.key} onClick={() => setActiveTab(vt.key)}
                style={{
                  padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  border: '1.5px solid', borderColor: isActive ? '#1a73e8' : '#dadce0',
                  borderRadius: '16px',
                  backgroundColor: isActive ? '#1a73e8' : '#fff',
                  color: isActive ? '#fff' : '#5f6368',
                }}>
                {vt.label}
                {tabTotal > 0 && (
                  <span style={{ marginLeft: '4px', fontSize: '10px', opacity: isActive ? 0.85 : 0.65 }}>
                    {tabRated}/{tabTotal}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 항목 목록 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 22px' }}>
          {loading ? (
            <p style={{ color: '#9aa0a6', fontSize: '13px', padding: '12px 0' }}>불러오는 중...</p>
          ) : tabItems.length === 0 ? (
            <p style={{ color: '#9aa0a6', fontSize: '13px', padding: '12px 0' }}>
              이 유형의 항목이 없습니다. 아래에서 추가하거나 헤더의 "체크리스트" 버튼을 이용하세요.
            </p>
          ) : (
            tabItems.map(item => {
              const rating = item.rating ?? null;
              return (
                <div key={item.templateId} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '9px 0', borderBottom: '1px solid #f0f0f0',
                }}>
                  <span style={{ flex: 1, fontSize: '13px', color: '#202124', lineHeight: 1.4 }}>
                    {item.itemName}
                  </span>
                  {/* 상/중/하 버튼 */}
                  {(['UPPER', 'MIDDLE', 'LOWER'] as const).map(r => {
                    const active = rating === r;
                    const col = RATING_COLORS[r];
                    return (
                      <button key={r} onClick={() => handleRate(item.templateId, r)}
                        style={{
                          width: '36px', height: '30px',
                          border: `1.5px solid ${active ? col.bg : '#dadce0'}`,
                          borderRadius: '7px',
                          backgroundColor: active ? col.bg : '#fff',
                          color: active ? col.color : '#5f6368',
                          fontSize: '12px', fontWeight: active ? 700 : 400,
                          cursor: 'pointer', transition: 'all 0.12s',
                        }}>
                        {RATING_LABELS[r]}
                      </button>
                    );
                  })}
                  {/* 삭제 — 아직 체크 결과가 없을 때만 표시 */}
                  {!hasAnyRating && (
                    <button onClick={() => handleDelete(item.templateId, item.itemName)}
                      style={{
                        border: '1px solid #fadbd8', borderRadius: '4px', background: '#fff',
                        color: '#ea4335', fontSize: '14px', padding: '2px 7px',
                        cursor: 'pointer', lineHeight: 1, flexShrink: 0,
                      }}>×</button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 항목 추가 */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: '8px', flexShrink: 0 }}>
          <input
            value={newItemName}
            onChange={e => setNewItemName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd(); }}
            placeholder="항목 추가... (Enter)"
            style={{
              flex: 1, fontSize: '13px', padding: '7px 10px',
              border: '1px solid #dadce0', borderRadius: '8px', outline: 'none',
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!newItemName.trim() || adding}
            style={{
              padding: '7px 16px', fontSize: '13px', fontWeight: 600, border: 'none', borderRadius: '8px',
              backgroundColor: newItemName.trim() ? '#1a73e8' : '#f1f3f4',
              color: newItemName.trim() ? '#fff' : '#9aa0a6',
              cursor: newItemName.trim() ? 'pointer' : 'not-allowed',
            }}>추가</button>
        </div>
      </div>
    </div>
  );
};

export default ChecklistModal;
