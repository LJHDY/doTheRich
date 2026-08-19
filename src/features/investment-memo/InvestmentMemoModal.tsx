import React, { useEffect, useRef, useState } from 'react';
import { InvestmentMemo, InvestmentMemoImage } from '../../types';
import {
  createInvestmentMemo, deleteInvestmentMemo, deleteInvestmentMemoImage,
  getInvestmentMemos, updateInvestmentMemo, uploadInvestmentMemoImage,
} from '../../services/api';
import AutoResizeTextarea from '../../shared/AutoResizeTextarea';

interface Props {
  onClose: () => void;
}

const MODAL_Z = 12000;

// 날짜 포맷 (로컬 시간)
function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

const InvestmentMemoModal: React.FC<Props> = ({ onClose }) => {
  const [memos, setMemos] = useState<InvestmentMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // 편집 상태
  const [editingId, setEditingId] = useState<number | null>(null); // null=신규, number=수정
  const [formOpen, setFormOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [saving, setSaving] = useState(false);

  // 이미지 업로드
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingMemoIdRef = useRef<number | null>(null); // 이미지 업로드 대상 memo id

  // 펼침 상태
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = async (q?: string) => {
    setLoading(true);
    try {
      const data = await getInvestmentMemos(q);
      setMemos(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSearch = () => {
    setQuery(searchInput);
    load(searchInput || undefined);
  };

  const openNew = () => {
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setFormOpen(true);
  };

  const openEdit = (m: InvestmentMemo) => {
    setEditingId(m.id);
    setFormTitle(m.title);
    setFormContent(m.content ?? '');
    setFormOpen(true);
    setExpandedId(m.id);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) { alert('제목을 입력해주세요.'); return; }
    setSaving(true);
    try {
      if (editingId === null) {
        const created = await createInvestmentMemo({ title: formTitle.trim(), content: formContent.trim() || undefined });
        setMemos(prev => [created, ...prev]);
        setExpandedId(created.id);
      } else {
        const updated = await updateInvestmentMemo(editingId, { title: formTitle.trim(), content: formContent.trim() || null });
        setMemos(prev => prev.map(m => m.id === editingId ? updated : m));
      }
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('메모를 삭제하시겠습니까?')) return;
    await deleteInvestmentMemo(id);
    setMemos(prev => prev.filter(m => m.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleImageUpload = async (memoId: number, file: File) => {
    setUploadingId(memoId);
    try {
      const img = await uploadInvestmentMemoImage(memoId, file);
      setMemos(prev => prev.map(m => m.id === memoId ? { ...m, images: [...m.images, img] } : m));
    } catch {
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setUploadingId(null);
    }
  };

  const handleImageDelete = async (memoId: number, img: InvestmentMemoImage) => {
    if (!window.confirm('이미지를 삭제하시겠습니까?')) return;
    await deleteInvestmentMemoImage(memoId, img.id);
    setMemos(prev => prev.map(m => m.id === memoId ? { ...m, images: m.images.filter(i => i.id !== img.id) } : m));
  };

  const INPUT: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: '13px', boxSizing: 'border-box',
    border: '1px solid #dadce0', borderRadius: '6px', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: MODAL_Z, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '720px', background: '#fff', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e0f0ff', background: 'linear-gradient(135deg,#f0f8fd,#fff)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c' }}>📝 투자 메모</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={openNew}
              style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 600, border: 'none', borderRadius: '8px', background: '#89CFF0', color: '#fff', cursor: 'pointer' }}
            >+ 새 메모</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6', padding: '4px 8px' }}>×</button>
          </div>
        </div>

        {/* 검색 */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: '8px' }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="제목 또는 내용으로 검색…"
            style={{ ...INPUT, flex: 1 }}
          />
          <button
            onClick={handleSearch}
            style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px', border: '1px solid #89CFF0', background: '#f0f8fd', color: '#2a6090', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >검색</button>
          {query && (
            <button
              onClick={() => { setSearchInput(''); setQuery(''); load(); }}
              style={{ padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #dadce0', background: '#fff', color: '#9aa0a6', cursor: 'pointer' }}
            >초기화</button>
          )}
        </div>

        {/* 신규/수정 폼 */}
        {formOpen && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e0f0ff', background: '#f8fcff' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#4BAAD4', marginBottom: '10px' }}>
              {editingId === null ? '새 메모 작성' : '메모 수정'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="제목 *"
                style={INPUT}
                autoFocus
              />
              <AutoResizeTextarea
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                placeholder="내용 (선택)"
                rows={5}
                style={INPUT}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setFormOpen(false)}
                  style={{ padding: '7px 16px', fontSize: '13px', borderRadius: '6px', border: '1px solid #dadce0', background: '#fff', cursor: 'pointer', color: '#5f6368' }}
                >취소</button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ padding: '7px 20px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', background: saving ? '#b0c4de' : '#89CFF0', color: '#fff', cursor: saving ? 'default' : 'pointer' }}
                >{saving ? '저장 중…' : editingId === null ? '추가' : '수정'}</button>
              </div>
            </div>
          </div>
        )}

        {/* 목록 */}
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '200px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#9aa0a6', padding: '40px', fontSize: '14px' }}>불러오는 중…</div>
          ) : memos.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9aa0a6', padding: '40px', fontSize: '14px' }}>
              {query ? `'${query}' 검색 결과가 없습니다.` : '아직 등록된 메모가 없습니다.'}
            </div>
          ) : memos.map(m => (
            <div key={m.id} style={{ border: '1px solid #e0e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              {/* 카드 헤더 */}
              <div
                onClick={() => setExpandedId(prev => prev === m.id ? null : m.id)}
                style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', background: expandedId === m.id ? '#f0f8fd' : '#fff' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1a3a5c', marginBottom: '2px' }}>{m.title}</div>
                  {m.content && expandedId !== m.id && (
                    <div style={{ fontSize: '12px', color: '#9aa0a6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.content}</div>
                  )}
                  <div style={{ fontSize: '11px', color: '#b0bec5', marginTop: '2px' }}>
                    {formatDate(m.updatedAt ?? m.createdAt)} · 이미지 {m.images.length}장
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(m)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '5px', border: '1px solid #dadce0', background: '#fff', cursor: 'pointer', color: '#344054' }}>✏</button>
                  <button onClick={() => handleDelete(m.id)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '5px', border: '1px solid #fcc', background: '#fff8f8', cursor: 'pointer', color: '#c00' }}>×</button>
                </div>
              </div>

              {/* 펼침 내용 */}
              {expandedId === m.id && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', background: '#fafcff' }}>
                  {/* 내용 */}
                  {m.content && (
                    <div style={{ fontSize: '13px', color: '#344054', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: '12px' }}>
                      {m.content}
                    </div>
                  )}

                  {/* 이미지 그리드 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    {m.images.map(img => (
                      <div key={img.id} style={{ position: 'relative', width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e0e8f0' }}>
                        <img
                          src={img.imageUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                          onClick={() => window.open(img.imageUrl, '_blank')}
                        />
                        <button
                          onClick={() => handleImageDelete(m.id, img)}
                          style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', color: '#fff', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                        >×</button>
                      </div>
                    ))}
                    {/* 이미지 추가 버튼 */}
                    <button
                      onClick={() => { pendingMemoIdRef.current = m.id; fileInputRef.current?.click(); }}
                      disabled={uploadingId === m.id}
                      style={{ width: '100px', height: '100px', borderRadius: '8px', border: '1.5px dashed #89CFF0', background: '#f0f8fd', cursor: uploadingId === m.id ? 'default' : 'pointer', color: '#4BAAD4', fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {uploadingId === m.id ? '⏳' : '+'}
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: '#b0bec5' }}>이미지 클릭 시 원본 열기 · + 버튼으로 추가</div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 숨김 파일 input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={async e => {
            const file = e.target.files?.[0];
            const memoId = pendingMemoIdRef.current;
            if (!file || memoId === null) return;
            e.target.value = '';
            await handleImageUpload(memoId, file);
          }}
        />
      </div>
    </div>
  );
};

export default InvestmentMemoModal;
