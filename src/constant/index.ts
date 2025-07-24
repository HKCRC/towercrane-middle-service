export enum UserRole {
  ADMIN = 1,
  USER = 2,
}

export const BINARY_FLAG = 0x04;

export const STATIC_PREFIX = 'uploadpic';

export const MAIN_HOST = '129.226.138.87';

export const API_HOST =
  process.env.NODE_ENV === 'production'
    ? `http://${MAIN_HOST}:7001`
    : 'http://127.0.0.1:7001';

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
  CLIENT_ALGORITHM_CHECK_ACCESS = 'client-algorithm-check-access',
  UPLOAD_MAP = 'upload_map',
  RECEIVE_MAP = 'receive_map',
  CLIENT_FORCE_UPDATE_MAP = 'client-force-update-map',
}

export enum USER_STATUS {
  CONNECTED = 'connected',
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export const SPECIAL_STATUS = {
  FREE: '001',
};

export enum MESSAGE_TYPE {
  ALGORITHM_STATUS = 'Algorithm_Status',
  REQUEST_ALGORITHM = 'Request_Algorithm',
  ALGORITHM_STATUS_RESPONSE = 'Algorithm_Status_Response',
}

export enum RedisKey {
  OFFLINE_CANDIDATES = 'offline-candidates',
}

export enum TOWER_CRANE_CONTROL_STATUS {
  OCCUPIED = 'occupied',
  FREE = 'free',
  USING = 'using',
}

export const REGISTER_CODE = 'HKCRC_001';
