import type { InputState, TuningConfig } from '@shared';
import type { SnapshotMessage, ServerMessage } from '@shared';
import { createRenderer } from './renderer';
import { createConnection } from './net';

export function startGame(canvas: HTMLCanvasElement): () => void {
  if (!canvas) throw new Error('No canvas provided');

  const container = (canvas.parentElement as HTMLDivElement | null) ?? (document.body as HTMLDivElement);
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  const movement: TuningConfig = {
    maxSpeed: 60,
    thrust: 90,
    turnSpeed: 2.5,
    turnSmooth: 7,
    drag: 4,
  };

  const input: Pick<InputState, 'thrust' | 'turn' | 'fire' | 'power'> = { thrust: 0, turn: 0, fire: false, power: false };
  const renderer = createRenderer(container);
  renderer.setInputGetter(() => input);
  renderer.setMovement(movement);
  renderer.setPlayerName('Pilot');

  let destroyed = false;
  let playerId: number | null = null;
  let animFrame: number | null = null;

  const keydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') input.thrust = 1;
    if (e.key === 'ArrowLeft') input.turn = -1;
    if (e.key === 'ArrowRight') input.turn = 1;
    if (e.key === ' ') input.fire = true;
  };

  const keyup = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') input.thrust = 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') input.turn = 0;
    if (e.key === ' ') input.fire = false;
  };

  const pointerDown = () => (input.fire = true);
  const pointerUp = () => (input.fire = false);
  const errorHandler = (e: ErrorEvent) => {
    console.error(e.error || e.message);
    renderer.setCenterMessage('Client error — check console');
  };

  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointerup', pointerUp);
  window.addEventListener('error', errorHandler);

  const connection = createConnection({
    getInput: () => input,
    getPlayerName: () => 'Pilot',
    onWelcome: (data) => {
      if (data.tuning) {
        movement.maxSpeed = data.tuning.maxSpeed ?? movement.maxSpeed;
        movement.thrust = data.tuning.thrust ?? movement.thrust;
        if (data.tuning.turnSpeed !== undefined) movement.turnSpeed = data.tuning.turnSpeed;
        if (data.tuning.turnSmooth !== undefined) movement.turnSmooth = data.tuning.turnSmooth;
        if (data.tuning.drag !== undefined) movement.drag = data.tuning.drag;
        renderer.setMovement(movement);
      }
      playerId = data.playerId;
      renderer.setLocalPlayerId(playerId);
      renderer.setCenterMessage('');
    },
    onSnapshot: (msg: SnapshotMessage) => {
      renderer.queueSnapshot(msg);
    },
    onEvent: (msg: Extract<ServerMessage, { type: 'event' }>) => {
      if (msg.kind === 'kill') renderer.handleEvent('kill', msg.killer, msg.victim);
      if (msg.kind === 'pickup') renderer.handleEvent('pickup');
    },
    onStateChange: (state) => {
      if (state === 'connecting') renderer.setCenterMessage('Joining arena...');
      if (state === 'disconnected') renderer.setCenterMessage('Disconnected — retrying...');
      if (state === 'error') renderer.setCenterMessage('Unable to connect to server. Retrying...');
    },
  });

  let last = performance.now();
  const loop = (now: number) => {
    if (destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    renderer.update(dt, null);
    animFrame = requestAnimationFrame(loop);
  };
  animFrame = requestAnimationFrame(loop);

  return () => {
    if (destroyed) return;
    destroyed = true;
    if (animFrame !== null) cancelAnimationFrame(animFrame);
    connection.destroy();
    renderer.dispose();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('error', errorHandler);
  };
}
