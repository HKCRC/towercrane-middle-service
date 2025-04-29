import { PrismaService } from '@/providers/prisma';
import { Context, Inject, Provide } from '@midwayjs/core';
import { AlgorithmStatus } from '@/types';
@Provide()
export class AlgorithmService {
  @Inject()
  ctx: Context;

  async getAlgorithm() {
    try {
      const result = await PrismaService.algorithmInfo.findMany({
        where: {
          status: AlgorithmStatus.IDLE,
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

  async deleteAlgorithm(algorithmId: string) {
    try {
      const result = await PrismaService.algorithmInfo.delete({
        where: { algorithm_id: algorithmId },
      });
      return result;
    } catch (error) {
      throw new Error('Failed to delete algorithm');
    }
  }

  async updateAlgorithm(
    algorithmId: string,
    data: {
      name?: string;
      description?: string;
      map_name?: string;
      status?: AlgorithmStatus;
    }
  ) {
    try {
      const result = await PrismaService.algorithmInfo.update({
        where: { algorithm_id: algorithmId },
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
