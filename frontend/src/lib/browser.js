/** Guards for code that must only run in the browser (SSR-safe). */
export const isBrowser = typeof window !== 'undefined';

export function safeLocalStorage(key) {
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setSafeLocalStorage(key, value) {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function removeSafeLocalStorage(key) {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
