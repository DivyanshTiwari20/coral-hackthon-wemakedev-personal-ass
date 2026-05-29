"use client";

type CacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

export function readClientCache<T>(key: string, maxAgeMs: number) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return null;
    }

    const envelope = JSON.parse(rawValue) as CacheEnvelope<T>;

    if (!envelope?.savedAt || Date.now() - envelope.savedAt > maxAgeMs) {
      window.localStorage.removeItem(key);
      return null;
    }

    return envelope.value;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function writeClientCache<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const envelope: CacheEnvelope<T> = {
      savedAt: Date.now(),
      value,
    };

    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Storage can fail in private mode or when quota is full. The app can still work without cache.
  }
}
