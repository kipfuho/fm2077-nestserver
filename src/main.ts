import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as session from 'express-session';
import * as passport from "passport"
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as cookieParser from 'cookie-parser';
import * as MySQLStore from 'express-mysql-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

async function bootstrap() {
  const httpsOptions = {
    key: fs.readFileSync('./localhost-key.pem'),
    cert: fs.readFileSync('./localhost.pem'),
  };
  const app = await NestFactory.create(AppModule, {
    httpsOptions
  });
  const configService = app.get(ConfigService);

  /* local mysql session store
  const mysqlSessionStore = new (MySQLStore(session))({
    host: 'localhost',
    port: 3306,
    user: configService.get('DATABASE_USER'),
    password: configService.get('DATABASE_PASSWORD'),
    database: configService.get('SESSION_DATABASE_NAME'),
    clearExpired: true,
    checkExpirationInterval: 86400000, // 1 day
    expiration: 365*86400000, // 365 days
  });
  */

  const redisClient = createClient({
    socket: {
      host: configService.get("REDIS_CLOUD_HOST"),
      port: configService.get("REDIS_CLOUD_PORT")
    },
    password: configService.get("REDIS_CLOUD_PASSWORD"),
  });
  redisClient.connect().catch((console.error));
  const redisStore = new RedisStore({
    client: redisClient,
    ttl: 3600000 // 1 hour,
  });

  app.enableCors({
    credentials: true, 
    origin: "https://localhost:3000",
  });
  app.useGlobalPipes(new ValidationPipe());
  app.use(session({
    store: redisStore, // use redis as session store
    //store: mysqlSessionStore, // use mysql as session store
    secret: configService.get("SESSION_SECRET"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: "none",
      secure: true,
      httpOnly: true
    }
  }));
  app.use(passport.initialize())
  app.use(passport.session())
  app.use(cookieParser());
  
  await app.listen(3001);
}
bootstrap();
