import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Contact } from '../../types';
import { createContact, deleteContact, getContacts, updateContact } from '../../services/api';

// ── 상수 ────────────────────────────────────────────────────────────────────

type ContactType = '부동산' | '대출상담사';
const TABS: ContactType[] = ['부동산', '대출상담사'];

const TAB_COLOR: Record<ContactType, { active: string; bg: string; light: string }> = {
  '부동산':    { active: '#2a6090', bg: '#D4EFFC', light: '#eaf5fd' },
  '대출상담사': { active: '#5AAF84', bg: '#e6f4ea', light: '#f0faf4' },
};

// ── 빈 폼 ────────────────────────────────────────────────────────────────────

const emptyForm = (type: ContactType) => ({
  type,
  name: '',
  company: '',
  phone: '',
  region: '',
  memo: '',
});

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function ContactsModal({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<ContactType>('부동산');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // 추가/수정 폼 상태
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm(activeTab));
  const [saving, setSaving] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  // ── 데이터 로드 ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setContacts(await getContacts());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 폼 열릴 때 첫 번째 입력에 포커스
  useEffect(() => {
    if (formOpen) setTimeout(() => nameRef.current?.focus(), 50);
  }, [formOpen]);

  // ── 폼 열기/닫기 ────────────────────────────────────────────────────────────
  const openAddForm = () => {
    setEditId(null);
    setForm(emptyForm(activeTab));
    setFormOpen(true);
  };

  const openEditForm = (c: Contact) => {
    setEditId(c.id);
    setForm({ type: c.type as ContactType, name: c.name, company: c.company ?? '', phone: c.phone ?? '', region: c.region ?? '', memo: c.memo ?? '' });
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditId(null); };

  // ── 저장 ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { alert('이름을 입력해 주세요.'); return; }
    setSaving(true);
    try {
      const payload = {
        type: form.type as ContactType,
        name: form.name.trim(),
        company: form.company.trim() || undefined,
        phone: form.phone.trim() || undefined,
        region: form.region.trim() || undefined,
        memo: form.memo.trim() || undefined,
      };
      if (editId !== null) {
        const updated = await updateContact(editId, payload);
        setContacts(prev => prev.map(c => c.id === editId ? updated : c));
      } else {
        const created = await createContact(payload);
        setContacts(prev => [...prev, created]);
      }
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  // ── 삭제 ────────────────────────────────────────────────────────────────────
  const handleDelete = async (c: Contact) => {
    if (!window.confirm(`"${c.name}" 연락처를 삭제하시겠습니까?`)) return;
    await deleteContact(c.id);
    setContacts(prev => prev.filter(x => x.id !== c.id));
    if (editId === c.id) closeForm();
  };

  // ── 렌더 헬퍼 ───────────────────────────────────────────────────────────────
  const filtered = contacts.filter(c => c.type === activeTab);
  const col = TAB_COLOR[activeTab];

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: '13px',
    border: '1px solid #dadce0', borderRadius: '6px', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px',
        width: '100%', maxWidth: '620px',
        maxHeight: '86vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
      }}>

        {/* ── 헤더 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 0', flexShrink: 0,
        }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c' }}>📋 연락처</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9e9e9e', padding: '0 4px' }}>×</button>
        </div>

        {/* ── 탭 ── */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 20px 0', flexShrink: 0 }}>
          {TABS.map(tab => {
            const c = TAB_COLOR[tab];
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); closeForm(); }}
                style={{
                  padding: '6px 18px', fontSize: '13px', fontWeight: 600,
                  border: '1px solid', borderColor: isActive ? c.active : '#dadce0',
                  borderRadius: '20px', cursor: 'pointer',
                  backgroundColor: isActive ? c.bg : '#fff',
                  color: isActive ? c.active : '#5f6368',
                  transition: 'all 0.15s',
                }}
              >{tab}</button>
            );
          })}
          <div style={{ flex: 1 }} />
          {!formOpen && (
            <button
              onClick={openAddForm}
              style={{
                padding: '6px 16px', fontSize: '13px', fontWeight: 600,
                border: `1px solid ${col.active}`, borderRadius: '20px', cursor: 'pointer',
                backgroundColor: col.bg, color: col.active,
              }}
            >+ 추가</button>
          )}
        </div>

        {/* ── 추가/수정 폼 ── */}
        {formOpen && (
          <div style={{
            margin: '12px 20px 0', padding: '16px',
            backgroundColor: col.light, borderRadius: '10px',
            border: `1px solid ${col.bg}`, flexShrink: 0,
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: col.active, marginBottom: '12px' }}>
              {editId !== null ? '✏ 수정' : '+ 새 연락처 추가'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {/* 이름 */}
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>이름 *</label>
                <input ref={nameRef} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="담당자 이름" style={inputStyle} />
              </div>
              {/* 회사 */}
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>회사/사무소</label>
                <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                  placeholder="회사 또는 사무소명" style={inputStyle} />
              </div>
              {/* 전화번호 */}
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>전화번호</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="010-0000-0000" style={inputStyle} />
              </div>
              {/* 담당 지역 */}
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>담당 지역</label>
                <input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                  placeholder="예: 마포, 용산" style={inputStyle} />
              </div>
            </div>
            {/* 메모 */}
            <div style={{ marginTop: '8px' }}>
              <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>메모</label>
              <textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="특이사항, 장단점 등 자유롭게 기록"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
              <button onClick={closeForm} style={{ padding: '7px 16px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', cursor: 'pointer', color: '#5f6368' }}>취소</button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '7px 18px', fontSize: '13px', fontWeight: 600, border: 'none', borderRadius: '6px', background: col.active, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        )}

        {/* ── 목록 ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#9e9e9e', padding: '40px 0', fontSize: '14px' }}>불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#bdbdbd', padding: '48px 0', fontSize: '14px' }}>
              {activeTab} 연락처가 없습니다.<br />
              <span style={{ fontSize: '12px' }}>위 "+ 추가" 버튼으로 등록해 보세요.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map(c => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  col={col}
                  onEdit={() => openEditForm(c)}
                  onDelete={() => handleDelete(c)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 연락처 카드 컴포넌트 ─────────────────────────────────────────────────────

interface CardProps {
  contact: Contact;
  col: { active: string; bg: string; light: string };
  onEdit: () => void;
  onDelete: () => void;
}

function ContactCard({ contact, col, onEdit, onDelete }: CardProps) {
  return (
    <div style={{
      border: '1px solid #e8eaed', borderRadius: '10px',
      padding: '14px 16px', backgroundColor: '#fafbfc',
      display: 'flex', gap: '12px', alignItems: 'flex-start',
    }}>
      {/* 아바타 */}
      <div style={{
        width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
        backgroundColor: col.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '18px', color: col.active, fontWeight: 700,
      }}>
        {contact.name.charAt(0)}
      </div>

      {/* 내용 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a2e' }}>{contact.name}</span>
          {contact.company && (
            <span style={{ fontSize: '12px', color: '#5f6368' }}>{contact.company}</span>
          )}
          {contact.region && (
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '1px 8px',
              backgroundColor: col.bg, color: col.active, borderRadius: '10px',
            }}>{contact.region}</span>
          )}
        </div>
        {contact.phone && (
          <a href={`tel:${contact.phone}`} style={{ fontSize: '13px', color: col.active, textDecoration: 'none', display: 'block', marginTop: '4px' }}>
            📞 {contact.phone}
          </a>
        )}
        {contact.memo && (
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#757575', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {contact.memo}
          </p>
        )}
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <button onClick={onEdit} style={{ padding: '4px 8px', fontSize: '12px', border: `1px solid ${col.active}`, borderRadius: '6px', background: '#fff', color: col.active, cursor: 'pointer' }}>✏</button>
        <button onClick={onDelete} style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #E06060', borderRadius: '6px', background: '#fff', color: '#E06060', cursor: 'pointer' }}>×</button>
      </div>
    </div>
  );
}
