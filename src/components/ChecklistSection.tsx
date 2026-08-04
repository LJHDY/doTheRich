import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChecklistTemplate,
  ChecklistResultItem,
} from '../types';
import {
  getChecklistTemplates,
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
  getComplexChecklist,
  upsertChecklistResult,
} from '../services/api';

// ── 상수 ──────────────────────────────────────────────────────────────────────

const VISIT_TYPE_LABELS: Record<string, string> = {
  ATMOSPHERE: '분위기',
  COMPLEX: '단지',
  PROPERTY: '매물',
};

const VISIT_TYPES = ['ATMOSPHERE', 'COMPLEX', 'PROPERTY'] as const;

const RATING_LABELS: Record<string, string> = {
  UPPER: '상',
  MIDDLE: '중',
  LOWER: '하',
};

const RATING_COLORS: Record<string, { bg: string; color: string }> = {
  UPPER:  { bg: '#ea4335', color: '#fff' },
  MIDDLE: { bg: '#f9ab00', color: '#fff' },
  LOWER:  { bg: '#1a73e8', color: '#fff' },
};

// ── 서브 컴포넌트: 체크 항목 행 ───────────────────────────────────────────────

interface CheckItemRowProps {
  item: ChecklistResultItem;
  complexId: number;
  onChange: (updated: ChecklistResultItem) => void;
}

const CheckItemRow: React.FC<CheckItemRowProps> = ({ item, complexId, onChange }) => {
  const [memo, setMemo] = useState(item.memo ?? '');
  const [memoOpen, setMemoOpen] = useState(!!(item.memo));
  const [saving, setSaving] = useState(false);
  const memoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // item 변경 시 로컬 memo 동기화
  useEffect(() => {
    setMemo(item.memo ?? '');
    setMemoOpen(!!(item.memo));
  }, [item.templateId, item.memo]); // eslint-disable-line

  // 평가 버튼 클릭: 같은 버튼 재클릭 시 체크 해제
  const handleRating = async (rating: string) => {
    const newRating = item.rating === rating ? null : rating;
    setSaving(true);
    try {
      const updated = await upsertChecklistResult(complexId, item.templateId, {
        rating: newRating,
        memo: memo || null,
      });
      onChange(updated);
    } catch { }
    finally { setSaving(false); }
  };

  // 메모 자동저장 (0.8초 debounce)
  const handleMemoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMemo(val);
    if (memoTimerRef.current) clearTimeout(memoTimerRef.current);
    memoTimerRef.current = setTimeout(async () => {
      try {
        const updated = await upsertChecklistResult(complexId, item.templateId, {
          rating: item.rating ?? null,
          memo: val || null,
        });
        onChange(updated);
      } catch { }
    }, 800);
  };

  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* 항목명 */}
        <span style={{ flex: 1, fontSize: '12px', color: '#344054' }}>{item.itemName}</span>

        {/* 메모 토글 버튼 */}
        <button
          onClick={() => setMemoOpen(v => !v)}
          title="메모"
          style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '12px', color: memo ? '#1a73e8' : '#9aa0a6',
            padding: '2px 4px',
          }}
        >
          💬
        </button>

        {/* 상/중/하 버튼 */}
        {(['UPPER', 'MIDDLE', 'LOWER'] as const).map(r => {
          const active = item.rating === r;
          const col = RATING_COLORS[r];
          return (
            <button
              key={r}
              onClick={() => handleRating(r)}
              disabled={saving}
              style={{
                width: '28px', height: '22px',
                border: `1px solid ${active ? col.bg : '#dadce0'}`,
                borderRadius: '4px',
                backgroundColor: active ? col.bg : '#fff',
                color: active ? col.color : '#5f6368',
                fontSize: '11px', fontWeight: active ? 700 : 400,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {RATING_LABELS[r]}
            </button>
          );
        })}
      </div>

      {/* 메모 textarea */}
      {memoOpen && (
        <textarea
          value={memo}
          onChange={handleMemoChange}
          placeholder="메모 입력..."
          rows={2}
          style={{
            marginTop: '4px', marginLeft: '0',
            width: '100%', boxSizing: 'border-box',
            fontSize: '11px', padding: '4px 6px',
            border: '1px solid #dadce0', borderRadius: '4px',
            resize: 'vertical', fontFamily: 'inherit', color: '#344054',
          }}
        />
      )}
    </div>
  );
};

// ── 서브 컴포넌트: 템플릿 관리 패널 ──────────────────────────────────────────

interface TemplateManagerProps {
  templates: ChecklistTemplate[];
  onTemplatesChange: (templates: ChecklistTemplate[]) => void;
}

const TemplateManager: React.FC<TemplateManagerProps> = ({ templates, onTemplatesChange }) => {
  const [activeTab, setActiveTab] = useState<typeof VISIT_TYPES[number]>('ATMOSPHERE');
  const [newItemName, setNewItemName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredTemplates = templates
    .filter(t => t.visitType === activeTab)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const handleAdd = async () => {
    const name = newItemName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const maxOrder = filteredTemplates.reduce((m, t) => Math.max(m, t.displayOrder), -1);
      const created = await createChecklistTemplate({
        visitType: activeTab,
        itemName: name,
        displayOrder: maxOrder + 1,
      });
      onTemplatesChange([...templates, created]);
      setNewItemName('');
    } catch { }
    finally { setSaving(false); }
  };

  const handleUpdateStart = (t: ChecklistTemplate) => {
    setEditingId(t.id);
    setEditingName(t.itemName);
  };

  const handleUpdateSave = async (id: number) => {
    const name = editingName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const updated = await updateChecklistTemplate(id, { itemName: name });
      onTemplatesChange(templates.map(t => t.id === id ? updated : t));
      setEditingId(null);
    } catch { }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 항목을 삭제하면 모든 단지의 해당 체크 결과도 삭제됩니다. 계속하시겠습니까?')) return;
    setSaving(true);
    try {
      await deleteChecklistTemplate(id);
      onTemplatesChange(templates.filter(t => t.id !== id));
    } catch { }
    finally { setSaving(false); }
  };

  const tabStyle = (vt: string): React.CSSProperties => ({
    padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid',
    borderColor: activeTab === vt ? '#1a73e8' : '#dadce0',
    borderRadius: '12px',
    backgroundColor: activeTab === vt ? '#e8f0fe' : '#fff',
    color: activeTab === vt ? '#1a73e8' : '#5f6368',
  });

  return (
    <div style={{
      marginTop: '8px', padding: '10px', backgroundColor: '#f8f9fa',
      borderRadius: '8px', border: '1px solid #e8eaed',
    }}>
      {/* 탭 */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        {VISIT_TYPES.map(vt => (
          <button key={vt} onClick={() => setActiveTab(vt)} style={tabStyle(vt)}>
            {VISIT_TYPE_LABELS[vt]}
          </button>
        ))}
      </div>

      {/* 항목 목록 */}
      <div style={{ marginBottom: '8px' }}>
        {filteredTemplates.length === 0 && (
          <p style={{ fontSize: '11px', color: '#9aa0a6', margin: '0 0 8px' }}>등록된 항목이 없습니다.</p>
        )}
        {filteredTemplates.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            {editingId === t.id ? (
              <>
                <input
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleUpdateSave(t.id); if (e.key === 'Escape') setEditingId(null); }}
                  autoFocus
                  style={{ flex: 1, fontSize: '12px', padding: '3px 6px', border: '1px solid #1a73e8', borderRadius: '4px' }}
                />
                <button onClick={() => handleUpdateSave(t.id)} disabled={saving}
                  style={{ fontSize: '11px', padding: '3px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#1a73e8', color: '#fff', cursor: 'pointer' }}>
                  저장
                </button>
                <button onClick={() => setEditingId(null)}
                  style={{ fontSize: '11px', padding: '3px 8px', border: '1px solid #dadce0', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>
                  취소
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: '12px', color: '#344054' }}>{t.itemName}</span>
                <button onClick={() => handleUpdateStart(t)}
                  style={{ fontSize: '11px', border: '1px solid #34a853', color: '#34a853', padding: '2px 7px', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>
                  ✏
                </button>
                <button onClick={() => handleDelete(t.id)} disabled={saving}
                  style={{ fontSize: '11px', border: '1px solid #ea4335', color: '#ea4335', padding: '2px 7px', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* 새 항목 추가 */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          value={newItemName}
          onChange={e => setNewItemName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd(); }}
          placeholder={`${VISIT_TYPE_LABELS[activeTab]} 항목 추가...`}
          style={{ flex: 1, fontSize: '12px', padding: '4px 8px', border: '1px solid #dadce0', borderRadius: '4px' }}
        />
        <button onClick={handleAdd} disabled={saving || !newItemName.trim()}
          style={{
            fontSize: '12px', padding: '4px 10px', border: 'none', borderRadius: '4px',
            backgroundColor: newItemName.trim() ? '#1a73e8' : '#dadce0',
            color: newItemName.trim() ? '#fff' : '#9aa0a6',
            cursor: newItemName.trim() ? 'pointer' : 'not-allowed',
          }}>
          추가
        </button>
      </div>
    </div>
  );
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

interface ChecklistSectionProps {
  complexId: number;
}

const ChecklistSection: React.FC<ChecklistSectionProps> = ({ complexId }) => {
  const [items, setItems] = useState<ChecklistResultItem[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showManager, setShowManager] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [results, tpls] = await Promise.all([
        getComplexChecklist(complexId),
        getChecklistTemplates(),
      ]);
      setItems(results);
      setTemplates(tpls);
    } catch { }
    finally { setLoading(false); }
  }, [complexId]);

  useEffect(() => { load(); }, [load]);

  // 특정 항목 결과 업데이트 (optimistic)
  const handleItemChange = (updated: ChecklistResultItem) => {
    setItems(prev => prev.map(it => it.templateId === updated.templateId ? updated : it));
  };

  // 템플릿 변경 시 checklist도 새로고침 (추가·삭제)
  const handleTemplatesChange = async (newTemplates: ChecklistTemplate[]) => {
    setTemplates(newTemplates);
    // 삭제된 템플릿에 해당하는 결과 제거, 추가된 템플릿은 미체크로 삽입
    const newIds = new Set(newTemplates.map(t => t.id));
    const filteredItems = items.filter(it => newIds.has(it.templateId));
    const existingIds = new Set(filteredItems.map(it => it.templateId));
    const newItems: ChecklistResultItem[] = newTemplates
      .filter(t => !existingIds.has(t.id))
      .map(t => ({
        id: 0,
        templateId: t.id,
        itemName: t.itemName,
        visitType: t.visitType,
        displayOrder: t.displayOrder,
        rating: null,
        memo: null,
      }));
    setItems([...filteredItems, ...newItems]);
  };

  // visit_type별 그룹핑 및 display_order 정렬
  const grouped = VISIT_TYPES.map(vt => ({
    vt,
    items: items
      .filter(it => it.visitType === vt)
      .sort((a, b) => a.displayOrder - b.displayOrder),
  })).filter(g => g.items.length > 0);

  // 체크된 항목 수 / 전체 항목 수
  const checkedCount = items.filter(it => it.rating !== null).length;
  const totalCount = items.length;

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* 섹션 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054' }}>
          체크리스트
          {totalCount > 0 && (
            <span style={{ marginLeft: '6px', fontSize: '12px', color: '#9aa0a6', fontWeight: 400 }}>
              {checkedCount}/{totalCount}
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowManager(v => !v)}
          style={{
            fontSize: '12px', padding: '3px 8px',
            border: `1px solid ${showManager ? '#1a73e8' : '#dadce0'}`,
            borderRadius: '4px', cursor: 'pointer',
            backgroundColor: showManager ? '#e8f0fe' : '#fff',
            color: showManager ? '#1a73e8' : '#5f6368',
          }}
        >
          항목 관리
        </button>
      </div>

      {/* 체크리스트 항목 */}
      {loading ? (
        <p style={{ fontSize: '12px', color: '#9aa0a6' }}>불러오는 중...</p>
      ) : totalCount === 0 ? (
        <p style={{ fontSize: '12px', color: '#9aa0a6', marginBottom: '8px' }}>
          등록된 항목이 없습니다. "항목 관리"에서 체크 항목을 추가하세요.
        </p>
      ) : (
        grouped.map(({ vt, items: groupItems }) => (
          <div key={vt} style={{ marginBottom: '10px' }}>
            {/* 그룹 레이블 */}
            <div style={{
              fontSize: '11px', fontWeight: 700, color: '#5f6368',
              marginBottom: '5px', paddingBottom: '3px',
              borderBottom: '1px solid #e8eaed',
            }}>
              {VISIT_TYPE_LABELS[vt]} 임장
            </div>
            {groupItems.map(item => (
              <CheckItemRow
                key={item.templateId}
                item={item}
                complexId={complexId}
                onChange={handleItemChange}
              />
            ))}
          </div>
        ))
      )}

      {/* 항목 관리 패널 */}
      {showManager && (
        <TemplateManager
          templates={templates}
          onTemplatesChange={handleTemplatesChange}
        />
      )}
    </div>
  );
};

export default ChecklistSection;
