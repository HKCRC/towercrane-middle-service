import { PrismaService } from '@/providers/prisma';
import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

@Provide()
@Scope(ScopeEnum.Singleton)
export class UploadMapService {
  private readonly uploadDir = process.env.UPLOAD_DIR;

  async fetchMap(towerCraneId: string) {
    try {
      const mapInfo = await PrismaService.mapInfo.findMany({
        where: {
          tower_crane_id: towerCraneId,
        },
        orderBy: {
          version: 'desc',
        },
      });
      let isNeedUpdate = false;
      if (mapInfo.length > 1 && mapInfo[0].isUsed === false) {
        isNeedUpdate = true;
      }

      if (!mapInfo) {
        return {
          success: false,
          message: '地图信息不存在',
        };
      }
      return {
        success: true,
        message: '获取地图信息成功',
        data: {
          mapList: mapInfo,
          isNeedUpdate,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: '获取地图信息失败',
        data: null,
      };
    }
  }

  async upload(file: Buffer, crane_id: string) {
    try {
      const taskid = `${new Date().getTime()}-${uuidv4().slice(0, 8)}`;

      // // 确保上传目录存在
      // if (!existsSync(`${this.uploadDir}/${taskid}`)) {
      //   await mkdir(`${this.uploadDir}/${taskid}`, { recursive: true });
      // }

      // 生成唯一文件名
      const fileName = `${taskid}.jpg`;
      const filePath = join(this.uploadDir, fileName);

      await writeFile(filePath, file);

      // 如果之前有地图，则更新地图
      const craneInfo = await PrismaService.mapInfo.findFirst({
        where: {
          tower_crane_id: crane_id.toString(),
        },
      });

      const executeResult = await PrismaService.mapInfo.create({
        data: {
          map_id: taskid,
          map_url: fileName,
          tower_crane_id: crane_id.toString(),
          version: craneInfo?.version ? craneInfo.version + 1 : 0,
        },
      });

      return {
        success: true,
        data: executeResult,
        message: '上传成功',
      };
    } catch (error) {
      console.log('upload error', error);
      return {
        data: null,
        success: false,
        message: '上传失败',
      };
    }
  }

  async selectMap(mapid: string) {
    try {
      const updateMapResult = await PrismaService.mapInfo.update({
        where: {
          map_id: mapid,
        },
        data: {
          isUsed: true,
        },
      });

      if (updateMapResult) {
        return {
          success: true,
          message: '选择地图成功',
          data: updateMapResult,
        };
      }

      return {
        success: false,
        message: '选择地图失败',
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        message: '选择地图失败',
        data: null,
      };
    }
  }
}
