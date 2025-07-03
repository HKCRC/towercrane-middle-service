import { Inject, Provide, ILogger } from '@midwayjs/core';
import { RedisService } from '@midwayjs/redis';

@Provide()
export class LocationService {
  @Inject()
  redisService: RedisService;

  @Inject()
  logger: ILogger;

  async getLocation(place_id: string) {
    try {
      const location = await this.redisService.hgetall(
        `user-position-${place_id}`
      );
      return location;
    } catch (error) {
      this.logger.error('getLocation Error:', error);
      return null;
    }
  }
}
