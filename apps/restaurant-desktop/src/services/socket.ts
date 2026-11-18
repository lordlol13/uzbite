import { io, type Socket } from 'socket.io-client';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

export function createRestaurantSocket(
  apiBaseUrl: string,
  accessToken: string,
  restaurantId: string | undefined,
): Socket {
  const socket = io(apiBaseUrl.replace(/\/+$/, ''), {
    auth: { token: accessToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 8000,
  });

  socket.on('connect', () => {
    if (restaurantId) {
      socket.emit('restaurant:join', restaurantId);
    }
  });

  return socket;
}
