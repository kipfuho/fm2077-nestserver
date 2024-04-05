import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ModeratorModule } from './moderator/moderator.module';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/db.module';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisClientOptions } from 'redis';
import { redisStore } from 'cache-manager-redis-yet';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    AuthModule, 
    UserModule, 
    ModeratorModule,
    DatabaseModule,
    CacheModule.registerAsync<RedisClientOptions>({
			useFactory: async () => ({
				store: await redisStore({
					socket: {
						host: 'localhost',
						port: 6379
					},
					ttl: 60*60*1000 // miliseconds
				})
			})
    }),
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule { }
