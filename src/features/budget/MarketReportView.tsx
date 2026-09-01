// ─── 시장 리포트 뷰 + 공통코드 관리 모달 + 티커 이력 차트 모달 ────────────
// AIReportView의 'market' 서브탭에서 렌더링
// CommonCodeModal / TickerHistoryModal / TICKER_GROUPS / UsaTopStocksTable /
// UsaSector / UsaSectorTable / UsaSectorsPanel 을 함께 포함
import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, ReferenceLine, Cell,
} from 'recharts';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  getMarketReports,
  generateMarketReport,
  generateKrCloseReport,
  generatePremarketReport,
  deleteMarketReport,
  getTickerHistory,
  TickerHistoryPoint,
  getCommonCodes,
  createCommonCode,
  updateCommonCode,
  deleteCommonCode,
  invalidateCommonCodeCache,
} from '../../services/api';
import {
  MarketReport,
  KrSectorData,
  KrTopGainer,
  KrInvestorDayFlow,
  CommonCode,
} from '../../types';

// ─── 공통코드 관리 모달 ─────────────────────────────────────────────────────
const CommonCodeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [codes, setCodes] = useState<CommonCode[]>([]);
  const [loading, setLoading] = useState(true);

  // 선택된 그룹 (공통코드)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // 그룹 추가 폼
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupCode, setNewGroupCode] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  // 상세코드 추가 폼
  const [showDetailForm, setShowDetailForm] = useState(false);
  const [newDetailCode, setNewDetailCode] = useState('');
  const [newDetailName, setNewDetailName] = useState('');
  const [newDetailSort, setNewDetailSort] = useState('0');

  // 인라인 수정 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingSort, setEditingSort] = useState('');

  useEffect(() => {
    getCommonCodes().then(data => {
      setCodes(data);
      if (data.length > 0) setSelectedGroup(data[0].commonCode);
    }).finally(() => setLoading(false));
  }, []);

  // 그룹 목록 (distinct)
  const groups = React.useMemo(() => {
    const seen = new Map<string, string>();
    codes.forEach(c => { if (!seen.has(c.commonCode)) seen.set(c.commonCode, c.commonCodeName); });
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name }));
  }, [codes]);

  // 선택 그룹의 상세코드 목록
  const details = React.useMemo(() =>
    codes.filter(c => c.commonCode === selectedGroup),
    [codes, selectedGroup]
  );

  // 그룹 코드/명 확인 후 상세코드 추가 폼으로 전환 (그룹은 첫 상세코드 등록 시 함께 생성)
  const handleAddGroup = () => {
    const gc = newGroupCode.trim().toUpperCase();
    const gn = newGroupName.trim();
    if (!gc || !gn) return alert('공통코드와 공통코드명을 입력하세요.');
    setSelectedGroup(gc);
    setShowGroupForm(false);
    setShowDetailForm(true);
    setNewDetailCode('');
    setNewDetailName('');
    setNewDetailSort('0');
  };

  // 실제 그룹+첫 상세코드 함께 등록
  const handleAddDetail = async () => {
    const dc = newDetailCode.trim();
    const dn = newDetailName.trim();
    if (!dc || !dn) return alert('상세코드와 상세코드명을 입력하세요.');

    // 선택된 그룹 정보 조회
    const grp = groups.find(g => g.code === selectedGroup);
    const gc = grp?.code ?? newGroupCode.trim().toUpperCase();
    const gn = grp?.name ?? newGroupName.trim();
    if (!gc || !gn) return alert('공통코드명을 확인할 수 없습니다.');

    const created = await createCommonCode({
      common_code: gc,
      common_code_name: gn,
      detail_code: dc,
      detail_code_name: dn,
      sort_order: Number(newDetailSort) || 0,
    });
    invalidateCommonCodeCache(gc);
    setCodes(prev => [...prev, created]);
    setNewDetailCode('');
    setNewDetailName('');
    setNewDetailSort('0');
    setShowDetailForm(false);
    setNewGroupCode('');
    setNewGroupName('');
    setSelectedGroup(gc);
  };

  const handleEditSave = async (id: number) => {
    const dn = editingName.trim();
    if (!dn) return;
    const updated = await updateCommonCode(id, { detail_code_name: dn, sort_order: Number(editingSort) || 0 });
    invalidateCommonCodeCache(updated.commonCode);
    setCodes(prev => prev.map(c => c.id === id ? updated : c));
    setEditingId(null);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`'${name}' 상세코드를 삭제하시겠습니까?`)) return;
    await deleteCommonCode(id);
    invalidateCommonCodeCache(selectedGroup || undefined);
    setCodes(prev => prev.filter(c => c.id !== id));
  };

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: '13px', border: '1px solid #dadce0',
    borderRadius: '6px', outline: 'none', background: '#fff',
  };
  const btnStyle = (bg: string, color: string): React.CSSProperties => ({
    padding: '6px 12px', fontSize: '12px', fontWeight: 600,
    border: 'none', borderRadius: '6px', background: bg, color, cursor: 'pointer',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9500,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '820px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #e8ecf0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#1a3a5c' }}>공통코드 관리</div>
            <div style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '2px' }}>그룹(공통코드) 및 상세코드를 등록·수정·삭제합니다.</div>
          </div>
          <button onClick={onClose} style={{ fontSize: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#9aa0a6', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* 좌측: 그룹 목록 */}
          <div style={{
            width: '220px', flexShrink: 0, borderRight: '1px solid #e8ecf0',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#5f6368' }}>공통코드 그룹</span>
              <button onClick={() => { setShowGroupForm(v => !v); setShowDetailForm(false); }} style={btnStyle('#e8f5e9', '#2e7d32')}>+ 그룹</button>
            </div>

            {/* 그룹 추가 폼 */}
            {showGroupForm && (
              <div style={{ padding: '10px 12px', background: '#f8fffe', borderBottom: '1px solid #e8ecf0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input placeholder="그룹코드 (영문대문자)" value={newGroupCode}
                  onChange={e => setNewGroupCode(e.target.value.toUpperCase())}
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                <input placeholder="그룹명" value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleAddGroup} style={{ ...btnStyle('#1a3a5c', '#fff'), flex: 1 }}>다음 →</button>
                  <button onClick={() => setShowGroupForm(false)} style={{ ...btnStyle('#f0f0f0', '#5f6368'), flex: 1 }}>취소</button>
                </div>
              </div>
            )}

            {/* 그룹 목록 */}
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9aa0a6', fontSize: '13px' }}>로딩 중...</div>
            ) : groups.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9aa0a6', fontSize: '12px' }}>등록된 그룹이 없습니다.</div>
            ) : (
              groups.map(g => (
                <div key={g.code} onClick={() => { setSelectedGroup(g.code); setShowDetailForm(false); }}
                  style={{
                    padding: '10px 16px', cursor: 'pointer',
                    background: selectedGroup === g.code ? '#e8f0fe' : '#fff',
                    borderLeft: selectedGroup === g.code ? '3px solid #1565c0' : '3px solid transparent',
                    borderBottom: '1px solid #f5f5f5',
                  }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: selectedGroup === g.code ? '#1565c0' : '#344054' }}>{g.code}</div>
                  <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '1px' }}>{g.name}</div>
                </div>
              ))
            )}
          </div>

          {/* 우측: 상세코드 목록 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedGroup ? (
              <>
                {/* 상세코드 헤더 */}
                <div style={{
                  padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa',
                }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c' }}>{selectedGroup}</span>
                    <span style={{ fontSize: '12px', color: '#9aa0a6', marginLeft: '8px' }}>
                      {groups.find(g => g.code === selectedGroup)?.name ?? newGroupName}
                    </span>
                  </div>
                  <button onClick={() => { setShowDetailForm(v => !v); setNewDetailCode(''); setNewDetailName(''); setNewDetailSort('0'); }}
                    style={btnStyle('#e8f0fe', '#1565c0')}>+ 상세코드</button>
                </div>

                {/* 상세코드 추가 폼 */}
                {showDetailForm && (
                  <div style={{ padding: '10px 16px', background: '#f0f8ff', borderBottom: '1px solid #e8ecf0', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>상세코드</label>
                      <input placeholder="예: HOUSING" value={newDetailCode}
                        onChange={e => setNewDetailCode(e.target.value.toUpperCase())}
                        style={{ ...inputStyle, width: '140px' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>상세코드명</label>
                      <input placeholder="예: 주거비" value={newDetailName}
                        onChange={e => setNewDetailName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddDetail()}
                        style={{ ...inputStyle, width: '150px' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>정렬</label>
                      <input type="number" placeholder="0" value={newDetailSort}
                        onChange={e => setNewDetailSort(e.target.value)}
                        style={{ ...inputStyle, width: '60px' }} />
                    </div>
                    <button onClick={handleAddDetail} style={btnStyle('#1a3a5c', '#fff')}>등록</button>
                    <button onClick={() => setShowDetailForm(false)} style={btnStyle('#f0f0f0', '#5f6368')}>취소</button>
                  </div>
                )}

                {/* 상세코드 테이블 헤더 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 2fr 60px 80px',
                  padding: '8px 16px', fontSize: '11px', fontWeight: 700,
                  color: '#fff', background: '#1a3a5c',
                }}>
                  <span>상세코드</span>
                  <span>상세코드명</span>
                  <span style={{ textAlign: 'center' }}>정렬</span>
                  <span style={{ textAlign: 'center' }}>액션</span>
                </div>

                {/* 상세코드 행 목록 */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {details.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#9aa0a6', fontSize: '13px' }}>
                      상세코드가 없습니다. "+ 상세코드" 버튼으로 추가하세요.
                    </div>
                  ) : (
                    details.map((d, i) => (
                      <div key={d.id} style={{
                        display: 'grid', gridTemplateColumns: '1fr 2fr 60px 80px',
                        padding: '10px 16px', fontSize: '13px', alignItems: 'center',
                        background: i % 2 === 0 ? '#fff' : '#fafafa',
                        borderBottom: '1px solid #f0f0f0',
                      }}>
                        <span style={{ fontWeight: 600, color: '#344054', fontFamily: 'monospace', fontSize: '12px' }}>{d.detailCode}</span>

                        {editingId === d.id ? (
                          <>
                            <input value={editingName} onChange={e => setEditingName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleEditSave(d.id); if (e.key === 'Escape') setEditingId(null); }}
                              style={{ ...inputStyle, padding: '4px 8px' }} autoFocus />
                            <input type="number" value={editingSort} onChange={e => setEditingSort(e.target.value)}
                              style={{ ...inputStyle, padding: '4px 6px', textAlign: 'center' }} />
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button onClick={() => handleEditSave(d.id)} style={btnStyle('#1a3a5c', '#fff')}>저장</button>
                              <button onClick={() => setEditingId(null)} style={btnStyle('#f0f0f0', '#5f6368')}>취소</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span style={{ color: '#344054' }}>{d.detailCodeName}</span>
                            <span style={{ textAlign: 'center', color: '#9aa0a6', fontSize: '12px' }}>{d.sortOrder}</span>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button onClick={() => { setEditingId(d.id); setEditingName(d.detailCodeName); setEditingSort(String(d.sortOrder)); }}
                                style={{ padding: '3px 8px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '5px', background: '#fff', cursor: 'pointer' }}>✏</button>
                              <button onClick={() => handleDelete(d.id, d.detailCodeName)}
                                style={{ padding: '3px 8px', fontSize: '12px', border: '1px solid #fecaca', borderRadius: '5px', background: '#fff', color: '#E06060', cursor: 'pointer' }}>×</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa0a6', fontSize: '13px' }}>
                좌측에서 그룹을 선택하세요.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── 티커 이력 차트 모달 ────────────────────────────────────────
const TickerHistoryModal: React.FC<{
  ticker: string;
  label: string;
  isRate: boolean;
  onClose: () => void;
}> = ({ ticker, label, isRate, onClose }) => {
  const [data, setData] = useState<TickerHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // reportType 미지정 → 전체 리포트(global + kr_close) 통합 이력
  useEffect(() => {
    getTickerHistory(ticker)
      .then(rows => setData(rows))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  const cc = (v: number | null) => v == null ? '#9aa0a6' : v > 0 ? '#2e7d32' : v < 0 ? '#c62828' : '#9aa0a6';

  // X축 날짜: MM/DD 형식
  const fmtDate = (d: string) => d.slice(5).replace('-', '/');

  // Y축 포맷: 기준금리/채권은 % 단위, 나머지는 콤마 구분
  const fmtY = (v: number) =>
    isRate ? `${v.toFixed(2)}%` : v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

  const latest = data[data.length - 1];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10500,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px',
          padding: '24px', width: 'min(680px, 95vw)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c' }}>{label}</div>
            {latest && (
              <div style={{ fontSize: '13px', color: '#5f6368', marginTop: '2px' }}>
                <span style={{ fontWeight: 700, color: '#1a3a5c' }}>
                  {latest.close.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                  {isRate ? '%' : ''}
                </span>
                {latest.changePct != null && (
                  <span style={{ marginLeft: '8px', color: cc(latest.changePct), fontWeight: 600 }}>
                    {latest.changePct > 0 ? '+' : ''}{latest.changePct.toFixed(2)}%
                  </span>
                )}
                <span style={{ marginLeft: '8px', color: '#9aa0a6', fontSize: '11px' }}>
                  최근 {data.length}개 데이터
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6', lineHeight: 1 }}
          >×</button>
        </div>

        {/* 차트 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6' }}>불러오는 중...</div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6' }}>데이터 없음</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 10, fill: '#9aa0a6' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={fmtY}
                tick={{ fontSize: 10, fill: '#9aa0a6' }}
                width={isRate ? 48 : 72}
                domain={['auto', 'auto']}
              />
              <Tooltip
                formatter={(value: number) => [fmtY(value), label]}
                labelFormatter={fmtDate}
                contentStyle={{ fontSize: '12px', borderRadius: '8px' }}
              />
              <Line
                type="monotone"
                dataKey="close"
                stroke="#89CFF0"
                strokeWidth={2}
                dot={data.length <= 30}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* 변동률 미니 바 차트 (데이터 충분할 때) */}
        {!loading && data.length > 1 && (
          <>
            <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '16px', marginBottom: '6px' }}>일별 변동률 (%)</div>
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={data} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <Tooltip
                  formatter={(v: number) => [`${v > 0 ? '+' : ''}${v?.toFixed(2)}%`, '변동률']}
                  labelFormatter={fmtDate}
                  contentStyle={{ fontSize: '11px', borderRadius: '6px' }}
                />
                <ReferenceLine y={0} stroke="#ddd" />
                <Bar dataKey="changePct" radius={[2, 2, 0, 0]}>
                  {data.map((entry, i) => (
                    <Cell key={i} fill={cc(entry.changePct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
};

// ─── 시장 리포트 뷰 (AIReportView 내 서브탭으로 표시) ──────────

// 티커 그룹 정의 (화면 표시용) — accent: 섹션 헤더 및 카드 왼쪽 테두리 색상
// 기준금리 → 채권 → 증시 순서, vix는 별도 공포/변동성 섹션에서 F&G와 함께 표시
const TICKER_GROUPS = [
  { label: '기준금리',      keys: ['rate_us', 'rate_kr', 'rate_jp', 'rate_eu', 'rate_gb'],                            accent: '#3b7dd8' },
  { label: '거시지표',      keys: ['macro_cpi_us', 'macro_core_cpi_us', 'macro_cpi_kr', 'macro_unemployment_us', 'macro_ppi_us'], accent: '#7b68ee' },
  { label: '국채',          keys: ['us10y', 'us30y', 'us3m', 'kr10y', 'jp10y', 'de10y'],                             accent: '#2a9d8f' },
  { label: '미국 증시',     keys: ['sp500', 'nasdaq', 'dow'],                                                          accent: '#40a060' },
  { label: '원자재',        keys: ['wti', 'brent', 'gold', 'silver'],                                                 accent: '#c8882a' },
  { label: '환율 / 달러',  keys: ['dxy', 'usdkrw', 'usdjpy', 'eurusd', 'eurkrw'],                                   accent: '#d4704a' },
  { label: '한국 / 아시아', keys: ['kospi', 'kosdaq', 'kpi200', 'fut', 'kqi150', 'kvalue', 'nikkei'],               accent: '#c0404a' },
];

// ── 미국 주가상위 100 접기/펼치기 테이블 ─────────────────────────────────────
const UsaTopStocksTable: React.FC<{
  stocks: Array<{ticker:string;name:string;nameEn:string;exchange:string;close:number|null;changePct:number;changePrice:number|null;tradeVolume:number;marketCap:number|null;sector:string}>;
}> = ({ stocks }) => {
  const [open, setOpen] = useState(false);

  const cc = (v: number) => v > 0 ? '#1e7e34' : v < 0 ? '#c0392b' : '#555';
  const sign = (v: number) => v > 0 ? '+' : '';
  const fmtMktCap = (v: number | null) => {
    if (!v) return '-';
    const b = v / 1_000_000_000;
    return b >= 1000 ? `$${(b / 1000).toFixed(1)}T` : `$${b.toFixed(1)}B`;
  };

  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e0f0ff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '20px', overflow: 'hidden' }}>
      {/* 헤더 — 클릭으로 펼치기/접기 */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', cursor: 'pointer', userSelect: 'none', borderBottom: open ? '1px solid #e0f0ff' : 'none' }}
      >
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c' }}>🇺🇸 미국 주가상위 {stocks.length}개 (priceTop)</span>
        <span style={{ fontSize: '13px', color: '#89CFF0', fontWeight: 700 }}>{open ? '▲ 접기' : '▼ 펼치기'}</span>
      </div>

      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f0f8fd', position: 'sticky', top: 0 }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>티커</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>종목명</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>섹터</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>현재가</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>등락률</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>시가총액</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>거래량</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s, idx) => (
                <tr key={s.ticker} style={{ borderTop: '1px solid #f0f4f8', background: idx % 2 === 0 ? '#fff' : '#fafcff' }}>
                  <td style={{ padding: '7px 10px', color: '#9aa0a6' }}>{idx + 1}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 700, color: '#1a3a5c' }}>{s.ticker}</td>
                  <td style={{ padding: '7px 10px', color: '#344054', whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name || s.nameEn}</td>
                  <td style={{ padding: '7px 10px', color: '#7a8fa6', whiteSpace: 'nowrap' }}>{s.sector || '-'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#1a3a5c' }}>{s.close != null ? `$${s.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: cc(s.changePct) }}>{sign(s.changePct)}{s.changePct.toFixed(2)}%</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#344054' }}>{fmtMktCap(s.marketCap)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#7a8fa6' }}>{s.tradeVolume > 0 ? s.tradeVolume.toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── 미국 업종 섹터 단일 테이블 (재사용) ─────────────────────────────────────
type UsaSector = {ranking:number;code:string;name:string;changeRate:number;risingCount:number;fallingCount:number;unchangedCount:number;totalMarketCap:number|null;topStockCode:string;topStockName:string;topStockRate:number|null};

const UsaSectorTable: React.FC<{ title: string; sectors: UsaSector[] }> = ({ title, sectors }) => {
  const cc = (v: number) => v > 0 ? '#1e7e34' : v < 0 ? '#c0392b' : '#555';
  const sign = (v: number) => v > 0 ? '+' : '';
  return (
    <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a3a5c', marginBottom: '6px', padding: '0 2px' }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: '#f0f8fd' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>섹터명</th>
            <th style={{ padding: '6px 8px', textAlign: 'right', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>등락률</th>
            <th style={{ padding: '6px 8px', textAlign: 'right', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>↑</th>
            <th style={{ padding: '6px 8px', textAlign: 'right', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>↓</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: '#5f6368', fontWeight: 600, whiteSpace: 'nowrap' }}>대표종목</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((s, idx) => (
            <tr key={s.code} style={{ borderTop: '1px solid #f0f4f8', background: idx % 2 === 0 ? '#fff' : '#fafcff' }}>
              <td style={{ padding: '6px 8px', color: '#9aa0a6' }}>{s.ranking}</td>
              <td style={{ padding: '6px 8px', color: '#344054', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: cc(s.changeRate) }}>{sign(s.changeRate)}{s.changeRate.toFixed(2)}%</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1e7e34' }}>{s.risingCount}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c0392b' }}>{s.fallingCount}</td>
              <td style={{ padding: '6px 8px', color: '#1a3a5c', whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.topStockName ? s.topStockName : '-'}
                {s.topStockRate != null && <span style={{ marginLeft: '4px', color: cc(s.topStockRate) }}>({sign(s.topStockRate)}{s.topStockRate.toFixed(1)}%)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── 일간 + 주간 나란히 래퍼 ─────────────────────────────────────────────────
const UsaSectorsPanel: React.FC<{ daily: UsaSector[]; weekly: UsaSector[] }> = ({ daily, weekly }) => {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e0f0ff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '20px', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', cursor: 'pointer', userSelect: 'none', borderBottom: open ? '1px solid #e0f0ff' : 'none' }}
      >
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c' }}>🏭 미국 업종 섹터 — 일간 / 주간 등락률</span>
        <span style={{ fontSize: '13px', color: '#89CFF0', fontWeight: 700 }}>{open ? '▲ 접기' : '▼ 펼치기'}</span>
      </div>
      {open && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '16px', alignItems: 'flex-start' }}>
          {daily.length > 0 && <UsaSectorTable title={`📅 일간 (${daily.length}개)`} sectors={daily} />}
          {!isMobile && daily.length > 0 && weekly.length > 0 && <div style={{ width: '1px', background: '#e0f0ff', alignSelf: 'stretch' }} />}
          {weekly.length > 0 && <UsaSectorTable title={`📆 주간 (${weekly.length}개)`} sectors={weekly} />}
        </div>
      )}
    </div>
  );
};

const MarketReportView: React.FC = () => {
  const isMobile = useIsMobile();
  const [reports, setReports] = useState<MarketReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingKr, setGeneratingKr] = useState(false);
  const [generatingPremarket, setGeneratingPremarket] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeType, setActiveType] = useState<'global' | 'kr_close' | 'premarket'>('global');
  const [toast, setToast] = useState('');
  const [vixTipOpen, setVixTipOpen] = useState(false);
  // 상승 종목 테이블 접기/펼치기 (기본 접힘)
  const [gainersOpen, setGainersOpen] = useState<Record<string, boolean>>({});
  // 투자자 순매수 동향 뷰 토글 (table | chart)
  const [investorFlowView, setInvestorFlowView] = useState<'table' | 'chart'>('table');
  // 티커 이력 차트 — 선택된 티커 키 (null=닫힘), 전체 리포트 기준
  const [chartTicker, setChartTicker] = useState<{ key: string; label: string; isRate: boolean } | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getMarketReports();
      setReports(data);
      // 최초 로드 시 현재 탭 기준 가장 최신 리포트 선택
      const firstOfType = data.find(r => r.reportType === activeType);
      if (firstOfType) setSelectedId(firstOfType.id);
      else if (data.length > 0 && selectedId === null) setSelectedId(data[0].id);
    } catch (e: any) {
      // 네트워크 오류나 파싱 오류 시 에러 메시지 표시 (빈 목록으로 오인하지 않도록)
      setLoadError(e?.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 탭 전환 시 해당 타입의 가장 최신 리포트 자동 선택
  const switchType = (type: 'global' | 'kr_close' | 'premarket') => {
    setActiveType(type);
    const first = reports.find(r => r.reportType === type);
    if (first) setSelectedId(first.id);
  };

  // 생성 요청 → 5초 폴링으로 완료 감지
  // 신규: id 변경 / 재생성(upsert): updatedAt 변경 둘 다 감지
  const handleGenerate = async () => {
    setGenerating(true);
    setToast('분석 요청 중…');
    try {
      await generateMarketReport();
      setToast('시장 데이터를 수집하고 분석 중입니다. 잠시 후 업데이트됩니다.');
      const prevTopId = reports.length > 0 ? reports[0].id : null;
      const prevTopUpdatedAt = reports.length > 0 ? reports[0].updatedAt : null;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const data = await getMarketReports();
        const isNew = data.length > 0 && (
          data[0].id !== prevTopId ||
          data[0].updatedAt !== prevTopUpdatedAt
        );
        if (isNew || tries >= 36) {
          clearInterval(poll);
          setReports(data);
          // 글로벌 탭으로 전환 후 해당 리포트 선택
          setActiveType('global');
          const first = data.find(r => r.reportType === 'global');
          if (first) setSelectedId(first.id);
          else if (data.length > 0) setSelectedId(data[0].id);
          setGenerating(false);
          setToast(isNew ? '✅ 분석 완료!' : '⚠️ 시간 초과. 잠시 후 새로고침해주세요.');
          setTimeout(() => setToast(''), 4000);
        }
      }, 5000);
    } catch {
      setGenerating(false);
      setToast('❌ 요청에 실패했습니다.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleGenerateKrClose = async () => {
    setGeneratingKr(true);
    setToast('국내 장 마감 분석 요청 중…');
    try {
      await generateKrCloseReport();
      setToast('섹터 데이터를 수집하고 분석 중입니다. 잠시 후 업데이트됩니다.');
      const prevTopId = reports.length > 0 ? reports[0].id : null;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const data = await getMarketReports();
        const isNew = data.length > 0 && data[0].id !== prevTopId;
        if (isNew || tries >= 36) {
          clearInterval(poll);
          setReports(data);
          // 국내장마감 탭으로 전환 후 해당 리포트 선택
          setActiveType('kr_close');
          const first = data.find(r => r.reportType === 'kr_close');
          if (first) setSelectedId(first.id);
          else if (data.length > 0) setSelectedId(data[0].id);
          setGeneratingKr(false);
          setToast(isNew ? '✅ 국내장마감 분석 완료!' : '⚠️ 시간 초과. 잠시 후 새로고침해주세요.');
          setTimeout(() => setToast(''), 4000);
        }
      }, 5000);
    } catch {
      setGeneratingKr(false);
      setToast('❌ 요청에 실패했습니다.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleGeneratePremarket = async () => {
    setGeneratingPremarket(true);
    setToast('프리마켓 분석 요청 중…');
    try {
      await generatePremarketReport();
      setToast('프리마켓 데이터를 수집하고 분석 중입니다. 잠시 후 업데이트됩니다.');
      const prevTopId = reports.length > 0 ? reports[0].id : null;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const data = await getMarketReports();
        const isNew = data.length > 0 && data[0].id !== prevTopId;
        if (isNew || tries >= 36) {
          clearInterval(poll);
          setReports(data);
          setActiveType('premarket');
          const first = data.find(r => r.reportType === 'premarket');
          if (first) setSelectedId(first.id);
          else if (data.length > 0) setSelectedId(data[0].id);
          setGeneratingPremarket(false);
          setToast(isNew ? '✅ 프리마켓 분석 완료!' : '⚠️ 시간 초과. 잠시 후 새로고침해주세요.');
          setTimeout(() => setToast(''), 4000);
        }
      }, 5000);
    } catch {
      setGeneratingPremarket(false);
      setToast('❌ 요청에 실패했습니다.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleDelete = async () => {
    if (selectedId === null) return;
    const target = reports.find(r => r.id === selectedId);
    if (!window.confirm(`[${target?.reportDate}] 리포트를 삭제할까요?`)) return;
    try {
      await deleteMarketReport(selectedId);
      const next = reports.filter(r => r.id !== selectedId);
      setReports(next);
      setSelectedId(next.length > 0 ? next[0].id : null);
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  // 마크다운 → JSX (AIReportView와 동일 패턴)
  // **bold** 및 [text](url) 마크다운을 JSX로 변환하는 인라인 렌더러
  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]*\]\([^)]+\))/g);
    return parts.map((p, j) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={j}>{p.slice(2, -2)}</strong>;
      const linkMatch = p.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
      if (linkMatch) return <a key={j} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#1a6fa0', textDecoration: 'underline' }}>{linkMatch[1]}</a>;
      return p;
    });
  };

  const renderContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('## ')) {
        return <h2 key={i} style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c', margin: '18px 0 8px', borderBottom: '2px solid #e0f0ff', paddingBottom: '4px' }}>{line.slice(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={i} style={{ fontSize: '13px', fontWeight: 700, color: '#344054', margin: '12px 0 5px' }}>{line.slice(4)}</h3>;
      }
      if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
        return <p key={i} style={{ fontWeight: 700, color: '#1a3a5c', margin: '8px 0 4px', fontSize: '13px' }}>{line.slice(2, -2)}</p>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const content = line.slice(2);
        // 뉴스 시사점 카드 패턴: [제목](url) → 시장영향
        const newsMatch = content.match(/^\[([^\]]*)\]\(([^)]+)\)\s*(?:→|->)\s*(.+)$/);
        if (newsMatch) {
          // Gemini가 [- 제목](url) 형식으로 줄 때 앞의 '- ' 제거
          const title = newsMatch[1].replace(/^[-·\s]+/, '').trim();
          const url = newsMatch[2];
          const impact = newsMatch[3];
          return (
            <div key={i} style={{
              background: '#f8fcff', border: '1px solid #dceefa',
              borderLeft: '3px solid #89CFF0', borderRadius: '8px',
              padding: '11px 14px', margin: '6px 0',
            }}>
              <div style={{ fontWeight: 700, color: '#1a3a5c', fontSize: '13px', marginBottom: '5px', lineHeight: '1.5' }}>
                {title}
              </div>
              <p style={{ fontSize: '12px', color: '#444', margin: '0 0 8px', lineHeight: '1.65' }}>
                {impact}
              </p>
              <a href={url} target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: '12px', color: '#4baad4', textDecoration: 'underline' }}>
                🔗 기사 보기
              </a>
            </div>
          );
        }
        // 일반 bullet
        return (
          <div key={i} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', color: '#344054' }}>
            <span style={{ color: '#89CFF0', flexShrink: 0 }}>•</span>
            <span>{renderInline(content)}</span>
          </div>
        );
      }
      if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />;
      return (
        <p key={i} style={{ fontSize: '13px', color: '#444', margin: '3px 0', lineHeight: '1.6' }}>
          {renderInline(line)}
        </p>
      );
    });
  };

  const selected = reports.find(r => r.id === selectedId);
  // 현재 탭의 리포트만 필터링
  const filteredReports = reports.filter(r => r.reportType === activeType);

  const formatKST = (iso: string | null) => {
    if (!iso) return '';
    // DB가 KST naive datetime 반환 (timezone suffix 없음) → 브라우저가 UTC로 해석해 +9h 이중 적용되는 버그 방지
    // suffix 없을 때만 +09:00 붙여 KST로 명시
    const s = /Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + '+09:00';
    return new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // change_pct 양수=초록, 음수=빨강, 0=회색
  const changeColor = (v: number | null) => v == null ? '#9aa0a6' : v > 0 ? '#2e7d32' : v < 0 ? '#c62828' : '#9aa0a6';
  const changeSign = (v: number | null) => v == null ? '' : v > 0 ? '+' : '';

  const TYPE_TABS: { key: 'global' | 'kr_close' | 'premarket'; label: string; desc: string }[] = [
    { key: 'global',     label: '🌏 글로벌',      desc: '오전 7시 자동' },
    { key: 'kr_close',  label: '🇰🇷 국내장마감',  desc: '오후 4시 자동' },
    { key: 'premarket', label: '🌙 프리마켓',     desc: '오후 9시 자동' },
  ];

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>

      {/* 티커 이력 차트 모달 */}
      {chartTicker && (
        <TickerHistoryModal
          ticker={chartTicker.key}
          label={chartTicker.label}
          isRate={chartTicker.isRate}
          onClose={() => setChartTicker(null)}
        />
      )}

      {/* 타입 탭 */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {TYPE_TABS.map(tab => {
          const isActive = activeType === tab.key;
          const cnt = reports.filter(r => r.reportType === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => switchType(tab.key)}
              style={{
                padding: '7px 16px', fontSize: '13px', fontWeight: isActive ? 700 : 400,
                border: isActive ? '2px solid #89CFF0' : '2px solid #e0e0e0',
                borderRadius: '20px', cursor: 'pointer',
                background: isActive ? '#e8f7ff' : '#fff',
                color: isActive ? '#1a3a5c' : '#7a8fa6',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {tab.label}
                  {cnt > 0 && (
                    <span style={{ fontSize: '11px', background: isActive ? '#89CFF0' : '#e0e0e0', color: isActive ? '#fff' : '#666', borderRadius: '10px', padding: '1px 6px' }}>{cnt}</span>
                  )}
                </div>
                <div style={{ fontSize: '10px', color: isActive ? '#4a90d9' : '#b0bec5', fontWeight: 400 }}>{tab.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 컨트롤 바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {filteredReports.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <select
              value={selectedId ?? ''}
              onChange={e => setSelectedId(Number(e.target.value))}
              style={{ padding: '5px 10px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '8px', background: '#fff', color: '#344054', maxWidth: '260px' }}
            >
              {filteredReports.map(r => (
                <option key={r.id} value={r.id}>
                  {r.reportDate} · {formatKST(r.updatedAt ?? r.createdAt)}
                </option>
              ))}
            </select>
            <button
              onClick={handleDelete}
              title="선택 리포트 삭제"
              style={{ padding: '5px 9px', fontSize: '13px', border: '1px solid #f5c6c6', borderRadius: '8px', background: '#fff5f5', color: '#c0392b', cursor: 'pointer', lineHeight: 1 }}
            >×</button>
          </div>
        )}
        {/* 탭별 생성 버튼 */}
        {activeType === 'global' && (
          <button
            onClick={handleGenerate}
            disabled={generating || generatingKr}
            style={{
              padding: '6px 16px', fontSize: '13px', fontWeight: 600, border: 'none',
              borderRadius: '8px', cursor: (generating || generatingKr) ? 'default' : 'pointer',
              background: generating ? '#b0c4de' : '#89CFF0', color: '#fff',
            }}
          >
            {generating ? '생성 중…' : '✨ 생성'}
          </button>
        )}
        {activeType === 'kr_close' && (
          <button
            onClick={handleGenerateKrClose}
            disabled={generating || generatingKr || generatingPremarket}
            style={{
              padding: '6px 16px', fontSize: '13px', fontWeight: 600, border: 'none',
              borderRadius: '8px', cursor: (generating || generatingKr || generatingPremarket) ? 'default' : 'pointer',
              background: generatingKr ? '#b0c4de' : '#e06060', color: '#fff',
            }}
          >
            {generatingKr ? '생성 중…' : '✨ 생성'}
          </button>
        )}
        {activeType === 'premarket' && (
          <button
            onClick={handleGeneratePremarket}
            disabled={generating || generatingKr || generatingPremarket}
            style={{
              padding: '6px 16px', fontSize: '13px', fontWeight: 600, border: 'none',
              borderRadius: '8px', cursor: (generating || generatingKr || generatingPremarket) ? 'default' : 'pointer',
              background: generatingPremarket ? '#b0c4de' : '#6a1b9a', color: '#fff',
            }}
          >
            {generatingPremarket ? '생성 중…' : '✨ 생성'}
          </button>
        )}
        <button onClick={load} style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '8px', background: '#fff', cursor: 'pointer', color: '#5f6368' }}>↺</button>
      </div>

      {/* 본문 */}
      <div>
          {toast && (
            <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', padding: '10px 16px', marginBottom: '14px', fontSize: '13px', color: '#1b5e20' }}>
              {toast}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6' }}>불러오는 중…</div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#c0392b', fontSize: '14px' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
              <div>데이터를 불러오지 못했습니다.</div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#9aa0a6' }}>{loadError}</div>
              <button onClick={load} style={{ marginTop: '16px', padding: '8px 20px', background: '#89CFF0', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>다시 시도</button>
            </div>
          ) : filteredReports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6', fontSize: '14px' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>📊</div>
              <div>이 탭의 리포트가 없어요.</div>
              <div style={{ marginTop: '8px', fontSize: '12px' }}><strong>✨ 생성</strong> 버튼으로 첫 번째 리포트를 만들어보세요.</div>
            </div>
          ) : selected ? (
            <div>
              {/* 시장 데이터 티커 그리드 */}
              {Object.keys(selected.marketData).length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  {TICKER_GROUPS.map((group) => {
                    // close가 null인 티커(NaN 소독 결과)는 카드 표시 제외
                    const tickers = group.keys.map(k => ({ key: k, data: selected.marketData[k] })).filter(t => t.data && t.data.close != null);
                    if (tickers.length === 0) return null;

                    // 섹션 헤더: 액센트 컬러 왼쪽 바 + 라벨
                    const sectionHeader = (label: string, accent: string) => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <div style={{ width: '4px', height: '18px', borderRadius: '2px', background: accent, flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', letterSpacing: '0.2px' }}>{label}</span>
                      </div>
                    );

                    // 공통 카드 쉘: 흰 배경 + 그림자 + 액센트 왼쪽 테두리
                    const cardStyle = (accent: string): React.CSSProperties => ({
                      background: '#fff',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      border: '1px solid #eaeef2',
                      borderLeft: `4px solid ${accent}`,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    });

                    const tickerCard = (key: string, data: typeof tickers[0]['data']) => {
                      // rate_ : 기준금리 — close에 % 단위, 변화량 pp
                      // macro_ : 거시지표 (CPI/PPI/실업률) — 월간 FRED 데이터
                      //   └ macro_unemployment_us : 실업률 → close% + pp 변화 (isRate처럼)
                      //   └ 그 외 CPI/PPI         : YoY%를 메인 수치, MoM pt 변화 보조
                      const isRate      = key.startsWith('rate_');
                      const isMacro     = key.startsWith('macro_');
                      const isMacroRate = key === 'macro_unemployment_us'; // 실업률은 rate처럼 표시
                      return (
                        <div
                          key={key}
                          style={{ ...cardStyle(group.accent), cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                          onClick={() => setChartTicker({ key, label: data.label, isRate: isRate || isMacroRate })}
                          title="클릭하면 이력 그래프를 볼 수 있어요"
                        >
                          <div style={{ fontSize: '11px', color: '#8a9bb0', marginBottom: '4px', letterSpacing: '0.2px' }}>{data.label}</div>
                          <div style={{ fontSize: '21px', fontWeight: 700, color: '#1a3a5c', lineHeight: 1.15, marginBottom: '3px' }}>
                            {(isMacro && !isMacroRate)
                              /* CPI/PPI: YoY%가 핵심 수치 */
                              ? <>{data.changePct != null ? `${data.changePct >= 0 ? '+' : ''}${data.changePct.toFixed(1)}` : '-'}<span style={{ fontSize: '11px', fontWeight: 400 }}>% YoY</span></>
                              /* 기준금리·실업률: close 값 */
                              : <>{data.close.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}{(isRate || isMacroRate) ? '%' : ''}</>
                            }
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: changeColor(isRate || isMacroRate ? data.change : (isMacro ? data.changePct : data.changePct)) }}>
                            {(isRate || isMacroRate) ? (
                              data.change != null
                                ? <>{data.change > 0 ? '▲ ' : data.change < 0 ? '▼ ' : ''}{changeSign(data.change)}{data.change.toFixed(2)}<span style={{ fontSize: '10px', fontWeight: 400 }}>pp</span></>
                                : <span style={{ color: '#9aa0a6' }}>—</span>
                            ) : isMacro ? (
                              data.change != null
                                ? <>{data.change > 0 ? '▲ ' : data.change < 0 ? '▼ ' : ''}{changeSign(data.change)}{data.change.toFixed(2)}<span style={{ fontSize: '10px', fontWeight: 400 }}>pt MoM</span></>
                                : <span style={{ color: '#9aa0a6' }}>—</span>
                            ) : (
                              <>{data.changePct != null ? (data.changePct > 0 ? '▲ ' : data.changePct < 0 ? '▼ ' : '') : ''}{changeSign(data.changePct)}{data.changePct?.toFixed(2) ?? '—'}%</>
                            )}
                          </div>
                          {/* CPI/PPI: 보조 줄에 실제 지수값 표시 */}
                          {(isMacro && !isMacroRate) && (
                            <div style={{ fontSize: '10px', color: '#9aa0a6', marginTop: '1px' }}>
                              지수 {data.close.toFixed(1)}
                            </div>
                          )}
                          <div style={{ fontSize: '10px', color: '#b0bec5', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{data.date}</span>
                            <span style={{ color: '#c8d8e8' }}>📈</span>
                          </div>
                        </div>
                      );
                    };

                    const FEAR_ACCENT = '#8e44ad';

                    return (
                      <React.Fragment key={group.label}>
                        <div style={{ marginBottom: '16px' }}>
                          {sectionHeader(group.label, group.accent)}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                            {tickers.map(({ key, data }) => tickerCard(key, data))}
                          </div>
                        </div>

                        {/* 미국 증시 다음에 공포/변동성 섹션 (VIX + F&G) 삽입 */}
                        {group.label === '미국 증시' && (
                          <div style={{ marginBottom: '16px' }}>
                            {sectionHeader('공포 / 변동성', FEAR_ACCENT)}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>

                              {/* VIX 카드 — 우측 상단 ℹ 툴팁 */}
                              {selected.marketData.vix?.close != null && (() => {
                                const vix = selected.marketData.vix!;
                                return (
                                  <div
                                    style={{ position: 'relative', ...cardStyle(FEAR_ACCENT), cursor: 'pointer' }}
                                    onClick={() => setChartTicker({ key: 'vix', label: vix.label || 'VIX', isRate: false })}
                                    title="클릭하면 이력 그래프를 볼 수 있어요"
                                  >
                                    {/* ⓘ 버튼: 탭/클릭으로 팝오버 토글 (모바일 hover 미지원 대응) */}
                                    <div style={{ position: 'absolute', top: '6px', right: '8px' }}>
                                      <div
                                        onClick={() => setVixTipOpen(v => !v)}
                                        style={{ fontSize: '12px', color: '#c0c8d0', cursor: 'pointer', userSelect: 'none', lineHeight: 1 }}
                                      >ⓘ</div>
                                      {vixTipOpen && (
                                        <div
                                          onClick={() => setVixTipOpen(false)}
                                          style={{ position: 'absolute', right: 0, top: '18px', zIndex: 99, background: '#1a3a5c', color: '#fff', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', lineHeight: '1.8', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
                                        >
                                          <div style={{ fontWeight: 700, marginBottom: '6px' }}>VIX 수준 해석</div>
                                          <div>20 미만 &nbsp;│ 안정적, 낮은 불안감</div>
                                          <div>30 이상 &nbsp;│ 불안감 증가, 높은 변동성</div>
                                          <div>40 이상 &nbsp;│ 극도 불안, 공포 지배</div>
                                          <div>60 이상 &nbsp;│ 극단적 시장 위기</div>
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#7a8fa6', marginBottom: '2px' }}>{vix.label}</div>
                                    <div style={{ fontSize: '21px', fontWeight: 700, color: '#1a3a5c', lineHeight: 1.15, marginBottom: '3px' }}>
                                      {vix.close.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                                    </div>
                                    <div style={{ fontSize: '13px', color: changeColor(vix.changePct), fontWeight: 700 }}>
                                      {vix.changePct != null ? (vix.changePct > 0 ? '▲ ' : vix.changePct < 0 ? '▼ ' : '') : ''}{changeSign(vix.changePct)}{vix.changePct?.toFixed(2) ?? '—'}%
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#b0bec5', marginTop: '2px' }}>{vix.date}</div>
                                  </div>
                                );
                              })()}

                              {/* Fear & Greed 카드 — 미니 게이지 + 이전값 */}
                              {selected.fearGreed && (() => {
                                const fg = selected.fearGreed!;
                                const FG_LABEL: Record<string, { ko: string; emoji: string; color: string }> = {
                                  'Extreme Fear': { ko: '극도의 공포', emoji: '😱', color: '#c62828' },
                                  'Fear':         { ko: '공포',        emoji: '😟', color: '#e65100' },
                                  'Neutral':      { ko: '중립',        emoji: '😐', color: '#f9a825' },
                                  'Greed':        { ko: '탐욕',        emoji: '😊', color: '#558b2f' },
                                  'Extreme Greed':{ ko: '극도의 탐욕', emoji: '🤑', color: '#1b5e20' },
                                };
                                const info = FG_LABEL[fg.rating] ?? { ko: fg.rating, emoji: '📊', color: '#888' };
                                return (
                                  <div style={cardStyle(FEAR_ACCENT)}>
                                    <div style={{ fontSize: '11px', color: '#7a8fa6', marginBottom: '3px' }}>CNN Fear &amp; Greed</div>
                                    <div style={{ fontSize: '21px', fontWeight: 700, color: info.color, lineHeight: 1.15, marginBottom: '2px' }}>{info.emoji} {fg.score.toFixed(1)}</div>
                                    <div style={{ fontSize: '12px', color: info.color, fontWeight: 700, marginBottom: '6px' }}>{info.ko}</div>
                                    {/* 미니 게이지 */}
                                    <div style={{ position: 'relative', height: '5px', borderRadius: '3px',
                                      background: 'linear-gradient(to right, #c62828 0%, #e65100 25%, #f9a825 50%, #7cb342 75%, #1b5e20 100%)',
                                    }}>
                                      <div style={{
                                        position: 'absolute', top: '50%',
                                        left: `clamp(4px, ${fg.score}%, calc(100% - 4px))`,
                                        transform: 'translate(-50%, -50%)',
                                        width: '9px', height: '9px', borderRadius: '50%',
                                        background: info.color, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                      }} />
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#b0bec5', marginTop: '5px' }}>
                                      전일 {fg.previousClose.toFixed(1)} · 1주 {fg.previous1Week.toFixed(1)} · 1개월 {fg.previous1Month.toFixed(1)}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}

              {/* 섹터 등락률 + 주도주 — kr_close 리포트 전용 */}
              {selected.reportType === 'kr_close' && (selected.krSectors.length > 0 || selected.krTopGainers.length > 0) && (() => {
                const accent = '#c0404a';

                const SectionHeader = ({ label }: { label: string }) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: accent, flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#344054' }}>{label}</span>
                  </div>
                );

                const SectorTable = ({ title, items }: { title: string; items: KrSectorData[] }) => {
                  if (items.length === 0) return null;
                  const maxAbs = Math.max(...items.map(s => Math.abs(s.changePct)));
                  return (
                    <div style={{ marginBottom: '14px' }}>
                      <SectionHeader label={`${title} 섹터별 등락률`} />
                      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dde4ed', overflow: 'hidden' }}>
                        {items.map((s, i) => {
                          const isPos = s.changePct >= 0;
                          const barW = maxAbs > 0 ? Math.abs(s.changePct) / maxAbs * 100 : 0;
                          return (
                            <div key={i} style={{
                              display: 'grid', gridTemplateColumns: '1fr 60px 1fr',
                              alignItems: 'center', padding: '5px 12px',
                              borderBottom: i < items.length - 1 ? '1px solid #f0f4f8' : 'none',
                            }}>
                              <span style={{ fontSize: '12px', color: '#344054', fontWeight: 500 }}>{s.sector}</span>
                              <span style={{ fontSize: '12px', fontWeight: 700, textAlign: 'right', color: isPos ? '#2e7d32' : '#c62828' }}>
                                {isPos ? '+' : ''}{s.changePct.toFixed(2)}%
                              </span>
                              <div style={{ paddingLeft: '8px' }}>
                                <div style={{ height: '7px', borderRadius: '4px', width: `${barW}%`, background: isPos ? '#66bb6a' : '#ef5350', minWidth: barW > 0 ? '3px' : '0' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                };

                const GainerTable = ({ marketKey, title, items }: { marketKey: string; title: string; items: KrTopGainer[] }) => {
                  if (items.length === 0) return null;
                  const isOpen = !!gainersOpen[marketKey];
                  const toggle = () => setGainersOpen(prev => ({ ...prev, [marketKey]: !prev[marketKey] }));
                  return (
                    <div style={{ marginBottom: '14px' }}>
                      {/* 헤더 — 클릭으로 접기/펼치기 */}
                      <div
                        onClick={toggle}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '6px' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: accent, flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#344054' }}>{title} 상승률 상위 종목</span>
                          <span style={{ fontSize: '11px', color: '#9aa0a6' }}>({items.length}개)</span>
                        </div>
                        <span style={{ fontSize: '12px', color: '#9aa0a6', userSelect: 'none' }}>{isOpen ? '▲ 접기' : '▼ 펼치기'}</span>
                      </div>
                      {isOpen && (
                        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dde4ed', overflow: 'hidden' }}>
                          {/* 테이블 헤더 */}
                          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 70px 80px', alignItems: 'center', padding: '5px 12px', background: '#f8fafc', borderBottom: '1px solid #e8edf3' }}>
                            {['#', '종목명', '등락률', '종가'].map((h, i) => (
                              <span key={i} style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
                            ))}
                          </div>
                          {items.map((g, i) => {
                            const isPos = g.changePct >= 0;
                            return (
                              <div key={i} style={{
                                display: 'grid', gridTemplateColumns: '24px 1fr 70px 80px',
                                alignItems: 'center', padding: '6px 12px',
                                borderBottom: i < items.length - 1 ? '1px solid #f0f4f8' : 'none',
                              }}>
                                <span style={{ fontSize: '11px', color: '#b0bec5', fontWeight: 600 }}>{i + 1}</span>
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#1a3a5c' }}>{g.name}</div>
                                  <div style={{ fontSize: '10px', color: '#b0bec5' }}>{g.ticker}</div>
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', color: isPos ? '#2e7d32' : '#c62828' }}>
                                  {isPos ? '+' : ''}{g.changePct.toFixed(2)}%
                                </span>
                                <span style={{ fontSize: '12px', textAlign: 'right', color: '#344054' }}>
                                  {g.close != null ? g.close.toLocaleString() : '-'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                };

                const kospiSec    = selected.krSectors.filter(s => s.market === 'KOSPI');
                const kosdaqSec   = selected.krSectors.filter(s => s.market === 'KOSDAQ');
                const kospiGain   = selected.krTopGainers.filter(g => g.market === 'KOSPI');
                const kosdaqGain  = selected.krTopGainers.filter(g => g.market === 'KOSDAQ');

                return (
                  <div style={{ marginBottom: '20px' }}>
                    {/* KOSPI */}
                    {(kospiSec.length > 0 || kospiGain.length > 0) && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '10px', paddingBottom: '4px', borderBottom: '2px solid #fce4e4' }}>🇰🇷 KOSPI</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                          <SectorTable title="섹터" items={kospiSec} />
                          <GainerTable marketKey="KOSPI" title="주도주" items={kospiGain} />
                        </div>
                      </div>
                    )}
                    {/* KOSDAQ */}
                    {(kosdaqSec.length > 0 || kosdaqGain.length > 0) && (
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '10px', paddingBottom: '4px', borderBottom: '2px solid #fce4e4' }}>📊 KOSDAQ</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                          <SectorTable title="섹터" items={kosdaqSec} />
                          <GainerTable marketKey="KOSDAQ" title="주도주" items={kosdaqGain} />
                        </div>
                      </div>
                    )}
                    {/* 네이버 증권 바로가기 */}
                    <div style={{ marginTop: '12px', textAlign: 'right' }}>
                      <a
                        href="https://stock.naver.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          fontSize: '12px', color: '#03c75a', fontWeight: 600,
                          textDecoration: 'none', padding: '5px 12px',
                          border: '1px solid #03c75a', borderRadius: '20px',
                          background: '#f0fff7',
                        }}
                      >
                        <span style={{ fontSize: '14px' }}>N</span> 네이버 증권
                      </a>
                    </div>
                  </div>
                );
              })()}

              {/* 투자자별 순매수 동향 — kr_close 리포트 전용 */}
              {selected.reportType === 'kr_close' && selected.krInvestorFlow && selected.krInvestorFlow.length > 0 && (() => {
                const flow: KrInvestorDayFlow[] = [...selected.krInvestorFlow];
                // 표시할 투자자 컬럼 순서 (백엔드 key 기준)
                const COLS: { key: string; label: string }[] = [
                  { key: 'individual',    label: '개인' },
                  { key: 'foreign',       label: '외국인' },
                  { key: 'institution',   label: '기관계' },
                  { key: 'financial_inv', label: '금융투자' },
                  { key: 'insurance',     label: '보험' },
                  { key: 'trust_samo',    label: '투신사모' },
                  { key: 'bank',          label: '은행' },
                  { key: 'other_fin',     label: '기타금융' },
                  { key: 'pension',       label: '연기금' },
                  { key: 'other_corp',    label: '기타법인' },
                ];
                // 데이터가 있는 컬럼만 필터
                const activeCols = COLS.filter(c =>
                  flow.some(d => d.investors[c.key] !== undefined)
                );
                const fmtAmt = (v: number) => {
                  const abs = Math.abs(v);
                  const str = abs >= 10000
                    ? `${(abs / 10000).toFixed(1).replace(/\.0$/, '')}조`
                    : `${abs.toLocaleString()}억`;
                  return v >= 0 ? `+${str}` : `-${str}`;
                };
                const cellColor = (v: number) => v >= 0 ? '#1b5e20' : '#b71c1c';
                const cellBg    = (v: number) => v >= 0 ? '#f1f8f1' : '#fff5f5';
                // 날짜 포맷: YYYYMMDD → MM/DD
                const fmtDate = (d: string) => d.length === 8 ? `${d.slice(4, 6)}/${d.slice(6, 8)}` : d;

                // 그래프용 데이터: 날짜별 주요 투자자 순매수 (개인/외국인/기관계)
                const CHART_COLS = [
                  { key: 'individual', label: '개인',   color: '#4e79a7' },
                  { key: 'foreign',    label: '외국인', color: '#f28e2b' },
                  { key: 'institution', label: '기관계', color: '#59a14f' },
                ];
                // 그래프는 시계열 특성상 과거→오늘(asc) 순서 유지
                const chartData = [...flow].reverse().map(day => {
                  const row: Record<string, string | number> = { date: fmtDate(day.date) };
                  CHART_COLS.forEach(c => {
                    row[c.key] = day.investors[c.key]?.diffHundredMillion ?? 0;
                  });
                  return row;
                });

                return (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                      <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: '#c0404a', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#344054' }}>KOSPI 투자자별 순매수 동향 (억원)</span>
                      <button
                        onClick={() => setInvestorFlowView(v => v === 'table' ? 'chart' : 'table')}
                        style={{
                          marginLeft: 'auto', fontSize: '11px', fontWeight: 600,
                          padding: '3px 10px', borderRadius: '14px', cursor: 'pointer',
                          border: '1px solid #89CFF0', color: investorFlowView === 'chart' ? '#fff' : '#1a3a5c',
                          background: investorFlowView === 'chart' ? '#89CFF0' : '#f0f8fd',
                        }}
                      >
                        {investorFlowView === 'chart' ? '표로 보기' : '그래프로 보기'}
                      </button>
                    </div>

                    {investorFlowView === 'table' ? (
                      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #dde4ed', background: '#fff' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '480px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e0e6ef' }}>
                              <th style={{ padding: '6px 10px', textAlign: 'left', color: '#9aa0a6', fontWeight: 600, whiteSpace: 'nowrap' }}>날짜</th>
                              {activeCols.map(c => (
                                <th key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: '#9aa0a6', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {flow.map((day, i) => (
                              <tr key={day.date} style={{ borderBottom: i < flow.length - 1 ? '1px solid #f0f4f8' : 'none' }}>
                                <td style={{ padding: '6px 10px', color: '#344054', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtDate(day.date)}</td>
                                {activeCols.map(c => {
                                  const inv = day.investors[c.key];
                                  const val = inv ? inv.diffHundredMillion : 0;
                                  return (
                                    <td key={c.key} style={{
                                      padding: '5px 8px', textAlign: 'right', fontWeight: 600,
                                      color: inv ? cellColor(val) : '#ccc',
                                      background: inv ? cellBg(val) : 'transparent',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {inv ? fmtAmt(val) : '-'}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dde4ed', padding: '12px 8px 8px 0' }}>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9aa0a6' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#9aa0a6' }} tickFormatter={(v: number) => `${(v / 1).toFixed(0)}`} />
                            <Tooltip
                              formatter={(value: number, name: string) => [fmtAmt(value), name]}
                              labelStyle={{ fontSize: 11, fontWeight: 700 }}
                              contentStyle={{ fontSize: 11 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={0} stroke="#aaa" strokeWidth={1} />
                            {CHART_COLS.map(c => (
                              <Bar key={c.key} dataKey={c.key} name={c.label} fill={c.color} radius={[3, 3, 0, 0]} maxBarSize={20} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 실적 발표 결과 & 내일 예정 (글로벌 리포트 전용) */}
              {selected.reportType === 'global' && (() => {
                const earningsCalendar: any[] = (selected.marketData as any).earnings_calendar || [];
                const earningsResults: any[] = (selected.marketData as any).earnings_results || [];

                // report_date 기준 내일 날짜 계산
                const reportDate = selected.reportDate; // "YYYY-MM-DD"
                const tomorrowDate = (() => {
                  const d = new Date(reportDate + 'T00:00:00');
                  d.setDate(d.getDate() + 1);
                  return d.toISOString().split('T')[0];
                })();

                const todayResults = earningsResults.filter((e: any) => e.date === reportDate);
                const tomorrowEarnings = earningsCalendar.filter((e: any) => e.date === tomorrowDate);

                if (todayResults.length === 0 && tomorrowEarnings.length === 0) return null;

                return (
                  <div style={{ marginBottom: '20px' }}>
                    {/* 오늘 실적 결과 */}
                    {todayResults.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '8px' }}>
                          📊 오늘 실적 발표
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {todayResults.map((e: any, i: number) => {
                            const surprisePct: number | null = e.eps_surprise_pct;
                            const isPositive = surprisePct != null && surprisePct > 0;
                            const isNegative = surprisePct != null && surprisePct < 0;
                            return (
                              <div key={i} style={{
                                background: '#fff', borderRadius: '10px', padding: '10px 14px',
                                border: `1px solid ${isPositive ? '#a8e6cf' : isNegative ? '#ffc8c8' : '#e0e4e8'}`,
                                borderLeft: `3px solid ${isPositive ? '#27ae60' : isNegative ? '#e53935' : '#89CFF0'}`,
                                boxShadow: '0 2px 6px rgba(0,0,0,0.06)', minWidth: '180px',
                              }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c' }}>
                                  {e.name} <span style={{ fontSize: '11px', color: '#7a8fa6', fontWeight: 400 }}>({e.symbol})</span>
                                </div>
                                {e.eps_actual != null && (
                                  <div style={{ fontSize: '12px', color: '#344054', marginTop: '4px' }}>
                                    EPS ${Number(e.eps_actual).toFixed(2)}
                                    {e.eps_estimate != null && (
                                      <span style={{ color: '#7a8fa6' }}> / 예측 ${Number(e.eps_estimate).toFixed(2)}</span>
                                    )}
                                  </div>
                                )}
                                {surprisePct != null && (
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: isPositive ? '#27ae60' : '#e53935', marginTop: '2px' }}>
                                    {isPositive ? '▲' : '▼'} {Math.abs(surprisePct).toFixed(1)}% 서프라이즈
                                  </div>
                                )}
                                {e.rev_actual != null && (
                                  <div style={{ fontSize: '11px', color: '#7a8fa6', marginTop: '2px' }}>
                                    매출 ${(e.rev_actual / 1e9).toFixed(1)}B
                                    {e.rev_estimate != null && ` / 예측 $${(e.rev_estimate / 1e9).toFixed(1)}B`}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 내일 실적 예정 */}
                    {tomorrowEarnings.length > 0 && (
                      <div style={{
                        background: 'linear-gradient(135deg, #fff8e1 0%, #fff3e0 100%)',
                        borderRadius: '10px', padding: '12px 16px',
                        border: '1px solid #ffe082', borderLeft: '3px solid #f9a825',
                        boxShadow: '0 2px 8px rgba(249,168,37,0.15)',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#e65100', marginBottom: '8px' }}>
                          ⚠️ 내일 실적 발표 예정
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {tomorrowEarnings.map((e: any, i: number) => (
                            <div key={i} style={{
                              background: '#fff', borderRadius: '8px', padding: '6px 12px',
                              border: '1px solid #ffe082', fontSize: '12px',
                            }}>
                              <span style={{ fontWeight: 700, color: '#1a3a5c' }}>{e.name}</span>
                              <span style={{ color: '#7a8fa6', marginLeft: '4px' }}>({e.symbol})</span>
                              {e.eps_estimate != null && (
                                <span style={{ color: '#e65100', marginLeft: '6px', fontWeight: 600 }}>
                                  EPS 예측 ${Number(e.eps_estimate).toFixed(2)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 미국 주가상위 100 + 섹터 테이블 (글로벌 리포트 전용) */}
              {selected.reportType === 'global' && (() => {
                const usaStocks: Array<{ticker:string;name:string;nameEn:string;exchange:string;close:number|null;changePct:number;changePrice:number|null;tradeVolume:number;marketCap:number|null;sector:string}> =
                  (selected.marketData as any).usa_top_stocks || [];
                const usaSectorsDaily: UsaSector[] = (selected.marketData as any).usa_sectors_daily || (selected.marketData as any).usa_sectors || [];
                const usaSectorsWeekly: UsaSector[] = (selected.marketData as any).usa_sectors_weekly || [];
                return (
                  <>
                    {usaStocks.length > 0 && <UsaTopStocksTable stocks={usaStocks} />}
                    {(usaSectorsDaily.length > 0 || usaSectorsWeekly.length > 0) && (
                      <UsaSectorsPanel daily={usaSectorsDaily} weekly={usaSectorsWeekly} />
                    )}
                  </>
                );
              })()}

              {/* Gemini 분석 본문 */}
              {selected.content && (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e0f0ff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e0f0ff' }}>
                    {selected.reportType === 'kr_close' ? '🇰🇷 국내장마감 분석' : selected.reportType === 'premarket' ? '🌙 미국장 프리마켓 브리핑' : '🌏 글로벌 시장 분석'} · {selected.reportDate}
                    {(selected.updatedAt ?? selected.createdAt) && (
                      <span style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 400, marginLeft: '10px' }}>{formatKST(selected.updatedAt ?? selected.createdAt)} 업데이트</span>
                    )}
                  </div>
                  <div>{renderContent(selected.content)}</div>
                </div>
              )}

            </div>
          ) : null}
      </div>
    </div>
  );
};

export { CommonCodeModal };
export default MarketReportView;
