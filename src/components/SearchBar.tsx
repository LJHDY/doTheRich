import React, { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';

interface SearchResult {
  title: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
}

export interface SearchSelectData {
  lat: number;
  lng: number;
  title: string;
  address: string;
  roadAddress: string;
}

interface Props {
  onSelect: (data: SearchSelectData) => void;
  fluid?: boolean; // true이면 width: 100% (모바일 헤더 Row2 용)
}

// 네이버 검색 결과 title에 포함된 HTML 강조 태그(<b> 등) 제거
const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '');

const SearchBar: React.FC<Props> = ({ onSelect, fluid }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 입력 디바운스 타이머 ref
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get<{ items: SearchResult[] }>('/api/search/local', { params: { query: q } });
      setResults(data.items ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 350ms 디바운스로 불필요한 API 요청 억제
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 350);
  };

  const handleSelect = (item: SearchResult) => {
    // 네이버 로컬 검색 좌표는 1e7 배율 정수로 반환되므로 나누어 도 단위로 변환
    const lat = parseInt(item.mapy) / 10000000;
    const lng = parseInt(item.mapx) / 10000000;
    const title = stripHtml(item.title);
    onSelect({ lat, lng, title, address: item.address, roadAddress: item.roadAddress });
    setQuery(title);
    setOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: fluid ? '100%' : '280px', flexShrink: fluid ? 1 : 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        backgroundColor: '#f1f3f4', borderRadius: '24px',
        padding: '0 14px', height: '36px',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="#80868b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="주소 또는 장소 검색"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          style={{
            border: 'none', background: 'transparent', outline: 'none',
            fontSize: '13px', color: '#202124', width: '100%',
          }}
        />
        {loading && (
          <div style={{ width: '14px', height: '14px', border: '2px solid #dadce0',
            borderTopColor: '#1a73e8', borderRadius: '50%', animation: 'spin 0.6s linear infinite',
            flexShrink: 0 }} />
        )}
        {query && !loading && (
          <button onClick={handleClear} style={{
            border: 'none', background: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', color: '#80868b',
            fontSize: '18px', lineHeight: 1, flexShrink: 0,
          }}>×</button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul style={{
          position: 'absolute', top: '42px', left: 0, right: 0,
          backgroundColor: '#fff', border: '1px solid #e8eaed',
          borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          listStyle: 'none', margin: 0, padding: '4px 0', zIndex: 100,
        }}>
          {results.map((item, i) => (
            <li key={i}
              onClick={() => handleSelect(item)}
              style={{ padding: '10px 16px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f1f3f4')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#202124' }}>
                {stripHtml(item.title)}
              </div>
              <div style={{ fontSize: '12px', color: '#80868b', marginTop: '2px' }}>
                {item.roadAddress || item.address}
              </div>
            </li>
          ))}
        </ul>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default SearchBar;
