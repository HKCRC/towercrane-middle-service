import { PrismaService } from '@/providers/prisma';
import { Provide } from '@midwayjs/core';
import { v4 as uuidv4 } from 'uuid';

@Provide()
export class AccessService {
  async createAccess(
    access_name: string,
    access_priority: number,
    parent_id: string,
    child_id: string,
    extra_info_json: string
  ) {
    try {
      const accessId = uuidv4();
      const access = await PrismaService.accessTree.create({
        data: {
          access_id: accessId,
          access_name: access_name,
          access_priority: access_priority,
          createdAt: new Date(),
          parent_id: parent_id,
          child_id: child_id,
          extra_info_json: extra_info_json,
        },
      });

      if (access) {
        return {
          success: true,
          message: '创建权限成功',
          data: access,
        };
      } else {
        return {
          success: false,
          message: '创建权限失败',
          data: null,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '创建权限失败',
        data: null,
      };
    }
  }

  async getAccessList({ page, pageSize }: { page: number; pageSize: number }) {
    try {
      const accessList = await PrismaService.accessTree.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      if (accessList) {
        const total = await PrismaService.accessTree.count();
        return {
          success: true,
          message: '获取权限列表成功',
          data: accessList,
          total: total,
        };
      } else {
        return {
          success: false,
          message: '获取权限列表失败',
          data: null,
          total: 0,
        };
      }
    } catch (error) {
      console.log(error);
      return {
        success: false,
        message: '获取权限列表失败',
        data: null,
        total: 0,
      };
    }
  }

  async getAccessDetail({ access_id }: { access_id: string }) {
    try {
      const accessDetail = await PrismaService.accessTree.findUnique({
        where: { access_id: access_id },
      });

      if (accessDetail) {
        return {
          success: true,
          message: '获取权限详情成功',
          data: accessDetail,
        };
      } else {
        return {
          success: false,
          message: '获取权限详情失败',
          data: null,
        };
      }
    } catch (error) {
      console.log(error);
      return {
        success: false,
        message: '获取权限详情失败',
        data: null,
      };
    }
  }

  async updateAccess({
    access_id,
    access_name,
    access_priority,
    access_status,
    parent_id,
    child_id,
    extra_info_json,
  }: {
    access_id: string;
    access_name: string;
    access_priority: number;
    access_status: string;
    parent_id: string;
    child_id: string;
    extra_info_json: string;
  }) {
    try {
      const access = await PrismaService.accessTree.update({
        where: { access_id: access_id },
        data: {
          access_name: access_name,
          access_priority: access_priority,
          access_status: access_status,
          parent_id: parent_id,
          child_id: child_id,
          extra_info_json: extra_info_json,
        },
      });

      if (access) {
        return {
          success: true,
          message: '更新权限成功',
          data: access,
        };
      } else {
        return {
          success: false,
          message: '更新权限失败',
          data: null,
        };
      }
    } catch (error) {
      console.log(error);
      return {
        success: false,
        message: '更新权限失败',
        data: null,
      };
    }
  }

  async deleteAccess({ access_id }: { access_id: string }) {
    try {
      const access = await PrismaService.accessTree.delete({
        where: { access_id: access_id },
      });

      if (access) {
        return {
          success: true,
          message: '删除权限成功',
          data: access,
        };
      } else {
        return {
          success: false,
          message: '删除权限失败',
          data: null,
        };
      }
    } catch (error) {
      console.log(error);
      return {
        success: false,
        message: '删除权限失败',
        data: null,
      };
    }
  }
}
