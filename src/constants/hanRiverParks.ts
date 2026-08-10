// 서울 한강공원 11개 대표 좌표 (사용자 제공 데이터)
export interface HanRiverPark {
  name: string;
  lat: number;
  lng: number;
}

export const HAN_RIVER_PARKS: HanRiverPark[] = [
  { name: '강서한강공원',  lat: 37.588085, lng: 126.815235 },
  { name: '난지한강공원',  lat: 37.566787, lng: 126.878012 },
  { name: '망원한강공원',  lat: 37.552792, lng: 126.898561 },
  { name: '양화한강공원',  lat: 37.538301, lng: 126.902265 },
  { name: '여의도한강공원', lat: 37.526711, lng: 126.934711 },
  { name: '이촌한강공원',  lat: 37.516920, lng: 126.971702 },
  { name: '반포한강공원',  lat: 37.510350, lng: 126.995237 },
  { name: '잠원한강공원',  lat: 37.520687, lng: 127.012272 },
  { name: '뚝섬한강공원',  lat: 37.529351, lng: 127.069956 },
  { name: '잠실한강공원',  lat: 37.517590, lng: 127.086724 },
  { name: '광나루한강공원', lat: 37.548786, lng: 127.120038 },
];

// Haversine 공식으로 두 좌표 간 거리(미터) 계산
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 단지 좌표 기준 가장 가까운 한강공원과 직선거리(m) 반환
export function findNearestHanRiverPark(lat: number, lng: number): { name: string; distanceM: number } {
  let nearest = HAN_RIVER_PARKS[0];
  let minDist = haversineM(lat, lng, nearest.lat, nearest.lng);
  for (const park of HAN_RIVER_PARKS.slice(1)) {
    const d = haversineM(lat, lng, park.lat, park.lng);
    if (d < minDist) { minDist = d; nearest = park; }
  }
  return { name: nearest.name, distanceM: Math.round(minDist) };
}
