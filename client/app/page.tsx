'use client';

import { useEffect, useRef } from 'react';
import { createGame } from '../src/game';

export default function Home() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const destroy = createGame(rootRef.current);
    return () => destroy?.();
  }, []);

  return (
    <main className="game-shell">
      <div ref={rootRef} className="game-root" />
    </main>
  );
}
