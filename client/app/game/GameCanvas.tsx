'use client';

import { useEffect, useRef } from 'react';
import { startGame } from '../../src/game';

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const cleanup = startGame(canvas);
    return () => cleanup?.();
  }, []);

  return (
    <main className="game-shell">
      <div className="game-root">
        <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh', display: 'block' }} />
      </div>
    </main>
  );
}
