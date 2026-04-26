"use client";

import { useEffect, useState } from "react";

function readValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function usePersistedState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readValue(key, fallback));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage failures
    }
  }, [key, value]);

  return [value, setValue] as const;
}

