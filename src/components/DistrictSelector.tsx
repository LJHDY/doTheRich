import React, { useState, useEffect } from 'react';
import { loadDistrictGeoJson, getFeatureName, isSeoul, isGyeonggi } from '../utils/districtGeoJson';

interface Props {
  value: string | null;
  onChange: (v: string | null) => void;
}

interface DistrictGroups {
  seoul: string[];
  gyeonggi: string[];
}

// 서울·경기 행정구역명 select — GeoJSON 로드 후 옵션 동적 생성
const DistrictSelector: React.FC<Props> = ({ value, onChange }) => {
  const [groups, setGroups] = useState<DistrictGroups | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    loadDistrictGeoJson()
      .then(data => {
        const features: any[] = data.features ?? [];
        const sort = (arr: any[]) =>
          arr.map(getFeatureName).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'));
        setGroups({
          seoul: sort(features.filter(isSeoul)),
          gyeonggi: sort(features.filter(isGyeonggi)),
        });
      })
      .catch(() => setLoadError(true));
  }, []);

  const active = Boolean(value);

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      title={loadError ? '경계 데이터 로드 실패' : '행정구역 경계 표시'}
      style={{
        fontSize: '12px',
        padding: '4px 6px',
        border: `1px solid ${active ? '#89CFF0' : '#dadce0'}`,
        borderRadius: '6px',
        backgroundColor: active ? '#D4EFFC' : '#fff',
        color: active ? '#89CFF0' : '#5f6368',
        cursor: 'pointer',
        flexShrink: 0,
        maxWidth: '110px',
      }}
    >
      <option value="">{loadError ? '경계(오류)' : groups ? '구 경계' : '경계 로딩…'}</option>
      {groups && (
        <>
          <optgroup label="서울">
            {groups.seoul.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </optgroup>
          <optgroup label="경기도">
            {groups.gyeonggi.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </optgroup>
        </>
      )}
    </select>
  );
};

export default DistrictSelector;
