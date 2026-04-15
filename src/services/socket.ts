import { io } from 'socket.io-client';
import { BASE_URL } from '../api/client';

export const socket = io(BASE_URL, {
  autoConnect: true,
});

socket.on('connect', () => {
  console.log('Connected to socket server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from socket server');
});

export default socket;
