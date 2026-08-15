import React, { useEffect, useRef, useState } from 'react';
import { Schedule } from '../types';
import { createSchedule, deleteSchedule, getCommonCodes, updateSchedule } from '../services/api';
import { BUDGET_USER_STORAGE_KEY, BUDGET_USERS } from '../constants/budgetConstants';

interface Props {
  date: string;               // "YYYY-MM-DD"
  schedules: Schedule[];      // 해당 날짜의 기존 일정 목록
  onClose: () => void;
  onSaved: () => void;        // 저장/삭제 후 부모 리로드 트리거
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '13px',
  border: '1px solid #dadce0', borderRadius: '6px',
  outline: 'none', boxSizing: 'border-box',
};

const BTN = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px',
  border: `1px solid ${active ? '#89CFF0' : '#dadce0'}`,
  background: active ? '#89CFF0' : '#fff',
  color: active ? '#fff' : '#5f6368', cursor: 'pointer',
});

const emptyForm = (date: string, userId: string) => ({
  userId, title: '', description: '', eventDate: date, eventTime: '', category: '',
});

const ScheduleFormModal: React.FC<Props> = ({ date, schedules, onClose, onSaved }) => {
  const userId = localStorage.getItem(BUDGET_USER_STORAGE_KEY) || BUDGET_USERS[0].id;
  const [categories, setCategories] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm(date, userId));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // SCHEDULE_CATEGORY 공통코드 로드
    getCommonCodes('SCHEDULE_CATEGORY').then(codes =>
      setCategories(codes.map(c => c.detailCodeName))
    ).catch(() => {});
    titleRef.current?.focus();
  }, []);

  const resetForm = () => {
    setForm(emptyForm(date, userId));
    setEditingId(null);
  };

  const startEdit = (s: Schedule) => {
    setEditingId(s.id);
    setForm({
      userId: s.userId,
      title: s.title,
      description: s.description || '',
      eventDate: s.eventDate,
      eventTime: s.eventTime || '',
      category: s.category || '',
    });
    titleRef.current?.focus();
  };

  const handleSave = async () => {
    if (!form.title.trim()) { alert('제목을 입력해주세요.'); return; }
    setSaving(true);
    try {
      const payload = {
        userId:      form.userId,
        title:       form.title.trim(),
        description: form.description.trim() || undefined,
        eventDate:   form.eventDate,
        eventTime:   form.eventTime || undefined,
        category:    form.category || undefined,
      };
      if (editingId) {
        await updateSchedule(editingId, payload);
      } else {
        await createSchedule(payload);
      }
      resetForm();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 일정을 삭제하시겠습니까?')) return;
    await deleteSchedule(id);
    if (editingId === id) resetForm();
    onSaved();
  };

  const formattedDate = (() => {
    const [y, m, d] = date.split('-');
    return `${y}년 ${Number(m)}월 ${Number(d)}일`;
  })();

  const userLabel = BUDGET_USERS.find(u => u.id === form.userId)?.name ?? form.userId;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 11000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '460px',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#1a3a5c' }}>
            📅 {formattedDate}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#9aa0a6' }}>×</button>
        </div>

        {/* 기존 일정 목록 */}
        {schedules.length > 0 && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: '12px', color: '#9aa0a6', marginBottom: '8px', fontWeight: 600 }}>
              등록된 일정 ({schedules.length}건)
            </div>
            {schedules.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                padding: '8px 10px', marginBottom: '6px', borderRadius: '8px',
                background: editingId === s.id ? '#e8f0fe' : '#f9f9fb',
                border: `1px solid ${editingId === s.id ? '#89CFF0' : '#eee'}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {s.eventTime && (
                      <span style={{ fontSize: '11px', color: '#5f6368', background: '#e8ecf0', borderRadius: '4px', padding: '1px 5px' }}>
                        {s.eventTime}
                      </span>
                    )}
                    {s.category && (
                      <span style={{ fontSize: '11px', color: '#1565c0', background: '#e8f0fe', borderRadius: '4px', padding: '1px 5px' }}>
                        {s.category}
                      </span>
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a3a5c' }}>{s.title}</span>
                  </div>
                  {s.description && (
                    <div style={{ fontSize: '12px', color: '#5f6368', marginTop: '3px' }}>{s.description}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button onClick={() => startEdit(s)} style={{
                    padding: '3px 8px', fontSize: '11px', borderRadius: '5px',
                    border: '1px solid #dadce0', background: '#fff', cursor: 'pointer', color: '#344054',
                  }}>✏</button>
                  <button onClick={() => handleDelete(s.id)} style={{
                    padding: '3px 8px', fontSize: '11px', borderRadius: '5px',
                    border: '1px solid #fcc', background: '#fff8f8', cursor: 'pointer', color: '#c00',
                  }}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 입력 폼 */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: '#9aa0a6', fontWeight: 600 }}>
            {editingId ? '일정 수정' : '새 일정 추가'}
          </div>

          {/* 유저 선택 */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {BUDGET_USERS.map(u => (
              <button key={u.id} onClick={() => setForm(f => ({ ...f, userId: u.id }))} style={BTN(form.userId === u.id)}>
                {u.name}
              </button>
            ))}
          </div>

          {/* 제목 */}
          <input
            ref={titleRef}
            placeholder="제목 *"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSave(); }}
            style={INPUT_STYLE}
          />

          {/* 시간 + 카테고리 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="time"
              value={form.eventTime}
              onChange={e => setForm(f => ({ ...f, eventTime: e.target.value }))}
              style={{ ...INPUT_STYLE, flex: '0 0 120px' }}
            />
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ ...INPUT_STYLE, flex: 1 }}
            >
              <option value="">카테고리 선택</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* 설명 */}
          <textarea
            placeholder="설명 (선택)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit' }}
          />

          {/* 버튼 */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            {editingId && (
              <button onClick={resetForm} style={{
                padding: '8px 16px', fontSize: '13px', borderRadius: '6px',
                border: '1px solid #dadce0', background: '#fff', cursor: 'pointer', color: '#5f6368',
              }}>취소</button>
            )}
            <button onClick={handleSave} disabled={saving} style={{
              padding: '8px 20px', fontSize: '13px', fontWeight: 700, borderRadius: '6px',
              border: 'none', background: '#89CFF0', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}>{saving ? '저장 중…' : editingId ? '수정' : '추가'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleFormModal;
