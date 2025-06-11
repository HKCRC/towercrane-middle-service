import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { ServerOptions } from 'socket.io';
import { ILogger, Inject, Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { UserAlgorithmRelationService } from './userAlgorithmRelation.service';
import { RedisService } from '@midwayjs/redis';
import { BINARY_FLAG, SOCKET_EVENT } from '@/constant';
import { parseBinaryData } from '@/utils/message';
import { AlgorithmService } from './algorithm.service';
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
  private userAlgorithmRelationService: UserAlgorithmRelationService;

  @Inject()
  private algorithmService: AlgorithmService;

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

    return new Promise<void>(resolve => {
      this.server.listen(port, () => {
        console.log(`Socket.io server started on port ${port}`);
        resolve();
      });
    });
  }

  private setupConnectionHandlers() {
    this.io.on('connection', async (socket: Socket) => {
      const userID = socket.handshake.auth.userID;
      console.log(`Client connected: ${socket.id}`, userID);

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
    });
  }

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
      await this.userAlgorithmRelationService.deleteRelationByUserId(
        parseData.userID
      );

      socket.disconnect();
    } catch (e) {
      this.logger.error('clientExitHandler Error:', e);
    }
  }

  private async clientReassignAlgorithmHandler(socket: Socket, data: any) {
    try {
      const parseData = JSON.parse(data);
      console.log('Reassigning algorithm:', parseData);

      const lockKey = `lock:reassign:${parseData.towercraneID}`;

      try {
        await this.acquireLockWithRetry(lockKey, 50000); // 锁定50秒

        if (!parseData.userID || !parseData.towercraneID) {
          this.logger.error(
            'clientReassignAlgorithmHandler Error:',
            'userID or towercraneID is undefined'
          );
          return;
        }
        // 检查当前用户是否已有分配关系
        const existedRelationByID =
          await this.userAlgorithmRelationService.getRelationByUserId(
            parseData.userID
          );
        if (existedRelationByID.length > 0) {
          socket.emit(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, 'fail');
          return;
        }

        // 因为权限指派的前提必须是当前用户占有该塔吊的控制权限，所以无需检查当前塔机是否已有分配关系
        const result = await this.userAlgorithmRelationService.updateRelation(
          parseData.userID,
          parseData.towercraneID
        );
        if (result.id) {
          socket.emit(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, 'success');
          await this.handleClientStatusUpdate(parseData.towercraneID, this.io);
        } else {
          socket.emit(SOCKET_EVENT.CLIENT_REASSIGN_ALGORITHM, 'fail');
        }
      } catch (error) {
        this.logger.error('clientReassignAlgorithmHandler Error:', error);
      } finally {
        await this.releaseLock(lockKey);
      }
    } catch (e) {
      this.logger.error('clientReassignAlgorithmHandler Error:', e);
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

        // 检查当前算法是否已有分配关系
        const result =
          await this.userAlgorithmRelationService.getRelationByAlgorithmId(
            algorithmID
          );
        if (result.length === 0) {
          const result = await this.userAlgorithmRelationService.createRelation(
            parseData.userID,
            algorithmID
          );
          if (result.id) {
            socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'success');
            await this.handleClientStatusUpdate(data.algorithmID, this.io);
          } else {
            socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'fail');
          }
          return;
        }

        // 若算法已被分配，检查当前分配用户的状态
        const userStatus = await this.redisService.hget(
          'user' + result[0].user_id.toString(),
          'status'
        );

        if (userStatus === 'offline') {
          await this.userAlgorithmRelationService.updateRelation(
            parseData.userID,
            parseData.algorithmID
          );
          socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'success');
          await this.handleClientStatusUpdate(parseData.algorithmID, this.io);
        } else {
          socket.emit(SOCKET_EVENT.CLIENT_REQUEST_ALGORITHM, 'fail');
        }
      } catch (error) {
        this.logger.error('clientRequestAlgorithmHandler Error:', error);
      } finally {
        await this.releaseLock(lockKey);
      }
    } catch (e) {
      this.logger.error('clientRequestAlgorithmHandler Error:', e);
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

  private async disconnectHandler(socket: Socket) {
    try {
      const socketData = await this.redisService.hgetall(socket.id);
      this.logger.info('socketData:', socketData);
      if (socketData && socketData.type === 'algorithm') {
        await this.handleAlgorithmOfflineStatus(socketData.id, this.io);
        await this.algorithmService.updateAlgorithm(socketData.id, {
          status: AlgorithmStatus.IDLE,
        });
        await this.userAlgorithmRelationService.deleteRelationByAlgorithmId(
          socketData.id
        );
        await this.redisService.del(socket.id);
        await this.redisService.hset(
          'algorithm' + socketData.id,
          'status',
          'offline'
        );
        this.logger.info('算法端断开:', socket.id);
      } else if (socketData && socketData.type === 'client') {
        await this.handleUserOfflineStatus(socketData.id, this.io);
        await this.redisService.del(socket.id);
        await this.redisService.hset(
          'user' + socketData.id,
          'status',
          'offline'
        );
        await this.userAlgorithmRelationService.deleteRelationByUserId(
          socketData.id
        );

        this.logger.info('用户断开:', socket.id);
      }
    } catch (error) {
      this.logger.error('disconnectHandler Error:', error);
    }
  }

  private async handleUserOfflineStatus(userID: string, io: Server) {
    if (!userID) {
      this.logger.error(
        'handleUserOfflineStatus Error:',
        'userID is undefined'
      );
      return;
    }
    const existedRelationID =
      await this.userAlgorithmRelationService.getRelationByUserId(userID);
    if (existedRelationID.length === 0) {
      return;
    }
    const stringMessage = JSON.stringify({
      [existedRelationID[0].algorithm_id]: 'free',
    });
    io.emit(SOCKET_EVENT.CLIENT_STATUS_NOTIFY, stringMessage);
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
    const existedUserID =
      await this.userAlgorithmRelationService.getRelationByAlgorithmId(
        algorithmID
      );
    const keys = await this.redisService.keys('user*');

    for (const key of keys) {
      const value = await this.redisService.hgetall(key);
      if (value['status'] === 'online' && existedUserID.length === 0) {
        const stringMessage = JSON.stringify({
          [algorithmID]: 'free',
        });
        io.to(value['socketID']).emit(
          SOCKET_EVENT.SERVER_STATUS_NOTIFY,
          stringMessage
        );
      } else if (
        value['status'] === 'online' &&
        existedUserID.length > 0 &&
        key.toString() === `user${existedUserID[0].user_id}`
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
    }
  }

  private async serverRegisterHandler(socket: Socket, data: any) {
    try {
      const parserData = JSON.parse(data);

      const existedID = await this.algorithmService.getAlgorithmByName(
        parserData?.name
      );
      await this.handleClientStatusUpdate(existedID, this.io);
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

  private async serverMsgHandler(socket: Socket, data: any) {
    this.logger.info('收到向服务端发送的消息:', data);
    const algorithmID = await this.redisService.hget(socket.id, 'id');
    console.log('socket.id', socket.id);
    if (!algorithmID) {
      this.logger.error(
        'serverMsgHandler Error:',
        'serverMsgHandler algorithmID is undefined'
      );
      return;
    }
    try {
      const result =
        await this.userAlgorithmRelationService.getRelationByAlgorithmId(
          algorithmID
        );
      if (result.length === 0) {
        const message = parseBinaryData(data);
        this.logger.info('message after parseBinaryData:', message);
        return;
      }
      const userSocketID = await this.redisService.hget(
        'user' + result[0].user_id.toString(),
        'socketID'
      );
      // this.logger.info('result', result);
      // 向当前客户端发送响应, 此种私有信息的发送是根据socket.id进行的, 因为Socket.io会自动创建一个名为连接的
      // socket.id的房间, 所以可以直接使用socket.id来发送私有消息. 而在Redis中则需要保存此次连接过程中的socket.id
      // 和userID的对应关系, 以便后续的消息发送. 服务端的也类似
      console.error('userSocketID', userSocketID);
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

    const findUserAlgorthmRelation =
      await this.userAlgorithmRelationService.getRelationByUserId(userId);
    if (!findUserAlgorthmRelation.length) {
      this.logger.info('对应关系不存在');
      return;
    }
    const algorithm_id = findUserAlgorthmRelation[0].algorithm_id;
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

      if (result === 'OK') {
        console.log(`Lock acquired: ${lockKey} (attempt ${attempt})`);
        return lockKey;
      }

      console.warn(`Failed to acquire lock: ${lockKey} (attempt ${attempt})`);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay)); // 等待一段时间后重试
      }
    }
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
   * 关闭 Socket.io 服务器
   */
  public close(): Promise<void> {
    return new Promise(resolve => {
      if (!this.io) {
        console.error('Socket.io server not initialized');
        return resolve();
      }

      this.io.close(() => {
        console.log('Socket.io server closed');
        this.io = null;
        this.server = null;
        resolve();
      });
    });
  }
}
