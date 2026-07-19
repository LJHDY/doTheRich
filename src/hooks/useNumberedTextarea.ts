import { useRef, useCallback } from 'react';

/**
 * 메모 textarea에 번호 목록 자동 서식 적용
 * - focus 시 비어 있으면 "1. " 자동 삽입
 * - Enter 시 다음 번호 접두사("\n2. ") 자동 삽입
 * - blur 시 실제 내용이 없으면(번호 접두사만) 빈 문자열로 초기화
 */
export function useNumberedTextarea(
  value: string,
  onChange: (v: string) => void
) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const onFocus = useCallback(() => {
    if (value.trim()) return; // 이미 내용 있으면 건드리지 않음
    onChange('1. ');
    setTimeout(() => {
      const el = ref.current;
      if (el) el.selectionStart = el.selectionEnd = el.value.length;
    }, 0);
  }, [value, onChange]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const el = ref.current;
      if (!el) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const cursor = el.selectionStart;
        // 커서 앞 줄 수로 다음 번호 결정
        const linesBeforeCursor = value.substring(0, cursor).split('\n');
        const nextNum = linesBeforeCursor.length + 1;
        const insertion = `\n${nextNum}. `;
        const newVal = value.substring(0, cursor) + insertion + value.substring(el.selectionEnd);
        onChange(newVal);
        setTimeout(() => {
          if (el) el.selectionStart = el.selectionEnd = cursor + insertion.length;
        }, 0);
        return;
      }

      if (e.key === 'Backspace' && el.selectionStart === el.selectionEnd) {
        const cursor = el.selectionStart;
        const textBeforeCursor = value.substring(0, cursor);
        const lastNewline = textBeforeCursor.lastIndexOf('\n');
        const lineStart = lastNewline + 1; // lastNewline === -1이면 0 (첫 번째 줄)
        const currentLine = value.substring(lineStart, cursor);

        // 현재 줄이 번호 접두사만인 경우 ("2. " 혹은 "2.") — 접두사 전체와 이전 줄바꿈 제거
        if (/^\d+\.\s*$/.test(currentLine)) {
          e.preventDefault();
          const removeFrom = lastNewline >= 0 ? lastNewline : 0; // \n 포함 위치
          const newVal = value.substring(0, removeFrom) + value.substring(cursor);
          const newCursor = removeFrom;
          onChange(newVal);
          setTimeout(() => {
            if (el) el.selectionStart = el.selectionEnd = newCursor;
          }, 0);
        }
      }
    },
    [value, onChange]
  );

  const onBlur = useCallback(() => {
    // 모든 줄이 "숫자. (공백)" 접두사만이면 실제 입력 없음 → 초기화
    const hasContent = value
      .split('\n')
      .some(line => !/^\d+\.\s*$/.test(line) && line !== '');
    if (!hasContent) onChange('');
  }, [value, onChange]);

  return { ref, onFocus, onKeyDown, onBlur };
}
