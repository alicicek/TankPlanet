import type { ClientMessage, InputMessage, ServerMessage } from '@shared';
import type { InputState } from '@shared';

const INPUT_RATE = 1 / 25;

interface Handlers {
  onWelcome: (msg: Extract<ServerMessage, { type: 'welcome' }>) => void;
  onSnapshot: (msg: Extract<ServerMessage, { type: 'snap' }>) => void;
  onEvent: (msg: Extract<ServerMessage, { type: 'event' }>) => void;
  onStateChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  getInput: () => Pick<InputState, 'thrust' | 'turn' | 'fire' | 'power'>;
  getPlayerName: () => string;
}

export function createConnection(handlers: Handlers) {
  const wsHost = window.location.hostname || 'localhost';
  const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${wsProto}://${wsHost}:3001`;

  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let inputTimer: number | null = null;
  let destroyed = false;
  let seq = 0;

  function sendInput() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const input = handlers.getInput();
    const payload: InputMessage = {
      type: 'input',
      seq: seq++,
      thrust: input.thrust,
      turn: input.turn,
      fire: input.fire,
      power: input.power,
      dt: 16,
    };
    socket.send(JSON.stringify(payload));
  }

  function connect(retry = 0) {
    if (destroyed) return;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    }
    handlers.onStateChange?.('connecting');
    socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      handlers.onStateChange?.('connected');
      socket?.send(JSON.stringify({ type: 'join', name: handlers.getPlayerName() }));
    };
    socket.onmessage = (ev) => {
      const data: ServerMessage = JSON.parse(ev.data);
      switch (data.type) {
        case 'welcome':
          handlers.onWelcome(data);
          break;
        case 'snap':
          handlers.onSnapshot(data);
          break;
        case 'event':
          handlers.onEvent(data);
          break;
      }
    };
    socket.onclose = () => {
      handlers.onStateChange?.('disconnected');
      const next = Math.min(5000, 500 + retry * 500);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => connect(retry + 1), next);
    };
    socket.onerror = (err) => {
      const type = (err as Event)?.type ?? 'unknown';
      const state = socket?.readyState ?? -1;
      console.error('WebSocket error', { type, readyState: state, event: err });
      handlers.onStateChange?.('error');
    };
  }

  connect();
  inputTimer = window.setInterval(() => sendInput(), 1000 * INPUT_RATE * 0.5);

  return {
    destroy() {
      destroyed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (inputTimer !== null) {
        window.clearInterval(inputTimer);
        inputTimer = null;
      }
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
      }
    },
  };
}
