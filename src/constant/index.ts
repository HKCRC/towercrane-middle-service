export enum UserRole {
  ADMIN = 1,
  USER = 2,
}

export const BINARY_FLAG = 0x04;

export enum SOCKET_EVENT {
  CLIENT_MSG = 'client-msg',
  SERVER_MSG = 'server-msg',
  SERVER_REGISTER = 'server-register',
  CLIENT_STATUS_NOTIFY = 'client-status-notify',
  SERVER_STATUS_NOTIFY = 'server-status-notify',
  CLIENT_REQUEST_ALGORITHM = 'client-request-algorithm',
  CLIENT_REASSIGN_ALGORITHM = 'client-reassign-algorithm',
  CLIENT_EXIT = 'client-exit',
}
