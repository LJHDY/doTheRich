// ─── DART 우량주 스크리닝 리포트 뷰 ─────────────────────────────────────────
// AIReportView의 'screening' 서브탭에서 렌더링
// DART 사업보고서 기반 재무 스크리닝 — ROE/영업이익률/부채비율/매출성장률/PBR 종합 스코어 TOP40
import React, { useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { getScreeningReports, generateScreeningReport } from '../../services/api';
import { ScreeningReport, ScreeningTopPick } from '../../types';
// IntegratedReportView에서 공유 유틸·컴포넌트 임포트
import { _numColor, _fmtNum, _fmtMC, RankingTable } from './IntegratedReportView';

const ScreeningReportView: React.FC = () => {
  const isMobile = useIsMobile();
  // 시장 유형 탭 — 생성 시 어떤 market_type을 생성할지 결정하고, 목록도 해당 유형만 표시
  const [activeMarket, setActiveMarket] = useState<'ALL' | 'KOSPI' | 'KOSDAQ'>('ALL');
  // 리포트 목록·선택 상태
  const [reports, setReports] = useState<ScreeningReport[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState('');
  // 상위 40개 테이블 — 기본 TOP 30만 표시, 전체 펼치기 토글
  const [showAll, setShowAll] = useState(false);
  // 분기 실적 확장 표시 — Set<stockCode>
  const [expandedQuarterly, setExpandedQuarterly] = useState<Set<string>>(new Set());
  // 주 테이블 정렬 상태 — null이면 종합 스코어 기준(기본)
  const [mainSortKey, setMainSortKey] = useState<keyof ScreeningTopPick | null>(null);
  const [mainSortDir, setMainSortDir] = useState<'asc' | 'desc'>('desc');

  // 시장 유형별 필터된 리포트 목록
  const filteredReports = reports.filter(r => r.marketType === activeMarket);

  /** 리포트 목록 로드 */
  const load = async () => {
    setLoading(true);
    try {
      const data = await getScreeningReports();
      setReports(data);
      // 로드 후 현재 탭에 맞는 최신 리포트 자동 선택
      const filtered = data.filter(r => r.marketType === activeMarket);
      if (filtered.length > 0) setSelectedId(filtered[0].id);
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
    setToast(`${activeMarket} 스크리닝 요청 중…`);
    try {
      await generateScreeningReport(undefined, activeMarket);
      setToast('DART 데이터 수집 중입니다. 완료 시 자동 업데이트됩니다. (최대 10분)');
      const prevTopId = filteredReports.length > 0 ? filteredReports[0].id : null;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const data = await getScreeningReports();
        const newFiltered = data.filter(r => r.marketType === activeMarket);
        const isNew = newFiltered.length > 0 && newFiltered[0].id !== prevTopId;
        if (isNew || tries >= 120) {
          clearInterval(poll);
          setReports(data);
          if (newFiltered.length > 0) setSelectedId(newFiltered[0].id);
          setGenerating(false);
          setToast(isNew ? `✅ ${activeMarket} 스크리닝 완료!` : '⚠️ 시간이 초과되었습니다. 잠시 후 새로고침해주세요.');
          setTimeout(() => setToast(''), 5000);
        }
      }, 5000);
    } catch {
      setGenerating(false);
      setToast('❌ 요청에 실패했습니다.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  /** 시장 탭 전환 시 해당 탭 최신 리포트 자동 선택 */
  const handleMarketChange = (mkt: 'ALL' | 'KOSPI' | 'KOSDAQ') => {
    setActiveMarket(mkt);
    setShowAll(false);
    setExpandedQuarterly(new Set());
    setMainSortKey(null);  // 정렬 초기화 (종합 스코어 기준으로 복귀)
    setMainSortDir('desc');
    const filtered = reports.filter(r => r.marketType === mkt);
    if (filtered.length > 0) setSelectedId(filtered[0].id);
    else setSelectedId(null);
  };

  /** 마크다운 → JSX (기존 AIReportView 패턴과 동일) */
  // 인라인 bold 파싱 (**text**)
  const renderInlineS = (text: string) =>
    text.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={j}>{p.slice(2, -2)}</strong>
        : <span key={j}>{p}</span>
    );

  const renderContent = (text: string) => {
    const lines = text.split('\n');
    const result: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 마크다운 테이블 블록 감지 — 연속된 | 로 시작하는 행을 하나의 <table>로 묶음
      if (line.trimStart().startsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trimStart().startsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        // 구분자 행(|:---|) 제외, 헤더/데이터 행만 추출
        const nonSep = tableLines.filter(l => !/^\s*\|[\s:|-]+\|\s*$/.test(l));
        if (nonSep.length === 0) continue;

        // 셀 파싱: "| a | b | c |" → ["a","b","c"]
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
                      {renderInlineS(h)}
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
                        {renderInlineS(cell)}
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
        result.push(<h3 key={i} style={{ fontSize: '13px', fontWeight: 700, color: '#344054', margin: '12px 0 5px' }}>{line.slice(4)}</h3>);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        result.push(
          <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
            <span style={{ color: '#89CFF0', flexShrink: 0 }}>•</span>
            <span>{renderInlineS(line.slice(2))}</span>
          </div>
        );
      } else if (line.trim() === '') {
        result.push(<div key={i} style={{ height: '6px' }} />);
      } else {
        result.push(
          <p key={i} style={{ fontSize: '13px', color: '#444', margin: '3px 0', lineHeight: '1.6' }}>
            {renderInlineS(line)}
          </p>
        );
      }
      i++;
    }
    return result;
  };

  const selected = filteredReports.find(r => r.id === selectedId) ?? filteredReports[0] ?? null;

  // 날짜 포맷 — "2025-08-24" → "2025년 8월 24일"
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // 표시할 종목 목록 — 정렬 후 TOP 30/40 슬라이싱
  const DEFAULT_TOP = 30;

  const handleMainSort = (key: keyof ScreeningTopPick) => {
    if (mainSortKey === key) {
      setMainSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setMainSortKey(key);
      // 부채비율은 낮을수록 좋으므로 첫 클릭 시 오름차순
      setMainSortDir(key === 'debtRatio' ? 'asc' : 'desc');
    }
  };

  const sortedTopPicks: ScreeningTopPick[] = selected
    ? (mainSortKey
        ? [...selected.topPicks].sort((a, b) => {
            const av = a[mainSortKey] as number | null | undefined;
            const bv = b[mainSortKey] as number | null | undefined;
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            return mainSortDir === 'asc' ? av - bv : bv - av;
          })
        : selected.topPicks)
    : [];

  const visiblePicks: ScreeningTopPick[] = showAll
    ? sortedTopPicks
    : sortedTopPicks.slice(0, DEFAULT_TOP);

  // 분기 실적 토글 헬퍼
  const toggleQuarterly = (code: string) => {
    setExpandedQuarterly(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // 분기 금액을 억 단위로 포맷 (조 단위까지)
  const _fmtTrillion = (v: number | null | undefined): string => {
    if (v == null) return '—';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}조`;
    if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(0)}억`;
    if (abs >= 10_000_000) return `${sign}${(abs / 100_000_000).toFixed(2)}억`;
    return `${sign}${(abs / 100_000_000).toFixed(2)}억`;
  };

  // YoY 성장률 계산
  const _yoy = (cur: number | null | undefined, prev: number | null | undefined): string => {
    if (cur == null || prev == null || prev === 0) return '—';
    const pct = ((cur - prev) / Math.abs(prev)) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  };

  // 테이블 헤더 공통 스타일 (정렬 가능 컬럼)
  const thStyle: React.CSSProperties = {
    padding: '11px 14px', fontSize: '12px', fontWeight: 600,
    color: '#8a9bb0', background: '#fafbfd',
    borderBottom: '2px solid #eaeef2', whiteSpace: 'nowrap', textAlign: 'center',
    letterSpacing: '0.2px',
  };
  const thSortStyle = (key: keyof ScreeningTopPick): React.CSSProperties => ({
    ...thStyle,
    cursor: 'pointer', userSelect: 'none',
    color: mainSortKey === key ? '#1565c0' : '#8a9bb0',
  });
  // 정렬 아이콘 — 선택된 컬럼은 현재 방향 화살표, 나머지는 회색 ⇅
  const mainSortIcon = (key: keyof ScreeningTopPick) =>
    mainSortKey === key
      ? <span style={{ fontSize: '9px', marginLeft: '2px' }}>{mainSortDir === 'asc' ? '▲' : '▼'}</span>
      : <span style={{ fontSize: '9px', marginLeft: '2px', color: '#c0c8d0' }}>⇅</span>;
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
  const tdStyle: React.CSSProperties = {
    padding: '13px 14px', fontSize: '13px',
    borderBottom: '1px solid #f0f2f5', textAlign: 'right',
    verticalAlign: 'middle',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* ── 시장 유형 탭 */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', borderBottom: '2px solid #e0e4e8', paddingBottom: '8px' }}>
        {(['ALL', 'KOSPI', 'KOSDAQ'] as const).map(mkt => (
          <button
            key={mkt}
            onClick={() => handleMarketChange(mkt)}
            style={{
              padding: '5px 14px', fontSize: '12px', borderRadius: '6px',
              border: activeMarket === mkt ? '2px solid #89CFF0' : '1px solid #dadce0',
              background: activeMarket === mkt ? '#e8f4fd' : '#fff',
              color: activeMarket === mkt ? '#1565c0' : '#5f6368',
              fontWeight: activeMarket === mkt ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <div>
                {mkt === 'ALL' ? '전체' : mkt}
                <span style={{ fontSize: '10px', marginLeft: '4px', color: '#9aa0a6' }}>
                  ({reports.filter(r => r.marketType === mkt).length})
                </span>
              </div>
              <div style={{ fontSize: '10px', color: activeMarket === mkt ? '#4a90d9' : '#b0bec5', fontWeight: 400 }}>매주 일요일 오전 7시</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── 상단 컨트롤 바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {/* 리포트 날짜 선택 */}
        <select
          value={selectedId ?? ''}
          onChange={e => setSelectedId(Number(e.target.value))}
          style={{ padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #dadce0', background: '#fff', minWidth: '200px' }}
        >
          {filteredReports.length === 0 && <option value="">리포트 없음</option>}
          {filteredReports.map(r => (
            <option key={r.id} value={r.id}>
              {fmtDate(r.reportDate)} ({r.bsnYear ?? '?'}년 기준)
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
          {generating ? '⏳ 생성 중…' : `✨ ${activeMarket} 생성`}
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
        <div style={{ color: '#9aa0a6', fontSize: '14px', textAlign: 'center', padding: '40px' }}>로딩 중…</div>
      ) : !selected ? (
        /* 리포트 없을 때 안내 */
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9aa0a6' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#5f6368', marginBottom: '8px' }}>스크리닝 리포트가 없습니다</div>
          <div style={{ fontSize: '13px' }}>매주 토요일 오전 7시(KST)에 자동 생성되거나,<br />"즉시 생성" 버튼으로 수동 생성할 수 있습니다.</div>
          <div style={{ fontSize: '12px', color: '#b0bec5', marginTop: '8px' }}>DART API 키(Railway 환경변수 DART_API_KEY)가 필요합니다.</div>
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
              📊 스크리닝 개요 — {fmtDate(selected.reportDate)}
            </div>
            <div style={{ display: 'flex', gap: isMobile ? '12px' : '24px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#5f6368' }}>기준 사업연도</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1565c0' }}>{selected.bsnYear ?? '?'}년</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#5f6368' }}>분석 대상</div>
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
          </div>

          {/* ── 우량주 테이블 */}
          {selected.topPicks.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #eaeef2', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                {/* 카드 헤더 — QuantNova 스타일 */}
                <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #eaeef2' }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#1a3a5c' }}>
                    🏆 우량주 TOP {showAll ? selected.topPicks.length : DEFAULT_TOP}
                  </div>
                  <div style={{ fontSize: '13px', color: '#8a9bb0', marginTop: '4px' }}>
                    DART 사업보고서 기반 ROE · 영업이익률 · 부채비율 · 매출성장률 · PBR 종합 스코어
                    {!showAll && selected.topPicks.length > DEFAULT_TOP && <span> &nbsp;· 상위 {DEFAULT_TOP}개 표시 중</span>}
                    <span> &nbsp;· 📊 클릭 시 분기실적</span>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: 'center' }}>순위</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>종목명 (코드)</th>
                      <th style={thStyle}>시장</th>
                      <th onClick={() => handleMainSort('marketCap')} style={{ ...thSortStyle('marketCap'), textAlign: 'right' }}>
                        시총(억){mainSortIcon('marketCap')}
                      </th>
                      <th onClick={() => handleMainSort('roe')} style={{ ...thSortStyle('roe'), textAlign: 'right' }}>
                        <ThWithTip label="ROE(%)" tip="자기자본이익률 — 자본 대비 순이익 효율. 높을수록 자본을 잘 굴리는 기업" />{mainSortIcon('roe')}
                      </th>
                      <th onClick={() => handleMainSort('opMargin')} style={{ ...thSortStyle('opMargin'), textAlign: 'right' }}>
                        영업이익률(%){mainSortIcon('opMargin')}
                      </th>
                      <th onClick={() => handleMainSort('debtRatio')} style={{ ...thSortStyle('debtRatio'), textAlign: 'right' }}>
                        부채비율(%){mainSortIcon('debtRatio')}
                      </th>
                      <th onClick={() => handleMainSort('revenueGrowth')} style={{ ...thSortStyle('revenueGrowth'), textAlign: 'right' }}>
                        매출성장률(%){mainSortIcon('revenueGrowth')}
                      </th>
                      <th onClick={() => handleMainSort('pbr')} style={{ ...thSortStyle('pbr'), textAlign: 'right' }}>
                        <ThWithTip label="PBR" tip="주가순자산비율 — 주가 ÷ 주당순자산. 낮을수록 장부가 대비 저평가" />{mainSortIcon('pbr')}
                      </th>
                      <th onClick={() => handleMainSort('per')} style={{ ...thSortStyle('per'), textAlign: 'right' }}>
                        <ThWithTip label="PER" tip="주가수익비율 — 시가총액 ÷ 순이익. 낮을수록 이익 대비 저평가 (업종 평균과 비교 필요)" />{mainSortIcon('per')}
                      </th>
                      <th onClick={() => handleMainSort('score')} style={{ ...thSortStyle('score'), textAlign: 'right' }}>
                        스코어{mainSortIcon('score')}
                      </th>
                      <th style={thStyle}>분기실적</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePicks.map((pick, idx) => {
                      const isExpanded = expandedQuarterly.has(pick.stockCode);
                      const hasQuarterly = !!(pick.quarterly?.q1 || pick.quarterly?.h1);
                      const rankColors = ['#e67e22', '#8a9bb0', '#b87333'];

                      return (
                        <React.Fragment key={pick.stockCode}>
                          <tr
                            style={{ background: '#fff', transition: 'background 0.12s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f7fafd'}
                            onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fff'}
                          >
                            {/* 순위 */}
                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, fontSize: idx < 3 ? '15px' : '13px', color: idx < 3 ? rankColors[idx] : '#c0cad5' }}>
                              {idx + 1}
                            </td>
                            {/* 종목명 */}
                            <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700, color: '#1a3a5c', fontSize: '14px' }}>
                              {pick.corpName}
                              <span style={{ fontSize: '11px', color: '#b0bec5', marginLeft: '5px', fontWeight: 400 }}>({pick.stockCode})</span>
                            </td>
                            {/* 시장 */}
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              <span style={{
                                fontSize: '11px', padding: '4px 9px', borderRadius: '20px',
                                background: pick.market === 'KOSPI' ? '#e8f0fe' : '#e6f4ea',
                                color: pick.market === 'KOSPI' ? '#1565c0' : '#1e7e34',
                                fontWeight: 700, letterSpacing: '0.3px',
                              }}>
                                {pick.market}
                              </span>
                            </td>
                            {/* 시총 */}
                            <td style={tdStyle}>{_fmtMC(pick.marketCap)}</td>
                            {/* ROE */}
                            <td style={{ ...tdStyle, color: _numColor(pick.roe) }}>
                              {_fmtNum(pick.roe, true)}
                            </td>
                            {/* 영업이익률 */}
                            <td style={{ ...tdStyle, color: _numColor(pick.opMargin) }}>
                              {_fmtNum(pick.opMargin, true)}
                            </td>
                            {/* 부채비율 — 낮을수록 좋음(invert) */}
                            <td style={{ ...tdStyle, color: _numColor(pick.debtRatio, true) }}>
                              {_fmtNum(pick.debtRatio, false, 0)}
                            </td>
                            {/* 매출성장률 */}
                            <td style={{ ...tdStyle, color: _numColor(pick.revenueGrowth) }}>
                              {_fmtNum(pick.revenueGrowth, true)}
                            </td>
                            {/* PBR */}
                            <td style={tdStyle}>
                              {pick.pbr != null ? pick.pbr.toFixed(2) : '—'}
                            </td>
                            {/* PER */}
                            <td style={tdStyle}>
                              {pick.per != null ? pick.per.toFixed(1) : '—'}
                            </td>
                            {/* 스코어 */}
                            <td style={{ ...tdStyle, fontWeight: 800, color: '#e67e22', fontSize: '15px' }}>
                              {pick.score.toFixed(1)}
                            </td>
                            {/* 분기 실적 토글 버튼 */}
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              {hasQuarterly ? (
                                <button
                                  onClick={() => toggleQuarterly(pick.stockCode)}
                                  style={{
                                    background: isExpanded ? '#e8f4fd' : 'none',
                                    border: isExpanded ? '1px solid #89CFF0' : '1px solid #dadce0',
                                    borderRadius: '4px', cursor: 'pointer',
                                    fontSize: '12px', padding: '2px 6px', color: '#1565c0',
                                  }}
                                >
                                  📊{isExpanded ? '▲' : '▼'}
                                </button>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#dadce0' }}>—</span>
                              )}
                            </td>
                          </tr>
                          {/* 분기 실적 확장 행 */}
                          {isExpanded && hasQuarterly && (
                            <tr style={{ background: '#f0f8ff' }}>
                              <td colSpan={11} style={{ padding: '10px 16px', borderBottom: '2px solid #89CFF0' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1565c0', marginBottom: '8px' }}>
                                  📊 {pick.corpName} 분기별 실적 ({new Date().getFullYear()}년)
                                </div>
                                <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%', maxWidth: '640px' }}>
                                  <thead>
                                    <tr style={{ background: '#d0e8f8' }}>
                                      <th style={{ ...thStyle, fontSize: '11px', borderRight: '1px solid #c9dce8' }}>항목</th>
                                      {pick.quarterly?.q1 && (
                                        <th style={{ ...thStyle, fontSize: '11px', borderRight: '1px solid #c9dce8' }}>1분기</th>
                                      )}
                                      {pick.quarterly?.q1 && (
                                        <th style={{ ...thStyle, fontSize: '11px', borderRight: '1px solid #c9dce8' }}>1Q YoY</th>
                                      )}
                                      {pick.quarterly?.h1 && (
                                        <th style={{ ...thStyle, fontSize: '11px', borderRight: '1px solid #c9dce8' }}>반기(H1)</th>
                                      )}
                                      {pick.quarterly?.h1 && (
                                        <th style={{ ...thStyle, fontSize: '11px' }}>H1 YoY</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(['매출액', '영업이익', '당기순이익'] as const).map((label, li) => {
                                      const keys = [
                                        ['revenue', 'revenuePrev'],
                                        ['opIncome', 'opIncomePrev'],
                                        ['netIncome', 'netIncomePrev'],
                                      ] as const;
                                      const [curKey, prevKey] = keys[li];
                                      const q1 = pick.quarterly?.q1;
                                      const h1 = pick.quarterly?.h1;
                                      return (
                                        <tr key={label} style={{ background: li % 2 === 0 ? '#fff' : '#f5f9ff', borderBottom: '1px solid #e0ecf8' }}>
                                          <td style={{ padding: '5px 8px', fontWeight: 600, color: '#344054', borderRight: '1px solid #e0ecf8', whiteSpace: 'nowrap' }}>
                                            {label}
                                          </td>
                                          {q1 && (
                                            <td style={{ padding: '5px 8px', textAlign: 'right', borderRight: '1px solid #e0ecf8', color: '#1a3a5c' }}>
                                              {_fmtTrillion((q1 as Record<string, number | null | undefined>)[curKey])}
                                            </td>
                                          )}
                                          {q1 && (
                                            <td style={{
                                              padding: '5px 8px', textAlign: 'right', borderRight: '1px solid #e0ecf8',
                                              color: _numColor(
                                                q1[curKey] != null && q1[prevKey] != null && q1[prevKey] !== 0
                                                  ? ((q1[curKey]! - q1[prevKey]!) / Math.abs(q1[prevKey]!)) * 100
                                                  : null
                                              ),
                                            }}>
                                              {_yoy((q1 as Record<string, number | null | undefined>)[curKey], (q1 as Record<string, number | null | undefined>)[prevKey])}
                                            </td>
                                          )}
                                          {h1 && (
                                            <td style={{ padding: '5px 8px', textAlign: 'right', borderRight: '1px solid #e0ecf8', color: '#1a3a5c' }}>
                                              {_fmtTrillion((h1 as Record<string, number | null | undefined>)[curKey])}
                                            </td>
                                          )}
                                          {h1 && (
                                            <td style={{
                                              padding: '5px 8px', textAlign: 'right',
                                              color: _numColor(
                                                h1[curKey] != null && h1[prevKey] != null && h1[prevKey] !== 0
                                                  ? ((h1[curKey]! - h1[prevKey]!) / Math.abs(h1[prevKey]!)) * 100
                                                  : null
                                              ),
                                            }}>
                                              {_yoy((h1 as Record<string, number | null | undefined>)[curKey], (h1 as Record<string, number | null | undefined>)[prevKey])}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '6px' }}>
                                  * YoY: 전기 동일 기간 대비 성장률 | 금액: 원 단위 (DART 연결재무제표 기준)
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>

              {/* 전체 펼치기/접기 버튼 */}
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

          {/* ── 추가 랭킹 4종 */}
          {(() => {
            const hasAny = (
              selected.rankAssetGrowth.length > 0 ||
              selected.rankOpMarginAvg.length > 0 ||
              selected.rankLowDebt.length > 0 ||
              selected.rankRevenueGrowth.length > 0
            );
            if (!hasAny) return null;

            type RankSection = {
              title: string;
              subtitle: string;
              items: typeof selected.rankAssetGrowth;
              metricLabel: string;
              metricKey: keyof typeof selected.rankAssetGrowth[0];
              metricUnit: string;
              color: string;
            };

            const sections: RankSection[] = [
              {
                title: '📈 자산 증가율 TOP20',
                subtitle: '최근 3년간 자산총계 누적 증가율 (전전기→당기)',
                items: selected.rankAssetGrowth,
                metricLabel: '자산증가',
                metricKey: 'assetsGrowth3y',
                metricUnit: '%',
                color: '#1565c0',
              },
              {
                title: '💰 영업이익률 TOP20',
                subtitle: '최근 3년 평균 영업이익률',
                items: selected.rankOpMarginAvg,
                metricLabel: '3Y평균',
                metricKey: 'opMargin3yAvg',
                metricUnit: '%',
                color: '#2e7d32',
              },
              {
                title: '🛡 저부채 우량주 (부채비율 120% 이하)',
                subtitle: '부채비율 낮은 순 — 재무 안전성 최상위',
                items: selected.rankLowDebt,
                metricLabel: '부채비율',
                metricKey: 'debtRatio',
                metricUnit: '%',
                color: '#6a1b9a',
              },
              {
                title: '🚀 매출 증가율 TOP20',
                subtitle: '최근 3년간 매출액 누적 증가율 (전전기→당기)',
                items: selected.rankRevenueGrowth,
                metricLabel: '매출증가',
                metricKey: 'revenueGrowth3y',
                metricUnit: '%',
                color: '#e65100',
              },
            ];

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sections.filter(s => s.items.length > 0).map((sec, si) => (
                  <RankingTable key={si} {...sec} />
                ))}
              </div>
            );
          })()}

          {/* ── Gemini 분석 마크다운 */}
          {selected.content && (
            <div style={{ background: '#fff', borderRadius: '10px', padding: '16px 20px', border: '1px solid #e0e4e8' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', marginBottom: '12px' }}>
                🤖 Gemini 분석
              </div>
              {renderContent(selected.content)}
            </div>
          )}

          {/* 안내 문구 */}
          <div style={{ marginTop: '16px', padding: '10px 14px', background: '#fff8e1', borderRadius: '8px', border: '1px solid #ffe082', fontSize: '12px', color: '#795548' }}>
            ⚠️ 본 스크리닝은 DART 사업보고서 재무 데이터 기반 정량 분석입니다. 투자 판단의 참고 자료로만 활용하세요.
            실제 투자 전 IR, 공시, 뉴스 등 비재무적 요소를 반드시 추가 검토하세요.
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreeningReportView;
