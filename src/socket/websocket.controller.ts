import {
  App,
  Inject,
  OnWSConnection,
  OnWSDisConnection,
  OnWSMessage,
  WSController,
} from '@midwayjs/core';
import { Application } from '@midwayjs/ws';
import { RedisService } from '@midwayjs/redis';
import { parseBinaryData } from '../utils/message';
import { ExtendedContext } from '../interface';
import { AlgorithmService } from '@/service/algorithm.service';
import { UserAlgorithmRelationService } from '@/service/userAlgorithmRelation.service';
import { AlgorithmStatus } from '@/types';

const BINARY_FLAG = 0x04;

@WSController()
export class WebSocketController {
  @App()
  app: Application;

  @Inject()
  redisService: RedisService;

  @Inject()
  algorithmService: AlgorithmService;

  @Inject()
  userAlgorithmRelationService: UserAlgorithmRelationService;

  // Helper methods
  async objectInsert(key: string, data: Record<string, any>) {
    for (const [field, value] of Object.entries(data)) {
      await this.redisService.hset(key, field, value);
    }
  }

  async acquireLockWithRetry(
    lockKey: string,
    ttl: number,
    maxRetries = 10,
    retryDelay = 200
  ) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.redisService.set(
        lockKey,
        'locked',
        'PX',
        ttl,
        'NX'
      );

      if (result !== null) {
        console.log(`Lock acquired: ${lockKey} (attempt ${attempt})`);
        return lockKey;
      }

      console.warn(`Failed to acquire lock: ${lockKey} (attempt ${attempt})`);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  async releaseLock(lockKey: string) {
    const result = await this.redisService.del(lockKey);
    if (result === 1) {
      console.log(`Lock released: ${lockKey}`);
    } else {
      console.warn(`Failed to release lock: ${lockKey}`);
    }
  }

  async handleUserOfflineStatus(userID: string) {
    const existedRelationID =
      await this.userAlgorithmRelationService.getRelationByUserId(userID);
    if (existedRelationID.length === 0) {
      return;
    }

    const stringMessage = JSON.stringify({
      [existedRelationID[0].algorithm_id]: 'free',
    });

    // 广播消息给所有连接的客户端
    this.app.emit('client-status-notify', stringMessage);
  }

  async handleAlgorithmOfflineStatus(algorithmID: string | number) {
    const stringMessage = JSON.stringify({
      [algorithmID]: 'disconnected',
    });

    // 广播消息给所有连接的客户端
    this.app.emit('server-status-notify', stringMessage);
  }

  async handleClientStatusUpdate(algorithmID: string) {
    const existedUserID =
      await this.userAlgorithmRelationService.getRelationByAlgorithmId(
        algorithmID
      );
    const keys = await this.redisService.keys('user*');
    console.log('keys:', keys);

    for (const key of keys) {
      const value = await this.redisService.hgetall(key);

      if (value['status'] === 'online' && existedUserID.length === 0) {
        const stringMessage = JSON.stringify({
          [algorithmID]: 'free',
        });

        // 广播，让客户端自行判断是否需要处理
        this.app.emit('server-status-notify', stringMessage);
      } else if (
        value['status'] === 'online' &&
        existedUserID.length > 0 &&
        key.toString() === `user${existedUserID[0].user_id}`
      ) {
        const stringMessage = JSON.stringify({
          [algorithmID]: 'using',
        });

        // 广播，让客户端自行判断是否需要处理
        this.app.emit('server-status-notify', stringMessage);
      } else if (value['status'] === 'online' && existedUserID.length > 0) {
        const stringMessage = JSON.stringify({
          [algorithmID]: 'occupied',
        });

        // 广播，让客户端自行判断是否需要处理
        this.app.emit('server-status-notify', stringMessage);
      }
    }
  }

  @OnWSConnection()
  async onConnectionMethod(ctx: ExtendedContext) {
    console.log('A new client is connected');

    if (ctx.handshake.user) {
      const userID = ctx.handshake.user.userID;
      console.log('socket user:', ctx.handshake.user);

      await this.objectInsert(ctx.id, { type: 'client', id: userID });
      await this.objectInsert('user' + userID, {
        status: 'online',
        socketID: ctx.id,
      });

      // 创建特定房间用于消息发送
      ctx.socket.join('user:' + userID);
      // 添加对特定消息的监听
      ctx.socket.on('client-msg:' + ctx.id, data => {
        ctx.socket.emit('client-msg', data);
      });

      console.log('用户已连接:', ctx.id);
    } else if (ctx.handshake.algorithmMode) {
      // 为算法连接添加特定监听
      ctx.socket.on('server-msg:' + ctx.id, data => {
        ctx.socket.emit('server-msg', data);
      });
    }
  }

  @OnWSDisConnection()
  async onDisConnectionMethod(ctx: ExtendedContext) {
    try {
      const socketData = await this.redisService.hgetall(ctx.id);
      console.log('socketData:', socketData);

      if (socketData && socketData.type === 'algorithm') {
        await this.handleAlgorithmOfflineStatus(socketData.id);
        await this.algorithmService.updateAlgorithm(socketData.id, {
          status: AlgorithmStatus.IDLE,
        });
        await this.userAlgorithmRelationService.deleteRelationByAlgorithmId(
          socketData.id
        );
        await this.redisService.del(ctx.id);
        await this.redisService.hset(
          'algorithm' + socketData.id,
          'status',
          'offline'
        );

        console.log('算法端断开:', ctx.id);
      } else if (socketData && socketData.type === 'client') {
        await this.handleUserOfflineStatus(socketData.id);
        await this.redisService.del(ctx.id);
        await this.redisService.hset(
          'user' + socketData.id,
          'status',
          'offline'
        );
        await this.userAlgorithmRelationService.deleteRelationByUserId(
          socketData.id
        );

        console.log('用户断开:', ctx.id);
      }
    } catch (error) {
      console.error('Error handling disconnection:', error);
    }
  }

  @OnWSMessage('client-msg')
  async onClientMessage(ctx: ExtendedContext, data: any) {
    console.log('收到客户端消息:', data);

    const userID = ctx.handshake.user.userID as string;
    const result = await this.userAlgorithmRelationService.getRelationByUserId(
      userID
    );
    console.log('result', result);

    if (result.length === 0) {
      return;
    }

    const algorithmSocketID = await this.redisService.hget(
      'algorithm' + result[0].algorithm_id.toString(),
      'socketID'
    );

    try {
      if (typeof data === 'string' && !Buffer.isBuffer(data)) {
        data = JSON.stringify(data);
        // 使用广播到指定房间
        this.app.emit('server-msg:' + algorithmSocketID, data);
      } else if (Buffer.isBuffer(data)) {
        const binaryData = Buffer.from(data);
        // 创建一个新的 Buffer 来存放标识位和原始数据
        const bufferWithFlag = Buffer.alloc(1 + binaryData.length);
        bufferWithFlag.writeUInt8(BINARY_FLAG, 0);
        binaryData.copy(bufferWithFlag, 1);

        console.log('binaryData:', bufferWithFlag);
        // 广播到指定房间
        this.app.emit('server-msg:' + algorithmSocketID, bufferWithFlag);
      }
    } catch (error) {
      console.error('Error forwarding request:', error);
    }
  }

  @OnWSMessage('server-msg')
  async onServerMessage(ctx: ExtendedContext, data: any) {
    console.log('收到服务端消息:', data);

    const algorithmID = (await this.redisService.hget(ctx.id, 'id')) as string;
    const result =
      await this.userAlgorithmRelationService.getRelationByAlgorithmId(
        algorithmID
      );

    if (result.length === 0) {
      const message = parseBinaryData(data);
      console.log('message:', message);
      return;
    }

    const userSocketID = await this.redisService.hget(
      'user' + result[0].user_id.toString(),
      'socketID'
    );
    console.log('result', result);

    // 使用广播到指定房间
    this.app.emit('client-msg:' + userSocketID, data);
  }

  @OnWSMessage('server-register')
  async onServerRegister(ctx: ExtendedContext, data: string) {
    const parsedData = JSON.parse(data);
    console.log('data', parsedData);

    const existedID = await this.algorithmService.getAlgorithmByName(
      parsedData.name
    );
    console.log('existedID:', existedID);

    await this.handleClientStatusUpdate(existedID.algorithm_id);

    if (existedID) {
      const result = await this.algorithmService.updateAlgorithm(
        existedID.toString(),
        {
          name: parsedData.name,
          map_name: parsedData.map_name,
          status: parsedData.status,
          description: parsedData.description,
        }
      );

      await this.objectInsert(ctx.id, { type: 'algorithm', id: existedID });
      await this.objectInsert('algorithm' + existedID.toString(), {
        status: 'online',
        socketID: ctx.id,
      });

      console.log('服务端已注册:', existedID, result);
    } else {
      const result = await this.algorithmService.createAlgorithm({
        name: parsedData.name,
        map_name: parsedData.map_name,
        status: parsedData.status,
        description: parsedData.description,
        algorithm_id: existedID.toString(),
      });

      await this.objectInsert(ctx.id, {
        type: 'algorithm',
        id: result.algorithm_id,
      });
      await this.objectInsert('algorithm' + result.algorithm_id, {
        status: 'online',
        socketID: ctx.id,
      });

      console.log('收到服务端注册消息:', result);
    }
  }

  @OnWSMessage('client-relation-register')
  async onClientRelationRegister(ctx: ExtendedContext, data: string) {
    const parsedData = JSON.parse(data);
    console.log('data', parsedData);

    const existedRelationByID =
      await this.userAlgorithmRelationService.getRelationByUserId(
        parsedData.userID
      );
    const existedRelationByTowerCraneID =
      await this.userAlgorithmRelationService.getRelationByAlgorithmId(
        parsedData.towercraneID
      );

    // eslint-disable-next-line eqeqeq
    if (existedRelationByTowerCraneID.length == 0) {
      const relation = await this.userAlgorithmRelationService.createRelation(
        parsedData.userID,
        parsedData.towercraneID
      );
      await this.handleClientStatusUpdate(parsedData.towercraneID);

      console.log('收到客户端注册消息:', relation);
      return;
    }

    const userStatus = await this.redisService.hget(
      'user' + existedRelationByTowerCraneID[0].user_id.toString(),
      'status'
    );
    console.log('existedRelationByID:', existedRelationByID);
    console.log(
      'existedRelationByTowerCraneID:',
      existedRelationByTowerCraneID
    );
    console.log('userStatus:', userStatus);

    if (
      existedRelationByTowerCraneID.length > 0 &&
      userStatus === 'online' &&
      existedRelationByTowerCraneID[0].user_id !== ctx.handshake.user.userID
    ) {
      ctx.socket.emit('client-relation-register', 'occupied');

      await this.userAlgorithmRelationService.deleteRelationByUserId(
        parsedData.userID
      );
      await this.handleClientStatusUpdate(parsedData.towercraneID);

      return;
    }

    if (existedRelationByID.length > 0) {
      ctx.socket.emit('client-relation-register', 'using');

      const result = await this.userAlgorithmRelationService.updateRelation(
        parsedData.userID,
        parsedData.towercraneID
      );
      console.log('客户端已注册:', result);
    } else {
      const relation = await this.userAlgorithmRelationService.createRelation(
        parsedData.userID,
        parsedData.towercraneID
      );

      if (relation?.id) {
        console.log('收到客户端注册消息:', relation);
      }
    }

    await this.handleClientStatusUpdate(parsedData.towercraneID);
  }

  @OnWSMessage('client-request-algorithm')
  async onClientRequestAlgorithm(ctx: ExtendedContext, data: string) {
    const parsedData = JSON.parse(data);
    console.log('data', parsedData, parsedData.algorithmID);

    const lockKey = `lock:request:${parsedData.algorithmID}`;

    try {
      await this.acquireLockWithRetry(lockKey, 50000); // 锁定50秒

      // 检查当前算法是否已有分配关系
      const result =
        await this.userAlgorithmRelationService.getRelationByAlgorithmId(
          parsedData.algorithmID
        );
      if (result.length === 0) {
        const insertResult =
          await this.userAlgorithmRelationService.createRelation(
            parsedData.userID,
            parsedData.algorithmID
          );

        if (insertResult) {
          ctx.socket.emit('client-request-algorithm', 'success');
          await this.handleClientStatusUpdate(parsedData.algorithmID);
        } else {
          ctx.socket.emit('client-request-algorithm', 'fail');
        }

        return;
      }

      // 若算法已被分配，检查当前分配用户的状态
      const userStatus = await this.redisService.hget(
        'user' + result[0].user_id.toString(),
        'status'
      );
      console.log('userStatus', userStatus);

      if (userStatus === 'offline') {
        await this.userAlgorithmRelationService.updateRelation(
          parsedData.userID,
          parsedData.algorithmID
        );
        ctx.socket.emit('client-request-algorithm', 'success');
        await this.handleClientStatusUpdate(parsedData.algorithmID);
      } else {
        ctx.socket.emit('client-request-algorithm', 'fail');
      }
    } catch (error) {
      console.error('Error in client-request-algorithm:', error);
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  @OnWSMessage('client-reassign-algorithm')
  async onClientReassignAlgorithm(ctx: ExtendedContext, data: string) {
    const parsedData = JSON.parse(data);
    console.log('Reassigning algorithm:', parsedData);

    const lockKey = `lock:reassign:${parsedData.towercraneID}`;

    try {
      await this.acquireLockWithRetry(lockKey, 50000); // 锁定50秒

      // 检查当前用户是否已有分配关系
      const existedRelationByID =
        await this.userAlgorithmRelationService.getRelationByUserId(
          parsedData.userID
        );
      if (existedRelationByID.length > 0) {
        ctx.socket.emit('client-reassign-algorithm', 'fail');
        return;
      }

      // 因为权限指派的前提必须是当前用户占有该塔吊的控制权限，所以无需检查当前塔机是否已有分配关系
      const result = await this.userAlgorithmRelationService.updateRelation(
        parsedData.userID,
        parsedData.towercraneID
      );
      if (result && result.id) {
        ctx.socket.emit('client-reassign-algorithm', 'success');
        await this.handleClientStatusUpdate(parsedData.towercraneID);
      } else {
        ctx.socket.emit('client-reassign-algorithm', 'fail');
      }
    } catch (error) {
      console.error('Error in client-reassign-algorithm:', error);
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  @OnWSMessage('client-exit')
  async onClientExit(ctx: ExtendedContext, data: string) {
    const parsedData = JSON.parse(data);
    console.log('data', parsedData);

    await this.handleUserOfflineStatus(parsedData.userID);
    await this.redisService.hset(
      'user' + parsedData.userID,
      'status',
      'offline'
    );
    await this.userAlgorithmRelationService.deleteRelationByUserId(
      parsedData.userID
    );

    ctx.socket.disconnect(true);
  }

  @OnWSMessage('broadcast-msg')
  async onBroadcastMessage(ctx: ExtendedContext, data: any) {
    console.log('收到广播消息:', data);
    // Broadcast messages are processed but not acted upon in this implementation
  }
}
