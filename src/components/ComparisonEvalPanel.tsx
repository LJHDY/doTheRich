import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApartmentComplex, Comparison, ComparisonPhoto } from '../types';
import {
  getComparisons, createComparison, updateComparison, deleteComparison,
  uploadComparisonPhoto, updateComparisonPhotoMemo, deleteComparisonPhoto,
} from '../services/api';

const DISTRICT_GRADES = [
  { label: '상급지', color: '#ea4335', districts: ['강남구', '서초구', '용산구', '송파구', '성동구', '광진구', '마포구', '양천구'] },
  { label: '중급지', color: '#f9ab00', districts: ['강동구', '동작구', '영등포구', '중구', '종로구'] },
  { label: '하급지', color: '#1a73e8', districts: ['서대문구', '강서구', '동대문구', '성북구', '관악구', '은평구', '구로구', '노원구', '중랑구', '강북구', '금천구', '도봉구'] },
];

interface ComparisonEvalPanelProps {
  complex1: ApartmentComplex;
  complex2: ApartmentComplex;
  onComparisonChange: (c: Comparison | null) => void;
}

// 저장 전 로컬 사진 — File + objectURL 미리보기 + 메모 입력
interface LocalPhoto {
  localId: string;
  file: File;
  previewUrl: string;
  memo: string;
}

// 이미 저장된 사진 카드 — 메모 인라인 편집
const SavedPhotoCard: React.FC<{
  photo: ComparisonPhoto;
  onMemoSave: (memo: string) => void;
  onDelete: () => void;
}> = ({ photo, onMemoSave, onDelete }) => {
  const [memo, setMemo] = useState(photo.memo ?? '');

  return (
    <div style={{ marginBottom: '10px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e8eaed', overflow: 'hidden' }}>
      <div style={{ position: 'relative' }}>
        <img
          src={photo.url} alt={memo || '사진'}
          onClick={() => window.open(photo.url, '_blank')}
          style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block', cursor: 'pointer' }}
        />
        <button
          onClick={onDelete}
          style={{
            position: 'absolute', top: '6px', right: '6px',
            background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%',
            width: '24px', height: '24px', cursor: 'pointer', color: '#fff',
            fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>
      <div style={{ padding: '6px 10px' }}>
        <input
          type="text" value={memo}
          onChange={e => setMemo(e.target.value)}
          onBlur={() => { if (memo !== (photo.memo ?? '')) onMemoSave(memo); }}
          onKeyDown={e => { if (e.key === 'Enter') { onMemoSave(memo); (e.target as HTMLInputElement).blur(); } }}
          placeholder="메모 입력..."
          style={{
            width: '100%', boxSizing: 'border-box', fontSize: '11px',
            padding: '4px 8px', border: '1px solid #e8eaed', borderRadius: '4px',
            outline: 'none', color: '#202124',
          }}
          onFocus={e => (e.target.style.borderColor = '#1a73e8')}
        />
      </div>
    </div>
  );
};

// 로컬 미리보기 사진 카드 — 저장 전, 메모 바로 입력
const LocalPhotoCard: React.FC<{
  photo: LocalPhoto;
  onMemoChange: (memo: string) => void;
  onRemove: () => void;
}> = ({ photo, onMemoChange, onRemove }) => (
  <div style={{ marginBottom: '10px', backgroundColor: '#fff', borderRadius: '8px', border: '1px dashed #1a73e8', overflow: 'hidden' }}>
    <div style={{ position: 'relative' }}>
      <img
        src={photo.previewUrl} alt="미리보기"
        style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }}
      />
      {/* 저장 전 표시 배지 */}
      <span style={{
        position: 'absolute', top: '6px', left: '6px',
        fontSize: '9px', fontWeight: 700, color: '#fff',
        backgroundColor: '#1a73e8', padding: '2px 6px', borderRadius: '8px',
      }}>미저장</span>
      <button
        onClick={onRemove}
        style={{
          position: 'absolute', top: '6px', right: '6px',
          background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%',
          width: '24px', height: '24px', cursor: 'pointer', color: '#fff',
          fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >×</button>
    </div>
    <div style={{ padding: '6px 10px' }}>
      <input
        type="text" value={photo.memo}
        onChange={e => onMemoChange(e.target.value)}
        placeholder="메모 입력..."
        style={{
          width: '100%', boxSizing: 'border-box', fontSize: '11px',
          padding: '4px 8px', border: '1px solid #e8eaed', borderRadius: '4px',
          outline: 'none', color: '#202124',
        }}
        onFocus={e => (e.target.style.borderColor = '#1a73e8')}
        onBlur={e => (e.target.style.borderColor = '#e8eaed')}
      />
    </div>
  </div>
);

const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '8px', fontSize: '12px', lineHeight: 1.6,
  border: '1px solid #dadce0', borderRadius: '6px', resize: 'vertical',
  outline: 'none', color: '#202124', fontFamily: 'inherit',
  boxSizing: 'border-box', minHeight: '72px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: '#5f6368',
  display: 'block', marginBottom: '5px',
};

const ComparisonEvalPanel: React.FC<ComparisonEvalPanelProps> = ({
  complex1, complex2, onComparisonChange,
}) => {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gradeTooltip, setGradeTooltip] = useState(false);

  const [memo, setMemo] = useState('');
  const [valueRating, setValueRating] = useState('');
  const [priceNote, setPriceNote] = useState('');
  const [conclusion, setConclusion] = useState('');
  // 최종 선정 단지 PK (null = 미선택)
  const [selectedComplexId, setSelectedComplexId] = useState<number | null>(null);

  // 로컬 미리보기 사진 목록 (저장 전)
  const [localPhotos, setLocalPhotos] = useState<LocalPhoto[]>([]);
  const localIdRef = useRef(0);
  // ref로 최신 localPhotos 추적 — 언마운트 cleanup 클로저가 stale 상태를 참조하는 문제 방지
  const localPhotosRef = useRef<LocalPhoto[]>([]);
  useEffect(() => { localPhotosRef.current = localPhotos; }, [localPhotos]);

  // 언마운트 시 남은 objectURL 전부 해제 (저장하지 않고 닫은 경우)
  useEffect(() => {
    return () => { localPhotosRef.current.forEach(p => URL.revokeObjectURL(p.previewUrl)); };
  }, []);

  const loadComparison = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getComparisons();
      const found = list.find(c =>
        (c.complexId1 === complex1.id && c.complexId2 === complex2.id) ||
        (c.complexId1 === complex2.id && c.complexId2 === complex1.id)
      );
      if (found) {
        setComparison(found);
        setMemo(found.memo ?? '');
        setValueRating(found.valueRating ?? '');
        setPriceNote(found.priceNote ?? '');
        setConclusion(found.conclusion ?? '');
        setSelectedComplexId(found.selectedComplexId ?? null);
        onComparisonChange(found);
      } else {
        setComparison(null);
        setMemo(''); setValueRating(''); setPriceNote(''); setConclusion('');
        setSelectedComplexId(null);
        onComparisonChange(null);
      }
    } catch {
      // 오류 시 빈 상태 유지
    } finally {
      setLoading(false);
    }
  }, [complex1.id, complex2.id, onComparisonChange]);

  useEffect(() => { loadComparison(); }, [loadComparison]);

  const applyComparison = (c: Comparison) => {
    setComparison(c);
    onComparisonChange(c);
  };

  // 로컬 사진 파일 선택 → objectURL 생성 후 목록에 추가
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const newPhotos = files.map(file => ({
      localId: String(++localIdRef.current),
      file,
      previewUrl: URL.createObjectURL(file),
      memo: '',
    }));
    setLocalPhotos(prev => [...prev, ...newPhotos]);
  };

  // 로컬 사진 제거 — objectURL 해제
  const handleLocalRemove = (localId: string) => {
    setLocalPhotos(prev => {
      const target = prev.find(p => p.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(p => p.localId !== localId);
    });
  };

  const handleLocalMemoChange = (localId: string, memo: string) => {
    setLocalPhotos(prev => prev.map(p => p.localId === localId ? { ...p, memo } : p));
  };

  // 저장 — 텍스트 POST/PATCH 후 로컬 사진 일괄 업로드
  const handleSave = async () => {
    setSaving(true);
    try {
      let saved: Comparison;
      if (comparison) {
        saved = await updateComparison(comparison.id, {
          memo: memo || undefined,
          valueRating: valueRating || undefined,
          priceNote: priceNote || undefined,
          conclusion: conclusion || undefined,
          selectedComplexId: selectedComplexId ?? null,
        });
      } else {
        saved = await createComparison({
          complexId1: complex1.id,
          complexId2: complex2.id,
          memo: memo || undefined,
          valueRating: valueRating || undefined,
          priceNote: priceNote || undefined,
          conclusion: conclusion || undefined,
          selectedComplexId: selectedComplexId ?? undefined,
        });
      }

      // 로컬 사진 순서대로 업로드
      let uploadedPhotos: ComparisonPhoto[] = [...(saved.photos ?? [])];
      for (const lp of localPhotos) {
        try {
          const uploaded = await uploadComparisonPhoto(saved.id, lp.file, lp.memo || undefined);
          uploadedPhotos = [...uploadedPhotos, uploaded];
          URL.revokeObjectURL(lp.previewUrl);
        } catch {
          // 개별 실패는 무시하고 계속 진행
        }
      }

      setLocalPhotos([]);
      applyComparison({ ...saved, photos: uploadedPhotos });
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 저장된 사진 메모 수정
  const handleSavedMemoSave = async (photo: ComparisonPhoto, newMemo: string) => {
    if (!comparison) return;
    try {
      await updateComparisonPhotoMemo(comparison.id, photo.id, newMemo);
      applyComparison({
        ...comparison,
        photos: comparison.photos.map(p => p.id === photo.id ? { ...p, memo: newMemo } : p),
      });
    } catch {
      alert('메모 저장에 실패했습니다.');
    }
  };

  // 저장된 사진 삭제
  const handleSavedPhotoDelete = async (photoId: number) => {
    if (!comparison) return;
    if (!window.confirm('사진을 삭제할까요?')) return;
    try {
      await deleteComparisonPhoto(comparison.id, photoId);
      applyComparison({ ...comparison, photos: comparison.photos.filter(p => p.id !== photoId) });
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  // 전체 비교 평가 삭제
  const handleDeleteComparison = async () => {
    if (!comparison) return;
    if (!window.confirm('비교 평가와 사진을 모두 삭제할까요?')) return;
    try {
      await deleteComparison(comparison.id);
      setComparison(null);
      setMemo(''); setValueRating(''); setPriceNote(''); setConclusion('');
      setSelectedComplexId(null);
      setLocalPhotos([]);
      onComparisonChange(null);
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  const totalPhotos = (comparison?.photos.length ?? 0) + localPhotos.length;

  return (
    <div style={{
      width: '300px', flexShrink: 0, height: '100%',
      backgroundColor: '#fafafa', borderLeft: '2px solid #e8eaed',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{ padding: '12px 14px', backgroundColor: '#34a853', color: '#fff', flexShrink: 0, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <span style={{ fontSize: '10px', opacity: 0.9 }}>비교 평가</span>
          {/* 상급지/중급지/하급지 등급표 tooltip */}
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              onMouseEnter={() => setGradeTooltip(true)}
              onMouseLeave={() => setGradeTooltip(false)}
              style={{
                background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: '50%',
                width: '16px', height: '16px', cursor: 'pointer', color: '#fff',
                fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, lineHeight: 1,
              }}
            >ⓘ</button>
            {gradeTooltip && (
              <div style={{
                position: 'absolute', top: '20px', left: 0, zIndex: 1000,
                backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: '10px 12px',
                width: '180px', color: '#202124',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '8px', color: '#344054' }}>서울 입지 등급</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid #dadce0' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f3f4' }}>
                      <th style={{ padding: '3px 6px', border: '1px solid #dadce0', fontWeight: 700, color: '#344054', width: '52px', textAlign: 'center', fontSize: '10px' }}>등급</th>
                      <th style={{ padding: '3px 6px', border: '1px solid #dadce0', fontWeight: 700, color: '#344054', textAlign: 'center', fontSize: '10px' }}>구</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DISTRICT_GRADES.flatMap(({ label, color, districts }) =>
                      districts.map((d, i) => (
                        <tr key={`${label}-${d}`}>
                          {i === 0 && (
                            <td rowSpan={districts.length} style={{
                              padding: '3px 4px', border: '1px solid #dadce0',
                              textAlign: 'center', verticalAlign: 'middle',
                            }}>
                              <span style={{
                                display: 'inline-block', padding: '1px 5px', borderRadius: '8px',
                                backgroundColor: color, color: '#fff', fontWeight: 700, fontSize: '9px', whiteSpace: 'nowrap',
                              }}>{label}</span>
                            </td>
                          )}
                          <td style={{ padding: '2px 8px', border: '1px solid #dadce0', color: '#344054', fontSize: '10px' }}>{d}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.4 }}>
          {complex1.complexName}
          <span style={{ opacity: 0.8, margin: '0 5px' }}>vs</span>
          {complex2.complexName}
        </div>
      </div>

      {/* 본문 스크롤 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9e9e9e', fontSize: '12px' }}>로딩 중...</div>
        ) : (
          <>
            {/* 사진 섹션 */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={labelStyle}>
                  사진{totalPhotos > 0 && <span style={{ fontWeight: 400, color: '#9e9e9e', marginLeft: '4px' }}>({totalPhotos})</span>}
                </span>
                <label style={{
                  fontSize: '11px', fontWeight: 600, color: '#1a73e8', cursor: 'pointer',
                  padding: '3px 10px', border: '1px solid #1a73e8', borderRadius: '10px',
                }}>
                  + 추가
                  {/* multiple 허용 — 여러 장 한번에 선택 가능 */}
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
                </label>
              </div>

              {/* 이미 저장된 사진 */}
              {comparison?.photos.map(photo => (
                <SavedPhotoCard
                  key={photo.id}
                  photo={photo}
                  onMemoSave={newMemo => handleSavedMemoSave(photo, newMemo)}
                  onDelete={() => handleSavedPhotoDelete(photo.id)}
                />
              ))}

              {/* 로컬 미리보기 사진 (저장 전) */}
              {localPhotos.map(lp => (
                <LocalPhotoCard
                  key={lp.localId}
                  photo={lp}
                  onMemoChange={memo => handleLocalMemoChange(lp.localId, memo)}
                  onRemove={() => handleLocalRemove(lp.localId)}
                />
              ))}

              {totalPhotos === 0 && (
                <div style={{ fontSize: '11px', color: '#9e9e9e' }}>사진이 없습니다. + 추가를 눌러 사진을 선택하세요.</div>
              )}
            </div>

            {/* 가치 평가 */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>가치 평가</label>
              <textarea value={valueRating} onChange={e => setValueRating(e.target.value)}
                placeholder="예: A단지 우위 (역세권, 학군)" style={textareaStyle} />
            </div>

            {/* 가격 비교 평가 */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>가격 비교 평가</label>
              <textarea value={priceNote} onChange={e => setPriceNote(e.target.value)}
                placeholder="예: A단지가 약 2억 저렴" style={textareaStyle} />
            </div>

            {/* 메모 */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>메모</label>
              <textarea value={memo} onChange={e => setMemo(e.target.value)}
                placeholder="비교 메모 작성..." style={textareaStyle} />
            </div>

            {/* 결론 */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>결론</label>
              <textarea value={conclusion} onChange={e => setConclusion(e.target.value)}
                placeholder="예: A단지 최종 선택"
                style={{ ...textareaStyle, minHeight: '56px' }} />
            </div>

            {/* 선정 단지 — 두 단지 중 최종 선택 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>선정 단지</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[complex1, complex2].map(cx => {
                  const isSelected = selectedComplexId === cx.id;
                  return (
                    <button
                      key={cx.id}
                      onClick={() => setSelectedComplexId(isSelected ? null : cx.id)}
                      style={{
                        flex: 1, padding: '8px 6px', fontSize: '11px', fontWeight: 700,
                        border: `2px solid ${isSelected ? '#f9ab00' : '#dadce0'}`,
                        borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                        backgroundColor: isSelected ? '#fef9e7' : '#fff',
                        color: isSelected ? '#b07d00' : '#5f6368',
                        transition: 'all 0.15s',
                        wordBreak: 'keep-all', lineHeight: 1.4,
                      }}
                    >
                      {isSelected && <span style={{ marginRight: '3px' }}>👑</span>}
                      {cx.complexName}
                    </button>
                  );
                })}
              </div>
              {selectedComplexId && (
                <div style={{ fontSize: '10px', color: '#9e9e9e', marginTop: '4px', textAlign: 'center' }}>
                  버튼을 다시 누르면 선택 해제됩니다
                </div>
              )}
            </div>

            {/* 저장 버튼 — 로컬 사진 있으면 개수 표시 */}
            <button
              onClick={handleSave} disabled={saving}
              style={{
                width: '100%', padding: '10px', backgroundColor: '#1a73e8',
                color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1, marginBottom: '8px',
              }}
            >
              {saving
                ? '저장 중...'
                : comparison
                  ? `수정 저장${localPhotos.length > 0 ? ` (+사진 ${localPhotos.length}장)` : ''}`
                  : `비교 평가 저장${localPhotos.length > 0 ? ` (+사진 ${localPhotos.length}장)` : ''}`
              }
            </button>

            {comparison && (
              <button
                onClick={handleDeleteComparison}
                style={{
                  width: '100%', padding: '8px', backgroundColor: 'transparent',
                  color: '#ea4335', border: '1px solid #ea4335', borderRadius: '8px',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                비교 평가 삭제
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ComparisonEvalPanel;
