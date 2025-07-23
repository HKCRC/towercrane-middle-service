import { PrismaService } from '@/providers/prisma';
import { Context, Inject, Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { AlgorithmStatus, StateUser } from '@/types';

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

  async getAllAlgorithm() {
    try {
      const result = await PrismaService.algorithmInfo.findMany({
        orderBy: {
          createdAt: 'desc',
        },
      });
      return result;
    } catch (error) {
      throw new Error('Failed to get all algorithm');
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
    algorithm_id: string;
    map_name: string;
    status: AlgorithmStatus;
  }) {
    try {
      const result = await PrismaService.algorithmInfo.create({
        data,
      });
      return result;
    } catch (error) {
      throw new Error('Failed to create algorithm');
    }
  }
}
