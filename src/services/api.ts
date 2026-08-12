import axios from 'axios';
import {
  ApartmentComplex,
  ApartmentComplexRequest,
  PriceHistory,
  PriceHistoryRequest,
  SchoolInfo,
  InfraInfo,
  HazardInfo,
  SubwayInfo,
  CommuteTime,
  ComplexPhoto,
  LivingZone,
  LivingZonePhoto,
  MapRoute,
  RoutePoint,
  Comparison,
  ComparisonPhoto,
  ChecklistTemplate,
  ChecklistResultItem,
  ZoneChecklistResultItem,
  PropertyVisit,
  PropertyVisitResultItem,
  JeonseOnlyItem,
} from '../types';

// 환경변수로 백엔드 URL 설정, 없으면 로컬 기본값 사용
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8080',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// 요청 인터셉터
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터 — 서버/네트워크 오류를 콘솔에 출력 후 상위로 전파
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      console.error('API 오류:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('서버 연결 실패:', error.request);
    }
    return Promise.reject(error);
  }
);

/** 단지 목록 조회 (금액대 필터) */
export const getComplexes = async (priceRange?: string): Promise<ApartmentComplex[]> => {
  const params = priceRange ? { priceRange } : {}; // 필터 없으면 전체 조회
  const { data } = await api.get<ApartmentComplex[]>('/api/complexes', { params });
  return data;
};

/** 단지 상세 조회 */
export const getComplexById = async (id: number): Promise<ApartmentComplex> => {
  const { data } = await api.get<ApartmentComplex>(`/api/complexes/${id}`);
  return data;
};

/** 단지 등록 */
export const createComplex = async (
  request: ApartmentComplexRequest
): Promise<ApartmentComplex> => {
  const { data } = await api.post<ApartmentComplex>('/api/complexes', request);
  return data;
};

/** 시세 기록 목록 조회 */
export const getPriceHistories = async (complexId: number): Promise<PriceHistory[]> => {
  const { data } = await api.get<PriceHistory[]>(`/api/complexes/${complexId}/price-history`);
  return data;
};

/** 시세 기록 추가 */
export const addPriceHistory = async (
  complexId: number,
  request: PriceHistoryRequest
): Promise<PriceHistory> => {
  const { data } = await api.post<PriceHistory>(
    `/api/complexes/${complexId}/price-history`,
    request
  );
  return data;
};

/** 금액대 목록 조회 */
export const getPriceRanges = async (): Promise<string[]> => {
  const { data } = await api.get<string[]>('/api/complexes/price-ranges');
  return data;
};

/** 단지 메모 수정 — PATCH /api/complexes/:id/memo */
export const updateComplexMemo = async (complexId: number, memo: string): Promise<void> => {
  await api.patch(`/api/complexes/${complexId}/memo`, { memo });
};

/** 단지 삭제 — DELETE /api/complexes/:id */
export const deleteComplex = async (complexId: number): Promise<void> => {
  await api.delete(`/api/complexes/${complexId}`);
};

/** 학군 정보 단건 추가 — 하위 호환성 유지용, 내부적으로 배열 함수 호출 */
export const addSchoolInfo = async (
  complexId: number,
  data: Omit<SchoolInfo, 'id'>
): Promise<SchoolInfo> => {
  const results = await addSchoolInfos(complexId, [data]);
  return results[0];
};

/** 학군 정보 배열 추가 — POST /api/complexes/:id/school-infos (여러 항목 한 번에 저장) */
export const addSchoolInfos = async (
  complexId: number,
  items: Omit<SchoolInfo, 'id'>[]
): Promise<SchoolInfo[]> => {
  const { data } = await api.post<SchoolInfo[]>(
    `/api/complexes/${complexId}/school-infos`,
    items
  );
  return data;
};

/** 학군 정보 단건 수정 — PATCH /api/complexes/:id/school-infos/:sid */
export const updateSchoolInfo = async (
  complexId: number,
  schoolId: number,
  data: Omit<SchoolInfo, 'id'>
): Promise<SchoolInfo> => {
  const { data: result } = await api.patch<SchoolInfo>(
    `/api/complexes/${complexId}/school-infos/${schoolId}`,
    data
  );
  return result;
};

/** 학군 정보 단건 삭제 — DELETE /api/complexes/:id/school-infos/:sid */
export const deleteSchoolInfo = async (complexId: number, schoolId: number): Promise<void> => {
  await api.delete(`/api/complexes/${complexId}/school-infos/${schoolId}`);
};

/** 인프라 정보 단건 추가 — 하위 호환성 유지용, 내부적으로 배열 함수 호출 */
export const addInfraInfo = async (
  complexId: number,
  data: Omit<InfraInfo, 'id'>
): Promise<InfraInfo> => {
  const results = await addInfraInfos(complexId, [data]);
  return results[0];
};

/** 인프라 정보 배열 추가 — POST /api/complexes/:id/infra-infos (여러 항목 한 번에 저장) */
export const addInfraInfos = async (
  complexId: number,
  items: Omit<InfraInfo, 'id'>[]
): Promise<InfraInfo[]> => {
  const { data } = await api.post<InfraInfo[]>(
    `/api/complexes/${complexId}/infra-infos`,
    items
  );
  return data;
};

/** 인프라 정보 단건 수정 — PATCH /api/complexes/:id/infra-infos/:iid */
export const updateInfraInfo = async (
  complexId: number,
  infraId: number,
  data: Omit<InfraInfo, 'id'>
): Promise<InfraInfo> => {
  const { data: result } = await api.patch<InfraInfo>(
    `/api/complexes/${complexId}/infra-infos/${infraId}`,
    data
  );
  return result;
};

/** 인프라 정보 단건 삭제 — DELETE /api/complexes/:id/infra-infos/:iid */
export const deleteInfraInfo = async (complexId: number, infraId: number): Promise<void> => {
  await api.delete(`/api/complexes/${complexId}/infra-infos/${infraId}`);
};

/** 유해시설 정보 다건 추가 — POST /api/complexes/:id/hazard-infos */
export const addHazardInfos = async (
  complexId: number,
  items: Omit<HazardInfo, 'id'>[]
): Promise<HazardInfo[]> => {
  const { data } = await api.post<HazardInfo[]>(
    `/api/complexes/${complexId}/hazard-infos`,
    items
  );
  return data;
};

/** 유해시설 정보 단건 수정 — PATCH /api/complexes/:id/hazard-infos/:hazardId */
export const updateHazardInfo = async (
  complexId: number,
  hazardId: number,
  data: Omit<HazardInfo, 'id'>
): Promise<HazardInfo> => {
  const { data: result } = await api.patch<HazardInfo>(
    `/api/complexes/${complexId}/hazard-infos/${hazardId}`,
    data
  );
  return result;
};

/** 유해시설 정보 단건 삭제 — DELETE /api/complexes/:id/hazard-infos/:hazardId */
export const deleteHazardInfo = async (complexId: number, hazardId: number): Promise<void> => {
  await api.delete(`/api/complexes/${complexId}/hazard-infos/${hazardId}`);
};

/** 즐겨찾기 토글 — PATCH /api/complexes/:id/favorite */
export const toggleFavorite = async (complexId: number, isFavorite: boolean): Promise<void> => {
  await api.patch(`/api/complexes/${complexId}/favorite`, { isFavorite });
};

/** 임장 유형 수정 — PATCH /api/complexes/:id/visit-type */
export const updateVisitType = async (complexId: number, visitType: string): Promise<void> => {
  await api.patch(`/api/complexes/${complexId}/visit-type`, { visitType });
};

/** 재개발 정보 수정 — PATCH /api/complexes/:id/redevelop-info */
export const updateRedevelopInfo = async (
  complexId: number,
  data: { redevelopType: string | null; redevelopStage: string | null }
): Promise<void> => {
  await api.patch(`/api/complexes/${complexId}/redevelop-info`, data);
};

/** 한강공원 정보 업데이트 — PATCH /api/complexes/:id/han-river-park */
export const updateHanRiverPark = async (
  complexId: number,
  data: { hanRiverParkName: string; hanRiverDistanceM: number }
): Promise<void> => {
  await api.patch(`/api/complexes/${complexId}/han-river-park`, data);
};

/** 기본 정보 수정 — PATCH /api/complexes/:id/basic-info */
export const updateComplexBasicInfo = async (
  complexId: number,
  data: { builtYear?: string; unitCount?: number; slopeType?: string; buildingStructure?: string; floorAreaRatio?: number }
): Promise<void> => {
  await api.patch(`/api/complexes/${complexId}/basic-info`, data);
};

/** 단지 사진 목록 조회 — GET /api/complexes/:id/photos */
export const getComplexPhotos = async (complexId: number): Promise<ComplexPhoto[]> => {
  const { data } = await api.get<ComplexPhoto[]>(`/api/complexes/${complexId}/photos`);
  return data;
};

/** 단지 사진 업로드 — POST /api/complexes/:id/photos (multipart/form-data, files 필드 복수) */
export const uploadComplexPhotos = async (complexId: number, files: File[]): Promise<ComplexPhoto[]> => {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  const { data } = await api.post<ComplexPhoto[]>(`/api/complexes/${complexId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

/** 단지 사진 삭제 — DELETE /api/complexes/:id/photos/:photoId */
export const deleteComplexPhoto = async (complexId: number, photoId: number): Promise<void> => {
  await api.delete(`/api/complexes/${complexId}/photos/${photoId}`);
};

/** areaType별 시세 기록 전체 삭제 — DELETE /api/complexes/:id/price-history/area-type/:areaType */
export const deletePriceHistoryByAreaType = async (complexId: number, areaType: string): Promise<void> => {
  await api.delete(`/api/complexes/${complexId}/price-history/area-type/${encodeURIComponent(areaType)}`);
};

/** 매매가·호가 없이 전세가만 있는 평형 목록 조회 — 단지 정리 기능용 */
export const getJeonseOnlyItems = async (): Promise<JeonseOnlyItem[]> => {
  const { data } = await api.get<JeonseOnlyItem[]>('/api/complexes/price-items/jeonse-only');
  return data;
};

/** 참고가 수정 — PATCH /api/complexes/:id/price-history-items/:itemId */
export const updatePriceHistoryItem = async (
  complexId: number,
  itemId: number,
  data: {
    areaType?: string;
    price?: number;
    jeonsePrice?: number;
    kbPrice?: number;
    askingPrice?: number;
    highestPrice?: number;
    lowestPrice?: number;
    tenYearChangeRate?: number;
    tenYearChangeAmount?: number;
  }
): Promise<void> => {
  await api.patch(`/api/complexes/${complexId}/price-history-items/${itemId}`, data);
};

/** 생활권 목록 조회 — GET /api/living-zones?district=서울 관악구 */
export const getLivingZones = async (district?: string): Promise<LivingZone[]> => {
  const params = district ? { district } : {};
  const { data } = await api.get<LivingZone[]>('/api/living-zones', { params });
  return data;
};

/** 특정 단지가 포함된 생활권 목록 조회 — GET /api/living-zones?complexId=X */
export const getComplexLivingZones = async (complexId: number): Promise<LivingZone[]> => {
  const { data } = await api.get<LivingZone[]>('/api/living-zones', { params: { complexId } });
  return data;
};

/** 생활권 분위기 체크리스트 조회 — GET /api/living-zones/:id/checklists */
export const getZoneChecklist = async (zoneId: number): Promise<ZoneChecklistResultItem[]> => {
  const { data } = await api.get<ZoneChecklistResultItem[]>(`/api/living-zones/${zoneId}/checklists`);
  return data;
};

/** 생활권 체크 결과 upsert — PATCH /api/living-zones/:id/checklists/:templateId */
export const upsertZoneChecklistResult = async (
  zoneId: number,
  templateId: number,
  req: { rating?: string | null; memo?: string | null }
): Promise<ZoneChecklistResultItem> => {
  const { data } = await api.patch<ZoneChecklistResultItem>(
    `/api/living-zones/${zoneId}/checklists/${templateId}`, req
  );
  return data;
};

/** 생활권 등록 — POST /api/living-zones */
export const createLivingZone = async (body: { district: string; name: string; memo?: string }): Promise<LivingZone> => {
  const { data } = await api.post<LivingZone>('/api/living-zones', body);
  return data;
};

/** 생활권 메모 수정 — PATCH /api/living-zones/:id/memo */
export const updateLivingZoneMemo = async (id: number, memo: string): Promise<void> => {
  await api.patch(`/api/living-zones/${id}/memo`, { memo });
};

/** 생활권 구획 폴리곤 저장 — PATCH /api/living-zones/:id/polygon
 *  polygonPoints: null이면 구획 초기화 */
export const updateLivingZonePolygon = async (id: number, polygonPoints: { lat: number; lng: number }[] | null): Promise<LivingZone> => {
  const { data } = await api.patch<LivingZone>(`/api/living-zones/${id}/polygon`, { polygonPoints });
  return data;
};

/** 생활권에 단지 일괄 추가 — POST /api/living-zones/:id/complexes
 *  백엔드가 { complexIds: number[] } 배열을 받고 갱신된 LivingZoneDto를 반환 */
export const addComplexesToZone = async (zoneId: number, complexIds: number[]): Promise<LivingZone> => {
  const { data } = await api.post<LivingZone>(`/api/living-zones/${zoneId}/complexes`, { complexIds });
  return data;
};

/** 생활권에서 단지 제거 — DELETE /api/living-zones/:id/complexes/:complexId */
export const removeComplexFromZone = async (zoneId: number, complexId: number): Promise<void> => {
  await api.delete(`/api/living-zones/${zoneId}/complexes/${complexId}`);
};

/** 생활권 삭제 — DELETE /api/living-zones/:id */
export const deleteLivingZone = async (id: number): Promise<void> => {
  await api.delete(`/api/living-zones/${id}`);
};

/** 생활권 사진 목록 조회 — GET /api/living-zones/:id/photos */
export const getLivingZonePhotos = async (zoneId: number): Promise<LivingZonePhoto[]> => {
  const { data } = await api.get<LivingZonePhoto[]>(`/api/living-zones/${zoneId}/photos`);
  return data;
};

/** 생활권 사진 업로드 — POST /api/living-zones/:id/photos (multipart/form-data) */
export const uploadLivingZonePhotos = async (zoneId: number, files: File[]): Promise<LivingZonePhoto[]> => {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  const { data } = await api.post<LivingZonePhoto[]>(`/api/living-zones/${zoneId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

/** 생활권 사진 삭제 — DELETE /api/living-zones/:id/photos/:photoId */
export const deleteLivingZonePhoto = async (zoneId: number, photoId: number): Promise<void> => {
  await api.delete(`/api/living-zones/${zoneId}/photos/${photoId}`);
};

/** 실거래가/전세가 배치 수집 — POST /api/batch/real-estate-price */
export const runBatchRealEstatePrice = async (): Promise<void> => {
  // 배치 처리는 시간이 걸릴 수 있어 타임아웃을 3분으로 별도 설정
  await api.post('/api/batch/real-estate-price', {}, { timeout: 180_000 });
};

/** 지하철 정보 추가 — POST /api/complexes/:id/subway-infos */
export const addSubwayInfos = async (
  complexId: number,
  items: Omit<SubwayInfo, 'id'>[]
): Promise<SubwayInfo[]> => {
  const { data } = await api.post<SubwayInfo[]>(
    `/api/complexes/${complexId}/subway-infos`,
    items
  );
  return data;
};

/** 지하철 정보 수정 — PATCH /api/complexes/:id/subway-infos/:sid */
export const updateSubwayInfo = async (
  complexId: number,
  subwayId: number,
  data: Omit<SubwayInfo, 'id'>
): Promise<SubwayInfo> => {
  const { data: result } = await api.patch<SubwayInfo>(
    `/api/complexes/${complexId}/subway-infos/${subwayId}`,
    data
  );
  return result;
};

/** 지하철 정보 삭제 — DELETE /api/complexes/:id/subway-infos/:sid */
export const deleteSubwayInfo = async (complexId: number, subwayId: number): Promise<void> => {
  await api.delete(`/api/complexes/${complexId}/subway-infos/${subwayId}`);
};

/** 출퇴근 시간 일괄 교체 — PATCH /api/complexes/:id/commute-times */
export const updateCommuteTimes = async (
  complexId: number,
  items: Array<{ destination: string; minutes?: number; transportType?: string; transferCount?: number; transferLines?: string; distanceKm?: number }>
): Promise<CommuteTime[]> => {
  const { data } = await api.patch<CommuteTime[]>(`/api/complexes/${complexId}/commute-times`, items);
  return data;
};

/** 경로 목록 조회 — GET /api/routes */
export const getRoutes = async (): Promise<MapRoute[]> => {
  const { data } = await api.get<MapRoute[]>('/api/routes');
  return data;
};

/** 경로 저장 — POST /api/routes */
export const createRoute = async (name: string, points: RoutePoint[]): Promise<MapRoute> => {
  const { data } = await api.post<MapRoute>('/api/routes', { name, points });
  return data;
};

/** 경로 수정 — PATCH /api/routes/:id */
export const updateRoute = async (id: number, name: string, points: RoutePoint[]): Promise<MapRoute> => {
  const { data } = await api.patch<MapRoute>(`/api/routes/${id}`, { name, points });
  return data;
};

/** 경로 삭제 — DELETE /api/routes/:id */
export const deleteRoute = async (id: number): Promise<void> => {
  await api.delete(`/api/routes/${id}`);
};

/** 비교 평가 목록 조회 — GET /api/comparisons */
export const getComparisons = async (): Promise<Comparison[]> => {
  const { data } = await api.get<Comparison[]>('/api/comparisons');
  return data;
};

/** 비교 평가 단건 조회 — GET /api/comparisons/:id */
export const getComparisonById = async (id: number): Promise<Comparison> => {
  const { data } = await api.get<Comparison>(`/api/comparisons/${id}`);
  return data;
};

/** 비교 평가 생성 — POST /api/comparisons */
export const createComparison = async (body: {
  complexId1: number; complexId2: number;
  memo?: string; valueRating?: string; priceNote?: string; conclusion?: string;
  selectedComplexId?: number;
}): Promise<Comparison> => {
  const { data } = await api.post<Comparison>('/api/comparisons', body);
  return data;
};

/** 비교 평가 부분 수정 — PATCH /api/comparisons/:id */
export const updateComparison = async (
  id: number,
  body: { memo?: string; valueRating?: string; priceNote?: string; conclusion?: string; selectedComplexId?: number | null }
): Promise<Comparison> => {
  const { data } = await api.patch<Comparison>(`/api/comparisons/${id}`, body);
  return data;
};

/** 비교 평가 삭제 (사진 CASCADE) — DELETE /api/comparisons/:id */
export const deleteComparison = async (id: number): Promise<void> => {
  await api.delete(`/api/comparisons/${id}`);
};

/** 비교평가에서 가장 많이 선정된 단지 — GET /api/comparisons/most-selected
 *  선정 단지 없으면 404 → null 반환 */
export const getMostSelectedComplex = async (): Promise<{ complexId: number; complexName: string; selectedCount: number } | null> => {
  try {
    const { data } = await api.get<{ complexId: number; complexName: string; selectedCount: number }>('/api/comparisons/most-selected');
    return data;
  } catch (e: any) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
};

/** 비교 평가 사진 업로드 — POST /api/comparisons/:id/photos (multipart) */
export const uploadComparisonPhoto = async (
  id: number, file: File, memo?: string
): Promise<ComparisonPhoto> => {
  const formData = new FormData();
  formData.append('file', file);
  if (memo) formData.append('memo', memo);
  const { data } = await api.post<ComparisonPhoto>(
    `/api/comparisons/${id}/photos`, formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
};

/** 비교 평가 사진 메모 수정 — PATCH /api/comparisons/:id/photos/:photoId */
export const updateComparisonPhotoMemo = async (
  id: number, photoId: number, memo: string
): Promise<void> => {
  await api.patch(`/api/comparisons/${id}/photos/${photoId}`, { memo });
};

/** 비교 평가 사진 삭제 — DELETE /api/comparisons/:id/photos/:photoId */
export const deleteComparisonPhoto = async (id: number, photoId: number): Promise<void> => {
  await api.delete(`/api/comparisons/${id}/photos/${photoId}`);
};

/** 체크리스트 템플릿 목록 조회 — GET /api/checklists/templates */
export const getChecklistTemplates = async (visitType?: string): Promise<ChecklistTemplate[]> => {
  const params = visitType ? { visitType } : {};
  const { data } = await api.get<ChecklistTemplate[]>('/api/checklists/templates', { params });
  return data;
};

/** 체크리스트 템플릿 추가 — POST /api/checklists/templates */
export const createChecklistTemplate = async (
  req: { visitType: string; category?: string; itemName: string; displayOrder?: number; inputType?: string }
): Promise<ChecklistTemplate> => {
  const { data } = await api.post<ChecklistTemplate>('/api/checklists/templates', req);
  return data;
};

/** 체크리스트 템플릿 수정 — PATCH /api/checklists/templates/:id */
export const updateChecklistTemplate = async (
  id: number, req: { itemName?: string; displayOrder?: number; inputType?: string }
): Promise<ChecklistTemplate> => {
  const { data } = await api.patch<ChecklistTemplate>(`/api/checklists/templates/${id}`, req);
  return data;
};

/** 체크리스트 템플릿 삭제 — DELETE /api/checklists/templates/:id */
export const deleteChecklistTemplate = async (id: number): Promise<void> => {
  await api.delete(`/api/checklists/templates/${id}`);
};

/** 단지 체크리스트 조회 — GET /api/complexes/:id/checklists */
export const getComplexChecklist = async (
  complexId: number, visitType?: string
): Promise<ChecklistResultItem[]> => {
  const params = visitType ? { visitType } : {};
  const { data } = await api.get<ChecklistResultItem[]>(
    `/api/complexes/${complexId}/checklists`, { params }
  );
  return data;
};

/** 단지 체크 결과 upsert — PATCH /api/complexes/:id/checklists/:templateId */
export const upsertChecklistResult = async (
  complexId: number,
  templateId: number,
  req: { rating?: string | null; memo?: string | null }
): Promise<ChecklistResultItem> => {
  const { data } = await api.patch<ChecklistResultItem>(
    `/api/complexes/${complexId}/checklists/${templateId}`, req
  );
  return data;
};

/** 매물 임장 기록 목록 조회 — GET /api/complexes/:id/property-visits */
export const getPropertyVisits = async (complexId: number): Promise<PropertyVisit[]> => {
  const { data } = await api.get<PropertyVisit[]>(`/api/complexes/${complexId}/property-visits`);
  return data;
};

/** 매물 임장 기록 추가 — POST /api/complexes/:id/property-visits */
export const createPropertyVisit = async (
  complexId: number,
  req: { visitDate?: string; agentName?: string; officePhone?: string; mobilePhone?: string; dong?: string; hosu?: string; areaType?: string; price?: number; memo?: string }
): Promise<PropertyVisit> => {
  const { data } = await api.post<PropertyVisit>(`/api/complexes/${complexId}/property-visits`, req);
  return data;
};

/** 매물 임장 기록 수정 — PATCH /api/complexes/:id/property-visits/:visitId */
export const updatePropertyVisit = async (
  complexId: number,
  visitId: number,
  req: { visitDate?: string; agentName?: string; officePhone?: string; mobilePhone?: string; dong?: string; hosu?: string; areaType?: string; price?: number; memo?: string }
): Promise<PropertyVisit> => {
  const { data } = await api.patch<PropertyVisit>(`/api/complexes/${complexId}/property-visits/${visitId}`, req);
  return data;
};

/** 매물 임장 기록 삭제 — DELETE /api/complexes/:id/property-visits/:visitId */
export const deletePropertyVisit = async (complexId: number, visitId: number): Promise<void> => {
  await api.delete(`/api/complexes/${complexId}/property-visits/${visitId}`);
};

/** 매물 임장 체크 결과 upsert — PATCH /api/complexes/:id/property-visits/:visitId/checklists/:templateId */
export const upsertPropertyVisitResult = async (
  complexId: number,
  visitId: number,
  templateId: number,
  req: { rating?: string | null; memo?: string | null }
): Promise<PropertyVisitResultItem> => {
  const { data } = await api.patch<PropertyVisitResultItem>(
    `/api/complexes/${complexId}/property-visits/${visitId}/checklists/${templateId}`, req
  );
  return data;
};

/** 구별 시세 통계 조회 — GET /api/district-stats */
export const getDistrictStats = async (tradeMonth?: string): Promise<{ data: import('../types').DistrictStat[]; availableMonths: string[] }> => {
  const params = tradeMonth ? { trade_month: tradeMonth } : {};
  const { data } = await api.get('/api/district-stats', { params });
  return data;
};

/** 구·월·평형별 실거래 상세 목록 — GET /api/district-stats/details */
export const getDistrictTradeDetails = async (
  district: string, tradeMonth: string, areaKey: string, type: 'trade' | 'jeonse'
): Promise<{ items: import('../types').DistrictTradeDetail[] }> => {
  const { data } = await api.get('/api/district-stats/details', {
    params: { district, trade_month: tradeMonth, area_key: areaKey, type },
  });
  return data;
};

/** 구별 시세 전체 이력 조회 (그래프용) — GET /api/district-stats/history */
export const getDistrictStatsHistory = async (
  areaKey: string, type: 'trade' | 'jeonse'
): Promise<{ months: string[]; items: import('../types').DistrictStatHistory[] }> => {
  const { data } = await api.get('/api/district-stats/history', {
    params: { area_key: areaKey, type },
  });
  return data;
};

/** 구별 시세 수집 트리거 — POST /api/district-stats/collect (202 반환 후 백그라운드 처리) */
export const collectDistrictStats = async (): Promise<{ message: string }> => {
  const { data } = await api.post('/api/district-stats/collect');
  return data;
};

/** 서울 25구 목록 — GET /api/public-complexes/gu-list */
export const getPublicComplexGuList = async (): Promise<{ guName: string; sigunguCd: string }[]> => {
  const { data } = await api.get('/api/public-complexes/gu-list');
  return data;
};

/** 공공단지 수집 트리거 — POST /api/public-complexes/collect (백그라운드 실행) */
export const collectPublicComplexes = async (guName: string): Promise<{ status: string; gu_name: string }> => {
  const { data } = await api.post('/api/public-complexes/collect', { gu_name: guName });
  return data;
};

/** 저장된 공공단지 목록 — GET /api/public-complexes?sigungu_cd= */
export const getPublicComplexes = async (sigunguCd: string): Promise<any[]> => {
  const { data } = await api.get('/api/public-complexes', { params: { sigungu_cd: sigunguCd } });
  return data;
};


export default api;
