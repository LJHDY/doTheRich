import React from 'react';
import { BUDGET_USERS, BUDGET_USER_STORAGE_KEY } from '../../constants/budgetConstants';

interface Props {
  onSelect: (userId: string) => void;
}

const UserSelectModal: React.FC<Props> = ({ onSelect }) => {
  const handleSelect = (id: string) => {
    localStorage.setItem(BUDGET_USER_STORAGE_KEY, id);
    onSelect(id);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px',
        padding: '40px 48px', textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        minWidth: '280px',
      }}>
        <div style={{ fontSize: '22px', fontWeight: 700, color: '#1a3a5c', marginBottom: '8px' }}>
          안녕하세요 👋
        </div>
        <div style={{ fontSize: '14px', color: '#5f6368', marginBottom: '32px' }}>
          누구의 가계부로 시작할까요?
        </div>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          {BUDGET_USERS.map(u => (
            <button
              key={u.id}
              onClick={() => handleSelect(u.id)}
              style={{
                padding: '18px 36px', fontSize: '18px', fontWeight: 700,
                borderRadius: '12px', border: '2px solid #89CFF0',
                background: '#f0f8fd', color: '#1a3a5c',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#89CFF0';
                (e.currentTarget as HTMLButtonElement).style.color = '#fff';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#f0f8fd';
                (e.currentTarget as HTMLButtonElement).style.color = '#1a3a5c';
              }}
            >
              {u.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserSelectModal;
