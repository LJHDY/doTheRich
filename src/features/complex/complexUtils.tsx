/**
 * complexUtils.tsx
 * ComplexInfoPanel과 CompareCard에서 공통으로 사용하는 유틸 함수·상수·컴포넌트 모음.
 * 두 파일에 중복 정의되어 있던 로직을 단일 파일로 관리해
 * 등급 계산 기준이나 레이블이 바뀔 때 한 곳만 수정하면 되도록 한다.
 */

import React from 'react';
import { SchoolInfo, InfraInfo } from '../../types';

// ─── HTML 유틸 ───────────────────────────────────────────────────────────────

/**
 * HTML 태그 제거.
 * 네이버 장소 검색 결과의 title 필드에 <b> 태그가 포함되어 있어
 * 그대로 렌더링하면 태그 문자열이 노출되므로 제거한다.
 */
export const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '');

// ─── 거리 계산 ───────────────────────────────────────────────────────────────

/**
 * Haversine 공식으로 두 좌표 사이의 직선 거리(km)를 계산.
 * 도보 API 호출이 실패했을 때 fallback 도보시간 추정에 사용한다.
 */
export const haversineKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── 인프라 유형 목록 ─────────────────────────────────────────────────────────

/**
 * 인프라 유형 셀렉트박스 옵션 생성에 사용.
 * 백엔드 InfraType enum 값과 1:1 매핑되어야 한다.
 */
export const INFRA_TYPES_LIST = [
  { key: 'DEPARTMENT_STORE', label: '백화점' },
  { key: 'MART', label: '마트' },
  { key: 'HOSPITAL', label: '병원' },
  { key: 'ETC', label: '기타' },
];

// ─── 레이블 맵 ───────────────────────────────────────────────────────────────

/** 임장 유형 코드 → 한국어 레이블. NONE 포함. */
export const VISIT_TYPE_LABELS: Record<string, string> = {
  ATMOSPHERE: '분위기 임장',
  COMPLEX: '단지 임장',
  LISTING: '매물 임장',
  NONE: '임장X',
};

// ─── 등급 색상 ───────────────────────────────────────────────────────────────

/**
 * S/A/B/C 등급 → 배경 색상 매핑.
 * 직장밀도·학군·인프라·교통 등 모든 등급 배지에 공통 적용.
 * 베이비 블루 테마 색상 기준.
 */
export const GRADE_COLORS: Record<string, string> = {
  S: '#F08080',   // 연빨강 — 최상위
  A: '#FFD97D',   // 파스텔 노랑
  B: '#7DC8A0',   // 연초록
  C: '#89CFF0',   // 베이비 블루
};

// ─── 등급 계산 함수 ───────────────────────────────────────────────────────────

/**
 * 중학교 학업성취도 기준으로 학군 등급 계산.
 * 중학교가 없거나 점수 데이터가 없으면 null 반환 (배지 미표시).
 * 여러 중학교 중 최고 점수 기준으로 등급 판정.
 */
export const calcSchoolGrade = (
  schoolInfos: SchoolInfo[],
): { grade: 'S' | 'A' | 'B' | 'C'; color: string } | null => {
  const scores = schoolInfos
    .filter(s => s.schoolType === 'MIDDLE' && s.achievementScore != null)
    .map(s => s.achievementScore!);
  if (scores.length === 0) return null;
  const best = Math.max(...scores);
  if (best >= 95) return { grade: 'S', color: '#F08080' };
  if (best >= 90) return { grade: 'A', color: '#FFD97D' };
  if (best >= 85) return { grade: 'B', color: '#7DC8A0' };
  return { grade: 'C', color: '#4BAAD4' };
};

/**
 * 주변 인프라 구성 기준으로 환경 등급 계산.
 * 인프라가 전혀 없어도 항상 등급을 반환한다 (C로 표시).
 * 백화점 2개 이상=S, 1개=A, 대형마트 1개 이상=B, 그 외=C.
 */
export const calcInfraGrade = (
  infraInfos: InfraInfo[],
): { grade: 'S' | 'A' | 'B' | 'C'; color: string } => {
  const deptCount = infraInfos.filter(
    i => i.infraType === 'DEPARTMENT_STORE',
  ).length;
  const martCount = infraInfos.filter(i => i.infraType === 'MART').length;
  if (deptCount >= 2) return { grade: 'S', color: '#F08080' };
  if (deptCount >= 1) return { grade: 'A', color: '#FFD97D' };
  if (martCount >= 1) return { grade: 'B', color: '#7DC8A0' };
  return { grade: 'C', color: '#4BAAD4' };
};

// ─── 공통 컴포넌트 ────────────────────────────────────────────────────────────

/**
 * 인라인 분류 배지 컴포넌트.
 * 학교 유형·인프라 유형·유해시설 카테고리 등 짧은 태그를 색상 배지로 표시한다.
 *
 * size prop으로 크기를 조절:
 * - 'md' (기본): ComplexInfoPanel 기준 (10px, padding 1px 6px)
 * - 'sm': CompareCard 기준 — 좁은 카드에 맞춰 더 작게 (9px, padding 1px 5px)
 */
export const Tag: React.FC<{
  label: string;
  color?: string;
  size?: 'sm' | 'md';
}> = ({ label, color = '#5f6368', size = 'md' }) => {
  const isSm = size === 'sm';
  return (
    <span
      style={{
        fontSize: isSm ? '9px' : '10px',
        fontWeight: 700,
        color: '#fff',
        backgroundColor: color,
        padding: isSm ? '1px 5px' : '1px 6px',
        borderRadius: isSm ? '7px' : '8px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
};
