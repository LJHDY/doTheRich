import React, { useRef, useState } from 'react';

interface Props {
  isMobile: boolean;
}

declare const naver: any;

// ── 날짜/시간 포맷 ────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');

const formatDate = (d: Date) =>
  `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

const formatTime = (d: Date) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// ── 현재 위치 좌표 조회 ───────────────────────────────────────────────────────
const getLocation = (): Promise<{ lat: number; lng: number } | null> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 30_000 },
    );
  });

// ── Naver Maps 역지오코딩: 좌표 → 지번 주소 ─────────────────────────────────
const reverseGeocode = (lat: number, lng: number): Promise<string> =>
  new Promise((resolve) => {
    try {
      naver.maps.Service.reverseGeocode(
        { coords: new naver.maps.LatLng(lat, lng), orders: 'addr' },
        (status: any, res: any) => {
          if (status !== naver.maps.Service.Status.OK) { resolve(''); return; }
          const addr =
            res.v2?.address?.jibunAddress ||
            res.v2?.address?.roadAddress ||
            '';
          resolve(addr);
        },
      );
    } catch { resolve(''); }
  });

// ── Canvas 워터마크 합성 ──────────────────────────────────────────────────────
const applyWatermark = (file: File, date: Date, address: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objUrl);

      const canvas  = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      // 원본 이미지
      ctx.drawImage(img, 0, 0);

      // ── 상단 그라디언트 오버레이 ──
      const overlayH = img.height * 0.20;
      const grad = ctx.createLinearGradient(0, 0, 0, overlayH);
      grad.addColorStop(0,   'rgba(0,0,0,0.72)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.30)');
      grad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, img.width, overlayH);

      // ── 텍스트 공통 설정 ──
      const pad     = img.width * 0.045;
      const lineH   = img.height * 0.057;
      const baseY   = img.height * 0.030;

      ctx.textBaseline = 'top';
      ctx.shadowColor  = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur   = img.width * 0.007;

      // Line 1: 날짜 (크고 굵게)
      const dateSize = img.width * 0.048;
      ctx.font      = `700 ${dateSize}px -apple-system, "SF Pro Display", Arial, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(formatDate(date), pad, baseY);

      // Line 2: 시간 (중간 크기, 밝은 회색)
      const timeSize = img.width * 0.038;
      ctx.font      = `400 ${timeSize}px -apple-system, "SF Pro Text", Arial, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(formatTime(date), pad, baseY + lineH);

      // Line 3: 주소 (작게, 말줄임표 처리)
      if (address) {
        const addrSize = img.width * 0.032;
        ctx.font       = `400 ${addrSize}px -apple-system, "SF Pro Text", Arial, sans-serif`;
        ctx.fillStyle  = 'rgba(255,255,255,0.80)';

        // 너비 초과 시 말줄임표
        const maxW   = img.width - pad * 2;
        let addrText = `📍 ${address}`;
        while (addrText.length > 4 && ctx.measureText(addrText).width > maxW) {
          addrText = addrText.slice(0, -1);
        }
        if (addrText !== `📍 ${address}`) addrText += '…';
        ctx.fillText(addrText, pad, baseY + lineH * 2);
      }

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('canvas export failed'))),
        'image/jpeg',
        0.93,
      );
    };
    img.onerror = reject;
    img.src     = objUrl;
  });

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
const CameraStampButton: React.FC<Props> = ({ isMobile }) => {
  const inputRef      = useRef<HTMLInputElement>(null);
  const locationRef   = useRef<Promise<string> | null>(null);
  const [processing, setProcessing] = useState(false);

  if (!isMobile) return null;

  const handleClick = () => {
    // 카메라 열리는 동안 위치 조회 병렬 시작
    locationRef.current = getLocation().then((pos) =>
      pos ? reverseGeocode(pos.lat, pos.lng) : '',
    );
    inputRef.current?.click();
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = ''; // 재촬영 허용
    if (!file) return;

    setProcessing(true);
    try {
      const now     = new Date(); // 파일 처리 시점 = 촬영 직후
      const address = await (locationRef.current ?? Promise.resolve(''));
      const blob    = await applyWatermark(file, now, address);
      const stamped = new File([blob], `stamp_${Date.now()}.jpg`, { type: 'image/jpeg' });

      // Web Share API (iOS "사진에 저장" / Android 갤러리 바로 저장)
      if (navigator.share && (navigator as any).canShare?.({ files: [stamped] })) {
        await navigator.share({ files: [stamped], title: '임장 사진' });
      } else {
        // Fallback: 다운로드 트리거
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = stamped.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err: any) {
      // 사용자가 공유 취소한 경우 (AbortError) 는 무시
      if (err?.name !== 'AbortError') {
        alert('사진 처리 중 오류가 발생했습니다.');
      }
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
          backgroundColor: 'rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '15px', fontWeight: 600, gap: '12px',
        }}>
          <div style={{
            width: '44px', height: '44px', border: '4px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'stamp-spin 0.8s linear infinite',
          }} />
          날짜·위치 합성 중…
        </div>
      )}

      {/* 카메라 플로팅 버튼 */}
      <button
        onClick={handleClick}
        disabled={processing}
        title="타임스탬프 사진 촬영"
        style={{
          position: 'fixed',
          bottom: '100px',
          right: '16px',
          zIndex: 1200,
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a3a5c 0%, #2d5f8a 100%)',
          color: '#fff',
          border: '2px solid rgba(137,207,240,0.5)',
          boxShadow: '0 4px 18px rgba(26,58,92,0.45)',
          cursor: processing ? 'not-allowed' : 'pointer',
          fontSize: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s, box-shadow 0.15s',
          WebkitTapHighlightColor: 'transparent',
        }}
        onTouchStart={(e) => {
          (e.currentTarget as HTMLElement).style.transform = 'scale(0.92)';
        }}
        onTouchEnd={(e) => {
          (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
        }}
      >
        📸
      </button>

      <style>{`
        @keyframes stamp-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default CameraStampButton;
