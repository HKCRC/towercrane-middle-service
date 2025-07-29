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

  async getAccessTree() {
    try {
      // 获取所有权限数据
      const allAccess = await PrismaService.accessTree.findMany();

      // 构建权限树
      const accessTree = this.buildAccessTree(allAccess);

      if (accessTree) {
        return {
          success: true,
          message: '获取权限树成功',
          data: accessTree,
        };
      } else {
        return {
          success: false,
          message: '获取权限树失败',
          data: null,
        };
      }
    } catch (error) {
      console.log(error);
      return {
        success: false,
        message: '获取权限树失败',
        data: null,
      };
    }
  }

  // 递归构建权限树
  private buildAccessTree(allAccess: any[]): any[] {
    const tree: any[] = [];

    // 找到所有顶级权限（parent_id为空或为'0'的）
    const rootAccess = allAccess.filter(
      access =>
        !access.parent_id || access.parent_id === '' || access.parent_id === '0'
    );

    // 为每个顶级权限构建子树
    for (const access of rootAccess) {
      const node = {
        ...access,
        children: this.buildChildrenTree(allAccess, access.access_id),
      };
      tree.push(node);
    }

    return tree;
  }

  // 递归构建子权限树
  private buildChildrenTree(allAccess: any[], parentId: string): any[] {
    const children = this.findChildrenByParentId(allAccess, parentId);
    const childrenTree: any[] = [];

    for (const child of children) {
      const childNode = {
        ...child,
        children: this.buildChildrenTree(allAccess, child.access_id),
      };
      childrenTree.push(childNode);
    }

    return childrenTree;
  }

  // 根据parent_id查找子权限
  private findChildrenByParentId(allAccess: any[], parentId: string): any[] {
    return allAccess.filter(access => {
      // 检查parent_id是否包含当前权限的ID
      if (!access.parent_id) return false;

      // 如果parent_id是逗号分隔的字符串，检查是否包含当前parentId
      if (access.parent_id.includes(',')) {
        return access.parent_id.split(',').includes(parentId);
      }

      // 直接匹配
      return access.parent_id === parentId;
    });
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
