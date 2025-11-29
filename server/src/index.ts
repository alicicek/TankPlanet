import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { InputState, PlayerId } from '@shared/types';
import type { ClientMessage, ServerMessage } from '@shared/protocol';
import { createSim, TICK } from './sim';

const sim = createSim();
const sockets = new Map<PlayerId, WebSocket>();

function broadcast(data: ServerMessage) {
  const str = JSON.stringify(data);
  for (const ws of sockets.values()) {
    if (ws.readyState === ws.OPEN) ws.send(str);
  }
}

function handleMessage(pid: PlayerId, raw: RawData) {
  try {
    const msg = JSON.parse(raw.toString()) as ClientMessage | unknown;
    if (!msg || (msg as ClientMessage).type !== 'input') return;
    const inputMsg = msg as ClientMessage & { type: 'input' };

    const numberFieldsValid =
      typeof inputMsg.thrust === 'number' &&
      typeof inputMsg.turn === 'number' &&
      (inputMsg.seq === undefined || typeof inputMsg.seq === 'number') &&
      (inputMsg.dt === undefined || typeof inputMsg.dt === 'number');
    const booleanFieldsValid =
      (inputMsg.fire === undefined || typeof inputMsg.fire === 'boolean') &&
      (inputMsg.power === undefined || typeof inputMsg.power === 'boolean');

    if (!numberFieldsValid || !booleanFieldsValid) {
      console.warn('Ignoring malformed input message', msg);
      return;
    }

    const clamp = (v: number): -1 | 0 | 1 => (v > 0 ? 1 : v < 0 ? -1 : 0);
    const input: InputState = {
      seq: typeof inputMsg.seq === 'number' ? inputMsg.seq : 0,
      thrust: clamp(inputMsg.thrust),
      turn: clamp(inputMsg.turn),
      fire: !!inputMsg.fire,
      power: !!inputMsg.power,
      dt: typeof inputMsg.dt === 'number' ? inputMsg.dt : 0,
    };
    sim.handleInput(pid, input);
  } catch (err) {
    console.error('bad message', err);
  }
}

function randomColor() {
  const colors = ['#ff6b6b', '#feca57', '#54a0ff', '#5f27cd', '#1dd1a1'];
  return colors[Math.floor(Math.random() * colors.length)];
}

async function main() {
  const wss = new WebSocketServer({ port: 3001 });
  console.log('Server listening on ws://localhost:3001');

  wss.on('connection', (ws: WebSocket) => {
    const pid: PlayerId = sim.addPlayer((id) => 'Pilot' + id, randomColor());
    sockets.set(pid, ws);

    ws.on('message', (data: RawData) => handleMessage(pid, data));
    ws.on('close', () => {
      sockets.delete(pid);
      sim.removePlayer(pid);
    });

    const welcome = sim.buildWelcomeMessage(pid);
    ws.send(JSON.stringify(welcome));
    console.log('Player connected', pid);
  });

  setInterval(() => {
    const msgs = sim.tick();
    for (const msg of msgs) broadcast(msg);
  }, TICK * 1000);
}

main().catch((err) => console.error(err));
