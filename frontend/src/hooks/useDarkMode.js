import { useState, useEffect } from 'react';
import { isBrowser, safeLocalStorage, setSafeLocalStorage } from '../lib/browser';

function getInitialDarkMode() {
  if (!isBrowser) return false;
  const saved = safeLocalStorage('theme');
  if (saved) return saved === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(getInitialDarkMode);

  useEffect(() => {
    if (!isBrowser) return;
    if (isDark) {
      document.documentElement.classList.add('dark');
      setSafeLocalStorage('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      setSafeLocalStorage('theme', 'light');
    }
  }, [isDark]);

  return [isDark, setIsDark];
}
