import { Module } from '@nestjs/common';
import { UserControllerV1 } from './user.controller';
import { DatabaseModule } from 'src/database/db.module';
import { AuthModule } from 'src/auth/auth.module';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisClientOptions } from 'redis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';

@Module({
  imports: [
    DatabaseModule,
		AuthModule,
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
  controllers: [UserControllerV1],
})
export class UserModuleV1 {}
