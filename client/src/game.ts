import type { InputState, TuningConfig, SnapshotPlayer } from '@shared';
import type { SnapshotMessage, ServerMessage } from '@shared';
import { TUNING } from '@shared/config';
import { createRenderer } from './renderer';
import { createConnection } from './net';
import { createClientEcs, syncInputToEcs, syncLocalStateToEcs } from './ecsClient';

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
  const hudRow3 = document.createElement('div');
  hudRow3.className = 'row';
  const scoreLabel = document.createElement('span');
  scoreLabel.textContent = 'Score';
  const hudScore = document.createElement('span');
  hudScore.id = 'hud-score';
  hudScore.textContent = '0';
  hudRow3.append(scoreLabel, hudScore);
  const weaponUi = document.createElement('div');
  weaponUi.className = 'weapon-ui';
  weaponUi.textContent = 'Weapon: ';
  const weaponSpan = document.createElement('span');
  weaponSpan.id = 'hud-weapon';
  weaponSpan.textContent = 'Blaster';
  weaponUi.appendChild(weaponSpan);
  hud.append(hudRow1, hudRow2, hudRow3, weaponUi);
  const crosshair = document.createElement('div');
  crosshair.className = 'crosshair';
  const killfeed = document.createElement('div');
  killfeed.className = 'killfeed';
  const centerMsg = document.createElement('div');
  centerMsg.className = 'center-msg';
  centerMsg.textContent = 'Connecting...';
  const devHud = document.createElement('div');
  devHud.className = 'dev-hud';
  devHud.style.position = 'absolute';
  devHud.style.bottom = '12px';
  devHud.style.right = '12px';
  devHud.style.padding = '8px 10px';
  devHud.style.background = 'rgba(0,0,0,0.4)';
  devHud.style.color = '#cde2ff';
  devHud.style.fontSize = '12px';
  devHud.style.fontFamily = 'monospace';
  devHud.style.borderRadius = '6px';
  devHud.style.pointerEvents = 'none';
  devHud.style.lineHeight = '1.5';
  const devStatus = document.createElement('div');
  const devSnap = document.createElement('div');
  const devPlayers = document.createElement('div');
  const devMatch = document.createElement('div');
  devStatus.textContent = 'Status: Connecting';
  devSnap.textContent = 'Snapshot: --';
  devPlayers.textContent = 'Players: --';
  devMatch.textContent = 'Match: --';
  devHud.append(devStatus, devSnap, devPlayers, devMatch);
  container.append(hud, killfeed, centerMsg);
  container.appendChild(crosshair);
  container.appendChild(devHud);

  const movement: TuningConfig = { ...TUNING };

  const input: Pick<InputState, 'thrust' | 'turn' | 'fire' | 'power'> = { thrust: 0, turn: 0, fire: false, power: false };
  let roundFrozenUntil = 0;
  const getActiveInput = () => {
    if (performance.now() < roundFrozenUntil) {
      return { thrust: 0, turn: 0, fire: false, power: false };
    }
    return input;
  };
  const renderer = createRenderer({ canvas, hudPlayer, hpFill, hudScore });
  renderer.setInputGetter(() => getActiveInput());
  renderer.setMovement(movement);
  renderer.setPlayerName('Pilot');
  renderer.setOnLocalDeath((label: string) => {
    centerMsg.style.display = '';
    centerMsg.textContent = label;
  });
  renderer.setOnLocalRespawn(() => {
    if (centerMsg.textContent?.startsWith('You were destroyed')) {
      centerMsg.style.display = 'none';
    }
  });
  const { world: ecsWorld, tankEntity } = createClientEcs();

  let destroyed = false;
  let playerId: number | null = null;
  let animFrame: number | null = null;
  let latestSnapshot: SnapshotMessage | null = null;
  let localState: SnapshotPlayer | null = null;

  const keydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') input.thrust = 1;
    if (e.key === 'ArrowLeft') input.turn = -1;
    if (e.key === 'ArrowRight') input.turn = 1;
    if (e.key === ' ') {
      input.fire = true;
      renderer.triggerFireFlash();
    }
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
    getInput: () => getActiveInput(),
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
      devStatus.textContent = 'Status: Connected';
    },
    onSnapshot: (msg: SnapshotMessage) => {
      latestSnapshot = msg;
      if (playerId !== null) {
        localState = msg.players.find((p) => p.id === playerId) ?? localState;
      }
      const lagMs = Math.max(0, (Date.now() / 1000 - msg.time) * 1000);
      devSnap.textContent = `Snapshot: ${lagMs.toFixed(0)} ms ago`;
      devPlayers.textContent = `Players: ${msg.players.length}`;
      if (msg.match) {
        const seconds = Math.max(0, Math.floor(msg.match.timeLeft));
        devMatch.textContent = `Match: ${msg.match.state} | ${seconds}s left | cap ${msg.match.scoreCap}`;
      }
    },
    onEvent: (msg: Extract<ServerMessage, { type: 'event' }>) => {
      if (msg.kind === 'kill') pushKillfeed(`${msg.killer} eliminated ${msg.victim}`);
      if (msg.kind === 'pickup') pushKillfeed('Pickup collected');
      if (msg.kind === 'roundEnd') {
        const winnerScore = msg.winner != null ? msg.scores.find((s) => s.playerId === msg.winner)?.score ?? 0 : 0;
        const label =
          msg.winner != null
            ? `Round ${msg.round} over — Player #${msg.winner} wins with ${winnerScore} points`
            : `Round ${msg.round} over — tie`;
        roundFrozenUntil = performance.now() + 2500;
        centerMsg.style.display = '';
        centerMsg.textContent = label;
        setTimeout(() => {
          if (performance.now() >= roundFrozenUntil) {
            centerMsg.style.display = 'none';
          }
        }, 2600);
      }
    },
    onStateChange: (state) => {
      if (state === 'connecting') {
        centerMsg.style.display = '';
        centerMsg.textContent = 'Joining arena...';
        devStatus.textContent = 'Status: Connecting';
      }
      if (state === 'disconnected') {
        centerMsg.style.display = '';
        centerMsg.textContent = 'Disconnected — retrying...';
        devStatus.textContent = 'Status: Reconnecting';
      }
      if (state === 'error') {
        centerMsg.style.display = '';
        centerMsg.textContent = 'Unable to connect to server. Retrying...';
        devStatus.textContent = 'Status: Error';
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
    syncLocalStateToEcs(localState, ecsWorld, tankEntity);
    syncInputToEcs(getActiveInput(), ecsWorld, tankEntity);
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
    if (crosshair.parentElement) crosshair.parentElement.removeChild(crosshair);
    if (devHud.parentElement) devHud.parentElement.removeChild(devHud);
  };
}
