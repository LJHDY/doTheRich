import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConsultationLog, Contact } from '../../types';
import {
  createConsultationLog, createContact, deleteConsultationAudio,
  deleteConsultationLog, deleteContact, getConsultationLogs,
  getContacts, updateConsultationLog, updateContact, uploadConsultationAudio,
} from '../../services/api';

// ── 상수 ─────────────────────────────────────────────────────────────────────

type ContactType = '부동산' | '대출상담사';
const TABS: ContactType[] = ['부동산', '대출상담사'];

const TAB_COLOR: Record<ContactType, { active: string; bg: string; light: string }> = {
  '부동산':    { active: '#2a6090', bg: '#D4EFFC', light: '#eaf5fd' },
  '대출상담사': { active: '#5AAF84', bg: '#e6f4ea', light: '#f0faf4' },
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyContactForm = (type: ContactType) => ({
  type, company: '', name: '', phone: '', region: '', memo: '',
});

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: '13px',
  border: '1px solid #dadce0', borderRadius: '6px', outline: 'none',
  boxSizing: 'border-box',
};

// ── 메인 모달 ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function ContactsModal({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<ContactType>('부동산');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // 연락처 추가/수정 폼
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyContactForm(activeTab));
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // 펼쳐진 연락처 (상담 기록 표시)
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setContacts(await getContacts()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (formOpen) setTimeout(() => nameRef.current?.focus(), 50); }, [formOpen]);

  const openAddForm = () => {
    setEditId(null);
    setForm(emptyContactForm(activeTab));
    setFormOpen(true);
    setExpandedId(null);
  };

  const openEditForm = (c: Contact) => {
    setEditId(c.id);
    setForm({ type: c.type as ContactType, company: c.company, name: c.name ?? '', phone: c.phone ?? '', region: c.region ?? '', memo: c.memo ?? '' });
    setFormOpen(true);
    setExpandedId(null);
  };

  const closeForm = () => { setFormOpen(false); setEditId(null); };

  const handleSave = async () => {
    if (!form.company.trim()) { alert('회사/사무소명을 입력해 주세요.'); return; }
    setSaving(true);
    try {
      const payload = {
        type: form.type as ContactType,
        company: form.company.trim(),
        name: form.name.trim() || undefined,
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

  const handleDelete = async (c: Contact) => {
    if (!window.confirm(`"${c.name}" 연락처와 모든 상담 기록을 삭제하시겠습니까?`)) return;
    await deleteContact(c.id);
    setContacts(prev => prev.filter(x => x.id !== c.id));
    if (editId === c.id) closeForm();
    if (expandedId === c.id) setExpandedId(null);
  };

  const col = TAB_COLOR[activeTab];
  const filtered = contacts.filter(c => c.type === activeTab);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px',
        width: '100%', maxWidth: '660px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0', flexShrink: 0 }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c' }}>📋 연락처</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9e9e9e' }}>×</button>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 20px 0', flexShrink: 0 }}>
          {TABS.map(tab => {
            const c = TAB_COLOR[tab];
            const isActive = activeTab === tab;
            return (
              <button key={tab} onClick={() => { setActiveTab(tab); closeForm(); setExpandedId(null); }}
                style={{
                  padding: '6px 18px', fontSize: '13px', fontWeight: 600,
                  border: '1px solid', borderColor: isActive ? c.active : '#dadce0',
                  borderRadius: '20px', cursor: 'pointer',
                  backgroundColor: isActive ? c.bg : '#fff',
                  color: isActive ? c.active : '#5f6368',
                }}
              >{tab}</button>
            );
          })}
          <div style={{ flex: 1 }} />
          {!formOpen && (
            <button onClick={openAddForm}
              style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 600, border: `1px solid ${col.active}`, borderRadius: '20px', cursor: 'pointer', backgroundColor: col.bg, color: col.active }}>
              + 추가
            </button>
          )}
        </div>

        {/* 연락처 추가/수정 폼 */}
        {formOpen && (
          <div style={{ margin: '12px 20px 0', padding: '16px', backgroundColor: col.light, borderRadius: '10px', border: `1px solid ${col.bg}`, flexShrink: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: col.active, marginBottom: '12px' }}>
              {editId !== null ? '✏ 수정' : '+ 새 연락처'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>회사/사무소 *</label>
                <input ref={nameRef} value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                  placeholder="회사명 또는 사무소명" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>담당자 이름</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="(선택)" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>전화번호</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="010-0000-0000" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>담당 지역</label>
                <input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                  placeholder="예: 마포, 용산" style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>메모</label>
              <textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="특이사항, 장단점 등" rows={2}
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

        {/* 목록 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#9e9e9e', padding: '40px 0', fontSize: '14px' }}>불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#bdbdbd', padding: '48px 0', fontSize: '14px' }}>
              {activeTab} 연락처가 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map(c => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  col={col}
                  expanded={expandedId === c.id}
                  onExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
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

// ── 연락처 카드 ───────────────────────────────────────────────────────────────

interface CardProps {
  contact: Contact;
  col: { active: string; bg: string; light: string };
  expanded: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ContactCard({ contact, col, expanded, onExpand, onEdit, onDelete }: CardProps) {
  return (
    <div style={{ border: '1px solid #e8eaed', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#fafbfc' }}>
      {/* 카드 헤더 */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px', cursor: 'pointer' }} onClick={onExpand}>
        {/* 아바타 */}
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
          backgroundColor: col.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', color: col.active, fontWeight: 700,
        }}>
          {contact.company.charAt(0)}
        </div>
        {/* 정보 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a2e' }}>{contact.company}</span>
            {contact.region && (
              <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 8px', backgroundColor: col.bg, color: col.active, borderRadius: '10px' }}>
                {contact.region}
              </span>
            )}
          </div>
          {contact.name && (
            <span style={{ fontSize: '12px', color: '#5f6368', display: 'block', marginTop: '2px' }}>{contact.name}</span>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} onClick={e => e.stopPropagation()}
              style={{ fontSize: '13px', color: col.active, textDecoration: 'none', display: 'block', marginTop: '3px' }}>
              📞 {contact.phone}
            </a>
          )}
          {contact.memo && (
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#757575', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {contact.memo}
            </p>
          )}
        </div>
        {/* 액션 버튼 */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={onEdit}
            style={{ padding: '4px 8px', fontSize: '12px', border: `1px solid ${col.active}`, borderRadius: '6px', background: '#fff', color: col.active, cursor: 'pointer' }}>✏</button>
          <button onClick={onDelete}
            style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #E06060', borderRadius: '6px', background: '#fff', color: '#E06060', cursor: 'pointer' }}>×</button>
        </div>
        {/* 펼침 화살표 */}
        <span style={{ fontSize: '12px', color: '#9e9e9e', flexShrink: 0, marginTop: '4px' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* 상담 기록 섹션 */}
      {expanded && (
        <div style={{ borderTop: '1px solid #e8eaed', padding: '0 16px 16px', backgroundColor: '#f9f9fb' }}>
          <ConsultationSection contactId={contact.id} col={col} />
        </div>
      )}
    </div>
  );
}

// ── 상담 기록 섹션 ────────────────────────────────────────────────────────────

interface LogSectionProps {
  contactId: number;
  col: { active: string; bg: string; light: string };
}

function ConsultationSection({ contactId, col }: LogSectionProps) {
  const [logs, setLogs] = useState<ConsultationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editLog, setEditLog] = useState<ConsultationLog | null>(null);
  const [logForm, setLogForm] = useState({ consultDate: todayStr(), title: '', content: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<number | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try { setLogs(await getConsultationLogs(contactId)); } finally { setLoading(false); }
  }, [contactId]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const openAdd = () => {
    setEditLog(null);
    setLogForm({ consultDate: todayStr(), title: '', content: '' });
    setFormOpen(true);
  };

  const openEdit = (lg: ConsultationLog) => {
    setEditLog(lg);
    setLogForm({ consultDate: lg.consultDate, title: lg.title, content: lg.content ?? '' });
    setFormOpen(true);
  };

  const closeLogForm = () => { setFormOpen(false); setEditLog(null); };

  const handleSaveLog = async () => {
    if (!logForm.title.trim()) { alert('제목을 입력해 주세요.'); return; }
    setSaving(true);
    try {
      const payload = { consultDate: logForm.consultDate, title: logForm.title.trim(), content: logForm.content.trim() || undefined };
      if (editLog) {
        const updated = await updateConsultationLog(contactId, editLog.id, payload);
        setLogs(prev => prev.map(l => l.id === editLog.id ? updated : l));
      } else {
        const created = await createConsultationLog(contactId, payload);
        setLogs(prev => [created, ...prev]);
      }
      closeLogForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLog = async (lg: ConsultationLog) => {
    if (!window.confirm(`"${lg.title}" 상담 기록을 삭제하시겠습니까?`)) return;
    await deleteConsultationLog(contactId, lg.id);
    setLogs(prev => prev.filter(l => l.id !== lg.id));
  };

  // 녹음파일 업로드
  const triggerAudioUpload = (logId: number) => {
    uploadTargetRef.current = logId;
    audioInputRef.current?.click();
  };

  const handleAudioChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const logId = uploadTargetRef.current;
    if (!file || logId == null) return;
    setUploadingId(logId);
    try {
      const updated = await uploadConsultationAudio(contactId, logId, file);
      setLogs(prev => prev.map(l => l.id === logId ? updated : l));
    } finally {
      setUploadingId(null);
      e.target.value = '';
    }
  };

  const handleDeleteAudio = async (lg: ConsultationLog) => {
    if (!window.confirm('녹음파일을 삭제하시겠습니까?')) return;
    const updated = await deleteConsultationAudio(contactId, lg.id);
    setLogs(prev => prev.map(l => l.id === lg.id ? updated : l));
  };

  const logInputStyle: React.CSSProperties = {
    ...inputStyle, padding: '6px 9px', fontSize: '12px',
  };

  return (
    <div style={{ paddingTop: '12px' }}>
      {/* 상담 기록 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: col.active }}>📝 상담 기록</span>
        {!formOpen && (
          <button onClick={openAdd}
            style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 600, border: `1px solid ${col.active}`, borderRadius: '12px', backgroundColor: col.bg, color: col.active, cursor: 'pointer' }}>
            + 기록 추가
          </button>
        )}
      </div>

      {/* 기록 추가/수정 폼 */}
      {formOpen && (
        <div style={{ padding: '12px', backgroundColor: col.light, borderRadius: '8px', border: `1px solid ${col.bg}`, marginBottom: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px', marginBottom: '6px' }}>
            <div>
              <label style={{ fontSize: '10px', color: '#5f6368', fontWeight: 600 }}>날짜</label>
              <input type="date" value={logForm.consultDate} onChange={e => setLogForm(f => ({ ...f, consultDate: e.target.value }))} style={logInputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#5f6368', fontWeight: 600 }}>제목 *</label>
              <input value={logForm.title} onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))}
                placeholder="상담 주제" style={logInputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '10px', color: '#5f6368', fontWeight: 600 }}>내용</label>
            <textarea value={logForm.content} onChange={e => setLogForm(f => ({ ...f, content: e.target.value }))}
              placeholder="상담 내용을 자유롭게 기록하세요" rows={3}
              style={{ ...logInputStyle, resize: 'vertical', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' }}>
            <button onClick={closeLogForm} style={{ padding: '5px 12px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', cursor: 'pointer', color: '#5f6368' }}>취소</button>
            <button onClick={handleSaveLog} disabled={saving}
              style={{ padding: '5px 14px', fontSize: '12px', fontWeight: 600, border: 'none', borderRadius: '6px', background: col.active, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* 기록 목록 */}
      {loading ? (
        <div style={{ fontSize: '12px', color: '#9e9e9e', padding: '12px 0', textAlign: 'center' }}>불러오는 중...</div>
      ) : logs.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#bdbdbd', padding: '16px 0', textAlign: 'center' }}>상담 기록이 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {logs.map(lg => (
            <div key={lg.id} style={{ border: '1px solid #e8eaed', borderRadius: '8px', padding: '12px 14px', backgroundColor: '#fff' }}>
              {/* 기록 헤더 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', color: '#9e9e9e', marginBottom: '2px' }}>{lg.consultDate}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a2e' }}>{lg.title}</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button onClick={() => openEdit(lg)}
                    style={{ padding: '3px 7px', fontSize: '11px', border: `1px solid ${col.active}`, borderRadius: '5px', background: '#fff', color: col.active, cursor: 'pointer' }}>✏</button>
                  <button onClick={() => handleDeleteLog(lg)}
                    style={{ padding: '3px 7px', fontSize: '11px', border: '1px solid #E06060', borderRadius: '5px', background: '#fff', color: '#E06060', cursor: 'pointer' }}>×</button>
                </div>
              </div>

              {/* 상담 내용 */}
              {lg.content && (
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{lg.content}</p>
              )}

              {/* 녹음 파일 */}
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {lg.audioUrl ? (
                  <>
                    <audio controls src={lg.audioUrl} style={{ height: '32px', flex: '1', minWidth: '200px' }} />
                    <button onClick={() => handleDeleteAudio(lg)}
                      style={{ padding: '3px 9px', fontSize: '11px', border: '1px solid #E06060', borderRadius: '5px', background: '#fff', color: '#E06060', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      녹음 삭제
                    </button>
                  </>
                ) : (
                  <button onClick={() => triggerAudioUpload(lg.id)} disabled={uploadingId === lg.id}
                    style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 600, border: `1px solid ${col.active}`, borderRadius: '5px', backgroundColor: col.bg, color: col.active, cursor: 'pointer', opacity: uploadingId === lg.id ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                    {uploadingId === lg.id ? '업로드 중...' : '🎙 녹음 첨부'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 숨겨진 파일 입력 — 오디오 전용 */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm,.amr"
        style={{ display: 'none' }}
        onChange={handleAudioChange}
      />
    </div>
  );
}
