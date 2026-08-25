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
  PublicComplex,
  BudgetEntry,
  BudgetSummary,
  Asset,
  AssetSnapshotCell,
  AssetSnapshotDetail,
  FixedExpense,
  FixedExpenseCalendar,
  Todo,
  PaymentMethod,
  CommonCode,
  MarketReport,
  Schedule,
  Contact,
  ConsultationLog,
  Dday,
  DayScheduleBlock,
  InvestmentMemo,
  InvestmentMemoImage,
  WorkoutLog,
  ScreeningReport,
  ScreeningTopPick,
  IntegratedReport,
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

/** 생활권 단지 순위 업데이트 — PATCH /api/living-zones/:id/rankings
 *  complexIds: 순위 순서대로 정렬된 complexId 배열 (빈 배열이면 초기화) */
export const reorderZoneComplexes = async (zoneId: number, complexIds: number[]): Promise<LivingZone> => {
  const { data } = await api.patch<LivingZone>(`/api/living-zones/${zoneId}/rankings`, { complexIds });
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

/** 수도권 지역 목록 — GET /api/public-complexes/gu-list */
export const getPublicComplexGuList = async (): Promise<{ guName: string; sigunguCd: string; province?: string }[]> => {
  const { data } = await api.get('/api/public-complexes/gu-list');
  return data;
};

/** 공공단지 수집 트리거 — POST /api/public-complexes/collect (백그라운드 실행) */
export const collectPublicComplexes = async (guName: string): Promise<{ status: string; gu_name: string }> => {
  const { data } = await api.post('/api/public-complexes/collect', { gu_name: guName });
  return data;
};

/** 저장된 공공단지 목록 — GET /api/public-complexes?sigungu_cd= */
export const getPublicComplexes = async (sigunguCd: string): Promise<PublicComplex[]> => {
  const { data } = await api.get('/api/public-complexes', { params: { sigungu_cd: sigunguCd } });
  // 백엔드가 snake_case로 반환 → camelCase로 변환
  return data.map((item: any) => ({
    id: item.id,
    guName: item.gu_name,
    bldNm: item.bld_nm,
    address: item.address,
    hhldCnt: item.hhld_cnt,
    vlRat: item.vl_rat,
    parkingCnt: item.parking_cnt,
    useAprDay: item.use_apr_day,
    latitude: item.latitude,
    longitude: item.longitude,
  }));
};


// ─── 가계부 API ───────────────────────────────────────────────

// 백엔드는 snake_case 반환 → camelCase 변환
const toEntry = (d: any): BudgetEntry => ({
  id: d.id,
  userId: d.user_id,
  yearMonth: d.year_month,
  entryDate: d.entry_date,
  entryType: d.entry_type,
  category: d.category,
  subcategory: d.subcategory,
  accountMain: d.account_main,
  account: d.account,
  cardName: d.card_name,
  amount: d.amount,
  isFixed: d.is_fixed ?? false,
  isInvestment: d.is_investment ?? false,
  investmentType: d.investment_type,
  isTransfer: d.is_transfer ?? false,
  isCardPayment: d.is_card_payment ?? false,
  transferPairId: d.transfer_pair_id ?? undefined,
  merchant: d.merchant,
  installmentMonths: d.installment_months ?? undefined,
  installmentSeq: d.installment_seq ?? undefined,
  installmentGroupId: d.installment_group_id ?? undefined,
  isInterestFree: d.is_interest_free ?? false,
  memo: d.memo,
  createdAt: d.created_at,
});

export const getCardSpendingByDate = async (
  userId: string, cardName: string, dateFrom: string, dateTo: string
): Promise<number> => {
  const { data } = await api.get('/api/budget/card-spending', {
    params: { user_id: userId, card_name: cardName, date_from: dateFrom, date_to: dateTo },
  });
  return data.amount;
};

export const getBudgetEntries = async (userId: string, yearMonth: string): Promise<BudgetEntry[]> => {
  const { data } = await api.get('/api/budget/entries', { params: { user_id: userId, year_month: yearMonth } });
  return data.map(toEntry);
};

export const createBudgetEntry = async (payload: Omit<BudgetEntry, 'id' | 'createdAt'>): Promise<BudgetEntry> => {
  const { data } = await api.post('/api/budget/entries', {
    user_id: payload.userId,
    year_month: payload.yearMonth,
    entry_date: payload.entryDate,
    entry_type: payload.entryType,
    category: payload.category,
    subcategory: payload.subcategory ?? null,
    account_main: payload.accountMain ?? null,
    account: payload.account ?? null,
    card_name: payload.cardName ?? null,
    amount: payload.amount,
    is_fixed: payload.isFixed,
    is_investment: payload.isInvestment,
    investment_type: payload.investmentType ?? null,
    is_transfer: payload.isTransfer ?? false,
    is_card_payment: payload.isCardPayment ?? false,
    transfer_pair_id: payload.transferPairId ?? null,
    merchant: payload.merchant ?? null,
    installment_months: payload.installmentMonths ?? null,
    installment_seq: payload.installmentSeq ?? null,
    installment_group_id: payload.installmentGroupId ?? null,
    is_interest_free: payload.isInterestFree ?? false,
    memo: payload.memo ?? null,
  });
  return toEntry(data);
};

export const updateBudgetEntry = async (id: number, payload: Partial<Omit<BudgetEntry, 'id' | 'userId' | 'yearMonth' | 'createdAt'>>): Promise<BudgetEntry> => {
  const body: any = {};
  if (payload.entryDate !== undefined) body.entry_date = payload.entryDate;
  if (payload.entryType !== undefined) body.entry_type = payload.entryType;
  if (payload.category !== undefined) body.category = payload.category;
  if (payload.subcategory !== undefined) body.subcategory = payload.subcategory;
  if (payload.accountMain !== undefined) body.account_main = payload.accountMain;
  if (payload.account !== undefined) body.account = payload.account;
  if (payload.cardName !== undefined) body.card_name = payload.cardName;
  if (payload.amount !== undefined) body.amount = payload.amount;
  if (payload.isFixed !== undefined) body.is_fixed = payload.isFixed;
  if (payload.isInvestment !== undefined) body.is_investment = payload.isInvestment;
  if (payload.investmentType !== undefined) body.investment_type = payload.investmentType;
  if (payload.isTransfer !== undefined) body.is_transfer = payload.isTransfer;
  if (payload.isCardPayment !== undefined) body.is_card_payment = payload.isCardPayment;
  if (payload.transferPairId !== undefined) body.transfer_pair_id = payload.transferPairId;
  if (payload.merchant !== undefined) body.merchant = payload.merchant;
  if (payload.installmentMonths !== undefined) body.installment_months = payload.installmentMonths;
  if (payload.installmentSeq !== undefined) body.installment_seq = payload.installmentSeq;
  if (payload.installmentGroupId !== undefined) body.installment_group_id = payload.installmentGroupId;
  if (payload.isInterestFree !== undefined) body.is_interest_free = payload.isInterestFree;
  if (payload.memo !== undefined) body.memo = payload.memo;
  const { data } = await api.patch(`/api/budget/entries/${id}`, body);
  return toEntry(data);
};

export const deleteBudgetEntry = async (id: number): Promise<void> => {
  await api.delete(`/api/budget/entries/${id}`);
};

export const deleteBudgetEntriesByGroup = async (groupId: string): Promise<number> => {
  const { data } = await api.delete(`/api/budget/entries/group/${groupId}`);
  return data.deleted as number;
};

// 여러 가계부 항목을 한 번에 저장 (달력 일괄 등록용)
export const bulkCreateBudgetEntries = async (
  entries: Omit<BudgetEntry, 'id' | 'createdAt'>[]
): Promise<BudgetEntry[]> => {
  const { data } = await api.post('/api/budget/entries/bulk', {
    entries: entries.map(payload => ({
      user_id: payload.userId,
      year_month: payload.yearMonth,
      entry_date: payload.entryDate,
      entry_type: payload.entryType,
      category: payload.category,
      subcategory: payload.subcategory ?? null,
      account_main: payload.accountMain ?? null,
      account: payload.account ?? null,
      card_name: payload.cardName ?? null,
      amount: payload.amount,
      is_fixed: payload.isFixed,
      is_investment: payload.isInvestment,
      investment_type: payload.investmentType ?? null,
      merchant: payload.merchant ?? null,
      installment_months: payload.installmentMonths ?? null,
      installment_seq: payload.installmentSeq ?? null,
      installment_group_id: payload.installmentGroupId ?? null,
      is_interest_free: payload.isInterestFree ?? false,
      memo: payload.memo ?? null,
    })),
  });
  return data.map(toEntry);
};

export const getBudgetSummary = async (userId: string, yearMonth: string): Promise<BudgetSummary> => {
  const { data } = await api.get('/api/budget/summary', { params: { user_id: userId, year_month: yearMonth } });
  return data as BudgetSummary;
};

// ─── 자산 API ─────────────────────────────────────────────────

const toAsset = (d: any): Asset => ({
  id: d.id,
  userId: d.user_id,
  assetName: d.asset_name,
  assetType: d.asset_type,
  amount: d.amount,
  memo: d.memo,
  updatedAt: d.updated_at,
});

export const getAssets = async (userId: string): Promise<Asset[]> => {
  const { data } = await api.get('/api/assets', { params: { user_id: userId } });
  return data.map(toAsset);
};

export const createAsset = async (payload: Omit<Asset, 'id' | 'updatedAt'>): Promise<Asset> => {
  const { data } = await api.post('/api/assets', {
    user_id: payload.userId,
    asset_name: payload.assetName,
    asset_type: payload.assetType,
    amount: payload.amount,
    memo: payload.memo ?? null,
  });
  return toAsset(data);
};

export const updateAsset = async (id: number, payload: Partial<Pick<Asset, 'assetName' | 'assetType' | 'amount' | 'memo'>>): Promise<Asset> => {
  const body: any = {};
  if (payload.assetName !== undefined) body.asset_name = payload.assetName;
  if (payload.assetType !== undefined) body.asset_type = payload.assetType;
  if (payload.amount !== undefined) body.amount = payload.amount;
  if (payload.memo !== undefined) body.memo = payload.memo;
  const { data } = await api.patch(`/api/assets/${id}`, body);
  return toAsset(data);
};

export const deleteAsset = async (id: number): Promise<void> => {
  await api.delete(`/api/assets/${id}`);
};

// ─── 자산 스냅샷 API ──────────────────────────────────────────────

const toSnapshotCell = (d: any): AssetSnapshotCell => ({
  id: d.id,
  userId: d.user_id,
  snapshotDate: d.snapshot_date,
  assetType: d.asset_type,
  amount: d.amount,
});

/** 전체 유저 스냅샷 목록 (그래프·통합 보기용) */
export const getAllAssetSnapshots = async (): Promise<AssetSnapshotCell[]> => {
  const { data } = await api.get('/api/assets/snapshots/all');
  return data.map(toSnapshotCell);
};

/** 특정 유저의 전체 스냅샷 목록 */
export const getAssetSnapshots = async (userId: string): Promise<AssetSnapshotCell[]> => {
  const { data } = await api.get('/api/assets/snapshots', { params: { user_id: userId } });
  return data.map(toSnapshotCell);
};

/** 단일 셀 upsert */
export const upsertAssetSnapshotCell = async (payload: {
  userId: string;
  snapshotDate: string;
  assetType: string;
  amount: number;
}): Promise<AssetSnapshotCell> => {
  const { data } = await api.put('/api/assets/snapshots/cell', {
    user_id: payload.userId,
    snapshot_date: payload.snapshotDate,
    asset_type: payload.assetType,
    amount: payload.amount,
  });
  return toSnapshotCell(data);
};

/** 특정 날짜 스냅샷을 새 날짜로 복사 */
export const copyAssetSnapshot = async (
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<AssetSnapshotCell[]> => {
  const { data } = await api.post('/api/assets/snapshots/copy', {
    user_id: userId,
    from_date: fromDate,
    to_date: toDate,
  });
  return data.map(toSnapshotCell);
};

/** 특정 날짜의 모든 스냅샷 행 삭제 */
export const deleteAssetSnapshotDate = async (userId: string, snapshotDate: string): Promise<void> => {
  await api.delete(`/api/assets/snapshots/${snapshotDate}`, { params: { user_id: userId } });
};

// ─── 자산 세부 항목 API ──────────────────────────────────────────

const toDetail = (d: any): AssetSnapshotDetail => ({
  id: d.id,
  userId: d.user_id,
  snapshotDate: d.snapshot_date,
  assetType: d.asset_type,
  accountName: d.account_name,
  amount: d.amount,
});

/** 특정 날짜의 세부 항목 목록 (전체 유저) */
export const getAssetSnapshotDetails = async (snapshotDate: string): Promise<AssetSnapshotDetail[]> => {
  const { data } = await api.get('/api/assets/snapshots/details', { params: { snapshot_date: snapshotDate } });
  return data.map(toDetail);
};

/** 세부 항목 일괄 저장 — 닫을 때 합산이 스냅샷 셀에 자동 반영됨 */
export const bulkSaveAssetSnapshotDetails = async (
  snapshotDate: string,
  userId: string,
  assetType: string,
  items: { userId: string; assetType: string; accountName: string; amount: number }[],
): Promise<AssetSnapshotDetail[]> => {
  const { data } = await api.post('/api/assets/snapshots/details/bulk', {
    snapshot_date: snapshotDate,
    user_id: userId,
    asset_type: assetType,
    items: items.map(i => ({
      user_id: i.userId,
      asset_type: i.assetType,
      account_name: i.accountName,
      amount: i.amount,
    })),
  });
  return data.map(toDetail);
};

// ── 고정비 관리 API ───────────────────────────────────────────────

const toFixedExpense = (d: any): FixedExpense => ({
  id: d.id,
  userId: d.user_id,
  name: d.name,
  amount: d.amount,
  accountMain: d.account_main ?? undefined,
  account: d.account ?? undefined,
  paymentDay: d.payment_day ?? undefined,
  category: d.category,
  isActive: d.is_active,
});

export const getFixedExpenses = async (userId: string): Promise<FixedExpense[]> => {
  const { data } = await api.get('/api/budget/fixed-expenses', { params: { user_id: userId } });
  return data.map(toFixedExpense);
};

export const createFixedExpense = async (payload: {
  userId: string; name: string; amount: number;
  accountMain?: string; account?: string; paymentDay?: number; category: string;
}): Promise<FixedExpense> => {
  const { data } = await api.post('/api/budget/fixed-expenses', {
    user_id: payload.userId, name: payload.name, amount: payload.amount,
    account_main: payload.accountMain ?? null, account: payload.account ?? null,
    payment_day: payload.paymentDay ?? null, category: payload.category,
  });
  return toFixedExpense(data);
};

export const updateFixedExpense = async (id: number, payload: {
  name?: string; amount?: number; accountMain?: string; account?: string;
  paymentDay?: number; category?: string;
}): Promise<FixedExpense> => {
  const { data } = await api.patch(`/api/budget/fixed-expenses/${id}`, {
    name: payload.name, amount: payload.amount,
    account_main: payload.accountMain, account: payload.account,
    payment_day: payload.paymentDay, category: payload.category,
  });
  return toFixedExpense(data);
};

export const deleteFixedExpense = async (id: number): Promise<void> => {
  await api.delete(`/api/budget/fixed-expenses/${id}`);
};

export const payFixedExpense = async (
  id: number, yearMonth: string, entryDate: string,
): Promise<BudgetEntry> => {
  const { data } = await api.post(`/api/budget/fixed-expenses/${id}/pay`, {
    year_month: yearMonth, entry_date: entryDate,
  });
  return toEntry(data);
};

// ─── 할일 API ─────────────────────────────────────────────────────
export const getTodos = async (yearMonth: string): Promise<Todo[]> => {
  const { data } = await api.get('/api/todos', { params: { year_month: yearMonth } });
  return data as Todo[];
};
export const createTodo = async (payload: { userId: string; title: string; todoDate: string; endDate?: string }): Promise<Todo> => {
  const { data } = await api.post('/api/todos', {
    user_id: payload.userId, title: payload.title, todo_date: payload.todoDate,
    ...(payload.endDate ? { end_date: payload.endDate } : {}),
  });
  return data as Todo;
};
export const updateTodo = async (id: number, payload: { title?: string; isDone?: boolean; endDate?: string; doneDate?: string | null }): Promise<Todo> => {
  const body: any = {};
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.isDone !== undefined) body.is_done = payload.isDone;
  if (payload.endDate !== undefined) body.end_date = payload.endDate;
  if (payload.doneDate !== undefined) body.done_date = payload.doneDate ?? '';  // null → '' → 백엔드에서 NULL 처리
  const { data } = await api.patch(`/api/todos/${id}`, body);
  return data as Todo;
};
export const deleteTodo = async (id: number): Promise<void> => {
  await api.delete(`/api/todos/${id}`);
};

// ── 연락처 (부동산/대출상담사) ─────────────────────────────────────
const toContact = (c: any): Contact => ({
  id: c.id,
  type: c.type,
  company: c.company,
  name: c.name,
  phone: c.phone,
  region: c.region,
  memo: c.memo,
  createdAt: c.created_at,
});

export const getContacts = async (): Promise<Contact[]> => {
  const { data } = await api.get('/api/contacts');
  return (data as any[]).map(toContact);
};

export const createContact = async (payload: Omit<Contact, 'id' | 'createdAt'>): Promise<Contact> => {
  const { data } = await api.post('/api/contacts', payload);
  return toContact(data);
};

export const updateContact = async (id: number, payload: Partial<Omit<Contact, 'id' | 'createdAt'>>): Promise<Contact> => {
  const { data } = await api.patch(`/api/contacts/${id}`, payload);
  return toContact(data);
};

export const deleteContact = async (id: number): Promise<void> => {
  await api.delete(`/api/contacts/${id}`);
};

// ── 상담 기록 ────────────────────────────────────────────────────────────────
const toLog = (l: any): ConsultationLog => ({
  id: l.id,
  contactId: l.contact_id,
  consultDate: l.consult_date,
  title: l.title,
  content: l.content,
  audioUrl: l.audio_url,
  createdAt: l.created_at,
});

export const getConsultationLogs = async (contactId: number): Promise<ConsultationLog[]> => {
  const { data } = await api.get(`/api/contacts/${contactId}/consultations`);
  return (data as any[]).map(toLog);
};

export const createConsultationLog = async (
  contactId: number,
  payload: { consultDate: string; title: string; content?: string }
): Promise<ConsultationLog> => {
  const { data } = await api.post(`/api/contacts/${contactId}/consultations`, {
    consult_date: payload.consultDate,
    title: payload.title,
    content: payload.content,
  });
  return toLog(data);
};

export const updateConsultationLog = async (
  contactId: number,
  logId: number,
  payload: { consultDate?: string; title?: string; content?: string }
): Promise<ConsultationLog> => {
  const { data } = await api.patch(`/api/contacts/${contactId}/consultations/${logId}`, {
    ...(payload.consultDate && { consult_date: payload.consultDate }),
    ...(payload.title !== undefined && { title: payload.title }),
    ...(payload.content !== undefined && { content: payload.content }),
  });
  return toLog(data);
};

export const uploadConsultationAudio = async (contactId: number, logId: number, file: File): Promise<ConsultationLog> => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(
    `/api/contacts/${contactId}/consultations/${logId}/audio`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }
  );
  return toLog(data);
};

export const deleteConsultationAudio = async (contactId: number, logId: number): Promise<ConsultationLog> => {
  const { data } = await api.delete(`/api/contacts/${contactId}/consultations/${logId}/audio`);
  return toLog(data);
};

export const deleteConsultationLog = async (contactId: number, logId: number): Promise<void> => {
  await api.delete(`/api/contacts/${contactId}/consultations/${logId}`);
};

export const getFixedExpenseCalendar = async (yearMonth: string): Promise<FixedExpenseCalendar> => {
  // yearMonth: YYYYMM 형식
  const { data } = await api.get('/api/budget/fixed-expense-calendar', { params: { year_month: yearMonth } });
  return data as FixedExpenseCalendar;
};

// ─── 결제수단 API ─────────────────────────────────────────────────
// 백엔드 snake_case → camelCase 변환

const toPaymentMethod = (d: any): PaymentMethod => ({
  id: d.id,
  userId: d.user_id,
  name: d.name,
  type: d.type,
  accountMain: d.account_main ?? undefined,
  accountNumber: d.account_number ?? undefined,
  cardAlias: d.card_alias ?? undefined,
  billingDay: d.billing_day ?? undefined,
  billingStartDay: d.billing_start_day ?? undefined,
  billingEndDay: d.billing_end_day ?? undefined,
  isShared: d.is_shared ?? false,
  isActive: d.is_active,
});

export const getPaymentMethods = async (userId: string): Promise<PaymentMethod[]> => {
  const { data } = await api.get('/api/budget/payment-methods', { params: { user_id: userId } });
  return data.map(toPaymentMethod);
};

export const createPaymentMethod = async (payload: {
  userId: string; name: string; type: string;
  accountMain?: string; accountNumber?: string; cardAlias?: string;
  billingDay?: number; billingStartDay?: number; billingEndDay?: number;
  isShared?: boolean;
}): Promise<PaymentMethod> => {
  const { data } = await api.post('/api/budget/payment-methods', {
    user_id: payload.userId,
    name: payload.name,
    type: payload.type,
    account_main: payload.accountMain ?? null,
    account_number: payload.accountNumber ?? null,
    card_alias: payload.cardAlias ?? null,
    billing_day: payload.billingDay ?? null,
    billing_start_day: payload.billingStartDay ?? null,
    billing_end_day: payload.billingEndDay ?? null,
    is_shared: payload.isShared ?? false,
  });
  return toPaymentMethod(data);
};

export const updatePaymentMethod = async (id: number, payload: {
  name?: string; type?: string;
  accountMain?: string; accountNumber?: string; cardAlias?: string;
  billingDay?: number; billingStartDay?: number; billingEndDay?: number;
  isShared?: boolean;
}): Promise<PaymentMethod> => {
  const { data } = await api.patch(`/api/budget/payment-methods/${id}`, {
    name: payload.name,
    type: payload.type,
    account_main: payload.accountMain,
    account_number: payload.accountNumber,
    card_alias: payload.cardAlias,
    billing_day: payload.billingDay,
    billing_start_day: payload.billingStartDay,
    billing_end_day: payload.billingEndDay,
    is_shared: payload.isShared,
  });
  return toPaymentMethod(data);
};

export const getSharedAccountEntries = async (
  accountName: string,
  yearMonth: string,
): Promise<BudgetEntry[]> => {
  const { data } = await api.get('/api/budget/shared-account-entries', {
    params: { account_name: accountName, year_month: yearMonth },
  });
  return data.map(toEntry);
};

export const deletePaymentMethod = async (id: number): Promise<void> => {
  await api.delete(`/api/budget/payment-methods/${id}`);
};

// ── 통장 잔액 관리 ────────────────────────────────────────────────

export const getAccountBalances = async (userId: string, yearMonth: string): Promise<{ accountName: string; openingBalance: number }[]> => {
  const { data } = await api.get('/api/budget/account-balances', { params: { user_id: userId, year_month: yearMonth } });
  return data.map((d: any) => ({ accountName: d.account_name, openingBalance: d.opening_balance }));
};

export const upsertAccountBalance = async (userId: string, accountName: string, yearMonth: string, openingBalance: number): Promise<void> => {
  await api.put('/api/budget/account-balances', { user_id: userId, account_name: accountName, year_month: yearMonth, opening_balance: openingBalance });
};

export const carryOverAccountBalances = async (userId: string, fromMonth: string, toMonth: string, closingBalances: Record<string, number>): Promise<void> => {
  await api.post('/api/budget/account-balances/carry-over', { user_id: userId, from_month: fromMonth, to_month: toMonth, closing_balances: closingBalances });
};

// ── 공통코드 ─────────────────────────────────────────────────────

const toCommonCode = (item: any): CommonCode => ({
  id: item.id,
  commonCode: item.common_code,
  commonCodeName: item.common_code_name,
  detailCode: item.detail_code,
  detailCodeName: item.detail_code_name,
  sortOrder: item.sort_order,
  createdAt: item.created_at,
});

// 공통코드 인메모리 캐시 — 앱 실행 중 최초 1회만 API 호출, Promise 자체를 캐싱해 동시 중복 요청 방지
const _commonCodeCache = new Map<string, Promise<CommonCode[]>>();

/** 공통코드 목록 조회 — common_code 파라미터로 그룹 필터 가능 (결과 캐시, 새로고침 시 초기화) */
export const getCommonCodes = (commonCode?: string): Promise<CommonCode[]> => {
  const key = commonCode ?? '__all__';
  if (!_commonCodeCache.has(key)) {
    const params = commonCode ? { common_code: commonCode } : {};
    _commonCodeCache.set(key, api.get('/api/common-codes', { params }).then(r => r.data.map(toCommonCode)));
  }
  return _commonCodeCache.get(key)!;
};

/** 공통코드 캐시 무효화 — 등록/수정/삭제 후 호출해 다음 조회 시 재요청 */
export const invalidateCommonCodeCache = (commonCode?: string) => {
  if (commonCode) {
    _commonCodeCache.delete(commonCode);
    _commonCodeCache.delete('__all__');
  } else {
    _commonCodeCache.clear();
  }
};

/** 공통코드 등록 */
export const createCommonCode = async (payload: {
  common_code: string;
  common_code_name: string;
  detail_code: string;
  detail_code_name: string;
  sort_order?: number;
}): Promise<CommonCode> => {
  const { data } = await api.post('/api/common-codes', payload);
  return toCommonCode(data);
};

/** 공통코드 수정 */
export const updateCommonCode = async (id: number, payload: {
  common_code_name?: string;
  detail_code_name?: string;
  sort_order?: number;
}): Promise<CommonCode> => {
  const { data } = await api.patch(`/api/common-codes/${id}`, payload);
  return toCommonCode(data);
};

/** 공통코드 삭제 */
export const deleteCommonCode = async (id: number): Promise<void> => {
  await api.delete(`/api/common-codes/${id}`);
};

// ─── AI 재무 분석 리포트 ──────────────────────────────────────

export interface FinancialReport {
  id: number;
  reportMonth: string;   // YYYYMM
  content: string;       // 마크다운 텍스트
  createdAt: string | null;
  updatedAt: string | null;
}

/** AI 재무 분석 리포트 목록 조회 (최신순) */
export const getFinancialReports = async (): Promise<FinancialReport[]> => {
  const { data } = await api.get('/api/financial-reports');
  return data;
};

/** AI 재무 분석 즉시 생성 요청 (백그라운드, 202)
 *  includeCurrentMonth=true → 이번 달 포함 3개월 / false → 직전 3개월 (기본)
 */
export const generateFinancialReport = async (reportMonth?: string, includeCurrentMonth?: boolean): Promise<void> => {
  const params: Record<string, string | boolean> = {};
  if (reportMonth) params.report_month = reportMonth;
  if (includeCurrentMonth) params.include_current = true;
  await api.post('/api/financial-reports/generate', null, { params });
};

// ─── 시장 리포트 ──────────────────────────────────────────────

/** 시장 리포트 목록 조회 (최신순) — snake_case → camelCase 변환 */
export const getMarketReports = async (): Promise<MarketReport[]> => {
  const { data } = await api.get('/api/market-reports');
  return data.map((r: any) => {
    const raw = r.marketData || {};
    const fg = raw.fear_greed;
    // ticker 데이터만 추출 (fear_greed 등 특수 키 제외, 배열형 값도 제외)
    const EXCLUDED_KEYS = new Set(['fear_greed']);
    return {
      id: r.id,
      reportDate: r.reportDate,
      reportType: (r.reportType || 'global') as 'global' | 'kr_close',
      marketData: Object.fromEntries(
        Object.entries(raw)
          .filter(([k, v]) => !EXCLUDED_KEYS.has(k) && v !== null && typeof v === 'object' && !Array.isArray(v))
          .map(([k, v]: [string, any]) => [k, {
            label: v.label,
            close: v.close,
            prevClose: v.prev_close,
            change: v.change,
            changePct: v.change_pct,
            date: v.date,
          }])
      ),
      fearGreed: fg ? {
        score: fg.score,
        rating: fg.rating,
        previousClose: fg.previous_close,
        previous1Week: fg.previous_1_week,
        previous1Month: fg.previous_1_month,
      } : null,
      krSectors: (r.krSectors || []).map((s: any) => ({
        market: s.market,
        sector: s.sector,
        changePct: s.changePct,
      })),
      krTopGainers: (r.krTopGainers || []).map((g: any) => ({
        market: g.market,
        ticker: g.ticker,
        name: g.name,
        changePct: g.changePct,
        changePrice: g.changePrice,
        close: g.close,
        tradeVolume: g.tradeVolume,
        tradeAmount: g.tradeAmount,
      })),
      krInvestorFlow: (r.krInvestorFlow || []).map((d: any) => ({
        date: d.date,
        investors: d.investors,
      })),
      content: r.content,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });
};

/** 국내 장 마감 리포트 즉시 생성 요청 (백그라운드, 202) */
export const generateKrCloseReport = async (reportDate?: string): Promise<void> => {
  const params = reportDate ? { report_date: reportDate } : {};
  await api.post('/api/market-reports/generate/kr-close', null, { params });
};

/** 시장 리포트 즉시 생성 요청 (백그라운드, 202) */
export const generateMarketReport = async (reportDate?: string): Promise<void> => {
  const params = reportDate ? { report_date: reportDate } : {};
  await api.post('/api/market-reports/generate', null, { params });
};

/** 시장 리포트 삭제 (204) */
export const deleteMarketReport = async (reportId: number): Promise<void> => {
  await api.delete(`/api/market-reports/${reportId}`);
};

// ── AI 부동산 투자 분석 ─────────────────────────────────────────────────────
export interface ComplexAnalysis {
  id: number;
  complexIds: number[];
  complexNames: string[];
  content: string;
  createdAt: string | null;
}

export const getComplexAnalyses = async (): Promise<ComplexAnalysis[]> => {
  const res = await api.get<ComplexAnalysis[]>('/api/ai/real-estate/analyses');
  return res.data;
};

export const analyzeRealEstate = async (complexIds: number[], images?: File[]): Promise<ComplexAnalysis> => {
  // 이미지 첨부 시 multipart/form-data, 없으면 JSON
  const form = new FormData();
  form.append('complex_ids', JSON.stringify(complexIds));
  (images ?? []).forEach(f => form.append('images', f));
  const res = await api.post<ComplexAnalysis>('/api/ai/real-estate/analyze', form, {
    timeout: 120_000,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

// ─── 일정 관리 ─────────────────────────────────────────────────────────────

const toSchedule = (item: any): Schedule => ({
  id:          item.id,
  userId:      item.user_id,
  title:       item.title,
  description: item.description ?? null,
  eventDate:   item.event_date,
  endDate:     item.end_date ?? null,
  eventTime:   item.event_time ?? null,
  category:    item.category ?? null,
  repeatType:  item.repeat_type ?? null,
  naverUid:    item.naver_uid ?? null,
  createdAt:   item.created_at ?? null,
});

export const getSchedules = async (yearMonth: string): Promise<Schedule[]> => {
  const { data } = await api.get('/api/schedules', { params: { year_month: yearMonth } });
  return data.map(toSchedule);
};

export const createSchedule = async (payload: {
  userId: string; title: string; description?: string;
  eventDate: string; endDate?: string; eventTime?: string;
  category?: string; repeatType?: string; pushToNaver?: boolean;
}): Promise<Schedule> => {
  const { data } = await api.post('/api/schedules', {
    user_id:       payload.userId,
    title:         payload.title,
    description:   payload.description,
    event_date:    payload.eventDate,
    end_date:      payload.endDate || undefined,
    event_time:    payload.eventTime,
    category:      payload.category,
    repeat_type:   payload.repeatType || undefined,
    push_to_naver: payload.pushToNaver ?? true,
  });
  return toSchedule(data);
};

export const updateSchedule = async (id: number, payload: {
  title?: string; description?: string;
  eventDate?: string; endDate?: string; eventTime?: string;
  category?: string; repeatType?: string; pushToNaver?: boolean;
}): Promise<Schedule> => {
  const body: any = { push_to_naver: payload.pushToNaver ?? true };
  if (payload.title       !== undefined) body.title       = payload.title;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.eventDate   !== undefined) body.event_date  = payload.eventDate;
  if (payload.endDate     !== undefined) body.end_date    = payload.endDate || null;
  if (payload.eventTime   !== undefined) body.event_time  = payload.eventTime;
  if (payload.category    !== undefined) body.category    = payload.category;
  if (payload.repeatType  !== undefined) body.repeat_type = payload.repeatType || null;
  const { data } = await api.patch(`/api/schedules/${id}`, body);
  return toSchedule(data);
};

export const deleteSchedule = async (id: number): Promise<void> => {
  await api.delete(`/api/schedules/${id}`);
};

// ─── 네이버 캘린더 연동 ──────────────────────────────────────────────────────

export interface NaverCalendarStatus {
  ldy:   { connected: boolean; valid: boolean; expiresAt: string | null; calendarId: string | null };
  juhae: { connected: boolean; valid: boolean; expiresAt: string | null; calendarId: string | null };
}


export const getNaverCalendarStatus = async (): Promise<NaverCalendarStatus> => {
  const { data } = await api.get('/api/naver-calendar/status');
  return data;
};

/** OAuth 시작 URL — 해당 경로로 이동하면 네이버 인증 화면으로 리다이렉트 */
export const getNaverCalendarAuthUrl = (userId: string): string => {
  const base = process.env.REACT_APP_API_URL || 'http://localhost:8080';
  return `${base}/api/naver-calendar/auth/${userId}`;
};

export const disconnectNaverCalendar = async (userId: string): Promise<void> => {
  await api.delete(`/api/naver-calendar/disconnect/${userId}`);
};

export interface NaverCalendarItem {
  calendarId:   string;
  calendarName: string;
}

export const getNaverCalendars = async (userId: string): Promise<NaverCalendarItem[]> => {
  const { data } = await api.get(`/api/naver-calendar/calendars/${userId}`);
  return data.calendars ?? [];
};

export const selectNaverCalendar = async (userId: string, calendarId: string): Promise<void> => {
  await api.patch(`/api/naver-calendar/calendars/${userId}`, { calendarId });
};

// ── D-Day ────────────────────────────────────────────────────────────────────
const toDday = (d: any): Dday => ({
  id: d.id,
  userId: d.userId,
  title: d.title,
  targetDate: d.targetDate,
  createdAt: d.createdAt,
});

export const getDdays = async (): Promise<Dday[]> => {
  const { data } = await api.get('/api/ddays');
  return data.map(toDday);
};

export const createDday = async (payload: { userId: string; title: string; targetDate: string }): Promise<Dday> => {
  const { data } = await api.post('/api/ddays', {
    user_id: payload.userId, title: payload.title, target_date: payload.targetDate,
  });
  return toDday(data);
};

export const updateDday = async (id: number, payload: { title?: string; targetDate?: string }): Promise<Dday> => {
  const body: any = {};
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.targetDate !== undefined) body.target_date = payload.targetDate;
  const { data } = await api.patch(`/api/ddays/${id}`, body);
  return toDday(data);
};

export const deleteDday = async (id: number): Promise<void> => {
  await api.delete(`/api/ddays/${id}`);
};

// ── 투자 메모 ────────────────────────────────────────────────────────────────

const toMemoImage = (i: any): InvestmentMemoImage => ({
  id: i.id, memoId: i.memoId, imageUrl: i.imageUrl,
  imageFileName: i.imageFileName, displayOrder: i.displayOrder,
});

const toMemo = (m: any): InvestmentMemo => ({
  id: m.id, title: m.title, content: m.content ?? null,
  images: (m.images ?? []).map(toMemoImage),
  createdAt: m.createdAt ?? null,
  updatedAt: m.updatedAt ?? null,
});

export const getInvestmentMemos = async (q?: string): Promise<InvestmentMemo[]> => {
  const params = q ? { q } : {};
  const { data } = await api.get('/api/investment-memos', { params });
  return data.map(toMemo);
};

export const createInvestmentMemo = async (payload: { title: string; content?: string }): Promise<InvestmentMemo> => {
  const { data } = await api.post('/api/investment-memos', { title: payload.title, content: payload.content ?? null });
  return toMemo(data);
};

export const updateInvestmentMemo = async (id: number, payload: { title?: string; content?: string | null }): Promise<InvestmentMemo> => {
  const { data } = await api.patch(`/api/investment-memos/${id}`, payload);
  return toMemo(data);
};

export const deleteInvestmentMemo = async (id: number): Promise<void> => {
  await api.delete(`/api/investment-memos/${id}`);
};

export const uploadInvestmentMemoImage = async (memoId: number, file: File): Promise<InvestmentMemoImage> => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post(`/api/investment-memos/${memoId}/images`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60_000,
  });
  return toMemoImage(data);
};

export const deleteInvestmentMemoImage = async (memoId: number, imageId: number): Promise<void> => {
  await api.delete(`/api/investment-memos/${memoId}/images/${imageId}`);
};

// ── 운동 기록 ────────────────────────────────────────────────────────────────

export const getWorkouts = async (userId: string, workoutDate: string): Promise<WorkoutLog[]> => {
  const { data } = await api.get('/api/workouts', { params: { user_id: userId, workout_date: workoutDate } });
  return data as WorkoutLog[];
};

// { userId: { date: workoutTypes[] } } 구조
export const getWorkoutCalendar = async (yearMonth: string): Promise<Record<string, Record<string, string[]>>> => {
  const { data } = await api.get('/api/workouts/calendar', { params: { year_month: yearMonth } });
  return data;
};

export const createWorkout = async (payload: Omit<WorkoutLog, 'id' | 'createdAt'>): Promise<WorkoutLog> => {
  const { data } = await api.post('/api/workouts', payload);
  return data as WorkoutLog;
};

export const deleteWorkout = async (id: number): Promise<void> => {
  await api.delete(`/api/workouts/${id}`);
};

export interface NearbyPlace {
  name: string;
  address: string;
  distanceM: number;
  lat: number;
  lng: number;
  categoryName: string;
}

// 카카오 로컬 API — 반경 내 인프라 자동탐지 (MART | HOSPITAL | DEPARTMENT_STORE)
// region 지정 시 MART/DEPARTMENT_STORE는 지역구+브랜드 키워드 정확도순 검색
export const searchNearby = async (
  lat: number,
  lng: number,
  type: 'MART' | 'HOSPITAL' | 'DEPARTMENT_STORE',
  radius = 2000,
  region?: string,
): Promise<NearbyPlace[]> => {
  const { data } = await api.get<NearbyPlace[]>('/api/search/nearby', {
    params: { lat, lng, type, radius, ...(region ? { region } : {}) },
  });
  return data;
};

// 카카오 대중교통 경로 탐색 결과 단건
export interface TransitRoute {
  minutes: number;
  transfers: number;
  type: 'SUBWAY' | 'BUS' | 'BUS_AND_SUBWAY';
  lineNames: string[];  // ["2호선", "9호선"] 등
  fare: number;
}

export const getTransitRoutes = async (
  startLat: number, startLng: number,
  endLat: number, endLng: number,
): Promise<TransitRoute[]> => {
  const { data } = await api.get<{ routes: TransitRoute[] }>('/api/directions/transit', {
    params: { start_lat: startLat, start_lng: startLng, end_lat: endLat, end_lng: endLng },
  });
  return data.routes;
};

// ── 하루 스케줄 ────────────────────────────────────────────────────────────────
/** 해당 월에 하루 스케줄이 존재하는 날짜 목록 (YYYY-MM-DD 배열) — 달력 🗓️ 표시용 */
export const getDayScheduleDates = async (yearMonth: string): Promise<string[]> => {
  const { data } = await api.get<{ dates: string[] }>('/api/day-schedules/dates', {
    params: { year_month: yearMonth },
  });
  return data.dates;
};

export const getDaySchedule = async (scheduleDate: string, userId: string): Promise<DayScheduleBlock[]> => {
  const { data } = await api.get<{ blocks: DayScheduleBlock[] }>('/api/day-schedules', {
    params: { schedule_date: scheduleDate, user_id: userId },
  });
  return data.blocks;
};

export const upsertDaySchedule = async (
  scheduleDate: string,
  userId: string,
  blocks: DayScheduleBlock[],
): Promise<void> => {
  await api.put('/api/day-schedules', { user_id: userId, schedule_date: scheduleDate, blocks });
};

// ─── DART 재무 스크리닝 ────────────────────────────────────────────────────

/** 백엔드 응답(snake_case)을 ScreeningTopPick(camelCase)으로 변환 */
const _parseTopPicks = (raw: string | null): ScreeningTopPick[] => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return arr.map((item: Record<string, unknown>) => {
      // quarterly 파싱 (Python에서 camelCase로 저장됨)
      const qRaw = item.quarterly as Record<string, Record<string, unknown>> | null | undefined;
      const quarterly = qRaw ? {
        q1: qRaw.q1 ? {
          revenue: qRaw.q1.revenue != null ? Number(qRaw.q1.revenue) : null,
          revenuePrev: qRaw.q1.revenuePrev != null ? Number(qRaw.q1.revenuePrev) : null,
          opIncome: qRaw.q1.opIncome != null ? Number(qRaw.q1.opIncome) : null,
          opIncomePrev: qRaw.q1.opIncomePrev != null ? Number(qRaw.q1.opIncomePrev) : null,
          netIncome: qRaw.q1.netIncome != null ? Number(qRaw.q1.netIncome) : null,
          netIncomePrev: qRaw.q1.netIncomePrev != null ? Number(qRaw.q1.netIncomePrev) : null,
        } : undefined,
        h1: qRaw.h1 ? {
          revenue: qRaw.h1.revenue != null ? Number(qRaw.h1.revenue) : null,
          revenuePrev: qRaw.h1.revenuePrev != null ? Number(qRaw.h1.revenuePrev) : null,
          opIncome: qRaw.h1.opIncome != null ? Number(qRaw.h1.opIncome) : null,
          opIncomePrev: qRaw.h1.opIncomePrev != null ? Number(qRaw.h1.opIncomePrev) : null,
          netIncome: qRaw.h1.netIncome != null ? Number(qRaw.h1.netIncome) : null,
          netIncomePrev: qRaw.h1.netIncomePrev != null ? Number(qRaw.h1.netIncomePrev) : null,
        } : undefined,
      } : null;

      return {
        stockCode: String(item.stock_code ?? item.stockCode ?? ''),
        corpCode: String(item.corp_code ?? item.corpCode ?? ''),
        corpName: String(item.corp_name ?? item.corpName ?? ''),
        market: (item.market as 'KOSPI' | 'KOSDAQ') ?? 'KOSPI',
        roe: item.roe != null ? Number(item.roe) : null,
        opMargin: item.op_margin != null ? Number(item.op_margin) : null,
        debtRatio: item.debt_ratio != null ? Number(item.debt_ratio) : null,
        revenueGrowth: item.revenue_growth != null ? Number(item.revenue_growth) : null,
        pbr: item.pbr != null ? Number(item.pbr) : null,
        per: item.per != null ? Number(item.per) : null,
        cashRatio: item.cash_ratio != null ? Number(item.cash_ratio) : null,
        marketCap: item.market_cap != null ? Number(item.market_cap) : null,
        currentPrice: item.current_price != null ? Number(item.current_price) : null,
        score: Number(item.score ?? 0),
        quarterly,
      };
    });
  } catch {
    return [];
  }
};

/** 백엔드 응답을 ScreeningReport(camelCase)로 변환 */
const _toScreeningReport = (item: Record<string, unknown>): ScreeningReport => ({
  id: Number(item.id),
  reportDate: String(item.reportDate ?? ''),
  marketType: (item.marketType as 'ALL' | 'KOSPI' | 'KOSDAQ') ?? 'ALL',
  bsnYear: item.bsnYear != null ? String(item.bsnYear) : null,
  universeCount: item.universeCount != null ? Number(item.universeCount) : null,
  screenedCount: item.screenedCount != null ? Number(item.screenedCount) : null,
  topPicks: _parseTopPicks(item.topPicks as string | null),
  content: item.content != null ? String(item.content) : null,
  createdAt: String(item.createdAt ?? ''),
  updatedAt: String(item.updatedAt ?? ''),
});

/** DART 스크리닝 리포트 목록 조회 (최신순) */
export const getScreeningReports = async (): Promise<ScreeningReport[]> => {
  const { data } = await api.get<Record<string, unknown>[]>('/api/screening/reports');
  return data.map(_toScreeningReport);
};

/** 최신 DART 스크리닝 리포트 1건 조회 */
export const getLatestScreeningReport = async (): Promise<ScreeningReport | null> => {
  try {
    const { data } = await api.get<Record<string, unknown>>('/api/screening/reports/latest');
    return _toScreeningReport(data);
  } catch {
    return null;
  }
};

/** DART 스크리닝 리포트 즉시 생성 요청 (202 Accepted) */
export const generateScreeningReport = async (reportDate?: string, marketType?: string): Promise<void> => {
  await api.post('/api/screening/reports/generate', null, {
    params: {
      ...(reportDate ? { report_date: reportDate } : {}),
      ...(marketType ? { market_type: marketType } : {}),
    },
  });
};

// ── 통합 투자 의견 리포트 ─────────────────────────────────────────────────────
const _toIntegratedReport = (item: Record<string, unknown>): IntegratedReport => ({
  id: item.id as number,
  reportDate: item.reportDate as string,
  marketReportId: (item.marketReportId as number) ?? null,
  screeningReportId: (item.screeningReportId as number) ?? null,
  content: (item.content as string) ?? null,
  createdAt: item.createdAt as string,
  updatedAt: item.updatedAt as string,
});

export const getIntegratedReports = async (): Promise<IntegratedReport[]> => {
  const { data } = await api.get<Record<string, unknown>[]>('/api/integrated-reports');
  return data.map(_toIntegratedReport);
};

export const generateIntegratedReport = async (reportDate?: string): Promise<void> => {
  await api.post('/api/integrated-reports/generate', null, {
    params: reportDate ? { report_date: reportDate } : {},
  });
};

// ─── 전국 학교 DB ────────────────────────────────────────────────

export interface NearbySchool {
  id: string;
  schoolName: string;
  schoolType: string;      // '초등학교' | '중학교'
  address: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  studentsPerClass: number | null;
  achievementScore: number | null;
  totalStudents: number | null;
}

export const getNearbySchools = async (
  lat: number,
  lng: number,
  radiusKm: number = 2.0,
): Promise<NearbySchool[]> => {
  const { data } = await api.get('/api/schools/nearby', {
    params: { lat, lng, radius_km: radiusKm },
  });
  return data as NearbySchool[];
};

export default api;
