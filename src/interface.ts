import { Context } from '@midwayjs/ws';

/**
 * @description User-Service parameters
 */
export interface IUserOptions {
  uid: string;
}

export interface ExtendedContext extends Context {
  handshake: {
    auth: {
      Authorization?: string;
      userID?: string | number;
    };
    headers: {
      mode?: string;
    };
    user?: {
      user: any;
      userID: string | number;
    };
    algorithmMode?: boolean;
  };
  socket: any;
  id: string;
}
