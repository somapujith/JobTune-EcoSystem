import { useEffect, useState } from 'react';
import { isBrowser } from '../lib/browser';

/**
 * Renders children only after client mount.
 * Use for widgets that depend on window/localStorage and must not run during SSR.
 */
export default function ClientOnly({ children, fallback = null }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isBrowser || !mounted) return fallback;
  return children;
}
