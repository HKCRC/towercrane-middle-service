import { Configuration, App, Inject } from '@midwayjs/decorator';
import * as koa from '@midwayjs/koa';
import * as validate from '@midwayjs/validate';
import * as info from '@midwayjs/info';
import { join } from 'path';
import * as crossDomain from '@midwayjs/cross-domain';
import * as jwt from '@midwayjs/jwt';
import * as passport from '@midwayjs/passport';
import * as busboy from '@midwayjs/busboy';
import * as redis from '@midwayjs/redis';
import { ReportMiddleware } from './middleware/report.middleware';
import { DefaultFilter } from './filter/default.filter';
import { ResponseMiddleware } from '@/middleware/response.middleware';
import { SocketIOService } from '@/service/websocketl.service';

@Configuration({
  imports: [
    koa,
    validate,
    {
      component: info,
      enabledEnvironment: ['local'],
    },
    jwt,
    passport,
    busboy,
    crossDomain,
    redis,
  ],
  importConfigs: [join(__dirname, './config')],
})
export class MainConfiguration {
  @App('koa')
  app: koa.Application;

  @Inject()
  socketIOService: SocketIOService;

  async onReady() {
    // add middleware
    this.app.useMiddleware([ReportMiddleware]);
    this.app.useFilter(DefaultFilter);
    this.app.useMiddleware(ResponseMiddleware);
    await this.socketIOService.initialize(this.app.getConfig('webSocket').port);
    // add filter
    // this.app.useFilter([NotFoundFilter, DefaultErrorFilter]);
  }

  async onStop() {
    await this.socketIOService.close();
  }
}
