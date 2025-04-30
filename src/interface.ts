/**
 * @description User-Service parameters
 */
export interface IUserOptions {
  uid: number;
}

export interface IWebSocketOptions {
  port: number;
}

export interface IWebSocketClient {
  id: string;
  socketID: string;
}

export interface IWebSocketServer {
  id: string;
  socketID: string;
}
