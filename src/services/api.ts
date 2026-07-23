import axios from 'axios';
import {
  ApartmentComplex,
  ApartmentComplexRequest,
  PriceHistory,
  PriceHistoryRequest,
  SchoolInfo,
  InfraInfo,
  ComplexPhoto,
  LivingZone,
  LivingZonePhoto,
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

/** 즐겨찾기 토글 — PATCH /api/complexes/:id/favorite */
export const toggleFavorite = async (complexId: number, isFavorite: boolean): Promise<void> => {
  await api.patch(`/api/complexes/${complexId}/favorite`, { isFavorite });
};

/** 임장 유형 수정 — PATCH /api/complexes/:id/visit-type */
export const updateVisitType = async (complexId: number, visitType: string): Promise<void> => {
  await api.patch(`/api/complexes/${complexId}/visit-type`, { visitType });
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

/** 참고가 수정 — PATCH /api/complexes/:id/price-history-items/:itemId */
export const updatePriceHistoryItem = async (
  complexId: number,
  itemId: number,
  data: {
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

/** 생활권 등록 — POST /api/living-zones */
export const createLivingZone = async (body: { district: string; name: string; memo?: string }): Promise<LivingZone> => {
  const { data } = await api.post<LivingZone>('/api/living-zones', body);
  return data;
};

/** 생활권 메모 수정 — PATCH /api/living-zones/:id/memo */
export const updateLivingZoneMemo = async (id: number, memo: string): Promise<void> => {
  await api.patch(`/api/living-zones/${id}/memo`, { memo });
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

export default api;
