import { JwtPassportMiddleWare } from '@/middleware/jwt.middleware';
import { AccessService } from '@/service/access.service';
import { Body, Controller, Get, Inject, Post, Query } from '@midwayjs/core';

@Controller('/access')
export class AccessController {
  @Inject()
  accessService: AccessService;

  @Post('/createAccess')
  async createAccess(
    @Body()
    body: {
      access_name: string;
      access_priority: number;
      parent_id: string;
      child_id: string;
      extra_info_json: string;
    }
  ) {
    try {
      const {
        access_name,
        access_priority,
        parent_id,
        child_id,
        extra_info_json,
      } = body;
      const access = await this.accessService.createAccess(
        access_name,
        access_priority,
        parent_id,
        child_id,
        extra_info_json
      );
      if (access.success) {
        return {
          success: true,
          message: '创建权限成功',
          data: access.data,
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

  @Get('/list', { middleware: [JwtPassportMiddleWare] })
  async getAccessList(@Query() query: { page: number; pageSize: number }) {
    try {
      if (!query.page || !query.pageSize) {
        return {
          success: false,
          message: '页码和每页条数不能为空',
          data: null,
        };
      }

      const accessList = await this.accessService.getAccessList({
        page: Number(query.page),
        pageSize: Number(query.pageSize),
      });

      if (!accessList.success) {
        return {
          success: false,
          message: '获取权限列表失败',
          data: null,
          total: 0,
        };
      }

      return {
        success: true,
        message: '获取权限列表成功',
        data: accessList.data,
        total: accessList.total,
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

  @Get('/detail', { middleware: [JwtPassportMiddleWare] })
  async getAccessDetail(@Query() query: { access_id: string }) {
    try {
      if (!query.access_id) {
        return {
          success: false,
          message: '权限ID不能为空',
          data: null,
        };
      }

      const accessDetail = await this.accessService.getAccessDetail(query);

      if (!accessDetail.success) {
        return {
          success: false,
          message: '获取权限详情失败',
          data: null,
        };
      }

      return {
        success: true,
        message: '获取权限详情成功',
        data: accessDetail.data,
      };
    } catch (error) {
      return {
        success: false,
        message: '获取权限详情失败',
        data: null,
      };
    }
  }

  @Post('/update', { middleware: [JwtPassportMiddleWare] })
  async updateAccess(
    @Body()
    body: {
      access_id: string;
      access_name: string;
      access_priority: number;
      access_status: string;
      parent_id: string;
      child_id: string;
      extra_info_json: string;
    }
  ) {
    try {
      if (!body.access_id) {
        return {
          success: false,
          message: '权限ID不能为空',
          data: null,
        };
      }

      const updateAccess = await this.accessService.updateAccess(body);

      if (!updateAccess.success) {
        return {
          success: false,
          message: '更新权限失败',
          data: null,
        };
      }

      return {
        success: true,
        message: '更新权限成功',
        data: updateAccess.data,
      };
    } catch (error) {
      return {
        success: false,
        message: '更新权限失败',
        data: null,
      };
    }
  }

  @Post('/delete', { middleware: [JwtPassportMiddleWare] })
  async deleteAccess(@Body() body: { access_id: string }) {
    try {
      if (!body.access_id) {
        return {
          success: false,
          message: '权限ID不能为空',
          data: null,
        };
      }

      const deleteAccess = await this.accessService.deleteAccess(body);

      if (!deleteAccess.success) {
        return {
          success: false,
          message: '删除权限失败',
          data: null,
        };
      }

      return {
        success: true,
        message: '删除权限成功',
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        message: '删除权限失败',
        data: null,
      };
    }
  }

  @Get('/accessTree', { middleware: [JwtPassportMiddleWare] })
  async getAccessTree() {
    try {
      const accessTree = await this.accessService.getAccessTree();
      console.log(accessTree);
      if (!accessTree.success) {
        return {
          success: false,
          message: '获取权限树失败',
          data: null,
        };
      }

      return {
        success: true,
        message: '获取权限树成功',
        data: accessTree.data,
      };
    } catch (error) {
      return {
        success: false,
        message: '获取权限树失败',
        data: null,
      };
    }
  }
}
