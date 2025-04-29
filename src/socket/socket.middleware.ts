import { IMiddleware, Inject } from '@midwayjs/core';
import { ExtendedContext } from '../interface';
import { Application } from '@midwayjs/koa';
import { JwtService } from '@midwayjs/jwt';

export class WSAuthMiddleware implements IMiddleware<ExtendedContext, any> {
  @Inject()
  app: Application;

  @Inject()
  jwt: JwtService;

  resolve() {
    return async (ctx: ExtendedContext, next: () => Promise<any>) => {
      const token = ctx.handshake.auth.Authorization;
      const mode = ctx.handshake.headers.mode;
      const userID = ctx.handshake.auth.userID;

      console.log('mode:', mode);
      console.log('token:', token);
      console.log('userID:', userID);

      if (mode === 'algorithm') {
        ctx.handshake.algorithmMode = true;
        return await next();
      } else if (token && userID) {
        try {
          const user = this.jwt.verify(token, this.app.getConfig('jwt').secret);
          if (!user) {
            throw new Error('Authentication error');
          }
          ctx.handshake.user = { user, userID };
          return await next();
        } catch (error) {
          console.error('Error verifying token:', error);
          throw new Error('Authentication error');
        }
      } else {
        throw new Error('Authentication error');
      }
    };
  }
}
