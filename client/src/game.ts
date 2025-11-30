import type { InputState, TuningConfig } from '@shared';
import type { SnapshotMessage, ServerMessage } from '@shared';
import { TUNING } from '@shared/config';
import { createRenderer } from './renderer';
import { createConnection } from './net';

export function startGame(canvas: HTMLCanvasElement): () => void {
  if (!canvas) throw new Error('No canvas provided');

  const container = (canvas.parentElement as HTMLDivElement | null) ?? (document.body as HTMLDivElement);
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  canvas.classList.add('game-canvas');
  if (!canvas.style.width) canvas.style.width = '100%';
  if (!canvas.style.height) canvas.style.height = '100%';

  const hud = document.createElement('div');
  hud.className = 'hud';
  const hudRow1 = document.createElement('div');
  hudRow1.className = 'row';
  const hudTitle = document.createElement('strong');
  hudTitle.textContent = 'Tank';
  const hudPlayer = document.createElement('span');
  hudPlayer.id = 'hud-player';
  hudPlayer.textContent = '--';
  hudRow1.append(hudTitle, hudPlayer);
  const hudRow2 = document.createElement('div');
  hudRow2.className = 'row';
  const hpLabel = document.createElement('span');
  hpLabel.textContent = 'HP';
  const hpBar = document.createElement('div');
  hpBar.className = 'bar';
  const hpFill = document.createElement('div');
  hpFill.className = 'fill';
  hpFill.id = 'hud-hp';
  hpBar.appendChild(hpFill);
  hudRow2.append(hpLabel, hpBar);
  const weaponUi = document.createElement('div');
  weaponUi.className = 'weapon-ui';
  weaponUi.textContent = 'Weapon: ';
  const weaponSpan = document.createElement('span');
  weaponSpan.id = 'hud-weapon';
  weaponSpan.textContent = 'Blaster';
  weaponUi.appendChild(weaponSpan);
  hud.append(hudRow1, hudRow2, weaponUi);
  const killfeed = document.createElement('div');
  killfeed.className = 'killfeed';
  const centerMsg = document.createElement('div');
  centerMsg.className = 'center-msg';
  centerMsg.textContent = 'Connecting...';
  container.append(hud, killfeed, centerMsg);

  const movement: TuningConfig = { ...TUNING };

  const input: Pick<InputState, 'thrust' | 'turn' | 'fire' | 'power'> = { thrust: 0, turn: 0, fire: false, power: false };
  const renderer = createRenderer({ canvas, hudPlayer, hpFill });
  renderer.setInputGetter(() => input);
  renderer.setMovement(movement);
  renderer.setPlayerName('Pilot');

  let destroyed = false;
  let playerId: number | null = null;
  let animFrame: number | null = null;
  let latestSnapshot: SnapshotMessage | null = null;

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
    centerMsg.style.display = '';
    centerMsg.textContent = 'Client error — check console';
  };

  const pushKillfeed = (text: string) => {
    const el = document.createElement('div');
    el.className = 'item';
    el.textContent = text;
    killfeed.prepend(el);
    setTimeout(() => el.remove(), 5000);
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
      centerMsg.textContent = '';
      centerMsg.style.display = 'none';
    },
    onSnapshot: (msg: SnapshotMessage) => {
      latestSnapshot = msg;
    },
    onEvent: (msg: Extract<ServerMessage, { type: 'event' }>) => {
      if (msg.kind === 'kill') pushKillfeed(`${msg.killer} eliminated ${msg.victim}`);
      if (msg.kind === 'pickup') pushKillfeed('Pickup collected');
    },
    onStateChange: (state) => {
      if (state === 'connecting') {
        centerMsg.style.display = '';
        centerMsg.textContent = 'Joining arena...';
      }
      if (state === 'disconnected') {
        centerMsg.style.display = '';
        centerMsg.textContent = 'Disconnected — retrying...';
      }
      if (state === 'error') {
        centerMsg.style.display = '';
        centerMsg.textContent = 'Unable to connect to server. Retrying...';
      }
    },
  });

  let last = performance.now();
  const loop = (now: number) => {
    if (destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const snap = latestSnapshot;
    latestSnapshot = null;
    renderer.update(dt, snap);
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
    if (hud.parentElement) hud.parentElement.removeChild(hud);
    if (killfeed.parentElement) killfeed.parentElement.removeChild(killfeed);
    if (centerMsg.parentElement) centerMsg.parentElement.removeChild(centerMsg);
  };
}
