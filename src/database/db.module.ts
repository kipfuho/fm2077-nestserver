import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseService } from './db.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Login } from './entity/login.entity';
import { User } from './entity/user.entity';
import { Forum } from './entity/forum.entity';
import { Message } from './entity/message.entity';
import { Thread } from './entity/thread.entity';
import { DataSource } from 'typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisClientOptions } from 'redis';
import { redisStore } from 'cache-manager-redis-yet';
import { Category } from './entity/category.entity';
import { Reaction } from './entity/reaction.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: configService.get('DATABASE_MYSQL_LOCAL_USER'),
        password: configService.get('DATABASE_MYSQL_LOCAL_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        entities: [
          Login, 
          User, 
          Category,
          Forum, 
          Message, 
          Thread,
          Reaction
        ],
        synchronize: true,
      }),
      dataSourceFactory: async(options) => {
        const dataSource = await new DataSource(options).initialize();
        return dataSource;
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      Login, 
      User, 
      Category,
      Forum, 
      Message, 
      Thread,
      Reaction
    ]),
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
  providers: [DatabaseService],
  exports: [DatabaseService]
})
export class DatabaseModule {
}
