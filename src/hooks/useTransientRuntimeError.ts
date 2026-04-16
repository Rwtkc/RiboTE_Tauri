import { useEffect, useRef, useState } from "react";

const TRANSIENT_RUNTIME_ERROR_PATTERNS = [
  /Analysis calculation failed with status exit code:\s*1/i,
  /^Analysis terminated by user\.$/i
];

function isTransientRuntimeError(message: string) {
  return TRANSIENT_RUNTIME_ERROR_PATTERNS.some((pattern) => pattern.test(message.trim()));
}

export function useTransientRuntimeError(timeoutMs = 2000) {
  const [errorMessage, setErrorMessageState] = useState("");
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function setErrorMessage(message: string) {
    clearTimer();
    setErrorMessageState(message);

    if (message && isTransientRuntimeError(message)) {
      timerRef.current = window.setTimeout(() => {
        setErrorMessageState((current) => (current === message ? "" : current));
        timerRef.current = null;
      }, timeoutMs);
    }
  }

  useEffect(() => clearTimer, []);

  return [errorMessage, setErrorMessage] as const;
}
