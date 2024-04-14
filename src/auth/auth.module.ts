import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DatabaseModule } from 'src/database/db.module';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './local.strategy';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionSerializer } from './session.serializer';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisClientOptions } from 'redis';
import { redisStore } from 'cache-manager-redis-yet';
import { MongodbModule } from 'src/mongodb/mongodb.module';

@Module({
  imports: [
    MongodbModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        global: true,
        secret: configService.get("JWT_SECRET"),
        signOptions: { expiresIn: '10s' }, // 30m duration
      }),
      inject: [ConfigService]
    }),
    PassportModule.register({
      session: true,
    }),
    CacheModule.registerAsync<RedisClientOptions>({
      imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				store: await redisStore({
					socket: {
						host: configService.get("REDIS_HOST"),
						port: configService.get("REDIS_PORT")
					},
          password: configService.get("REDIS_PASSWORD"),
					ttl: 60*1000 // 1 minute
				})
			}),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService, 
    LocalStrategy,
    JwtStrategy,
    SessionSerializer,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    }
  ],
  exports: [AuthService, JwtModule]
})

export class AuthModule {}