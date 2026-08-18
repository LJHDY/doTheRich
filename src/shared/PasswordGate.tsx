import React, { useState, useEffect } from 'react';

const SESSION_KEY = 'dtr_session_expires';
const SESSION_DAYS = 30;

/** localStorage에 저장된 세션이 유효한지 확인 */
export function isSessionValid(): boolean {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  return Date.now() < parseInt(raw, 10);
}

/** 로그인 성공 시 30일짜리 세션 저장 */
function saveSession() {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(SESSION_KEY, String(expires));
}

interface Props {
  onUnlock: () => void;
}

const PasswordGate: React.FC<Props> = ({ onUnlock }) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  // 마운트 시 이미 유효한 세션이면 바로 통과
  useEffect(() => {
    if (isSessionValid()) onUnlock();
  }, [onUnlock]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correct = process.env.REACT_APP_APP_PASSWORD;
    if (!correct) {
      // 환경변수 미설정 시 개발 편의를 위해 통과
      saveSession();
      onUnlock();
      return;
    }
    if (input === correct) {
      saveSession();
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setInput('');
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f8fd 0%, #e8f4fb 100%)',
    }}>
      {/* 로고 영역 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
        <img src="/do_the_rich.png" alt="DoTheRich" style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'contain' }} />
        <span style={{ fontSize: '22px', fontWeight: 700, color: '#1a3a5c', letterSpacing: '-0.3px' }}>DoTheRich</span>
      </div>

      {/* 카드 */}
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          boxShadow: '0 4px 24px rgba(137,207,240,0.25)',
          border: '1px solid #d4edfb',
          padding: '32px 28px',
          width: '100%',
          maxWidth: '320px',
          animation: shake ? 'dtr-shake 0.45s ease' : undefined,
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a3a5c', marginBottom: '6px', textAlign: 'center' }}>
          비밀번호 입력
        </div>
        <div style={{ fontSize: '12px', color: '#9e9e9e', marginBottom: '20px', textAlign: 'center' }}>
          접근하려면 비밀번호를 입력하세요.
        </div>

        <input
          type="password"
          value={input}
          onChange={e => { setInput(e.target.value); setError(false); }}
          placeholder="비밀번호"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 14px', fontSize: '14px',
            border: `1.5px solid ${error ? '#E06060' : '#d4edfb'}`,
            borderRadius: '8px', outline: 'none',
            marginBottom: error ? '8px' : '16px',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => { if (!error) e.target.style.borderColor = '#89CFF0'; }}
          onBlur={e => { if (!error) e.target.style.borderColor = '#d4edfb'; }}
        />

        {error && (
          <div style={{ fontSize: '12px', color: '#E06060', marginBottom: '12px' }}>
            비밀번호가 올바르지 않습니다.
          </div>
        )}

        <button
          type="submit"
          style={{
            width: '100%', padding: '10px',
            backgroundColor: '#89CFF0', color: '#1a3a5c',
            fontSize: '14px', fontWeight: 700,
            border: 'none', borderRadius: '8px', cursor: 'pointer',
          }}
        >
          확인
        </button>
      </form>

      {/* 흔들기 애니메이션 */}
      <style>{`
        @keyframes dtr-shake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-8px); }
          30%       { transform: translateX(8px); }
          45%       { transform: translateX(-6px); }
          60%       { transform: translateX(6px); }
          75%       { transform: translateX(-3px); }
          90%       { transform: translateX(3px); }
        }
      `}</style>

      {/* 푸터 */}
      <div style={{ marginTop: '28px', fontFamily: "'Dancing Script', cursive", fontSize: '14px', color: '#4BAAD4' }}>
        For a happy future with my love, Juhae.
      </div>
    </div>
  );
};

export default PasswordGate;
