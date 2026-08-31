// ─── 통장 관리 뷰 ─────────────────────────────────────────────
// ACCOUNT_GROUPS 상수 기반 읽기 전용 통장 예산 참고 테이블 +
// 공통코드 관리 모달 버튼 + 공용 통장 현황 섹션(SharedAccountSection)
// BudgetPage의 ACCOUNTS 탭에서 렌더링
import React, { useEffect, useMemo, useState } from 'react';
import {
  getBudgetEntries,
  getCommonCodes,
  createCommonCode,
  updateCommonCode,
  deleteCommonCode,
  invalidateCommonCodeCache,
} from '../../services/api';
import { BudgetEntry, CommonCode } from '../../types';
import { ACCOUNT_GROUPS, BUDGET_USERS } from './budgetConstants';
import { formatAmount, formatAmountShort } from '../../types';

// ─── 통장 그룹 색상 매핑 ──────────────────────────────────────────
const GROUP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  '고정비 통장':  { bg: '#FFF3E0', border: '#FF9800', text: '#E65100' },
  '변동비 통장':  { bg: '#E8F5E9', border: '#4CAF50', text: '#1B5E20' },
  '이벤트 통장':  { bg: '#E3F2FD', border: '#2196F3', text: '#0D47A1' },
};

// ─── 공통코드 관리 모달 ────────────────────────────────────────

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
  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    codes.forEach(c => { if (!seen.has(c.commonCode)) seen.set(c.commonCode, c.commonCodeName); });
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name }));
  }, [codes]);

  // 선택 그룹의 상세코드 목록
  const details = useMemo(() =>
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
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        width: 'min(720px, 96vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* 모달 헤더 */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#1a3a5c' }}>⚙ 공통코드 관리</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6' }}>×</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6' }}>불러오는 중…</div>
        ) : (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* 좌측: 그룹 목록 */}
            <div style={{ width: '220px', borderRight: '1px solid #f0f0f0', overflowY: 'auto', padding: '12px 0' }}>
              {groups.map(g => (
                <div
                  key={g.code}
                  onClick={() => { setSelectedGroup(g.code); setShowDetailForm(false); }}
                  style={{
                    padding: '10px 18px', cursor: 'pointer', fontSize: '13px',
                    fontWeight: selectedGroup === g.code ? 700 : 400,
                    background: selectedGroup === g.code ? '#f0f8fd' : 'transparent',
                    borderLeft: selectedGroup === g.code ? '3px solid #89CFF0' : '3px solid transparent',
                    color: '#344054',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#1a3a5c' }}>{g.name}</div>
                  <div style={{ fontSize: '11px', color: '#9aa0a6' }}>{g.code}</div>
                </div>
              ))}
              {/* 그룹 추가 폼 */}
              {showGroupForm ? (
                <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0' }}>
                  <input placeholder="코드 (영문)" value={newGroupCode} onChange={e => setNewGroupCode(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: '6px', boxSizing: 'border-box' }} />
                  <input placeholder="코드명" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: '8px', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={handleAddGroup} style={btnStyle('#89CFF0', '#fff')}>다음</button>
                    <button onClick={() => setShowGroupForm(false)} style={btnStyle('#f5f5f5', '#666')}>취소</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setShowGroupForm(true); setShowDetailForm(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 18px', border: 'none', background: 'none', fontSize: '12px', color: '#89CFF0', cursor: 'pointer', fontWeight: 600 }}
                >
                  + 그룹 추가
                </button>
              )}
            </div>

            {/* 우측: 상세코드 테이블 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {selectedGroup && (
                <>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '12px' }}>
                    {groups.find(g => g.code === selectedGroup)?.name} ({selectedGroup})
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['상세코드', '코드명', '정렬', ''].map(h => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#7a8fa6', fontWeight: 600, borderBottom: '1px solid #e8edf3' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {details.map(d => (
                        <tr key={d.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                          <td style={{ padding: '7px 10px', color: '#7a8fa6', fontSize: '11px' }}>{d.detailCode}</td>
                          <td style={{ padding: '7px 10px' }}>
                            {editingId === d.id ? (
                              <input
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleEditSave(d.id); if (e.key === 'Escape') setEditingId(null); }}
                                autoFocus
                                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                              />
                            ) : (
                              <span style={{ color: '#344054' }}>{d.detailCodeName}</span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', width: '60px' }}>
                            {editingId === d.id ? (
                              <input
                                value={editingSort}
                                onChange={e => setEditingSort(e.target.value)}
                                style={{ ...inputStyle, width: '50px' }}
                              />
                            ) : (
                              <span style={{ color: '#9aa0a6' }}>{d.sortOrder}</span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', width: '90px' }}>
                            {editingId === d.id ? (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => handleEditSave(d.id)} style={btnStyle('#89CFF0', '#fff')}>저장</button>
                                <button onClick={() => setEditingId(null)} style={btnStyle('#f5f5f5', '#666')}>취소</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => { setEditingId(d.id); setEditingName(d.detailCodeName); setEditingSort(String(d.sortOrder)); }} style={btnStyle('#f0f8fd', '#1a3a5c')}>✏</button>
                                <button onClick={() => handleDelete(d.id, d.detailCodeName)} style={btnStyle('#fff5f5', '#c0392b')}>×</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* 상세코드 추가 폼 */}
                  {showDetailForm ? (
                    <div style={{ marginTop: '14px', padding: '14px', background: '#f8fafd', borderRadius: '10px', border: '1px solid #e0f0ff' }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <input placeholder="상세코드" value={newDetailCode} onChange={e => setNewDetailCode(e.target.value)} style={{ ...inputStyle, flex: '1 0 80px' }} />
                        <input placeholder="코드명" value={newDetailName} onChange={e => setNewDetailName(e.target.value)} style={{ ...inputStyle, flex: '2 0 120px' }} />
                        <input placeholder="정렬" value={newDetailSort} onChange={e => setNewDetailSort(e.target.value)} style={{ ...inputStyle, width: '60px' }} />
                        <button onClick={handleAddDetail} style={btnStyle('#89CFF0', '#fff')}>추가</button>
                        <button onClick={() => setShowDetailForm(false)} style={btnStyle('#f5f5f5', '#666')}>취소</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDetailForm(true)}
                      style={{ marginTop: '12px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, border: '1.5px dashed #89CFF0', borderRadius: '8px', background: '#f8fafd', color: '#4baad4', cursor: 'pointer' }}
                    >
                      + 상세코드 추가
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── 공용 통장 현황 ────────────────────────────────────────────
// 생활비·데이트·여행·비상금 통장처럼 (동영)/(주해) 구분 없는 통장을 공용으로 판별
// 두 유저의 이체·사용 내역을 합산해 잔액·이체이력·사용이력 표시

export const SharedAccountSection: React.FC<{ defaultYearMonth: string }> = ({ defaultYearMonth }) => {
  const [yearMonth, setYearMonth] = useState(defaultYearMonth);
  const [allEntries, setAllEntries] = useState<BudgetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedAcc, setExpandedAcc] = useState<string | null>(null);
  // 카드별 활성 탭 (기본: 이체 이력)
  const [accHistTabs, setAccHistTabs] = useState<Record<string, 'transfer' | 'usage'>>({});

  // 부모 defaultYearMonth 변경 시 동기화
  useEffect(() => { setYearMonth(defaultYearMonth); }, [defaultYearMonth]);

  // 월 이동
  const moveMonth = (delta: number) => {
    const y = Number(yearMonth.slice(0, 4));
    const m = Number(yearMonth.slice(4));
    const total = y * 12 + m - 1 + delta;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    setYearMonth(`${ny}${String(nm).padStart(2, '0')}`);
  };

  // 두 유저 내역 병렬 조회
  useEffect(() => {
    setLoading(true);
    Promise.all(BUDGET_USERS.map(u => getBudgetEntries(u.id, yearMonth)))
      .then(results => setAllEntries(results.flat()))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [yearMonth]);

  // 공용 통장 = (동영)/(주해) 미포함 통장
  const sharedAccounts = useMemo(
    () => ACCOUNT_GROUPS.flatMap(g => g.accounts).filter(a => !a.name.includes('(동영)') && !a.name.includes('(주해)')),
    [],
  );

  const isXferEntry = (e: BudgetEntry) => e.isTransfer || e.category === '이체';
  const getUserName = (uid: string) => BUDGET_USERS.find(u => u.id === uid)?.name ?? uid;
  const ymLabel = `${yearMonth.slice(0, 4)}년 ${Number(yearMonth.slice(4))}월`;

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* 섹션 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0 16px' }}>
        <div style={{ flex: 1, height: '2px', background: 'linear-gradient(to right, #89CFF0, #e0f0ff)' }} />
        <span style={{
          fontSize: '12px', fontWeight: 700, color: '#4BAAD4',
          padding: '4px 14px', border: '1.5px solid #89CFF0',
          borderRadius: '20px', background: '#f0f8fd', whiteSpace: 'nowrap',
        }}>
          🏦 공용 통장 현황
        </span>
        <div style={{ flex: 1, height: '2px', background: 'linear-gradient(to left, #89CFF0, #e0f0ff)' }} />
      </div>

      {/* 월 네비게이터 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '14px' }}>
        <button onClick={() => moveMonth(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#89CFF0', lineHeight: 1 }}>‹</button>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a3a5c', minWidth: '110px', textAlign: 'center' }}>{ymLabel}</span>
        <button onClick={() => moveMonth(1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#89CFF0', lineHeight: 1 }}>›</button>
        {loading && <span style={{ fontSize: '11px', color: '#9aa0a6' }}>조회 중…</span>}
      </div>

      {/* 공용 통장 카드 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {sharedAccounts.map(acc => {
          const accName = acc.name;

          // 이체 입금: 이 통장으로 들어온 이체 (INCOME side)
          const xferIn = allEntries.filter(e => isXferEntry(e) && e.entryType === 'INCOME' && e.account === accName);
          // 이체 출금: 이 통장에서 나간 이체 (EXPENSE side)
          const xferOut = allEntries.filter(e => isXferEntry(e) && e.entryType === 'EXPENSE' && e.account === accName);
          // 사용 이력: 이 통장에서 실제 지출 (비이체 지출)
          const usages = allEntries.filter(e =>
            !isXferEntry(e) && e.entryType === 'EXPENSE' &&
            (e.account === accName || e.accountMain === accName),
          );

          const totalIn   = xferIn.reduce((s, e) => s + e.amount, 0);
          const totalOut  = xferOut.reduce((s, e) => s + e.amount, 0);
          const totalUsed = usages.reduce((s, e) => s + e.amount, 0);
          const balance   = totalIn - totalOut - totalUsed;

          const isExpanded = expandedAcc === accName;
          const histTab    = accHistTabs[accName] ?? 'transfer';

          // 이체 이력: 입금 + 출금 합쳐서 날짜 내림차순
          const allXfers     = [...xferIn, ...xferOut].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
          const sortedUsages = [...usages].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
          const hasData      = totalIn > 0 || totalOut > 0 || totalUsed > 0;

          return (
            <div key={accName} style={{
              background: '#fff',
              border: `1px solid ${isExpanded ? '#89CFF0' : '#e8ecf0'}`,
              borderRadius: '12px', overflow: 'hidden',
              boxShadow: isExpanded ? '0 0 0 2px #89CFF030' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'box-shadow 0.15s, border-color 0.15s',
            }}>
              {/* 카드 헤더 */}
              <div
                onClick={() => setExpandedAcc(isExpanded ? null : accName)}
                style={{
                  padding: '12px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: isExpanded ? '#f0f8fd' : '#fff',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#1a3a5c', fontSize: '14px', marginBottom: '8px' }}>
                    {accName}
                  </div>
                  {hasData ? (
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: '#5f6368' }}>
                      <span>이체 입금 <strong style={{ color: '#2e7d32' }}>+{formatAmountShort(totalIn)}</strong></span>
                      {totalOut > 0 && (
                        <span>이체 출금 <strong style={{ color: '#e65100' }}>-{formatAmountShort(totalOut)}</strong></span>
                      )}
                      <span>사용 <strong style={{ color: '#E06060' }}>-{formatAmountShort(totalUsed)}</strong></span>
                      <span style={{ borderLeft: '1px solid #e0e0e0', paddingLeft: '12px' }}>
                        잔액 <strong style={{ color: balance >= 0 ? '#1565c0' : '#E06060', fontSize: '13px' }}>
                          {balance < 0 ? '-' : ''}{formatAmountShort(Math.abs(balance))}
                        </strong>
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#bbb' }}>{ymLabel} 내역 없음</span>
                  )}
                </div>
                <span style={{
                  fontSize: '14px', color: '#89CFF0', flexShrink: 0,
                  display: 'inline-block',
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s',
                }}>▼</span>
              </div>

              {/* 이력 패널 (펼침) */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #f0f0f0' }}>
                  {/* 탭 */}
                  <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0' }}>
                    {(['transfer', 'usage'] as const).map(t => (
                      <button
                        key={t}
                        onClick={e => { e.stopPropagation(); setAccHistTabs(prev => ({ ...prev, [accName]: t })); }}
                        style={{
                          flex: 1, padding: '10px 8px', border: 'none',
                          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                          background: histTab === t ? '#f0f8fd' : '#fafafa',
                          color: histTab === t ? '#1a3a5c' : '#9aa0a6',
                          borderBottom: histTab === t ? '2px solid #89CFF0' : '2px solid transparent',
                        }}
                      >
                        {t === 'transfer'
                          ? `🔄 이체 이력 (${allXfers.length}건)`
                          : `💳 사용 이력 (${sortedUsages.length}건)`}
                      </button>
                    ))}
                  </div>

                  {/* 이력 목록 */}
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {histTab === 'transfer' ? (
                      allXfers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: '#9aa0a6', fontSize: '12px' }}>이체 내역이 없습니다</div>
                      ) : allXfers.map(e => (
                        <div key={e.id} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '10px 16px', borderBottom: '1px solid #f8f9fa',
                        }}>
                          <span style={{ color: '#9aa0a6', fontSize: '11px', whiteSpace: 'nowrap', minWidth: '30px' }}>{e.entryDate.slice(5)}</span>
                          <span style={{
                            padding: '2px 7px', borderRadius: '8px', fontSize: '10px', fontWeight: 700,
                            background: e.entryType === 'INCOME' ? '#e8f5e9' : '#fff3e0',
                            color: e.entryType === 'INCOME' ? '#2e7d32' : '#e65100',
                            whiteSpace: 'nowrap',
                          }}>
                            {e.entryType === 'INCOME' ? '↓ 입금' : '↑ 출금'}
                          </span>
                          <span style={{ flex: 1, color: '#344054', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.merchant || ''}
                          </span>
                          <span style={{
                            fontSize: '10px', color: '#fff', background: '#89CFF0',
                            padding: '1px 6px', borderRadius: '8px', whiteSpace: 'nowrap',
                          }}>{getUserName(e.userId)}</span>
                          <span style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap',
                            color: e.entryType === 'INCOME' ? '#2e7d32' : '#e65100',
                          }}>
                            {e.entryType === 'INCOME' ? '+' : '-'}{formatAmountShort(e.amount)}
                          </span>
                        </div>
                      ))
                    ) : (
                      sortedUsages.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: '#9aa0a6', fontSize: '12px' }}>사용 내역이 없습니다</div>
                      ) : sortedUsages.map(e => (
                        <div key={e.id} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '10px 16px', borderBottom: '1px solid #f8f9fa',
                        }}>
                          <span style={{ color: '#9aa0a6', fontSize: '11px', whiteSpace: 'nowrap', minWidth: '30px' }}>{e.entryDate.slice(5)}</span>
                          <span style={{
                            padding: '2px 7px', borderRadius: '8px', fontSize: '10px', fontWeight: 700,
                            background: '#fce4ec', color: '#c62828', whiteSpace: 'nowrap',
                          }}>
                            {e.category}
                          </span>
                          <span style={{ flex: 1, color: '#344054', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.merchant || e.memo || '-'}
                          </span>
                          <span style={{
                            fontSize: '10px', color: '#fff', background: '#89CFF0',
                            padding: '1px 6px', borderRadius: '8px', whiteSpace: 'nowrap',
                          }}>{getUserName(e.userId)}</span>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#E06060', whiteSpace: 'nowrap' }}>
                            -{formatAmountShort(e.amount)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── AccountManagementView 메인 컴포넌트 ─────────────────────────

const AccountManagementView: React.FC = () => {
  const totalBudget = ACCOUNT_GROUPS.flatMap(g => g.accounts).reduce((s, a) => s + a.budget, 0);
  const [showCommonCode, setShowCommonCode] = useState(false);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* 전체 월 예산 합계 */}
      <div style={{
        background: '#fff', borderRadius: '12px', padding: '16px 20px',
        marginBottom: '20px', border: '1px solid #dadce0',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#344054' }}>전체 월 예산 합계</span>
        <span style={{ fontSize: '20px', fontWeight: 800, color: '#E06060' }}>
          {formatAmount(totalBudget)}
        </span>
      </div>

      {ACCOUNT_GROUPS.map(group => {
        const groupTotal = group.accounts.reduce((s, a) => s + a.budget, 0);
        const colors = GROUP_COLORS[group.main] ?? { bg: '#f5f5f5', border: '#9aa0a6', text: '#344054' };

        return (
          <div key={group.main} style={{ marginBottom: '28px' }}>
            {/* 대분류 헤더 */}
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: '12px',
              marginBottom: '8px',
            }}>
              <span style={{
                fontSize: '16px', fontWeight: 800, color: colors.text,
                borderBottom: `3px solid ${colors.border}`, paddingBottom: '2px',
              }}>
                {group.main}
              </span>
              <span style={{ fontSize: '12px', color: '#5f6368', fontStyle: 'italic' }}>
                {group.description}
              </span>
            </div>

            {/* 통장 테이블 */}
            <div style={{ overflowX: 'auto' }}>
            <div style={{
              background: '#fff', border: `1px solid ${colors.border}40`,
              borderRadius: '10px', overflow: 'hidden', minWidth: '480px',
            }}>
              {/* 테이블 헤더 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.2fr 3fr 1.5fr',
                background: colors.bg,
                padding: '10px 16px',
                fontSize: '12px', fontWeight: 700, color: colors.text,
                borderBottom: `1px solid ${colors.border}40`,
              }}>
                <span>통장</span>
                <span style={{ textAlign: 'right' }}>예산 금액</span>
                <span style={{ paddingLeft: '16px' }}>통장 항목</span>
                <span style={{ paddingLeft: '16px' }}>은행 / 카드</span>
              </div>

              {/* 통장 행 */}
              {group.accounts.map((acc, i) => (
                <div key={acc.name} style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.2fr 3fr 1.5fr',
                  padding: '12px 16px', fontSize: '13px',
                  borderBottom: i < group.accounts.length - 1 ? '1px solid #f0f0f0' : 'none',
                  alignItems: 'start',
                }}>
                  <span style={{ fontWeight: 600, color: '#344054' }}>{acc.name}</span>
                  <span style={{ textAlign: 'right', fontWeight: 700, color: '#E06060' }}>
                    {formatAmount(acc.budget)}
                  </span>
                  <span style={{ paddingLeft: '16px', color: '#5f6368', lineHeight: 1.6 }}>
                    {acc.items.join(', ')}
                  </span>
                  <span style={{ paddingLeft: '16px', color: '#9aa0a6' }}>
                    {acc.bankName || '-'}
                  </span>
                </div>
              ))}

              {/* 합계 행 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.2fr 3fr 1.5fr',
                padding: '10px 16px',
                background: colors.bg,
                borderTop: `2px solid ${colors.border}60`,
                fontSize: '13px', fontWeight: 700,
              }}>
                <span style={{ color: colors.text }}>합계</span>
                <span style={{ textAlign: 'right', color: '#E06060' }}>{formatAmount(groupTotal)}</span>
                <span style={{ paddingLeft: '16px', color: '#9aa0a6' }}>-</span>
                <span style={{ paddingLeft: '16px', color: '#9aa0a6' }}>-</span>
              </div>
            </div>
            </div> {/* overflowX wrapper */}
          </div>
        );
      })}

      {/* 하단 버튼 행 */}
      <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowCommonCode(true)}
          style={{
            padding: '10px 24px', fontSize: '13px', fontWeight: 600,
            border: '1.5px dashed #b0c4de', borderRadius: '10px',
            background: '#f8fafd', color: '#5f7fa0', cursor: 'pointer',
          }}
        >
          ⚙ 공통코드 관리
        </button>
      </div>

      {/* 공통코드 관리 모달 */}
      {showCommonCode && <CommonCodeModal onClose={() => setShowCommonCode(false)} />}
    </div>
  );
};

export default AccountManagementView;
