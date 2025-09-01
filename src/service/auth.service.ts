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

  async register(
    phoneNumber: string,
    password: string,
    userName?: string,
    placeId?: string,
    identity_id?: string
  ) {
    try {
      // Check if user already exists
      const existingUser = await PrismaService.user.findFirst({
        where: {
          phoneNumber: phoneNumber,
          place_id: placeId,
        },
      });

      if (existingUser) {
        throw new Error('用户已存在');
      }

      const hashedPassword = await PasswordService.hashPassword(password);

      const user = await PrismaService.user.create({
        data: {
          user_name: userName || `塔吊员${phoneNumber}`,
          phoneNumber: phoneNumber,
          uid: uuidv4(),
          password: hashedPassword,
          role: UserRole.USER,
          place_id: placeId,
          identity_id: identity_id,
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

  async updateUser(
    userId: string,
    userName: string,
    phoneNumber: string,
    identity_id: string
  ) {
    try {
      const updateUser = await PrismaService.user.update({
        where: {
          uid: userId,
        },
        data: {
          user_name: userName,
          phoneNumber: phoneNumber,
          identity_id: identity_id,
        },
      });
      return updateUser;
    } catch (error) {
      console.error(error);
      throw new Error('更新用户失败');
    }
  }

  async deleteUser(userId: string) {
    try {
      const deleteUser = await PrismaService.user.delete({
        where: {
          uid: userId,
        },
      });
      return deleteUser;
    } catch (error) {
      console.error(error);
      throw new Error('删除用户失败');
    }
  }

  async getCurrentPlaceUsers(placeId: string) {
    try {
      const total = await PrismaService.user.count({
        where: {
          place_id: placeId,
        },
      });
      const users = await PrismaService.user.findMany({
        where: {
          place_id: placeId,
        },
      });
      return {
        success: true,
        message: '获取当前工区用户成功',
        total,
        data: users,
      };
    } catch (error) {
      console.error(error);
      return {
        success: false,
        message: '获取当前工区用户失败',
        data: [],
      };
    }
  }
}
