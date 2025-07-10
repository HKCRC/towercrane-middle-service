import { ILogger, Inject, Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { RedisService } from '@midwayjs/redis';
import { Server } from 'socket.io';
import { SOCKET_EVENT } from '@/constant';

export interface ExpirationCallback {
  (expiredKey: string, keyType: string, extractedId: string): Promise<void>;
}

export interface ExpirationConfig {
  keyPattern: string;
  keyType: string;
  callback: ExpirationCallback;
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class RedisExpirationService {
  private redisSubscriber: any = null;
  private socketIO: Server | null = null;
  private expirationConfigs: ExpirationConfig[] = [];
  private isInitialized = false;

  @Inject()
  logger: ILogger;

  @Inject()
  redisService: RedisService;

  /**
   * 初始化Redis过期事件监听器
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Redis expiration service already initialized');
      return;
    }

    try {
      // 创建一个新的Redis连接用于订阅
      this.redisSubscriber = this.redisService.duplicate();

      // 启用keyspace notifications (如果Redis服务器未启用)
      await this.redisService.config('SET', 'notify-keyspace-events', 'Ex');

      // 订阅key过期事件
      await this.redisSubscriber.psubscribe('__keyevent@0__:expired');

      this.redisSubscriber.on(
        'pmessage',
        async (pattern: string, channel: string, expiredKey: string) => {
          await this.handleKeyExpiration(expiredKey);
        }
      );

      this.isInitialized = true;
      this.logger.info('Redis expiration service initialized successfully');
    } catch (error) {
      this.logger.error(
        'Failed to initialize Redis expiration service:',
        error
      );
      throw error;
    }
  }

  /**
   * 设置Socket.IO实例用于推送消息
   */
  public setSocketIO(socketIO: Server): void {
    this.socketIO = socketIO;
  }

  /**
   * 注册key过期监听配置
   */
  public registerExpirationHandler(config: ExpirationConfig): void {
    this.expirationConfigs.push(config);
    this.logger.info(
      `Registered expiration handler for pattern: ${config.keyPattern}`
    );
  }

  /**
   * 处理key过期事件
   */
  private async handleKeyExpiration(expiredKey: string): Promise<void> {
    try {
      this.logger.info(`Processing expired key: ${expiredKey}`);

      // 遍历所有注册的配置，找到匹配的处理器
      for (const config of this.expirationConfigs) {
        if (expiredKey.startsWith(config.keyPattern)) {
          const extractedId = this.extractIdFromKey(
            expiredKey,
            config.keyPattern
          );
          if (extractedId) {
            await config.callback(expiredKey, config.keyType, extractedId);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error handling key expiration:', error);
    }
  }

  /**
   * 从key中提取ID
   */
  private extractIdFromKey(key: string, pattern: string): string {
    return key.replace(pattern, '');
  }

  /**
   * 推送算法控制权过期通知
   */
  public async notifyAlgorithmControlExpired(
    algorithmId: string
  ): Promise<void> {
    if (!this.socketIO) {
      this.logger.warn(
        'Socket.IO not set, cannot send algorithm expiration notification'
      );
      return;
    }

    try {
      const statusMessage = JSON.stringify({
        type: 'algorithm_control_expired',
        algorithmId,
        status: 'free',
        expiredAt: new Date().toISOString(),
        reason: 'control_expired',
      });

      // 广播给所有客户端
      this.socketIO.emit(SOCKET_EVENT.SERVER_STATUS_NOTIFY, statusMessage);

      this.logger.info(
        `Notified all clients that algorithm ${algorithmId} control expired`
      );
    } catch (error) {
      this.logger.error(
        `Error notifying algorithm control expiration for ${algorithmId}:`,
        error
      );
    }
  }

  /**
   * 获取过期统计信息
   */
  public getExpirationStats(): {
    isInitialized: boolean;
    configCount: number;
    configs: string[];
  } {
    return {
      isInitialized: this.isInitialized,
      configCount: this.expirationConfigs.length,
      configs: this.expirationConfigs.map(
        config => `${config.keyPattern} (${config.keyType})`
      ),
    };
  }

  /**
   * 关闭服务
   */
  public async close(): Promise<void> {
    try {
      if (this.redisSubscriber) {
        await this.redisSubscriber.punsubscribe();
        await this.redisSubscriber.quit();
        this.redisSubscriber = null;
      }

      this.isInitialized = false;
      this.socketIO = null;
      this.expirationConfigs = [];

      this.logger.info('Redis expiration service closed');
    } catch (error) {
      this.logger.error('Error closing Redis expiration service:', error);
    }
  }
}
