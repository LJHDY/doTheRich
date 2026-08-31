// ─── 자산 관리 뷰 (스냅샷 기반) ──────────────────────────────────────────────
// BudgetPage의 ASSETS 탭에서 렌더링
// 현황(날짜별 셀 편집) / 이력(날짜 목록) / 그래프(LineChart) 서브탭 포함
// AssetDetailModal, AssetCell 헬퍼 컴포넌트 포함
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  ASSET_COLUMNS,
  ASSET_LIQUIDITY_COLORS,
  BUDGET_USERS,
  buildAssetCellCode,
} from './budgetConstants';
import {
  getAllAssetSnapshots,
  upsertAssetSnapshotCell,
  copyAssetSnapshot,
  deleteAssetSnapshotDate,
  getAssetSnapshotDetails,
  bulkSaveAssetSnapshotDetails,
  getMarketReports,
  getCommonCodes,
} from '../../services/api';
import {
  AssetSnapshotCell,
  AssetSnapshotDetail,
  CommonCode,
  formatAmount,
  formatAmountShort,
} from '../../types';

// ─── 로컬 상수/유틸 ──────────────────────────────────────────────────────────

// 달러 현금 USD → KRW 환산 환율 localStorage 키 (MarketReport 자동 업데이트 연동)
const EXCHANGE_RATE_KEY = 'asset_exchange_rate';

// 오늘 날짜 (ISO YYYY-MM-DD)
const today = () => new Date().toISOString().slice(0, 10);

/** 원 단위 금액을 한글로 표기 — 예: 1500000 → "150만", 150000000 → "1억 5000만" */
const formatAmountKorean = (won: number): string => {
  if (!won || won <= 0) return '';
  const uk = Math.floor(won / 1e8);
  const man = Math.floor((won % 1e8) / 1e4);
  const remainder = won % 1e4;
  const parts: string[] = [];
  if (uk > 0) parts.push(`${uk}억`);
  if (man > 0) parts.push(`${man}만`);
  if (remainder > 0) parts.push(`${remainder}원`);
  return parts.join(' ');
};

/** 버튼 공통 스타일 헬퍼 */
const btnStyle = (bg: string, color: string): React.CSSProperties => ({
  padding: '6px 12px', fontSize: '12px', fontWeight: 600,
  borderRadius: '6px', border: 'none', background: bg, color,
  cursor: 'pointer',
});

// ─── 타입 ────────────────────────────────────────────────────────────────────

type AssetSubTab = 'CURRENT' | 'HISTORY' | 'CHART';

type LocalDetail = {
  key: string;
  userId: string;
  assetType: string;
  accountName: string;
  amountStr: string; // 원(또는 USD) 단위 입력값
};

// ─── AssetCell — 셀 단위 편집 컴포넌트 ──────────────────────────────────────

const AssetCell: React.FC<{
  value: number;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  accentColor: string;
  isDollar?: boolean;
  exchangeRate?: number;
  onDetailClick?: () => void;
}> = ({ value, isEditing, editValue, onStartEdit, onEditChange, onSave, onCancel, saving, accentColor, isDollar, exchangeRate, onDetailClick }) => {
  if (isEditing) {
    // USD: 소수점 허용 / 원화: 정수만, 콤마 구분 합산 입력 지원
    const parts = isDollar
      ? editValue.split(',').map(s => Number(s.trim().replace(/[^0-9.]/g, '')) || 0)
      : editValue.split(',').map(s => Number(s.trim().replace(/[^0-9]/g, '')) || 0);
    const previewSum = parts.reduce((a, b) => a + b, 0);
    const showPreview = editValue.includes(',') && previewSum > 0;
    const krwPreview = isDollar && exchangeRate ? Math.round(previewSum * exchangeRate) : null;

    return (
      <div style={{ padding: '4px 8px' }}>
        <input
          type="text"
          value={editValue} autoFocus placeholder={isDollar ? '$금액' : '숫자, 숫자, ...'}
          onChange={e => onEditChange(e.target.value.replace(isDollar ? /[^0-9.,\s]/g : /[^0-9,\s]/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          onBlur={onSave}
          style={{
            width: '100%', padding: '4px 8px', fontSize: '12px',
            border: `2px solid ${accentColor}`, borderRadius: '6px',
            textAlign: 'right', outline: 'none', boxSizing: 'border-box',
          }}
          disabled={saving}
        />
        {showPreview && (
          <div style={{ fontSize: '11px', color: accentColor, textAlign: 'right', marginTop: '2px', fontWeight: 700 }}>
            = {isDollar ? `$${previewSum.toLocaleString('ko-KR')}` : previewSum.toLocaleString('ko-KR')}
            {krwPreview ? ` (≈${krwPreview.toLocaleString('ko-KR')}원)` : ''}
          </div>
        )}
      </div>
    );
  }

  // 세부 내역 버튼 (항상 우측 하단에 작게 표시)
  const detailBtn = onDetailClick ? (
    <button
      onClick={e => { e.stopPropagation(); onDetailClick(); }}
      title="세부 내역"
      style={{
        border: 'none', background: 'none', cursor: 'pointer',
        fontSize: '11px', color: '#c0cfe0', padding: '0 2px', lineHeight: 1,
        flexShrink: 0, userSelect: 'none',
      }}
    >≡</button>
  ) : null;

  // 달러 셀: USD 금액 + KRW 환산 부기 표시
  if (isDollar && value > 0 && exchangeRate) {
    const krw = Math.round(value * exchangeRate);
    return (
      <div
        title="클릭하여 수정 (USD 입력)"
        style={{
          padding: '6px 16px 6px 8px', display: 'flex', alignItems: 'center', gap: '4px',
          userSelect: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f0f8fd')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div onClick={onStartEdit} style={{ flex: 1, textAlign: 'right', cursor: 'pointer' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#344054' }}>
            ${value.toLocaleString('ko-KR')}
          </div>
          <div style={{ fontSize: '10px', color: '#9aa0a6' }}>
            ≈ {krw.toLocaleString('ko-KR')}원
          </div>
        </div>
        {detailBtn}
      </div>
    );
  }

  return (
    <div
      title="클릭하여 수정"
      style={{
        padding: '0 8px 0 16px', display: 'flex', alignItems: 'center', gap: '4px',
        userSelect: 'none', minHeight: '42px',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f0f8fd')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        onClick={onStartEdit}
        style={{ flex: 1, textAlign: 'right', cursor: 'pointer', fontSize: '13px', color: value === 0 ? '#d0d5dd' : '#344054' }}
      >
        {value === 0 ? '—' : formatAmountShort(value)}
      </span>
      {detailBtn}
    </div>
  );
};

// ─── AssetDetailModal — 셀별 세부 내역 모달 ─────────────────────────────────

const AssetDetailModal: React.FC<{
  snapshotDate: string;
  userId: string;
  assetType: string;
  userName: string;
  assetLabel: string;
  cellCode: string;          // 공통코드 복합키 — ASSET_CELL 그룹의 detail_code (예: STOCK_LDY)
  assetCellCodes: CommonCode[]; // 상위(AssetView)에서 1회 조회 후 주입 — 모달 열 때마다 재조회 방지
  isDollar?: boolean;        // true이면 USD 단위 입력·표시
  exchangeRate?: number;     // USD → KRW 환산 (isDollar=true 시 필수)
  onClose: () => void;
  onSaved: () => void;
}> = ({ snapshotDate, userId, assetType, userName, assetLabel, cellCode, assetCellCodes, isDollar, exchangeRate, onClose, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 이 셀의 편집 가능 항목 (원 단위 입력)
  const [cellItems, setCellItems] = useState<LocalDetail[]>([]);
  // 이 셀에 매핑된 공통코드 정보 (ASSET_CELL 그룹)
  const [cellCommonCode, setCellCommonCode] = useState<CommonCode | null>(null);

  useEffect(() => {
    // 세부 내역 조회 후 공통코드(상위 주입)와 머징
    getAssetSnapshotDetails(snapshotDate).then(detailData => {
      // 공통코드: ASSET_CELL 그룹에서 detail_code === cellCode 매칭
      const cc = assetCellCodes.find(c => c.detailCode === cellCode) ?? null;
      setCellCommonCode(cc);

      // 이 셀의 기존 저장 데이터
      const savedItems = detailData.filter(d => d.userId === userId && d.assetType === assetType);
      // accountName → 저장 데이터 맵 (금액 조회용)
      const savedMap = new Map(savedItems.map(d => [d.accountName, d]));

      if (cc?.detailCodeName) {
        // 공통코드 detail_code_name을 ','로 split → 템플릿 계좌명 목록
        const templateNames = cc.detailCodeName.split(',').map(n => n.trim()).filter(Boolean);

        // 템플릿 순서대로 행 생성, 기존 저장 금액이 있으면 매핑
        const templateItems: LocalDetail[] = templateNames.map(name => {
          const saved = savedMap.get(name);
          return {
            key: saved ? String(saved.id) : `new-${name}-${Date.now()}-${Math.random()}`,
            userId,
            assetType,
            accountName: name,
            amountStr: saved && saved.amount > 0 ? String(saved.amount) : '',
          };
        });

        // 템플릿에 없는 추가 저장 항목도 유지 (수동 추가분)
        const templateNameSet = new Set(templateNames);
        const extraItems: LocalDetail[] = savedItems
          .filter(d => !templateNameSet.has(d.accountName))
          .map(d => ({
            key: String(d.id),
            userId,
            assetType,
            accountName: d.accountName,
            amountStr: d.amount > 0 ? String(d.amount) : '',
          }));

        setCellItems([...templateItems, ...extraItems]);
      } else {
        // 공통코드 미등록 시 기존 방식 그대로
        setCellItems(
          savedItems.map(d => ({
            key: String(d.id),
            userId: d.userId,
            assetType: d.assetType,
            accountName: d.accountName,
            amountStr: d.amount > 0 ? String(d.amount) : '',
          }))
        );
      }

      setLoading(false);
    });
  }, [snapshotDate, userId, assetType, cellCode, assetCellCodes]);

  const addItem = () => setCellItems(prev => [...prev, {
    key: `new-${Date.now()}-${Math.random()}`,
    userId, assetType, accountName: '', amountStr: '',
  }]);

  const removeItem = (key: string) => setCellItems(prev => prev.filter(i => i.key !== key));

  const updateItem = (key: string, field: 'accountName' | 'amountStr', value: string) =>
    setCellItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i));

  // 현재 셀 합산 (원 단위) — 실시간 미리보기
  const total = useMemo(
    () => cellItems.reduce((s, i) => s + (Number(i.amountStr.replace(/,/g, '')) || 0), 0),
    [cellItems]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      // 이 셀(userId+assetType)의 항목만 전송 — 백엔드가 해당 조합만 삭제·재삽입
      // 다른 유저 데이터는 건드리지 않아 동시 저장 시 충돌 없음
      const thisPayload = cellItems
        .filter(i => Number(i.amountStr.replace(/,/g, '')) > 0)
        .map(i => ({
          userId: i.userId, assetType: i.assetType,
          accountName: i.accountName.trim(),
          amount: Number(i.amountStr.replace(/,/g, '')) || 0,
        }));
      await bulkSaveAssetSnapshotDetails(snapshotDate, userId, assetType, thisPayload);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: '16px',
        width: '440px', maxWidth: '96vw',
        maxHeight: '72vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #e8ecf0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c' }}>📋 {assetLabel}</span>
            <span style={{ fontSize: '12px', color: '#4BAAD4', marginLeft: '8px', fontWeight: 600 }}>{userName}</span>
            <span style={{ fontSize: '11px', color: '#9aa0a6', marginLeft: '6px' }}>{snapshotDate}</span>
            {/* 공통코드 표시 — ASSET_CELL 그룹에 등록된 경우에만 */}
            {cellCommonCode && (
              <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', background: '#e8f0fe', color: '#1565c0', borderRadius: '4px', padding: '1px 6px', fontWeight: 700 }}>
                  {cellCommonCode.detailCode}
                </span>
                <span style={{ fontSize: '11px', color: '#5f6368' }}>{cellCommonCode.detailCodeName}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6', lineHeight: 1 }}>×</button>
        </div>

        {/* 안내 */}
        <div style={{ padding: '7px 20px', background: '#f0f8fd', borderBottom: '1px solid #e8ecf0', flexShrink: 0, fontSize: '11px', color: '#4BAAD4' }}>
          금액 단위: <strong>{isDollar ? 'USD ($)' : '원'}</strong>
          {isDollar && exchangeRate && <span style={{ marginLeft: '6px', color: '#9aa0a6' }}>· 환율 {exchangeRate.toLocaleString()}원/$</span>}
          <span style={{ marginLeft: '6px' }}>· 저장 시 합산이 자산 현황에 자동 반영됩니다</span>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 10px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6' }}>불러오는 중…</div>
          ) : (
            <>
              {/* 세부 항목 목록 */}
              {cellItems.map(item => (
                <div key={item.key} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="계좌명"
                    value={item.accountName}
                    onChange={e => updateItem(item.key, 'accountName', e.target.value)}
                    style={{ flex: 2, padding: '6px 10px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '6px', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {isDollar && <span style={{ fontSize: '13px', color: '#5f6368', fontWeight: 600 }}>$</span>}
                      <input
                        type="text"
                        placeholder={isDollar ? '달러 금액' : '금액'}
                        value={item.amountStr}
                        onChange={e => updateItem(item.key, 'amountStr', e.target.value.replace(/[^0-9.]/g, ''))}
                        style={{ width: '110px', padding: '6px 10px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '6px', outline: 'none', textAlign: 'right' }}
                      />
                      {!isDollar && <span style={{ fontSize: '11px', color: '#9aa0a6', whiteSpace: 'nowrap' }}>원</span>}
                    </div>
                    {Number(item.amountStr) > 0 && isDollar && exchangeRate && (
                      <span style={{ fontSize: '10px', color: '#4BAAD4', fontWeight: 600 }}>
                        ≈ {formatAmountKorean(Math.round(Number(item.amountStr) * exchangeRate))}
                      </span>
                    )}
                    {Number(item.amountStr) > 0 && !isDollar && (
                      <span style={{ fontSize: '10px', color: '#4BAAD4', fontWeight: 600 }}>{formatAmountKorean(Number(item.amountStr))}</span>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.key)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#bdbdbd', fontSize: '18px', padding: '0 2px', lineHeight: 1 }}
                  >×</button>
                </div>
              ))}

              {/* + 항목 추가 */}
              <button
                onClick={addItem}
                style={{ width: '100%', padding: '8px', fontSize: '12px', border: '1px dashed #89CFF0', borderRadius: '6px', background: 'transparent', color: '#4BAAD4', cursor: 'pointer', marginTop: '4px' }}
              >
                + 항목 추가
              </button>

              {/* 합산 미리보기 */}
              {total > 0 && (
                <div style={{ marginTop: '12px', padding: '8px 12px', background: '#f0f8fd', borderRadius: '8px', fontSize: '13px', textAlign: 'right', color: '#1a3a5c', fontWeight: 700 }}>
                  {isDollar ? (
                    <>
                      합계: ${total.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                      {exchangeRate && <span style={{ fontSize: '11px', color: '#5f6368', fontWeight: 400, marginLeft: '8px' }}>≈ {formatAmountKorean(Math.round(total * exchangeRate))}</span>}
                    </>
                  ) : (
                    <>합계: {total.toLocaleString('ko-KR')} 원</>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #e8ecf0',
          display: 'flex', gap: '8px', justifyContent: 'flex-end', flexShrink: 0,
          background: '#fafbfc',
        }}>
          <button onClick={onClose} style={{ ...btnStyle('#f0f4f8', '#5f6368'), padding: '8px 20px' }}>취소</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...btnStyle('#1a3a5c', '#fff'), padding: '8px 20px', fontWeight: 700 }}
          >
            {saving ? '저장 중…' : '저장 · 합산 반영'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── AssetView — 자산 관리 뷰 메인 컴포넌트 ─────────────────────────────────

const AssetView: React.FC = () => {
  const isMobile = useIsMobile();
  const [allSnapshots, setAllSnapshots] = useState<AssetSnapshotCell[]>([]);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState<AssetSubTab>('CURRENT');
  const [selectedDate, setSelectedDate] = useState<string>(today());
  // 환율 (달러 현금 USD → KRW 환산, localStorage 저장)
  const [exchangeRate, setExchangeRate] = useState<number>(
    () => Number(localStorage.getItem(EXCHANGE_RATE_KEY) || '0') || 1450
  );
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [editingCell, setEditingCell] = useState<{ userId: string; assetKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  // 셀별 세부 내역 모달 대상 (null=닫힘)
  const [detailTarget, setDetailTarget] = useState<{ userId: string; assetType: string; userName: string; assetLabel: string; cellCode: string } | null>(null);
  // ASSET_CELL 공통코드 — 마운트 시 1회 조회, AssetDetailModal에 주입
  const [assetCellCodes, setAssetCellCodes] = useState<CommonCode[]>([]);
  // 자동 환율: 가장 최신 국내장마감 리포트의 usdkrw 값
  const [autoRateDate, setAutoRateDate] = useState<string | null>(null);

  useEffect(() => {
    getCommonCodes('ASSET_CELL').then(setAssetCellCodes);
  }, []);

  // 마운트 시 최신 국내장마감 리포트에서 환율 자동 반영
  useEffect(() => {
    getMarketReports().then(reports => {
      const latest = reports.find(r => r.reportType === 'kr_close' && r.marketData?.usdkrw?.close);
      if (!latest) return;
      const rate = Math.round(latest.marketData.usdkrw.close);
      if (rate > 0) {
        setExchangeRate(rate);
        localStorage.setItem(EXCHANGE_RATE_KEY, String(rate));
        setAutoRateDate(latest.reportDate);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllAssetSnapshots();
      setAllSnapshots(data);
      // 최신 날짜를 기본 선택 (오늘 날짜에 데이터 없으면 최신 날짜로)
      const existingDates = Array.from(new Set(data.map(s => s.snapshotDate))).sort().reverse();
      if (existingDates.length > 0 && !data.some(s => s.snapshotDate === today())) {
        setSelectedDate(existingDates[0]);
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // 날짜 목록 (최신순)
  const dates = useMemo(() =>
    Array.from(new Set(allSnapshots.map(s => s.snapshotDate))).sort().reverse(),
    [allSnapshots]
  );

  // cellMap[date][userId][assetType] = amount
  const cellMap = useMemo(() => {
    const m: Record<string, Record<string, Record<string, number>>> = {};
    allSnapshots.forEach(s => {
      if (!m[s.snapshotDate]) m[s.snapshotDate] = {};
      if (!m[s.snapshotDate][s.userId]) m[s.snapshotDate][s.userId] = {};
      m[s.snapshotDate][s.userId][s.assetType] = s.amount;
    });
    return m;
  }, [allSnapshots]);

  const getAmt = (date: string, userId: string, key: string) =>
    cellMap[date]?.[userId]?.[key] ?? 0;

  // USD 컬럼(미국주식·달러 현금) → KRW 환산, 그 외 원화 그대로
  const isUsdCol = (key: string) => ASSET_COLUMNS.find(c => c.key === key)?.isDollar === true;
  const toKrw = (assetType: string, amount: number) =>
    isUsdCol(assetType) ? Math.round(amount * exchangeRate) : amount;

  const getKrw = (date: string, userId: string, key: string) =>
    toKrw(key, getAmt(date, userId, key));

  const [u0, u1] = BUDGET_USERS;
  const GROUPS = ['즉시 사용 가능', '즉시 사용 불가'] as const;

  const groupKrw = (date: string, group: string, userId: string) =>
    ASSET_COLUMNS.filter(c => c.group === group).reduce((s, c) => s + getKrw(date, userId, c.key), 0);

  const grandKrw = (date: string, userId: string) =>
    ASSET_COLUMNS.reduce((s, c) => s + getKrw(date, userId, c.key), 0);

  // 셀 편집 시작
  const startEdit = (userId: string, key: string) => {
    const amt = getAmt(selectedDate, userId, key);
    setEditingCell({ userId, assetKey: key });
    setEditValue(amt === 0 ? '' : String(amt));
  };

  // 셀 저장 (upsert to snapshot)
  const saveEdit = async () => {
    if (!editingCell || saving) return;
    const { userId, assetKey } = editingCell;
    const isDollarCell = ASSET_COLUMNS.find(c => c.key === assetKey)?.isDollar === true;
    const amount = editValue
      .split(',')
      .map(s => Number(s.trim().replace(isDollarCell ? /[^0-9.]/g : /[^0-9]/g, '')) || 0)
      .reduce((a, b) => a + b, 0);
    setSaving(true);
    try {
      const cell = await upsertAssetSnapshotCell({
        userId, snapshotDate: selectedDate, assetType: assetKey, amount,
      });
      setAllSnapshots(prev => {
        const idx = prev.findIndex(
          s => s.userId === userId && s.snapshotDate === selectedDate && s.assetType === assetKey
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = cell;
          return next;
        }
        return [...prev, cell];
      });
    } catch { alert('저장에 실패했습니다'); }
    finally { setSaving(false); setEditingCell(null); }
  };

  // 이전 최신 날짜에서 복사
  const handleCopyFromLatest = async () => {
    if (!dates.length) return;
    const fromDate = dates[0];
    try {
      const copied = (await Promise.all(
        BUDGET_USERS.map(u => copyAssetSnapshot(u.id, fromDate, selectedDate))
      )).flat();
      setAllSnapshots(prev => [
        ...prev.filter(s => s.snapshotDate !== selectedDate),
        ...copied,
      ]);
    } catch { alert('복사에 실패했습니다'); }
  };

  // 선택 날짜 스냅샷 삭제
  const handleDeleteDate = async () => {
    if (!window.confirm(`${selectedDate} 스냅샷을 삭제할까요?`)) return;
    try {
      await Promise.all(BUDGET_USERS.map(u => deleteAssetSnapshotDate(u.id, selectedDate)));
      setAllSnapshots(prev => prev.filter(s => s.snapshotDate !== selectedDate));
      const next = dates.filter(d => d !== selectedDate);
      if (next.length > 0) setSelectedDate(next[0]);
    } catch { alert('삭제에 실패했습니다'); }
  };

  // 환율 저장
  const saveRate = () => {
    const r = Number(rateInput.replace(/[^0-9]/g, ''));
    if (r > 0) {
      setExchangeRate(r);
      localStorage.setItem(EXCHANGE_RATE_KEY, String(r));
    }
    setEditingRate(false);
  };

  const COLS: React.CSSProperties = { gridTemplateColumns: '1.6fr 1fr 1fr 1fr' };
  const hasData = dates.includes(selectedDate);
  const gt0 = grandKrw(selectedDate, u0.id);
  const gt1 = grandKrw(selectedDate, u1.id);
  const gtSum = gt0 + gt1;

  // ── 그래프 옵션 상태 ──────────────────────────────────────────────────
  const [chartMode, setChartMode] = useState<'USER' | 'LIQUIDITY' | 'DETAIL'>('USER');
  // 제외할 자산 항목 키 (기본: 보증금·퇴직금·주택청약저축 — 변동이 적어 그래프 왜곡 유발)
  const [chartExcludeKeys, setChartExcludeKeys] = useState<Set<string>>(
    new Set(['보증금', '퇴직금', '주택청약저축'])
  );
  const toggleChartExclude = (key: string) =>
    setChartExcludeKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  // 유저별 모드에서 개인 라인 표시 여부 (false = 합산만)
  const [chartShowSplit, setChartShowSplit] = useState(true);

  // ── 세부 항목별 그래프 상태 ───────────────────────────────────────────
  const [detailChartAsset, setDetailChartAsset] = useState<string>('주식');
  const [detailChartUser, setDetailChartUser] = useState<string>('all'); // 'all' | userId
  const [allDetails, setAllDetails] = useState<Map<string, AssetSnapshotDetail[]>>(new Map());
  const [detailsLoading, setDetailsLoading] = useState(false);

  // DETAIL 모드 진입 시 모든 날짜의 세부 내역 일괄 병렬 조회
  useEffect(() => {
    if (chartMode !== 'DETAIL' || dates.length === 0) return;
    setDetailsLoading(true);
    Promise.all(dates.map(d =>
      getAssetSnapshotDetails(d).then(rows => [d, rows] as [string, AssetSnapshotDetail[]])
    ))
      .then(pairs => setAllDetails(new Map(pairs)))
      .catch(() => {})
      .finally(() => setDetailsLoading(false));
  }, [chartMode, dates]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 차트 데이터 계산 — 원 단위로 저장해 tooltip 정확도 유지 ───────────
  const chartDataByUser = useMemo(() => {
    const toKrwLocal = (assetType: string, amount: number) =>
      ASSET_COLUMNS.find(c => c.key === assetType)?.isDollar ? Math.round(amount * exchangeRate) : amount;
    const cols = ASSET_COLUMNS.filter(c => !chartExcludeKeys.has(c.key));
    const grandKrwLocal = (date: string, userId: string) =>
      cols.reduce((s, c) => s + toKrwLocal(c.key, cellMap[date]?.[userId]?.[c.key] ?? 0), 0);
    return [...dates].reverse().map(date => {
      const v0 = grandKrwLocal(date, u0.id);
      const v1 = grandKrwLocal(date, u1.id);
      return {
        label: date.slice(5),
        fullDate: date,
        [u0.name]: Math.round(v0),
        [u1.name]: Math.round(v1),
        '합산': Math.round(v0 + v1),
      };
    });
  }, [cellMap, dates, exchangeRate, u0, u1, chartExcludeKeys]);

  const chartDataByLiquidity = useMemo(() => {
    const toKrwLocal = (assetType: string, amount: number) =>
      ASSET_COLUMNS.find(c => c.key === assetType)?.isDollar ? Math.round(amount * exchangeRate) : amount;
    const getKrwLocal = (date: string, userId: string, key: string) =>
      toKrwLocal(key, cellMap[date]?.[userId]?.[key] ?? 0);
    const cols = ASSET_COLUMNS.filter(c => !chartExcludeKeys.has(c.key));
    return [...dates].reverse().map(date => {
      const liquid = cols
        .filter(c => c.group === '즉시 사용 가능')
        .reduce((s, c) => s + BUDGET_USERS.reduce((us, u) => us + getKrwLocal(date, u.id, c.key), 0), 0);
      const illiquid = cols
        .filter(c => c.group === '즉시 사용 불가')
        .reduce((s, c) => s + BUDGET_USERS.reduce((us, u) => us + getKrwLocal(date, u.id, c.key), 0), 0);
      return {
        label: date.slice(5),
        fullDate: date,
        '즉시 사용 가능': Math.round(liquid),
        '즉시 사용 불가': Math.round(illiquid),
        '합산': Math.round(liquid + illiquid),
      };
    });
  }, [cellMap, dates, exchangeRate, chartExcludeKeys]);

  // 세부 항목별 차트 데이터 — "유저명 · 계좌명" or "계좌명" 키로 계좌별 라인 생성
  const DETAIL_COLORS = ['#1565c0', '#E06060', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#795548', '#607D8B', '#E91E63', '#009688'];
  const chartDataByDetail = useMemo(() => {
    if (allDetails.size === 0) return { data: [] as Record<string, any>[], seriesKeys: [] as string[] };
    const isDollar = ASSET_COLUMNS.find(c => c.key === detailChartAsset)?.isDollar ?? false;
    const singleUser = detailChartUser !== 'all'; // 특정 유저 선택 시 접두사 생략

    // 날짜 오름차순으로 순회해 계좌 키 순서 확정
    const keyOrder: string[] = [];
    const seen = new Set<string>();
    for (const date of [...dates].reverse()) {
      const rows = allDetails.get(date) ?? [];
      rows
        .filter(r => r.assetType === detailChartAsset && (singleUser ? r.userId === detailChartUser : true))
        .forEach(r => {
          const uName = BUDGET_USERS.find(u => u.id === r.userId)?.name ?? r.userId;
          const key = singleUser
            ? (r.accountName || uName)
            : (r.accountName ? `${uName} · ${r.accountName}` : uName);
          if (!seen.has(key)) { seen.add(key); keyOrder.push(key); }
        });
    }

    const data = [...dates].reverse().map(date => {
      const rows = allDetails.get(date) ?? [];
      const point: Record<string, any> = { label: date.slice(5), fullDate: date };
      keyOrder.forEach(k => { point[k] = 0; });
      rows
        .filter(r => r.assetType === detailChartAsset && (singleUser ? r.userId === detailChartUser : true))
        .forEach(r => {
          const uName = BUDGET_USERS.find(u => u.id === r.userId)?.name ?? r.userId;
          const key = singleUser
            ? (r.accountName || uName)
            : (r.accountName ? `${uName} · ${r.accountName}` : uName);
          const amount = isDollar ? Math.round(r.amount * exchangeRate) : r.amount;
          point[key] = (point[key] ?? 0) + amount;
        });
      return point;
    });

    return { data, seriesKeys: keyOrder };
  }, [allDetails, detailChartAsset, detailChartUser, dates, exchangeRate]);

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6' }}>불러오는 중…</div>;

  return (
    <>
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 40px' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>

        {/* ── 환율 + 서브탭 영역 ───────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {/* 서브탭 */}
          <div style={{ display: 'flex', gap: '4px', background: '#f0f4f8', borderRadius: '8px', padding: '3px' }}>
            {([['CURRENT', '현황'], ['HISTORY', '이력'], ['CHART', '그래프']] as [AssetSubTab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setSubTab(t)} style={{
                padding: '4px 12px', fontSize: '12px', fontWeight: subTab === t ? 700 : 400,
                borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: subTab === t ? '#fff' : 'transparent',
                color: subTab === t ? '#1a3a5c' : '#5f6368',
                boxShadow: subTab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{label}</button>
            ))}
          </div>

          {/* 환율 입력 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', fontSize: '12px' }}>
            <span style={{ color: '#5f6368', fontWeight: 600 }}>달러 환율</span>
            {editingRate ? (
              <>
                <input
                  type="text" value={rateInput} autoFocus
                  onChange={e => setRateInput(e.target.value.replace(/[^0-9]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') saveRate(); if (e.key === 'Escape') setEditingRate(false); }}
                  onBlur={saveRate}
                  style={{ width: '80px', padding: '3px 6px', fontSize: '12px', border: '1px solid #89CFF0', borderRadius: '6px', textAlign: 'right' }}
                />
                <span style={{ color: '#5f6368' }}>원/$</span>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => { setRateInput(String(exchangeRate)); setEditingRate(true); }}
                  style={{ background: '#f0f8fd', border: '1px solid #dadce0', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer', color: '#1a3a5c', fontWeight: 700 }}
                >
                  {exchangeRate.toLocaleString('ko-KR')}원/$
                </button>
                {/* 자동 업데이트 출처 표시 */}
                {autoRateDate && (
                  <span style={{ fontSize: '10px', color: '#89CFF0', background: '#e8f7ff', border: '1px solid #c5e8f5', borderRadius: '4px', padding: '2px 5px' }}>
                    자동 {autoRateDate}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══ 현황 탭 ═══════════════════════════════════════════ */}
        {subTab === 'CURRENT' && (<>

          {/* 날짜 선택 */}
          <div style={{
            background: '#fff', border: '1px solid #e8ecf0', borderRadius: '10px',
            padding: '12px 16px', marginBottom: '14px',
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '12px', color: '#5f6368', fontWeight: 600 }}>날짜</span>
            <input
              type="date" value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '13px', border: '1px solid #dadce0', borderRadius: '6px' }}
            />
            {/* 기존 날짜 빠른 선택 */}
            {dates.length > 0 && (
              <select
                value={dates.includes(selectedDate) ? selectedDate : ''}
                onChange={e => e.target.value && setSelectedDate(e.target.value)}
                style={{ padding: '5px 8px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', color: '#5f6368' }}
              >
                <option value="">기록된 날짜 선택</option>
                {dates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            {/* 복사 버튼: 데이터 없는 날짜에서만 */}
            {!hasData && dates.length > 0 && (
              <button onClick={handleCopyFromLatest} style={btnStyle('#E8F5E9', '#1B5E20')}>
                ← {dates[0]}에서 복사
              </button>
            )}
            {/* 삭제 버튼: 데이터 있을 때만 */}
            {hasData && (
              <button onClick={handleDeleteDate} style={{ ...btnStyle('#fdecea', '#E06060'), marginLeft: 'auto' }}>
                삭제
              </button>
            )}
          </div>

          {!hasData && (
            <div style={{ fontSize: '12px', color: '#9aa0a6', marginBottom: '10px', textAlign: 'center' }}>
              이 날짜에 데이터가 없습니다. 셀을 클릭하여 입력하거나 이전 날짜에서 복사하세요.
            </div>
          )}

          {/* 총 자산 요약 카드 */}
          {isMobile ? (
            /* 모바일: 합산 full width 상단, 동영/주해 나란히 하단 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              <div style={{ background: '#fff', borderRadius: '12px', padding: '12px 16px', border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '5px' }}>{`총 자산 합산 (${selectedDate})`}</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1a3a5c' }}>{gtSum === 0 ? '—' : formatAmount(gtSum)}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[{ label: u0.name, amount: gt0 }, { label: u1.name, amount: gt1 }].map(({ label, amount }) => (
                  <div key={label} style={{ flex: 1, background: '#fff', borderRadius: '12px', padding: '12px 16px', border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '5px' }}>{label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#1565c0' }}>{amount === 0 ? '—' : formatAmountKorean(amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
              {[
                { label: `총 자산 합산 (${selectedDate})`, amount: gtSum, large: true, color: '#1a3a5c' },
                { label: u0.name, amount: gt0, large: false, color: '#1565c0' },
                { label: u1.name, amount: gt1, large: false, color: '#1565c0' },
              ].map(({ label, amount, large, color }) => (
                <div key={label} style={{
                  flex: large ? 2 : 1,
                  background: '#fff', borderRadius: '12px', padding: '12px 16px',
                  border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}>
                  <div style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600, marginBottom: '5px' }}>{label}</div>
                  <div style={{ fontSize: large ? '18px' : '14px', fontWeight: 800, color }}>
                    {amount === 0 ? '—' : (large ? formatAmount(amount) : formatAmountShort(amount))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 유동성 비율 바 */}
          {gtSum > 0 && (
            <div style={{ display: 'flex', gap: isMobile ? '8px' : '6px', marginBottom: '12px' }}>
              {GROUPS.map(g => {
                const v = groupKrw(selectedDate, g, u0.id) + groupKrw(selectedDate, g, u1.id);
                if (v === 0) return null;
                const lc = ASSET_LIQUIDITY_COLORS[g];
                const pct = (v / gtSum * 100).toFixed(0);
                return isMobile ? (
                  /* 모바일: 균등 2칸, 세로 레이아웃으로 텍스트 깨짐 방지 */
                  <div key={g} style={{
                    flex: 1,
                    background: lc.bg, border: `1.5px solid ${lc.border}80`,
                    borderRadius: '10px', padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: '3px',
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: lc.text, whiteSpace: 'nowrap' }}>{g}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: lc.text }}>{formatAmountShort(v)}원</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: lc.border }}>{pct}%</span>
                  </div>
                ) : (
                  /* PC: 비율 비례 가로 바 */
                  <div key={g} style={{
                    flex: v, background: lc.bg, border: `1px solid ${lc.border}60`,
                    borderRadius: '8px', padding: '6px 12px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: lc.text }}>{g}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: lc.text }}>{formatAmountShort(v)}</span>
                    <span style={{ fontSize: '11px', color: lc.border, marginLeft: 'auto' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 안내 */}
          <div style={{ fontSize: '11px', color: '#b0b8c4', textAlign: 'right', marginBottom: '6px' }}>
            ✏️ 금액 셀 클릭하여 수정 · 미국주식·달러 현금은 USD($) 금액 입력
          </div>

          {/* 메인 테이블 */}
          <div style={{ overflowX: isMobile ? 'visible' : 'auto' }}>
          <div style={{ border: '1px solid #e8ecf0', borderRadius: '12px', overflow: 'hidden', minWidth: isMobile ? 'unset' : '360px' }}>
            <div style={{
              display: 'grid', ...COLS,
              padding: '10px 16px', fontSize: '12px', fontWeight: 700,
              background: '#1a3a5c', color: '#fff',
            }}>
              <span>자산 항목</span>
              <span style={{ textAlign: 'right' }}>{u0.name}</span>
              <span style={{ textAlign: 'right' }}>{u1.name}</span>
              <span style={{ textAlign: 'right' }}>{isMobile ? '합산' : '합산 (KRW)'}</span>
            </div>

            {GROUPS.map((group, gi) => {
              const cols = ASSET_COLUMNS.filter(c => c.group === group);
              const lc = ASSET_LIQUIDITY_COLORS[group];
              const sub0 = groupKrw(selectedDate, group, u0.id);
              const sub1 = groupKrw(selectedDate, group, u1.id);
              return (
                <React.Fragment key={group}>
                  {isMobile ? (
                    /* 모바일: 그룹명을 상단 타이틀 바로 표시 (4열 그리드 제거) */
                    <div style={{
                      padding: '6px 16px', fontSize: '11px', fontWeight: 800,
                      background: lc.bg, color: lc.text,
                      borderTop: gi > 0 ? '2px solid #e8ecf0' : 'none',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span>{group}</span>
                      <span style={{ fontWeight: 400, opacity: 0.7, fontSize: '10px' }}>금액 클릭 시 수정</span>
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid', ...COLS,
                      padding: '7px 16px', fontSize: '11px', fontWeight: 800,
                      background: lc.bg, color: lc.text,
                      borderTop: gi > 0 ? '2px solid #e8ecf0' : 'none',
                    }}>
                      <span>{group}</span>
                      <span style={{ textAlign: 'right', fontWeight: 400, opacity: 0.7 }}>클릭 수정</span>
                      <span style={{ textAlign: 'right', fontWeight: 400, opacity: 0.7 }}>클릭 수정</span>
                      <span />
                    </div>
                  )}

                  {cols.map(col => {
                    const isDollar = col.isDollar === true;
                    const raw0 = getAmt(selectedDate, u0.id, col.key);
                    const raw1 = getAmt(selectedDate, u1.id, col.key);
                    const krw0 = toKrw(col.key, raw0);
                    const krw1 = toKrw(col.key, raw1);
                    const isEdit0 = editingCell?.userId === u0.id && editingCell?.assetKey === col.key;
                    const isEdit1 = editingCell?.userId === u1.id && editingCell?.assetKey === col.key;
                    return (
                      <div key={col.key} style={{
                        display: 'grid', ...COLS,
                        background: '#fff', alignItems: 'center',
                        borderBottom: '1px solid #f5f5f5',
                        minHeight: '42px', overflow: 'hidden',
                      }}>
                        <div
                          title={col.label}
                          style={{
                            padding: isDollar ? '8px 16px' : '0 16px',
                            fontSize: '13px', color: '#344054',
                            /* 긴 항목명 말줄임 처리 */
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '42px',
                          }}
                        >
                          <span>{col.label}</span>
                          {isDollar && <span style={{ fontSize: '10px', color: '#9aa0a6', marginTop: '2px' }}>USD 입력 · 환율 {exchangeRate.toLocaleString()}원/$</span>}
                        </div>
                        <AssetCell
                          value={raw0} isEditing={isEdit0} editValue={editValue}
                          onStartEdit={() => startEdit(u0.id, col.key)}
                          onEditChange={setEditValue} onSave={saveEdit}
                          onCancel={() => setEditingCell(null)}
                          saving={saving} accentColor={lc.border}
                          isDollar={isDollar} exchangeRate={exchangeRate}
                          onDetailClick={() => setDetailTarget({ userId: u0.id, assetType: col.key, userName: u0.name, assetLabel: col.label, cellCode: buildAssetCellCode(col.codeKey, u0.id) })} />
                        <AssetCell
                          value={raw1} isEditing={isEdit1} editValue={editValue}
                          onStartEdit={() => startEdit(u1.id, col.key)}
                          onEditChange={setEditValue} onSave={saveEdit}
                          onCancel={() => setEditingCell(null)}
                          saving={saving} accentColor={lc.border}
                          isDollar={isDollar} exchangeRate={exchangeRate}
                          onDetailClick={() => setDetailTarget({ userId: u1.id, assetType: col.key, userName: u1.name, assetLabel: col.label, cellCode: buildAssetCellCode(col.codeKey, u1.id) })} />
                        <span style={{
                          padding: '0 16px', textAlign: 'right', fontSize: '13px', lineHeight: '42px',
                          fontWeight: 600, color: (krw0 + krw1) === 0 ? '#dadce0' : '#1a3a5c',
                        }}>
                          {(krw0 + krw1) === 0 ? '—' : formatAmountShort(krw0 + krw1)}
                        </span>
                      </div>
                    );
                  })}

                  {isMobile ? (
                    /* 모바일: 소계 레이블 + 합계를 한 줄, 개인별은 아래 */
                    <div style={{ padding: '8px 16px', background: lc.bg, color: lc.text }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>소계</span>
                        <span style={{ fontSize: '15px', fontWeight: 800 }}>
                          {(sub0 + sub1) ? formatAmountKorean(sub0 + sub1) : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '3px', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '11px', opacity: 0.8 }}>{u0.name} {sub0 ? formatAmountKorean(sub0) : '—'}</span>
                        <span style={{ fontSize: '11px', opacity: 0.8 }}>{u1.name} {sub1 ? formatAmountKorean(sub1) : '—'}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid', ...COLS,
                      padding: '9px 16px', fontSize: '13px', fontWeight: 700,
                      background: lc.bg, color: lc.text,
                    }}>
                      <span>소계</span>
                      <span style={{ textAlign: 'right' }}>{sub0 ? formatAmountShort(sub0) : '—'}</span>
                      <span style={{ textAlign: 'right' }}>{sub1 ? formatAmountShort(sub1) : '—'}</span>
                      <span style={{ textAlign: 'right', fontSize: '14px' }}>
                        {(sub0 + sub1) ? formatAmountShort(sub0 + sub1) : '—'}
                      </span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {isMobile ? (
              /* 모바일: 총 자산 카드형 */
              <div style={{
                padding: '10px 16px', background: '#f0f8fd', color: '#1a3a5c',
                borderTop: '2px solid #89CFF060',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800 }}>총 자산</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px' }}>
                    {gtSum ? formatAmountKorean(gtSum) : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '12px', color: '#5f6368' }}>{u0.name} <b>{gt0 ? formatAmountKorean(gt0) : '—'}</b></span>
                  <span style={{ fontSize: '12px', color: '#5f6368' }}>{u1.name} <b>{gt1 ? formatAmountKorean(gt1) : '—'}</b></span>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'grid', ...COLS,
                padding: '14px 16px', fontSize: '14px', fontWeight: 800,
                background: '#f0f8fd', color: '#1a3a5c',
                borderTop: '2px solid #89CFF060',
              }}>
                <span>총 자산</span>
                <span style={{ textAlign: 'right' }}>{gt0 ? formatAmountShort(gt0) : '—'}</span>
                <span style={{ textAlign: 'right' }}>{gt1 ? formatAmountShort(gt1) : '—'}</span>
                <span style={{ textAlign: 'right', fontSize: '16px' }}>
                  {gtSum ? formatAmountKorean(gtSum) : '—'}
                </span>
              </div>
            )}
          </div>
          </div> {/* overflowX wrapper */}
        </>)}

        {/* ══ 이력 탭 ═══════════════════════════════════════════ */}
        {subTab === 'HISTORY' && (
          isMobile ? (
            /* 모바일: 카드형 이력 목록 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {dates.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6', fontSize: '13px' }}>
                  스냅샷 이력이 없습니다.
                </div>
              )}
              {dates.map((date, i) => {
                const v0 = grandKrw(date, u0.id);
                const v1 = grandKrw(date, u1.id);
                const total = v0 + v1;
                const prevDate = dates[i + 1];
                const prevTotal = prevDate ? grandKrw(prevDate, u0.id) + grandKrw(prevDate, u1.id) : null;
                const diff = prevTotal !== null ? total - prevTotal : null;
                return (
                  <div key={date}
                    onClick={() => { setSelectedDate(date); setSubTab('CURRENT'); }}
                    style={{
                      background: '#fff', borderRadius: '10px', padding: '12px 16px',
                      border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1565c0' }}>{date}</span>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#1a3a5c' }}>{total ? formatAmountKorean(total) : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px', color: '#5f6368' }}>
                        {u0.name} <b style={{ color: '#344054' }}>{v0 ? formatAmountKorean(v0) : '—'}</b>
                        <span style={{ margin: '0 6px', color: '#ddd' }}>|</span>
                        {u1.name} <b style={{ color: '#344054' }}>{v1 ? formatAmountKorean(v1) : '—'}</b>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: diff === null ? '#9aa0a6' : diff >= 0 ? '#4CAF50' : '#E06060' }}>
                        {diff === null ? '—' : `${diff >= 0 ? '+' : '-'}${formatAmountKorean(Math.abs(diff))}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: '420px' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '130px 1fr 1fr 1fr 100px',
                padding: '10px 16px', fontSize: '12px', fontWeight: 700, color: '#fff',
                background: '#1a3a5c', borderRadius: '8px 8px 0 0',
              }}>
                <span>날짜</span>
                <span style={{ textAlign: 'right' }}>{u0.name}</span>
                <span style={{ textAlign: 'right' }}>{u1.name}</span>
                <span style={{ textAlign: 'right' }}>합산</span>
                <span style={{ textAlign: 'right' }}>변동</span>
              </div>
              <div style={{ border: '1px solid #e8ecf0', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                {dates.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#9aa0a6', fontSize: '13px' }}>
                    스냅샷 이력이 없습니다.
                  </div>
                )}
                {dates.map((date, i) => {
                  const v0 = grandKrw(date, u0.id);
                  const v1 = grandKrw(date, u1.id);
                  const total = v0 + v1;
                  const prevDate = dates[i + 1];
                  const prevTotal = prevDate
                    ? grandKrw(prevDate, u0.id) + grandKrw(prevDate, u1.id)
                    : null;
                  const diff = prevTotal !== null ? total - prevTotal : null;
                  return (
                    <div key={date}
                      onClick={() => { setSelectedDate(date); setSubTab('CURRENT'); }}
                      style={{
                        display: 'grid', gridTemplateColumns: '130px 1fr 1fr 1fr 100px',
                        padding: '11px 16px', fontSize: '13px',
                        borderBottom: i < dates.length - 1 ? '1px solid #f0f0f0' : 'none',
                        background: '#fff', cursor: 'pointer', alignItems: 'center',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f0f8fd')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    >
                      <span style={{ fontWeight: 700, color: '#1565c0' }}>{date}</span>
                      <span style={{ textAlign: 'right', color: '#344054' }}>{v0 ? formatAmountShort(v0) : '—'}</span>
                      <span style={{ textAlign: 'right', color: '#344054' }}>{v1 ? formatAmountShort(v1) : '—'}</span>
                      <span style={{ textAlign: 'right', fontWeight: 700, color: '#1a3a5c' }}>{total ? formatAmountShort(total) : '—'}</span>
                      <span style={{
                        textAlign: 'right', fontWeight: 600,
                        color: diff === null ? '#9aa0a6' : diff >= 0 ? '#4CAF50' : '#E06060',
                      }}>
                        {diff === null ? '—' : `${diff >= 0 ? '+' : '-'}${formatAmountKorean(Math.abs(diff))}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              </div> {/* minWidth wrapper */}
            </div>
          )
        )}

        {/* ══ 그래프 탭 ═════════════════════════════════════════ */}
        {subTab === 'CHART' && (
          <div>
            {/* 모드 토글 */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {([['USER', '유저별'], ['LIQUIDITY', '유동성별'], ['DETAIL', '세부 항목별']] as ['USER' | 'LIQUIDITY' | 'DETAIL', string][]).map(([m, label]) => (
                <button key={m} onClick={() => setChartMode(m)} style={{
                  padding: '6px 16px', fontSize: '12px', fontWeight: chartMode === m ? 700 : 400,
                  borderRadius: '20px', border: `1px solid ${chartMode === m ? '#89CFF0' : '#dadce0'}`,
                  background: chartMode === m ? '#89CFF0' : '#fff',
                  color: chartMode === m ? '#fff' : '#5f6368',
                  cursor: 'pointer',
                }}>{label}</button>
              ))}
              {/* 유저별 모드에서만: 합산만/개인+합산 토글 */}
              {chartMode === 'USER' && (
                <button onClick={() => setChartShowSplit(p => !p)} style={{
                  padding: '6px 16px', fontSize: '12px', fontWeight: chartShowSplit ? 400 : 700,
                  borderRadius: '20px', border: `1px solid ${chartShowSplit ? '#dadce0' : '#4CAF50'}`,
                  background: chartShowSplit ? '#fff' : '#4CAF50',
                  color: chartShowSplit ? '#5f6368' : '#fff',
                  cursor: 'pointer',
                }}>{chartShowSplit ? '합산만 보기' : '개인별 보기'}</button>
              )}
              {/* 세부 항목별: 자산 유형 선택 + 유저 필터 */}
              {chartMode === 'DETAIL' && (<>
                <select
                  value={detailChartAsset}
                  onChange={e => setDetailChartAsset(e.target.value)}
                  style={{ padding: '5px 10px', fontSize: '12px', border: '1px solid #89CFF0', borderRadius: '20px', background: '#f0f8fd', color: '#1a3a5c', cursor: 'pointer' }}
                >
                  {ASSET_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                {/* 유저 필터 */}
                {([['all', '전체'] as const, ...BUDGET_USERS.map(u => [u.id, u.name] as const)]).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setDetailChartUser(id)}
                    style={{
                      padding: '5px 12px', fontSize: '12px',
                      borderRadius: '20px',
                      border: `1px solid ${detailChartUser === id ? '#1565c0' : '#dadce0'}`,
                      background: detailChartUser === id ? '#e8f0fe' : '#fff',
                      color: detailChartUser === id ? '#1565c0' : '#5f6368',
                      fontWeight: detailChartUser === id ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >{label}</button>
                ))}
              </>)}
            </div>

            {/* 자산 항목 제외 토글 칩 (세부 항목별 모드에서는 숨김) */}
            {chartMode !== 'DETAIL' && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#9aa0a6', marginRight: '2px' }}>제외:</span>
                {ASSET_COLUMNS.map(col => {
                  const excluded = chartExcludeKeys.has(col.key);
                  return (
                    <button key={col.key} onClick={() => toggleChartExclude(col.key)} style={{
                      padding: '3px 10px', fontSize: '11px',
                      borderRadius: '12px',
                      border: `1px solid ${excluded ? '#dadce0' : '#1565c0'}`,
                      background: excluded ? '#f5f5f5' : '#e8f0fe',
                      color: excluded ? '#aaa' : '#1565c0',
                      textDecoration: excluded ? 'line-through' : 'none',
                      cursor: 'pointer',
                    }}>{col.label}</button>
                  );
                })}
              </div>
            )}

            {dates.length < 2 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6', fontSize: '13px' }}>
                그래프를 보려면 스냅샷이 2개 이상 필요합니다.
              </div>
            ) : chartMode === 'DETAIL' && detailsLoading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6', fontSize: '13px' }}>세부 내역 조회 중…</div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: '12px', padding: '20px' }}>
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart
                    data={
                      chartMode === 'USER' ? chartDataByUser
                      : chartMode === 'LIQUIDITY' ? chartDataByLiquidity
                      : chartDataByDetail.data
                    }
                    margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9aa0a6' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9aa0a6' }}
                      tickFormatter={v => {
                        if (v === 0) return '0';
                        if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
                        if (Math.abs(v) >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`;
                        return v.toLocaleString('ko-KR');
                      }}
                      width={60}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        // 원 단위 정확 표시
                        Math.round(value).toLocaleString('ko-KR') + '원',
                        name,
                      ]}
                      labelFormatter={label => `날짜: ${label}`}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {chartMode === 'USER' ? (<>
                      {chartShowSplit && <Line type="monotone" dataKey={u0.name} stroke="#1565c0" strokeWidth={2} dot={{ r: 4 }} />}
                      {chartShowSplit && <Line type="monotone" dataKey={u1.name} stroke="#E06060" strokeWidth={2} dot={{ r: 4 }} />}
                      <Line type="monotone" dataKey="합산" stroke="#4CAF50" strokeWidth={2.5} dot={{ r: 5 }} />
                    </>) : chartMode === 'LIQUIDITY' ? (<>
                      <Line type="monotone" dataKey="즉시 사용 가능" stroke="#4CAF50" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="즉시 사용 불가" stroke="#FF9800" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="합산" stroke="#1565c0" strokeWidth={2.5} dot={{ r: 5 }} />
                    </>) : (<>
                      {/* 세부 항목별: 계좌별 라인 */}
                      {chartDataByDetail.seriesKeys.length === 0 ? null :
                        chartDataByDetail.seriesKeys.map((key, i) => (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={DETAIL_COLORS[i % DETAIL_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                          />
                        ))
                      }
                    </>)}
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ fontSize: '11px', color: '#9aa0a6', textAlign: 'right', marginTop: '8px' }}>
                  미국주식·달러 현금은 {exchangeRate.toLocaleString()}원/$ 환율 적용
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* 셀별 세부 내역 모달 — 스크롤 div 밖에서 렌더 (clipping 방지) */}
    {detailTarget && (
      <AssetDetailModal
        snapshotDate={selectedDate}
        userId={detailTarget.userId}
        assetType={detailTarget.assetType}
        userName={detailTarget.userName}
        assetLabel={detailTarget.assetLabel}
        cellCode={detailTarget.cellCode}
        assetCellCodes={assetCellCodes}
        isDollar={ASSET_COLUMNS.find(c => c.key === detailTarget.assetType)?.isDollar}
        exchangeRate={exchangeRate}
        onClose={() => setDetailTarget(null)}
        onSaved={() => { load(); }}
      />
    )}
    </>
  );
};

export default AssetView;
