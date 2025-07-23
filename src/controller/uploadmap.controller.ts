import { Body, Controller, Get, Inject, Post, Query } from '@midwayjs/core';
import { UploadMapService } from '@/service/uploadmap.service';

@Controller('/uploadmap')
export class UploadMapController {
  @Inject()
  uploadMapService: UploadMapService;

  @Post('upload')
  async uploadMap(@Body() body: any) {}

  @Get('fetchMap')
  async fetchMap(@Query() query: { taskid: string }) {
    const { taskid } = query;
    const mapInfo = await this.uploadMapService.fetchMap(taskid);

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
}
