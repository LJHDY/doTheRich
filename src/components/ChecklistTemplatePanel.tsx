import React, { useState, useEffect } from 'react';
import { ChecklistTemplate } from '../types';
import {
  getChecklistTemplates, createChecklistTemplate,
  updateChecklistTemplate, deleteChecklistTemplate,
} from '../services/api';

const VISIT_TYPES = [
  { key: 'ATMOSPHERE' as const, label: '분위기' },
  { key: 'COMPLEX'    as const, label: '단지' },
  { key: 'PROPERTY'  as const, label: '매물' },
];

type VisitTypeKey = 'ATMOSPHERE' | 'COMPLEX' | 'PROPERTY';

interface Props {
  onClose: () => void;
}

const ChecklistTemplatePanel: React.FC<Props> = ({ onClose }) => {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<VisitTypeKey>('ATMOSPHERE');
  const [newItemName, setNewItemName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getChecklistTemplates().then(setTemplates).catch(() => {});
  }, []);

  const tabItems = templates
    .filter(t => t.visitType === activeTab)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const handleAdd = async () => {
    const name = newItemName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const maxOrder = tabItems.reduce((m, t) => Math.max(m, t.displayOrder), -1);
      const created = await createChecklistTemplate({ visitType: activeTab, itemName: name, displayOrder: maxOrder + 1 });
      setTemplates(prev => [...prev, created]);
      setNewItemName('');
    } catch { }
    finally { setSaving(false); }
  };

  const handleEditSave = async (id: number) => {
    if (!editingName.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await updateChecklistTemplate(id, { itemName: editingName.trim() });
      setTemplates(prev => prev.map(t => t.id === id ? updated : t));
      setEditingId(null);
    } catch { }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number, itemName: string) => {
    if (!window.confirm(`"${itemName}" 항목을 삭제하면 모든 단지의 해당 체크 결과도 삭제됩니다. 계속하시겠습니까?`)) return;
    try {
      await deleteChecklistTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch { }
  };

  return (
    <div style={{
      width: '300px', height: '100%',
      backgroundColor: '#fff', borderLeft: '1px solid #e8eaed',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #e8eaed',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#202124' }}>체크리스트 항목 관리</span>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#80868b', padding: 0 }}>×</button>
      </div>

      {/* 타입 탭 */}
      <div style={{ display: 'flex', gap: '6px', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        {VISIT_TYPES.map(vt => (
          <button key={vt.key} onClick={() => setActiveTab(vt.key)}
            style={{
              padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              border: '1.5px solid',
              borderColor: activeTab === vt.key ? '#1a73e8' : '#dadce0',
              borderRadius: '14px',
              backgroundColor: activeTab === vt.key ? '#1a73e8' : '#fff',
              color: activeTab === vt.key ? '#fff' : '#5f6368',
            }}>
            {vt.label}
            <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.8 }}>
              ({templates.filter(t => t.visitType === vt.key).length})
            </span>
          </button>
        ))}
      </div>

      {/* 항목 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
        {tabItems.length === 0 && (
          <p style={{ fontSize: '12px', color: '#9aa0a6', padding: '8px 0' }}>등록된 항목이 없습니다.</p>
        )}
        {tabItems.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
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
                  style={{ flex: 1, fontSize: '12px', padding: '4px 6px', border: '1px solid #1a73e8', borderRadius: '4px', outline: 'none' }}
                />
                <button onClick={() => handleEditSave(t.id)}
                  style={{ fontSize: '11px', padding: '3px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#1a73e8', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>저장</button>
                <button onClick={() => setEditingId(null)}
                  style={{ fontSize: '11px', padding: '3px 8px', border: '1px solid #dadce0', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>취소</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: '13px', color: '#202124' }}>{t.itemName}</span>
                <button onClick={() => { setEditingId(t.id); setEditingName(t.itemName); }}
                  style={{ border: '1px solid #dadce0', borderRadius: '4px', background: '#fff', color: '#80868b', fontSize: '11px', padding: '2px 6px', cursor: 'pointer' }}>✏</button>
                <button onClick={() => handleDelete(t.id, t.itemName)}
                  style={{ border: '1px solid #fadbd8', borderRadius: '4px', background: '#fff', color: '#ea4335', fontSize: '12px', padding: '2px 6px', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* 항목 추가 입력창 */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: '6px', flexShrink: 0 }}>
        <input
          value={newItemName}
          onChange={e => setNewItemName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd(); }}
          placeholder="항목 추가... (Enter)"
          style={{
            flex: 1, fontSize: '12px', padding: '6px 8px',
            border: '1px solid #dadce0', borderRadius: '6px', outline: 'none',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!newItemName.trim() || saving}
          style={{
            padding: '6px 12px', fontSize: '12px', fontWeight: 600, border: 'none', borderRadius: '6px',
            backgroundColor: newItemName.trim() ? '#1a73e8' : '#f1f3f4',
            color: newItemName.trim() ? '#fff' : '#9aa0a6',
            cursor: newItemName.trim() ? 'pointer' : 'not-allowed',
          }}>추가</button>
      </div>
    </div>
  );
};

export default ChecklistTemplatePanel;
