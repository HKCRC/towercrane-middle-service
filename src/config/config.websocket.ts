import { WSAuthMiddleware } from '../socket/socket.middleware';

export const webSocket = {
  port: 30002,
  path: '/',
  middleware: [WSAuthMiddleware],
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'mode'],
    credentials: true,
  },
  allowEIO3: true, // Enable Socket.IO v3 compatibility
  transports: ['websocket', 'polling'],
  pingTimeout: 60000, // Timeout in ms
  pingInterval: 25000, // Ping interval in ms (25s)
};
