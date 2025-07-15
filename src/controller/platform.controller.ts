import { Controller, Inject, Post, Body } from '@midwayjs/core';
import { PlatformService } from '../service/platform.service';
import { AlgorithmInfoType } from '@/types';

@Controller('/platform')
export class PlatformController {
  @Inject()
  platformService: PlatformService;

  @Post('/add')
  async addConfig(@Body() body: AlgorithmInfoType) {
    try {
      const result = await this.platformService.addConfig(body);
      if (result.success) {
        return { success: true, message: 'OK', data: result.data };
      } else {
        return { success: false, message: result.message, data: null };
      }
    } catch (error) {
      return { success: false, message: error.message, data: null };
    }
  }

  @Post('/update')
  async updateConfig(@Body() body: AlgorithmInfoType) {
    try {
      const result = await this.platformService.updateConfig(body);
      if (result.success) {
        return { success: true, message: 'OK', data: result.data };
      } else {
        return { success: false, message: result.message, data: null };
      }
    } catch (error) {
      return { success: false, message: error.message, data: null };
    }
  }

  @Post('/delete')
  async deleteConfig(@Body() body: { algorithm_id: string }) {
    try {
      const result = await this.platformService.deleteConfig(body);
      if (result.success) {
        return { success: true, message: 'OK', data: result.data };
      } else {
        return { success: false, message: result.message, data: null };
      }
    } catch (error) {
      return { success: false, message: error.message, data: null };
    }
  }

  @Post('/list')
  async getConfigList() {
    try {
      const result = await this.platformService.getConfigList();
      if (result.success) {
        return { success: true, message: 'OK', data: result.data };
      } else {
        return { success: false, message: result.message, data: null };
      }
    } catch (error) {
      return { success: false, message: error.message, data: null };
    }
  }
}
