import React, { useEffect, useRef, useState } from 'react';
import { CommonCode, Schedule } from '../../types';
import { createSchedule, deleteSchedule, getCommonCodes, updateSchedule } from '../../services/api';
import { BUDGET_USER_STORAGE_KEY, BUDGET_USERS } from '../budget/budgetConstants';

interface Props {
  date: string;               // "YYYY-MM-DD"
  schedules: Schedule[];      // 해당 날짜의 기존 일정 목록
  onClose: () => void;
  onSaved: () => void;        // 저장/삭제 후 부모 리로드 트리거
}

// 일정 작성자 옵션 — 동영/주해/공통
export const SCHEDULE_USERS = [
  { id: 'ldy',    label: '🐴 동영' },
  { id: 'juhae',  label: '☀️ 주해' },
  { id: 'common', label: '❤️ 공통' },
] as const;

export const USER_EMOJI: Record<string, string> = {
  ldy:    '🐴',
  juhae:  '☀️',
  common: '❤️',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '13px',
  border: '1px solid #dadce0', borderRadius: '6px',
  outline: 'none', boxSizing: 'border-box',
};

const BTN = (active: boolean, color?: string): React.CSSProperties => ({
  padding: '7px 14px', fontSize: '13px', fontWeight: 600, borderRadius: '6px',
  border: `1px solid ${active ? (color ?? '#89CFF0') : '#dadce0'}`,
  background: active ? (color ?? '#89CFF0') : '#fff',
  color: active ? '#fff' : '#5f6368', cursor: 'pointer',
});

// 작성자별 버튼 색상
const USER_COLOR: Record<string, string> = {
  ldy:    '#89CFF0',
  juhae:  '#FFD97D',
  common: '#E06060',
};

const REPEAT_OPTIONS = [
  { value: '',        label: '반복 없음' },
  { value: 'weekly',  label: '매주' },
  { value: 'monthly', label: '매달' },
  { value: 'yearly',  label: '매년' },
];

const emptyForm = (date: string, userId: string) => ({
  userId, title: '', description: '', eventDate: date, endDate: '', eventTime: '',
  category: '', repeatType: '', pushToNaver: true,
});

const ScheduleFormModal: React.FC<Props> = ({ date, schedules, onClose, onSaved }) => {
  const defaultUserId = localStorage.getItem(BUDGET_USER_STORAGE_KEY) || BUDGET_USERS[0].id;
  const [catCodes, setCatCodes] = useState<CommonCode[]>([]);
  const [form, setForm] = useState(emptyForm(date, defaultUserId));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCommonCodes('CALENDAR_CATEGORY').then(codes =>
      setCatCodes([...codes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
    ).catch(() => {});
    titleRef.current?.focus();
  }, []);

  const codeToName = (code: string | null) =>
    catCodes.find(c => c.detailCode === code)?.detailCodeName ?? code ?? '';

  const resetForm = () => {
    setForm(emptyForm(date, defaultUserId));
    setEditingId(null);
  };

  const startEdit = (s: Schedule) => {
    setEditingId(s.id);
    setForm({
      userId:      s.userId,
      title:       s.title,
      description: s.description || '',
      eventDate:   s.eventDate,
      endDate:     s.endDate || '',
      eventTime:   s.eventTime || '',
      category:    s.category || '',
      repeatType:  s.repeatType || '',
      pushToNaver: true,
    });
    titleRef.current?.focus();
  };

  const handleSave = async () => {
    if (!form.title.trim()) { alert('제목을 입력해주세요.'); return; }
    setSaving(true);
    try {
      // endDate가 시작일과 같거나 비어있으면 단일일로 처리
      const endDate = form.endDate && form.endDate > form.eventDate ? form.endDate : undefined;
      const payload = {
        userId:      form.userId,
        title:       form.title.trim(),
        description: form.description.trim() || undefined,
        eventDate:   form.eventDate,
        endDate,
        eventTime:   form.eventTime || undefined,
        category:    form.category || undefined,
        repeatType:  form.repeatType || undefined,
        pushToNaver: form.pushToNaver,
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
                    {/* 작성자 이모지 */}
                    <span style={{ fontSize: '14px' }}>{USER_EMOJI[s.userId] ?? ''}</span>
                    {s.eventTime && (
                      <span style={{ fontSize: '11px', color: '#5f6368', background: '#e8ecf0', borderRadius: '4px', padding: '1px 5px' }}>
                        {s.eventTime}
                      </span>
                    )}
                    {s.category && (
                      <span style={{ fontSize: '11px', color: '#1565c0', background: '#e8f0fe', borderRadius: '4px', padding: '1px 5px' }}>
                        {codeToName(s.category)}
                      </span>
                    )}
                    {s.repeatType && (
                      <span style={{ fontSize: '11px', color: '#6a1b9a', background: '#f3e5f5', borderRadius: '4px', padding: '1px 5px' }}>
                        {REPEAT_OPTIONS.find(o => o.value === s.repeatType)?.label ?? s.repeatType}
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

          {/* 작성자 선택 — 동영/주해/공통 */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {SCHEDULE_USERS.map(u => (
              <button
                key={u.id}
                onClick={() => setForm(f => ({ ...f, userId: u.id }))}
                style={BTN(form.userId === u.id, USER_COLOR[u.id])}
              >
                {u.label}
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

          {/* 날짜 범위 — 시작일 ~ 종료일 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="date"
              value={form.eventDate}
              onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            <span style={{ fontSize: '12px', color: '#9aa0a6', flexShrink: 0 }}>~</span>
            <input
              type="date"
              value={form.endDate}
              min={form.eventDate}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              style={{ ...INPUT_STYLE, flex: 1 }}
              placeholder="종료일 (선택)"
            />
          </div>

          {/* 시간 + 카테고리 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="time"
              value={form.eventTime}
              onChange={e => setForm(f => ({ ...f, eventTime: e.target.value }))}
              style={{ ...INPUT_STYLE, flex: '0 0 110px' }}
            />
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ ...INPUT_STYLE, flex: 1 }}
            >
              <option value="">카테고리</option>
              {catCodes.map(c => (
                <option key={c.detailCode} value={c.detailCode}>
                  {c.detailCodeName}
                </option>
              ))}
            </select>
            {/* 반복 설정 */}
            <select
              value={form.repeatType}
              onChange={e => setForm(f => ({ ...f, repeatType: e.target.value }))}
              style={{ ...INPUT_STYLE, flex: '0 0 90px' }}
            >
              {REPEAT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
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

          {/* 네이버 캘린더 연동 여부 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#344054' }}>
            <input
              type="checkbox"
              checked={form.pushToNaver}
              onChange={e => setForm(f => ({ ...f, pushToNaver: e.target.checked }))}
              style={{ width: '15px', height: '15px', accentColor: '#03C75A', cursor: 'pointer' }}
            />
            <span>N 네이버 캘린더에 등록</span>
          </label>

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
              border: 'none',
              background: USER_COLOR[form.userId] ?? '#89CFF0',
              color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}>{saving ? '저장 중…' : editingId ? '수정' : '추가'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleFormModal;
