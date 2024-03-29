import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseService } from './db.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Login } from './login.entity';
import { User } from './user.entity';
import { Forum } from './forum.entity';
import { Message } from './message.entity';
import { Thread } from './thread.entity';
import { DataSource } from 'typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: configService.get('DATABASE_USER'),
        password: configService.get('DATABASE_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        entities: [
          Login, 
          User, 
          Forum, 
          Message, 
          Thread
        ],
        synchronize: true,
      }),
      inject: [ConfigService],
      dataSourceFactory: async(options) => {
        const dataSource = await new DataSource(options).initialize();
        return dataSource;
      }
    }),
    TypeOrmModule.forFeature([
      Login, 
      User, 
      Forum, 
      Message, 
      Thread
    ]),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService]
})
export class DatabaseModule {
}
