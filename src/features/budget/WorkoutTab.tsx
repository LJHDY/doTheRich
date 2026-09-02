import React, { useCallback, useEffect, useState } from 'react';
import { WorkoutLog, WorkoutType, CommonCode } from '../../types';
import { createWorkout, deleteWorkout, getCommonCodes, getWorkouts } from '../../services/api';

interface Props {
  userId: string;
}

type SetRow = { weight: string; reps: string };

const MUSCLE_GROUPS = ['등', '가슴', '하체', '이두', '삼두', '어깨'];
const TODAY = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

const inp: React.CSSProperties = {
  padding: '7px 10px', fontSize: '13px', border: '1px solid #dadce0',
  borderRadius: '6px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const WorkoutTab: React.FC<Props> = ({ userId }) => {
  const [date, setDate] = useState(TODAY());
  const [subTab, setSubTab] = useState<WorkoutType>('TENNIS');
  const [logs, setLogs] = useState<WorkoutLog[]>([]);

  // 테니스 폼
  const [tGames, setTGames] = useState('');
  const [tMin, setTMin] = useState('');
  const [tMemo, setTMemo] = useState('');

  // 헬스 폼
  const [hMuscle, setHMuscle] = useState(MUSCLE_GROUPS[0]);
  const [hExercises, setHExercises] = useState<CommonCode[]>([]);
  const [hExName, setHExName] = useState('');
  // 세트 목록 — 무게(선택)·횟수 1:N 입력
  const [hSetRows, setHSetRows] = useState<SetRow[]>([{ weight: '', reps: '' }]);

  // 러닝 폼
  const [rMin, setRMin] = useState('');
  const [rKm, setRKm] = useState('');
  const [rMemo, setRMemo] = useState('');

  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await getWorkouts(userId, date);
    setLogs(data);
  }, [userId, date]);

  useEffect(() => { load(); }, [load]);

  // 운동부위 변경 시 공통코드에서 운동종류 로드
  useEffect(() => {
    getCommonCodes(`WORKOUT_${hMuscle}`).then(codes => {
      setHExercises(codes);
      setHExName(codes[0]?.detailCode ?? '');
    });
  }, [hMuscle]);

  // 세트 행 조작 헬퍼
  const updateSetRow = (i: number, field: keyof SetRow, val: string) =>
    setHSetRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addSetRow = () => setHSetRows(prev => [...prev, { weight: prev[prev.length - 1]?.weight ?? '', reps: '' }]);
  const removeSetRow = (i: number) => setHSetRows(prev => prev.filter((_, idx) => idx !== i));

  const handleSaveTennis = async () => {
    if (!tGames && !tMin) return;
    setSaving(true);
    try {
      const created = await createWorkout({
        userId, workoutDate: date, workoutType: 'TENNIS',
        gameCount: tGames ? Number(tGames) : undefined,
        durationMinutes: tMin ? Number(tMin) : undefined,
        memo: tMemo || undefined,
      });
      setLogs(prev => [...prev, created]);
      setTGames(''); setTMin(''); setTMemo('');
    } finally { setSaving(false); }
  };

  const handleSaveHealth = async () => {
    const validRows = hSetRows.filter(r => r.reps.trim());
    if (!hExName || validRows.length === 0) return;
    setSaving(true);
    try {
      const setsData = validRows.map(r => ({
        weight: r.weight ? Number(r.weight) : null,
        reps: Number(r.reps),
      }));
      // sets는 백엔드에서 setsData.length로 자동 계산
      const created = await createWorkout({
        userId, workoutDate: date, workoutType: 'HEALTH',
        muscleGroup: hMuscle,
        exerciseName: hExName,
        setsData,
      } as any);
      setLogs(prev => [...prev, created]);
      setHSetRows([{ weight: '', reps: '' }]);
    } finally { setSaving(false); }
  };

  const handleSaveRunning = async () => {
    if (!rMin && !rKm) return;
    setSaving(true);
    try {
      const created = await createWorkout({
        userId, workoutDate: date, workoutType: 'RUNNING',
        durationMinutes: rMin ? Number(rMin) : undefined,
        distanceKm: rKm ? Number(rKm) : undefined,
        memo: rMemo || undefined,
      });
      setLogs(prev => [...prev, created]);
      setRMin(''); setRKm(''); setRMemo('');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    await deleteWorkout(id);
    setLogs(prev => prev.filter(l => l.id !== id));
  };

  const filtered = logs.filter(l => l.workoutType === subTab);

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: '13px', fontWeight: active ? 700 : 400,
    border: 'none', borderRadius: '20px', cursor: 'pointer',
    background: active ? '#89CFF0' : '#f0f0f0',
    color: active ? '#fff' : '#5f6368',
  });

  const saveBtn: React.CSSProperties = {
    padding: '8px 20px', fontSize: '13px', fontWeight: 700,
    border: 'none', borderRadius: '8px', background: saving ? '#b0c4de' : '#89CFF0',
    color: '#fff', cursor: saving ? 'default' : 'pointer',
  };

  return (
    <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
      {/* 슬로건 */}
      <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 700, color: '#1a3a5c', marginBottom: '16px', letterSpacing: '0.5px' }}>
        💪 체력이 곧 자산이다
      </div>

      {/* 날짜 선택 */}
      <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ fontSize: '13px', color: '#5f6368', flexShrink: 0 }}>날짜</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, flex: 1 }} />
        <button onClick={() => setDate(TODAY())}
          style={{ padding: '7px 12px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', cursor: 'pointer', color: '#5f6368' }}>
          오늘
        </button>
      </div>

      {/* 운동 종류 탭 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['TENNIS', 'HEALTH', 'RUNNING'] as WorkoutType[]).map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={tabBtn(subTab === t)}>
            {t === 'TENNIS' ? '🎾 테니스' : t === 'HEALTH' ? '🏋️ 헬스' : '🏃 러닝'}
          </button>
        ))}
      </div>

      {/* ── 테니스 ── */}
      {subTab === 'TENNIS' && (
        <div style={{ background: '#f8fcff', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#4BAAD4', marginBottom: '12px' }}>기록 추가</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>게임수</div>
              <input type="number" value={tGames} onChange={e => setTGames(e.target.value)}
                placeholder="0" min="0" style={{ ...inp, width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>시간 (분)</div>
              <input type="number" value={tMin} onChange={e => setTMin(e.target.value)}
                placeholder="0" min="0" style={{ ...inp, width: '100%' }} />
            </div>
          </div>
          <input value={tMemo} onChange={e => setTMemo(e.target.value)}
            placeholder="메모 (선택)" style={{ ...inp, width: '100%', marginBottom: '10px' }} />
          <button onClick={handleSaveTennis} disabled={saving} style={saveBtn}>저장</button>
        </div>
      )}

      {/* ── 헬스 ── */}
      {subTab === 'HEALTH' && (
        <div style={{ background: '#f8fcff', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#4BAAD4', marginBottom: '12px' }}>기록 추가</div>

          {/* 운동부위 선택 */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {MUSCLE_GROUPS.map(m => (
              <button key={m} onClick={() => setHMuscle(m)} style={{
                padding: '4px 12px', fontSize: '12px', border: '1px solid',
                borderRadius: '14px', cursor: 'pointer',
                borderColor: hMuscle === m ? '#89CFF0' : '#dadce0',
                background: hMuscle === m ? '#e0f4ff' : '#fff',
                color: hMuscle === m ? '#2a6090' : '#5f6368', fontWeight: hMuscle === m ? 700 : 400,
              }}>{m}</button>
            ))}
          </div>

          {/* 운동종류 선택 */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>운동종류</div>
            <select value={hExName} onChange={e => setHExName(e.target.value)} style={{ ...inp, width: '100%' }}>
              {hExercises.map(c => <option key={c.detailCode} value={c.detailCode}>{c.detailCodeName}</option>)}
              {hExercises.length === 0 && <option value="">공통코드에 운동종류 추가 필요</option>}
            </select>
          </div>

          {/* 세트 목록 — 무게·횟수 1:N 입력 */}
          <div style={{ marginBottom: '8px' }}>
            {/* 컬럼 헤더 */}
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 28px', gap: '6px', marginBottom: '4px', paddingLeft: '2px' }}>
              <div />
              <div style={{ fontSize: '11px', color: '#80868b' }}>무게 (kg)</div>
              <div style={{ fontSize: '11px', color: '#80868b' }}>횟수</div>
              <div />
            </div>

            {hSetRows.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 28px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                {/* 세트 번호 */}
                <div style={{ fontSize: '12px', color: '#9aa0a6', textAlign: 'center', fontWeight: 600 }}>{i + 1}</div>
                <input
                  type="number" value={row.weight} min="0" step="0.5" placeholder="-"
                  onChange={e => updateSetRow(i, 'weight', e.target.value)}
                  style={{ ...inp, width: '100%' }}
                />
                <input
                  type="number" value={row.reps} min="1" placeholder="0"
                  onChange={e => updateSetRow(i, 'reps', e.target.value)}
                  style={{ ...inp, width: '100%' }}
                />
                {/* 행 삭제 (첫 행은 비활성) */}
                <button
                  onClick={() => removeSetRow(i)}
                  disabled={hSetRows.length === 1}
                  style={{ background: 'none', border: 'none', cursor: hSetRows.length === 1 ? 'default' : 'pointer', color: hSetRows.length === 1 ? '#e0e0e0' : '#c00', fontSize: '16px', padding: 0, lineHeight: 1 }}
                >×</button>
              </div>
            ))}

            {/* 세트 추가 버튼 */}
            <button onClick={addSetRow} style={{
              width: '100%', padding: '6px', fontSize: '12px', border: '1.5px dashed #89CFF0',
              borderRadius: '6px', background: 'transparent', color: '#4BAAD4', cursor: 'pointer', marginTop: '2px',
            }}>
              + 세트 추가
            </button>
          </div>

          {/* 세트 수 자동 표시 + 저장 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
            <span style={{ fontSize: '12px', color: '#80868b' }}>
              총 <strong style={{ color: '#344054' }}>{hSetRows.filter(r => r.reps.trim()).length}</strong> 세트
            </span>
            <button onClick={handleSaveHealth} disabled={saving || !hExName} style={saveBtn}>추가</button>
          </div>
        </div>
      )}

      {/* ── 러닝 ── */}
      {subTab === 'RUNNING' && (
        <div style={{ background: '#f8fcff', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#4BAAD4', marginBottom: '12px' }}>기록 추가</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>시간 (분)</div>
              <input type="number" value={rMin} onChange={e => setRMin(e.target.value)}
                placeholder="0" min="0" style={{ ...inp, width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#80868b', marginBottom: '3px' }}>거리 (km)</div>
              <input type="number" value={rKm} onChange={e => setRKm(e.target.value)}
                placeholder="0.0" min="0" step="0.1" style={{ ...inp, width: '100%' }} />
            </div>
          </div>
          <input value={rMemo} onChange={e => setRMemo(e.target.value)}
            placeholder="메모 (선택)" style={{ ...inp, width: '100%', marginBottom: '10px' }} />
          <button onClick={handleSaveRunning} disabled={saving} style={saveBtn}>저장</button>
        </div>
      )}

      {/* ── 기록 목록 ── */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '10px' }}>
          {date} 기록 ({filtered.length}건)
        </div>
        {filtered.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#9aa0a6', textAlign: 'center', padding: '24px 0' }}>기록이 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {subTab === 'HEALTH'
              ? renderHealthLogs(filtered, handleDelete)
              : filtered.map(log => renderSimpleLog(log, handleDelete))}
          </div>
        )}
      </div>
    </div>
  );
};

// 헬스 — 운동부위별 그룹핑, 세트별 무게·횟수 표시
function renderHealthLogs(logs: WorkoutLog[], onDelete: (id: number) => void) {
  const groups: Record<string, WorkoutLog[]> = {};
  logs.forEach(l => {
    const g = l.muscleGroup ?? '기타';
    if (!groups[g]) groups[g] = [];
    groups[g].push(l);
  });
  return Object.entries(groups).map(([muscle, items]) => (
    <div key={muscle} style={{ border: '1px solid #e0e8f0', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', background: '#f0f8fd', fontSize: '12px', fontWeight: 700, color: '#2a6090' }}>
        🏋️ {muscle}
      </div>
      {items.map(log => (
        <div key={log.id} style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#344054', marginBottom: '6px' }}>
                {log.exerciseName}
                <span style={{ fontSize: '11px', fontWeight: 400, color: '#9aa0a6', marginLeft: '8px' }}>
                  {log.sets}세트
                </span>
              </div>
              {/* 세트별 무게·횟수 태그 */}
              {log.setsData && log.setsData.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {log.setsData.map((s, i) => (
                    <span key={i} style={{
                      fontSize: '12px', padding: '2px 8px', borderRadius: '10px',
                      background: '#e8f4fd', color: '#2a6090', border: '1px solid #cce4f7',
                    }}>
                      {i + 1}. {s.weight != null ? `${s.weight}kg` : '-'} × {s.reps}회
                    </span>
                  ))}
                </div>
              ) : (
                // 구버전 데이터 fallback
                <span style={{ fontSize: '12px', color: '#80868b' }}>
                  {[log.weightKg != null && `${log.weightKg}kg`, log.reps != null && `${log.reps}회`].filter(Boolean).join(' × ')}
                </span>
              )}
            </div>
            <button onClick={() => onDelete(log.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: '14px', padding: '2px 6px', flexShrink: 0 }}>×</button>
          </div>
        </div>
      ))}
    </div>
  ));
}

// 테니스/러닝 단순 카드
function renderSimpleLog(log: WorkoutLog, onDelete: (id: number) => void) {
  const parts: string[] = [];
  if (log.gameCount != null) parts.push(`${log.gameCount}게임`);
  if (log.durationMinutes != null) parts.push(`${log.durationMinutes}분`);
  if (log.distanceKm != null) parts.push(`${log.distanceKm}km`);
  return (
    <div key={log.id} style={{ border: '1px solid #e0e8f0', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#344054' }}>{parts.join(' · ')}</span>
        {log.memo && <span style={{ fontSize: '12px', color: '#80868b', marginLeft: '10px' }}>{log.memo}</span>}
      </div>
      <button onClick={() => onDelete(log.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: '14px', padding: '2px 6px' }}>×</button>
    </div>
  );
}

export default WorkoutTab;
