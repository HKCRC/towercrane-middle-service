import { Body, Context, Controller, Inject, Post } from '@midwayjs/core';
import { UploadMapService } from '@/service/uploadmap.service';
import { JwtPassportMiddleWare } from '@/middleware/jwt.middleware';

@Controller('/uploadmap')
export class MapController {
  @Inject()
  uploadMapService: UploadMapService;

  @Inject()
  ctx: Context;

  @Post('/fetchMap', { middleware: [JwtPassportMiddleWare] })
  async fetchMap(@Body() body: { towerCraneId: string }) {
    const { towerCraneId } = body;
    const mapInfo = await this.uploadMapService.fetchMap(towerCraneId);

    if (mapInfo.success) {
      return {
        success: true,
        message: '获取地图信息成功',
        data: mapInfo.data,
      };
    } else {
      return {
        success: false,
        message: '获取地图信息失败',
        data: null,
      };
    }
  }

  @Post('/selectMap')
  async selectMap(@Body() body: { mapId: string }) {
    try {
      const { mapId } = body;
      const mapInfo = await this.uploadMapService.selectMap(mapId);

      if (mapInfo.success) {
        return {
          success: true,
          message: '选择地图信息成功',
          data: mapInfo.data,
        };
      } else {
        return {
          success: false,
          message: '选择地图信息失败',
          data: null,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '选择地图信息失败',
        data: null,
      };
    }
  }

  @Post('/deleteMap')
  async deleteMap(@Body() body: { mapId: string }) {
    const { mapId } = body;
    const mapInfo = await this.uploadMapService.deleteMap(mapId);

    if (mapInfo.success) {
      return {
        success: true,
        message: '删除地图成功',
        data: mapInfo.data,
      };
    } else {
      return {
        success: false,
        message: '删除地图失败',
        data: null,
      };
    }
  }
}
