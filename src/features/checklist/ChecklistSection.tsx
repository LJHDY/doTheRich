import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChecklistTemplate, ChecklistResultItem } from '../../types';
import {
  getChecklistTemplates, createChecklistTemplate,
  updateChecklistTemplate, deleteChecklistTemplate,
  getComplexChecklist, upsertChecklistResult,
} from '../../services/api';

const RATING_LABELS: Record<string, string> = { UPPER: '상', MIDDLE: '중', LOWER: '하' };
const RATING_COLORS: Record<string, { bg: string; color: string }> = {
  UPPER:  { bg: '#F08080', color: '#fff' },
  MIDDLE: { bg: '#FFD97D', color: '#6b4400' },
  LOWER:  { bg: '#89CFF0', color: '#1a3a5c' },
};

// ── 항목 행 — rating + memo 상태 개별 관리 ────────────────────────────────────

interface CheckItemRowProps {
  item: ChecklistResultItem;
  complexId: number;
  isEditing: boolean;
  editingName: string;
  onEditNameChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onChange: (updated: ChecklistResultItem) => void;
}

const CheckItemRow: React.FC<CheckItemRowProps> = ({
  item, complexId,
  isEditing, editingName, onEditNameChange, onEditSave, onEditCancel,
  onStartEdit, onDelete, onChange,
}) => {
  const [memo, setMemo] = useState(item.memo ?? '');
  const [memoOpen, setMemoOpen] = useState(!!(item.memo));
  const [saving, setSaving] = useState(false);
  const memoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);

  // item 변경 시 메모 동기화
  useEffect(() => {
    setMemo(item.memo ?? '');
    setMemoOpen(!!(item.memo));
  }, [item.templateId, item.memo]); // eslint-disable-line

  // 메모 textarea 자동 높이
  useLayoutEffect(() => {
    const el = memoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [memo]);

  const handleRating = async (rating: string) => {
    const newRating = item.rating === rating ? null : rating;
    setSaving(true);
    try {
      const updated = await upsertChecklistResult(complexId, item.templateId, {
        rating: newRating, memo: memo || null,
      });
      onChange(updated);
    } catch { }
    finally { setSaving(false); }
  };

  const handleMemoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMemo(val);
    if (memoTimerRef.current) clearTimeout(memoTimerRef.current);
    memoTimerRef.current = setTimeout(async () => {
      try {
        const updated = await upsertChecklistResult(complexId, item.templateId, {
          rating: item.rating ?? null, memo: val || null,
        });
        onChange(updated);
      } catch { }
    }, 800);
  };

  return (
    <div style={{ marginBottom: '4px', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {isEditing ? (
          /* 이름 편집 모드 */
          <>
            <input
              value={editingName}
              onChange={e => onEditNameChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) onEditSave();
                if (e.key === 'Escape') onEditCancel();
              }}
              autoFocus
              style={{
                flex: 1, fontSize: '12px', padding: '3px 6px',
                border: '1px solid #1a73e8', borderRadius: '4px', outline: 'none',
              }}
            />
            <button
              onClick={onEditSave}
              style={{ fontSize: '11px', padding: '2px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#89CFF0', color: '#1a3a5c', cursor: 'pointer' }}
            >저장</button>
            <button
              onClick={onEditCancel}
              style={{ fontSize: '11px', padding: '2px 8px', border: '1px solid #dadce0', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}
            >취소</button>
          </>
        ) : (
          /* 읽기 모드 */
          <>
            {/* 항목명 */}
            <span style={{ flex: 1, fontSize: '12px', color: '#344054', lineHeight: 1.4 }}>
              {item.itemName}
            </span>

            {/* 메모 토글 */}
            <button
              onClick={() => setMemoOpen(v => !v)}
              title="메모"
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '12px', color: memo ? '#89CFF0' : '#bdbdbd', padding: '2px',
              }}
            >💬</button>

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
                    width: '26px', height: '22px',
                    border: `1px solid ${active ? col.bg : '#dadce0'}`,
                    borderRadius: '4px',
                    backgroundColor: active ? col.bg : '#fff',
                    color: active ? col.color : '#5f6368',
                    fontSize: '11px', fontWeight: active ? 700 : 400,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.12s',
                  }}
                >{RATING_LABELS[r]}</button>
              );
            })}

            {/* 수정 */}
            <button
              onClick={onStartEdit}
              title="항목 이름 수정"
              style={{
                border: '1px solid #dadce0', borderRadius: '4px',
                backgroundColor: '#fff', color: '#80868b',
                fontSize: '10px', padding: '2px 5px', cursor: 'pointer',
              }}
            >✏</button>

            {/* 삭제 */}
            <button
              onClick={onDelete}
              title="항목 삭제"
              style={{
                border: '1px solid #dadce0', borderRadius: '4px',
                backgroundColor: '#fff', color: '#F08080',
                fontSize: '12px', padding: '2px 5px', cursor: 'pointer', lineHeight: 1,
              }}
            >×</button>
          </>
        )}
      </div>

      {/* 메모 textarea */}
      {memoOpen && !isEditing && (
        <textarea
          ref={memoRef}
          value={memo}
          onChange={handleMemoChange}
          placeholder="메모 입력..."
          style={{
            marginTop: '4px', width: '100%', boxSizing: 'border-box',
            fontSize: '11px', padding: '4px 6px',
            border: '1px solid #dadce0', borderRadius: '4px',
            resize: 'none', overflow: 'hidden',
            fontFamily: 'inherit', color: '#344054',
          }}
        />
      )}
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
  const [newItemName, setNewItemName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [adding, setAdding] = useState(false);

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

  // displayOrder 오름차순 정렬
  const sortedItems = [...items].sort((a, b) => a.displayOrder - b.displayOrder);

  // 새 항목 추가 — visitType은 백엔드 필수값이므로 고정값 사용
  const handleAdd = async () => {
    const name = newItemName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const maxOrder = templates.reduce((m, t) => Math.max(m, t.displayOrder), -1);
      const created = await createChecklistTemplate({
        visitType: 'ATMOSPHERE',
        itemName: name,
        displayOrder: maxOrder + 1,
      });
      setTemplates(prev => [...prev, created]);
      // 새 템플릿을 미체크 행으로 즉시 추가
      setItems(prev => [...prev, {
        id: 0, templateId: created.id, itemName: created.itemName,
        visitType: created.visitType, displayOrder: created.displayOrder,
        rating: null, memo: null,
      }]);
      setNewItemName('');
    } catch { }
    finally { setAdding(false); }
  };

  // 항목 이름 수정 저장
  const handleEditSave = async () => {
    if (!editingId || !editingName.trim()) return;
    try {
      const updated = await updateChecklistTemplate(editingId, { itemName: editingName.trim() });
      setTemplates(prev => prev.map(t => t.id === editingId ? updated : t));
      setItems(prev => prev.map(it =>
        it.templateId === editingId ? { ...it, itemName: editingName.trim() } : it
      ));
      setEditingId(null);
    } catch { }
  };

  // 항목 삭제 — 모든 단지의 해당 결과도 CASCADE 삭제됨
  const handleDelete = async (templateId: number, itemName: string) => {
    if (!window.confirm(`"${itemName}" 항목을 삭제하면 모든 단지의 해당 체크 결과도 삭제됩니다. 계속하시겠습니까?`)) return;
    try {
      await deleteChecklistTemplate(templateId);
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      setItems(prev => prev.filter(it => it.templateId !== templateId));
    } catch { }
  };

  const handleItemChange = (updated: ChecklistResultItem) => {
    setItems(prev => prev.map(it => it.templateId === updated.templateId ? updated : it));
  };

  const checkedCount = items.filter(it => it.rating !== null).length;

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* 섹션 헤더 */}
      <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#344054', marginBottom: '8px' }}>
        체크리스트
        {items.length > 0 && (
          <span style={{ marginLeft: '6px', fontSize: '12px', color: '#9aa0a6', fontWeight: 400 }}>
            {checkedCount}/{items.length}
          </span>
        )}
      </h3>

      {loading ? (
        <p style={{ fontSize: '12px', color: '#9aa0a6' }}>불러오는 중...</p>
      ) : (
        <>
          {/* 항목 없을 때 안내 */}
          {sortedItems.length === 0 && (
            <p style={{ fontSize: '12px', color: '#9aa0a6', marginBottom: '8px' }}>
              아래에서 체크 항목을 추가하세요.
            </p>
          )}

          {/* 플랫 항목 목록 */}
          {sortedItems.map(item => (
            <CheckItemRow
              key={item.templateId}
              item={item}
              complexId={complexId}
              isEditing={editingId === item.templateId}
              editingName={editingName}
              onEditNameChange={setEditingName}
              onEditSave={handleEditSave}
              onEditCancel={() => setEditingId(null)}
              onStartEdit={() => { setEditingId(item.templateId); setEditingName(item.itemName); }}
              onDelete={() => handleDelete(item.templateId, item.itemName)}
              onChange={handleItemChange}
            />
          ))}

          {/* 새 항목 추가 입력창 */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <input
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd(); }}
              placeholder="항목 추가... (Enter)"
              style={{
                flex: 1, fontSize: '12px', padding: '5px 8px',
                border: '1px solid #dadce0', borderRadius: '6px', outline: 'none',
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!newItemName.trim() || adding}
              style={{
                fontSize: '12px', padding: '5px 12px',
                border: 'none', borderRadius: '6px',
                backgroundColor: newItemName.trim() ? '#89CFF0' : '#f1f3f4',
                color: newItemName.trim() ? '#fff' : '#9aa0a6',
                cursor: newItemName.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 600,
              }}
            >추가</button>
          </div>
        </>
      )}
    </div>
  );
};

export default ChecklistSection;
