import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongodbService } from './mongodb.service';
import { MongodbController } from './mongodb.controller';
import { Category, CategorySchema } from './schema/category.schema';
import { Forum, ForumSchema } from './schema/forum.schema';
import { Thread, ThreadSchema } from './schema/thread.schema';
import { Message, MessageSchema } from './schema/message.schema';
import { Tag, TagSchema } from './schema/tag.schema';
import { Reaction, ReactionSchema } from './schema/reaction.schema';
import { User, UserSchema } from './schema/user.schema';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisClientOptions } from 'redis';
import { redisStore } from 'cache-manager-redis-yet';
import { MailModule } from 'src/mail/mail.module';
import { Alert, AlertSchema } from './schema/alert.schema';
import { Bookmark, BookmarkSchema } from './schema/bookmark.schema';
import { Rating, RatingSchema } from './schema/rating.schema';
import { ProfilePosting, ProfilePostingSchema } from './schema/profileposting.schema';
import { Report, ReportSchema } from './schema/report.schema';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get("DATABASE_MONGODB_URI"),
      }),
      inject: [ConfigService]
    }),
    MongooseModule.forFeature([
      {name: User.name, schema: UserSchema},
      {name: Category.name, schema: CategorySchema},
      {name: Forum.name, schema: ForumSchema},
      {name: Thread.name, schema: ThreadSchema},
      {name: Message.name, schema: MessageSchema},
      {name: Tag.name, schema: TagSchema},
      {name: Reaction.name, schema: ReactionSchema},
      {name: Alert.name, schema: AlertSchema},
      {name: Bookmark.name, schema: BookmarkSchema},
      {name: Rating.name, schema: RatingSchema},
      {name: ProfilePosting.name, schema: ProfilePostingSchema},
      {name: Report.name, schema: ReportSchema},
    ]),
    CacheModule.registerAsync<RedisClientOptions>({
      imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				store: await redisStore({
					socket: {
						host: configService.get("REDIS_CLOUD_HOST"),
						port: configService.get("REDIS_CLOUD_PORT")
					},
          password: configService.get("REDIS_CLOUD_PASSWORD"),
					ttl: 60*1000 // 1 minute
				})
			}),
      inject: [ConfigService],
    }),
    MailModule
  ],
  providers: [MongodbService],
  exports: [MongodbService],
  controllers: [MongodbController]
})
export class MongodbModule {}
