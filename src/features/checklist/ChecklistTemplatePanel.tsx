import React, { useState, useEffect, useMemo } from 'react';
import { ChecklistTemplate, ChecklistInputType } from '../../types';
import {
  getChecklistTemplates, createChecklistTemplate,
  updateChecklistTemplate, deleteChecklistTemplate,
} from '../../services/api';

const VISIT_TYPES = [
  { key: 'ATMOSPHERE' as const, label: '분위기' },
  { key: 'COMPLEX'    as const, label: '단지' },
  { key: 'PROPERTY'  as const, label: '매물' },
];

type VisitTypeKey = 'ATMOSPHERE' | 'COMPLEX' | 'PROPERTY';

// 입력 유형 정의
const INPUT_TYPES: { key: ChecklistInputType; label: string; color: string }[] = [
  { key: 'RATING', label: '상중하', color: '#4BAAD4' },
  { key: 'OX',     label: 'O/X',   color: '#5AAF84' },
  { key: 'TEXT',   label: '텍스트', color: '#e37400' },
];

const inputTypeBadge = (type: ChecklistInputType | undefined): React.CSSProperties => {
  const t = INPUT_TYPES.find(x => x.key === (type || 'RATING')) || INPUT_TYPES[0];
  return {
    fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px',
    backgroundColor: t.color + '1a', color: t.color, border: `1px solid ${t.color}44`,
    flexShrink: 0,
  };
};

interface Props {
  onClose: () => void;
  isMobile?: boolean;
}

const ChecklistTemplatePanel: React.FC<Props> = ({ onClose, isMobile }) => {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<VisitTypeKey>('ATMOSPHERE');

  // 카테고리 추가 입력
  const [newCatName, setNewCatName] = useState('');
  // 카테고리별 항목 추가 입력값 (key: category)
  const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({});
  // 카테고리별 신규 항목 입력 유형 (key: category, 기본값 RATING)
  const [newItemTypes, setNewItemTypes] = useState<Record<string, ChecklistInputType>>({});
  // 항목 편집
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingType, setEditingType] = useState<ChecklistInputType>('RATING');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getChecklistTemplates().then(setTemplates).catch(() => {});
  }, []);

  const tabItems = useMemo(() =>
    templates
      .filter(t => t.visitType === activeTab)
      .sort((a, b) => a.displayOrder - b.displayOrder),
    [templates, activeTab]
  );

  const orderedCategories = useMemo(() => {
    const seen = new Map<string, true>();
    const order: string[] = [];
    for (const t of tabItems) {
      const cat = t.category || '';
      if (!seen.has(cat)) { seen.set(cat, true); order.push(cat); }
    }
    const nocat = order.indexOf('');
    if (nocat !== -1 && nocat !== order.length - 1) {
      order.splice(nocat, 1);
      order.push('');
    }
    return order;
  }, [tabItems]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, ChecklistTemplate[]>();
    for (const t of tabItems) {
      const cat = t.category || '';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return map;
  }, [tabItems]);

  const [pendingCats, setPendingCats] = useState<string[]>([]);

  const allCategories = useMemo(() => {
    const result = [...orderedCategories];
    for (const pc of pendingCats) {
      if (!result.includes(pc)) result.splice(result.length - (result.includes('') ? 1 : 0), 0, pc);
    }
    return result;
  }, [orderedCategories, pendingCats]);

  const handleAddCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    if (allCategories.includes(name)) { setNewCatName(''); return; }
    setPendingCats(prev => [...prev, name]);
    setNewCatName('');
  };

  const handleDeleteCategory = async (cat: string) => {
    const items = itemsByCategory.get(cat) || [];
    const label = cat || '미분류';
    if (items.length > 0) {
      if (!window.confirm(`"${label}" 카테고리의 항목 ${items.length}개를 모두 삭제합니다. 해당 항목의 모든 단지 체크 결과도 삭제됩니다.`)) return;
    }
    try {
      await Promise.all(items.map(t => deleteChecklistTemplate(t.id)));
      setTemplates(prev => prev.filter(t => !(t.visitType === activeTab && (t.category || '') === cat)));
    } catch {}
    setPendingCats(prev => prev.filter(c => c !== cat));
  };

  const handleAddItem = async (cat: string) => {
    const name = (newItemInputs[cat] || '').trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const inputType = newItemTypes[cat] || 'RATING';
      const maxOrder = (itemsByCategory.get(cat) || []).reduce((m, t) => Math.max(m, t.displayOrder), -1);
      const created = await createChecklistTemplate({
        visitType: activeTab,
        category: cat || undefined,
        itemName: name,
        displayOrder: maxOrder + 1,
        inputType,
      });
      setTemplates(prev => [...prev, created]);
      setNewItemInputs(prev => ({ ...prev, [cat]: '' }));
      setPendingCats(prev => prev.filter(c => c !== cat));
    } catch {}
    setSaving(false);
  };

  const handleEditSave = async (id: number) => {
    if (!editingName.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await updateChecklistTemplate(id, { itemName: editingName.trim(), inputType: editingType });
      setTemplates(prev => prev.map(t => t.id === id ? updated : t));
      setEditingId(null);
    } catch {}
    setSaving(false);
  };

  const handleDeleteItem = async (id: number, itemName: string) => {
    if (!window.confirm(`"${itemName}" 항목을 삭제하면 모든 단지의 해당 체크 결과도 삭제됩니다.`)) return;
    try {
      await deleteChecklistTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch {}
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 700, color: '#5f6368', marginBottom: '5px',
  };
  const catHeaderStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '5px 0', marginBottom: '3px',
  };
  const itemRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '5px 0', borderBottom: '1px solid #f5f5f5',
  };

  // 입력 유형 토글 버튼 (작은 세그먼트)
  const InputTypeToggle: React.FC<{
    value: ChecklistInputType;
    onChange: (v: ChecklistInputType) => void;
  }> = ({ value, onChange }) => (
    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
      {INPUT_TYPES.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          style={{
            padding: '2px 6px', fontSize: '10px', fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${value === t.key ? t.color : '#dadce0'}`,
            borderRadius: '3px',
            backgroundColor: value === t.key ? t.color : '#fff',
            color: value === t.key ? '#fff' : '#5f6368',
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{
      width: isMobile ? '100%' : '320px', height: '100%',
      backgroundColor: '#fff', borderLeft: isMobile ? 'none' : '1px solid #e8eaed',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #e8eaed',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#202124' }}>체크리스트 항목 관리</span>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#80868b', padding: 0 }}>×</button>
      </div>

      {/* visitType 탭 */}
      <div style={{ display: 'flex', gap: '5px', padding: '10px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        {VISIT_TYPES.map(vt => {
          const cnt = templates.filter(t => t.visitType === vt.key).length;
          const isActive = activeTab === vt.key;
          return (
            <button key={vt.key} onClick={() => { setActiveTab(vt.key); setPendingCats([]); }}
              style={{
                padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                border: '1.5px solid', borderColor: isActive ? '#89CFF0' : '#dadce0',
                borderRadius: '14px',
                backgroundColor: isActive ? '#89CFF0' : '#fff',
                color: isActive ? '#fff' : '#5f6368',
              }}>
              {vt.label}
              <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.8 }}>({cnt})</span>
            </button>
          );
        })}
      </div>

      {/* 카테고리별 항목 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
        {allCategories.length === 0 && (
          <p style={{ fontSize: '12px', color: '#9aa0a6', padding: '8px 0' }}>
            아래에서 카테고리를 추가하세요.
          </p>
        )}

        {allCategories.map(cat => {
          const catItems = itemsByCategory.get(cat) || [];
          const isPending = pendingCats.includes(cat);
          const label = cat || '미분류';
          const newItemVal = newItemInputs[cat] || '';
          const newItemType = newItemTypes[cat] || 'RATING';

          return (
            <div key={cat} style={{ marginBottom: '14px' }}>
              {/* 카테고리 헤더 */}
              <div style={catHeaderStyle}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#344054' }}>
                  {label}
                  <span style={{ fontWeight: 400, color: '#9aa0a6', marginLeft: '4px' }}>({catItems.length})</span>
                </span>
                {cat !== '' && (
                  <button onClick={() => handleDeleteCategory(cat)}
                    style={{ border: '1px solid #fadbd8', borderRadius: '4px', background: '#fff', color: '#F08080', fontSize: '10px', padding: '2px 6px', cursor: 'pointer' }}>
                    카테고리 삭제
                  </button>
                )}
              </div>

              {/* 항목 목록 */}
              {catItems.map(t => (
                <div key={t.id} style={itemRowStyle}>
                  {editingId === t.id ? (
                    <>
                      <input
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleEditSave(t.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        style={{ flex: 1, fontSize: '12px', padding: '3px 6px', border: '1px solid #1a73e8', borderRadius: '4px', outline: 'none' }}
                      />
                      <InputTypeToggle value={editingType} onChange={setEditingType} />
                      <button onClick={() => handleEditSave(t.id)}
                        style={{ fontSize: '11px', padding: '3px 7px', border: 'none', borderRadius: '4px', backgroundColor: '#89CFF0', color: '#1a3a5c', cursor: 'pointer', whiteSpace: 'nowrap' }}>저장</button>
                      <button onClick={() => setEditingId(null)}
                        style={{ fontSize: '11px', padding: '3px 7px', border: '1px solid #dadce0', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>취소</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: '12px', color: '#202124' }}>{t.itemName}</span>
                      {/* 입력 유형 배지 */}
                      <span style={inputTypeBadge(t.inputType)}>
                        {INPUT_TYPES.find(x => x.key === (t.inputType || 'RATING'))?.label}
                      </span>
                      <button onClick={() => { setEditingId(t.id); setEditingName(t.itemName); setEditingType((t.inputType || 'RATING') as ChecklistInputType); }}
                        style={{ border: '1px solid #dadce0', borderRadius: '4px', background: '#fff', color: '#80868b', fontSize: '11px', padding: '2px 5px', cursor: 'pointer' }}>✏</button>
                      <button onClick={() => handleDeleteItem(t.id, t.itemName)}
                        style={{ border: '1px solid #fadbd8', borderRadius: '4px', background: '#fff', color: '#F08080', fontSize: '11px', padding: '2px 5px', cursor: 'pointer' }}>×</button>
                    </>
                  )}
                </div>
              ))}

              {isPending && catItems.length === 0 && (
                <div style={{ fontSize: '11px', color: '#bdbdbd', padding: '4px 0' }}>아래에서 항목을 추가하세요.</div>
              )}

              {/* 항목 추가 — 입력 유형 토글 + 이름 입력 */}
              <div style={{ marginTop: '6px' }}>
                <div style={{ marginBottom: '4px' }}>
                  <InputTypeToggle
                    value={newItemType}
                    onChange={v => setNewItemTypes(prev => ({ ...prev, [cat]: v }))}
                  />
                </div>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <input
                    value={newItemVal}
                    onChange={e => setNewItemInputs(prev => ({ ...prev, [cat]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddItem(cat); }}
                    placeholder="항목 추가... (Enter)"
                    style={{
                      flex: 1, fontSize: '11px', padding: '4px 7px',
                      border: '1px solid #dadce0', borderRadius: '5px', outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => handleAddItem(cat)}
                    disabled={!newItemVal.trim() || saving}
                    style={{
                      padding: '4px 9px', fontSize: '11px', fontWeight: 600, border: 'none', borderRadius: '5px',
                      backgroundColor: newItemVal.trim() ? '#89CFF0' : '#f1f3f4',
                      color: newItemVal.trim() ? '#fff' : '#9aa0a6',
                      cursor: newItemVal.trim() ? 'pointer' : 'not-allowed',
                    }}>추가</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 카테고리 추가 입력 */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
        <div style={labelStyle}>+ 카테고리 추가</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddCategory(); }}
            placeholder="카테고리 이름... (Enter)"
            style={{
              flex: 1, fontSize: '12px', padding: '6px 8px',
              border: '1px solid #dadce0', borderRadius: '6px', outline: 'none',
            }}
          />
          <button
            onClick={handleAddCategory}
            disabled={!newCatName.trim()}
            style={{
              padding: '6px 12px', fontSize: '12px', fontWeight: 600, border: 'none', borderRadius: '6px',
              backgroundColor: newCatName.trim() ? '#89CFF0' : '#f1f3f4',
              color: newCatName.trim() ? '#fff' : '#9aa0a6',
              cursor: newCatName.trim() ? 'pointer' : 'not-allowed',
            }}>추가</button>
        </div>
      </div>
    </div>
  );
};

export default ChecklistTemplatePanel;
