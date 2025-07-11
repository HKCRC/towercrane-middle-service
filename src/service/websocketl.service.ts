import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { ServerOptions } from 'socket.io';
import { ILogger, Inject, Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { RedisService } from '@midwayjs/redis';
import { BINARY_FLAG, SOCKET_EVENT } from '@/constant';
import { parseBinaryData } from '@/utils/message';
import { AlgorithmService } from './algorithm.service';
import { RedisExpirationService } from './redis-expiration.service';
import { v4 as uuidv4 } from 'uuid';
import { AlgorithmStatus } from '@/types';

interface SocketEventHandlers {
  [eventName: string]: (socket: Socket, data: any) => void;
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class SocketIOService {
  private io: Server | null = null;
  private server: HttpServer | null = null;
  private eventHandlers: SocketEventHandlers = {};

  @Inject()
  private algorithmService: AlgorithmService;

  @Inject()
  private redisExpirationService: RedisExpirationService;

  @Inject()
  logger: ILogger;

  @Inject()
  redisService: RedisService;

  /**
   * 初始化 Socket.io 服务器
   * @param port 端口号
   * @param options 配置选项
   */
  public async initialize(
    port: number,
    options: Partial<ServerOptions> = {}
  ): Promise<void> {
    if (this.io) {
      console.log('Socket.io server already initialized');
      return;
    }

    this.server = new HttpServer();
    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      ...options,
    });

    // 设置连接事件处理
    this.setupConnectionHandlers();

    // 初始化Redis过期事件服务
    await this.setupRedisExpirationService();

    return new Promise<void>(resolve => {
      this.server.listen(port, () => {
        console.log(`Socket.io server started on port ${port}`);
        resolve();
      });
    });
  }

  /**
   * 设置Redis过期事件服务
   */
  private async setupRedisExpirationService(): Promise<void> {
    try {
      // 初始化Redis过期服务
      await this.redisExpirationService.initialize();

      // 设置Socket.IO实例
      this.redisExpirationService.setSocketIO(this.io);

      // 注册算法控制权过期处理
      this.redisExpirationService.registerExpirationHandler({
        keyPattern: 'algorithm-',
        keyType: 'algorithm_control',
        callback: async (
          expiredKey: string,
          keyType: string,
          algorithmId: string
        ) => {
          await this.handleAlgorithmControlExpired(algorithmId);
        },
      });

      this.logger.info('Redis expiration service setup complete');
    } catch (error) {
      this.logger.error('Failed to setup Redis expiration service:', error);
    }
  }

  /**
   * 处理算法控制权过期
   */
  private async handleAlgorithmControlExpired(
    algorithmId: string
  ): Promise<void> {
    this.logger.info(
      `Handling algorithm control expiration for: ${algorithmId}`
    );

    // 使用Redis过期服务发送通知
    await this.redisExpirationService.notifyAlgorithmControlExpired(
      algorithmId
    );

    // 可以添加其他业务逻辑，如更新数据库状态等
    try {
      await this.algorithmService.updateAlgorithm(algorithmId, {
        status: AlgorithmStatus.IDLE,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update algorithm status for ${algorithmId}:`,
        error
      );
    }
  }

  private setupConnectionHandlers() {
    this.io.on('connection', async (socket: Socket) => {
      const userID = socket.handshake.auth.userID;

      if (userID) {
        await this.objectInsert(socket.id, { type: 'client', id: userID });
        await this.objectInsert('user' + userID, {
          status: 'online',
          socketID: socket.id,
        });
      }

      // 注册事件处理器
      Object.entries(this.eventHandlers).forEach(([eventName, handler]) => {
        socket.on(eventName, (data: any) => handler(socket, data));
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        this.disconnectHandler(socket);
      });

      socket.on('error', (error: Error) => {
        console.error('Socket error:', error);
      });

      socket.on(SOCKET_EVENT.CLIENT_MSG, async (data: any) => {
        this.clientMsgHandler(socket, data);
      });

      socket.on(SOCKET_EVENT.SERVER_MSG, async (data: any) => {
        this.serverMsgHandler(socket, data);
      });

      socket.on(SOCKET_EVENT.SERVER_REGISTER, async (data: any) => {
        this.serverRegisterHandler(socket, data);
      });

      socket.on(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, async (data: any) => {
        this.clientRequestAlgorithmHandler(socket, data);
      });

      socket.on(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, async (data: any) => {
        this.clientReassignAlgorithmHandler(socket, data);
      });

      socket.on(SOCKET_EVENT.CLIENT_EXIT, async (data: any) => {
        this.clientExitHandler(socket, data);
      });
      socket.on(SOCKET_EVENT.CLIENT_LOCATION, async (data: any) => {
        this.clientLocationHandler(socket, data);
      });
    });
  }

  private async clientLocationHandler(socket: Socket, data: any) {
    console.log('收到客户端位置消息:', data);
    try {
      const parseData = JSON.parse(data);
      if (!parseData?.userID) {
        this.logger.error(
          'clientLocationHandler Error:',
          'userID is undefined'
        );
        return;
      }
      const { userID, location, place_id, userInfo } = parseData;
      const insertLocationAndUserInfo = {
        ...location,
        ...userInfo,
      };
      await this.redisService.hset(
        `user-position-${place_id}`,
        userID,
        JSON.stringify(insertLocationAndUserInfo)
      );
      this.logger.info('收到客户端位置消息:', JSON.stringify(parseData));
    } catch (error) {
      this.logger.error('clientLocationHandler Error:', error);
    }
  }

  // 用户退出
  private async clientExitHandler(socket: Socket, data: any) {
    try {
      const parseData = JSON.parse(data);

      if (!parseData?.userID) {
        this.logger.error('clientExitHandler Error:', 'userID is undefined');
        return;
      }

      await this.handleUserOfflineStatus(parseData?.userID, this.io);

      await this.redisService.hset(
        'user' + parseData.userID,
        'status',
        'offline'
      );
      if (parseData?.userPlaceID) {
        await this.redisService.hdel(
          `user-position-${parseData?.userPlaceID}`,
          parseData.userID
        );
      }

      // 释放用户占用的算法资源
      const algorithmID = await this.getAlgorithmByUserId(parseData.userID);
      if (algorithmID) {
        await this.deleteAlgorithmUserRelation(algorithmID, parseData.userID);
      }
      socket.disconnect();
    } catch (e) {
      this.logger.error('clientExitHandler Error:', e);
    }
  }

  private async clientReassignAlgorithmHandler(socket: Socket, data: any) {
    try {
      const parseData = JSON.parse(data);

      const lockKey = `lock:reassign:${parseData.towercraneID}`;

      try {
        await this.acquireLockWithRetry(lockKey, 50000); // 锁定50秒

        const { assignUserID, currentUserID, towercraneID } = parseData;

        if (!assignUserID || !towercraneID || !currentUserID) {
          this.logger.error(
            'clientReassignAlgorithmHandler Error:',
            'userID or towercraneID is undefined'
          );
          return;
        }
        // 检查当前用户是否已有分配关系
        const existedRelationByID = await this.redisService.get(
          `algorithm-${towercraneID}`
        );

        // 如果当前用户不是权限使用人，当然就不能分配权限了
        if (existedRelationByID && existedRelationByID !== currentUserID) {
          socket.emit(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, 'fail');
          return;
        }

        // 因为权限指派的前提必须是当前用户占有该塔吊的控制权限，所以无需检查当前塔机是否已有分配关系
        const setResult = await this.setAlgorithmUserRelation(
          towercraneID,
          assignUserID,
          currentUserID
        );
        console.log('setResult', setResult);
        if (setResult) {
          socket.emit(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, 'success');
          await this.handleClientStatusUpdate(towercraneID, this.io);
        } else {
          socket.emit(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, 'fail');
        }
      } catch (error) {
        this.logger.error('clientReassignAlgorithmHandler Error:', error);
        socket.emit(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, 'fail');
      } finally {
        await this.releaseLock(lockKey);
      }
    } catch (e) {
      this.logger.error('clientReassignAlgorithmHandler Error:', e);
      socket.emit(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, 'fail');
    }
  }

  private async clientRequestAlgorithmHandler(socket: Socket, data: any) {
    try {
      const parseData = JSON.parse(data);
      const algorithmID = parseData?.algorithmID.toString();
      const lockKey = `lock:request:${algorithmID}`;

      try {
        await this.acquireLockWithRetry(lockKey, 50000); // 锁定50秒

        if (!parseData.userID || !parseData.algorithmID) {
          this.logger.error(
            'clientRequestAlgorithmHandler Error:',
            'userID or algorithmID is undefined'
          );
          return;
        }

        // 检查当前塔吊是否已有被分配关系
        const result = await this.redisService.get(`algorithm-${algorithmID}`);
        if (result === null || result === undefined) {
          // 使用新的双向关系设置方法
          const setResult = await this.setAlgorithmUserRelation(
            algorithmID,
            parseData.userID
          );
          if (setResult) {
            socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'success');
            await this.handleClientStatusUpdate(parseData.algorithmID, this.io);
          } else {
            socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'fail');
          }
          return;
        } else {
          // 已被占用，返回失败
          socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'fail');
        }
      } catch (error) {
        this.logger.error('clientRequestAlgorithmHandler Error:', error);
        socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'fail');
      } finally {
        await this.releaseLock(lockKey);
      }
    } catch (e) {
      this.logger.error('clientRequestAlgorithmHandler Error:', e);
      socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'fail');
    }
  }

  private async releaseLock(lockKey: string) {
    const result = await this.redisService.del(lockKey);
    if (result === 1) {
      console.log(`Lock released: ${lockKey}`);
    } else {
      console.warn(`Failed to release lock: ${lockKey}`);
    }
  }

  // 算法端断开
  private async disconnectHandler(socket: Socket) {
    try {
      const socketData = await this.redisService.hgetall(socket.id);
      this.logger.info('socketData:', socketData);
      if (socketData && socketData.type === 'algorithm') {
        await this.handleAlgorithmOfflineStatus(socketData.id, this.io);
        await this.algorithmService.updateAlgorithm(socketData.id, {
          status: AlgorithmStatus.IDLE,
        });

        // 清理算法相关的Redis数据
        const currentUserId = await this.redisService.get(
          `algorithm-${socketData.id}`
        );

        if (currentUserId) {
          await this.deleteAlgorithmUserRelation(socketData.id, currentUserId);
        }

        await this.redisService.del(socket.id);
        await this.redisService.hset(
          'algorithm' + socketData.id,
          'status',
          'offline'
        );
        this.logger.info('算法端断开:', socket.id);
      } else if (socketData && socketData.type === 'client') {
        const currentUserId = await this.redisService.get(
          `algorithm-${socketData.id}`
        );
        await this.handleUserOfflineStatus(socketData.id, this.io);
        await this.redisService.del(socket.id);
        await this.redisService.hset(
          'user' + socketData.id,
          'status',
          'offline'
        );

        // 清理用户占用的算法资源
        const algorithmID = await this.getAlgorithmByUserId(socketData.id);
        if (algorithmID && currentUserId) {
          await this.deleteAlgorithmUserRelation(algorithmID, currentUserId);
        }

        await this.redisService.hdel(
          `user-position-${socketData.place_id}`,
          currentUserId
        );

        this.logger.info('用户断开:', socket.id);
      }
    } catch (error) {
      this.logger.error('disconnectHandler Error:', error);
    }
  }

  private async handleUserOfflineStatus(
    userID: string,
    io: Server,
    algorithmID?: string
  ) {
    if (!userID) {
      this.logger.error(
        'handleUserOfflineStatus Error:',
        'userID is undefined'
      );
      return;
    }

    // 如果没有传入algorithmID，尝试通过userID反向查找
    if (!algorithmID) {
      algorithmID = await this.findAlgorithmByUserId(userID);
    }

    if (!algorithmID) {
      return;
    }

    const existedRelationID = await this.redisService.get(
      `algorithm-${algorithmID}`
    );
    if (!existedRelationID) {
      return;
    }
    const stringMessage = JSON.stringify({
      [algorithmID]: 'free',
    });
    io.emit(SOCKET_EVENT.CLIENT_STATUS_NOTIFY, stringMessage);
  }

  // 添加反向查找方法
  public async findAlgorithmByUserId(userId: string): Promise<string | null> {
    try {
      const keys = await this.redisService.keys('algorithm-*');

      for (const key of keys) {
        const value = await this.redisService.get(key);
        if (value === userId) {
          // 提取algorithm ID
          const algorithmId = key.replace('algorithm-', '');
          return algorithmId;
        }
      }

      return null;
    } catch (error) {
      this.logger.error('findAlgorithmByUserId Error:', error);
      return null;
    }
  }

  // 改进的设置关系方法（带反向索引）
  public async setAlgorithmUserRelation(
    algorithmId: string,
    userId: string,
    originUserId?: string
  ): Promise<boolean> {
    try {
      const pipeline = this.redisService.pipeline();
      let expectedResults = 0;

      if (originUserId) {
        // 删除原用户的控制权
        pipeline.del(`userctrl-${originUserId}`);
        expectedResults++; // DEL操作返回数字，不是'OK'
      }

      // 正向关系：algorithm-{algorithmId} -> userId
      pipeline.set(`algorithm-${algorithmId}`, userId, 'EX', 60 * 60);
      expectedResults++; // SET操作返回'OK'

      // 反向关系：使用不同前缀避免冲突
      pipeline.set(`userctrl-${userId}`, algorithmId, 'EX', 60 * 60);
      expectedResults++; // SET操作返回'OK'

      const results = await pipeline.exec();

      // 记录详细的执行结果用于调试
      this.logger.info('Pipeline execution results:', results);

      if (!results || results.length !== expectedResults) {
        this.logger.error(
          'Pipeline execution failed or unexpected result count'
        );
        return false;
      }

      // 检查每个操作的结果
      let success = true;
      let resultIndex = 0;

      if (originUserId) {
        // DEL操作：检查是否有错误，返回值是数字(0或1)
        const delResult = results[resultIndex];
        if (delResult[0] !== null) {
          // 有错误
          this.logger.error('DEL operation failed:', delResult[0]);
          success = false;
        }
        resultIndex++;
      }

      // SET操作1：algorithm-{algorithmId}
      const setResult1 = results[resultIndex];
      if (setResult1[0] !== null || setResult1[1] !== 'OK') {
        this.logger.error('SET operation 1 failed:', setResult1);
        success = false;
      }
      resultIndex++;

      // SET操作2：userctrl-{userId}
      const setResult2 = results[resultIndex];
      if (setResult2[0] !== null || setResult2[1] !== 'OK') {
        this.logger.error('SET operation 2 failed:', setResult2);
        success = false;
      }

      this.logger.info(`setAlgorithmUserRelation result: ${success}`);
      return success;
    } catch (error) {
      this.logger.error('setAlgorithmUserRelation Error:', error);
      return false;
    }
  }

  // 通过userId快速查找algorithmId（使用反向索引）
  public async getAlgorithmByUserId(userId: string): Promise<string | null> {
    try {
      return await this.redisService.get(`userctrl-${userId}`);
    } catch (error) {
      this.logger.error('getAlgorithmByUserId Error:', error);
      return null;
    }
  }

  // 删除关系时同时删除两个方向的key
  public async deleteAlgorithmUserRelation(
    algorithmId: string,
    userId: string
  ): Promise<void> {
    try {
      const pipeline = this.redisService.pipeline();
      const isHaveAccessToAlgorithm = await this.redisService.get(
        `userctrl-${userId}`
      );
      // 如果当前用户正在使用算法，则不删除算法关系
      if (isHaveAccessToAlgorithm !== '') {
        pipeline.del(`algorithm-${algorithmId}`);
        pipeline.del(`userctrl-${userId}`);
        await pipeline.exec();
      }
    } catch (error) {
      this.logger.error('deleteAlgorithmUserRelationError:', error);
    }
  }

  private async handleAlgorithmOfflineStatus(algorithmID: string, io: Server) {
    const stringMessage = JSON.stringify({
      [algorithmID]: 'disconnected',
    });

    io.emit(SOCKET_EVENT.SERVER_STATUS_NOTIFY, stringMessage);
  }

  private async handleClientStatusUpdate(algorithmID: string, io: Server) {
    if (!algorithmID) {
      this.logger.error(
        'handleClientStatusUpdate Error:',
        'algorithmID is undefined'
      );
      return;
    }
    const existedUserID = await this.redisService.get(
      `algorithm-${algorithmID}`
    );
    const keys = await this.redisService.keys('user*');

    for (const key of keys) {
      try {
        const value = await this.redisService.hgetall(key);
        if (value['status'] === 'online' && !existedUserID) {
          const stringMessage = JSON.stringify({
            [algorithmID]: 'free',
          });
          io.to(value['socketID']).emit(
            SOCKET_EVENT.SERVER_STATUS_NOTIFY,
            stringMessage
          );
        } else if (
          value['status'] === 'online' &&
          existedUserID &&
          key.toString() === `user${existedUserID}`
        ) {
          const stringMessage = JSON.stringify({
            [algorithmID]: 'using',
          });
          io.to(value['socketID']).emit(
            SOCKET_EVENT.SERVER_STATUS_NOTIFY,
            stringMessage
          );
        } else if (value['status'] === 'online' && existedUserID.length > 0) {
          const stringMessage = JSON.stringify({
            [algorithmID]: 'occupied',
          });
          io.to(value['socketID']).emit(
            SOCKET_EVENT.SERVER_STATUS_NOTIFY,
            stringMessage
          );
        }
      } catch (error) {
        this.logger.warn(
          `Skipping key ${key} due to type mismatch:`,
          error.message
        );
        continue;
      }
    }
  }

  private async serverRegisterHandler(socket: Socket, data: any) {
    try {
      const parserData = JSON.parse(data);

      const existedID = await this.algorithmService.getAlgorithmByName(
        parserData?.name
      );

      if (existedID) {
        await this.handleClientStatusUpdate(existedID, this.io);
      }

      if (existedID) {
        const algorithm = {
          name: data.name,
          map_name: data.map_name,
          status: data.status,
          description: data.description,
          algorithm_id: existedID,
        };
        const result = await this.algorithmService.updateAlgorithm(
          existedID,
          algorithm
        );
        await this.objectInsert(socket.id, {
          type: 'algorithm',
          id: existedID,
        });
        await this.objectInsert('algorithm' + existedID.toString(), {
          status: 'online',
          socketID: socket.id,
        });

        this.logger.info('服务端已注册:', existedID, result);
      } else {
        const algorithm = {
          name: data.name,
          map_name: data.map_name,
          status: data.status,
          description: data.description,
          algorithm_id: uuidv4(),
        };
        const result = await this.algorithmService.createAlgorithm(algorithm);
        await this.objectInsert(socket.id, {
          type: 'algorithm',
          id: result.algorithm_id,
        });
        await this.objectInsert('algorithm' + result.algorithm_id, {
          status: 'online',
          socketID: socket.id,
        });
        this.logger.info('收到服务端注册消息:', algorithm);
      }
    } catch (e) {
      this.logger.error('serverRegisterHandler Error:', e);
    }
  }

  // 向当前使用着的用户发送消息
  private async serverMsgHandler(socket: Socket, data: any) {
    this.logger.info('收到向服务端发送的消息:', data);
    const algorithmID = await this.redisService.hget(socket.id, 'id');

    if (!algorithmID) {
      this.logger.error(
        'serverMsgHandler Error:',
        'serverMsgHandler algorithmID is undefined'
      );
      return;
    }
    try {
      const result = await this.redisService.get(`algorithm-${algorithmID}`);
      if (!result) {
        const message = parseBinaryData(data);
        this.logger.info('message after parseBinaryData:', message);
        return;
      }
      const userSocketID = await this.redisService.hget(
        'user' + result.toString(),
        'socketID'
      );
      // this.logger.info('result', result);
      // 向当前客户端发送响应, 此种私有信息的发送是根据socket.id进行的, 因为Socket.io会自动创建一个名为连接的
      // socket.id的房间, 所以可以直接使用socket.id来发送私有消息. 而在Redis中则需要保存此次连接过程中的socket.id
      // 和userID的对应关系, 以便后续的消息发送. 服务端的也类似

      socket.to(userSocketID).emit(SOCKET_EVENT.CLIENT_MSG, data);
      this.sendToClient(userSocketID, SOCKET_EVENT.SERVER_MSG, data);
    } catch (e) {
      this.logger.error('serverMsgHandler Error:', e);
    }
  }

  private async objectInsert(key: any, obj: any) {
    try {
      const stringKey = typeof key === 'string' ? key : key.toString();
      for (const [field, value] of Object.entries(obj)) {
        let stringValue;
        if (value === null || value === undefined) {
          stringValue = ''; // 将 null 或 undefined 转换为空字符串
        } else {
          stringValue = typeof value === 'string' ? value : value.toString();
        }

        await this.redisService.hset(stringKey, field, stringValue);
      }
    } catch (error) {
      console.error('Error storing object in hash:', error);
    }
  }

  private async clientMsgHandler(socket: Socket, data: any) {
    const userId = socket.handshake?.auth?.userID;
    if (!userId) {
      console.error('客户端消息没有用户ID');
      return;
    }

    const findUserAlgorthmRelation = await this.getAlgorithmByUserId(userId);
    if (!findUserAlgorthmRelation) {
      this.logger.info('对应关系不存在');
      return;
    }
    const algorithm_id = findUserAlgorthmRelation;
    const algorithmSocketID = await this.redisService.hget(
      'algorithm' + algorithm_id,
      'socketID'
    );

    try {
      if (typeof data === 'string' && !Buffer.isBuffer(data)) {
        data = JSON.stringify(data);
        this.sendToClient(algorithmSocketID, SOCKET_EVENT.SERVER_MSG, data);
      } else if (Buffer.isBuffer(data)) {
        const binaryData = Buffer.from(data);
        // 创建一个新的 Buffer 来存放标识位和原始数据
        const bufferWithFlag = Buffer.alloc(1 + binaryData.length);
        bufferWithFlag.writeUInt8(BINARY_FLAG, 0); // 在第一个位置写入标识位, 使用该方法避免算法端的数据被误解析
        binaryData.copy(bufferWithFlag, 1);
        this.logger.info('binaryData:', bufferWithFlag);
        // 广播给其他客户端
        this.sendToClient(
          algorithmSocketID,
          SOCKET_EVENT.SERVER_MSG,
          bufferWithFlag
        );
      }
    } catch (error) {
      this.logger.error('Error forwarding request:', error);
    }
    // 发送消息给用户
  }

  private async acquireLockWithRetry(
    lockKey: string,
    ttl: number,
    maxRetries = 3,
    retryDelay = 200
  ): Promise<string | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 使用SET命令的NX和EX选项，原子性地设置锁和TTL
        const setResult = await this.redisService.set(
          lockKey,
          'locked',
          'EX',
          Math.floor(ttl / 1000), // 转换为秒
          'NX'
        );

        if (setResult === 'OK') {
          console.log(`Lock acquired: ${lockKey} (attempt ${attempt})`);
          return lockKey;
        }

        console.warn(`Failed to acquire lock: ${lockKey} (attempt ${attempt})`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay)); // 等待一段时间后重试
        }
      } catch (error) {
        this.logger.error('acquireLockWithRetry Error:', error);
      }
    }
    return null;
  }

  /**
   * 注册事件处理器
   * @param eventName 事件名称
   * @param handler 事件处理函数
   */
  public on(
    eventName: string,
    handler: (socket: Socket, data: any) => void
  ): void {
    this.eventHandlers[eventName] = handler;
  }

  /**
   * 向所有客户端广播消息
   * @param event 事件名称
   * @param data 要发送的数据
   */
  public broadcast<T>(event: string, data: T): void {
    if (!this.io) {
      console.error('Socket.io server not initialized');
      return;
    }
    this.io.emit(event, data);
  }

  /**
   * 向特定客户端发送消息
   * @param socketId 客户端ID
   * @param event 事件名称
   * @param data 要发送的数据
   */
  public sendToClient<T>(socketId: string, event: string, data: T): void {
    if (!this.io) {
      console.error('Socket.io server not initialized');
      return;
    }
    this.io.to(socketId).emit(event, data);
  }

  /**
   * 向特定房间广播消息
   * @param room 房间名称
   * @param event 事件名称
   * @param data 要发送的数据
   */
  public broadcastToRoom<T>(room: string, event: string, data: T): void {
    if (!this.io) {
      console.error('Socket.io server not initialized');
      return;
    }
    this.io.to(room).emit(event, data);
  }

  /**
   * 获取Redis过期服务状态
   */
  public getExpirationServiceStats() {
    return this.redisExpirationService.getExpirationStats();
  }

  /**
   * 关闭 Socket.io 服务器
   */
  public close(): Promise<void> {
    return new Promise(resolve => {
      if (!this.io) {
        console.error('Socket.io server not initialized');
        return resolve();
      }

      this.io.close(async () => {
        console.log('Socket.io server closed');

        // 关闭Redis过期服务
        try {
          await this.redisExpirationService.close();
        } catch (error) {
          this.logger.error('Error closing Redis expiration service:', error);
        }

        this.io = null;
        this.server = null;
        resolve();
      });
    });
  }
}
