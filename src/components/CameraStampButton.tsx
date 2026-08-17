import React, { useRef, useState } from 'react';

interface Props {
  isMobile: boolean;
}

declare const naver: any;

// ── 날짜/시간 포맷 ────────────────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) =>
  `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
const fmtTime = (d: Date) =>
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

// ── 위치 조회 ─────────────────────────────────────────────────────────────────
const getLocation = (): Promise<{ lat: number; lng: number } | null> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 30_000 },
    );
  });

// ── 역지오코딩 ────────────────────────────────────────────────────────────────
const reverseGeocode = (lat: number, lng: number): Promise<string> =>
  new Promise((resolve) => {
    try {
      naver.maps.Service.reverseGeocode(
        { coords: new naver.maps.LatLng(lat, lng), orders: 'addr' },
        (status: any, res: any) => {
          if (status !== naver.maps.Service.Status.OK) { resolve(''); return; }
          resolve(
            res.v2?.address?.jibunAddress ||
            res.v2?.address?.roadAddress ||
            '',
          );
        },
      );
    } catch { resolve(''); }
  });

// ── Canvas 워터마크 합성 ──────────────────────────────────────────────────────
const applyWatermark = (
  file: File, date: Date, address: string,
): Promise<{ blob: Blob; previewUrl: string }> =>
  new Promise((resolve, reject) => {
    const img    = new Image();
    const objUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objUrl);

      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      // 상단 그라디언트 오버레이
      const overlayH = img.height * 0.20;
      const grad = ctx.createLinearGradient(0, 0, 0, overlayH);
      grad.addColorStop(0,   'rgba(0,0,0,0.72)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.28)');
      grad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, img.width, overlayH);

      const padX    = img.width * 0.045;
      const lineH   = img.height * 0.058;
      const baseY   = img.height * 0.030;
      ctx.textBaseline = 'top';
      ctx.shadowColor  = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur   = img.width * 0.007;

      // 날짜 (굵게, 크게)
      ctx.font      = `700 ${img.width * 0.048}px -apple-system, Arial, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(fmtDate(date), padX, baseY);

      // 시간
      ctx.font      = `400 ${img.width * 0.038}px -apple-system, Arial, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(fmtTime(date), padX, baseY + lineH);

      // 주소 (말줄임)
      if (address) {
        ctx.font = `400 ${img.width * 0.032}px -apple-system, Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.80)';
        const maxW = img.width - padX * 2;
        let txt = `📍 ${address}`;
        while (txt.length > 4 && ctx.measureText(txt).width > maxW)
          txt = txt.slice(0, -1);
        if (txt !== `📍 ${address}`) txt += '…';
        ctx.fillText(txt, padX, baseY + lineH * 2);
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('blob 변환 실패')); return; }
          const previewUrl = canvas.toDataURL('image/jpeg', 0.5); // 미리보기는 저해상도
          resolve({ blob, previewUrl });
        },
        'image/jpeg', 0.93,
      );
    };
    img.onerror = reject;
    img.src = objUrl;
  });

// ── 미리보기 모달 ─────────────────────────────────────────────────────────────
interface PreviewModalProps {
  previewUrl: string;
  blob: Blob;
  filename: string;
  onClose: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ previewUrl, blob, filename, onClose }) => {
  const [saving, setSaving] = useState(false);

  // 저장 버튼은 직접 클릭이므로 iOS user gesture 제한 없음
  const handleSave = async () => {
    setSaving(true);
    try {
      const file = new File([blob], filename, { type: 'image/jpeg' });
      if (navigator.share && (navigator as any).canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '임장 사진' });
      } else {
        // Fallback: 다운로드 링크
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 20000,
        backgroundColor: 'rgba(0,0,0,0.88)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      {/* 미리보기 이미지 */}
      <img
        src={previewUrl}
        alt="워터마크 미리보기"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '65vh',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          objectFit: 'contain',
        }}
      />

      {/* 안내 문구 */}
      <p style={{
        color: 'rgba(255,255,255,0.6)', fontSize: '12px',
        margin: '14px 0 0', textAlign: 'center', lineHeight: 1.6,
      }}>
        날짜·시간·위치가 합성됐습니다<br />
        iOS: 저장 후 공유 시트에서 "사진에 저장" 선택
      </p>

      {/* 버튼 영역 */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', gap: '12px', marginTop: '18px', width: '100%', maxWidth: '320px' }}
      >
        <button
          onClick={onClose}
          style={{
            flex: 1, padding: '13px 0', fontSize: '14px', fontWeight: 600,
            backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px',
            cursor: 'pointer',
          }}
        >
          닫기
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 2, padding: '13px 0', fontSize: '14px', fontWeight: 700,
            background: saving ? '#4a7fa5' : 'linear-gradient(135deg, #1a3a5c, #2d6a9f)',
            color: '#fff', border: 'none', borderRadius: '10px',
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 14px rgba(26,58,92,0.5)',
          }}
        >
          {saving ? '저장 중…' : '📥 사진 저장'}
        </button>
      </div>
    </div>
  );
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
const CameraStampButton: React.FC<Props> = ({ isMobile }) => {
  const inputRef    = useRef<HTMLInputElement>(null);
  const locationRef = useRef<Promise<string> | null>(null);

  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<{
    previewUrl: string; blob: Blob; filename: string;
  } | null>(null);

  if (!isMobile) return null;

  const handleClick = () => {
    // 카메라 여는 동안 위치 조회 병렬 시작
    locationRef.current = getLocation().then((pos) =>
      pos ? reverseGeocode(pos.lat, pos.lng) : '',
    );
    inputRef.current?.click();
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;

    setProcessing(true);
    try {
      const now     = new Date();
      const address = await (locationRef.current ?? Promise.resolve(''));
      const { blob, previewUrl } = await applyWatermark(file, now, address);
      setPreview({ previewUrl, blob, filename: `stamp_${Date.now()}.jpg` });
    } catch {
      alert('사진 처리 중 오류가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={"environment" as any}
        style={{ display: 'none' }}
        onChange={handleCapture}
      />

      {/* 처리 중 오버레이 */}
      {processing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 19999,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '14px', fontWeight: 600, gap: '14px',
        }}>
          <div style={{
            width: '40px', height: '40px',
            border: '4px solid rgba(255,255,255,0.25)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'stamp-spin 0.8s linear infinite',
          }} />
          날짜·위치 합성 중…
        </div>
      )}

      {/* 미리보기 모달 */}
      {preview && (
        <PreviewModal
          previewUrl={preview.previewUrl}
          blob={preview.blob}
          filename={preview.filename}
          onClose={() => setPreview(null)}
        />
      )}

      {/* 플로팅 카메라 버튼 */}
      <button
        onClick={handleClick}
        disabled={processing}
        title="타임스탬프 사진 촬영"
        style={{
          position: 'fixed', bottom: '100px', right: '16px', zIndex: 1200,
          width: '52px', height: '52px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a3a5c 0%, #2d5f8a 100%)',
          color: '#fff',
          border: '2px solid rgba(137,207,240,0.45)',
          boxShadow: '0 4px 18px rgba(26,58,92,0.45)',
          cursor: processing ? 'not-allowed' : 'pointer',
          fontSize: '22px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        📸
      </button>

      <style>{`@keyframes stamp-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
};

export default CameraStampButton;
