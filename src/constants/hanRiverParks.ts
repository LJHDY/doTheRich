// 서울 한강공원 11개 대표 좌표 (사용자 제공 데이터)
export interface HanRiverPark {
  name: string;
  lat: number;
  lng: number;
  side: 'north' | 'south'; // 한강 북쪽 제방 / 남쪽 제방
}

export const HAN_RIVER_PARKS: HanRiverPark[] = [
  // 강북 제방 — 북쪽 구에서 접근
  { name: '난지한강공원',  lat: 37.566787, lng: 126.878012, side: 'north' },
  { name: '망원한강공원',  lat: 37.552792, lng: 126.898561, side: 'north' },
  { name: '양화한강공원',  lat: 37.538301, lng: 126.902265, side: 'north' },
  { name: '이촌한강공원',  lat: 37.516920, lng: 126.971702, side: 'north' },
  { name: '뚝섬한강공원',  lat: 37.529351, lng: 127.069956, side: 'north' },
  { name: '광나루한강공원', lat: 37.548786, lng: 127.120038, side: 'north' },
  // 강남 제방 — 남쪽 구에서 접근
  { name: '강서한강공원',  lat: 37.588085, lng: 126.815235, side: 'south' },
  { name: '여의도한강공원', lat: 37.526711, lng: 126.934711, side: 'south' },
  { name: '반포한강공원',  lat: 37.510350, lng: 126.995237, side: 'south' },
  { name: '잠원한강공원',  lat: 37.520687, lng: 127.012272, side: 'south' },
  { name: '잠실한강공원',  lat: 37.517590, lng: 127.086724, side: 'south' },
];

// 한강 이남에 위치한 서울 구 목록
const GANGNAM_GU = new Set([
  '서초구', '강남구', '송파구', '강동구',
  '동작구', '관악구', '금천구', '구로구', '양천구', '영등포구', '강서구',
]);

// 한강 이북에 위치한 서울 구 목록
const GANGBUK_GU = new Set([
  '종로구', '중구', '용산구', '성동구', '광진구',
  '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구',
  '은평구', '서대문구', '마포구',
]);

// Haversine 공식으로 두 좌표 간 거리(미터) 계산
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 단지 좌표 + 지역(구) 기준 가장 가까운 한강공원과 직선거리(m) 반환
// region이 강남 구면 남쪽 제방 공원, 강북 구면 북쪽 제방 공원만 탐색
// 서울 외 지역이거나 region 미제공 시 전체 공원에서 탐색
export function findNearestHanRiverPark(
  lat: number,
  lng: number,
  region?: string,
): { name: string; distanceM: number } {
  // region 문자열에서 '구' 또는 '군'으로 끝나는 토큰 추출
  const gu = region?.split(/\s+/).find(t => t.endsWith('구') || t.endsWith('군'));

  let candidates = HAN_RIVER_PARKS as HanRiverPark[];
  if (gu && GANGNAM_GU.has(gu)) {
    candidates = HAN_RIVER_PARKS.filter(p => p.side === 'south');
  } else if (gu && GANGBUK_GU.has(gu)) {
    candidates = HAN_RIVER_PARKS.filter(p => p.side === 'north');
  }

  let nearest = candidates[0];
  let minDist = haversineM(lat, lng, nearest.lat, nearest.lng);
  for (const park of candidates.slice(1)) {
    const d = haversineM(lat, lng, park.lat, park.lng);
    if (d < minDist) { minDist = d; nearest = park; }
  }
  return { name: nearest.name, distanceM: Math.round(minDist) };
}
