import { PrismaService } from '@/providers/prisma';
import { Provide } from '@midwayjs/core';
import { v4 as uuidv4 } from 'uuid';

@Provide()
export class IdentityService {
  async createIdentity(
    identity_name: string,
    identity_value: string,
    extra_info_json: string
  ) {
    try {
      const identityId = uuidv4();
      const identity = await PrismaService.accessIdentity.create({
        data: {
          identity_id: identityId,
          identity_name: identity_name,
          identity_value: identity_value,
          extra_info_json: extra_info_json,
        },
      });

      return {
        success: true,
        message: '创建权限成功',
        data: identity,
      };
    } catch (error) {
      return {
        success: false,
        message: '创建权限失败',
        data: null,
      };
    }
  }

  async getIdentityList(query: { page: number; pageSize: number }) {
    try {
      const identities = await PrismaService.accessIdentity.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      const total = await PrismaService.accessIdentity.count();

      return {
        success: true,
        message: '获取权限列表成功',
        data: identities,
        total: total,
      };
    } catch (error) {
      return {
        success: false,
        message: '获取权限列表失败',
        data: null,
        total: 0,
      };
    }
  }

  async getIdentityDetail(query: { identity_id: string }) {
    try {
      const identity = await PrismaService.accessIdentity.findUnique({
        where: { identity_id: query.identity_id },
      });

      if (!identity) {
        return {
          success: false,
          message: '权限不存在',
          data: null,
        };
      }

      return {
        success: true,
        message: '获取权限详情成功',
        data: identity,
      };
    } catch (error) {
      return {
        success: false,
        message: '获取权限详情失败',
        data: null,
      };
    }
  }

  async updateIdentity(body: {
    identity_id: string;
    identity_name: string;
    identity_value: string;
    extra_info_json: string;
  }) {
    try {
      const identity = await PrismaService.accessIdentity.update({
        where: { identity_id: body.identity_id },
        data: {
          identity_name: body.identity_name,
          identity_value: body.identity_value,
          extra_info_json: body.extra_info_json,
        },
      });

      return {
        success: true,
        message: '更新权限成功',
        data: identity,
      };
    } catch (error) {
      return {
        success: false,
        message: '更新权限失败',
        data: null,
      };
    }
  }

  async deleteIdentity(body: { identity_id: string }) {
    try {
      const identity = await PrismaService.accessIdentity.delete({
        where: { identity_id: body.identity_id },
      });

      return {
        success: true,
        message: '删除权限成功',
        data: identity,
      };
    } catch (error) {
      return {
        success: false,
        message: '删除权限失败',
        data: null,
      };
    }
  }
}
