import { PrismaService } from '@/providers/prisma';
import { AlgorithmInfoType } from '@/types';
import { Context, Inject, Provide } from '@midwayjs/core';

@Provide()
export class PlatformService {
  @Inject()
  ctx: Context;

  async addConfig(config: AlgorithmInfoType) {
    const {
      name,
      description,
      map_name,
      algorithm_type,
      center_point,
      algorithm_id,
    } = config;
    try {
      const algorithmInfo = await PrismaService.algorithmInfo.create({
        data: {
          name,
          description,
          map_name,
          algorithm_type,
          center_point,
          algorithm_id,
          extra_info_json: {},
        },
      });
      return { success: true, message: 'OK', data: algorithmInfo };
    } catch (error) {
      throw new Error('Failed to add config');
    }
  }

  async updateConfig(config: AlgorithmInfoType) {
    const {
      name,
      description,
      map_name,
      algorithm_type,
      center_point,
      algorithm_id,
    } = config;
    try {
      const algorithmInfo = await PrismaService.algorithmInfo.update({
        where: { algorithm_id },
        data: { name, description, map_name, algorithm_type, center_point },
      });
      return { success: true, message: 'OK', data: algorithmInfo };
    } catch (error) {
      throw new Error('Failed to update config');
    }
  }

  async deleteConfig(config: { algorithm_id: string }) {
    const { algorithm_id } = config;
    try {
      const algorithmInfo = await PrismaService.algorithmInfo.delete({
        where: { algorithm_id },
      });
      return { success: true, message: 'OK', data: algorithmInfo };
    } catch (error) {
      throw new Error('Failed to delete config');
    }
  }

  async getConfigList() {
    try {
      const algorithmInfo = await PrismaService.algorithmInfo.findMany();
      return { success: true, message: 'OK', data: algorithmInfo };
    } catch (error) {
      throw new Error('Failed to get config list');
    }
  }
}
