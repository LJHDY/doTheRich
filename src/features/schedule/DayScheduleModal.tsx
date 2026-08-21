import React, { useEffect, useRef, useState } from 'react';
import { DayScheduleBlock } from '../../types';
import { getDaySchedule, upsertDaySchedule } from '../../services/api';

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  date: string;   // 'YYYY-MM-DD'
  userId: string;
  onClose: () => void;
}

// ── 상수 ──────────────────────────────────────────────────────────────────────
const CX = 200, CY = 200;
const R_OUT = 165, R_IN = 72;

const COLORS = [
  '#5B9BD5', '#4CAF50', '#FF8F9E', '#ED7D31', '#9B59B6',
  '#16A085', '#F1C40F', '#E74C3C', '#7F8C8D', '#2C3E50',
  '#E91E63', '#00BCD4',
];

// ── 분 ↔ 각도 ─────────────────────────────────────────────────────────────────
// 분(0~1440) → SVG 라디안 (12시 방향 = -π/2)
const minToRad = (min: number) => (min / 1440) * 2 * Math.PI - Math.PI / 2;

// SVG 좌표 → 분 (10분 스냅)
const coordToMin = (svgX: number, svgY: number): number => {
  let angle = Math.atan2(svgY - CY, svgX - CX) + Math.PI / 2;
  if (angle < 0) angle += 2 * Math.PI;
  return Math.round((angle / (2 * Math.PI)) * 1440 / 10) * 10 % 1440;
};

// ── SVG 도넛 조각 path ────────────────────────────────────────────────────────
const donutPath = (startMin: number, endMin: number, ro = R_OUT, ri = R_IN): string => {
  const span = endMin - startMin;
  if (span <= 0) return '';
  if (span >= 1440) {
    const c = (r: number) => `M ${CX} ${CY - r} A ${r} ${r} 0 1 1 ${CX - 0.001} ${CY - r} Z`;
    return `${c(ro)} ${c(ri)}`;
  }
  const sa = minToRad(startMin), ea = minToRad(endMin);
  const large = span > 720 ? 1 : 0;
  const ox1 = CX + ro * Math.cos(sa), oy1 = CY + ro * Math.sin(sa);
  const ox2 = CX + ro * Math.cos(ea), oy2 = CY + ro * Math.sin(ea);
  const ix1 = CX + ri * Math.cos(sa), iy1 = CY + ri * Math.sin(sa);
  const ix2 = CX + ri * Math.cos(ea), iy2 = CY + ri * Math.sin(ea);
  return [
    `M ${ox1} ${oy1}`,
    `A ${ro} ${ro} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${ri} ${ri} 0 ${large} 0 ${ix1} ${iy1}`,
    'Z',
  ].join(' ');
};

// ── 분 → "HH:MM" ─────────────────────────────────────────────────────────────
const fmtMin = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const DayScheduleModal: React.FC<Props> = ({ date, userId, onClose }) => {
  const [blocks, setBlocks]         = useState<DayScheduleBlock[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  // 드래그 상태
  const [dragStart, setDragStart]   = useState<number | null>(null);
  const [dragEnd, setDragEnd]       = useState<number | null>(null);

  // 블록 추가 팝업
  const [pending, setPending]       = useState<{ s: number; e: number } | null>(null);
  const [newLabel, setNewLabel]     = useState('');
  const [newColor, setNewColor]     = useState(COLORS[0]);
  const [labelError, setLabelError] = useState(false);

  const svgRef   = useRef<SVGSVGElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  // ── 데이터 로드 ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    getDaySchedule(date, userId)
      .then(setBlocks)
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false));
  }, [date, userId]);

  // 색상 자동 순환
  useEffect(() => {
    setNewColor(COLORS[blocks.length % COLORS.length]);
  }, [blocks.length]);

  // pending 오픈 시 label 포커스
  useEffect(() => {
    if (pending) setTimeout(() => labelRef.current?.focus(), 50);
  }, [pending]);

  // ── API 저장 ───────────────────────────────────────────────────────────────
  const persist = async (next: DayScheduleBlock[]) => {
    setBlocks(next);
    setSaving(true);
    try {
      await upsertDaySchedule(date, userId, next);
    } finally {
      setSaving(false);
    }
  };

  // ── SVG 좌표 변환 ──────────────────────────────────────────────────────────
  const getSvgMin = (e: React.MouseEvent<SVGSVGElement>): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    return coordToMin(
      (e.clientX - rect.left) * (400 / rect.width),
      (e.clientY - rect.top)  * (400 / rect.height),
    );
  };

  const isInRing = (e: React.MouseEvent<SVGSVGElement>): boolean => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (400 / rect.width) - CX;
    const y = (e.clientY - rect.top)  * (400 / rect.height) - CY;
    const r = Math.sqrt(x * x + y * y);
    return r >= R_IN && r <= R_OUT + 20;
  };

  // ── 드래그 이벤트 ──────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !isInRing(e)) return;
    const min = getSvgMin(e);
    setDragStart(min);
    setDragEnd(min);
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragStart === null) return;
    setDragEnd(getSvgMin(e));
  };

  const onMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragStart === null) return;
    const end = getSvgMin(e);
    setDragStart(null);
    setDragEnd(null);

    // 시계 방향 스팬 계산
    let span = end - dragStart;
    if (span < 0) span += 1440;
    if (span < 10) return; // 10분 미만 무시

    const endMin = dragStart + span;
    setPending({ s: dragStart, e: endMin > 1440 ? 1440 : endMin });
  };

  // ── 블록 확정 ──────────────────────────────────────────────────────────────
  const confirmBlock = () => {
    if (!newLabel.trim()) { setLabelError(true); return; }
    if (!pending) return;
    const block: DayScheduleBlock = {
      id: `${Date.now()}`,
      startMin: pending.s,
      endMin:   pending.e,
      label:    newLabel.trim(),
      color:    newColor,
    };
    persist([...blocks, block]);
    setPending(null);
    setNewLabel('');
    setLabelError(false);
  };

  const deleteBlock = (id: string) => {
    persist(blocks.filter(b => b.id !== id));
  };

  // ── 드래그 미리보기 ────────────────────────────────────────────────────────
  const previewPath = (() => {
    if (dragStart === null || dragEnd === null) return null;
    let span = dragEnd - dragStart;
    if (span < 0) span += 1440;
    if (span < 10) return null;
    const end = dragStart + span;
    return donutPath(dragStart, end > 1440 ? 1440 : end);
  })();

  // ── 렌더 ───────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 10100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '24px',
        width: '820px', maxWidth: '96vw', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', gap: '16px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.28)', overflow: 'hidden',
      }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '17px', color: '#1a3a5c' }}>
            🗓 하루 스케줄 — {date.slice(5).replace('-', '/')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {saving && <span style={{ fontSize: '11px', color: '#89CFF0' }}>저장 중…</span>}
            <button
              onClick={onClose}
              style={{ border: 'none', background: 'none', fontSize: '22px', cursor: 'pointer', color: '#9aa0a6', lineHeight: 1 }}
            >×</button>
          </div>
        </div>

        {/* 본문 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9aa0a6', fontSize: '14px' }}>불러오는 중…</div>
        ) : (
          <div style={{ display: 'flex', gap: '24px', overflow: 'auto', flex: 1, minHeight: 0 }}>

            {/* ── 원형 SVG ── */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', color: '#9aa0a6', marginBottom: '6px' }}>
                시계 방향으로 드래그 · 10분 단위
              </div>
              <svg
                ref={svgRef}
                viewBox="0 0 400 400"
                width="360" height="360"
                style={{ cursor: dragStart !== null ? 'crosshair' : 'default', userSelect: 'none', display: 'block' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => { setDragStart(null); setDragEnd(null); }}
              >
                {/* 배경 링 */}
                <circle cx={CX} cy={CY} r={R_OUT} fill="#f5f7fa" />
                <circle cx={CX} cy={CY} r={R_IN}  fill="#fff" />

                {/* 1시간 구분선 */}
                {HOURS.map(h => {
                  const a = minToRad(h * 60);
                  return (
                    <line key={`div-${h}`}
                      x1={CX + R_IN  * Math.cos(a)} y1={CY + R_IN  * Math.sin(a)}
                      x2={CX + R_OUT * Math.cos(a)} y2={CY + R_OUT * Math.sin(a)}
                      stroke={h % 6 === 0 ? '#b0b8c8' : '#dde3ec'}
                      strokeWidth={h % 6 === 0 ? 1.5 : 0.8}
                    />
                  );
                })}

                {/* 저장된 블록 */}
                {blocks.map(b => (
                  <path
                    key={b.id}
                    d={donutPath(b.startMin, b.endMin)}
                    fill={b.color} opacity={0.88}
                    style={{ cursor: 'pointer' }}
                    onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`"${b.label}" 블록을 삭제하시겠습니까?`)) deleteBlock(b.id);
                    }}
                  />
                ))}

                {/* 드래그 미리보기 */}
                {previewPath && (
                  <path d={previewPath} fill="#89CFF0" opacity={0.45} style={{ pointerEvents: 'none' }} />
                )}

                {/* 눈금 + 레이블 */}
                {HOURS.map(h => {
                  const a = minToRad(h * 60);
                  const isMajor = h % 6 === 0;
                  const tickEnd = R_OUT + (isMajor ? 12 : 7);
                  const lblR    = R_OUT + 24;
                  return (
                    <g key={`tick-${h}`} style={{ pointerEvents: 'none' }}>
                      <line
                        x1={CX + R_OUT * Math.cos(a)}  y1={CY + R_OUT * Math.sin(a)}
                        x2={CX + tickEnd * Math.cos(a)} y2={CY + tickEnd * Math.sin(a)}
                        stroke={isMajor ? '#555' : '#aaa'} strokeWidth={isMajor ? 2 : 1}
                      />
                      {isMajor ? (
                        <text
                          x={CX + lblR * Math.cos(a)} y={CY + lblR * Math.sin(a)}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize="13" fill="#344054" fontWeight="700"
                        >{h}시</text>
                      ) : (
                        <text
                          x={CX + lblR * Math.cos(a)} y={CY + lblR * Math.sin(a)}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize="9" fill="#bbb"
                        >{h}</text>
                      )}
                    </g>
                  );
                })}

                {/* 블록 라벨 */}
                {blocks.map(b => {
                  const span = b.endMin - b.startMin;
                  if (span < 30) return null;
                  const a = minToRad(b.startMin + span / 2);
                  const r = (R_OUT + R_IN) / 2;
                  return (
                    <text
                      key={`lbl-${b.id}`}
                      x={CX + r * Math.cos(a)} y={CY + r * Math.sin(a)}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={span >= 90 ? 11 : 9} fill="#fff" fontWeight="700"
                      style={{ pointerEvents: 'none' }}
                    >
                      {b.label.length > 5 ? b.label.slice(0, 4) + '…' : b.label}
                    </text>
                  );
                })}

                {/* 중앙 날짜 */}
                <text x={CX} y={CY - 8} textAnchor="middle" fontSize="13" fill="#7a8392" fontWeight="600" style={{ pointerEvents: 'none' }}>
                  {date.slice(5).replace('-', '/')}
                </text>
                <text x={CX} y={CY + 10} textAnchor="middle" fontSize="10" fill="#bbb" style={{ pointerEvents: 'none' }}>24시간</text>
              </svg>
            </div>

            {/* ── 우측 패널 ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0, overflowY: 'auto' }}>

              {/* 블록 추가 팝업 */}
              {pending && (
                <div style={{
                  background: '#f0f8fd', borderRadius: '12px', padding: '16px',
                  border: '1.5px solid #89CFF0',
                }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#1a3a5c', marginBottom: '10px' }}>
                    ✏️ {fmtMin(pending.s)} ~ {fmtMin(pending.e >= 1440 ? 0 : pending.e)} 활동 추가
                    <span style={{ fontWeight: 400, color: '#9aa0a6', fontSize: '11px', marginLeft: '6px' }}>
                      ({pending.e - pending.s}분)
                    </span>
                  </div>
                  <input
                    ref={labelRef}
                    value={newLabel}
                    onChange={e => { setNewLabel(e.target.value); setLabelError(false); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmBlock();
                      if (e.key === 'Escape') setPending(null);
                    }}
                    placeholder="활동 이름 (예: 수면, 공부, 식사)"
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: '8px', boxSizing: 'border-box',
                      border: labelError ? '1.5px solid #E74C3C' : '1px solid #dadce0',
                      fontSize: '13px', marginBottom: '10px', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {COLORS.map(c => (
                      <div
                        key={c}
                        onClick={() => setNewColor(c)}
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer',
                          outline: newColor === c ? `3px solid ${c}` : 'none',
                          outlineOffset: '2px',
                          boxShadow: newColor === c ? '0 0 0 2px #fff inset' : 'none',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={confirmBlock}
                      style={{
                        flex: 1, padding: '9px', borderRadius: '8px', border: 'none',
                        background: '#89CFF0', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                      }}
                    >추가</button>
                    <button
                      onClick={() => { setPending(null); setLabelError(false); }}
                      style={{
                        padding: '9px 18px', borderRadius: '8px',
                        border: '1px solid #dadce0', background: '#fff', fontSize: '13px', cursor: 'pointer',
                      }}
                    >취소</button>
                  </div>
                </div>
              )}

              {/* 활동 목록 */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#344054', marginBottom: '8px' }}>
                  📋 활동 목록
                  <span style={{ fontWeight: 400, color: '#9aa0a6', fontSize: '11px', marginLeft: '6px' }}>클릭 → 삭제</span>
                </div>
                {blocks.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#9aa0a6' }}>아직 추가된 활동이 없습니다.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[...blocks].sort((a, b) => a.startMin - b.startMin).map(b => (
                      <div
                        key={b.id}
                        onClick={() => { if (window.confirm(`"${b.label}" 블록을 삭제하시겠습니까?`)) deleteBlock(b.id); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                          background: `${b.color}18`, border: `1.5px solid ${b.color}55`,
                          transition: 'opacity .15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: b.color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#344054', flex: 1 }}>{b.label}</span>
                        <span style={{ fontSize: '11px', color: '#7a8392', whiteSpace: 'nowrap' }}>
                          {fmtMin(b.startMin)} ~ {fmtMin(b.endMin >= 1440 ? 0 : b.endMin)}
                        </span>
                        <span style={{ fontSize: '11px', color: '#bbb', marginLeft: '4px' }}>
                          {b.endMin - b.startMin}분
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 합계 */}
              {blocks.length > 0 && (
                <div style={{ fontSize: '11px', color: '#9aa0a6', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
                  총 {blocks.reduce((s, b) => s + b.endMin - b.startMin, 0)}분 / 1440분 (
                  {Math.round(blocks.reduce((s, b) => s + b.endMin - b.startMin, 0) / 14.4)}%)
                </div>
              )}

              {!pending && (
                <div style={{ fontSize: '11px', color: '#b0b8c8', lineHeight: '1.7', marginTop: 'auto' }}>
                  💡 원 위에서 <b>시계 방향으로 드래그</b>하면 블록을 추가합니다.<br />
                  활동 목록 항목을 클릭하면 삭제됩니다.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DayScheduleModal;
