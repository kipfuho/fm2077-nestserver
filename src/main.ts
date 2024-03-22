import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as session from 'express-session';
import * as passport from "passport"
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

async function bootstrap() {
  const httpsOptions = {
    key: fs.readFileSync('./localhost-key.pem'),
    cert: fs.readFileSync('./localhost.pem'),
  };
  const app = await NestFactory.create(AppModule, {
    httpsOptions
  });
  const configService = app.get(ConfigService);
  app.enableCors({
    credentials: true, 
    origin: true,
    allowedHeaders: ['Origin, X-Requested-With, Content-Type, Accept']
  });
  app.useGlobalPipes(new ValidationPipe());
  app.use(
    session({
      secret: "123312",
      resave: false,
      saveUninitialized: false,
      // we can add cookie: { secure: true } to make it more secure
      // but https only
      cookie: {
        sameSite: "none",
        secure: true,
      }
    }),
  );
  app.use(passport.initialize())
  app.use(passport.session())

  await app.listen(3001);
}
bootstrap();
