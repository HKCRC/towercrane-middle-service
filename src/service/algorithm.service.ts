import { PrismaService } from '@/providers/prisma';
import { Context, Inject, Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { AlgorithmStatus, StateUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';

@Provide()
@Scope(ScopeEnum.Request, { allowDowngrade: true })
export class AlgorithmService {
  @Inject()
  ctx: Context;

  async getAlgorithm(user: StateUser) {
    try {
      const getPlaceId = await PrismaService.user.findFirst({
        where: {
          uid: user.userId,
        },
      });
      if (!getPlaceId) {
        return {
          success: false,
          message: '用户不存在',
          data: null,
        };
      }
      const result = await PrismaService.algorithmInfo.findMany({
        where: {
          status: AlgorithmStatus.IDLE,
          place_id: getPlaceId.place_id,
        },
      });
      return result;
    } catch (error) {
      throw new Error('Failed to get algorithm');
    }
  }

  async getAlgorithmByAlgorithmId(algorithmId: string) {
    try {
      const result = await PrismaService.algorithmInfo.findFirst({
        where: { algorithm_id: algorithmId },
      });
      return result;
    } catch (error) {
      throw new Error('Failed to get algorithm by id');
    }
  }

  async getAlgorithmById(id: number) {
    try {
      const result = await PrismaService.algorithmInfo.findFirst({
        where: { id },
      });
      return result;
    } catch (error) {
      throw new Error('Failed to get algorithm by id');
    }
  }

  async getAlgorithmByName(name: string) {
    try {
      const result = await PrismaService.algorithmInfo.findFirst({
        where: { name },
      });
      return result;
    } catch (error) {
      throw new Error('Failed to get algorithm by name');
    }
  }

  async getAllAlgorithm(page: number, pageSize: number, placeId: string) {
    try {
      const total = await PrismaService.algorithmInfo.count({
        where: {
          place_id: placeId,
        },
      });
      const result = await PrismaService.algorithmInfo.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        where: {
          place_id: placeId,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return {
        success: true,
        message: 'OK',
        data: result,
        total,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed',
        data: error,
        total: 0,
      };
    }
  }

  async deleteAlgorithm(algorithmId: number) {
    try {
      const result = await PrismaService.algorithmInfo.delete({
        where: { id: algorithmId },
      });
      return result;
    } catch (error) {
      throw new Error('Failed to delete algorithm');
    }
  }

  async updateAlgorithm(
    algorithmId: number,
    data: {
      name?: string;
      description?: string;
      map_name?: string;
      status?: AlgorithmStatus;
      place_id?: string;
      extra_info_json?: Record<string, any>;
    }
  ) {
    try {
      const result = await PrismaService.algorithmInfo.update({
        where: { id: algorithmId },
        data,
      });
      return result;
    } catch (error) {
      throw new Error('Failed to update algorithm');
    }
  }

  async createAlgorithm(data: {
    name: string;
    description: string;
    extra_info_json: Record<string, any>;
    place_id: string;
    algorithm_type: string;
  }) {
    try {
      const algorithm_id = uuidv4();
      const map_name = '';
      const result = await PrismaService.algorithmInfo.create({
        data: {
          ...data,
          algorithm_id,
          map_name,
        },
      });
      return result;
    } catch (error) {
      console.error('Error creating algorithm:', error);
      throw new Error('Failed to create algorithm');
    }
  }
}
