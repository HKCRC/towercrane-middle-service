import { LocationService } from '@/service/location.service';
import { Body, Context, Controller, Inject, Post } from '@midwayjs/core';

@Controller('/location')
export class LocationController {
  @Inject()
  ctx: Context;

  @Inject()
  locationService: LocationService;

  @Post('/get-all-user-location')
  async getLocation(@Body('place_id') place_id: string) {
    try {
      const location = await this.locationService.getLocation(place_id);
      return {
        success: true,
        message: 'OK',
        data: location,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed',
        data: error,
      };
    }
  }
}
