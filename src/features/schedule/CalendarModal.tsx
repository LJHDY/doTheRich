import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommonCode, Dday, FixedExpenseCalendar, Schedule, Todo } from '../../types';
import {
  createDday,
  createTodo,
  deleteDday,
  deleteTodo,
  disconnectNaverCalendar,
  getCommonCodes,
  getDdays,
  getFixedExpenseCalendar,
  getNaverCalendarAuthUrl,
  getNaverCalendarStatus,
  getSchedules,
  getTodos,
  NaverCalendarStatus,
  selectNaverCalendar,
  updateTodo,
} from '../../services/api';
import ScheduleFormModal, { USER_EMOJI } from './ScheduleFormModal';
import { useIsMobile } from '../../hooks/useIsMobile';

interface Props {
  onClose: () => void;
  onDdayChange?: () => void; // 헤더 D-Day 배지 갱신용 콜백
}

// 카테고리별 색상 (순환) — IMPORTANT는 항상 빨간색
const CAT_COLORS = ['#89CFF0', '#FFD97D', '#E06060', '#7DC8A0', '#BA8BD8', '#FF9800', '#1565c0'];
const catColor = (cat: string | null, idx: number) =>
  cat === 'IMPORTANT' ? '#E53935'
  : cat ? CAT_COLORS[Math.abs(cat.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % CAT_COLORS.length]
        : CAT_COLORS[idx % CAT_COLORS.length];

const scheduleTitle = (s: { title: string; category: string | null }) =>
  s.category === 'IMPORTANT' ? `${s.title} ⭐️` : s.title;

// 반복 패턴 날짜 매칭 — 모듈 레벨로 분리해 useMemo 클로저 문제 방지
function isEventActiveOn(s: Schedule, target: string): boolean {
  if (target < s.eventDate) return false;
  switch (s.repeatType) {
    case 'weekly': {
      const diffMs = new Date(target + 'T00:00:00').getTime() - new Date(s.eventDate + 'T00:00:00').getTime();
      return Math.round(diffMs / 86400000) % 7 === 0;
    }
    case 'monthly':
      return target.slice(8) === s.eventDate.slice(8);   // DD 일치
    case 'yearly':
      return target.slice(5) === s.eventDate.slice(5);   // MM-DD 일치
    default:
      return false;
  }
}

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

// D-Day 유틸
const calcDdayDiff = (targetDate: string): number => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};
const ddayLabel = (diff: number) => diff === 0 ? 'D-Day' : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
const ddayBadgeColor = (diff: number) =>
  diff === 0 ? '#E06060' : diff > 0 && diff <= 7 ? '#FF9800' : diff > 0 && diff <= 30 ? '#FFD97D' : '#bdbdbd';

const CalendarModal: React.FC<Props> = ({ onClose, onDdayChange }) => {
  const isMobile = useIsMobile();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [schedules, setSchedules]       = useState<Schedule[]>([]);
  const [loading, setLoading]           = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [naverStatus, setNaverStatus]   = useState<NaverCalendarStatus | null>(null);
  const [showNaverPanel, setShowNaverPanel] = useState(false);
  const [showPicker, setShowPicker]     = useState(false);
  const [pickerYear, setPickerYear]     = useState(now.getFullYear());
  const [listOpen, setListOpen]         = useState(true);  // 월별 일정 목록 펼침 여부
  const [catCodes, setCatCodes]         = useState<CommonCode[]>([]);
  const [feCalendar, setFeCalendar]     = useState<FixedExpenseCalendar | null>(null);
  const [fePopup, setFePopup]           = useState<{ date: string; x: number; y: number } | null>(null);
  const [todos, setTodos]               = useState<Todo[]>([]);
  const [ddays, setDdays]               = useState<Dday[]>([]);
  const [ddayFormOpen, setDdayFormOpen] = useState(false);
  const [ddayTitle, setDdayTitle]       = useState('');
  const [ddayDate, setDdayDate]         = useState('');
  const [ddayUser, setDdayUser]         = useState<'ldy' | 'juhae' | 'common'>('common');
  const [ddaySaving, setDdaySaving]     = useState(false);
  const [ddayOpen, setDdayOpen]         = useState(true);
  const [dateActionPopup, setDateActionPopup] = useState<{ date: string; x: number; y: number } | null>(null);
  const [todoForm, setTodoForm]         = useState<{ date: string } | null>(null);
  const [todoInput, setTodoInput]       = useState('');
  const [todoUser, setTodoUser]         = useState<'ldy' | 'juhae' | 'common'>('ldy');
  const [todoEndDate, setTodoEndDate]   = useState('');
  const pickerRef       = useRef<HTMLDivElement>(null);
  const fePopupRef      = useRef<HTMLDivElement>(null);
  const dateActionRef   = useRef<HTMLDivElement>(null);

  // CALENDAR_CATEGORY 공통코드 로드 (detailCode → detailCodeName 변환용)
  useEffect(() => {
    getCommonCodes('CALENDAR_CATEGORY').then(setCatCodes).catch(() => {});
    getDdays().then(setDdays).catch(() => {});
  }, []);

  const catName = (code: string | null) =>
    code ? (catCodes.find(c => c.detailCode === code)?.detailCodeName ?? code) : null;

  // 고정비 팝업 외부 클릭 시 닫기
  useEffect(() => {
    if (!fePopup) return;
    const handler = (e: MouseEvent) => {
      if (fePopupRef.current && !fePopupRef.current.contains(e.target as Node)) setFePopup(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fePopup]);

  // 피커 바깥 클릭 시 닫기
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  // 날짜 액션 팝업 외부 클릭 시 닫기
  useEffect(() => {
    if (!dateActionPopup) return;
    const handler = (e: MouseEvent) => {
      if (dateActionRef.current && !dateActionRef.current.contains(e.target as Node)) setDateActionPopup(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dateActionPopup]);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  // 렌더 시점 기준 오늘 날짜 — now는 마운트 시 고정이므로 직접 계산
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  const load = useCallback(async () => {
    setLoading(true);
    const ym6 = yearMonth.replace('-', ''); // YYYY-MM → YYYYMM
    try {
      const [sched, feData, todoData] = await Promise.all([
        getSchedules(yearMonth),
        getFixedExpenseCalendar(ym6),
        getTodos(yearMonth),
      ]);
      setSchedules(sched);
      setFeCalendar(feData);
      setTodos(todoData);
    } finally { setLoading(false); }
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

  // 날짜 → 해당 날짜에 걸치는 모든 일정 맵 (반복/다일 이벤트 모두 확장)
  const daysInMonth = new Date(year, month, 0).getDate();
  const schedulesByDate = useMemo(() => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const map: Record<string, Schedule[]> = {};
    schedules.forEach(s => {
      if (s.repeatType) {
        // 반복 이벤트: 이번 달 전체 날짜를 순회하며 패턴 매칭
        for (let d = 1; d <= daysInMonth; d++) {
          const ds = `${year}-${pad2(month)}-${pad2(d)}`;
          if (isEventActiveOn(s, ds)) (map[ds] ??= []).push(s);
        }
      } else {
        // 일반/다일 이벤트: eventDate ~ endDate 범위 확장
        const start = new Date(s.eventDate + 'T00:00:00');
        const end   = new Date((s.endDate || s.eventDate) + 'T00:00:00');
        const cur   = new Date(start);
        while (cur <= end) {
          const ds = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
          (map[ds] ??= []).push(s);
          cur.setDate(cur.getDate() + 1);
        }
      }
    });
    return map;
  }, [schedules, year, month, daysInMonth]);

  // 달력 셀 배열 (null=빈칸)
  const firstDay = new Date(year, month - 1, 1).getDay();
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

  // 모든 주의 lanes를 미리 계산 — maxBarsH로 주 행 높이를 통일해 이벤트 칩이 제각각 위치 표시되는 문제 방지
  const allWeekLanes = useMemo(() =>
    weeks.map(week =>
      buildLanes(week, week.map(day => day ? toDateStr(day) : null), schedules)
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedules, weeks.length, year, month]
  );
  const maxBarsH = Math.max(0, ...allWeekLanes.map(l => l.length * (BAR_H + BAR_GAP)));

  // 이번 달 일정 목록 — 오늘 포함 이후만 표시 (지난 일정 제외)
  // 반복 이벤트는 이번 달 발생일 중 오늘 이후인 게 있을 때만 포함
  const schedulesThisMonth = useMemo(() => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    return schedules.filter(s => {
      if (s.repeatType) {
        // 반복 이벤트: 이번 달 오늘 이후 발생일이 있으면 포함
        for (let d = 1; d <= daysInMonth; d++) {
          const ds = `${year}-${pad2(month)}-${pad2(d)}`;
          if (ds >= todayStr && isEventActiveOn(s, ds)) return true;
        }
        return false;
      }
      // 일반 이벤트: 종료일(없으면 시작일) 기준으로 오늘 이상인 것만
      const endStr = s.endDate && s.endDate > s.eventDate ? s.endDate : s.eventDate;
      return endStr >= todayStr;
    }).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }, [schedules, year, month, daysInMonth, todayStr]);

  // 이번 달 할일 — 완료 + 날짜 지난 항목 제외, 날짜 오름차순
  const todosThisMonth = useMemo(() => {
    return todos
      .filter(t => {
        const endStr = t.endDate && t.endDate > t.todoDate ? t.endDate : t.todoDate;
        if (endStr >= todayStr) return true;
        // 날짜가 지났으면: 다일 할일은 doneDate 기준, 단일은 isDone 기준
        const done = t.endDate && t.endDate > t.todoDate ? !!t.doneDate : t.isDone;
        return !done;
      })
      .sort((a, b) => a.todoDate.localeCompare(b.todoDate) || a.id - b.id);
  }, [todos, todayStr]);

  // 할일 저장
  const handleSaveTodo = async () => {
    if (!todoInput.trim() || !todoForm) return;
    const endDate = todoEndDate && todoEndDate > todoForm.date ? todoEndDate : undefined;
    const newTodo = await createTodo({ userId: todoUser, title: todoInput.trim(), todoDate: todoForm.date, endDate });
    setTodos(prev => [...prev, newTodo]);
    setTodoInput('');
    setTodoEndDate('');
    setTodoForm(null);
  };

  // D-Day 저장
  const handleSaveDday = async () => {
    if (!ddayTitle.trim() || !ddayDate) return;
    setDdaySaving(true);
    try {
      const created = await createDday({ userId: ddayUser, title: ddayTitle.trim(), targetDate: ddayDate });
      setDdays(prev => [...prev, created].sort((a, b) => a.targetDate.localeCompare(b.targetDate)));
      onDdayChange?.();
      setDdayTitle(''); setDdayDate(''); setDdayFormOpen(false);
    } finally { setDdaySaving(false); }
  };

  // D-Day 삭제
  const handleDeleteDday = async (id: number) => {
    if (!window.confirm('D-Day를 삭제하시겠습니까?')) return;
    await deleteDday(id);
    setDdays(prev => prev.filter(d => d.id !== id));
    onDdayChange?.();
  };

  const todayStr2 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 다일 할일 여부
  const isMultiDay = (t: Todo) => !!(t.endDate && t.endDate > t.todoDate);

  // 특정 날짜 기준 완료 여부
  const isTodoDone = (t: Todo) =>
    isMultiDay(t) ? t.doneDate === todayStr2 : t.isDone;

  // 할일 완료 토글
  const handleToggleTodo = async (todo: Todo) => {
    let updated: Todo;
    if (isMultiDay(todo)) {
      // 다일: done_date 토글 (오늘 날짜 기준)
      const newDoneDate = todo.doneDate === todayStr2 ? null : todayStr2;
      updated = await updateTodo(todo.id, { doneDate: newDoneDate });
    } else {
      updated = await updateTodo(todo.id, { isDone: !todo.isDone });
    }
    setTodos(prev => prev.map(t => t.id === todo.id ? updated : t));
  };

  // 할일 삭제
  const handleDeleteTodo = async (todoId: number) => {
    if (!window.confirm('할일을 삭제하시겠습니까?')) return;
    await deleteTodo(todoId);
    setTodos(prev => prev.filter(t => t.id !== todoId));
  };

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
          background: '#fff',
          borderRadius: isMobile ? '0' : '16px',
          width: '100%',
          maxWidth: isMobile ? '100%' : '860px',
          height: isMobile ? '100%' : undefined,
          maxHeight: isMobile ? '100%' : '92vh',
          overflowY: 'auto',
          boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
        }}>
          {/* 헤더 */}
          <div style={{
            padding: isMobile ? '16px 20px' : '20px 28px', borderBottom: '1px solid #f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, background: '#fff', zIndex: 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }} ref={pickerRef}>
              <button onClick={prevMonth} style={{ background: 'none', border: 'none', fontSize: isMobile ? '18px' : '22px', cursor: 'pointer', color: '#5f6368', lineHeight: 1 }}>‹</button>

              {/* 연월 클릭 → 피커 드롭다운 */}
              <button
                onClick={() => { setPickerYear(year); setShowPicker(v => !v); }}
                style={{
                  background: showPicker ? '#f0f8fd' : 'none',
                  border: showPicker ? '1px solid #89CFF0' : '1px solid transparent',
                  borderRadius: '8px',
                  padding: '4px 10px',
                  fontWeight: 800, fontSize: isMobile ? '16px' : '20px',
                  color: '#1a3a5c',
                  minWidth: isMobile ? '110px' : '140px', textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                {year}년 {month}월 ▾
              </button>

              <button onClick={nextMonth} style={{ background: 'none', border: 'none', fontSize: isMobile ? '18px' : '22px', cursor: 'pointer', color: '#5f6368', lineHeight: 1 }}>›</button>

              {/* 연월 피커 드롭다운 */}
              {showPicker && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 200,
                  background: '#fff', border: '1px solid #dadce0', borderRadius: '14px',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.14)', padding: '16px 14px',
                  minWidth: '220px',
                }}>
                  {/* 연도 선택 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <button
                      onClick={() => setPickerYear(y => y - 1)}
                      style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#5f6368', lineHeight: 1, padding: '2px 8px' }}
                    >‹</button>
                    <span style={{ fontWeight: 800, fontSize: '16px', color: '#1a3a5c' }}>{pickerYear}년</span>
                    <button
                      onClick={() => setPickerYear(y => y + 1)}
                      style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#5f6368', lineHeight: 1, padding: '2px 8px' }}
                    >›</button>
                  </div>

                  {/* 월 그리드 4×3 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                      const isSelected = pickerYear === year && m === month;
                      const isToday    = pickerYear === now.getFullYear() && m === now.getMonth() + 1;
                      return (
                        <button
                          key={m}
                          onClick={() => { setYear(pickerYear); setMonth(m); setShowPicker(false); }}
                          style={{
                            padding: '8px 2px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                            border: isToday && !isSelected ? '1px solid #89CFF0' : '1px solid transparent',
                            background: isSelected ? '#89CFF0' : '#fff',
                            color:      isSelected ? '#fff' : '#344054',
                            fontWeight: isSelected ? 700 : 400,
                          }}
                        >
                          {m}월
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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

          {/* 월별 일정 목록 — 달력 위, 접었다 폈다 가능 */}
          <div style={{ borderBottom: '1px solid #f0f0f0' }}>
            {/* 섹션 헤더 — 항상 표시 */}
            <button
              onClick={() => setListOpen(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: isMobile ? '10px 16px' : '10px 20px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: isMobile ? '12px' : '13px', color: '#5f6368', fontWeight: 600,
              }}
            >
              <span>
                {month}월 일정 ({schedulesThisMonth.length}건)
                {isMobile ? (
                  todosThisMonth.length > 0 && (
                    <span style={{ marginLeft: '8px', color: '#7DC8A0' }}>· 할일 {todosThisMonth.length}건</span>
                  )
                ) : (
                  <span style={{ marginLeft: '8px', color: '#7DC8A0' }}>· 할일 {todosThisMonth.length}건</span>
                )}
              </span>
              <span style={{ fontSize: '12px', color: '#9aa0a6' }}>{listOpen ? '▲ 접기' : '▼ 펼치기'}</span>
            </button>

            {listOpen && (
              // 데스크탑: 좌(일정) · 우(할일) 50:50 나란히 / 모바일: 세로 적층
              <div style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: 'stretch',
              }}>
                {/* ── 일정 목록 ── */}
                <div style={{
                  flex: 1,
                  padding: isMobile ? '0 16px 10px' : '8px 12px 12px 20px',
                  display: 'flex', flexDirection: 'column', gap: '4px',
                  maxHeight: isMobile ? '240px' : '260px', overflowY: 'auto',
                  borderRight: isMobile ? 'none' : '1px solid #f0f0f0',
                }}>
                  {!isMobile && (
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', marginBottom: '2px', flexShrink: 0 }}>
                      📅 일정 {schedulesThisMonth.length}건
                    </div>
                  )}
                  {schedulesThisMonth.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#9aa0a6', padding: '4px 2px' }}>이후 일정이 없습니다.</div>
                  ) : schedulesThisMonth.map((s, si) => {
                    const name = catName(s.category);
                    const isImportant = s.category === 'IMPORTANT';
                    // 반복 이벤트는 이번 달 오늘 이후 첫 발생일로 이동
                    const jumpDate = s.repeatType
                      ? (Object.keys(schedulesByDate)
                          .filter(d => d >= todayStr && d.startsWith(`${year}-${String(month).padStart(2,'0')}`) && (schedulesByDate[d] ?? []).some(x => x.id === s.id))
                          .sort()[0] ?? s.eventDate)
                      : s.eventDate;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedDate(jumpDate)}
                        style={{
                          display: 'flex', gap: '8px', alignItems: 'center',
                          padding: '5px 10px', borderRadius: '7px',
                          background: isImportant ? '#fff5f5' : '#f9f9fb',
                          border: isImportant ? '1px solid #ffcdd2' : '1px solid transparent',
                          fontSize: '12px', cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        <span style={{
                          width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                          background: catColor(s.category, si),
                        }} />
                        <span style={{ fontSize: '13px', flexShrink: 0 }}>{USER_EMOJI[s.userId] ?? ''}</span>
                        <span style={{ color: '#9aa0a6', flexShrink: 0, fontSize: '11px' }}>
                          {s.repeatType ? (
                            (() => {
                              const pad2 = (n: number) => String(n).padStart(2, '0');
                              const days: string[] = [];
                              for (let d = 1; d <= daysInMonth; d++) {
                                const ds = `${year}-${pad2(month)}-${pad2(d)}`;
                                if (ds >= todayStr && isEventActiveOn(s, ds)) days.push(`${month}/${d}`);
                              }
                              const label = { weekly: '매주', monthly: '매달', yearly: '매년' }[s.repeatType] ?? '';
                              return `${label} ${days.slice(0, 3).join(', ')}${days.length > 3 ? '…' : ''}`;
                            })()
                          ) : (
                            <>
                              {s.eventDate.slice(5).replace('-', '/')}
                              {s.endDate && s.endDate > s.eventDate ? ` ~ ${s.endDate.slice(5).replace('-', '/')}` : ''}
                            </>
                          )}
                          {s.eventTime ? ` ${s.eventTime}` : ''}
                        </span>
                        {name && (
                          <span style={{
                            fontSize: '10px', borderRadius: '4px', padding: '0 5px', flexShrink: 0,
                            background: isImportant ? '#ffcdd2' : '#e8f0fe',
                            color: isImportant ? '#c62828' : '#1565c0',
                            fontWeight: 600,
                          }}>
                            {name}
                          </span>
                        )}
                        <span style={{ color: '#344054', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {scheduleTitle(s)}
                        </span>
                        {s.repeatType && (
                          <span style={{ color: '#6a1b9a', fontSize: '10px', background: '#f3e5f5', borderRadius: '3px', padding: '0 4px', flexShrink: 0 }}>
                            반복
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── 할일 목록 ── */}
                <div style={{
                  flex: 1,
                  padding: isMobile ? '0 16px 10px' : '8px 20px 12px 12px',
                  display: 'flex', flexDirection: 'column', gap: '4px',
                  maxHeight: isMobile ? '200px' : '260px', overflowY: 'auto',
                  borderTop: isMobile ? '1px solid #f0f0f0' : 'none',
                  marginTop: isMobile ? '4px' : 0,
                }}>
                  {!isMobile && (
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#7DC8A0', marginBottom: '2px', flexShrink: 0 }}>
                      ✅ 할일 {todosThisMonth.length}건
                    </div>
                  )}
                  {todosThisMonth.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#9aa0a6', padding: '4px 2px' }}>할일이 없습니다.</div>
                  ) : todosThisMonth.map(t => (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '4px 8px', borderRadius: '7px', background: '#f4fbf6', flexShrink: 0,
                    }}>
                      <input
                        type="checkbox"
                        checked={isTodoDone(t)}
                        onChange={() => handleToggleTodo(t)}
                        style={{ cursor: 'pointer', accentColor: '#7DC8A0', width: '14px', height: '14px', flexShrink: 0 }}
                      />
                      <span style={{ fontSize: '11px', color: '#9aa0a6', flexShrink: 0 }}>
                        {t.todoDate.slice(5).replace('-', '/')}
                        {t.endDate && t.endDate > t.todoDate ? ` ~ ${t.endDate.slice(5).replace('-', '/')}` : ''}
                      </span>
                      <span style={{ fontSize: '13px', flexShrink: 0 }}>{USER_EMOJI[t.userId] ?? ''}</span>
                      <span style={{
                        fontSize: '12px', color: isTodoDone(t) ? '#9aa0a6' : '#344054',
                        textDecoration: isTodoDone(t) ? 'line-through' : 'none',
                        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{t.title}</span>
                      <button
                        onClick={() => handleDeleteTodo(t.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: '14px', flexShrink: 0, lineHeight: 1, padding: '0 2px' }}
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

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
              const lanes = allWeekLanes[weekIdx];
              const barsH = maxBarsH;

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
                          onClick={(e) => {
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setDateActionPopup({ date: dateStr, x: r.left, y: r.bottom + 4 });
                          }}
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
                          {/* 날짜 숫자 + 고정비 원 */}
                          <div style={{ height: DAY_NUM_H, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{
                                fontWeight: isToday ? 800 : 500,
                                fontSize: isMobile ? '13px' : '15px',
                                color: isToday ? '#1565c0' : isSun ? '#E06060' : isSat ? '#1565c0' : '#344054',
                              }}>{day}</span>
                              {/* D-Day 마킹 — 해당 날짜에 D-Day 있을 때 표시 */}
                              {ddays.some(d => d.targetDate === dateStr) && (
                                <span style={{ fontSize: '8px', color: '#E06060', fontWeight: 700, lineHeight: 1 }}>📌</span>
                              )}
                            </div>
                            {/* 고정비 납부일 표시 원 */}
                            {(feCalendar?.ldy?.[dateStr] || feCalendar?.juhae?.[dateStr]) && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '2px' }}>
                                {(['ldy', 'juhae'] as const).map(uid => {
                                  const items = feCalendar?.[uid]?.[dateStr];
                                  if (!items) return null;
                                  const color = uid === 'ldy' ? '#E07070' : '#89CFF0';
                                  const allPaid = items.every(x => x.paid);
                                  return (
                                    <div
                                      key={uid}
                                      onClick={e => {
                                        e.stopPropagation();
                                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                        setFePopup({ date: dateStr, x: r.left - 90, y: r.bottom + 4 });
                                      }}
                                      style={{
                                        width: 9, height: 9, borderRadius: '50%', cursor: 'pointer',
                                        border: `1.5px solid ${color}`,
                                        background: allPaid ? color : 'transparent',
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>

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
                                {USER_EMOJI[s.userId] ?? ''}{s.eventTime ? ` ${s.eventTime}` : ''} {scheduleTitle(s)}
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
                            const weekStart = dates.find(Boolean) ?? '';
                            const weekEnd   = [...dates].reverse().find(Boolean) ?? '';
                            // 이번 주 이전에 시작된 경우 → 왼쪽 끝 flat
                            const fromPrev = event.eventDate < weekStart;
                            // 이번 주 이후에도 계속되는 경우 → 오른쪽 끝 flat
                            const toNext   = event.endDate! > weekEnd;
                            // 단일일 칩과 동일한 3px 라운드, 주 경계 연결 부분만 flat
                            const radL = fromPrev ? '0' : '3px';
                            const radR = toNext   ? '0' : '3px';
                            return (
                              <div
                                key={event.id}
                                onClick={() => setSelectedDate(dates[startCol]!)}
                                style={{
                                  gridColumn: `${startCol + 1} / span ${endCol - startCol + 1}`,
                                  height: BAR_H,
                                  background: color,
                                  borderRadius: `${radL} ${radR} ${radR} ${radL}`,
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
                                {USER_EMOJI[event.userId] ?? ''} {scheduleTitle(event)}
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

        </div>
      </div>

      {/* ── D-Day 관리 섹션 ── */}
      <div style={{ borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
        {/* 섹션 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '10px 16px' : '10px 20px',
        }}>
          <button
            onClick={() => setDdayOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: 0 }}
          >
            <span style={{ fontSize: isMobile ? '12px' : '13px', color: '#5f6368', fontWeight: 600 }}>
              📌 D-Day ({ddays.length}건)
            </span>
            <span style={{ fontSize: '12px', color: '#9aa0a6' }}>{ddayOpen ? '▲' : '▼'}</span>
          </button>
          {!ddayFormOpen && (
            <button
              onClick={() => setDdayFormOpen(true)}
              style={{
                padding: '4px 12px', fontSize: '12px', fontWeight: 600,
                border: '1px solid #E06060', borderRadius: '12px',
                background: '#fff5f5', color: '#E06060', cursor: 'pointer',
              }}
            >+ 추가</button>
          )}
        </div>

        {ddayOpen && (
          <div style={{ padding: isMobile ? '0 16px 14px' : '0 20px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* 추가 폼 */}
            {ddayFormOpen && (
              <div style={{
                padding: '12px', borderRadius: '10px', border: '1px solid #ffcdd2',
                background: '#fff5f5', display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                <input
                  value={ddayTitle}
                  onChange={e => setDdayTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveDday(); if (e.key === 'Escape') setDdayFormOpen(false); }}
                  placeholder="D-Day 제목 (예: 잔금일, 계약 만료)"
                  autoFocus
                  style={{
                    padding: '8px 12px', fontSize: '13px', border: '1px solid #e0e0e0',
                    borderRadius: '8px', outline: 'none', boxSizing: 'border-box', width: '100%',
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={ddayDate}
                    onChange={e => setDdayDate(e.target.value)}
                    style={{
                      flex: 1, padding: '7px 10px', fontSize: '13px',
                      border: '1px solid #e0e0e0', borderRadius: '8px', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['ldy', 'juhae', 'common'] as const).map(uid => (
                      <button
                        key={uid}
                        onClick={() => setDdayUser(uid)}
                        style={{
                          padding: '6px 8px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer',
                          border: ddayUser === uid ? '2px solid #E06060' : '1px solid #dadce0',
                          background: ddayUser === uid ? '#fff5f5' : '#fff',
                          color: ddayUser === uid ? '#E06060' : '#5f6368',
                          fontWeight: ddayUser === uid ? 700 : 400,
                        }}
                      >{uid === 'ldy' ? '🐴' : uid === 'juhae' ? '☀️' : '❤️'}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setDdayFormOpen(false); setDdayTitle(''); setDdayDate(''); }}
                    style={{ padding: '6px 14px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', cursor: 'pointer', color: '#5f6368' }}
                  >취소</button>
                  <button
                    onClick={handleSaveDday}
                    disabled={!ddayTitle.trim() || !ddayDate || ddaySaving}
                    style={{
                      padding: '6px 16px', fontSize: '12px', fontWeight: 700, border: 'none',
                      borderRadius: '6px', background: ddayTitle.trim() && ddayDate ? '#E06060' : '#ccc',
                      color: '#fff', cursor: ddayTitle.trim() && ddayDate ? 'pointer' : 'default',
                    }}
                  >{ddaySaving ? '저장 중...' : '저장'}</button>
                </div>
              </div>
            )}

            {/* D-Day 목록 */}
            {ddays.length === 0 && !ddayFormOpen ? (
              <div style={{ fontSize: '12px', color: '#9aa0a6', padding: '4px 2px' }}>등록된 D-Day가 없습니다.</div>
            ) : (
              ddays.map(d => {
                const diff = calcDdayDiff(d.targetDate);
                const badgeColor = ddayBadgeColor(diff);
                const userEmoji = d.userId === 'ldy' ? '🐴' : d.userId === 'juhae' ? '☀️' : '❤️';
                return (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', borderRadius: '8px',
                    background: diff === 0 ? '#fff0f0' : diff < 0 ? '#f8f8f8' : '#fff',
                    border: `1px solid ${diff === 0 ? '#ffb3b3' : '#e8eaed'}`,
                  }}>
                    {/* D-Day 배지 */}
                    <span style={{
                      fontSize: '11px', fontWeight: 800, color: '#fff',
                      background: badgeColor, borderRadius: '6px',
                      padding: '2px 7px', flexShrink: 0, minWidth: '46px', textAlign: 'center',
                    }}>{ddayLabel(diff)}</span>
                    {/* 제목 + 날짜 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: diff < 0 ? '#9aa0a6' : '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {userEmoji} {d.title}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9aa0a6' }}>{d.targetDate}</div>
                    </div>
                    {/* 삭제 버튼 */}
                    <button
                      onClick={() => handleDeleteDday(d.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: '16px', padding: '0 2px', flexShrink: 0 }}
                    >×</button>
                  </div>
                );
              })
            )}
          </div>
        )}
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

      {/* 고정비 납부일 팝업 */}
      {fePopup && (
        <div
          ref={fePopupRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: Math.max(4, Math.min(fePopup.x, window.innerWidth - 230)),
            top: fePopup.y,
            zIndex: 10003,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '10px',
            padding: '12px 14px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            minWidth: '200px',
            maxWidth: '260px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '13px', color: '#344054', marginBottom: '10px' }}>
            {fePopup.date.slice(5).replace('-', '/')} 고정비
          </div>
          {(['ldy', 'juhae'] as const).map(uid => {
            const items = feCalendar?.[uid]?.[fePopup.date];
            if (!items) return null;
            const color = uid === 'ldy' ? '#E07070' : '#89CFF0';
            const emoji = uid === 'ldy' ? '🐴' : '☀️';
            return items.map(fe => (
              <div key={fe.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <div style={{
                  width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                  border: `1.5px solid ${color}`,
                  background: fe.paid ? color : 'transparent',
                }} />
                <span style={{ fontSize: '12px', color: '#344054', flex: 1 }}>{emoji} {fe.name}</span>
                <span style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}>
                  {Math.round(fe.amount / 10000)}만
                </span>
              </div>
            ));
          })}
        </div>
      )}

      {/* 날짜 클릭 → 일정/할일 선택 팝업 */}
      {dateActionPopup && (
        <div
          ref={dateActionRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: Math.max(4, Math.min(dateActionPopup.x, window.innerWidth - 160)),
            top: Math.min(dateActionPopup.y, window.innerHeight - 100),
            zIndex: 10001,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '10px',
            padding: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: '140px',
          }}
        >
          <div style={{ fontSize: '11px', color: '#9aa0a6', padding: '2px 8px 4px', fontWeight: 600 }}>
            {dateActionPopup.date.slice(5).replace('-', '/')}
          </div>
          <button
            onClick={() => { setSelectedDate(dateActionPopup.date); setDateActionPopup(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 12px', borderRadius: '8px', border: 'none',
              background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '13px', color: '#344054',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f0f8fd'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            📅 일정 추가
          </button>
          <button
            onClick={() => { setTodoForm({ date: dateActionPopup.date }); setTodoUser('ldy'); setTodoInput(''); setTodoEndDate(''); setDateActionPopup(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 12px', borderRadius: '8px', border: 'none',
              background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '13px', color: '#344054',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f4fbf6'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            ✅ 할일 추가
          </button>
        </div>
      )}

      {/* 할일 추가 폼 모달 */}
      {todoForm && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setTodoForm(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: '#fff', borderRadius: '14px', padding: '22px 24px',
            minWidth: '280px', maxWidth: '380px', width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#1a3a5c', marginBottom: '16px' }}>
              ✅ 할일 추가 — {todoForm.date.slice(5).replace('-', '/')}
            </div>

            {/* 사용자 선택 */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
              {(['ldy', 'juhae', 'common'] as const).map(uid => (
                <button
                  key={uid}
                  onClick={() => setTodoUser(uid)}
                  style={{
                    flex: 1, padding: '7px 4px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                    border: todoUser === uid ? '2px solid #7DC8A0' : '1px solid #dadce0',
                    background: todoUser === uid ? '#f4fbf6' : '#fff',
                    color: todoUser === uid ? '#2e7d32' : '#5f6368',
                    fontWeight: todoUser === uid ? 700 : 400,
                  }}
                >
                  {uid === 'ldy' ? '🐴 동영' : uid === 'juhae' ? '☀️ 주해' : '❤️ 공통'}
                </button>
              ))}
            </div>

            {/* 할일 제목 입력 */}
            <input
              value={todoInput}
              onChange={e => setTodoInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveTodo(); if (e.key === 'Escape') setTodoForm(null); }}
              placeholder="할일을 입력하세요"
              autoFocus
              style={{
                width: '100%', padding: '9px 12px', fontSize: '14px',
                border: '1px solid #dadce0', borderRadius: '8px', outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#7DC8A0'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#dadce0'; }}
            />

            {/* 기간 설정 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <span style={{ fontSize: '12px', color: '#5f6368', flexShrink: 0 }}>기간</span>
              <span style={{ fontSize: '12px', color: '#344054', fontWeight: 600 }}>
                {todoForm.date.slice(5).replace('-', '/')}
              </span>
              <span style={{ fontSize: '12px', color: '#9aa0a6' }}>~</span>
              <input
                type="date"
                value={todoEndDate}
                min={todoForm.date}
                onChange={e => setTodoEndDate(e.target.value)}
                style={{
                  flex: 1, padding: '6px 10px', fontSize: '13px',
                  border: '1px solid #dadce0', borderRadius: '8px', outline: 'none',
                  color: todoEndDate ? '#344054' : '#9aa0a6',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#7DC8A0'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#dadce0'; }}
              />
              {todoEndDate && (
                <button
                  onClick={() => setTodoEndDate('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: '16px', lineHeight: 1, padding: 0 }}
                >×</button>
              )}
            </div>

            {/* 버튼 */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setTodoForm(null)}
                style={{
                  padding: '8px 16px', fontSize: '13px', borderRadius: '8px',
                  border: '1px solid #dadce0', background: '#fff', color: '#5f6368', cursor: 'pointer',
                }}
              >취소</button>
              <button
                onClick={handleSaveTodo}
                disabled={!todoInput.trim()}
                style={{
                  padding: '8px 18px', fontSize: '13px', borderRadius: '8px', border: 'none',
                  background: todoInput.trim() ? '#7DC8A0' : '#ccc',
                  color: '#fff', cursor: todoInput.trim() ? 'pointer' : 'default', fontWeight: 700,
                }}
              >저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CalendarModal;
