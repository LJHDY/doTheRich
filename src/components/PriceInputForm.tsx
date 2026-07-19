import React, { useState } from 'react';
import { PriceHistoryRequest } from '../types';

interface PriceInputFormProps {
  complexId: number;
  complexName: string;
  onSubmit: (request: PriceHistoryRequest) => Promise<void>;
  onCancel: () => void;
}

// RegisterModal과 동일한 평형별 가격 행 구조
interface PriceInfoRow {
  areaType: string;
  floorInfo: string;
  priceUk: string;
  jeonseUk: string;
  priceRange: string;       // 매매가에서 자동 계산, 수동 수정 가능
  askingPriceUk: string;    // 호가 (억)
  highestPriceUk: string;   // 전고점 (억)
  lowestPriceUk: string;    // 전저점 (억)
  tenYearAmountStr: string;  // 10년 등락 수식 (예: "8.5-4.3")
  tenYearRateStr: string;    // 10년 등락률 (%)
}

const evalExpr = (expr: string): string => {
  const cleaned = expr.replace(/\s/g, '');
  if (!cleaned) return '';
  if (!/^[0-9+\-*/.]+$/.test(cleaned)) return expr;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${cleaned}`)() as number;
    if (typeof result === 'number' && isFinite(result)) return String(Math.round(result * 100) / 100);
  } catch {}
  return expr;
};

const calcTenYear = (expr: string): { amount: string; rate: string } => {
  const cleaned = expr.replace(/\s/g, '');
  const match = cleaned.match(/^(\d+\.?\d*)-(\d+\.?\d*)$/);
  if (match) {
    const cur = parseFloat(match[1]);
    const base = parseFloat(match[2]);
    const amount = Math.round((cur - base) * 100) / 100;
    const rate = base > 0 ? Math.round((cur - base) / base * 10000) / 100 : 0;
    return { amount: String(amount), rate: String(rate) };
  }
  return { amount: evalExpr(expr), rate: '' };
};

// 억 단위 입력값 → "7억대" 금액대 문자열
const calcPriceRange = (priceUk: string): string => {
  const num = parseFloat(priceUk);
  return isNaN(num) ? '' : `${Math.floor(num)}억대`;
};

// 전세가 / 매매가 × 100 → 전세율(%) 표시
const calcJeonseRate = (priceUk: string, jeonseUk: string): string => {
  const p = parseFloat(priceUk);
  const j = parseFloat(jeonseUk);
  if (isNaN(p) || isNaN(j) || p === 0) return '-';
  return (j / p * 100).toFixed(1) + '%';
};

// 패널(360px) 안에 들어가도록 좁은 패딩 적용
const rowInputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 4px', border: '1px solid #dadce0',
  borderRadius: '5px', fontSize: '12px', color: '#202124',
  outline: 'none', boxSizing: 'border-box',
};

const readonlyStyle: React.CSSProperties = {
  ...rowInputStyle,
  backgroundColor: '#f8f9fa', color: '#80868b', cursor: 'default',
  textAlign: 'center',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600,
  color: '#5f6368', marginBottom: '3px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #dadce0',
  borderRadius: '6px', fontSize: '13px', color: '#202124',
  outline: 'none', boxSizing: 'border-box',
};

const PriceInputForm: React.FC<PriceInputFormProps> = ({
  complexId,
  complexName,
  onSubmit,
  onCancel,
}) => {
  const today = new Date().toISOString().split('T')[0];

  const [recordDate, setRecordDate] = useState<string>(today);
  const [memo, setMemo] = useState<string>('');
  const [updateSheet, setUpdateSheet] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 평형별 가격 행 — RegisterModal과 동일한 구조
  const [priceInfos, setPriceInfos] = useState<PriceInfoRow[]>([
    { areaType: '', floorInfo: '', priceUk: '', jeonseUk: '', priceRange: '', askingPriceUk: '', highestPriceUk: '', lowestPriceUk: '', tenYearAmountStr: '', tenYearRateStr: '' },
  ]);

  const addPriceRow = () =>
    setPriceInfos(prev => [...prev, { areaType: '', floorInfo: '', priceUk: '', jeonseUk: '', priceRange: '', askingPriceUk: '', highestPriceUk: '', lowestPriceUk: '', tenYearAmountStr: '', tenYearRateStr: '' }]);

  const removePriceRow = (i: number) =>
    setPriceInfos(prev => prev.filter((_, idx) => idx !== i));

  const updatePriceRow = (i: number, update: Partial<PriceInfoRow>) =>
    setPriceInfos(prev => prev.map((r, idx) => idx === i ? { ...r, ...update } : r));

  // 매매가가 하나 이상 입력된 행만 서버로 전송
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validRows = priceInfos.filter(r => r.priceUk);
    if (validRows.length === 0) {
      setError('매매가를 하나 이상 입력해주세요.');
      return;
    }
    if (!recordDate) {
      setError('날짜를 선택해주세요.');
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        recordDate,
        memo: memo || undefined,
        updateGoogleSheet: updateSheet,
        items: validRows.map(r => ({
          areaType: r.areaType || undefined,
          floor: r.floorInfo || undefined,
          price: Math.round(parseFloat(r.priceUk) * 100_000_000),
          jeonsePrice: r.jeonseUk ? Math.round(parseFloat(r.jeonseUk) * 100_000_000) : undefined,
          askingPrice: r.askingPriceUk ? Math.round(parseFloat(r.askingPriceUk) * 100_000_000) : undefined,
          highestPrice: r.highestPriceUk ? Math.round(parseFloat(r.highestPriceUk) * 100_000_000) : undefined,
          lowestPrice: r.lowestPriceUk ? Math.round(parseFloat(r.lowestPriceUk) * 100_000_000) : undefined,
          tenYearChangeAmount: r.tenYearAmountStr ? Math.round(parseFloat(r.tenYearAmountStr) * 100_000_000) : undefined,
          tenYearChangeRate: r.tenYearRateStr ? parseFloat(r.tenYearRateStr) : undefined,
        })),
      });
    } catch (err: any) {
      setError(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: '#f8f9fa', border: '1px solid #e8eaed',
      borderRadius: '10px', padding: '14px', marginTop: '16px',
    }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: '#202124' }}>
        시세 입력 — {complexName}
      </h4>

      {error && (
        <div style={{
          padding: '7px 10px', marginBottom: '10px', backgroundColor: '#fce8e6',
          borderRadius: '6px', color: '#c5221f', fontSize: '12px',
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 날짜 */}
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>날짜 *</label>
          <input
            type="date" value={recordDate}
            onChange={e => setRecordDate(e.target.value)}
            style={inputStyle} required
          />
        </div>

        {/* 평형별 가격 행 — RegisterModal과 동일한 7칼럼 구조 */}
        <div style={{ marginBottom: '4px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.1fr 1.5fr 1.5fr 44px 46px 22px',
            gap: '4px', marginBottom: '3px',
          }}>
            <span style={labelStyle}>평형</span>
            <span style={labelStyle}>층수</span>
            <span style={labelStyle}>매매가(억)*</span>
            <span style={labelStyle}>전세가(억)</span>
            <span style={labelStyle}>전세율</span>
            <span style={labelStyle}>금액대</span>
            <span />
          </div>

          {priceInfos.map((row, i) => (
            <div key={i} style={{ marginBottom: '6px', border: '1px solid #e8eaed', borderRadius: '5px', overflow: 'hidden' }}>
              {/* 기본 가격 행 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.1fr 1.5fr 1.5fr 44px 46px 22px',
                gap: '4px', padding: '6px', alignItems: 'center',
              }}>
                <input
                  style={rowInputStyle}
                  placeholder="전용 59"
                  value={row.areaType}
                  onChange={e => updatePriceRow(i, { areaType: e.target.value })}
                  onBlur={() => {
                    // 숫자만 입력 시 "전용 N" 형식으로 자동 보완
                    const v = row.areaType.trim();
                    if (/^\d+(\.\d+)?$/.test(v)) updatePriceRow(i, { areaType: `전용 ${v}` });
                  }}
                />
                <input
                  style={rowInputStyle}
                  placeholder="3/15"
                  value={row.floorInfo}
                  onChange={e => updatePriceRow(i, { floorInfo: e.target.value })}
                />
                <input
                  type="number" step="0.01"
                  style={rowInputStyle}
                  placeholder="7.5"
                  value={row.priceUk}
                  onChange={e => {
                    const newUk = e.target.value;
                    updatePriceRow(i, { priceUk: newUk, priceRange: calcPriceRange(newUk) });
                  }}
                />
                <input
                  type="number" step="0.01"
                  style={rowInputStyle}
                  placeholder="5.5"
                  value={row.jeonseUk}
                  onChange={e => updatePriceRow(i, { jeonseUk: e.target.value })}
                />
                <div style={{ ...readonlyStyle, padding: '6px 2px', fontSize: '11px' }}>
                  {calcJeonseRate(row.priceUk, row.jeonseUk)}
                </div>
                <input
                  style={{ ...rowInputStyle, fontSize: '11px', textAlign: 'center' }}
                  placeholder="7억대"
                  value={row.priceRange}
                  onChange={e => updatePriceRow(i, { priceRange: e.target.value })}
                />
                {priceInfos.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removePriceRow(i)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#c5221f', fontSize: '16px', padding: 0 }}
                  >×</button>
                ) : (
                  <span />
                )}
              </div>
              {/* 참고가 서브 행 — 평형별로 개별 입력 */}
              <div style={{ backgroundColor: '#f8f9fa', borderTop: '1px dashed #e8eaed', padding: '6px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#80868b', marginBottom: '4px' }}>참고가</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '4px' }}>
                  <div>
                    <span style={{ ...labelStyle, fontSize: '9px' }}>호가(억)</span>
                    <input type="number" step="0.01" style={{ ...rowInputStyle, fontSize: '11px' }} placeholder="8.5"
                      value={row.askingPriceUk}
                      onChange={e => updatePriceRow(i, { askingPriceUk: e.target.value })} />
                  </div>
                  <div>
                    <span style={{ ...labelStyle, fontSize: '9px' }}>전고점(억)</span>
                    <input type="number" step="0.01" style={{ ...rowInputStyle, fontSize: '11px' }} placeholder="12"
                      value={row.highestPriceUk}
                      onChange={e => updatePriceRow(i, { highestPriceUk: e.target.value })} />
                  </div>
                  <div>
                    <span style={{ ...labelStyle, fontSize: '9px' }}>전저점(억)</span>
                    <input type="number" step="0.01" style={{ ...rowInputStyle, fontSize: '11px' }} placeholder="6"
                      value={row.lowestPriceUk}
                      onChange={e => updatePriceRow(i, { lowestPriceUk: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  <div>
                    <span style={{ ...labelStyle, fontSize: '9px' }}>10년 등락(억)</span>
                    {/* "A-B" 입력 시 등락 금액과 등락률 자동 계산 */}
                    <input type="text" style={{ ...rowInputStyle, fontSize: '11px' }} placeholder="8.5-4.3"
                      value={row.tenYearAmountStr}
                      onChange={e => updatePriceRow(i, { tenYearAmountStr: e.target.value })}
                      onBlur={() => {
                        const { amount, rate } = calcTenYear(row.tenYearAmountStr);
                        updatePriceRow(i, { tenYearAmountStr: amount, ...(rate ? { tenYearRateStr: rate } : {}) });
                      }} />
                  </div>
                  <div>
                    <span style={{ ...labelStyle, fontSize: '9px' }}>등락률(%)</span>
                    <input type="text" style={{ ...rowInputStyle, fontSize: '11px' }} placeholder="자동 계산"
                      value={row.tenYearRateStr}
                      onChange={e => updatePriceRow(i, { tenYearRateStr: e.target.value })}
                      onBlur={() => updatePriceRow(i, { tenYearRateStr: evalExpr(row.tenYearRateStr) })} />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addPriceRow}
            style={{
              border: '1px dashed #dadce0', background: 'none', cursor: 'pointer',
              borderRadius: '5px', padding: '4px 12px', fontSize: '11px',
              color: '#1a73e8', marginBottom: '8px',
            }}
          >+ 행 추가</button>
        </div>

        {/* 메모 */}
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>메모</label>
          <textarea
            placeholder="추가 메모를 입력하세요"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {/* 구글 스프레드시트 */}
        <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
          <input
            type="checkbox" id="pif-updateSheet"
            checked={updateSheet}
            onChange={e => setUpdateSheet(e.target.checked)}
            style={{ width: '14px', height: '14px', cursor: 'pointer' }}
          />
          <label htmlFor="pif-updateSheet" style={{ fontSize: '12px', color: '#5f6368', cursor: 'pointer' }}>
            구글 스프레드시트에 자동 추가
          </label>
        </div>

        {/* 저장 / 취소 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="submit" disabled={loading}
            style={{
              flex: 1, padding: '9px', fontSize: '13px', fontWeight: 600,
              backgroundColor: loading ? '#9e9e9e' : '#1a73e8',
              color: '#fff', border: 'none', borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '저장 중...' : '저장'}
          </button>
          <button
            type="button" onClick={onCancel} disabled={loading}
            style={{
              flex: 1, padding: '9px', fontSize: '13px',
              backgroundColor: '#fff', color: '#5f6368',
              border: '1px solid #dadce0', borderRadius: '6px', cursor: 'pointer',
            }}
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
};

export default PriceInputForm;
