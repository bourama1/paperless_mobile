import { io } from 'socket.io-client';
import { BASE_URL } from '../api/client';

// Same shared secret used for regular HTTP requests (see api/client.ts) —
// the backend's Socket.IO handshake middleware checks this separately from
// the X-API-Key header, since WS upgrades don't carry it automatically.
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

export const socket = io(BASE_URL, {
  autoConnect: true,
  auth: { apiKey: API_KEY },
});

socket.on('connect', () => {
  console.log('Connected to socket server');
});

socket.on('connect_error', (err) => {
  console.error('[SOCKET] Connection rejected:', err.message);
});

socket.on('disconnect', () => {
  console.log('Disconnected from socket server');
});

export default socket;
