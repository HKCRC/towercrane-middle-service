import { PrismaService } from '@/providers/prisma';
import { Context, Inject, Provide } from '@midwayjs/core';
import { v4 as uuidv4 } from 'uuid';
import { PasswordService } from './password.service';
import { JwtService } from '@midwayjs/jwt';
@Provide()
export class AdminService {
  @Inject()
  ctx: Context;

  @Inject()
  jwt: JwtService;

  async login(username: string, password: string) {
    try {
      const user = await PrismaService.admin.findFirst({
        where: {
          username,
        },
      });

      if (
        user &&
        (await PasswordService.comparePassword(password, user.password))
      ) {
        const tokenPayload = {
          userId: user.uid,
          username: user.username,
        };

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
            access_token: generateJwt,
            refresh_token: generateLongJwt,
          },
        };
      } else {
        return {
          success: false,
          message: '用户名或密码错误',
          data: undefined,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '登录失败',
        data: error,
      };
    }
  }

  async register(username: string, password: string) {
    try {
      const hashedPassword = await PasswordService.hashPassword(password);
      const user = await PrismaService.admin.create({
        data: { username, password: hashedPassword, uid: uuidv4() },
      });
      const tokenPayload = {
        userId: user.uid,
        username: user.username,
      };
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
        message: '注册成功',
        data: {
          ...user,
          access_token: generateJwt,
          refresh_token: generateLongJwt,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: '注册失败',
        data: error,
      };
    }
  }

  async getUserInfo() {
    const user = await PrismaService.admin.findFirst({
      where: { uid: (this.ctx as any).state.user.userId },
    });
    return {
      success: true,
      message: '获取用户信息成功',
      data: {
        uid: user.uid,
        username: user.username,
        createAt: user.createdAt,
      },
    };
  }

  async addPlace(body: {
    place_name: string;
    place_type: string;
    place_address: string;
    extra_info_json: string;
  }) {
    const place = await PrismaService.placeInfo.create({
      data: {
        ...body,
        place_id: uuidv4(),
      },
    });
    if (!place) {
      return {
        success: false,
        message: '添加工地信息失败',
        data: undefined,
      };
    }
    return {
      success: true,
      message: '添加工地信息成功',
      data: place,
    };
  }

  async updatePlace(body: {
    place_id: string;
    place_name: string;
    place_type: string;
    place_address: string;
    extra_info_json: string;
  }) {
    const place = await PrismaService.placeInfo.update({
      where: { place_id: body.place_id },
      data: body,
    });
    if (!place) {
      return {
        success: false,
        message: '工区不存在',
        data: undefined,
      };
    }
    return {
      success: true,
      message: '更新工区信息成功',
      data: place,
    };
  }

  async deletePlace(body: { place_id: string }) {
    const place = await PrismaService.placeInfo.delete({
      where: { place_id: body.place_id },
    });
    if (!place) {
      return {
        success: false,
        message: '工区不存在',
        data: undefined,
      };
    }
    return {
      success: true,
      message: '删除工区信息成功',
      data: place,
    };
  }

  async getPlaceList(query: { page: number; pageSize: number }) {
    const place = await PrismaService.placeInfo.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const total = await PrismaService.placeInfo.count();
    if (!place) {
      return {
        success: false,
        message: '工区列表为空',
        data: undefined,
        total: 0,
      };
    }
    return {
      success: true,
      message: '获取工区列表成功',
      data: place,
      total: total,
    };
  }

  async getPlaceDetail(query: { place_id: string }) {
    const place = await PrismaService.placeInfo.findUnique({
      where: { place_id: query.place_id },
    });
    if (!place) {
      return {
        success: false,
        message: '工区不存在',
        data: undefined,
      };
    }
    return {
      success: true,
      message: '获取工区详情成功',
      data: place,
    };
  }
}
