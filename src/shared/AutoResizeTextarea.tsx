import React, { useEffect, useRef } from 'react';

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

// 매 렌더마다 scrollHeight 기준으로 높이 동기화 → value 변경 시 항상 자동 조정
const AutoResizeTextarea: React.FC<Props> = ({ onChange, style, ...props }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });

  return (
    <textarea
      ref={ref}
      style={{ ...style, resize: 'none', overflow: 'hidden' }}
      onChange={onChange}
      {...props}
    />
  );
};

export default AutoResizeTextarea;
