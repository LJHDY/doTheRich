import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// public/index.html의 <div id="root">에 React 앱을 마운트
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// StrictMode: 개발 환경에서 부수효과 이중 실행으로 잠재적 오류 감지
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
