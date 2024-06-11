import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schema/user.schema';
import { Category, CategoryDocument } from './schema/category.schema';
import { Forum, ForumDocument } from './schema/forum.schema';
import { Thread, ThreadDocument } from './schema/thread.schema';
import { Message, MessageDocument } from './schema/message.schema';
import { Reaction, ReactionDocument } from './schema/reaction.schema';
import { Tag, TagDocument } from './schema/tag.schema';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { RedisCache } from 'cache-manager-redis-yet';
import { enc, SHA256 } from 'crypto-js';
import { MailService } from 'src/mail/mail.service';
import { Alert, AlertDocument } from './schema/alert.schema';
import { Bookmark, BookmarkDocument } from './schema/bookmark.schema';
import { Rating, RatingDocument } from './schema/rating.schema';
import {
  ProfilePosting,
  ProfilePostingDocument,
} from './schema/profileposting.schema';
import { Report, ReportDocument } from './schema/report.schema';
import { DeletedItem, DeletedItemDocument } from './schema/deleted.schema';
import { FilterOptions } from 'src/interface/filter.type';
import { Prefix, PrefixDocument } from './schema/prefix.schema';

@Injectable()
export class MongodbService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Forum.name) private readonly forumModel: Model<Forum>,
    @InjectModel(Thread.name) private readonly threadModel: Model<Thread>,
    @InjectModel(Message.name) private readonly messageModel: Model<Message>,
    @InjectModel(Reaction.name) private readonly reactionModel: Model<Reaction>,
    @InjectModel(Tag.name) private readonly tagModel: Model<Tag>,
    @InjectModel(Alert.name) private readonly alertModel: Model<Alert>,
    @InjectModel(Bookmark.name) private readonly bookmarkModel: Model<Bookmark>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<Rating>,
    @InjectModel(ProfilePosting.name)
    private readonly profilepostingModel: Model<ProfilePosting>,
    @InjectModel(Report.name) private readonly reportModel: Model<Report>,
    @InjectModel(Prefix.name) private readonly prefixModel: Model<Prefix>,
    @InjectModel(DeletedItem.name)
    private readonly deletedItemModel: Model<DeletedItem>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: RedisCache,
    private readonly mailService: MailService,
  ) {}

  private readonly logger = new Logger(MongodbService.name);
  private readonly CACHE_TIME = 60 * 1000; // 10 minutes
  private readonly MESSAGES_PER_PAGE = 20;

  /*
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  /**
   * Get metadata of the forum
   * @returns threads count, messages count, members count, lastest member
   */
  async getMetadata(): Promise<[number, number, number, string]> {
    try {
      const [threadCount, messageCount, memberCount, lastMember] =
        await Promise.all([
          this.threadModel.countDocuments().exec(),
          this.messageModel.countDocuments().exec(),
          this.userModel.countDocuments().exec(),
          this.userModel.findOne().sort({ create_time: -1 }).exec(),
        ]);
      return [threadCount, messageCount, memberCount, lastMember.username];
    } catch (err) {
      this.logger.error('getMetadata:::', err);
      return null;
    }
  }

  /* User model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  /**
   * Create a new user
   * @param username 
   * @param email 
   * @param password 
   * @returns User
   */
  async createUser(
    username: string,
    email: string,
    password: string,
  ): Promise<UserDocument> {
    try {
      const [check1, check2] = await Promise.all([
        this.findUserByName(username),
        this.findUserByName(email),
      ]);
      if (check1 || check2) {
        this.logger.log('createUser:::Username or email exist');
        return null;
      }
      const time = new Date();
      const user = await this.userModel.create({
        username,
        email,
        password,
        create_time: time,
        avatar: null,
        messages: 0,
        likes: 0,
        class: 0,
        setting: {
          date_of_birth: null,
          location: null,
          website: null,
          about: null,
          twofa: false,
        },
      });
      this.logger.log(
        `createUser:::Created a new user, id:${user._id.toHexString()}`,
      );
      // create alert for email verification
      await this.createAlert(
        user._id.toHexString(),
        'Verify your email for full permission',
      );
      return user;
    } catch (err) {
      this.logger.error('createUser:::', err);
      return null;
    }
  }

  /**
   * Find user by id and cache to redis
   * @param id 
   * @returns User
   */
  async findUserById(
    id: string
  ): Promise<{
    cache: boolean;
    user: UserDocument;
  }> {
    try {
      const cache: UserDocument = await this.cacheManager.get(`user:${id}`);
      if (cache) {
        this.logger.log(`findUserById:::CACHE:::Found user:${id}`);
        return { cache: true, user: cache };
      }

      const user = await this.userModel.findById(id).exec();
      if (user) {
        await this.cacheManager.set(
          `user:${user._id.toHexString()}`,
          user.toObject(),
          this.CACHE_TIME,
        );
      }
      this.logger.log(`findUserById:::DB:::Found user:${user}`);
      return { cache: false, user: user };
    } catch (err) {
      this.logger.error('findUserById:::', err);
      return null;
    }
  }

  /**
   * Find user by username or by email
   * @param identity : either username or email
   * @returns User
   */
  async findUserByName(
    identity: string
  ): Promise<UserDocument> {
    try {
      const user = await this.userModel
        .findOne({
          $or: [{ username: identity }, { email: identity }],
        })
        .exec();
      this.logger.log(`findUserByName:::DB:::Found user:${user}`);
      return user;
    } catch (err) {
      this.logger.error('findUserByName:::', err);
      return null;
    }
  }

  async findAllUser(): Promise<UserDocument[]> {
    return await this.userModel.find().exec();
  }

  /**
   * Filter users by username
   * @param usernamePart 
   * @returns User[]
   */
  async filterUserByUsername(
    usernamePart: string
  ): Promise<UserDocument[]> {
    try {
      const users = this.userModel
        .find({ username: { $regex: `^${usernamePart}`, $options: 'i' } })
        .limit(10);
      this.logger.log(`filterUserByUsername:::Found users:${users}`);
      return users;
    } catch (err) {
      this.logger.error(`filterUserByUsername:::${err}`);
      return null;
    }
  }

  /**
   * Update an user username
   * @param userId : user to update
   * @param password : used for verification
   * @param username : new username
   * @returns User
   */
  async editUsernameUser(
    userId: string,
    password: string,
    username: string,
  ): Promise<UserDocument> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('editUsernameUser:::User not found');
        return null;
      }
      if (userData.user.password !== password) {
        this.logger.log('editUsernameUser:::Password not match');
        return null;
      }

      const user = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $set: { username: username } },
          { new: true },
        )
        .exec();
      if (userData.cache) {
        this.cacheManager.set(`user:${userId}`, user, this.CACHE_TIME);
      }
      this.logger.log(`editUsernameUser:::Updated username of user:${userId}`);
      return user;
    } catch (err) {
      this.logger.error(`editUsernameUser:::${err}`);
      return null;
    }
  }

  /**
   * Update an user email
   * @param userId : user to update
   * @param password : used for verification
   * @param email : new email
   * @returns User
   */
  async editEmailUser(
    userId: string,
    password: string,
    email: string,
  ): Promise<UserDocument> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('editEmailUser:::User not found');
        return null;
      }
      if (userData.user.password !== password) {
        this.logger.log('editEmailUser:::Password not match');
        return null;
      }

      const user = await this.userModel
        .findByIdAndUpdate(userId, { $set: { email: email } }, { new: true })
        .exec();
      if (userData.cache) {
        this.cacheManager.set(`user:${userId}`, user, this.CACHE_TIME);
      }
      this.logger.log(`editEmailUser:::Updated email of user:${userId}`);
      return user;
    } catch (err) {
      this.logger.error('editEmailUser:::', err);
      return null;
    }
  }

  /**
   * Update user setting
   * @param userId : user to update
   * @param password 
   * @param avatar 
   * @param dob 
   * @param location 
   * @param about 
   * @returns 
   */
  async editUserSetting(
    userId: string,
    password: string,
    avatar?: string,
    dob?: Date,
    location?: string,
    about?: string,
  ): Promise<UserDocument> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('editUserSetting:::User not found');
        return null;
      }
      if (userData.user.password !== password) {
        this.logger.log('editUserSetting:::Password not match');
        return null;
      }

      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          {
            $set: {
              avatar: avatar ? avatar : userData.user.avatar,
              setting: {
                date_of_birth: dob ? dob : userData.user.setting.date_of_birth,
                location: location ? location : userData.user.setting.location,
                about: about ? about : userData.user.setting.about,
                ...userData.user.setting,
              },
            },
          },
          { new: true },
        )
        .exec();

      if (userData.cache) {
        this.cacheManager.set(`user:${userId}`, updatedUser, this.CACHE_TIME);
      }
      this.logger.log(
        `editUserSetting:::Updated information of user:${userId}`,
      );
      return updatedUser;
    } catch (err) {
      this.logger.error(`editUserSetting:::${err}`);
      return null;
    }
  }

  async editPasswordUser(
    userId: string,
    oldPassword: string,
    password: string,
  ): Promise<UserDocument> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('editPasswordUser:::User not found');
        return null;
      }

      if (userData.user.password !== oldPassword) {
        this.logger.log('editPasswordUser:::Password not match');
        return null;
      }

      const user = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $set: { password: password } },
          { new: true },
        )
        .exec();
      if (userData.cache) {
        this.cacheManager.set(`user:${userId}`, user, this.CACHE_TIME);
      }
      this.logger.log(`editPasswordUser:::Updated password of user:${userId}`);
      return user;
    } catch (err) {
      this.logger.error(`editPasswordUser:::${err}`);
      return null;
    }
  }

  async createVerifyCode(userId: string): Promise<string> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('createVerifyCode:::User not found');
        return null;
      }
      if (userData.user.class > 0) {
        this.logger.log('createVerifyCode:::User email has been verified');
        return null;
      }

      const code = SHA256(userId).toString(enc.Hex);
      await this.cacheManager.set(
        `user:${userId}:verifyCode`,
        code,
        30 * 60000,
      ); // 30 minutes
      this.mailService.sendUserConfirmation(userData.user, code);
      this.logger.log('createVerifyCode:::Created verify code');
      return code;
    } catch (err) {
      this.logger.error(`createVerifyCode:::${err}`);
      return null;
    }
  }

  async verifyEmail(userId: string, code: string): Promise<UserDocument> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('verifyEmail:::User not found');
        return null;
      }

      const cacheCode = await this.cacheManager.get(
        `user:${userId}:verifyCode`,
      );
      if (cacheCode !== code) {
        this.logger.log('verifyEmail:::Code not match');
        return null;
      }

      const user = await this.userModel
        .findByIdAndUpdate(userId, { $set: { class: 1 } }, { new: true })
        .exec();
      await Promise.all([
        this.cacheManager.set(`user:${userId}`, user, this.CACHE_TIME),
        this.cacheManager.del(`user:${userId}:verifyCode`),
      ]);

      return user;
    } catch (err) {
      this.logger.error('verifyEmail:::', err);
      return null;
    }
  }

  // check if user1 follow user2
  async checkFollowUser(userId1: string, userId2: string): Promise<boolean> {
    try {
      const user1Data = await this.findUserById(userId1);
      if(user1Data.user) {
        this.logger.log(`checkFollowUser:::${userId2}`);
        return user1Data.user.followings.includes(userId2);
      }
      return false;
    } catch(err) {
      this.logger.error(`checkFollowUser:::${err}`);
      return false;
    }
  }

  // user1 follow user2
  async followUser(user1Id: string, user2Id: string): Promise<boolean> {
    try {
      const [user1, user2] = await Promise.all([
        this.userModel.findById(user1Id),
        this.userModel.findById(user2Id)
      ]);

      // unfollow if user1 has already followed user2
      if(user2.followers.includes(user1Id)) {
        user1.followings = user1.followings.filter((id) => id !== user2Id);
        user2.followers = user2.followers.filter((id) => id !== user1Id);
        await Promise.all([
          user1.save(),
          user2.save()
        ]);

        return false;
      } else {
        user1.followings.push(user2Id);
        user2.followers.push(user1Id);
        await Promise.all([
          user1.save(),
          user2.save()
        ]);

        return true;
      }
    } catch(err) {
      this.logger.error(`followUser:::${err}`);
      return false;
    }
  }

  /* Category model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createCategory(
    name: string,
    title: string,
    about: string,
  ): Promise<CategoryDocument> {
    try {
      const category = await this.categoryModel.create({
        name,
        title,
        about,
        forums: [],
      });
      this.logger.log(
        `createCategory:::Created new category, id=${category._id.toHexString()}`,
      );
      return category;
    } catch (err) {
      this.logger.error('createCategory:::', err);
      return null;
    }
  }

  // Will also cache to redis
  async findCategoryById(id: string): Promise<{
    cache: boolean;
    category: CategoryDocument;
  }> {
    try {
      const cache: CategoryDocument = await this.cacheManager.get(
        `category:${id}`,
      );
      if (cache) {
        this.logger.log(`findCategoryById:::CACHE:::Found category:${id}`);
        return { cache: true, category: cache };
      }

      const category = await this.categoryModel.findById(id).exec();
      if (category) {
        await this.cacheManager.set(
          `category:${id}`,
          category.toObject(),
          this.CACHE_TIME,
        );
      }
      this.logger.log(`findCategoryById:::DB:::Found category:${category}`);
      return { cache: false, category };
    } catch (err) {
      this.logger.error('findCategoryById:::', err);
      return null;
    }
  }

  async findAllCategory(): Promise<CategoryDocument[]> {
    try {
      const categories = await this.categoryModel.find().exec();
      this.logger.log('findAllCategory:::DB:::Found all categories');
      return categories;
    } catch (err) {
      this.logger.error('findAllCategory:::', err);
      return null;
    }
  }

  async addForumToCategory(
    categoryId: string,
    forumId: string,
  ): Promise<CategoryDocument> {
    try {
      const [forumData, categoryData] = await Promise.all([
        this.findForumById(forumId),
        this.findCategoryById(categoryId),
      ]);
      if (!forumData.forum || !categoryData.category) {
        this.logger.log('addForumToCategory:::Category or forum not found');
        return null;
      }
      const category = await this.categoryModel
        .findByIdAndUpdate(
          categoryId,
          { $push: { forums: forumId } },
          { new: true },
        )
        .exec();
      this.logger.log(
        `addForumToCategory:::Added forum:${forumId} to category:${categoryId}`,
      );
      return category;
    } catch (err) {
      this.logger.error(`addForumToCategory:::${err}`);
      return null;
    }
  }

  /* Forum model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createForum(name: string, about: string): Promise<ForumDocument> {
    try {
      const forum = await this.forumModel.create({
        name,
        about,
        threads: 0,
        messages: 0,
        privilege: {
          view: 1,
          reply: 1,
          upload: 1,
          delete: 3,
        },
      });
      this.logger.log(
        `createForum:::Created a new forum, id=${forum._id.toHexString()}`,
      );
      return forum;
    } catch (err) {
      this.logger.error('createForum:::', err);
      return null;
    }
  }

  // Will also cache
  async findForumById(forumId: string): Promise<{
    cache: boolean;
    forum: ForumDocument;
  }> {
    try {
      const cache: ForumDocument = await this.cacheManager.get(
        `forum:${forumId}`,
      );
      if (cache) {
        this.logger.log(`findForumById:::CACHE:::Found forum:${forumId}`);
        return { cache: true, forum: cache };
      }

      const forum = await this.forumModel.findById(forumId).exec();
      if (forum) {
        await this.cacheManager.set(`forum:${forumId}`, forum, this.CACHE_TIME);
      }
      this.logger.log(`findForumById:::DB:::Found forum:${forum}`);
      return { cache: false, forum: forum };
    } catch (err) {
      this.logger.error('findForumById:::', err);
      return null;
    }
  }

  async findAllForums(): Promise<ForumDocument[]> {
    try {
      const forums = await this.forumModel.find();
      this.logger.log(`findAllForums:::DB:::Found forums`);
      return forums;
    } catch(err) {
      this.logger.error(`findAllForum:::${err}`);
      return null;
    }
  }

  async statisticsUserPosting(userId: string): Promise<Array<{forum: ForumDocument, count: number}>> {
    try {
      const forums = await this.findAllForums();
      const stats = await Promise.all(
        forums.map(async (forum) => {
          return {
            forum,
            count: await this.threadModel.countDocuments({
              forum: forum._id.toHexString(),
              user: userId
            })
          }
        })
      );
      
      this.logger.log(`statisticsUserPosting:::Statistics for user:${userId}`);
      return stats;
    } catch(err) {
      this.logger.error(`statisticsUserPosting:::${err}`);
      return null;
    }
  }

  /* Thread model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createThread(
    forumId: string,
    userId: string,
    prefixIds: number[],
    title: string,
    tag: Tag[],
  ): Promise<ThreadDocument> {
    try {
      const [forumData, userData] = await Promise.all([
        this.findForumById(forumId),
        this.findUserById(userId),
      ]);
      if (!userData || !userData.user || !forumData || !forumData.forum) {
        this.logger.log('createThread:::Forum or user not found');
        return null;
      }

      const time = new Date();
      const prefixes = await Promise.all(
        prefixIds.map(async (prefixId) => {
          return (await this.findPrefixById(prefixId)).prefix;
        })
      );
      const thread = await this.threadModel.create({
        forum: forumId,
        user: userId,
        prefix: prefixes,
        title,
        tag,
        create_time: time,
        update_time: time,
        replies: 0,
        views: 0,
        privilege: forumData.forum.privilege,
      });

      const forum = await this.forumModel
        .findByIdAndUpdate(forumId, { $inc: { threads: 1 } }, { new: true })
        .exec();
      if (forumData.cache) {
        this.cacheManager.set(`forum:${forumId}`, forum);
      }

      this.logger.log(
        `createThread:::Created a new thread, id=${thread._id.toHexString()}`,
      );
      // populate alert for followers
      userData.user.followers.forEach((follower) => {
        this.createAlert(
          follower,
          `<user>${userId}</user> posted a new thread <thread>${thread._id}</thread>`,
        );
      });
      return thread;
    } catch (err) {
      this.logger.error('createThread:::', err);
      return null;
    }
  }

  // Might remove this
  async addExistTagToThread(
    threadId: string,
    tagId: string,
  ): Promise<ThreadDocument> {
    try {
      const [thread, tag] = await Promise.all([
        this.findThreadById(threadId),
        this.findTagById(tagId),
      ]);
      if (!thread || !thread.thread || !tag || !tag.tag) {
        this.logger.log('addExistTagToThread:::Thread or tag not found');
        return null;
      }
      this.logger.log(
        `addExistTagToThread:::Added tag:${tagId} to thread:${threadId}`,
      );
      return await this.threadModel
        .findByIdAndUpdate(threadId, { $push: { tag: tag.tag } }, { new: true })
        .exec();
    } catch (err) {
      this.logger.error('addExistTagToThread:::', err);
      return null;
    }
  }

  async addNewTagToThread(
    threadId: string,
    tagName: string,
  ): Promise<ThreadDocument> {
    try {
      const thread = await this.findThreadById(threadId);
      if (!thread || !thread.thread) {
        this.logger.log('addNewTagToThread:::Thread not found');
        return null;
      }
      this.logger.log(
        `addNewTagToThread:::Added tag:${tagName} to thread:${threadId}`,
      );
      return await this.threadModel
        .findByIdAndUpdate(
          threadId,
          { $push: { tag: new Tag(tagName, '#cecece') } },
          { new: true },
        )
        .exec();
    } catch (err) {
      this.logger.error('addNewTagToThread:::', err);
      return null;
    }
  }

  async addPrefixToThread(threadId: string, prefixId: number) {
    try {
      const [thread, prefixData] = await Promise.all([
        this.threadModel.findById(threadId),
        this.findPrefixById(prefixId)
      ]);

      if(!prefixData || prefixData.prefix || thread) {
        this.logger.log('addPrefixToThread::: Thread or Prefix not found');
        return null;
      }

      if(thread.prefix.every((prefix) => {return prefix.id !== prefixId})) {
        thread.prefix.push(prefixData.prefix);
        await thread.save();
        this.logger.log('addPrefixToThread:::Add new prefix to thread');
        return thread;
      } else {
        this.logger.log('addPrefixToThread:::Prefix exist');
      }
    } catch(err) {
      this.logger.error(`addPrefixToThread:::${err}`);
      return null;
    }
  }

  // Will also cache to redis
  async findThreadById(
    threadId: string,
    incre: boolean = false,
  ): Promise<{
    cache: boolean;
    thread: ThreadDocument;
  }> {
    try {
      const cache: ThreadDocument = await this.cacheManager.get(
        `thread:${threadId}`,
      );
      if (cache) {
        if (incre) {
          cache.views++;
          this.threadModel
            .updateOne({ _id: threadId }, { $inc: { views: 1 } })
            .exec();
          await this.cacheManager.set(
            `thread:${threadId}`,
            cache,
            this.CACHE_TIME,
          );
        }
        this.logger.log(`findThreadById:::CACHE:::Found thread:${threadId}`);
        return { cache: true, thread: cache };
      }

      if (incre) {
        const thread = await this.threadModel
          .findByIdAndUpdate(threadId, { $inc: { views: 1 } })
          .exec();
        if (thread) {
          await this.cacheManager.set(
            `thread:${threadId}`,
            thread.toObject(),
            this.CACHE_TIME,
          );
        }
        this.logger.log(`findThreadById:::DB:::Found thread:${thread}`);
        return { cache: false, thread: thread };
      } else {
        const thread = await this.threadModel.findById(threadId).exec();
        if (thread) {
          await this.cacheManager.set(
            `thread:${threadId}`,
            thread.toObject(),
            this.CACHE_TIME,
          );
        }
        this.logger.log(`findThreadById:::DB:::Found thread:${thread}`);
        return { cache: false, thread: thread };
      }
    } catch (err) {
      this.logger.error('findThreadById:::', err);
      return null;
    }
  }

  // find by offset and limit
  // return limit thread with lastest create_time
  async findThreads(
    forumId: string,
    offset: number,
    limit: number,
  ): Promise<ThreadDocument[]> {
    try {
      const threads = await this.threadModel
        .find({ forum: forumId })
        .sort({ _id: -1 })
        .skip(offset)
        .limit(limit)
        .exec();
      this.logger.log(`findThread:::DB:::Found threads:${threads}`);
      return threads;
    } catch (err) {
      this.logger.error('findThread:::', err);
      return null;
    }
  }

  // find thread of user
  // return thread with lastest create_time
  async findThreadOfUser(
    userId: string,
    current: string,
    limit: number,
  ): Promise<ThreadDocument[]> {
    try {
      let threads: ThreadDocument[];
      if (current) {
        threads = (
          await this.threadModel
            .find({ user: userId, _id: { $lt: current } })
            .limit(limit)
            .exec()
        ).reverse();
      } else {
        threads = await this.threadModel
          .find({ user: userId })
          .sort({ _id: -1 })
          .limit(limit)
          .exec();
      }
      this.logger.log(`findThreadOfUser:::DB:::Found threads:${threads}`);
      return threads;
    } catch (err) {
      this.logger.error('findThreadOfUser:::', err);
      return null;
    }
  }

  async findLastestThread(forumId: string): Promise<ThreadDocument> {
    try {
      const cache: ThreadDocument = await this.cacheManager.get(
        `forum:${forumId}:lastestThread`,
      );
      if (cache) {
        this.logger.log(
          `findLastestThread:::CACHE:::Found lastest thread:${cache._id} of forum:${forumId}`,
        );
        return cache;
      }

      const thread = await this.threadModel
        .findOne({ forum: forumId })
        .sort({ _id: -1 })
        .exec();
      if (thread) {
        await this.cacheManager.set(
          `forum:${forumId}:lastestThread`,
          thread,
          this.CACHE_TIME,
        );
      }
      this.logger.log(
        `findLastestThread:::DB:::Found lastest thread:${thread?._id.toHexString()} of forum:${forumId}`,
      );
      return thread?.toObject();
    } catch (err) {
      this.logger.error(`findLastestThread:::${err}`);
      console.log(err);
      return null;
    }
  }

  async findAllThread(): Promise<ThreadDocument[]> {
    return await this.threadModel.find().exec();
  }

  // filter and return threads according to filterOptions
  async filterThread(
    forumId: string,
    offset: number,
    limit: number,
    filterOptions: FilterOptions,
  ): Promise<{
    count: number;
    threads: ThreadDocument[];
  }> {
    try {
      const filters: any = { forum: forumId };
      if (filterOptions.prefix) {
        filters['prefix.id'] = { $all: filterOptions.prefix };
      }
      if (filterOptions.author) {
        filters.user = (await this.findUserByName(filterOptions.author))._id;
      }
      if (filterOptions.last_update_within) {
        filters.update_time = { $gt: filterOptions.last_update_within };
      }

      console.log(filters);

      const [threads, totalDocuments] = await Promise.all([
        this.threadModel
          .find(filters)
          .sort({
            [`${filterOptions.sort_type}`]: filterOptions.descending ? -1 : 1,
          })
          .skip(offset)
          .limit(limit)
          .exec(),
        this.threadModel.find(filters).countDocuments().exec(),
      ]);

      this.logger.log(`filterThread:::Found threads:${threads}`);
      return {
        count: totalDocuments,
        threads,
      };
    } catch (err) {
      this.logger.error(err);
      return null;
    }
  }

  /**
   * Search threads satisfy the following:
   * 
   * Title includes searchTitle
   * 
   * Created by member if member is provided
   * @param searchTitle : search value
   * @param member : author of thread (id string)
   * @param offset : number records will skip
   * @param limit : number records return
   * @returns ThreadDocument[]
   */
  async searchThread(
    searchTitle: string,
    member: string,
    offset: number,
    limit: number
  ): Promise<ThreadDocument[]> {
    try {
      // Return threads made by member if member is provided
      if(member) {
        // Check if member exist
        const mem = await this.findUserByName(member);
        if(mem) {
          return await this.threadModel
            .find({title: { $regex: searchTitle, $options: 'i' }, user: mem._id.toHexString()})
            .skip(offset)
            .limit(limit)
            .exec();
        }
        else return null;
      }
      else {
        return await this.threadModel
        .find({title: { $regex: searchTitle, $options: 'i' }})
        .skip(offset)
        .limit(limit)
        .exec();
      }
    } catch(err) {
      this.logger.error(`searchThread:::${err}`);
      return null;
    }
  }

  /**
   * Search threads of a forum satisfy the following:
   * 
   * Title includes searchTitle
   * 
   * Created by member if member is provided
   * @param forumId : forum to search
   * @param searchTitle : title to search
   * @param member : member to search if provided
   * @param offset : number records skip
   * @param limit : number records return
   * @returns Thread[]
   */
  async searchThreadForum(
    forumId: string,
    searchTitle: string,
    member: string,
    offset: number,
    limit: number
  ): Promise<ThreadDocument[]> {
    try {
      // Return threads made by member if member is provided
      if(member) {
        // Check if member exist
        const mem = await this.findUserByName(member);
        if(mem) {
          const threads = await this.threadModel
            .find({forum: forumId, title: { $regex: searchTitle, $options: 'i' }, user: mem._id.toHexString()})
            .skip(offset)
            .limit(limit)
            .exec();

          this.logger.log(`searchThreadForum:::Found threads: ${threads}`);
          return threads;
        }
        else return null;
      }
      else {
        const threads = await this.threadModel
        .find({forum: forumId, title: { $regex: searchTitle, $options: 'i' }})
        .skip(offset)
        .limit(limit)
        .exec();

        this.logger.log(`searchThreadForum:::Found threads: ${threads}`);
        return threads;
      }
    } catch(err) {
      this.logger.error(`searchThread:::${err}`);
      return null;
    }
  }

  /**
   * Count number of documents of a given search query
   * @param forumId : forum to search
   * @param searchTitle : title to search
   * @param member : member made the thread
   * @returns Number of threads
   */
  async countSearchThreads(
    forumId: string,
    searchTitle: string,
    member: string
  ): Promise<number> {
    try {
      let threadCount: number;
      if(forumId) {
        if(member) {
          const mem = await this.findUserByName(member);
          threadCount = await this.threadModel
            .find({forum: forumId, title: { $regex: searchTitle, $options: 'i' }, user: mem._id.toHexString()})
            .countDocuments()
            .exec();
        }
        else {
          threadCount = await this.threadModel
            .find({forum: forumId, title: { $regex: searchTitle, $options: 'i' }})
            .countDocuments()
            .exec();
        }
      }
      else {
        if(member) {
          const mem = await this.findUserByName(member);
          threadCount = await this.threadModel
            .find({title: { $regex: searchTitle, $options: 'i' }, user: mem._id.toHexString()})
            .countDocuments()
            .exec();
        }
        else {
          threadCount = await this.threadModel
            .find({title: { $regex: searchTitle, $options: 'i' }})
            .countDocuments()
            .exec();
        }
      }

      this.logger.log(`countSearchThreads:::Found ${threadCount} documents`);
      return threadCount;
    } catch(err) {
      this.logger.error(`countSearchThreads:::${err}`);
      return 0;
    }
  }

  /**
   * Update a thread to new value
   * @param threadId : thread to update
   * @param userId : userId for verification
   * @param threadPrefixIds : new prefixes
   * @param threadTitle : new title
   * @param threadContent : new content
   * @param tag : new tag
   * @returns Updated thread
   */
  async editThread(
    threadId: string,
    userId: string,
    threadPrefixIds: number[],
    threadTitle: string,
    threadContent: string,
    tag: Tag[],
  ): Promise<ThreadDocument> {
    try {
      const time = new Date();
      const thread = await this.threadModel.findById(threadId);
      if(thread.user !== userId) {
        this.logger.log('User not match');
        return null;
      }
      if(threadTitle.length > 0) {
        thread.title = threadTitle;
      }
      await Promise.all(
        threadPrefixIds.map(async (prefixId) => {
          if(thread.prefix.every((prefix) => prefix.id !== prefixId)) {
            thread.prefix.push((await this.findPrefixById(prefixId)).prefix);
          }
        })
      );
      if(tag) {
        thread.tag.concat(...tag);
      }
      if (threadContent) {
        await this.messageModel
        .updateOne(
          { thread: threadId },
          { content: threadContent, update_time: time },
        )
        .exec();
      }
      await thread.save();
      this.logger.log(`editThread:::Updated thread, id=${threadId}`);
      return thread;
    } catch (err) {
      this.logger.error('editThread:::', err);
      return null;
    }
  }

  /* Message model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createMessage(
    threadId: string,
    userId: string,
    content: string,
    attachments?: string[],
  ): Promise<MessageDocument> {
    try {
      const [threadData, userData] = await Promise.all([
        this.findThreadById(threadId),
        this.findUserById(userId),
      ]);
      if (!threadData || !threadData.thread || !userData || !userData.user) {
        this.logger.log('createMessage:::Thread or user not found');
        return null;
      }
      const time = new Date();
      const message = await this.messageModel.create({
        thread: threadId,
        user: userId,
        content,
        create_time: time,
        update_time: time,
        attachments: attachments ?? [],
        reactions: {
          like: 0,
          love: 0,
          care: 0,
          haha: 0,
          wow: 0,
          sad: 0,
          angry: 0,
        },
        threadPage: new Map<number, number>(),
      });
      await Promise.all([
        this.forumModel
          .updateOne(
            { _id: threadData.thread.forum },
            { $inc: { messages: 1 } },
          )
          .exec(),
        this.threadModel
          .updateOne({ _id: threadId }, { $inc: { replies: 1 } })
          .exec(),
        this.userModel
          .updateOne({ _id: userData.user._id }, { $inc: { messages: 1 } })
          .exec(),
      ]);
      this.logger.log(
        `createMessage:::Created new message, id=${message._id.toHexString()}`,
      );
      return message;
    } catch (err) {
      this.logger.error('createMessage:::', err);
      return null;
    }
  }

  /**
   * Find message by id and cache to Redis
   * @param messageId 
   * @returns Message
   */
  async findMessageById(messageId: string): Promise<{
    cache: boolean;
    message: MessageDocument;
  }> {
    try {
      const cache: MessageDocument = await this.cacheManager.get(
        `message:${messageId}`,
      );
      if (cache) {
        this.logger.log(`findMessageById:::CACHE:::Found message:${messageId}`);
        return { cache: true, message: cache };
      }

      const message = await this.messageModel.findById(messageId).exec();
      if (message) {
        await this.cacheManager.set(
          `message:${messageId}`,
          message.toObject(),
          this.CACHE_TIME,
        );
      }
      this.logger.log(`findMessageById:::DB:::Found message:${message}`);
      return { cache: false, message: message };
    } catch (err) {
      this.logger.error('findMessageById:::', err);
      return null;
    }
  }

  /**
   * Find latest message of a thread
   * @param threadId : thread to find
   * @returns Message
   */
  async findLastestMessage(
    threadId: string | Types.ObjectId,
  ): Promise<MessageDocument> {
    try {
      const _threadId =
        typeof threadId === 'string' ? threadId : threadId.toHexString();
      const message = await this.messageModel
        .findOne({ thread: _threadId })
        .sort({ create_time: -1 })
        .exec();
      this.logger.log(
        `findLastestMessage:::DB:::Found lastest message:${message}`,
      );
      return message;
    } catch (err) {
      this.logger.error('findLastestMessage:::', err);
      return null;
    }
  }

  async findAllMessage() {
    return await this.messageModel.find().exec();
  }

  async findMessages(
    threadId: string,
    offset: number,
    limit: number,
  ): Promise<MessageDocument[]> {
    try {
      const messages = await this.messageModel
        .find({ thread: threadId })
        .skip(offset)
        .limit(limit)
        .exec();
      // update threadPage if needed
      if (offset % limit === 0) {
        const page = offset / limit + 1;
        await Promise.all(
          messages.map(async (message) => {
            if (message.threadPage[limit] !== page) {
              message.threadPage.set(limit, page);
              await message.save();
            }
            return true;
          }),
        );
      }
      this.logger.log(`findMessage:::DB:::Found messages:${messages}`);
      return messages;
    } catch (err) {
      this.logger.error(`findMessage:::${err}`);
      return null;
    }
  }

  // find by _id
  async findMessageOfUser(
    userId: string,
    current: string,
    limit: number,
  ): Promise<MessageDocument[]> {
    try {
      let messages: MessageDocument[];
      if (current) {
        messages = await this.messageModel
          .find({ user: userId, _id: { $lt: current } })
          .limit(limit)
          .exec();
      } else {
        messages = await this.messageModel
          .find({ user: userId })
          .sort({ create_time: -1 })
          .limit(limit)
          .exec();
      }
      this.logger.log(`findMessageOfUser:::DB:::Found messages:${messages}`);
      return messages;
    } catch (err) {
      this.logger.error('findMessageOfUser:::', err);
      return null;
    }
  }

  async editMessage(
    messageId: string,
		userId: string,
    content: string,
    attachments: string[]
  ): Promise<MessageDocument> {
    try {
			const message = await this.messageModel.findById(messageId);
      if(message.user !== userId) {
				this.logger.log(`editMessage:::Error updating message, user not match`);
				return null;
			}
			
			message.content = content;
      message.attachments = attachments;
			await message.save();
      this.logger.log(`editMessage:::Updated message, id=${messageId}`);
      return message;
    } catch (err) {
      this.logger.error('editMessage:::', err);
      return null;
    }
  }

  async addAttachment(
    messageId: string,
    attachments: string[],
  ): Promise<MessageDocument> {
    try {
      const messageData = await this.findMessageById(messageId);
      if (!messageData || !messageData.message) {
        this.logger.log('addAttachment:::Message not found');
        return null;
      }

      const message = messageData.message;
      if (message.attachments.length === 0) {
        message.attachments = attachments;
        await Promise.all([
          this.messageModel
            .updateOne(
              { _id: messageId },
              { $set: { attachments: attachments } },
            )
            .exec(),
          this.cacheManager.set(
            `message:${messageId}`,
            message,
            this.CACHE_TIME,
          ),
        ]);
        return message;
      } else {
        message.attachments.push(...attachments);
        await Promise.all([
          this.messageModel
            .updateOne(
              { _id: messageId },
              { $push: { attachments: attachments } },
            )
            .exec(),
          this.cacheManager.set(
            `message:${messageId}`,
            message,
            this.CACHE_TIME,
          ),
        ]);
        return message;
      }
    } catch (err) {
      this.logger.error('addAttachment:::', err);
      return null;
    }
  }

  /* Tag model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createTag(name: string, color: string): Promise<TagDocument> {
    try {
      const tag = await this.tagModel.create({
        name,
        color,
      });
      this.logger.log(
        `createTag:::Created new tag, id=${tag._id.toHexString()}`,
      );
      return tag;
    } catch (err) {
      this.logger.error('createTag:::', err);
      return null;
    }
  }

  // Will also cache to redis
  async findTagById(tagId: string): Promise<{
    cache: boolean;
    tag: TagDocument;
  }> {
    try {
      const cache: TagDocument = await this.cacheManager.get(`tag:${tagId}`);
      if (cache) {
        this.logger.log(`findTagById:::CACHE:::Found tag:${tagId}`);
        return { cache: true, tag: cache };
      }

      const tag = await this.tagModel.findById(tagId).exec();
      if (tag) {
        await this.cacheManager.set(`tag:${tagId}`, tag, this.CACHE_TIME);
      }
      this.logger.log(`findTagById:::DB:::Found tag:${tag}`);
      return { cache: false, tag: tag };
    } catch (err) {
      this.logger.error('findTagById:::', err);
      return null;
    }
  }

  /* Reaction model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createReaction(
    messageId: string,
    userId: string,
    type: string,
  ): Promise<ReactionDocument> {
    try {
      const time = new Date();
      const reaction = await this.reactionModel.create({
        message: messageId,
        user: userId,
        type,
        create_time: time,
      });
      this.logger.log(
        `createReaction:::Created new reaction, id=${reaction._id.toHexString()}`,
      );
      return reaction;
    } catch (err) {
      this.logger.error(`createReaction:::${err}`);
      return null;
    }
  }

  async getReactionById(reactionId: string): Promise<{
    cache: boolean;
    reaction: ReactionDocument;
  }> {
    try {
      const cache: ReactionDocument = await this.cacheManager.get(
        `reaction:${reactionId}`,
      );
      if (cache) {
        this.logger.log(
          `getReactionById:::CACHE:::Found reaction:${reactionId}`,
        );
        return { cache: true, reaction: cache };
      }

      const reaction = await this.reactionModel.findById(reactionId).exec();
      if (reaction) {
        await this.cacheManager.set(
          `reaction:${reactionId}`,
          reaction,
          this.CACHE_TIME,
        );
      }
      this.logger.log(`getReactionById:::DB:::Found reaction:${reaction}`);
      return { cache: false, reaction: reaction };
    } catch (err) {
      this.logger.error(`getReactionById:::${err}`);
      return null;
    }
  }

  async getReaction(
    userId: string,
    messageId: string,
  ): Promise<ReactionDocument> {
    try {
      const reaction = await this.reactionModel.findOne({
        user: userId,
        message: messageId,
      });
      this.logger.log(`getReaction:::DB:::Found reaction:${reaction}`);
      return reaction;
    } catch (err) {
      this.logger.error(`getReaction:::${err}`);
      return null;
    }
  }

  async getReactionsOfMessage(
    messageId: string,
    current: string = null,
    limit: number = 3,
  ): Promise<Array<{ reaction: ReactionDocument; user: any }>> {
    try {
      const messageData = await this.findMessageById(messageId);
      if (!messageData || !messageData.message) {
        this.logger.log('Message not found');
        return null;
      }

      let reactions: ReactionDocument[];
      if (current) {
        reactions = await this.reactionModel
          .find({ message: messageId }, { _id: { $lt: current } })
          .limit(limit)
          .exec();
      } else {
        reactions = await this.reactionModel
          .find({ message: messageId })
          .sort({ create_time: -1 })
          .limit(limit)
          .exec();
      }
      this.logger.log(
        `getReactionsOfMessage:::DB:::Found reactions:${reactions}`,
      );

      const result: Array<{ reaction: ReactionDocument; user: any }> = [];
      await Promise.all(
        reactions.map(async (reaction) => {
          const userData = await this.findUserById(reaction.user);
          if (!userData || !userData.user) {
            this.logger.log(`getReactionsOfMessage:::User not found`);
          } else {
            if (userData.cache) {
              const { email, password, setting, ...nonSensitive } =
                userData.user;
              result.push({ reaction, user: nonSensitive });
            } else {
              const { email, password, setting, ...nonSensitive } =
                userData.user.toObject();
              result.push({ reaction, user: nonSensitive });
            }
          }
        }),
      );
      this.logger.log(
        `getReactionsOfMessage:::Found users associated with reactions`,
      );
      return result;
    } catch (err) {
      console.error(`getReactionsOfMessage:::${err}`);
      return null;
    }
  }

  async addReactionToMessage(
    messageId: string,
    userId: string,
    type: string,
  ): Promise<{
    message: MessageDocument;
    reaction: ReactionDocument;
  }> {
    try {
      const [messageData, userData, reaction] = await Promise.all([
        this.findMessageById(messageId),
        this.findUserById(userId),
        this.reactionModel.findOne({ message: messageId, user: userId }).exec(),
      ]);
      if (!messageData || !messageData.message || !userData || !userData.user) {
        this.logger.log('addReactionToMessage:::User or message not found');
        return null;
      }

      // If user has already reacted the post
      // We can try to change reaction type, or delete it
      const message = messageData.message;
      if (reaction) {
        // Delete it if of same type
        if (reaction.type === type) {
          message.reactions[type]--;
          const [_1, _2, updatedUser] = await Promise.all([
            this.reactionModel.deleteOne({ _id: reaction._id }),
            this.messageModel
              .updateOne(
                { _id: messageId },
                { $inc: { [`reactions.${type}`]: -1 } },
              )
              .exec(),
            this.userModel
              .findByIdAndUpdate(
                message.user,
                { $inc: { likes: -1 } },
                { new: true },
              )
              .exec(),
          ]);
          await Promise.all([
            this.cacheManager.set(`message:${messageId}`, message),
            this.cacheManager.set(
              `user:${updatedUser._id}`,
              updatedUser,
              this.CACHE_TIME,
            ),
          ]);
          this.logger.log(
            'addReactionToMessage:::Deleted duplicated reaction on a message',
          );
          return {
            message: message,
            reaction: null,
          };
        } else {
          message.reactions[reaction.type]--;
          message.reactions[type]++;
          const [newReaction, _1, _2] = await Promise.all([
            this.createReaction(messageId, userId, type),
            this.messageModel
              .updateOne(
                { _id: messageId },
                {
                  $inc: {
                    [`reactions.${reaction.type}`]: -1,
                    [`reactions.${type}`]: 1,
                  },
                },
              )
              .exec(),
            reaction.deleteOne().exec(),
          ]);

          await this.cacheManager.set(`message:${messageId}`, message);
          this.logger.log(
            'addReactionToMessage:::Changed duplicated reaction on a message',
          );
          return {
            message: message,
            reaction: newReaction,
          };
        }
      }

      const newReaction = await this.createReaction(messageId, userId, type);
      this.logger.log(
        `addReactionToMessage:::Added a ${type} by user:${userId} to message:${messageId}`,
      );

      message.reactions[type]++;
      const [_, updatedUser] = await Promise.all([
        this.messageModel
          .updateOne({ _id: messageId }, { $inc: { [`reactions.${type}`]: 1 } })
          .exec(),
        this.userModel
          .findByIdAndUpdate(messageData.message.user, { $inc: { likes: 1 } })
          .exec(),
      ]);
      await Promise.all([
        this.cacheManager.set(`message:${messageId}`, message, this.CACHE_TIME),
        this.cacheManager.set(`user:${updatedUser._id}`, updatedUser),
      ]);
      return {
        message: message,
        reaction: newReaction,
      };
    } catch (err) {
      this.logger.error('addReactionToMessage:::', err);
      return null;
    }
  }

  /* Alert model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createAlert(userId: string, detail: string): Promise<AlertDocument> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('createAlert:::User not found');
        return null;
      }
      const time = new Date();
      const alert = await this.alertModel.create({
        user: userId,
        detail,
        read: false,
        create_time: time,
      });
      this.logger.log(`createAlert:::Created new alert, id=${alert._id}`);
      return alert;
    } catch (err) {
      this.logger.error('createAlert:::', err);
      return null;
    }
  }

  async findAlertById(alertId: string): Promise<{
    cache: boolean;
    alert: AlertDocument;
  }> {
    try {
      const cache: AlertDocument = await this.cacheManager.get(
        `alert:${alertId}`,
      );
      if (cache) {
        this.logger.log(`findAlertById:::CACHE:::Found alert:${alertId}`);
        return {
          cache: true,
          alert: cache,
        };
      }

      const alert = await this.alertModel.findById(alertId).exec();
      if (alert) {
        await this.cacheManager.set(`alert:${alertId}`, alert, this.CACHE_TIME);
      }
      this.logger.log(`findAlertById:::DB:::Found alert:${alert}`);
      return {
        cache: false,
        alert: alert,
      };
    } catch (err) {
      this.logger.error('findAlertById:::', err);
      return null;
    }
  }

  async findAlerts(
    userId: string,
    current: string,
    limit: number,
  ): Promise<AlertDocument[]> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('User not found');
        return null;
      }

      let alerts: AlertDocument[];
      if (current) {
        alerts = await this.alertModel
          .find({ user: userId }, { _id: { $lt: current } })
          .limit(limit)
          .exec();
      } else {
        alerts = await this.alertModel
          .find({ user: userId })
          .sort({ create_time: -1 })
          .limit(limit)
          .exec();
      }
      this.logger.log(`findAlerts:::Found alerts, ${alerts}`);
      return alerts;
    } catch (err) {
      this.logger.error(`findAlerts:::${err}`);
      return null;
    }
  }

  /* Bookmark model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createBookmark(
    messageId: string,
    userId: string,
    detail: string,
  ): Promise<BookmarkDocument> {
    try {
      const [messageData, userData] = await Promise.all([
        this.findMessageById(messageId),
        this.findUserById(userId),
      ]);
      if (!userData || !userData.user || !messageData || !messageData.message) {
        this.logger.log('createBookmark:::User or thread not found');
        return null;
      }
      const time = new Date();
      const bookmark = await this.bookmarkModel.create({
        message: messageId,
        thread: messageData.message.thread,
        user: userId,
        detail,
        create_time: time,
      });
      this.logger.log(
        `createBookmark:::Created new bookmark, id=${bookmark._id}`,
      );
      return bookmark;
    } catch (err) {
      this.logger.error('createBookmark:::', err);
      return null;
    }
  }

  async findBookmarkById(bookmarkId: string): Promise<{
    cache: boolean;
    bookmark: BookmarkDocument;
  }> {
    try {
      const cache: BookmarkDocument = await this.cacheManager.get(
        `bookmark:${bookmarkId}`,
      );
      if (cache) {
        this.logger.log(
          `findBookmarkById:::CACHE:::Found bookmark:${bookmarkId}`,
        );
        return {
          cache: true,
          bookmark: cache,
        };
      }

      const bookmark = await this.bookmarkModel.findById(bookmarkId).exec();
      if (bookmark) {
        await this.cacheManager.set(
          `bookmark:${bookmarkId}`,
          bookmark,
          this.CACHE_TIME,
        );
      }
      this.logger.log(`findBookmarkById:::DB:::Found bookmark:${bookmark}`);
      return {
        cache: false,
        bookmark: bookmark,
      };
    } catch (err) {
      this.logger.error('findBookmarkById:::', err);
      return null;
    }
  }

  async findBookmarkOfUser(
    userId: string,
    current: string,
    limit: number,
  ): Promise<BookmarkDocument[]> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('findBookmark:::User not found');
        return null;
      }

      let bookmarks: BookmarkDocument[];
      if (current) {
        bookmarks = (
          await this.bookmarkModel
            .find({ user: userId, _id: { $lt: current } })
            .limit(limit)
            .exec()
        ).reverse();
      } else {
        bookmarks = await this.bookmarkModel
          .find({ user: userId })
          .sort({ _id: -1 })
          .limit(limit)
          .exec();
      }
      this.logger.log(`findBookmark:::Found bookmarks:${bookmarks}`);
      return bookmarks;
    } catch (err) {
      this.logger.error(`findBookmark:::${err}`);
      return null;
    }
  }

  async findBookmarkOfMessage(
    userId: string,
    messageId: string,
  ): Promise<BookmarkDocument> {
    try {
      const [messageData, userData] = await Promise.all([
        this.findMessageById(messageId),
        this.findUserById(userId),
      ]);
      if (!messageData || !messageData.message || !userData || !userData.user) {
        this.logger.log('findBookmarkOfMessage:::Message or user not found');
        return null;
      }

      const bookmark = await this.bookmarkModel.findOne({
        user: userId,
        message: messageId,
      });
      this.logger.log(`findBookmarkOfMessage:::Found bookmark:${bookmark}`);
      return bookmark;
    } catch (err) {
      this.logger.error(`findBookmarkOfMessage:::${err}`);
      return null;
    }
  }

  async updateBookmark(
    bookmarkId: string,
    userId: string,
    detail: string,
  ): Promise<BookmarkDocument> {
    try {
      const bookmarkData = await this.findBookmarkById(bookmarkId);
      if (!bookmarkData || !bookmarkData.bookmark) {
        this.logger.log('updateBookmark:::Bookmark not found');
        return null;
      }
      if (bookmarkData.bookmark.user !== userId) {
        this.logger.log('updateBookmark:::User not match');
        return null;
      }
      if (bookmarkData.bookmark.detail === detail) {
        this.logger.log('updateBookmark:::No change');
        return bookmarkData.bookmark;
      }

      const updatedBookmark = await this.bookmarkModel.findByIdAndUpdate(
        bookmarkId,
        { $set: { detail: detail } },
        { new: true },
      );
      this.logger.log(`updateBookmark:::Updated bookmark:${bookmarkId}`);
      return updatedBookmark;
    } catch (err) {
      this.logger.error(err);
      return null;
    }
  }

  async deleteBookmark(bookmarkId: string, userId: string): Promise<boolean> {
    try {
      const bookmarkData = await this.findBookmarkById(bookmarkId);
      if (!bookmarkData || !bookmarkData.bookmark) {
        this.logger.log('deleteBookmark:::Bookmark not found');
        return false;
      }
      if (bookmarkData.bookmark.user !== userId) {
        this.logger.log('deleteBookmark:::User not match');
        return false;
      }

      await this.bookmarkModel.deleteOne({ _id: bookmarkId });
      this.logger.log(`deleteBookmark:::Deleted bookmark:${bookmarkId}`);
      return true;
    } catch (err) {
      this.logger.error(err);
      return false;
    }
  }

  /* Rating model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createRating(
    threadId: string,
    userId: string,
    score: number,
  ): Promise<RatingDocument> {
    try {
      const [threadData, userData] = await Promise.all([
        this.findThreadById(threadId),
        this.findUserById(userId),
      ]);
      if (!userData || !userData.user || !threadData || !threadData.thread) {
        this.logger.log('createRating:::User or thread not found');
        return null;
      }
      const time = new Date();
      const rating = await this.ratingModel.create({
        thread: threadId,
        user: userId,
        create_time: time,
        score: score,
      });
      this.logger.log(`createRating:::Created new rating, id=${rating._id}`);
      return rating;
    } catch (err) {
      this.logger.error('createRating:::', err);
      return null;
    }
  }

  async findRatingById(ratingId: string): Promise<{
    cache: boolean;
    rating: RatingDocument;
  }> {
    try {
      const cache: RatingDocument = await this.cacheManager.get(
        `rating:${ratingId}`,
      );
      if (cache) {
        this.logger.log(`findRatingById:::CACHE:::Found rating:${ratingId}`);
        return {
          cache: true,
          rating: cache,
        };
      }

      const rating = await this.ratingModel.findById(ratingId).exec();
      if (rating) {
        await this.cacheManager.set(
          `rating:${ratingId}`,
          rating,
          this.CACHE_TIME,
        );
      }
      this.logger.log(`findRatingById:::DB:::Found rating:${rating}`);
      return {
        cache: false,
        rating: rating,
      };
    } catch (err) {
      this.logger.error('findRatingById:::', err);
      return null;
    }
  }

  /* ProfilePosting model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createProfilePosting(
    userId: string,
    userWallId: string,
    message: string,
  ): Promise<ProfilePostingDocument> {
    try {
      const [userData1, userData2] = await Promise.all([
        this.findUserById(userId),
        this.findUserById(userWallId),
      ]);
      if (!userData1 || !userData1.user || !userData2 || !userData2.user) {
        this.logger.log('createProfilePosting:::User not found');
        return null;
      }

      const time = new Date();
      const profilePosting = await this.profilepostingModel.create({
        user: userId,
        user_wall: userWallId,
        message,
        create_time: time,
        replies: []
      });
      this.logger.log(
        `createProfilePosting:::Created new rating, id=${profilePosting._id.toHexString()}`,
      );
      return profilePosting;
    } catch (err) {
      this.logger.error('createProfilePosting:::', err);
      return null;
    }
  }

  async findProfilePostingById(profilePostingId: string): Promise<{
    cache: boolean;
    profileposting: ProfilePostingDocument;
  }> {
    try {
      const cache: ProfilePostingDocument = await this.cacheManager.get(
        `profileposting:${profilePostingId}`,
      );
      if (cache) {
        this.logger.log(
          `findProfilePostingById:::CACHE:::Found rating:${profilePostingId}`,
        );
        return {
          cache: true,
          profileposting: cache,
        };
      }

      const profileposting = await this.profilepostingModel
        .findById(profilePostingId)
        .exec();
      if (profileposting) {
        await this.cacheManager.set(
          `profileposting:${profilePostingId}`,
          profileposting,
          this.CACHE_TIME,
        );
      }
      this.logger.log(
        `findProfilePostingById:::DB:::Found profileposting:${profileposting}`,
      );
      return {
        cache: false,
        profileposting: profileposting,
      };
    } catch (err) {
      this.logger.error('findProfilePostingById:::', err);
      return null;
    }
  }

  async findProfilePosting(
    userWallId: string,
    current: string,
    limit: number,
  ): Promise<ProfilePostingDocument[]> {
    try {
      let postings: ProfilePostingDocument[];
      if(current) {
        postings = await this.profilepostingModel
          .find({ user_wall: userWallId, _id: { $lt: current } })
          .limit(limit)
          .exec();
        // reverse it
        postings.reverse();
      } else {
        postings = await this.profilepostingModel
          .find({ user_wall: userWallId })
          .sort({ create_time: -1 })
          .limit(limit)
          .exec();
      }
      this.logger.log(
        `findProfilePosting:::Found profile postings of userWall: ${userWallId} - ${postings}`,
      );
      return postings;
    } catch (err) {
      this.logger.error('findProfilePosting:::', err);
      return null;
    }
  }
  
  // ppId: profilePosting id
  // add a mew reply for a profile posting
  async replyProfilePosting(ppId: string, userId: string, message: string): Promise<ProfilePostingDocument> {
    try {
      const [profilePosting, user] = await Promise.all([
        this.profilepostingModel.findById(ppId),
        this.findUserById(userId)
      ]);

      if(!user || !user.user || !profilePosting) {
        this.logger.log('replyProfilePosting:::User not found');
        return null;
      }
      // limit to at most 100 replies per profile posting
      if(profilePosting.replies.length > 100) {
        this.logger.log("replyProfilePosting:::Profileposting's number of replies maxed!");
        return null;
      }

      // create new reply and push it to profile posting
      const time = new Date();
      profilePosting.replies.push({
        user: userId,
        message,
        create_time: time
      });

      await profilePosting.save();
      this.logger.log(`replyProfilePosting:::created new reply for profileposting:${ppId}`);
      return profilePosting;
    } catch(err) {
      this.logger.error(`replyProfilePosting:::${err}`);
      return null;
    }
  }

  /* Report model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createReport(
    messageId: string,
    reporter: string,
    reason: string,
    detail: string,
  ): Promise<ReportDocument> {
    try {
      const [messageData, userData] = await Promise.all([
        this.findMessageById(messageId),
        this.findUserById(reporter),
      ]);
      if (!userData || !userData.user || !messageData || !messageData.message) {
        this.logger.log('createReport:::User or message not found');
        return null;
      }
      const time = new Date();
      const reportTicket = await this.reportModel.create({
        message: messageId,
        reporter,
        reported: messageData.message.user,
        reason,
        detail,
        create_time: time,
      });
      this.logger.log(
        `createReport:::Created new report ticket, id=${reportTicket._id}`,
      );
      return reportTicket;
    } catch (err) {
      this.logger.error(`createReport:::${err}`);
      return null;
    }
  }

  async findReportById(reportId: string): Promise<{
    cache: boolean;
    report: ReportDocument;
  }> {
    try {
      const cache: ReportDocument = await this.cacheManager.get(
        `report:${reportId}`,
      );
      if (cache) {
        this.logger.log(`findReportById:::CACHE:::Found rating:${reportId}`);
        return {
          cache: true,
          report: cache,
        };
      }

      const report = await this.reportModel.findById(reportId).exec();
      if (report) {
        await this.cacheManager.set(
          `rating:${reportId}`,
          report,
          this.CACHE_TIME,
        );
      }
      this.logger.log(`findReportById:::DB:::Found rating:${report}`);
      return {
        cache: false,
        report: report,
      };
    } catch (err) {
      this.logger.error('findReportById:::', err);
      return null;
    }
  }

  async findReportOfUser(
    userId: string,
    current: string,
    limit: number,
  ): Promise<ReportDocument[]> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('findReportOfUser:::User not found');
        return null;
      }

      let reports: ReportDocument[];
      if (current) {
        reports = (
          await this.reportModel
            .find({ reporter: userId, _id: { $lt: current } })
            .limit(limit)
        ).reverse();
      } else {
        reports = await this.reportModel
          .find({ reporter: userId })
          .sort({ _id: -1 })
          .limit(limit)
          .exec();
      }
      this.logger.log(`findReportOfUser:::Found reports:${reports}`);
      return null;
    } catch (err) {
      this.logger.error(err);
      return null;
    }
  }

  async findReportTargetedUser(
    userId: string,
    limit: number,
  ): Promise<ReportDocument[]> {
    try {
      const userData = await this.findUserById(userId);
      if (!userData || !userData.user) {
        this.logger.log('findReportTargetedUser:::User not found');
        return null;
      }
      if (userData.user.class < 3) {
        this.logger.log('findReportTargetedUser:::User is not permitted');
        return null;
      }

      const reports = await this.reportModel
        .find({ reported: userId })
        .limit(limit);
      this.logger.log(`findReportTargetedUser:Found reports:${reports}`);
      return reports;
    } catch (err) {
      this.logger.error(`findReportTargetedUser:::${err}`);
      return null;
    }
  }

  async checkReportUser(
    messageId: string,
    userId: string,
  ): Promise<ReportDocument> {
    try {
      const [userData, messageData] = await Promise.all([
        this.findUserById(userId),
        this.findMessageById(messageId),
      ]);
      if (!userData || !userData.user || !messageData || !messageData.message) {
        this.logger.log('checkReportUser:::User or message not found');
        return null;
      }

      const report = await this.reportModel.findOne({
        message: messageId,
        reporter: userId,
      });
      this.logger.log(`checkReportUser:::Found report:${report}`);
      return report;
    } catch (err) {
      this.logger.error(`checkReportUser:::${err}`);
      return null;
    }
  }

  /* Prefix model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createPrefix(
    name: string,
    color: string = '#cecece',
  ): Promise<PrefixDocument> {
    try {
      const totalPrefix = await this.prefixModel.countDocuments().exec();
      const prefix = await this.prefixModel.create({
        id: totalPrefix + 1,
        name,
        color,
      });
      this.logger.log(
        `createPrefix:::Created prefix:${prefix._id.toHexString()}`,
      );
      return prefix;
    } catch (err) {
      this.logger.error(`createPrefix:::${err}`);
      return null;
    }
  }

  // get prefix by either _id or id
  async findPrefixById(prefixId: number): Promise<{
    cache: boolean;
    prefix: PrefixDocument;
  }> {
    try {
      const cache: PrefixDocument = await this.cacheManager.get(
        `prefix:${prefixId}`,
      );
      if (cache) {
        this.logger.log(`getPrefixById:::CACHE:::Found prefix:${prefixId}`);
        return {
          cache: true,
          prefix: cache,
        };
      }

      const prefix = await this.prefixModel.findOne({ id: prefixId }).exec();
      await this.cacheManager.set(
        `prefix:${prefixId}`,
        prefix,
        this.CACHE_TIME,
      );
      this.logger.log(`getPrefixById:::DB:::Found prefix:${prefix}`);
      return {
        cache: false,
        prefix,
      };
    } catch (err) {
      this.logger.error(`getPrefixById:::${err}`);
      return null;
    }
  }

  async findAllPrefix(): Promise<PrefixDocument[]> {
    try {
      const prefixes = await this.prefixModel.find();
      this.logger.log(`getAllPrefix:::Found ${prefixes.length} prefixes`);
      return prefixes;
    } catch (err) {
      this.logger.error(`getAllPrefix:::${err}`);
      return null;
    }
  }

  /* DeletedItem model
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	------------------------------------------------------------------
	*/

  async createDeletedItem(
    className: string,
    item: any,
  ): Promise<DeletedItemDocument> {
    try {
      const deletedItem = this.deletedItemModel.create({
        className,
        item: JSON.stringify(item),
      });

      this.logger.log(
        `createDeletedItem:::Created new deletedItem for ${className}:${item}`,
      );
      return deletedItem;
    } catch (err) {
      this.logger.error(`createDeletedItem:::${err}`);
      return null;
    }
  }

  async getDeltedItemById(
    id: string,
  ): Promise<ForumDocument | ThreadDocument | MessageDocument> {
    try {
      const deletedItem = await this.deletedItemModel.findById(id).exec();
      this.logger.log(`getDeltedItemById:::Found deletedItem:${deletedItem}`);

      switch (deletedItem.className) {
        case 'Forum':
          const forum: ForumDocument = JSON.parse(deletedItem.item);
          return forum;

        case 'Thread':
          const thread: ThreadDocument = JSON.parse(deletedItem.item);
          return thread;

        case 'Message':
          const message: MessageDocument = JSON.parse(deletedItem.item);
          return message;

        default:
          return null;
      }
    } catch (err) {
      this.logger.error(`getDeltedItemById:::${err}`);
      return null;
    }
  }
}
