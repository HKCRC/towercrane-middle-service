import { JwtPassportMiddleWare } from '@/middleware/jwt.middleware';
import { AlgorithmService } from '@/service/algorithm.service';
import { StateUser } from '@/types';
import {
  Body,
  Context,
  Controller,
  Get,
  Inject,
  Post,
  Query,
} from '@midwayjs/core';

@Controller('/algorithm')
export class AlgorithmController {
  @Inject()
  algorithmService: AlgorithmService;

  @Inject()
  ctx: Context;

  @Get('/', { middleware: [JwtPassportMiddleWare] })
  async getAlgorithm() {
    try {
      const user = (this.ctx as any).state.user as StateUser;
      if (!user) {
        return {
          success: false,
          message: '用户未登录',
          data: null,
        };
      }
      const result = await this.algorithmService.getAlgorithm(user);
      return {
        success: true,
        message: 'OK',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed',
        data: error,
      };
    }
  }

  @Get('/all')
  async getAllAlgorithm(
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
    @Query('place_id') place_id: string
  ) {
    try {
      const result = await this.algorithmService.getAllAlgorithm(
        page,
        pageSize,
        place_id
      );
      return {
        success: true,
        message: 'OK',
        data: result.data,
        total: result.total,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed',
        data: error,
      };
    }
  }

  @Post('/delete')
  async deleteAlgorithm(@Body() data: { algorithmId: string }) {
    try {
      const result = await this.algorithmService.deleteAlgorithm(
        Number(data.algorithmId)
      );
      return {
        success: true,
        message: 'OK',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed',
        data: error,
      };
    }
  }

  @Post('/create')
  async createAlgorithm(
    @Body()
    data: {
      name: string;
      description: string;
      extra_info_json: Record<string, any>;
      place_id: string;
      algorithm_type: string;
    }
  ) {
    try {
      const result = await this.algorithmService.createAlgorithm(data);
      return {
        success: true,
        message: 'OK',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed',
        data: error,
      };
    }
  }

  @Post('/update')
  async updateAlgorithm(
    @Body()
    data: {
      id: number;
      name: string;
      description: string;
      algorithm_type: string;
      extra_info_json: Record<string, any>;
    }
  ) {
    try {
      const result = await this.algorithmService.updateAlgorithm(
        Number(data.id),
        data
      );
      return {
        success: true,
        message: 'OK',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed',
        data: error,
      };
    }
  }
}
