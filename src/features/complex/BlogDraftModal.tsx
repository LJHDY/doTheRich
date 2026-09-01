import React, { useState } from 'react';
import { generateBlogDraft, BlogDraft } from '../../services/api';

interface Props {
  complexId: number;
  complexName: string;
  onClose: () => void;
}

export default function BlogDraftModal({ complexId, complexName, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<BlogDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateBlogDraft(complexId);
      setDraft(result);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? '초안 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = draft.html;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px',
        width: '100%', maxWidth: '860px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #eee',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px' }}>📝 임장일지 초안 생성</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{complexName}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {!draft && !loading && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>✍️</div>
              <p style={{ color: '#555', marginBottom: '8px', lineHeight: 1.6 }}>
                저장된 단지 정보·시세·체크리스트·사진을 바탕으로<br />
                Gemini가 임장일지 초안을 작성합니다.
              </p>
              <p style={{ color: '#999', fontSize: '12px', marginBottom: '24px' }}>약 15~30초 소요</p>
              <button
                onClick={handleGenerate}
                style={{
                  background: '#2563eb', color: '#fff', border: 'none',
                  borderRadius: '8px', padding: '12px 28px',
                  fontSize: '15px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                초안 생성하기
              </button>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#555' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
              <p>Gemini가 임장일지를 작성하고 있어요...</p>
            </div>
          )}

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '8px', padding: '14px 16px', color: '#b91c1c',
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          {draft && (
            <>
              {/* 제목 */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' }}>블로그 제목</div>
                <div style={{
                  background: '#f8f9fa', border: '1px solid #e9ecef',
                  borderRadius: '6px', padding: '10px 14px',
                  fontWeight: 600, fontSize: '14px', color: '#333',
                }}>
                  {draft.title}
                </div>
              </div>

              {/* 사진 URL 목록 */}
              {draft.photoUrls.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase' }}>
                    첨부 사진 ({draft.photoUrls.length}장) — 네이버 블로그용 수동 업로드
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {draft.photoUrls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img
                          src={url}
                          alt={`사진 ${i + 1}`}
                          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #eee' }}
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* 미리보기 / HTML 탭 */}
              <DraftTabs html={draft.html} />
            </>
          )}
        </div>

        {/* 하단 버튼 */}
        {draft && (
          <div style={{
            padding: '14px 20px', borderTop: '1px solid #eee',
            display: 'flex', gap: '8px', justifyContent: 'flex-end', flexShrink: 0,
          }}>
            <button
              onClick={handleGenerate}
              disabled={loading}
              style={{
                background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
                borderRadius: '6px', padding: '9px 16px',
                fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              }}
            >
              🔄 다시 생성
            </button>
            <button
              onClick={handleCopy}
              style={{
                background: copied ? '#16a34a' : '#2563eb',
                color: '#fff', border: 'none',
                borderRadius: '6px', padding: '9px 20px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {copied ? '✓ 복사됨' : '📋 HTML 복사 (네이버용)'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DraftTabs({ html }: { html: string }) {
  const [tab, setTab] = useState<'preview' | 'html'>('preview');

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    border: 'none', borderRadius: '4px',
    background: active ? '#2563eb' : 'transparent',
    color: active ? '#fff' : '#666',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        <button style={tabStyle(tab === 'preview')} onClick={() => setTab('preview')}>미리보기</button>
        <button style={tabStyle(tab === 'html')} onClick={() => setTab('html')}>HTML 소스</button>
      </div>

      {tab === 'preview' ? (
        <div
          style={{
            border: '1px solid #e9ecef', borderRadius: '8px',
            padding: '20px 24px', lineHeight: 1.8, color: '#333',
            fontSize: '14px',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <textarea
          readOnly
          value={html}
          style={{
            width: '100%', minHeight: '360px', fontFamily: 'monospace',
            fontSize: '12px', border: '1px solid #e9ecef', borderRadius: '8px',
            padding: '14px', color: '#333', lineHeight: 1.6,
            resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  );
}
