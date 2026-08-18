/**
 * 이미지를 가로·세로 절반 크기로 리사이즈 후 JPEG 0.85 품질로 압축한 File 반환.
 * Canvas API를 사용하므로 브라우저 환경에서만 동작.
 * 실패 시 원본 파일을 그대로 반환(업로드는 계속 진행).
 */
export const compressImage = (file: File): Promise<File> =>
  new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width / 2);
      canvas.height = Math.round(img.height / 2);

      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return; }
          // 확장자를 .jpg로 통일 (PNG·HEIC 등도 JPEG으로 변환됨)
          const name = file.name.replace(/\.[^.]+$/, '.jpg');
          resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
        },
        'image/jpeg',
        0.85,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

/** File 배열을 일괄 압축 */
export const compressImages = (files: File[]): Promise<File[]> =>
  Promise.all(files.map(compressImage));
