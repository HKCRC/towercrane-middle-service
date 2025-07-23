import { JwtPassportMiddleWare } from '@/middleware/jwt.middleware';
import { AlgorithmService } from '@/service/algorithm.service';
import { AlgorithmStatus, StateUser } from '@/types';
import {
  Body,
  Context,
  Controller,
  Get,
  Inject,
  Param,
  Post,
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
  async getAllAlgorithm() {
    try {
      const result = await this.algorithmService.getAllAlgorithm();
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

  @Post('/:algorithmId')
  async deleteAlgorithm(@Param('algorithmId') algorithmId: string) {
    try {
      const result = await this.algorithmService.deleteAlgorithm(
        Number(algorithmId)
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
      algorithm_id: string;
      description: string;
      map_name: string;
      status: AlgorithmStatus;
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
      algorithm_id: string;
      name: string;
      description: string;
      map_name: string;
      status: AlgorithmStatus;
    }
  ) {
    try {
      const result = await this.algorithmService.updateAlgorithm(
        Number(data.algorithm_id),
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
