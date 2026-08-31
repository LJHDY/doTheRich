// ─── 통합 투자 의견 뷰 ────────────────────────────────────────────────────────
// 시장 리포트 + 우량주 스크리닝 데이터를 결합해 Gemini가 생성한 통합 투자 의견을 표시
// AIReportView의 'integrated' 서브탭에서 렌더링
import React, { useEffect, useState } from 'react';
import { getIntegratedReports, generateIntegratedReport } from '../../services/api';
import { IntegratedReport, ScreeningRankItem } from '../../types';

// ─── 수치 관련 헬퍼 함수 ────────────────────────────────────────

/** 수치 색상 — 값이 높을수록 초록(green), 낮을수록 빨강(red), null이면 회색 */
export const _numColor = (val: number | null, invert = false): string => {
  if (val === null) return '#9aa0a6';
  if (invert) {
    // 부채비율: 낮을수록 초록
    if (val > 200) return '#e53935';
    if (val > 100) return '#f57c00';
    return '#388e3c';
  }
  // ROE / 영업이익률 / 매출성장률: 높을수록 초록
  if (val < 0) return '#e53935';
  if (val >= 15) return '#388e3c';
  if (val >= 5) return '#1565c0';
  return '#5f6368';
};

/** 숫자 포맷 — null이면 '—', 소수점 1자리, 부호 포함 옵션 */
export const _fmtNum = (val: number | null, showSign = false, decimals = 1): string => {
  if (val === null) return '—';
  const sign = showSign && val > 0 ? '+' : '';
  return `${sign}${val.toFixed(decimals)}`;
};

/** 시총 포맷 — 조원 이상이면 "X.Xt", 억원이면 "X,XXX억" */
export const _fmtMC = (val: number | null): string => {
  if (val === null) return '—';
  if (val >= 10_000) return `${(val / 10_000).toFixed(1)}조`;
  return `${val.toLocaleString()}억`;
};

// ─── RankingTable 컴포넌트 ───────────────────────────────────────

export type RankSectionProps = {
  title: string;
  subtitle: string;
  items: ScreeningRankItem[];
  metricLabel: string;
  metricKey: keyof ScreeningRankItem;
  metricUnit: string;
  color: string;
};

/** 우량주 스크리닝 순위 테이블 — 접기/펼치기 + 컬럼 정렬 지원 */
export const RankingTable: React.FC<RankSectionProps> = ({ title, subtitle, items, metricLabel, metricKey, metricUnit, color }) => {
  const [open, setOpen] = useState(false);
  // 정렬 상태 — null이면 기본 순서(내려받은 items 그대로)
  const [rankSortKey, setRankSortKey] = useState<keyof ScreeningRankItem | null>(null);
  const [rankSortDir, setRankSortDir] = useState<'asc' | 'desc'>('desc');

  if (items.length === 0) return null;

  const handleRankSort = (key: keyof ScreeningRankItem) => {
    if (rankSortKey === key) {
      setRankSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setRankSortKey(key);
      // 부채비율은 낮을수록 좋으므로 첫 클릭 시 오름차순
      setRankSortDir(key === 'debtRatio' ? 'asc' : 'desc');
    }
  };

  const sortedItems = rankSortKey
    ? [...items].sort((a, b) => {
        const av = a[rankSortKey] as number | null | undefined;
        const bv = b[rankSortKey] as number | null | undefined;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return rankSortDir === 'asc' ? av - bv : bv - av;
      })
    : items;

  const fmtPct = (v: number | null | undefined) =>
    v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}${metricUnit}` : '-';

  // 정렬 아이콘
  const sortIcon = (key: keyof ScreeningRankItem) => {
    if (rankSortKey !== key) return <span style={{ color: '#c0c8d0', marginLeft: '2px', fontSize: '9px' }}>⇅</span>;
    return <span style={{ color: '#1565c0', marginLeft: '2px', fontSize: '9px' }}>{rankSortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const thBase: React.CSSProperties = {
    padding: '6px 10px', color: '#7a8fa6', fontWeight: 600,
    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
  };

  return (
    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e0e4e8', overflow: 'hidden' }}>
      {/* 헤더 — 클릭으로 펼치기/접기 */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', cursor: 'pointer',
          background: open ? '#f8faff' : '#fff',
          borderBottom: open ? '1px solid #e0e4e8' : 'none',
        }}
      >
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c' }}>{title}</div>
          <div style={{ fontSize: '11px', color: '#7a8fa6', marginTop: '2px' }}>{subtitle}</div>
        </div>
        <span style={{ fontSize: '12px', color: '#7a8fa6' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8faff', borderBottom: '1px solid #e0e4e8' }}>
                <th style={{ padding: '6px 10px', textAlign: 'center', color: '#7a8fa6', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', color: '#7a8fa6', fontWeight: 600 }}>종목</th>
                <th style={{ padding: '6px 10px', textAlign: 'center', color: '#7a8fa6', fontWeight: 600, whiteSpace: 'nowrap' }}>시장</th>
                <th onClick={() => handleRankSort(metricKey)} style={{ ...thBase, textAlign: 'right', color: rankSortKey === metricKey ? '#1565c0' : color, fontWeight: 700 }}>
                  {metricLabel}{sortIcon(metricKey)}
                </th>
                <th onClick={() => handleRankSort('debtRatio')} style={{ ...thBase, textAlign: 'right' }}>
                  부채비율{sortIcon('debtRatio')}
                </th>
                <th onClick={() => handleRankSort('roe')} style={{ ...thBase, textAlign: 'right' }}>
                  ROE{sortIcon('roe')}
                </th>
                <th onClick={() => handleRankSort('opMargin')} style={{ ...thBase, textAlign: 'right' }}>
                  영업이익률{sortIcon('opMargin')}
                </th>
                <th onClick={() => handleRankSort('marketCap')} style={{ ...thBase, textAlign: 'right' }}>
                  시총(억){sortIcon('marketCap')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, idx) => {
                const metricVal = item[metricKey] as number | null | undefined;
                const isLowDebt = metricKey === 'debtRatio';
                const metricColor = isLowDebt
                  ? (metricVal != null && metricVal <= 50 ? '#2e7d32' : metricVal != null && metricVal <= 100 ? '#1565c0' : '#7a8fa6')
                  : (metricVal != null && metricVal > 0 ? color : '#e53935');
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #f0f2f5', background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: idx < 3 ? '#f9a825' : '#7a8fa6', fontWeight: idx < 3 ? 700 : 400 }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#1a3a5c', whiteSpace: 'nowrap' }}>{item.corpName}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px',
                        background: item.market === 'KOSPI' ? '#e3f2fd' : '#e8f5e9',
                        color: item.market === 'KOSPI' ? '#1565c0' : '#2e7d32', fontWeight: 600 }}>
                        {item.market}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: metricColor }}>
                      {fmtPct(metricVal)}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#344054' }}>
                      {item.debtRatio != null ? `${item.debtRatio.toFixed(0)}%` : '-'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: item.roe != null && item.roe > 0 ? '#2e7d32' : '#7a8fa6' }}>
                      {item.roe != null ? `${item.roe >= 0 ? '+' : ''}${item.roe.toFixed(1)}%` : '-'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: item.opMargin != null && item.opMargin > 0 ? '#1565c0' : '#7a8fa6' }}>
                      {item.opMargin != null ? `${item.opMargin.toFixed(1)}%` : '-'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#7a8fa6' }}>
                      {item.marketCap != null ? item.marketCap.toLocaleString() : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── IntegratedReportView 메인 컴포넌트 ─────────────────────────

const IntegratedReportView: React.FC = () => {
  const [reports, setReports] = useState<IntegratedReport[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    try {
      const data = await getIntegratedReports();
      setReports(data);
      if (data.length > 0 && selectedId === null) setSelectedId(data[0].id);
    } catch {
      setToast('리포트 로드 실패');
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    setGenerating(true);
    setToast('Gemini가 분석 중입니다…');
    try {
      await generateIntegratedReport();
      const prevTopId = reports.length > 0 ? reports[0].id : null;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const data = await getIntegratedReports();
        const isNew = data.length > 0 && data[0].id !== prevTopId;
        if (isNew || tries >= 36) {
          clearInterval(poll);
          setReports(data);
          if (data.length > 0) setSelectedId(data[0].id);
          setGenerating(false);
          setToast(isNew ? '✅ 분석 완료!' : '⚠️ 시간 초과. 잠시 후 새로고침하세요.');
          setTimeout(() => setToast(''), 4000);
        }
      }, 5000);
    } catch {
      setGenerating(false);
      setToast('❌ 생성 실패. 시장 리포트와 스크리닝 리포트가 먼저 생성되어 있어야 합니다.');
      setTimeout(() => setToast(''), 5000);
    }
  };

  const selected = reports.find(r => r.id === selectedId) ?? null;

  // 날짜 포맷 헬퍼 (KST naive datetime → 이중 변환 방지)
  const fmtDate = (iso: string | null) => {
    if (!iso) return '';
    const s = /Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + '+09:00';
    return new Date(s).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  // 마크다운 → JSX (bold, 헤더, 리스트)
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('## ')) {
        return (
          <div key={i} style={{
            fontSize: '15px', fontWeight: 700, color: '#1a3a5c',
            marginTop: '22px', marginBottom: '6px',
            borderLeft: '4px solid #89CFF0', paddingLeft: '10px',
          }}>
            {line.replace(/^##\s*/, '')}
          </div>
        );
      }
      if (line.startsWith('# ')) {
        return (
          <div key={i} style={{ fontSize: '17px', fontWeight: 800, color: '#1a3a5c', marginTop: '8px', marginBottom: '10px' }}>
            {line.replace(/^#\s*/, '')}
          </div>
        );
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const text = line.replace(/^[-*]\s*/, '');
        return (
          <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '3px', paddingLeft: '4px' }}>
            <span style={{ color: '#89CFF0', fontWeight: 700, flexShrink: 0 }}>•</span>
            <span style={{ fontSize: '13px', color: '#3c4043', lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
          </div>
        );
      }
      if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />;
      return (
        <div key={i} style={{ fontSize: '13px', color: '#3c4043', lineHeight: 1.7, marginBottom: '2px' }}
          dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
      );
    });
  };

  return (
    <div style={{ flex: 1 }}>
      {/* 컨트롤 바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {reports.length > 0 && (
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(Number(e.target.value))}
            style={{ padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #dadce0' }}
          >
            {reports.map(r => (
              <option key={r.id} value={r.id}>
                {r.reportDate} · {fmtDate(r.updatedAt ?? r.createdAt)}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: '7px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '8px',
            border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
            background: generating ? '#ccc' : '#E06060', color: '#fff',
          }}
        >
          {generating ? '⏳ 분석 중…' : '✨ 통합 분석 생성'}
        </button>
        <button
          onClick={load}
          style={{ padding: '7px 10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #dadce0', background: '#fff', cursor: 'pointer' }}
        >↺</button>
      </div>

      {/* 안내 */}
      {reports.length === 0 && !generating && (
        <div style={{ padding: '32px', textAlign: 'center', color: '#9aa0a6', fontSize: '14px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔗</div>
          <div>시장 리포트 + 우량주 스크리닝 데이터를 결합한 통합 투자 의견입니다.</div>
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#bbb' }}>
            먼저 시장 리포트(국내장마감)와 스크리닝 리포트(ALL)가 생성되어 있어야 합니다.
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px', marginBottom: '12px',
          background: '#f0f8fd', border: '1px solid #89CFF0', fontSize: '13px', color: '#1a3a5c',
        }}>{toast}</div>
      )}

      {/* 리포트 본문 */}
      {selected?.content && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e0e4e8', padding: '20px 24px' }}>
          {/* 메타 정보 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid #f0f4f8' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#1a3a5c' }}>🔗 통합 투자 의견</span>
            <span style={{ fontSize: '12px', color: '#9aa0a6' }}>{selected.reportDate}</span>
            <span style={{ fontSize: '11px', color: '#bbb' }}>{fmtDate(selected.updatedAt ?? selected.createdAt)} 업데이트</span>
          </div>
          <div>{renderContent(selected.content)}</div>
        </div>
      )}
    </div>
  );
};

export default IntegratedReportView;
