import { PrismaService } from '@/providers/prisma';
import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

@Provide()
@Scope(ScopeEnum.Singleton)
export class UploadMapService {
  private readonly uploadDir = process.env.UPLOAD_DIR;

  async fetchMap(taskid: string) {
    const mapInfo = await PrismaService.mapInfo.findUnique({
      where: {
        map_id: taskid,
      },
    });
    if (!mapInfo) {
      return {
        success: false,
        message: '地图信息不存在',
      };
    }
    return {
      success: true,
      message: '获取地图信息成功',
      data: mapInfo,
    };
  }

  async upload(file: Buffer, crane_id: string) {
    try {
      const taskid = `${new Date().getTime()}-${uuidv4().slice(0, 8)}`;

      // 确保上传目录存在
      if (!existsSync(`${this.uploadDir}/${taskid}`)) {
        await mkdir(`${this.uploadDir}/${taskid}`, { recursive: true });
      }

      // 生成唯一文件名
      const fileName = `${taskid}.jpg`;
      const filePath = join(`${this.uploadDir}/${taskid}`, fileName);

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
}
