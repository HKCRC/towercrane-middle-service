import { Body, Context, Controller, Get, Inject, Post } from '@midwayjs/core';
import { AuthService } from '@/service/auth.service';
import { JwtPassportMiddleWare } from '@/middleware/jwt.middleware';
import { JwtService } from '@midwayjs/jwt';
import { StateUser } from '@/types';

@Controller('/auth')
export class APIController {
  @Inject()
  ctx: Context;

  @Inject()
  jwt: JwtService;

  @Inject()
  authService: AuthService;

  @Post('/login')
  async login(
    @Body('phoneNumber') phoneNumber: string,
    @Body('password') password: string
  ) {
    try {
      const user = await this.authService.login(phoneNumber, password);
      if (!user.success) {
        return {
          success: false,
          message: user.message,
          data: undefined,
        };
      }
      const { token, longToken, uid, place_id, user_name } = user.data;
      const userResult = {
        access_token: token,
        refresh_token: longToken,
        uid,
        place_id,
        user_name,
        phoneNumber: user.data.phoneNumber,
      };
      return { success: true, message: 'OK', data: userResult };
    } catch (e) {
      this.ctx.logger.info(e);
      return {
        success: false,
        message: '用户名或密码错误',
        data: undefined,
      };
    }
  }

  @Post('/register')
  async register(
    @Body('phoneNumber') phoneNumber: string,
    @Body('password') password: string
  ) {
    try {
      const userPsw = password;
      if (!phoneNumber.length || !password.length) {
        return {
          success: false,
          message: 'invalid phone number or password',
          data: undefined,
        };
      }
      const user = await this.authService.register(phoneNumber, password);

      if (user.id && user.phoneNumber) {
        const getUserResult = await this.authService.login(
          user.phoneNumber,
          userPsw
        );
        if (!getUserResult.success) {
          return {
            success: false,
            message: getUserResult.message,
            data: undefined,
          };
        }
        const { token, longToken, uid, place_id, user_name } =
          getUserResult.data;
        const userResult = {
          access_token: token,
          refresh_token: longToken,
          uid,
          place_id,
          phoneNumber: user.phoneNumber,
          user_name,
        };
        return { success: true, message: 'OK', data: userResult };
      } else {
        return {
          success: false,
          message: 'invalid eamil or invalid password',
          data: undefined,
        };
      }
    } catch (e) {
      return {
        success: false,
        message: 'invalid eamil or invalid password',
        data: undefined,
      };
    }
  }

  @Get('/refreshToken', { middleware: [JwtPassportMiddleWare] })
  async refreshToken() {
    try {
      const user = (this.ctx as any).state.user as StateUser;
      if (!user) {
        return {
          success: false,
          message: 'refresh token expired',
        };
      }
      const tokenPayload = {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
      };
      const generateJwt = await this.jwt.sign(tokenPayload, {
        expiresIn: '7d',
        audience: 'hkcrc',
      });
      const generateLongJwt = await this.jwt.sign(tokenPayload, {
        expiresIn: '14d',
        audience: 'hkcrc',
      });
      return {
        success: true,
        data: {
          ...user,
          access_token: generateJwt,
          refresh_token: generateLongJwt,
        },
        message: 'get token success',
      };
    } catch (e) {
      this.ctx.logger.info(e);
    }
  }

  @Get('/user/info', { middleware: [JwtPassportMiddleWare] })
  async getUserInfo() {
    try {
      // 添加日志以检查用户信息
      const user = (this.ctx as any).state.user as StateUser;
      if (!user || !user.userId || !user.phoneNumber) {
        throw new Error('fail to get user info');
      }
      return {
        success: true,
        data: user,
        message: 'get user info success',
      }; // 如果需要返回用户信息
    } catch (e) {
      this.ctx.logger.info(e);
      return {
        success: false,
        data: null,
        message: 'fail to get user info',
      };
    }
  }
}
