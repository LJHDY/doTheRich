import { useState, useEffect } from 'react';

// 뷰포트 너비가 breakpoint(px) 미만이면 true — 리사이즈 시 즉시 반응
export function useIsMobile(breakpoint = 900): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return isMobile;
}
