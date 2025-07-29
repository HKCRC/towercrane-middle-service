import { IdentityService } from '@/service/identity.service';
import { JwtPassportMiddleWare } from '@/middleware/jwt.middleware';
import { Body, Controller, Get, Inject, Post, Query } from '@midwayjs/core';

@Controller('/identity')
export class IdentityController {
  @Inject()
  identityService: IdentityService;

  @Post('/createIdentity', { middleware: [JwtPassportMiddleWare] })
  async createIdentity(
    @Body()
    body: {
      identity_name: string;
      identity_value: string;
      extra_info_json: string;
    }
  ) {
    try {
      const { identity_name, identity_value, extra_info_json } = body;

      if (!identity_name || !identity_value) {
        return {
          success: false,
          message: '权限名称和权限值不能为空',
          data: null,
        };
      }

      const identity = await this.identityService.createIdentity(
        identity_name,
        identity_value,
        extra_info_json
      );

      if (identity.success) {
        return {
          success: true,
          message: '创建身份成功',
          data: identity.data,
        };
      } else {
        return {
          success: false,
          message: '创建身份失败',
          data: null,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '创建身份失败',
        data: null,
      };
    }
  }

  @Get('/list', { middleware: [JwtPassportMiddleWare] })
  async getIdentityList(@Query() query: { page: number; pageSize: number }) {
    try {
      if (!query.page || !query.pageSize) {
        return {
          success: false,
          message: '页码和每页条数不能为空',
          data: null,
        };
      }

      const identityList = await this.identityService.getIdentityList({
        page: Number(query.page),
        pageSize: Number(query.pageSize),
      });

      if (!identityList.success) {
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
        data: identityList.data,
        total: identityList.total,
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
  async getIdentityDetail(@Query() query: { identity_id: string }) {
    try {
      if (!query.identity_id) {
        return {
          success: false,
          message: '权限ID不能为空',
          data: null,
        };
      }

      const identityDetail = await this.identityService.getIdentityDetail(
        query
      );

      if (!identityDetail.success) {
        return {
          success: false,
          message: '获取权限详情失败',
          data: null,
        };
      }

      return {
        success: true,
        message: '获取权限详情成功',
        data: identityDetail.data,
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
  async updateIdentity(
    @Body()
    body: {
      identity_id: string;
      identity_name: string;
      identity_value: string;
      extra_info_json: string;
    }
  ) {
    try {
      if (!body.identity_id || !body.identity_name || !body.identity_value) {
        return {
          success: false,
          message: '权限ID、权限名称和权限值不能为空',
          data: null,
        };
      }

      const updateIdentity = await this.identityService.updateIdentity(body);

      if (!updateIdentity.success) {
        return {
          success: false,
          message: '更新权限失败',
          data: null,
        };
      }

      return {
        success: true,
        message: '更新权限成功',
        data: updateIdentity.data,
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
  async deleteIdentity(@Body() body: { identity_id: string }) {
    try {
      if (!body.identity_id) {
        return {
          success: false,
          message: '权限ID不能为空',
          data: null,
        };
      }

      const deleteIdentity = await this.identityService.deleteIdentity(body);

      if (!deleteIdentity.success) {
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
}
