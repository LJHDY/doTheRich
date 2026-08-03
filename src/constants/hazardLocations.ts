/**
 * 유해 지역 상수 — 단지 등록 시 반경 3km 이내면 유해시설에 자동 추가
 * lat/lng: 네이버 지도에서 확인한 WGS84 좌표
 */
export interface HazardLocation {
  name: string;       // 유해시설명 (표시 이름)
  lat: number;        // 위도
  lng: number;        // 경도
  address?: string;   // 주소 (선택)
}

const HAZARD_LOCATIONS: HazardLocation[] = [
  // ── 여기에 추가 ──────────────────────────────────────────────────────────
  // { name: '구로디지털단지 유흥가', lat: 37.4853, lng: 126.9013, address: '서울 구로구 ...' },
  // ────────────────────────────────────────────────────────────────────────
];

export default HAZARD_LOCATIONS;
