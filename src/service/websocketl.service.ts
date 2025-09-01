import { Server, Socket, ServerOptions } from 'socket.io';
import { Server as HttpServer } from 'http';
import { ILogger, Inject, Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { RedisService } from '@midwayjs/redis';
import {
  BINARY_FLAG,
  MESSAGE_TYPE,
  SOCKET_EVENT,
  SPECIAL_STATUS,
  TOWER_CRANE_CONTROL_STATUS,
  USER_STATUS,
} from '@/constant';
// import { parseBinaryData } from '@/utils/message';
import { AlgorithmService } from './algorithm.service';
import { RedisExpirationService } from './redis-expiration.service';
import { v4 as uuidv4 } from 'uuid';
import { AlgorithmStatus } from '@/types';
import { UploadMapService } from './uploadmap.service';
import { AuthService } from './auth.service';

interface SocketEventHandlers {
  [eventName: string]: (socket: Socket, data: any) => void;
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class SocketIOService {
  private io: Server | null = null;
  private server: HttpServer | null = null;
  private eventHandlers: SocketEventHandlers = {};
  private globalCheckTimer: NodeJS.Timeout | null = null;
  private isGlobalCheckRunning = false;

  @Inject()
  private algorithmService: AlgorithmService;

  @Inject()
  private redisExpirationService: RedisExpirationService;

  @Inject()
  private uploadMapService: UploadMapService;

  @Inject()
  logger: ILogger;

  @Inject()
  redisService: RedisService;

  @Inject()
  authService: AuthService;

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
        allowedHeaders: ['*'],
        credentials: true,
      },
      allowUpgrades: true,
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      maxHttpBufferSize: 1e6,
      ...options,
    });

    // 设置连接事件处理
    this.setupConnectionHandlers();

    // 初始化Redis过期事件服务
    await this.setupRedisExpirationService();

    // 启动全局检查机制
    this.startGlobalCheck();

    return new Promise<void>(resolve => {
      this.server.listen(port, '0.0.0.0', () => {
        console.log(
          `Socket.io server started on port ${port} (all interfaces)`
        );
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
      await this.algorithmService.updateAlgorithm(Number(algorithmId), {
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
      const { userID } = socket.handshake.auth;

      if (userID) {
        await this.objectInsert(socket.id, { type: 'client', id: userID });
        await this.objectInsert(`user${userID}`, {
          status: USER_STATUS.CONNECTED,
          socketID: socket.id,
        });

        // 用户上线时主动发送相关算法的当前状态
        await this.sendUserRelatedAlgorithmStatus(socket, userID);
      }

      // 注册事件处理器
      Object.entries(this.eventHandlers).forEach(([eventName, handler]) => {
        socket.on(eventName, (data: any) => handler(socket, data));
      });

      socket.on('disconnect', () => {
        this.disconnectHandler(socket);
      });

      socket.on('error', (error: Error) => {
        console.error('Socket error:', error);
      });

      socket.on(SOCKET_EVENT.CLIENT_MSG, async (data: any) => {
        const { userID } = socket.handshake.auth;
        if (!userID) {
          this.logger.error('clientMsgHandler Error:', 'userID is undefined');
          return;
        }

        const isHaveAlgorithmPermission = await this.redisService.get(
          `userctrl-${userID}`
        );

        if (
          isHaveAlgorithmPermission === null ||
          isHaveAlgorithmPermission === undefined
        ) {
          this.logger.error('ACCESS DENIED:', '用户没有权限1');
          this.io?.to(socket.id).emit(SOCKET_EVENT.CLIENT_MSG, {
            success: false,
            type: 'AccessDenied',
            message: '用户没有权限',
          });
          return;
        }

        const peggingAlgorithm = await this.redisService.get(
          `algorithm-${isHaveAlgorithmPermission}`
        );

        if (peggingAlgorithm === null || peggingAlgorithm === undefined) {
          this.logger.error('ACCESS DENIED:', '用户没有权限2');
          this.io?.to(socket.id).emit(SOCKET_EVENT.CLIENT_MSG, {
            success: false,
            type: 'AccessDenied',
            message: '用户没有权限',
          });
          return;
        }
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

      socket.on(
        SOCKET_EVENT.CLIENT_ALGORITHM_CHECK_ACCESS,
        async (data: any) => {
          this.clientAlgorithmCheckAccessHandler(socket, data);
        }
      );

      socket.on(SOCKET_EVENT.CLIENT_FORCE_UPDATE_MAP, async (data: any) => {
        this.clientForceUpdateMapHandler(socket, data);
      });

      socket.on(SOCKET_EVENT.UPLOAD_MAP, async (data: any) => {
        this.serverUploadMapHandler(socket, data);
      });

      socket.on(SOCKET_EVENT.CLIENT_EXIT, async (data: any) => {
        this.clientExitHandler(socket, data);
      });
      socket.on(SOCKET_EVENT.CLIENT_LOCATION, async (data: any) => {
        this.clientLocationHandler(socket, data);
      });
      socket.on(SOCKET_EVENT.CLIENT_RELATION_REGISTER, async (data: any) => {
        this.clientRelationRegisterHandler(socket, data);
      });
      // 添加用户主动刷新状态的事件处理
      socket.on(SOCKET_EVENT.CLIENT_REFRESH_STATUS, async (data: any) => {
        this.handleRefreshStatus(socket, data);
      });
    });
  }

  private async clientForceUpdateMapHandler(socket: Socket, data: any) {
    try {
      console.log('clientForceUpdateMapHandler', data);
      const parseData = JSON.parse(data);
      const { mapUrl, towercraneIDIndex } = parseData;
      const allKeys = await this.redisService.keys('user*');
      // 过滤掉 userctrl- 开头的键，只保留纯用户状态键
      const keys = allKeys.filter(
        key => !key.startsWith('userctrl-') && !key.startsWith('user-')
      );
      for (const key of keys) {
        try {
          const getUser = await this.redisService.hgetall(key);
          // 向这个工地所有在线的观察者发送消息,如果当前塔吊实控人存在，则发送实控人ID，否则发送空
          if (getUser['towercraneID'] === towercraneIDIndex.toString()) {
            const stringMessage = JSON.stringify({
              success: true,
              map_url: mapUrl,
            });
            this.io
              ?.to(getUser['socketID'])
              .emit(SOCKET_EVENT.CLIENT_FORCE_UPDATE_MAP, stringMessage);
          }
        } catch (error) {
          this.logger.warn(
            `Skipping key ${key} due to type mismatch:`,
            error.message
          );
          continue;
        }
      }
    } catch (error) {
      this.logger.error('clientForceUpdateMapHandler Error:', error);
    }
  }

  private async checkTowerCraneStatusAndSendMessage(
    socket: Socket,
    algorithmID: string,
    userID: string
  ) {
    // 检查一下用户有没有塔吊权限
    const result = await this.redisService.get(`algorithm-${algorithmID}`);

    let status = TOWER_CRANE_CONTROL_STATUS.FREE;

    if (result === null || result === undefined) {
      status = TOWER_CRANE_CONTROL_STATUS.FREE;
    } else if (result === userID) {
      status = TOWER_CRANE_CONTROL_STATUS.USING;
    } else {
      status = TOWER_CRANE_CONTROL_STATUS.OCCUPIED;
    }

    const stringMessage = JSON.stringify({
      [algorithmID]: status,
      algorithmID: algorithmID,
      currentOccupiedId: result,
      action: MESSAGE_TYPE.ALGORITHM_STATUS_RESPONSE,
    });
    socket.emit(SOCKET_EVENT.CLIENT_ALGORITHM_CHECK_ACCESS, stringMessage);
  }

  private async serverUploadMapHandler(socket: Socket, data: any) {
    const socketId = socket.id;
    const getTowerCraneIndexId = await this.redisService.hget(socketId, 'id');

    try {
      const getTowerCraneIdFromDb =
        await this.algorithmService.getAlgorithmById(
          Number(getTowerCraneIndexId)
        );
      const placeId = getTowerCraneIdFromDb?.place_id;
      if (!getTowerCraneIdFromDb || !placeId) {
        this.logger.error('serverUploadMapHandler Error1:', '塔吊ID不存在');
        return;
      }
      const uploadResult = await this.uploadMapService.upload(
        data,
        getTowerCraneIdFromDb.algorithm_id
      );

      this.logger.info('serverUploadMapHandler-uploadResult', uploadResult);

      if (uploadResult.success) {
        // 向当前塔吊拥有权限的人播放消息
        this.notifyMapUploaded(
          getTowerCraneIdFromDb.algorithm_id,
          getTowerCraneIndexId,
          uploadResult.data
        );
      } else {
        this.logger.error('serverUploadMapHandler Error1:', uploadResult);
      }
    } catch (error) {
      this.logger.error('serverUploadMapHandler Error2:', error);
    }
  }

  // 向当前工区所有在线用户发送消息
  private async notifyMapUploaded(
    crane_id: string,
    crane_index_id: string,
    data: any
  ) {
    try {
      const getCurrentPlaceUser = await this.redisService.get(
        `algorithm-${crane_index_id}`
      );

      const userIsOnline = await this.redisService.get(
        `userctrl-${getCurrentPlaceUser}`
      );

      if (getCurrentPlaceUser && getCurrentPlaceUser !== '' && userIsOnline) {
        const currentOnlineUserSocketID = await this.redisService.hget(
          `user${userIsOnline}`,
          'socketID'
        );
        this.io
          ?.to(currentOnlineUserSocketID)
          .emit(SOCKET_EVENT.RECEIVE_MAP, data);
      }
    } catch (e) {
      console.error(e);
    }
  }

  private async clientAlgorithmCheckAccessHandler(socket: Socket, data: any) {
    try {
      const parseData = JSON.parse(data);

      const { userID, algorithmID, timestamp, username, placeID } = parseData;
      const findUser = await this.redisService.hgetall(`user${userID}`);

      if (
        findUser !== null &&
        findUser !== undefined &&
        findUser.status !== USER_STATUS.CONNECTED
      ) {
        await this.redisService.hset(
          `user${userID}`,
          'status',
          USER_STATUS.ONLINE,
          'lastHeartbeat',
          timestamp
        );
        await this.checkTowerCraneStatusAndSendMessage(
          socket,
          algorithmID,
          userID
        );

        return;
      } else {
        // 这是一种很特殊的情况，如果用户还可以持续发起socket，但是可能是系统重启了，没有记录到redis的注册记录，这里可能需要补一个状态
        await this.redisService.hset(
          `user${userID}`,
          'status',
          USER_STATUS.ONLINE,
          'lastHeartbeat',
          timestamp,
          'socketID',
          socket.id,
          'towercraneID',
          algorithmID,
          'username',
          username,
          'placeID',
          placeID
        );
        await this.checkTowerCraneStatusAndSendMessage(
          socket,
          algorithmID,
          userID
        );
        return;
      }
    } catch (error) {
      this.logger.error('clientAlgorithmCheckAccessHandler Error:', error);
    }
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
        lastHeartbeat: Date.now(), // 添加心跳时间戳
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

  // 用户加入塔吊观察者
  private async clientRelationRegisterHandler(socket: Socket, data: any) {
    try {
      const parseData = JSON.parse(data);
      const { userID, towercraneID, userName, placeID } = parseData;
      // 这里仅仅是说明用户加入了这个塔吊的观察者中，并没有其他业务逻辑
      await this.redisService.hset(
        `user${userID}`,
        'towercraneID',
        towercraneID,
        'username',
        userName,
        'status',
        USER_STATUS.ONLINE,
        'placeID',
        placeID
      );
    } catch (error) {
      this.logger.error('clientRelationRegisterHandler Error:', error);
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

      if (parseData?.userPlaceID) {
        await this.redisService.hdel(
          `user-position-${parseData?.userPlaceID}`,
          parseData.userID
        );
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
        await this.acquireLockWithRetry(lockKey, 5000); // 锁定50秒

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
        if (
          existedRelationByID !== null &&
          existedRelationByID !== '' &&
          existedRelationByID !== currentUserID
        ) {
          socket.emit(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, 'fail');
          return;
        }

        // 这里特殊逻辑，不进行权限指派，而是直接释放权限
        if (assignUserID === SPECIAL_STATUS.FREE) {
          await this.deleteAlgorithmUserRelation(towercraneID, currentUserID);
          socket.emit(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, 'success');
          await this.handleClientStatusUpdate(towercraneID, this.io);
          return;
        }

        const setResult = await this.setAlgorithmUserRelation(
          towercraneID,
          assignUserID,
          currentUserID
        );
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

      const { userID = null, algorithmID = null } = parseData;
      const lockKey = `lock:request:${algorithmID}`;

      try {
        await this.acquireLockWithRetry(lockKey, 5000); // 锁定50秒

        if (!userID || !algorithmID) {
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
            userID
          );
          if (setResult) {
            socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'success');
            await this.handleClientStatusUpdate(algorithmID, this.io);
          } else {
            socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'fail');
          }
          return;
        } else {
          // 已被占用，返回失败
          const currentOccupiedId = result;
          const expectToUseUserName = await this.redisService.hget(
            `user${userID}`,
            'username'
          );
          if (expectToUseUserName !== null && expectToUseUserName !== '') {
            const allKeys = await this.redisService.keys('user*');
            // 过滤掉 userctrl- 开头的键，只保留纯用户状态键
            const keys = allKeys.filter(
              key => !key.startsWith('userctrl-') && !key.startsWith('user-')
            );
            for (const key of keys) {
              try {
                const getUser = await this.redisService.hgetall(key);
                const userIdFromKey = key.replace('user', '');
                // 向这个工地所有在线的观察者发送消息,如果当前塔吊实控人存在，则发送实控人ID，否则发送空
                if (getUser['towercraneID'] === algorithmID.toString()) {
                  const stringMessage = JSON.stringify({
                    action: MESSAGE_TYPE.REQUEST_ALGORITHM,
                    algorithmID: algorithmID,
                    expectToUseUserName: expectToUseUserName,
                    expectToUseUserID: userID,
                    currentOccupiedId: currentOccupiedId,
                  });

                  // 向当前控制人发消息
                  if (userIdFromKey === currentOccupiedId) {
                    this.io
                      ?.to(getUser['socketID'])
                      .emit(SOCKET_EVENT.SERVER_STATUS_NOTIFY, stringMessage);
                  }

                  if (userIdFromKey === userID) {
                    socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'fail');
                  }
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

      if (socketData && socketData.type === 'algorithm') {
        await this.handleAlgorithmOfflineStatus(socketData.id, this.io);
        await this.algorithmService.updateAlgorithm(Number(socketData.id), {
          status: AlgorithmStatus.IDLE,
        });
        await this.redisService.del(socket.id);
        await this.redisService.hset(
          'algorithm' + socketData.id,
          'status',
          USER_STATUS.OFFLINE
        );
        this.logger.info('算法端断开:', socket.id);
      } else if (socketData && socketData.type === 'client') {
        const currentUserId = socketData.id;
        console.error(`socketData: ${JSON.stringify(socketData)}`);
        await this.handleUserOfflineStatus(socketData.id);
        await this.redisService.del(`user${socketData.id}`);
        await this.redisService.del(socket.id);
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

  private async handleUserOfflineStatus(userID: string) {
    if (!userID) {
      this.logger.error(
        'handleUserOfflineStatus Error:',
        'userID is undefined'
      );
      return;
    }
    // 如果没有传入algorithmID，尝试通过userID反向查找
    const algorithmID = await this.findAlgorithmByUserId(userID);

    // 清理用户占用的算法资源
    if (algorithmID && userID) {
      await this.deleteAlgorithmUserRelation(algorithmID, userID);
    }

    if (!algorithmID) {
      return;
    }
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
      const isHaveAccessToAlgorithm = await this.redisService.get(
        `userctrl-${userId}`
      );

      // 修复条件判断：如果用户有算法控制权限，则删除关系
      if (isHaveAccessToAlgorithm !== null && isHaveAccessToAlgorithm !== '') {
        const pipeline = this.redisService.pipeline();
        pipeline.del(`algorithm-${algorithmId}`);
        pipeline.del(`userctrl-${userId}`);

        // 等待删除操作完成
        const results = await pipeline.exec();

        // 验证删除是否成功
        if (results && results.every(result => result[0] === null)) {
          this.logger.info(
            `Successfully deleted algorithm-user relation: ${algorithmId} -> ${userId}`
          );
        } else {
          this.logger.error('Failed to delete some keys in pipeline:', results);
        }
      }

      // 删除操作完成后再更新客户端状态
      await this.handleClientStatusUpdate(algorithmId, this.io);
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

  // 更新客户端状态
  private async handleClientStatusUpdate(algorithmID: string, io: Server) {
    if (!algorithmID) {
      this.logger.error(
        'handleClientStatusUpdate Error:',
        'algorithmID is undefined'
      );
      return;
    }

    // 塔吊目前实控人是否存在
    const existedUserID = await this.redisService.get(
      `algorithm-${algorithmID}`
    );

    // 只匹配用户状态键，避免匹配到 userctrl- 等其他类型的键
    const allKeys = await this.redisService.keys('user*');
    // 过滤掉 userctrl- 开头的键，只保留纯用户状态键
    const keys = allKeys.filter(
      key => !key.startsWith('userctrl-') && !key.startsWith('user-')
    );
    let userName = '';
    for (const key of keys) {
      try {
        const getUser = await this.redisService.hgetall(key);
        // 向这个工地所有在线的观察者发送消息,如果当前塔吊实控人存在，则发送实控人ID，否则发送空
        if (getUser['towercraneID'] === algorithmID.toString()) {
          const userID = key.replace('user', '');
          if (
            existedUserID !== '' &&
            existedUserID !== null &&
            existedUserID === userID
          ) {
            userName = getUser['username'];
          }

          const stringMessage = JSON.stringify({
            action: MESSAGE_TYPE.ALGORITHM_STATUS,
            [algorithmID]:
              existedUserID !== '' && existedUserID !== null
                ? TOWER_CRANE_CONTROL_STATUS.OCCUPIED
                : TOWER_CRANE_CONTROL_STATUS.FREE,
            algorithmID: algorithmID,
            currentOccupiedId: existedUserID,
            userName: userName,
          });
          io.to(getUser['socketID']).emit(
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

      this.logger.info('serverRegisterHandler parserData', parserData);
      // id  name

      // 验证必要字段
      if (!parserData?.name) {
        this.logger.error('serverRegisterHandler Error: name is required');
        socket.emit('error', {
          type: 'INVALID_REGISTRATION_DATA',
          message: '注册数据缺少必要字段：name',
          requiredFields: ['name'],
        });
        return;
      }

      const findAlgorithmResult =
        await this.algorithmService.getAlgorithmByName(parserData?.name);

      if (findAlgorithmResult.id) {
        await this.handleClientStatusUpdate(
          findAlgorithmResult.id.toString(),
          this.io
        );
      }

      if (findAlgorithmResult.id) {
        await this.objectInsert(socket.id, {
          type: 'algorithm',
          id: findAlgorithmResult.id,
        });
        await this.objectInsert(
          `algorithm-register-${findAlgorithmResult.id}`,
          {
            status: 'online',
            socketID: socket.id,
          }
        );

        this.logger.info('服务端已注册:', findAlgorithmResult.id);
      } else {
        const algorithm = {
          name: parserData.name,
          map_name: parserData.map_name,
          status: parserData.status,
          description: parserData.description,
          algorithm_id: uuidv4(),
          extra_info_json: {},
          place_id: parserData.place_id || '1',
          algorithm_type: parserData.algorithm_type || '1',
        };
        const result = await this.algorithmService.createAlgorithm(algorithm);
        await this.objectInsert(socket.id, {
          type: 'algorithm',
          id: result.id,
        });
        await this.objectInsert(`algorithm-register-${result.algorithm_id}`, {
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
        'serverMsgHandler algorithmID is undefined - 算法服务端可能未正确注册，请先发送 server-register 事件进行注册'
      );

      // 向算法服务端发送错误响应，提示需要先注册
      socket.emit('error', {
        type: 'REGISTRATION_REQUIRED',
        message: '请先发送 server-register 事件进行注册，然后再发送消息',
        requiredAction: 'server-register',
      });
      return;
    }
    try {
      // 只匹配用户状态键，避免匹配到 userctrl- 等其他类型的键
      const allKeys = await this.redisService.keys('user*');
      // 过滤掉 userctrl- 开头的键，只保留纯用户状态键
      const keys = allKeys.filter(
        key => !key.startsWith('userctrl-') && !key.startsWith('user-')
      );

      // 这里是临时解决，但是要做消息类型细分，例如操作反馈相关的就不能发给全频道所有人
      for (const key of keys) {
        try {
          const getUser = await this.redisService.hgetall(key);
          // 向这个工地所有在线的观察者发送消息,如果当前塔吊实控人存在，则发送实控人ID，否则发送空
          if (getUser['towercraneID'] === algorithmID.toString()) {
            socket.to(getUser['socketID']).emit(SOCKET_EVENT.CLIENT_MSG, data);
            this.sendToClient(
              getUser['socketID'],
              SOCKET_EVENT.SERVER_MSG,
              data
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

    const findUserAlgorthmRelation = await this.findAlgorithmByUserId(userId);

    if (findUserAlgorthmRelation === null) {
      this.logger.info('findUserAlgorthmRelation is null');
      return;
    }
    const getAlgorithm = await this.algorithmService.getAlgorithmById(
      Number(findUserAlgorthmRelation)
    );

    if (
      getAlgorithm?.algorithm_id === undefined ||
      getAlgorithm?.id === undefined
    ) {
      this.logger.info('getAlgorithm?.algorithm_id is undefined');
      return;
    }

    const algorithmSocketID = await this.redisService.hget(
      `algorithm-register-${getAlgorithm.id}`,
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

  // 处理用户主动刷新状态请求
  private async handleRefreshStatus(socket: Socket, data: any) {
    try {
      const { userID } = socket.handshake.auth;
      if (!userID) {
        this.logger.error('handleRefreshStatus Error: userID is undefined');
        return;
      }

      const parseData = data ? JSON.parse(data) : {};

      const { algorithmID } = parseData;

      if (algorithmID) {
        // 返回指定算法状态
        await this.sendSpecificAlgorithmStatus(socket, algorithmID);
      } else {
        // 返回用户相关的所有算法状态
        await this.sendUserRelatedAlgorithmStatus(socket, userID);
      }
    } catch (error) {
      this.logger.error('handleRefreshStatus Error:', error);
    }
  }

  // 发送指定算法的当前状态
  private async sendSpecificAlgorithmStatus(
    socket: Socket,
    algorithmID: string
  ) {
    try {
      const existedUserID = await this.redisService.get(
        `algorithm-${algorithmID}`
      );
      const status =
        existedUserID && existedUserID !== '' && existedUserID !== null
          ? TOWER_CRANE_CONTROL_STATUS.OCCUPIED
          : TOWER_CRANE_CONTROL_STATUS.FREE;

      const userName = await this.redisService.hget(
        `user${existedUserID}`,
        'username'
      );
      const statusMessage = JSON.stringify({
        action: MESSAGE_TYPE.ALGORITHM_STATUS,
        [algorithmID]: status,
        algorithmID: algorithmID,
        currentOccupiedId: existedUserID,
        userName: userName,
        timestamp: Date.now(),
        type: 'refresh_response',
      });

      socket.emit(SOCKET_EVENT.SERVER_STATUS_NOTIFY, statusMessage);
      this.logger.info(
        `Sent algorithm status to user: ${algorithmID} -> ${status}`
      );
    } catch (error) {
      this.logger.error('sendSpecificAlgorithmStatus Error:', error);
    }
  }

  // 发送用户相关的所有算法状态
  private async sendUserRelatedAlgorithmStatus(socket: Socket, userID: string) {
    try {
      // 获取用户当前控制的算法
      const userControlledAlgorithm = await this.getAlgorithmByUserId(userID);

      if (userControlledAlgorithm) {
        await this.sendSpecificAlgorithmStatus(socket, userControlledAlgorithm);
      }

      // 也可以根据用户的towercraneID发送相关状态
      const userInfo = await this.redisService.hgetall(`user${userID}`);
      if (userInfo && userInfo.towercraneID) {
        await this.sendSpecificAlgorithmStatus(socket, userInfo.towercraneID);
      }
    } catch (error) {
      this.logger.error('sendUserRelatedAlgorithmStatus Error:', error);
    }
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
   * 启动30秒全局检查机制
   */
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private startGlobalCheck(): void {
    if (this.globalCheckTimer) {
      this.logger.warn('Global check timer already running');
      return;
    }

    this.globalCheckTimer = setInterval(async () => {
      if (this.isGlobalCheckRunning) {
        this.logger.info(
          'Previous global check still running, skipping this cycle'
        );
        return;
      }

      this.isGlobalCheckRunning = true;
      const startTime = Date.now();

      try {
        this.logger.info('Starting global check cycle...');
        await this.executeGlobalCheck();
        const duration = Date.now() - startTime;
        this.logger.info(`Global check completed in ${duration}ms`);
      } catch (error) {
        this.logger.error('Global check failed:', error);
      } finally {
        this.isGlobalCheckRunning = false;
      }
    }, 30000); // 30秒间隔

    this.logger.info('Global check timer started (30s interval)');
  }

  /**
   * 停止全局检查机制
   */
  private stopGlobalCheck(): void {
    if (this.globalCheckTimer) {
      clearInterval(this.globalCheckTimer);
      this.globalCheckTimer = null;
      this.logger.info('Global check timer stopped');
    }
  }

  /**
   * 执行全局检查
   */
  private async executeGlobalCheck(): Promise<void> {
    try {
      await this.checkUserHeartbeats();
      // 让出事件循环，避免阻塞
      await this.sleep(50);
    } catch (error) {
      this.logger.error('executeGlobalCheck error:', error);
      throw error;
    }
  }

  /**
   * 检查用户心跳状态
   */
  private async checkUserHeartbeats(): Promise<void> {
    try {
      // 检查用户状态心跳
      await this.checkUserStatusHeartbeats();

      // 检查位置信息心跳
      await this.checkUserPositionHeartbeats();
    } catch (error) {
      this.logger.error('checkUserHeartbeats error:', error);
      throw error;
    }
  }

  /**
   * 检查用户状态心跳（原有逻辑）
   */
  private async checkUserStatusHeartbeats(): Promise<void> {
    try {
      // 只匹配用户状态键，避免匹配到 userctrl- 等其他类型的键
      const allKeys = await this.redisService.keys('user*');
      // 过滤掉 userctrl- 开头的键，只保留纯用户状态键
      const keys = allKeys.filter(
        key => !key.startsWith('userctrl-') && !key.startsWith('user-')
      );

      for (const key of keys) {
        try {
          const getUser = await this.redisService.hgetall(key);
          const userId = key.replace('user', '');
          const lastHeartbeat = Number(getUser['lastHeartbeat']);

          if (!lastHeartbeat || lastHeartbeat === 0) {
            break;
          }
          const currentTime = Date.now();
          const timeDiff = currentTime - lastHeartbeat;

          if (timeDiff > 10000) {
            // 如果心跳时间超过10秒，认为用户已离线
            await this.redisService.del(key);
            const getTowerCrane = await this.redisService.get(
              `algorithm-${getUser['towercraneID']}`
            );

            if (getTowerCrane && getTowerCrane === userId) {
              await this.redisService.del(
                `algorithm-${getUser['towercraneID']}`
              );
              await this.redisService.del(`userctrl-${userId}`);
            }
          }
        } catch (error) {
          this.logger.warn(
            `Skipping key ${key} due to type mismatch:`,
            error.message
          );
          continue;
        }
      }
    } catch (error) {
      this.logger.error('checkUserStatusHeartbeats error:', error);
      throw error;
    }
  }

  /**
   * 检查位置信息心跳并清理离线用户
   */
  private async checkUserPositionHeartbeats(): Promise<void> {
    try {
      const positionKeys = await this.redisService.keys('user-position-*');

      for (const positionKey of positionKeys) {
        try {
          const allUsers = await this.redisService.hgetall(positionKey);
          const expiredUsers: string[] = [];

          for (const [userId, userDataStr] of Object.entries(allUsers)) {
            try {
              const userData = JSON.parse(userDataStr);
              const lastHeartbeat = Number(userData.lastHeartbeat);

              if (!lastHeartbeat || lastHeartbeat === 0) {
                expiredUsers.push(userId);
                continue;
              }

              const currentTime = Date.now();
              const timeDiff = currentTime - lastHeartbeat;

              // 如果位置心跳超过20秒，认为用户已离线（位置信息可以容忍更长时间）
              if (timeDiff > 20000) {
                expiredUsers.push(userId);
              }
            } catch (parseError) {
              this.logger.warn(
                `Failed to parse user data for ${userId}:`,
                parseError
              );
              expiredUsers.push(userId); // 解析失败的也移除
            }
          }

          // 批量删除过期用户
          if (expiredUsers.length > 0) {
            await this.redisService.hdel(positionKey, ...expiredUsers);
            this.logger.info(
              `Removed ${expiredUsers.length} offline users from ${positionKey}`
            );
          }
        } catch (error) {
          this.logger.warn(
            `Error processing position key ${positionKey}:`,
            error
          );
        }
      }
    } catch (error) {
      this.logger.error('checkUserPositionHeartbeats error:', error);
      throw error;
    }
  }

  /**
   * 工具方法：睡眠指定毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
      // 停止全局检查
      this.stopGlobalCheck();

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

  /**
   * 手动更新用户在位置hash中的心跳时间
   * @param placeId 项目/地点ID
   * @param userId 用户ID
   */
  public async updateUserPositionHeartbeat(
    placeId: string,
    userId: string
  ): Promise<void> {
    try {
      const positionKey = `user-position-${placeId}`;
      const userDataStr = await this.redisService.hget(positionKey, userId);

      if (userDataStr) {
        const userData = JSON.parse(userDataStr);
        userData.lastHeartbeat = Date.now();

        await this.redisService.hset(
          positionKey,
          userId,
          JSON.stringify(userData)
        );
      }
    } catch (error) {
      this.logger.error('updateUserPositionHeartbeat error:', error);
    }
  }
}
