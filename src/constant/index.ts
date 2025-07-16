export enum UserRole {
  ADMIN = 1,
  USER = 2,
}

export const BINARY_FLAG = 0x04;

export enum SOCKET_EVENT {
  CLIENT_MSG = 'client-msg',
  SERVER_MSG = 'server-msg',
  SERVER_REGISTER = 'server-register',
  CLIENT_RELATION_REGISTER = 'client-relation-register',
  SERVER_STATUS_NOTIFY = 'server-status-notify',
  CLIENT_REQUEST_ALGORITHM = 'client-request-algorithm',
  CLIENT_REASSIGN_ALGORITHM = 'client-reassign-algorithm',
  CLIENT_EXIT = 'client-exit',
  CLIENT_LOCATION = 'client-location',
  CLIENT_REFRESH_STATUS = 'client-refresh-status',
}

export enum USER_STATUS {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export const SPECIAL_STATUS = {
  FREE: '001',
};

export enum MESSAGE_TYPE {
  ALGORITHM_STATUS = 'Algorithm_Status',
  REQUEST_ALGORITHM = 'Request_Algorithm',
}
