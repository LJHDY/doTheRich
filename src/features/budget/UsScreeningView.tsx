// ─── SEC EDGAR XBRL 기반 미국 우량주 스크리닝 뷰 ──────────────────────────────
// ScreeningReportView(한국 DART)와 동일한 패턴으로 구현
// S&P500 + NASDAQ100 유니버스, ROE·영업이익률·부채비율·매출성장률·EPS성장률·PER·PBR 종합 스코어
import React, { useEffect, useState } from 'react';
import { getUsScreeningReports, generateUsScreeningReport } from '../../services/api';
import { UsScreeningReport, UsScreeningTopPick } from '../../types';

// ── Props ──────────────────────────────────────────────────────────────────────
interface UsScreeningViewProps {
  onCompanyClick?: (query: string) => void;
}

// ── 인라인 색상 헬퍼 ─────────────────────────────────────────────────────────
// goodHigh=true: 높을수록 초록 / goodHigh=false(부채비율 등): 낮을수록 초록
const _numColor = (v: number | null | undefined, goodHigh = true): string => {
  if (v == null) return '#888';
  if (goodHigh) {
    if (v >= 20) return '#2e7d32';
    if (v >= 10) return '#388e3c';
    if (v >= 0) return '#555';
    return '#c62828';
  }
  // goodHigh=false → 낮을수록 좋음 (부채비율)
  if (v <= 50) return '#2e7d32';
  if (v <= 100) return '#388e3c';
  if (v <= 200) return '#555';
  return '#c62828';
};

// 퍼센트 포맷 — null이면 '—', 양수면 '+'접두사
const _fmtPct = (v: number | null | undefined, showSign = false): string => {
  if (v == null) return '—';
  const sign = showSign && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
};

// 시총 포맷 — USD 기준 Billion 단위 표시
// 예: 3_000_000_000 → "$3.0B", 300_000_000_000 → "$300B"
const _fmtMcUsd = (v: number | null | undefined): string => {
  if (v == null) return '—';
  const b = v / 1_000_000_000;
  if (b >= 10) return `$${Math.round(b)}B`;
  return `$${b.toFixed(1)}B`;
};

// 날짜 포맷 — "2025-08-24" → "2025년 8월 24일"
const _fmtDate = (d: string): string => {
  const dt = new Date(d);
  return dt.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
};

// ── 마크다운 렌더러 (ScreeningReportView와 동일 패턴) ─────────────────────────

/** 인라인 bold (**text**) 파싱 */
const _renderInline = (text: string): React.ReactNode =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={j}>{p.slice(2, -2)}</strong>
      : <span key={j}>{p}</span>
  );

const _renderContent = (text: string): React.ReactNode[] => {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 마크다운 테이블 블록 — '|'로 시작하는 연속 행 묶음
    if (line.trimStart().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // 구분자 행(|:---|) 제거
      const nonSep = tableLines.filter(l => !/^\s*\|[\s:|-]+\|\s*$/.test(l));
      if (nonSep.length === 0) continue;

      const parseCells = (l: string) =>
        l.split('|').slice(1, -1).map(c => c.trim().replace(/<br\s*\/?>/gi, ' '));

      const [headerRow, ...dataRows] = nonSep;
      const headers = parseCells(headerRow);

      result.push(
        <div key={`tbl-${i}`} style={{ overflowX: 'auto', margin: '10px 0 14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#e8f4fd' }}>
                {headers.map((h, hi) => (
                  <th key={hi} style={{
                    padding: '7px 10px', textAlign: 'left', fontWeight: 700,
                    color: '#1a3a5c', borderBottom: '2px solid #89CFF0',
                    whiteSpace: 'nowrap',
                  }}>
                    {_renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f7fbff' }}>
                  {parseCells(row).map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '6px 10px', color: '#344054',
                      borderBottom: '1px solid #e8ecf0',
                      verticalAlign: 'top',
                    }}>
                      {_renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (line.startsWith('## ')) {
      result.push(
        <h2 key={i} style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c', margin: '18px 0 8px', borderBottom: '2px solid #e0f0ff', paddingBottom: '4px' }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      result.push(
        <h3 key={i} style={{ fontSize: '13px', fontWeight: 700, color: '#344054', margin: '12px 0 5px' }}>
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
          <span style={{ color: '#89CFF0', flexShrink: 0 }}>•</span>
          <span>{_renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === '') {
      result.push(<div key={i} style={{ height: '6px' }} />);
    } else {
      result.push(
        <p key={i} style={{ fontSize: '13px', color: '#444', margin: '3px 0', lineHeight: '1.6' }}>
          {_renderInline(line)}
        </p>
      );
    }
    i++;
  }
  return result;
};

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────
const UsScreeningView: React.FC<UsScreeningViewProps> = ({ onCompanyClick }) => {
  // 리포트 목록·선택 상태
  const [reports, setReports] = useState<UsScreeningReport[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState('');

  // 상위 40개 테이블 — 기본 TOP 30만 표시, 전체 펼치기 토글
  const [showAll, setShowAll] = useState(false);

  // 주 테이블 정렬 상태 — null이면 종합 스코어 기준(기본)
  const [usSortKey, setUsSortKey] = useState<keyof UsScreeningTopPick | null>(null);
  const [usSortDir, setUsSortDir] = useState<'asc' | 'desc'>('desc');

  // TOP 30 기본 표시 개수
  const DEFAULT_TOP = 30;

  /** 리포트 목록 로드 */
  const load = async () => {
    setLoading(true);
    try {
      const data = await getUsScreeningReports();
      setReports(data);
      // 최신 리포트 자동 선택
      if (data.length > 0) setSelectedId(data[0].id);
    } catch {
      // 오류 무시 (빈 목록 유지)
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 즉시 생성 → 5초 폴링으로 완료 감지 */
  const handleGenerate = async () => {
    setGenerating(true);
    setToast('미국 스크리닝 요청 중…');
    try {
      await generateUsScreeningReport();
      setToast('SEC EDGAR 데이터 수집 중입니다. 완료 시 자동 업데이트됩니다. (최대 10분)');
      const prevTopId = reports.length > 0 ? reports[0].id : null;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        try {
          const data = await getUsScreeningReports();
          const isNew = data.length > 0 && data[0].id !== prevTopId;
          if (isNew || tries >= 120) {
            clearInterval(poll);
            setReports(data);
            if (data.length > 0) setSelectedId(data[0].id);
            setGenerating(false);
            setToast(isNew ? '✅ 미국 스크리닝 완료!' : '⚠️ 시간이 초과되었습니다. 잠시 후 새로고침해주세요.');
            setTimeout(() => setToast(''), 5000);
          }
        } catch { /* 폴링 오류 무시 */ }
      }, 5000);
    } catch {
      setGenerating(false);
      setToast('❌ 요청에 실패했습니다.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  /** 컬럼 헤더 클릭 시 정렬 토글 */
  const handleSort = (key: keyof UsScreeningTopPick) => {
    if (usSortKey === key) {
      setUsSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setUsSortKey(key);
      // 부채비율은 낮을수록 좋으므로 첫 클릭 시 오름차순
      setUsSortDir(key === 'debtRatio' ? 'asc' : 'desc');
    }
  };

  // 현재 선택된 리포트
  const selected = reports.find(r => r.id === selectedId) ?? reports[0] ?? null;

  // 정렬 + TOP 30/40 슬라이싱
  const sortedPicks: UsScreeningTopPick[] = selected
    ? (usSortKey
        ? [...selected.topPicks].sort((a, b) => {
            const av = a[usSortKey] as number | null | undefined;
            const bv = b[usSortKey] as number | null | undefined;
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            return usSortDir === 'asc' ? av - bv : bv - av;
          })
        : selected.topPicks)
    : [];

  const visiblePicks: UsScreeningTopPick[] = showAll
    ? sortedPicks
    : sortedPicks.slice(0, DEFAULT_TOP);

  // ── 테이블 헤더 공통 스타일 ──────────────────────────────────────────────
  const thBase: React.CSSProperties = {
    padding: '11px 14px', fontSize: '12px', fontWeight: 600,
    color: '#8a9bb0', background: '#fafbfd',
    borderBottom: '2px solid #eaeef2', whiteSpace: 'nowrap', textAlign: 'center',
    letterSpacing: '0.2px',
  };
  // 정렬 가능 컬럼 — 선택 시 파란색 강조
  const thSort = (key: keyof UsScreeningTopPick): React.CSSProperties => ({
    ...thBase,
    cursor: 'pointer', userSelect: 'none',
    color: usSortKey === key ? '#1565c0' : '#8a9bb0',
  });
  // 정렬 아이콘 — 선택된 컬럼은 방향 화살표, 나머지는 회색 ⇅
  const sortIcon = (key: keyof UsScreeningTopPick) =>
    usSortKey === key
      ? <span style={{ fontSize: '9px', marginLeft: '2px' }}>{usSortDir === 'asc' ? '▲' : '▼'}</span>
      : <span style={{ fontSize: '9px', marginLeft: '2px', color: '#c0c8d0' }}>⇅</span>;

  // 툴팁이 있는 헤더 레이블
  const ThWithTip = ({ label, tip }: { label: string; tip: string }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {label}
      <span
        title={tip}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '13px', height: '13px', borderRadius: '50%',
          background: '#c8d6e5', color: '#fff', fontSize: '9px', fontWeight: 700,
          cursor: 'help', flexShrink: 0, lineHeight: 1,
        }}
      >?</span>
    </span>
  );

  const tdBase: React.CSSProperties = {
    padding: '13px 14px', fontSize: '13px',
    borderBottom: '1px solid #f0f2f5', textAlign: 'right',
    verticalAlign: 'middle',
  };

  // 순위 1~3위 색상 — 금/은/동
  const rankColors = ['#e67e22', '#8a9bb0', '#b87333'];

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* ── 상단 컨트롤 바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {/* 리포트 날짜 선택 */}
        <select
          value={selectedId ?? ''}
          onChange={e => setSelectedId(Number(e.target.value))}
          style={{ padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #dadce0', background: '#fff', minWidth: '200px' }}
        >
          {reports.length === 0 && <option value="">리포트 없음</option>}
          {reports.map(r => (
            <option key={r.id} value={r.id}>
              {_fmtDate(r.reportDate)}
            </option>
          ))}
        </select>

        {/* 즉시 생성 버튼 */}
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: '6px 14px', fontSize: '13px', borderRadius: '6px',
            border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
            background: generating ? '#b0bec5' : '#89CFF0', color: '#fff', fontWeight: 600,
          }}
        >
          {generating ? '⏳ 생성 중…' : '✨ 생성'}
        </button>

        {/* 새로고침 버튼 */}
        <button
          onClick={load}
          style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #dadce0', background: '#fff', cursor: 'pointer' }}
        >
          🔄
        </button>
      </div>

      {/* 토스트 메시지 */}
      {toast && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', color: '#2e7d32', marginBottom: '12px' }}>
          {toast}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#9aa0a6', fontSize: '14px', textAlign: 'center', padding: '40px' }}>
          로딩 중…
        </div>
      ) : !selected ? (
        /* 리포트 없을 때 안내 */
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9aa0a6' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🇺🇸</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#5f6368', marginBottom: '8px' }}>
            미국 스크리닝 리포트가 없습니다
          </div>
          <div style={{ fontSize: '13px' }}>
            "✨ 생성" 버튼으로 수동 생성할 수 있습니다.<br />
            SEC EDGAR XBRL API로 S&P500 + NASDAQ100 재무 데이터를 수집합니다.
          </div>
        </div>
      ) : (
        <div>
          {/* ── 메타 정보 카드 */}
          <div style={{
            background: 'linear-gradient(135deg, #e8f5fd 0%, #f0f8ff 100%)',
            borderRadius: '10px', padding: '14px 18px', marginBottom: '16px',
            border: '1px solid #c9e6f5',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', marginBottom: '8px' }}>
              🌏 미국 S&P500+NASDAQ100 우량주 스크리닝
            </div>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#5f6368' }}>분석일</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1565c0' }}>{_fmtDate(selected.reportDate)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#5f6368' }}>유니버스</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#344054' }}>{selected.universeCount?.toLocaleString() ?? '—'}개</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#5f6368' }}>1차 필터 통과</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#2e7d32' }}>{selected.screenedCount?.toLocaleString() ?? '—'}개</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#5f6368' }}>최종 분석</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#c8882a' }}>{selected.topPicks.length}개</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#8a9bb0' }}>
              데이터 출처: SEC EDGAR XBRL API (연간 10-K 재무제표)
            </div>
          </div>

          {/* ── 우량주 테이블 */}
          {selected.topPicks.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #eaeef2', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                {/* 카드 헤더 */}
                <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #eaeef2' }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#1a3a5c' }}>
                    🏆 우량주 TOP {showAll ? selected.topPicks.length : Math.min(DEFAULT_TOP, selected.topPicks.length)}
                  </div>
                  <div style={{ fontSize: '13px', color: '#8a9bb0', marginTop: '4px' }}>
                    SEC EDGAR 10-K 기반 ROE · 영업이익률 · 부채비율 · 매출성장률 · EPS성장률 종합 스코어
                    {!showAll && selected.topPicks.length > DEFAULT_TOP && (
                      <span> &nbsp;· 상위 {DEFAULT_TOP}개 표시 중</span>
                    )}
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '780px' }}>
                    <thead>
                      <tr>
                        {/* 순위 */}
                        <th style={{ ...thBase, textAlign: 'center' }}>#</th>
                        {/* 티커/회사명 */}
                        <th style={{ ...thBase, textAlign: 'left' }}>티커 / 회사명</th>
                        {/* 섹터 */}
                        <th style={thBase}>섹터</th>
                        {/* 시총 */}
                        <th onClick={() => handleSort('marketCap')} style={{ ...thSort('marketCap'), textAlign: 'right' }}>
                          시총{sortIcon('marketCap')}
                        </th>
                        {/* ROE */}
                        <th onClick={() => handleSort('roe')} style={{ ...thSort('roe'), textAlign: 'right' }}>
                          <ThWithTip label="ROE(%)" tip="자기자본이익률 — 자본 대비 순이익 효율. 높을수록 자본을 잘 굴리는 기업" />
                          {sortIcon('roe')}
                        </th>
                        {/* 영업이익률 */}
                        <th onClick={() => handleSort('opMargin')} style={{ ...thSort('opMargin'), textAlign: 'right' }}>
                          영업이익률(%){sortIcon('opMargin')}
                        </th>
                        {/* 매출성장률 */}
                        <th onClick={() => handleSort('revGrowth')} style={{ ...thSort('revGrowth'), textAlign: 'right' }}>
                          매출성장률(%){sortIcon('revGrowth')}
                        </th>
                        {/* 부채비율 */}
                        <th onClick={() => handleSort('debtRatio')} style={{ ...thSort('debtRatio'), textAlign: 'right' }}>
                          부채비율(%){sortIcon('debtRatio')}
                        </th>
                        {/* EPS 성장률 */}
                        <th onClick={() => handleSort('epsGrowth')} style={{ ...thSort('epsGrowth'), textAlign: 'right' }}>
                          <ThWithTip label="EPS성장률(%)" tip="주당순이익 성장률 — 순이익 성장의 질. 높을수록 수익성 개선" />
                          {sortIcon('epsGrowth')}
                        </th>
                        {/* PER */}
                        <th onClick={() => handleSort('per')} style={{ ...thSort('per'), textAlign: 'right' }}>
                          <ThWithTip label="PER" tip="주가수익비율 — 시가총액 ÷ 순이익. 업종 평균 대비 저평가 여부 판단" />
                          {sortIcon('per')}
                        </th>
                        {/* PBR */}
                        <th onClick={() => handleSort('pbr')} style={{ ...thSort('pbr'), textAlign: 'right' }}>
                          <ThWithTip label="PBR" tip="주가순자산비율 — 주가 ÷ 주당순자산. 낮을수록 장부가 대비 저평가" />
                          {sortIcon('pbr')}
                        </th>
                        {/* 스코어 */}
                        <th onClick={() => handleSort('score')} style={{ ...thSort('score'), textAlign: 'right' }}>
                          스코어{sortIcon('score')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePicks.map((pick, idx) => (
                        <tr
                          key={pick.ticker}
                          style={{ background: '#fff', transition: 'background 0.12s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f7fafd'}
                          onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fff'}
                        >
                          {/* 순위 */}
                          <td style={{ ...tdBase, textAlign: 'center', fontWeight: 800, fontSize: idx < 3 ? '15px' : '13px', color: idx < 3 ? rankColors[idx] : '#c0cad5' }}>
                            {idx + 1}
                          </td>

                          {/* 티커 / 회사명 — 클릭 시 기업 분석 탭으로 이동 */}
                          <td
                            style={{ ...tdBase, textAlign: 'left', cursor: onCompanyClick ? 'pointer' : 'default' }}
                            onClick={() => onCompanyClick?.(pick.ticker)}
                            title={onCompanyClick ? `${pick.name} 기업 분석 보기` : undefined}
                          >
                            {/* 티커 굵게 */}
                            <span style={{
                              fontWeight: 700, fontSize: '14px', color: '#1a3a5c',
                              borderBottom: onCompanyClick ? '1px dashed #89CFF0' : 'none',
                            }}>
                              {pick.ticker}
                            </span>
                            {/* 회사명 작은 글씨 */}
                            <div style={{ fontSize: '11px', color: '#b0bec5', fontWeight: 400, marginTop: '2px' }}>
                              {pick.name}
                            </div>
                          </td>

                          {/* 섹터 */}
                          <td style={{ ...tdBase, textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: '#f0f4ff', color: '#3d5a9e', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {pick.sector}
                            </span>
                          </td>

                          {/* 시총 */}
                          <td style={tdBase}>{_fmtMcUsd(pick.marketCap)}</td>

                          {/* ROE — 높을수록 초록 */}
                          <td style={{ ...tdBase, color: _numColor(pick.roe) }}>
                            {_fmtPct(pick.roe)}
                          </td>

                          {/* 영업이익률 — 높을수록 초록 */}
                          <td style={{ ...tdBase, color: _numColor(pick.opMargin) }}>
                            {_fmtPct(pick.opMargin)}
                          </td>

                          {/* 매출성장률 — 높을수록 초록, 음수 빨강 */}
                          <td style={{ ...tdBase, color: _numColor(pick.revGrowth) }}>
                            {_fmtPct(pick.revGrowth, true)}
                          </td>

                          {/* 부채비율 — 낮을수록 초록 */}
                          <td style={{ ...tdBase, color: _numColor(pick.debtRatio, false) }}>
                            {pick.debtRatio != null ? `${pick.debtRatio.toFixed(0)}%` : '—'}
                          </td>

                          {/* EPS 성장률 — 높을수록 초록, 없으면 — */}
                          <td style={{ ...tdBase, color: _numColor(pick.epsGrowth) }}>
                            {_fmtPct(pick.epsGrowth, true)}
                          </td>

                          {/* PER */}
                          <td style={tdBase}>
                            {pick.per != null ? pick.per.toFixed(1) : '—'}
                          </td>

                          {/* PBR */}
                          <td style={tdBase}>
                            {pick.pbr != null ? pick.pbr.toFixed(2) : '—'}
                          </td>

                          {/* 스코어 — 파란 배지 */}
                          <td style={{ ...tdBase }}>
                            <span style={{
                              display: 'inline-block', padding: '3px 8px',
                              borderRadius: '12px', fontWeight: 800, fontSize: '13px',
                              background: '#e8f4fd', color: '#1565c0',
                            }}>
                              {pick.score.toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 전체 펼치기/접기 버튼 — TOP 30 초과 시에만 표시 */}
              {selected.topPicks.length > DEFAULT_TOP && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  style={{
                    marginTop: '10px', padding: '8px 22px', fontSize: '13px',
                    borderRadius: '8px', border: '1px solid #eaeef2', background: '#fff',
                    cursor: 'pointer', color: '#5f6368', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  {showAll ? '▲ 접기' : `▼ 전체 ${selected.topPicks.length}개 보기`}
                </button>
              )}
            </div>
          )}

          {/* ── Gemini 분석 마크다운 */}
          {selected.content && (
            <div style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #e0e4e8', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', marginBottom: '12px' }}>
                🤖 Gemini 분석
              </div>
              {_renderContent(selected.content)}
            </div>
          )}

          {/* 하단 면책 안내 문구 */}
          <div style={{ padding: '10px 14px', background: '#fff8e1', borderRadius: '8px', border: '1px solid #ffe082', fontSize: '12px', color: '#795548' }}>
            ⚠️ 본 스크리닝은 SEC EDGAR 10-K 재무제표 기반 정량 분석입니다. 투자 판단의 참고 자료로만 활용하세요.<br />
            미국 기업은 회계 기준(US GAAP)이 다르며, 금융·바이오·유틸리티 등 일부 섹터는 부채비율 해석에 주의가 필요합니다.
          </div>
        </div>
      )}
    </div>
  );
};

export default UsScreeningView;
