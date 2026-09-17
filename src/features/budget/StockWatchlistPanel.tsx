/**
 * StockWatchlistPanel — 주가 알림 감시 종목 관리 패널
 *
 * 기능:
 *  - 종목 추가 인라인 폼 (종목코드, 종목명, Enter/저장 버튼)
 *  - 종목 목록 테이블 (코드/종목명/가격알림%/수급알림억/활성토글/삭제)
 *  - 각 셀 인라인 편집 (클릭 → input, blur/Enter → PATCH)
 *  - "지금 체크" 버튼 (POST /check-now)
 *
 * 스타일: 베이비블루 테마(#89CFF0), BudgetPage 내 다른 View들과 동일한 패턴
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getStockWatchlist,
  addStockWatchlist,
  updateStockWatchlist,
  deleteStockWatchlist,
  checkStockWatchlistNow,
} from '../../services/api';
import { StockWatchlist } from '../../types';

// ── 인라인 편집 셀 상태 타입 ─────────────────────────────────────────────────
type EditingCell = {
  id: number;
  field: 'priceAlertPct' | 'investorAlertAmt';
} | null;

// ── 공통 스타일 상수 ─────────────────────────────────────────────────────────
const BABY_BLUE = '#89CFF0';
const DARK_BLUE = '#1a3a5c';

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  border: '1px solid #e8f0f8',
  padding: '16px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  marginBottom: '12px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#5c6e8a',
  marginBottom: '8px',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid #c8d8e4',
  fontSize: '13px',
  color: DARK_BLUE,
  outline: 'none',
  background: '#f8fbfd',
};

const btnPrimary: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  background: BABY_BLUE,
  color: '#fff',
  fontSize: '13px',
  fontWeight: 600,
};

const btnDanger: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  background: '#fee2e2',
  color: '#b91c1c',
  fontSize: '12px',
  fontWeight: 600,
};

const theadTh: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#5c6e8a',
  background: '#f0f8fd',
  textAlign: 'left',
  borderBottom: '1px solid #e8f0f8',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '13px',
  color: DARK_BLUE,
  borderBottom: '1px solid #f0f4f8',
  verticalAlign: 'middle',
};

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────
const StockWatchlistPanel: React.FC = () => {
  // 목록 상태
  const [list, setList] = useState<StockWatchlist[]>([]);
  const [loading, setLoading] = useState(false);

  // 추가 폼 상태
  const [addCode, setAddCode] = useState('');
  const [addName, setAddName] = useState('');
  const [addPct, setAddPct] = useState('3');
  const [addAmt, setAddAmt] = useState('50');
  const [adding, setAdding] = useState(false);

  // 인라인 편집 상태 — 어떤 셀이 편집 중인지 추적
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // 즉시 체크 상태
  const [checking, setChecking] = useState(false);

  // ── 목록 로드 ─────────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStockWatchlist();
      setList(data);
    } catch (e) {
      console.error('감시 종목 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // 편집 셀 열릴 때 input에 포커스
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // ── 종목 추가 ─────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    const code = addCode.trim().toUpperCase();
    const name = addName.trim();
    if (!code || !name) {
      alert('종목코드와 종목명을 모두 입력해 주세요.');
      return;
    }
    setAdding(true);
    try {
      const created = await addStockWatchlist({
        stock_code: code,
        stock_name: name,
        price_alert_pct: parseFloat(addPct) || 3,
        investor_alert_amt: parseFloat(addAmt) || 50,
      });
      setList(prev => [...prev, created]);
      setAddCode('');
      setAddName('');
      setAddPct('3');
      setAddAmt('50');
    } catch (e: any) {
      const msg = e?.response?.data?.detail || '종목 추가에 실패했습니다.';
      alert(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  // ── 활성 토글 ─────────────────────────────────────────────────────────────
  const handleToggleActive = async (item: StockWatchlist) => {
    try {
      const updated = await updateStockWatchlist(item.id, { is_active: !item.isActive });
      setList(prev => prev.map(i => (i.id === updated.id ? updated : i)));
    } catch (e) {
      console.error('활성 토글 실패:', e);
    }
  };

  // ── 삭제 ──────────────────────────────────────────────────────────────────
  const handleDelete = async (item: StockWatchlist) => {
    if (!window.confirm(`"${item.stockName}" 감시 종목을 삭제할까요?`)) return;
    try {
      await deleteStockWatchlist(item.id);
      setList(prev => prev.filter(i => i.id !== item.id));
    } catch (e) {
      console.error('삭제 실패:', e);
    }
  };

  // ── 셀 인라인 편집 ────────────────────────────────────────────────────────
  const openCell = (item: StockWatchlist, field: 'priceAlertPct' | 'investorAlertAmt') => {
    setEditingCell({ id: item.id, field });
    setEditValue(String(field === 'priceAlertPct' ? item.priceAlertPct : item.investorAlertAmt));
  };

  const saveCell = async () => {
    if (!editingCell) return;
    const val = parseFloat(editValue);
    if (isNaN(val) || val <= 0) {
      setEditingCell(null);
      return;
    }
    const patch =
      editingCell.field === 'priceAlertPct'
        ? { price_alert_pct: val }
        : { investor_alert_amt: val };
    try {
      const updated = await updateStockWatchlist(editingCell.id, patch);
      setList(prev => prev.map(i => (i.id === updated.id ? updated : i)));
    } catch (e) {
      console.error('셀 수정 실패:', e);
    } finally {
      setEditingCell(null);
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveCell();
    if (e.key === 'Escape') setEditingCell(null);
  };

  // ── 즉시 체크 ─────────────────────────────────────────────────────────────
  const handleCheckNow = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await checkStockWatchlistNow();
      alert('알림 체크를 시작했습니다. (백그라운드 실행)');
    } catch (e) {
      alert('알림 체크 요청에 실패했습니다.');
    } finally {
      setChecking(false);
    }
  };

  // ── 셀 렌더 헬퍼 ──────────────────────────────────────────────────────────
  const renderEditableCell = (
    item: StockWatchlist,
    field: 'priceAlertPct' | 'investorAlertAmt',
    suffix: string,
  ) => {
    const isEditing = editingCell?.id === item.id && editingCell.field === field;
    const value = field === 'priceAlertPct' ? item.priceAlertPct : item.investorAlertAmt;

    if (isEditing) {
      return (
        <input
          ref={editInputRef}
          type="number"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={saveCell}
          onKeyDown={handleCellKeyDown}
          style={{ ...inputStyle, width: '60px', padding: '3px 6px', fontSize: '12px' }}
        />
      );
    }
    return (
      <span
        onClick={() => openCell(item, field)}
        style={{
          cursor: 'pointer',
          borderBottom: '1px dashed #c8d8e4',
          paddingBottom: '1px',
          fontSize: '13px',
          color: DARK_BLUE,
        }}
        title="클릭하여 편집"
      >
        {value}{suffix}
      </span>
    );
  };

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>
      {/* 제목 */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: DARK_BLUE, margin: 0 }}>
          📡 주가 알림 감시 종목
        </h2>
        <p style={{ fontSize: '12px', color: '#8a9ab8', marginTop: '4px' }}>
          장중 5분마다 가격 알림 (시가 대비 ±%), 매일 15:40 수급 알림 (외국인/기관 순매수·순매도)을 텔레그램으로 발송합니다.
        </p>
      </div>

      {/* 종목 추가 폼 */}
      <div style={cardStyle}>
        <div style={labelStyle}>+ 종목 추가</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 종목코드 */}
          <input
            type="text"
            placeholder="종목코드 (예: 005930)"
            value={addCode}
            onChange={e => setAddCode(e.target.value.toUpperCase())}
            onKeyDown={handleAddKeyDown}
            style={{ ...inputStyle, width: '150px' }}
          />
          {/* 종목명 */}
          <input
            type="text"
            placeholder="종목명 (예: 삼성전자)"
            value={addName}
            onChange={e => setAddName(e.target.value)}
            onKeyDown={handleAddKeyDown}
            style={{ ...inputStyle, width: '150px' }}
          />
          {/* 가격 알림 기준 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="number"
              placeholder="가격알림%"
              value={addPct}
              onChange={e => setAddPct(e.target.value)}
              onKeyDown={handleAddKeyDown}
              style={{ ...inputStyle, width: '80px' }}
              min="0.1"
              step="0.5"
            />
            <span style={{ fontSize: '12px', color: '#8a9ab8' }}>%</span>
          </div>
          {/* 수급 알림 기준 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="number"
              placeholder="수급알림억"
              value={addAmt}
              onChange={e => setAddAmt(e.target.value)}
              onKeyDown={handleAddKeyDown}
              style={{ ...inputStyle, width: '80px' }}
              min="1"
              step="10"
            />
            <span style={{ fontSize: '12px', color: '#8a9ab8' }}>억</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={adding}
            style={{ ...btnPrimary, opacity: adding ? 0.6 : 1 }}
          >
            {adding ? '추가 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 목록 테이블 */}
      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: '12px' }}>
          감시 종목 목록 ({list.length}개)
        </div>
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#8a9ab8', fontSize: '13px' }}>
            로딩 중...
          </div>
        ) : list.length === 0 ? (
          <div style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: '#8a9ab8',
            fontSize: '14px',
          }}>
            감시할 종목을 추가해 주세요.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={theadTh}>종목코드</th>
                  <th style={theadTh}>종목명</th>
                  <th style={{ ...theadTh, textAlign: 'center' }}>
                    가격알림
                    <br />
                    <span style={{ fontSize: '10px', fontWeight: 400, color: '#9ab0c4' }}>
                      시가 대비 %
                    </span>
                  </th>
                  <th style={{ ...theadTh, textAlign: 'center' }}>
                    수급알림
                    <br />
                    <span style={{ fontSize: '10px', fontWeight: 400, color: '#9ab0c4' }}>
                      외국인/기관 순매수·순매도 억원
                    </span>
                  </th>
                  <th style={{ ...theadTh, textAlign: 'center' }}>활성</th>
                  <th style={{ ...theadTh, textAlign: 'center' }}>삭제</th>
                </tr>
              </thead>
              <tbody>
                {list.map(item => (
                  <tr
                    key={item.id}
                    style={{
                      background: item.isActive ? '#fff' : '#f8f9fa',
                      opacity: item.isActive ? 1 : 0.55,
                    }}
                  >
                    {/* 종목코드 */}
                    <td style={tdStyle}>
                      <span style={{
                        fontFamily: 'monospace',
                        background: '#eef5ff',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '12px',
                        color: '#1a3a5c',
                      }}>
                        {item.stockCode}
                      </span>
                    </td>
                    {/* 종목명 */}
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{item.stockName}</span>
                    </td>
                    {/* 가격 알림 % — 클릭 편집 */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {renderEditableCell(item, 'priceAlertPct', '%')}
                    </td>
                    {/* 수급 알림 억 — 클릭 편집 */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {renderEditableCell(item, 'investorAlertAmt', '억')}
                    </td>
                    {/* 활성 토글 */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        onClick={() => handleToggleActive(item)}
                        style={{
                          padding: '3px 12px',
                          borderRadius: '20px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: item.isActive ? '#dcfce7' : '#f1f5f9',
                          color: item.isActive ? '#166534' : '#64748b',
                          transition: 'background 0.15s',
                        }}
                      >
                        {item.isActive ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    {/* 삭제 */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        onClick={() => handleDelete(item)}
                        style={btnDanger}
                        title="감시 종목 삭제"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 하단: 즉시 체크 버튼 + 안내 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '8px 0',
      }}>
        <p style={{ fontSize: '11px', color: '#9ab0c4', margin: 0 }}>
          💡 가격알림%/수급알림억 셀을 클릭하면 바로 편집할 수 있습니다.
        </p>
        <button
          onClick={handleCheckNow}
          disabled={checking}
          style={{
            ...btnPrimary,
            background: checking ? '#c8e8f5' : '#4baad4',
            opacity: checking ? 0.7 : 1,
          }}
        >
          {checking ? '체크 중...' : '📡 지금 체크'}
        </button>
      </div>
    </div>
  );
};

export default StockWatchlistPanel;
