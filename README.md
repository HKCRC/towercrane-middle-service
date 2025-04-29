# WebSocket Implementation with MidwayJS

This project implements a WebSocket server using MidwayJS framework, integrating with Socket.IO for real-time communications.

## Features

- Authentication middleware for WebSocket connections
- Support for both client and algorithm/server connections
- Binary message handling
- Redis-based state management
- Connection status tracking
- Relationship management between users and algorithms

## WebSocket Endpoints

The WebSocket service is available at `ws://localhost:7002/` (configurable in `config.websocket.ts`).

### Message Events

- `client-msg`: Messages from clients to servers
- `server-msg`: Messages from servers to clients
- `server-register`: Registration for server/algorithm endpoints
- `client-relation-register`: Registration for client-algorithm relationships
- `client-request-algorithm`: Requesting control of an algorithm
- `client-reassign-algorithm`: Reassigning algorithm control
- `client-exit`: Client disconnection
- `broadcast-msg`: Broadcast messages to all clients

## Connection Authentication

### Client Authentication

Connect with:
```javascript
const socket = io('http://localhost:7002', {
  auth: {
    Authorization: 'your-jwt-token',
    userID: 'your-user-id'
  }
});
```

### Algorithm/Server Authentication

Connect with:
```javascript
const socket = io('http://localhost:7002', {
  auth: {},
  extraHeaders: {
    mode: 'algorithm'
  }
});
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run in production
npm start
```

## Configuration

- WebSocket configuration is in `src/config/config.websocket.ts`
- Redis configuration is in `src/config/config.default.ts`

## Implementation Details

This implementation is a conversion of a traditional Socket.IO server to MidwayJS framework, providing better integration with the rest of the application, cleaner code organization using decorators, and improved testability.

The main components are:
- `WebSocketController`: Handles all WebSocket events
- `WSAuthMiddleware`: Authenticates WebSocket connections
- Redis integration for state management
- Extended context interface for type safety
