import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModuleV1 } from './user/v1/user.module';
import { ModeratorModule } from './moderator/moderator.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from './database/db.module';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisClientOptions } from 'redis';
import { redisStore } from 'cache-manager-redis-yet';
import { MongodbModule } from './mongodb/mongodb.module';
import { UserModuleV2 } from './user/v2/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    AuthModule, 
    UserModuleV2,
    ModeratorModule,
    MongodbModule,
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
  providers: [AppService]
})
export class AppModule { }
