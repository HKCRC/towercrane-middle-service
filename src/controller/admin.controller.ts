import { REGISTER_CODE } from '@/constant';
import { JwtPassportMiddleWare } from '@/middleware/jwt.middleware';
import { AdminService } from '@/service/admin.service';
import { AuthService } from '@/service/auth.service';
import { Body, Controller, Get, Inject, Post, Query } from '@midwayjs/core';

@Controller('/admin')
export class AdminController {
  @Inject()
  adminService: AdminService;

  @Inject()
  authService: AuthService;

  @Post('/login')
  async login(@Body() body: { username: string; password: string }) {
    if (!body.username || !body.password) {
      return {
        success: false,
        message: '用户名或密码不能为空',
        data: null,
      };
    }
    return this.adminService.login(body.username, body.password);
  }

  @Post('/register')
  async register(
    @Body() body: { username: string; password: string; code: string }
  ) {
    if (!body.username || !body.password || !body.code) {
      return {
        success: false,
        message: '手机号、密码、验证码不能为空',
        data: null,
      };
    }
    if (body.code !== REGISTER_CODE) {
      return {
        success: false,
        message: '验证码错误',
        data: null,
      };
    }
    return this.adminService.register(body.username, body.password);
  }

  @Get('/user/info', { middleware: [JwtPassportMiddleWare] })
  async getUserInfo() {
    try {
      return this.adminService.getUserInfo();
    } catch (error) {
      return {
        success: false,
        message: '获取用户信息失败',
        data: null,
      };
    }
  }

  @Post('/place/add', { middleware: [JwtPassportMiddleWare] })
  async addPlace(
    @Body()
    body: {
      place_name: string;
      place_type: string;
      place_address: string;
      extra_info_json: string;
    }
  ) {
    if (!body.place_name || !body.place_type || !body.place_address) {
      return {
        success: false,
        message: '工区名称、类型、地址不能为空',
        data: null,
      };
    }
    const addPlace = await this.adminService.addPlace(body);
    if (!addPlace.success) {
      return {
        success: false,
        message: '添加工区失败',
        data: null,
      };
    }
    return {
      success: true,
      message: '添加工区成功',
      data: addPlace.data,
    };
  }

  @Post('/place/update', { middleware: [JwtPassportMiddleWare] })
  async updatePlace(
    @Body()
    body: {
      place_id: string;
      place_name: string;
      place_type: string;
      place_address: string;
      extra_info_json: string;
    }
  ) {
    if (!body.place_id) {
      return {
        success: false,
        message: '工区ID不能为空',
        data: null,
      };
    }
    const updatePlace = await this.adminService.updatePlace(body);
    if (!updatePlace.success) {
      return {
        success: false,
        message: '更新工区失败',
        data: null,
      };
    }
    return {
      success: true,
      message: '更新工区成功',
      data: updatePlace.data,
    };
  }

  @Post('/place/delete', { middleware: [JwtPassportMiddleWare] })
  async deletePlace(@Body() body: { place_id: string }) {
    if (!body.place_id) {
      return {
        success: false,
        message: '工区ID不能为空',
        data: null,
      };
    }
    const deletePlace = await this.adminService.deletePlace(body);
    if (!deletePlace.success) {
      return {
        success: false,
        message: '删除工区失败',
        data: null,
      };
    }
    return {
      success: true,
      message: '删除工区成功',
      data: null,
    };
  }

  @Get('/place/list', { middleware: [JwtPassportMiddleWare] })
  async getPlaceList(@Query() query: { page: number; pageSize: number }) {
    if (!query.page || !query.pageSize) {
      return {
        success: false,
        message: '页码和每页条数不能为空',
        data: null,
      };
    }

    const placeList = await this.adminService.getPlaceList({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
    });

    if (!placeList.success) {
      return {
        success: false,
        message: '获取工区列表失败',
        data: null,
        total: 0,
      };
    }
    return {
      success: true,
      message: '获取工区列表成功',
      data: placeList.data,
      total: placeList.total,
    };
  }

  @Get('/place/detail', { middleware: [JwtPassportMiddleWare] })
  async getPlaceDetail(@Query() query: { place_id: string }) {
    if (!query.place_id) {
      return {
        success: false,
        message: '工区ID不能为空',
        data: null,
      };
    }
    const placeDetail = await this.adminService.getPlaceDetail(query);
    if (!placeDetail.success) {
      return {
        success: false,
        message: '获取工区详情失败',
        data: null,
      };
    }
    return {
      success: true,
      message: '获取工区详情成功',
      data: placeDetail.data,
    };
  }

  @Get('/user/list', { middleware: [JwtPassportMiddleWare] })
  async getCurrentPlaceUsers(@Query() query: { place_id: string }) {
    try {
      if (!query.place_id) {
        return {
          success: false,
          message: '工区ID不能为空',
          data: null,
        };
      }
      const userList = await this.authService.getCurrentPlaceUsers(
        query.place_id
      );
      if (!userList.success) {
        return {
          success: false,
          message: '获取当前工区用户失败',
          data: null,
        };
      }
      return {
        success: true,
        message: '获取当前工区用户成功',
        data: userList.data,
        total: userList.total,
      };
    } catch (error) {
      return {
        success: false,
        message: '获取当前工区用户失败',
        data: null,
        total: 0,
      };
    }
  }

  @Post('/user/add', { middleware: [JwtPassportMiddleWare] })
  async addUser(
    @Body()
    body: {
      place_id: string;
      phoneNumber: string;
      password: string;
      user_name: string;
      access_id: string;
    }
  ) {
    try {
      if (
        !body.place_id ||
        !body.user_name ||
        !body.password ||
        !body.access_id
      ) {
        return {
          success: false,
          message: '工区ID、用户名、密码、权限ID不能为空',
          data: null,
        };
      }
      const userList = await this.authService.register(
        body.phoneNumber,
        body.password,
        body.user_name,
        body.place_id,
        body.access_id
      );
      return {
        success: true,
        message: '添加用户成功',
        data: userList,
      };
    } catch (error) {
      return {
        success: false,
        message: '添加用户失败',
        data: null,
      };
    }
  }

  @Post('/user/update', { middleware: [JwtPassportMiddleWare] })
  async updateUser(
    @Body()
    body: {
      uid: string;
      user_name: string;
      phoneNumber: string;
      access_id: string;
    }
  ) {
    try {
      const { uid, user_name, phoneNumber, access_id } = body;
      console.log(uid, user_name, phoneNumber, access_id);
      if (!uid || !user_name || !access_id) {
        return {
          success: false,
          message: '用户ID、用户名不能为空',
          data: null,
        };
      }
      const updateUser = await this.authService.updateUser(
        uid,
        user_name,
        phoneNumber,
        access_id
      );
      return {
        success: true,
        message: '更新用户成功',
        data: updateUser,
      };
    } catch (error) {
      return {
        success: false,
        message: '更新用户失败',
        data: null,
      };
    }
  }

  @Post('/user/delete', { middleware: [JwtPassportMiddleWare] })
  async deleteUser(@Body() body: { user_id: string }) {
    try {
      if (!body.user_id) {
        return {
          success: false,
          message: '用户ID不能为空',
          data: null,
        };
      }
      const deleteUser = await this.authService.deleteUser(body.user_id);
      return {
        success: true,
        message: '删除用户成功',
        data: deleteUser,
      };
    } catch (error) {
      return {
        success: false,
        message: '删除用户失败',
        data: null,
      };
    }
  }
}
