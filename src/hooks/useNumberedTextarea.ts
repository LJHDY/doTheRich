import { useRef, useCallback, useEffect } from 'react';

/**
 * 메모 textarea에 번호 목록 자동 서식 적용
 * - focus 시 비어 있으면 "1. " 자동 삽입
 * - Enter 시 다음 번호 접두사("\n2. ") 자동 삽입
 * - IME 조합 중 Enter: 기본 줄바꿈 차단 → compositionend에서 처리 (윗줄 글자 복사 버그 방지)
 * - blur 시 실제 내용이 없으면(번호 접두사만) 빈 문자열로 초기화
 */
export function useNumberedTextarea(
  value: string,
  onChange: (v: string) => void
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // IME Enter 대기 플래그 — compositionend에서 소비
  const pendingEnterRef = useRef(false);
  // compositionend 처리 후 브라우저가 추가로 발화하는 Enter keydown 차단 플래그
  // (Mac Chrome/Safari: IME Enter → compositionend → 비조합 keydown 순서로 이중 발화)
  const skipNextEnterRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // el.value(DOM 실시간 값) 기준으로 줄바꿈 + 번호 삽입
  const insertNewLine = useCallback((el: HTMLTextAreaElement) => {
    const splitAt = el.selectionEnd;
    const text = el.value;
    const linesBeforeCursor = text.substring(0, splitAt).split('\n');
    const nextNum = linesBeforeCursor.length + 1;
    const insertion = `\n${nextNum}. `;
    const newVal = text.substring(0, splitAt) + insertion + text.substring(splitAt);
    onChange(newVal);
    setTimeout(() => {
      if (el) el.selectionStart = el.selectionEnd = splitAt + insertion.length;
    }, 0);
  }, [onChange]);

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
        if (e.nativeEvent.isComposing) {
          // IME 조합 중 Enter: 브라우저 기본 줄바꿈을 차단하고 compositionend에서 처리
          // — 차단하지 않으면 확정 글자가 윗줄에 남고 커서만 아래 줄로 이동하는 버그 발생
          e.preventDefault();
          pendingEnterRef.current = true;
          return;
        }
        e.preventDefault();
        // compositionend 직후 브라우저가 isComposing=false로 추가 발화하는 Enter 무시
        if (skipNextEnterRef.current) {
          skipNextEnterRef.current = false;
          return;
        }
        insertNewLine(el);
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
          const removeFrom = lastNewline >= 0 ? lastNewline : 0;
          const newVal = value.substring(0, removeFrom) + value.substring(cursor);
          const newCursor = removeFrom;
          onChange(newVal);
          setTimeout(() => {
            if (el) el.selectionStart = el.selectionEnd = newCursor;
          }, 0);
        }
      }
    },
    [value, onChange, insertNewLine]
  );

  // IME 확정 후 pendingEnterRef가 세팅된 경우 줄바꿈 처리
  const onCompositionEnd = useCallback(() => {
    if (!pendingEnterRef.current) return;
    pendingEnterRef.current = false;
    const el = ref.current;
    if (!el) return;
    // 이후 브라우저가 isComposing=false Enter keydown을 추가 발화하므로 차단 플래그 설정
    skipNextEnterRef.current = true;
    // 한 틱 대기: compositionend 직후 DOM이 최종 확정값을 반영하도록
    setTimeout(() => insertNewLine(el), 0);
  }, [insertNewLine]);

  const onBlur = useCallback(() => {
    // 모든 줄이 "숫자. (공백)" 접두사만이면 실제 입력 없음 → 초기화
    const hasContent = value
      .split('\n')
      .some(line => !/^\d+\.\s*$/.test(line) && line !== '');
    if (!hasContent) onChange('');
  }, [value, onChange]);

  return { ref, onFocus, onKeyDown, onBlur, onCompositionEnd };
}
