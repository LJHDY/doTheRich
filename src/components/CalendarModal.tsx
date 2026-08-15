import React, { useCallback, useEffect, useState } from 'react';
import { Schedule } from '../types';
import { getSchedules } from '../services/api';
import ScheduleFormModal, { USER_EMOJI } from './ScheduleFormModal';

interface Props {
  onClose: () => void;
}

// 카테고리별 색상 (순환)
const CAT_COLORS = ['#89CFF0', '#FFD97D', '#E06060', '#7DC8A0', '#BA8BD8', '#FF9800', '#1565c0'];
const catColor = (cat: string | null, idx: number) =>
  cat ? CAT_COLORS[Math.abs(cat.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % CAT_COLORS.length]
      : CAT_COLORS[idx % CAT_COLORS.length];

const CalendarModal: React.FC<Props> = ({ onClose }) => {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1~12
  const [schedules, setSchedules]     = useState<Schedule[]>([]);
  const [loading, setLoading]         = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const todayStr  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getSchedules(yearMonth);
      setSchedules(rows);
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => { load(); }, [load]);

  // 날짜별 일정 맵
  const byDate = schedules.reduce<Record<string, Schedule[]>>((acc, s) => {
    (acc[s.eventDate] ??= []).push(s);
    return acc;
  }, {});

  // 달력 날짜 배열 생성 (앞뒤 빈칸 포함)
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=일
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // 6행 맞추기 위해 패딩
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
  };

  const selectedSchedules = selectedDate ? (byDate[selectedDate] ?? []) : [];

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
          background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px',
          maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
        }}>
          {/* 헤더 */}
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, background: '#fff', zIndex: 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={prevMonth} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#5f6368', lineHeight: 1 }}>‹</button>
              <span style={{ fontWeight: 800, fontSize: '16px', color: '#1a3a5c', minWidth: '110px', textAlign: 'center' }}>
                {year}년 {month}월
              </span>
              <button onClick={nextMonth} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#5f6368', lineHeight: 1 }}>›</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {loading && <span style={{ fontSize: '12px', color: '#9aa0a6' }}>불러오는 중…</span>}
              <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
                style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #dadce0', background: '#fff', cursor: 'pointer', color: '#5f6368' }}>
                오늘
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9aa0a6' }}>×</button>
            </div>
          </div>

          {/* 요일 헤더 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            padding: '8px 12px 4px',
            gap: '2px',
          }}>
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} style={{
                textAlign: 'center', fontSize: '11px', fontWeight: 700,
                color: i === 0 ? '#E06060' : i === 6 ? '#1565c0' : '#9aa0a6',
                padding: '4px 0',
              }}>{d}</div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            padding: '0 12px 16px',
            gap: '3px',
          }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={idx} />;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const daySched = byDate[dateStr] ?? [];
              const isToday  = dateStr === todayStr;
              const isSun = idx % 7 === 0;
              const isSat = idx % 7 === 6;
              return (
                <div
                  key={idx}
                  onClick={() => handleDayClick(day)}
                  style={{
                    minHeight: '72px', padding: '5px 5px 4px',
                    borderRadius: '8px', cursor: 'pointer',
                    border: `1.5px solid ${isToday ? '#89CFF0' : '#f0f0f0'}`,
                    background: isToday ? '#f0f8fd' : '#fff',
                    transition: 'background 0.1s',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isToday ? '#e0f4fc' : '#f8fbff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isToday ? '#f0f8fd' : '#fff'; }}
                >
                  <div style={{
                    fontWeight: isToday ? 800 : 500,
                    fontSize: '13px',
                    color: isToday ? '#1565c0' : isSun ? '#E06060' : isSat ? '#1565c0' : '#344054',
                    marginBottom: '3px',
                  }}>{day}</div>
                  {/* 일정 칩 — 최대 3개 표시 후 +N */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {daySched.slice(0, 3).map((s, si) => (
                      <div key={s.id} style={{
                        fontSize: '10px', lineHeight: '14px',
                        background: catColor(s.category, si),
                        color: '#fff', borderRadius: '3px',
                        padding: '1px 4px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontWeight: 600,
                      }}>
                        {USER_EMOJI[s.userId] ?? ''}{s.eventTime ? ` ${s.eventTime}` : ''} {s.title}
                      </div>
                    ))}
                    {daySched.length > 3 && (
                      <div style={{ fontSize: '10px', color: '#9aa0a6', paddingLeft: '2px' }}>
                        +{daySched.length - 3}개
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 하단 이번 달 일정 요약 */}
          {schedules.length > 0 && (
            <div style={{ padding: '0 16px 16px' }}>
              <div style={{ fontSize: '12px', color: '#9aa0a6', fontWeight: 600, marginBottom: '8px' }}>
                {month}월 전체 일정 ({schedules.length}건)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto' }}>
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
                      {s.eventTime ? ` ${s.eventTime}` : ''}
                    </span>
                    {s.category && (
                      <span style={{ color: '#1565c0', fontSize: '11px', background: '#e8f0fe', borderRadius: '4px', padding: '0 4px' }}>
                        {s.category}
                      </span>
                    )}
                    <span style={{ color: '#344054', fontWeight: 600 }}>{s.title}</span>
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
