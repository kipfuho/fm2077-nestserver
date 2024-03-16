import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { 
  Forum, 
  Login, 
  Message, 
  Thread, 
  User 
} from './db.entity';
import { DatabaseService } from './db.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'kip1',
      database: 'fm2077',
      entities: [Login, User, Forum, Message, Thread],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Login, User, Forum, Message, Thread])
  ],
  providers: [DatabaseService],
  exports: [DatabaseService]
})
export class DatabaseModule {
}
