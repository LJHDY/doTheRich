import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ComplexPhoto } from '../types';
import { getComplexPhotos, uploadComplexPhotos, deleteComplexPhoto } from '../services/api';
import { compressImages } from '../utils/imageUtils';

interface PhotoSlideModalProps {
  complexId: number;
  complexName: string;
  onClose: () => void;
}

const PhotoSlideModal: React.FC<PhotoSlideModalProps> = ({ complexId, complexName, onClose }) => {
  const [photos, setPhotos] = useState<ComplexPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 마운트 시 사진 목록 조회
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getComplexPhotos(complexId);
        setPhotos(data);
      } catch { /* 인터셉터가 콘솔 출력 */ } finally {
        setLoading(false);
      }
    };
    load();
  }, [complexId]);

  // 무한 슬라이드 이동 — 마지막에서 오른쪽 → 첫 번째, 첫 번째에서 왼쪽 → 마지막
  const goNext = useCallback(() => {
    setCurrentIndex(i => (i + 1) % photos.length);
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex(i => (i - 1 + photos.length) % photos.length);
  }, [photos.length]);

  // 키보드 좌우 화살표 슬라이드, Escape 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (deleteConfirm) return;
      if (e.key === 'ArrowLeft' && photos.length > 1) goPrev();
      if (e.key === 'ArrowRight' && photos.length > 1) goNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose, deleteConfirm, goPrev, goNext]);

  // 사진 추가 업로드
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = '';
    setUploading(true);
    try {
      const compressed = await compressImages(files);
      const added = await uploadComplexPhotos(complexId, compressed);
      setPhotos(prev => {
        const updated = [...prev, ...added];
        // 업로드 후 마지막 새 사진으로 이동
        setCurrentIndex(updated.length - 1);
        return updated;
      });
    } catch { /* 인터셉터가 콘솔 출력 */ } finally {
      setUploading(false);
    }
  }, [complexId]);

  // 현재 사진 삭제
  const handleDelete = useCallback(async () => {
    const photo = photos[currentIndex];
    if (!photo) return;
    setDeleting(true);
    try {
      await deleteComplexPhoto(complexId, photo.id);
      const updated = photos.filter((_, i) => i !== currentIndex);
      setPhotos(updated);
      setCurrentIndex(prev => Math.min(prev, Math.max(0, updated.length - 1)));
      setDeleteConfirm(false);
    } catch { /* 인터셉터가 콘솔 출력 */ } finally {
      setDeleting(false);
    }
  }, [complexId, currentIndex, photos]);

  const [photoHover, setPhotoHover] = useState(false);

  const current = photos[currentIndex];
  const hasPhotos = !loading && photos.length > 0;

  return (
    // 바깥 클릭 시 닫힘
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '90vw', maxWidth: '860px',
          backgroundColor: '#111', borderRadius: '12px', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* 헤더 */}
        <div style={{
          padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: '#1a1a1a', color: '#fff', flexShrink: 0,
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{complexName}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {hasPhotos && (
              <span style={{ fontSize: '13px', color: '#999' }}>
                {currentIndex + 1} / {photos.length}
              </span>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: '#ccc', cursor: 'pointer',
                fontSize: '22px', lineHeight: 1, padding: '2px 4px',
              }}
            >×</button>
          </div>
        </div>

        {/* 사진 영역 — hover 시에만 좌우 화살표 표시 */}
        <div
          onMouseEnter={() => setPhotoHover(true)}
          onMouseLeave={() => setPhotoHover(false)}
          style={{
            position: 'relative', width: '100%',
            height: 'min(60vh, 540px)',
            backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {loading ? (
            <span style={{ color: '#888', fontSize: '14px' }}>불러오는 중...</span>
          ) : photos.length === 0 ? (
            <span style={{ color: '#666', fontSize: '14px' }}>등록된 사진이 없습니다.</span>
          ) : (
            <>
              <img
                src={current?.url}
                alt={`사진 ${currentIndex + 1}`}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
              />
              {/* 이전 버튼 — hover 시에만 표시, transition으로 부드럽게 */}
              {photos.length > 1 && (
                <button
                  onClick={goPrev}
                  style={{
                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', cursor: 'pointer',
                    width: '38px', height: '38px', borderRadius: '50%', fontSize: '22px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: photoHover ? 1 : 0,
                    transition: 'opacity 0.2s ease',
                    pointerEvents: photoHover ? 'auto' : 'none',
                  }}
                >‹</button>
              )}
              {/* 다음 버튼 */}
              {photos.length > 1 && (
                <button
                  onClick={goNext}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', cursor: 'pointer',
                    width: '38px', height: '38px', borderRadius: '50%', fontSize: '22px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: photoHover ? 1 : 0,
                    transition: 'opacity 0.2s ease',
                    pointerEvents: photoHover ? 'auto' : 'none',
                  }}
                >›</button>
              )}
            </>
          )}
        </div>

        {/* 하단 — 삭제(왼쪽)·추가(오른쪽) 버튼 바 */}
        <div style={{
          padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: '#1a1a1a', flexShrink: 0,
        }}>
          {/* 휴지통 — 사진 있을 때만 활성 */}
          <button
            onClick={() => hasPhotos && setDeleteConfirm(true)}
            title="현재 사진 삭제"
            disabled={!hasPhotos}
            style={{
              background: 'none', border: `1px solid ${hasPhotos ? '#c5221f' : '#555'}`,
              color: hasPhotos ? '#c5221f' : '#555',
              cursor: hasPhotos ? 'pointer' : 'default',
              borderRadius: '8px', padding: '7px 16px',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '13px', fontWeight: 500,
            }}
          >
            🗑 삭제
          </button>

          {/* + 버튼 — 사진 추가 */}
          <label
            title="사진 추가"
            style={{
              background: 'none', border: `1px solid ${uploading ? '#555' : '#34a853'}`,
              color: uploading ? '#555' : '#34a853',
              cursor: uploading ? 'not-allowed' : 'pointer',
              borderRadius: '8px', padding: '7px 16px',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '13px', fontWeight: 500,
            }}
          >
            {uploading ? '업로드 중...' : '+ 사진 추가'}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              style={{ display: 'none' }}
              onChange={handleUpload}
            />
          </label>
        </div>

        {/* 삭제 확인 오버레이 */}
        {deleteConfirm && (
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
          }}>
            <div style={{
              backgroundColor: '#fff', borderRadius: '10px', padding: '28px 36px',
              textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            }}>
              <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '20px', color: '#202124' }}>
                이 사진을 삭제하시겠습니까?
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: '8px 22px', backgroundColor: '#c5221f', color: '#fff',
                    border: 'none', borderRadius: '6px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    fontSize: '13px', fontWeight: 600, opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? '삭제 중...' : '삭제'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                  style={{
                    padding: '8px 22px', backgroundColor: '#f1f3f4', color: '#5f6368',
                    border: 'none', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 600,
                  }}
                >취소</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotoSlideModal;
