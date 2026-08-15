import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Schedule } from '../types';
import {
  disconnectNaverCalendar,
  getNaverCalendarAuthUrl,
  getNaverCalendarStatus,
  getSchedules,
  NaverCalendarStatus,
  selectNaverCalendar,
} from '../services/api';
import ScheduleFormModal, { USER_EMOJI } from './ScheduleFormModal';
import { useIsMobile } from '../hooks/useIsMobile';

interface Props {
  onClose: () => void;
}

// 카테고리별 색상 (순환)
const CAT_COLORS = ['#89CFF0', '#FFD97D', '#E06060', '#7DC8A0', '#BA8BD8', '#FF9800', '#1565c0'];
const catColor = (cat: string | null, idx: number) =>
  cat ? CAT_COLORS[Math.abs(cat.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % CAT_COLORS.length]
      : CAT_COLORS[idx % CAT_COLORS.length];

// 다일 이벤트 바 정보
interface BarInfo {
  event: Schedule;
  startCol: number; // 0~6
  endCol: number;   // 0~6
}

// 네이버 캘린더 연동 상태 + 캘린더 선택 뱃지
const NaverStatusBadge: React.FC<{
  userId: string;
  label: string;
  status: NaverCalendarStatus | null;
  onRefresh: () => void;
}> = ({ userId, label, status, onRefresh }) => {
  const [disconnecting, setDisconnecting] = useState(false);
  const [showPicker, setShowPicker]       = useState(false);
  const [customId, setCustomId]           = useState('');
  const [saving, setSaving]               = useState(false);

  const userStatus = status?.[userId as 'ldy' | 'juhae'];
  const connected  = userStatus?.connected && userStatus?.valid;
  const calendarId = userStatus?.calendarId;

  const displayName = !calendarId || calendarId === 'defaultCalendarId'
    ? '내 캘린더 (기본)' : calendarId;

  const handleConnect = () => {
    window.open(getNaverCalendarAuthUrl(userId), '_blank', 'width=500,height=700');
  };

  const handleDisconnect = async () => {
    if (!window.confirm(`${label}의 네이버 캘린더 연동을 해제하시겠습니까?`)) return;
    setDisconnecting(true);
    try {
      await disconnectNaverCalendar(userId);
      onRefresh();
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    try {
      await selectNaverCalendar(userId, id || 'defaultCalendarId');
      setShowPicker(false);
      setCustomId('');
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: '#344054', minWidth: '70px' }}>{label}</span>
        {connected ? (
          <>
            <span style={{
              fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
              background: '#d4edda', color: '#155724', fontWeight: 600,
            }}>연동됨</span>
            <button
              onClick={() => { setShowPicker(v => !v); setCustomId(calendarId ?? ''); }}
              style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                border: '1px solid #03C75A',
                background: showPicker ? '#03C75A' : '#fff',
                color: showPicker ? '#fff' : '#03C75A',
                cursor: 'pointer', fontWeight: 600,
              }}
            >📅 {displayName}</button>
            <button onClick={handleDisconnect} disabled={disconnecting} style={{
              fontSize: '11px', padding: '2px 7px', borderRadius: '4px',
              border: '1px solid #f5c6cb', background: '#fff8f8',
              color: '#721c24', cursor: 'pointer',
            }}>해제</button>
          </>
        ) : (
          <button onClick={handleConnect} style={{
            fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
            border: '1px solid #03C75A', background: '#fff',
            color: '#03C75A', fontWeight: 700, cursor: 'pointer',
          }}>N 연동</button>
        )}
      </div>

      {showPicker && connected && (
        <div style={{
          marginLeft: '76px', border: '1px solid #dadce0', borderRadius: '8px',
          background: '#fff', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <div
            onClick={() => handleSave('defaultCalendarId')}
            style={{
              padding: '8px 12px', fontSize: '12px', cursor: 'pointer',
              background: (!calendarId || calendarId === 'defaultCalendarId') ? '#e8f5e9' : '#fff',
              color: (!calendarId || calendarId === 'defaultCalendarId') ? '#2e7d32' : '#344054',
              fontWeight: (!calendarId || calendarId === 'defaultCalendarId') ? 700 : 400,
              borderBottom: '1px solid #f0f0f0',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <span>📅</span><span>내 캘린더 (기본)</span>
            {(!calendarId || calendarId === 'defaultCalendarId') && <span style={{ marginLeft: 'auto', color: '#2e7d32' }}>✓</span>}
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', color: '#5f6368' }}>
              다른 캘린더 ID 직접 입력<br />
              <span style={{ color: '#9aa0a6' }}>
                calendar.naver.com → F12 → Network → 페이지 새로고침 → calendarId 검색
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={customId}
                onChange={e => setCustomId(e.target.value)}
                placeholder="calendarId 붙여넣기"
                style={{
                  flex: 1, padding: '5px 8px', fontSize: '12px',
                  border: '1px solid #dadce0', borderRadius: '5px', outline: 'none',
                }}
              />
              <button
                onClick={() => handleSave(customId)}
                disabled={!customId.trim() || saving}
                style={{
                  padding: '5px 12px', fontSize: '12px', borderRadius: '5px',
                  border: 'none', background: customId.trim() ? '#03C75A' : '#ccc',
                  color: '#fff', cursor: customId.trim() ? 'pointer' : 'default', fontWeight: 700,
                }}
              >{saving ? '…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 주(week) 단위 렌더링 상수
const DAY_NUM_H = 26; // 날짜 숫자 영역 높이 (px)
const BAR_H     = 18; // 다일 이벤트 바 높이 (px)
const BAR_GAP   =  2; // 바 사이 간격 (px)
const GRID_GAP  =  4; // 셀 간격 (px) — 모바일/데스크탑 공통

/** 주(week) 내에서 다일 이벤트를 레인에 배치 */
function buildLanes(
  week: (number | null)[],
  dates: (string | null)[],
  schedules: Schedule[],
): BarInfo[][] {
  const validDates = dates.filter(Boolean) as string[];
  if (validDates.length === 0) return [];

  const weekStart = validDates[0];
  const weekEnd   = validDates[validDates.length - 1];

  // 다일 이벤트만 추출 (종료일이 시작일보다 늦은 경우)
  const multiDay = schedules
    .filter(s => s.endDate && s.endDate > s.eventDate)
    .filter(s => s.eventDate <= weekEnd && s.endDate! >= weekStart)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const lanes: BarInfo[][] = [];

  multiDay.forEach(event => {
    const clampedStart = event.eventDate < weekStart ? weekStart : event.eventDate;
    const clampedEnd   = event.endDate! > weekEnd    ? weekEnd   : event.endDate!;

    const startCol = dates.indexOf(clampedStart);
    const endCol   = dates.indexOf(clampedEnd);
    if (startCol === -1 || endCol === -1) return;

    const bar: BarInfo = { event, startCol, endCol };

    // 겹치지 않는 첫 번째 레인에 배치
    let placed = false;
    for (const lane of lanes) {
      const conflicts = lane.some(b => !(b.endCol < startCol || b.startCol > endCol));
      if (!conflicts) { lane.push(bar); placed = true; break; }
    }
    if (!placed) lanes.push([bar]);
  });

  return lanes;
}

const CalendarModal: React.FC<Props> = ({ onClose }) => {
  const isMobile = useIsMobile();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [schedules, setSchedules]       = useState<Schedule[]>([]);
  const [loading, setLoading]           = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [naverStatus, setNaverStatus]   = useState<NaverCalendarStatus | null>(null);
  const [showNaverPanel, setShowNaverPanel] = useState(false);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const todayStr  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setLoading(true);
    try { setSchedules(await getSchedules(yearMonth)); }
    finally { setLoading(false); }
  }, [yearMonth]);

  useEffect(() => { load(); }, [load]);

  const loadNaverStatus = useCallback(async () => {
    try { setNaverStatus(await getNaverCalendarStatus()); } catch { /* 무시 */ }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('naverCalendar') === 'success') {
      loadNaverStatus();
      window.history.replaceState({}, '', window.location.pathname);
    }
    loadNaverStatus();
  }, [loadNaverStatus]);

  // 날짜 → 해당 날짜에 걸치는 모든 일정 맵 (다일 이벤트도 모든 날짜에 포함)
  const schedulesByDate = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    schedules.forEach(s => {
      const start = new Date(s.eventDate + 'T00:00:00');
      const end   = new Date((s.endDate || s.eventDate) + 'T00:00:00');
      const cur   = new Date(start);
      while (cur <= end) {
        const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        (map[ds] ??= []).push(s);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [schedules]);

  // 달력 셀 배열 (null=빈칸)
  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // 주 단위로 분할
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const pad = (n: number) => String(n).padStart(2, '0');
  const toDateStr = (day: number) => `${year}-${pad(month)}-${pad(day)}`;

  const selectedSchedules = selectedDate ? (schedulesByDate[selectedDate] ?? []) : [];

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000,
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div style={{
          background: '#fff', borderRadius: '16px', width: '100%',
          maxWidth: isMobile ? '560px' : '860px',
          maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
        }}>
          {/* 헤더 */}
          <div style={{
            padding: isMobile ? '16px 20px' : '20px 28px', borderBottom: '1px solid #f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, background: '#fff', zIndex: 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={prevMonth} style={{ background: 'none', border: 'none', fontSize: isMobile ? '18px' : '22px', cursor: 'pointer', color: '#5f6368', lineHeight: 1 }}>‹</button>
              <span style={{ fontWeight: 800, fontSize: isMobile ? '16px' : '20px', color: '#1a3a5c', minWidth: isMobile ? '110px' : '140px', textAlign: 'center' }}>
                {year}년 {month}월
              </span>
              <button onClick={nextMonth} style={{ background: 'none', border: 'none', fontSize: isMobile ? '18px' : '22px', cursor: 'pointer', color: '#5f6368', lineHeight: 1 }}>›</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {loading && <span style={{ fontSize: '12px', color: '#9aa0a6' }}>불러오는 중…</span>}
              <button
                onClick={() => setShowNaverPanel(v => !v)}
                style={{
                  padding: '4px 10px', fontSize: '12px', borderRadius: '6px',
                  border: '1px solid #03C75A',
                  background: showNaverPanel ? '#03C75A' : '#fff',
                  color: showNaverPanel ? '#fff' : '#03C75A',
                  cursor: 'pointer', fontWeight: 700,
                }}
              >N 네이버</button>
              <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
                style={{ padding: '4px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #dadce0', background: '#fff', cursor: 'pointer', color: '#5f6368' }}>
                오늘
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6' }}>×</button>
            </div>
          </div>

          {/* 네이버 캘린더 연동 패널 */}
          {showNaverPanel && (
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid #f0f0f0',
              background: '#f9fff9', display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              <div style={{ fontSize: '12px', color: '#5f6368', fontWeight: 600, marginBottom: '2px' }}>
                📅 네이버 캘린더 연동 — 일정 등록 시 자동으로 네이버 캘린더에 추가됩니다
              </div>
              <NaverStatusBadge userId="ldy"   label="🐴 동영" status={naverStatus} onRefresh={loadNaverStatus} />
              <NaverStatusBadge userId="juhae" label="☀️ 주해" status={naverStatus} onRefresh={loadNaverStatus} />
              <div style={{ fontSize: '11px', color: '#9aa0a6', marginTop: '2px' }}>
                * "N 연동" 클릭 → 네이버 로그인 → 자동으로 연동됩니다.
              </div>
            </div>
          )}

          {/* 요일 헤더 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            padding: isMobile ? '8px 12px 4px' : '10px 20px 6px',
            gap: `${GRID_GAP}px`,
          }}>
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} style={{
                textAlign: 'center', fontSize: isMobile ? '11px' : '13px', fontWeight: 700,
                color: i === 0 ? '#E06060' : i === 6 ? '#1565c0' : '#9aa0a6',
                padding: '4px 0',
              }}>{d}</div>
            ))}
          </div>

          {/* 주 단위 렌더링 */}
          <div style={{ padding: isMobile ? '0 12px 16px' : '0 20px 20px', display: 'flex', flexDirection: 'column', gap: `${GRID_GAP}px` }}>
            {weeks.map((week, weekIdx) => {
              const dates = week.map(day => day ? toDateStr(day) : null);
              const lanes = buildLanes(week, dates, schedules);
              const barsH = lanes.length * (BAR_H + BAR_GAP);

              return (
                <div key={weekIdx} style={{ position: 'relative' }}>
                  {/* 날짜 셀 그리드 */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: `${GRID_GAP}px`,
                  }}>
                    {week.map((day, colIdx) => {
                      if (!day) return <div key={colIdx} style={{ minHeight: DAY_NUM_H + barsH + 4 }} />;
                      const dateStr = dates[colIdx]!;
                      const isToday = dateStr === todayStr;
                      const isSun   = colIdx === 0;
                      const isSat   = colIdx === 6;
                      // 해당 날짜의 단일일 이벤트만 (다일은 바로 표시)
                      const singleDay = (schedulesByDate[dateStr] ?? []).filter(
                        s => !s.endDate || s.endDate <= s.eventDate
                      );
                      const maxChips = isMobile ? 2 : 3;

                      return (
                        <div
                          key={colIdx}
                          onClick={() => setSelectedDate(dateStr)}
                          style={{
                            minHeight: DAY_NUM_H + barsH + (isMobile ? 50 : 60),
                            padding: '5px 5px 4px',
                            borderRadius: '8px', cursor: 'pointer',
                            border: `1.5px solid ${isToday ? '#89CFF0' : '#f0f0f0'}`,
                            background: isToday ? '#f0f8fd' : '#fff',
                            overflow: 'hidden',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isToday ? '#e0f4fc' : '#f8fbff'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isToday ? '#f0f8fd' : '#fff'; }}
                        >
                          {/* 날짜 숫자 */}
                          <div style={{
                            height: DAY_NUM_H,
                            fontWeight: isToday ? 800 : 500,
                            fontSize: isMobile ? '13px' : '15px',
                            color: isToday ? '#1565c0' : isSun ? '#E06060' : isSat ? '#1565c0' : '#344054',
                          }}>{day}</div>

                          {/* 다일 이벤트 바 영역 높이 확보 */}
                          <div style={{ height: barsH }} />

                          {/* 단일일 이벤트 칩 */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {singleDay.slice(0, maxChips).map((s, si) => (
                              <div key={s.id} style={{
                                fontSize: isMobile ? '10px' : '11px', lineHeight: '15px',
                                background: catColor(s.category, si),
                                color: '#fff', borderRadius: '3px',
                                padding: isMobile ? '1px 4px' : '2px 5px',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                fontWeight: 600,
                              }}>
                                {USER_EMOJI[s.userId] ?? ''}{s.eventTime ? ` ${s.eventTime}` : ''} {s.title}
                              </div>
                            ))}
                            {singleDay.length > maxChips && (
                              <div style={{ fontSize: '10px', color: '#9aa0a6', paddingLeft: '2px' }}>
                                +{singleDay.length - maxChips}개
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 다일 이벤트 바 레이어 (절대 위치로 셀 위에 오버레이) */}
                  {lanes.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: DAY_NUM_H + 5, // 날짜 숫자 아래
                      left: 0, right: 0,
                      pointerEvents: 'none',
                    }}>
                      {lanes.map((lane, laneIdx) => (
                        <div key={laneIdx} style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(7, 1fr)',
                          gap: `${GRID_GAP}px`,
                          marginBottom: `${BAR_GAP}px`,
                        }}>
                          {lane.map(bar => {
                            const { event, startCol, endCol } = bar;
                            const color = catColor(event.category, 0);
                            const isStart = true; // 이 주에서의 시작 여부 (항상 true — 레인 내 유일)
                            const isContinued = event.eventDate < (dates.find(Boolean) ?? '');
                            return (
                              <div
                                key={event.id}
                                onClick={() => setSelectedDate(dates[startCol]!)}
                                style={{
                                  gridColumn: `${startCol + 1} / span ${endCol - startCol + 1}`,
                                  height: BAR_H,
                                  background: color,
                                  // 주 경계에서 잘린 경우 좌측 radius 제거
                                  borderRadius: isContinued
                                    ? `0 ${BAR_H / 2}px ${BAR_H / 2}px 0`
                                    : `${BAR_H / 2}px`,
                                  color: '#fff',
                                  fontSize: isMobile ? '10px' : '11px',
                                  fontWeight: 700,
                                  padding: '0 7px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  cursor: 'pointer',
                                  pointerEvents: 'auto',
                                  boxSizing: 'border-box',
                                }}
                              >
                                {USER_EMOJI[event.userId] ?? ''} {event.title}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 이번 달 일정 요약 */}
          {schedules.length > 0 && (
            <div style={{ padding: isMobile ? '0 16px 16px' : '0 20px 20px' }}>
              <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#9aa0a6', fontWeight: 600, marginBottom: '8px' }}>
                {month}월 전체 일정 ({schedules.length}건)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: isMobile ? '160px' : '200px', overflowY: 'auto' }}>
                {schedules.map((s, si) => (
                  <div key={s.id} style={{
                    display: 'flex', gap: '8px', alignItems: 'center',
                    padding: '5px 10px', borderRadius: '7px', background: '#f9f9fb',
                    fontSize: '12px',
                  }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                      background: catColor(s.category, si),
                    }} />
                    <span style={{ fontSize: '13px', flexShrink: 0 }}>{USER_EMOJI[s.userId] ?? ''}</span>
                    <span style={{ color: '#9aa0a6', flexShrink: 0 }}>
                      {s.eventDate.slice(5).replace('-', '/')}
                      {s.endDate && s.endDate > s.eventDate ? ` ~ ${s.endDate.slice(5).replace('-', '/')}` : ''}
                      {s.eventTime ? ` ${s.eventTime}` : ''}
                    </span>
                    {s.category && (
                      <span style={{ color: '#1565c0', fontSize: '11px', background: '#e8f0fe', borderRadius: '4px', padding: '0 4px' }}>
                        {s.category}
                      </span>
                    )}
                    <span style={{ color: '#344054', fontWeight: 600 }}>{s.title}</span>
                    {s.repeatType && (
                      <span style={{ color: '#6a1b9a', fontSize: '10px', background: '#f3e5f5', borderRadius: '3px', padding: '0 4px', flexShrink: 0 }}>
                        반복
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 날짜 클릭 → 일정 등록/수정 모달 */}
      {selectedDate && (
        <ScheduleFormModal
          date={selectedDate}
          schedules={selectedSchedules}
          onClose={() => setSelectedDate(null)}
          onSaved={() => { load(); }}
        />
      )}
    </>
  );
};

export default CalendarModal;
