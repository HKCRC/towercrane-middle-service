import { MidwayConfig } from '@midwayjs/core';
import 'dotenv/config';
export default {
  // use for cookie sign key, should change to your own and keep security
  keys: '1745914007841_9642',
  koa: {
    port: 7001,
  },
  jwt: {
    secret: 'towercrane_service',
    expiresIn: '2d',
  },
  passport: {
    session: false,
  },
  midwayLogger: {
    clients: {},
  },
  cors: {
    origin: '*', // for production, should be set a specific domain
  },
  redis: {
    client: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    },
  },
  webSocket: {
    port: 30002,
  },
} as MidwayConfig;
