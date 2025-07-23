import { Inject, Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { PrismaService } from '@/providers/prisma';
import { JwtService } from '@midwayjs/jwt';
import { PasswordService } from '@/service/password.service';
import { v4 as uuidv4 } from 'uuid';
import { USER_STATUS, UserRole } from '@/constant';
import { RedisService } from '@midwayjs/redis';

@Provide()
@Scope(ScopeEnum.Request, { allowDowngrade: true })
export class AuthService {
  @Inject()
  jwt: JwtService;

  @Inject()
  redisService: RedisService;

  async login(userId: string, password: string) {
    const user = await PrismaService.user.findFirst({
      where: {
        phoneNumber: userId,
      },
    });

    if (!user) {
      return {
        success: false,
        message: '用户不存在',
        data: undefined,
      };
    }

    const getUserStatus = await this.redisService.hget(
      `user${user.uid}`,
      'status'
    );
    if (getUserStatus && getUserStatus === USER_STATUS.ONLINE) {
      return {
        success: false,
        message: '用户已在线',
        data: undefined,
      };
    }

    if (
      user &&
      (await PasswordService.comparePassword(password, user.password))
    ) {
      const tokenPayload = { userId: user.uid, phoneNumber: user.phoneNumber };

      const generateJwt = await this.jwt.sign(tokenPayload, {
        expiresIn: '7d',
        audience: 'hkcrc',
      });
      const generateLongJwt = await this.jwt.sign(
        tokenPayload,
        process.env.JWT_PRIVATE_KEY,
        {
          expiresIn: '14d',
          audience: 'hkcrc',
        }
      );
      return {
        success: true,
        message: '登录成功',
        data: {
          ...user,
          token: generateJwt,
          longToken: generateLongJwt,
        },
      };
    } else {
      return {
        success: false,
        message: '用户名或密码错误',
        data: undefined,
      };
    }
  }

  async register(phoneNumber: string, password: string) {
    try {
      // Check if user already exists
      const existingUser = await PrismaService.user.findFirst({
        where: {
          phoneNumber: phoneNumber,
        },
      });

      if (existingUser) {
        throw new Error('用户已存在');
      }

      const hashedPassword = await PasswordService.hashPassword(password);

      const user = await PrismaService.user.create({
        data: {
          user_name: '塔吊员',
          phoneNumber: phoneNumber,
          uid: uuidv4(),
          password: hashedPassword,
          role: UserRole.USER,
          place_id: '',
        },
      });
      return user;
    } catch (error) {
      console.error(error);
      if (error.message === '用户已存在') {
        throw error;
      }
      throw new Error('注册失败');
    }
  }

  async getCurrentPlaceUsers(placeId: string) {
    try {
      const users = await PrismaService.user.findMany({
        where: {
          place_id: placeId,
        },
      });
      return users;
    } catch (error) {
      console.error(error);
      return [];
    }
  }
}
