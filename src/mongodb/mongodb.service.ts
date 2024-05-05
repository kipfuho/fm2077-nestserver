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
import { ProfilePosting, ProfilePostingDocument } from './schema/profileposting.schema';
import { Report, ReportDocument } from './schema/report.schema';
import { DeletedItem, DeletedItemDocument } from './schema/deleted.schema';
import { FilterOptions } from 'src/interface/filter.type';

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
		@InjectModel(ProfilePosting.name) private readonly profilepostingModel: Model<ProfilePosting>,
		@InjectModel(Report.name) private readonly reportModel: Model<Report>,
		@InjectModel(DeletedItem.name) private readonly deletedItemModel: Model<DeletedItem>,
		@Inject(CACHE_MANAGER) private readonly cacheManager: RedisCache,
		private readonly mailService: MailService
	) {}

	private readonly logger = new Logger(MongodbService.name);
  private readonly CACHE_TIME = 60*1000; // 10 minutes
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

	async getMetadata(): Promise<[number, number, number, string]> {
		try {
			const [
				threadCount, 
				messageCount, 
				memberCount, 
				lastMember
			] = await Promise.all([
				this.threadModel.countDocuments().exec(), 
				this.messageModel.countDocuments().exec(), 
				this.userModel.countDocuments().exec(), 
				this.userModel.findOne().sort({ create_time: -1}).exec()
			]);
			return [threadCount, messageCount, memberCount, lastMember.username];
		} catch(err) {
			this.logger.error("getMetadata:::", err);
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

	async createUser(
		username: string,
		email: string,
		password: string
	): Promise<UserDocument> {
		try {
			const [check1, check2] = await Promise.all([this.findUserByName(username), this.findUserByName(email)])
			if(check1 || check2) {
				this.logger.log("createUser:::Username or email exist");
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
				}
			});
			this.logger.log(`createUser:::Created a new user, id:${user._id.toHexString()}`);
			// create alert for email verification
			await this.createAlert(
				user._id.toHexString(),
				"Verify your email for full permission"
			);
			return user;
		} catch(err) {
			this.logger.error("createUser:::", err);
			return null;
		}
	}

	// Will also cache to redis
	async findUserById(
		id: string
	): Promise<{
		cache: boolean, 
		user: UserDocument
	}> {
		try {
			const cache: UserDocument = await this.cacheManager.get(`user:${id}`);
			if(cache) {
				this.logger.log(`findUserById:::CACHE:::Found user:${id}`);
				return {cache: true, user: cache};
			}

			const user = await this.userModel.findById(id).exec();
			if(user) {
				await this.cacheManager.set(`user:${user._id.toHexString()}`, user.toObject(), this.CACHE_TIME);
			}
			this.logger.log(`findUserById:::DB:::Found user:${user}`);
			return {cache: false, user: user};
		} catch(err) {
			this.logger.error("findUserById:::", err);
			return null;
		}
	}

	// identity can be either username or email
	async findUserByName(identity: string): Promise<UserDocument> {
		try {
			const user = await this.userModel.findOne({
				$or: [
					{username: identity},
					{email: identity}
				]
			}).exec();
			this.logger.log(`findUserByName:::DB:::Found user:${user}`);
			return user;
		} catch(err) {
			this.logger.error("findUserByName:::", err);
			return null;
		}
	}

	async findAllUser(): Promise<UserDocument[]> {
		return await this.userModel.find().exec();
	}

	async filterUserByUsername(usernamePart: string): Promise<UserDocument[]> {
		try {
			const users = this.userModel.find({username: {$regex: `^${usernamePart}`, $options: 'i'}}).limit(10);
			this.logger.log(`filterUserByUsername:::Found users:${users}`);
			return users;
		} catch(err) {
			this.logger.error(`filterUserByUsername:::${err}`);
			return null;
		}
	}

	async editUsernameUser(
		userId: string,
		password: string,
		username: string
	): Promise<UserDocument> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("editUsernameUser:::User not found");
				return null;
			}
			if(userData.user.password !== password) {
				this.logger.log("editUsernameUser:::Password not match");
				return null;
			}

			const user = await this.userModel.findByIdAndUpdate(userId, {$set: {username: username}}, {new: true}).exec();
			if(userData.cache) {
				this.cacheManager.set(`user:${userId}`, user, this.CACHE_TIME);
			}
			this.logger.log(`editUsernameUser:::Updated username of user:${userId}`);
			return user;
		} catch(err) {
			this.logger.error(`editUsernameUser:::${err}`);
			return null;
		}
	}

	async editEmailUser(
		userId: string,
		password: string,
		email: string
	): Promise<UserDocument> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("editEmailUser:::User not found");
				return null;
			}
			if(userData.user.password !== password) {
				this.logger.log("editEmailUser:::Password not match");
				return null;
			}

			const user = await this.userModel.findByIdAndUpdate(userId, {$set: {email: email}}, {new: true}).exec();
			if(userData.cache) {
				this.cacheManager.set(`user:${userId}`, user, this.CACHE_TIME);
			}
			this.logger.log(`editEmailUser:::Updated email of user:${userId}`);
			return user;
		} catch(err) {
			this.logger.error("editEmailUser:::", err);
			return null;
		}
	}

	async editUserSetting(
		userId: string,
		password: string,
		avatar?: string,
		dob?: Date,
		location?: string,
		about?: string
	): Promise<UserDocument> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("editUserSetting:::User not found");
				return null;
			}
			if(userData.user.password !== password) {
				this.logger.log("editUserSetting:::Password not match");
				return null;
			}

			const updatedUser = await this.userModel.findByIdAndUpdate(userId, {$set: 
				{
					avatar: avatar ? avatar : userData.user.avatar, 
					setting: {
						date_of_birth: dob ? dob : userData.user.setting.date_of_birth,
						location: location ? location : userData.user.setting.location,
						about: about ? about : userData.user.setting.about,
						...userData.user.setting
					}
				}
			}, {new: true}).exec();

			if(userData.cache) {
				this.cacheManager.set(`user:${userId}`, updatedUser, this.CACHE_TIME);
			}
			this.logger.log(`editUserSetting:::Updated information of user:${userId}`);
			return updatedUser;
		} catch(err) {
			this.logger.error(`editUserSetting:::${err}`);
			return null;
		}
	}

	async editPasswordUser(
		userId: string,
		oldPassword: string,
		password: string
	): Promise<UserDocument> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("editPasswordUser:::User not found");
				return null;
			}

			if(userData.user.password !== oldPassword) {
				this.logger.log("editPasswordUser:::Password not match");
				return null;
			}

			const user = await this.userModel.findByIdAndUpdate(userId, {$set: {password: password}}, {new: true}).exec();
			if(userData.cache) {
				this.cacheManager.set(`user:${userId}`, user, this.CACHE_TIME);
			}
			this.logger.log(`editPasswordUser:::Updated password of user:${userId}`);
			return user;
		} catch(err) {
			this.logger.error(`editPasswordUser:::${err}`);
			return null;
		}
	}

	async createVerifyCode(userId: string): Promise<string> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("createVerifyCode:::User not found");
				return null;
			}
			if(userData.user.class > 0) {
				this.logger.log("createVerifyCode:::User email has been verified");
				return null;
			}
			
			const code = SHA256(userId).toString(enc.Hex);
			await this.cacheManager.set(`user:${userId}:verifyCode`, code, 30*60000); // 30 minutes
			this.mailService.sendUserConfirmation(userData.user, code);
			this.logger.log("createVerifyCode:::Created verify code");
			return code;
		} catch(err) {
			this.logger.error(`createVerifyCode:::${err}`);
			return null;
		}
	}

	async verifyEmail(
		userId: string,
		code: string
	): Promise<UserDocument> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("verifyEmail:::User not found");
				return null;
			}

			const cacheCode = await this.cacheManager.get(`user:${userId}:verifyCode`);
			if(cacheCode !== code) {
				this.logger.log("verifyEmail:::Code not match");
				return null;
			}

			const user = await this.userModel.findByIdAndUpdate(userId, {$set: {class: 1}}, {new: true}).exec();
			await Promise.all([
				this.cacheManager.set(`user:${userId}`, user, this.CACHE_TIME),
				this.cacheManager.del(`user:${userId}:verifyCode`)
			]);
			
			return user;
		} catch(err) {
			this.logger.error("verifyEmail:::", err);
			return null;
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
		title:string,
		about: string
	): Promise<CategoryDocument> {
		try {
			const category = await this.categoryModel.create({
				name,
				title,
				about,
				forums: []
			});
			this.logger.log(`createCategory:::Created new category, id=${category._id.toHexString()}`);
			return category;
		} catch(err) {
			this.logger.error("createCategory:::", err);
			return null;
		}
	}

	// Will also cache to redis
	async findCategoryById(
		id: string
	): Promise<{
		cache: boolean,
		category: CategoryDocument
	}> {
		try {
			const cache: CategoryDocument = await this.cacheManager.get(`category:${id}`);
			if(cache) {
				this.logger.log(`findCategoryById:::CACHE:::Found category:${id}`);
				return {cache: true, category: cache};
			}

			const category = await this.categoryModel.findById(id).exec();
			if(category) {
				await this.cacheManager.set(`category:${id}`, category.toObject(), this.CACHE_TIME);
			}
			this.logger.log(`findCategoryById:::DB:::Found category:${category}`);
			return {cache: false, category};
		} catch(err) {
			this.logger.error("findCategoryById:::", err);
			return null;
		}
	}

	async findAllCategory(): Promise<CategoryDocument[]> {
		try {
			const categories = await this.categoryModel.find().exec();
			this.logger.log("findAllCategory:::DB:::Found all categories");
			return categories;
		} catch(err) {
			this.logger.error("findAllCategory:::", err);
			return null;
		}
	}

	async addForumToCategory(
		categoryId: string,
		forumId: string
	): Promise<CategoryDocument> {
		try {
			const [forumData, categoryData] = await Promise.all([
				this.findForumById(forumId), 
				this.findCategoryById(categoryId)
			]);
			if(!forumData.forum || !categoryData.category) {
				this.logger.log("addForumToCategory:::Category or forum not found");
				return null;
			}
			const category = await this.categoryModel.findByIdAndUpdate(categoryId, {$push: {forums: forumId}}, {new: true}).exec();
			this.logger.log(`addForumToCategory:::Added forum:${forumId} to category:${categoryId}`);
			return category;
		} catch(err) {
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

	async createForum(
		name: string,
		about: string
	): Promise<ForumDocument> {
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
					delete: 3
				},
			});
			this.logger.log(`createForum:::Created a new forum, id=${forum._id.toHexString()}`);
			return forum;
		} catch(err) {
			this.logger.error("createForum:::", err);
			return null;
		}
	}

	// Will also cache
	async findForumById(
		forumId: string
	): Promise<{
		cache: boolean,
		forum: ForumDocument
	}> {
		try {
			const cache: ForumDocument = await this.cacheManager.get(`forum:${forumId}`);
			if(cache) {
				this.logger.log(`findForumById:::CACHE:::Found forum:${forumId}`);
				return {cache: true, forum: cache};
			}

			const forum = await this.forumModel.findById(forumId).exec();
			if(forum) {
				await this.cacheManager.set(`forum:${forumId}`, forum, this.CACHE_TIME);
			}
			this.logger.log(`findForumById:::DB:::Found forum:${forum}`);
			return {cache: false, forum: forum};
		} catch(err) {
			this.logger.error("findForumById:::", err);
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
		title: string,
		tag: Tag[]
	): Promise<ThreadDocument> {
		try {
			const [forumData, userData] = await Promise.all([
				this.findForumById(forumId), 
				this.findUserById(userId)
			]);
			if(!userData || !userData.user || !forumData || !forumData.forum) {
				this.logger.log("createThread:::Forum or user not found");
				return null;
			}

			const time = new Date();
			const thread = await this.threadModel.create({
				forum: forumId,
				user: userId,
				title,
				tag,
				create_time: time,
				update_time: time,
				replies: 0,
				views: 0,
				privilege: forumData.forum.privilege
			});

			const forum = await this.forumModel.findByIdAndUpdate(forumId, {$inc: {threads: 1}}, {new: true}).exec();
			if(forumData.cache) {
				this.cacheManager.set(`forum:${forumId}`, forum);
			}

			this.logger.log(`createThread:::Created a new thread, id=${thread._id.toHexString()}`);
			// populate alert for followers
			userData.user.followers.forEach(follower => {
				this.createAlert(follower, `<user>${userId}</user> posted a new thread <thread>${thread._id}</thread>`)
			});
			return thread;
		} catch(err) {
			this.logger.error("createThread:::", err);
			return null;
		}
	}

	// Might remove this
	async addExistTagToThread(
		threadId: string,
		tagId: string
	): Promise<ThreadDocument> {
		try {
			const [thread, tag] = await Promise.all([this.findThreadById(threadId), this.findTagById(tagId)]);
			if(!thread || !thread.thread || !tag || !tag.tag) {
				this.logger.log("addExistTagToThread:::Thread or tag not found");
				return null;
			}
			this.logger.log(`addExistTagToThread:::Added tag:${tagId} to thread:${threadId}`);
			return await this.threadModel.findByIdAndUpdate(threadId, {$push: {tag: tag.tag}}, {new: true}).exec();
		} catch(err) {
			this.logger.error("addExistTagToThread:::", err);
			return null;
		}
	}

	async addNewTagToThread(
		threadId: string,
		tagName: string
	): Promise<ThreadDocument> {
		try {
			const thread = await this.findThreadById(threadId);
			if(!thread || !thread.thread) {
				this.logger.log("addNewTagToThread:::Thread not found");
				return null;
			}
			this.logger.log(`addNewTagToThread:::Added tag:${tagName} to thread:${threadId}`);
			return await this.threadModel.findByIdAndUpdate(threadId, {$push: {tag: new Tag(tagName, "#cecece")}}, {new: true}).exec();
		} catch(err) {
			this.logger.error("addNewTagToThread:::", err);
			return null;
		}
	}

	// Will also cache to redis
	async findThreadById(
		threadId: string,
		incre: boolean = false
	): Promise<{
		cache: boolean,
		thread: ThreadDocument
	}> {
		try {
			const cache: ThreadDocument = await this.cacheManager.get(`thread:${threadId}`);
			if(cache) {
				if(incre) {
					cache.views++;
					this.threadModel.updateOne({_id: threadId}, {$inc: {views: 1}}).exec();
					await this.cacheManager.set(`thread:${threadId}`, cache, this.CACHE_TIME);
				}
				this.logger.log(`findThreadById:::CACHE:::Found thread:${threadId}`);
				return {cache: true, thread: cache};
			}

			if(incre) {
				const thread = await this.threadModel.findByIdAndUpdate(threadId, {$inc: {views: 1}}).exec();
				if(thread) {
					await this.cacheManager.set(`thread:${threadId}`, thread.toObject(), this.CACHE_TIME);
				}
				this.logger.log(`findThreadById:::DB:::Found thread:${thread}`);
				return {cache: false, thread: thread};
			} else {
				const thread = await this.threadModel.findById(threadId).exec();
				if(thread) {
					await this.cacheManager.set(`thread:${threadId}`, thread.toObject(), this.CACHE_TIME);
				}
				this.logger.log(`findThreadById:::DB:::Found thread:${thread}`);
				return {cache: false, thread: thread};
			}
		} catch(err) {
			this.logger.error("findThreadById:::", err);
			return null;
		}
	}

	// find by offset and limit
	// return limit thread with lastest create_time
	async findThreads(
		forumId: string,
		offset: number,
		limit: number
	): Promise<ThreadDocument[]> {
		try {
			const threads = await this.threadModel.find({forum: forumId}).sort({_id: -1}).skip(offset).limit(limit).exec();
			this.logger.log(`findThread:::DB:::Found threads:${threads}`);
			return threads;
		} catch(err) {
			this.logger.error("findThread:::", err);
			return null;
		}
	}

	// find thread of user
	// return thread with lastest create_time
	async findThreadOfUser(
		userId: string,
		current: string,
		limit: number
	): Promise<ThreadDocument[]> {
		try {
			let threads: ThreadDocument[];
			if(current) {
				threads = (await this.threadModel.find({user: userId, _id: {$lt: current}}).limit(limit).exec()).reverse();
			} else {
				threads = await this.threadModel.find({user: userId}).sort({_id: -1}).limit(limit).exec();
			}
			this.logger.log(`findThreadOfUser:::DB:::Found threads:${threads}`);
			return threads;
		} catch(err) {
			this.logger.error("findThreadOfUser:::", err);
			return null;
		}
	}

	async findLastestThread(
		forumId: string
	): Promise<ThreadDocument> {
		try {
			const cache: ThreadDocument = await this.cacheManager.get(`forum:${forumId}:lastestThread`);
			if(cache) {
				this.logger.log(`findLastestThread:::CACHE:::Found lastest thread:${cache._id} of forum:${forumId}`);
				return cache;
			}

			const thread = await this.threadModel.findOne({forum: forumId}).sort({_id: -1}).exec();
			if(thread) {
				await this.cacheManager.set(`forum:${forumId}:lastestThread`, thread, this.CACHE_TIME);
			}
			this.logger.log(`findLastestThread:::DB:::Found lastest thread:${thread?._id.toHexString()} of forum:${forumId}`);
			return thread?.toObject();
		} catch(err) {
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
		filterOptions: FilterOptions
	): Promise<{
		count: number,
		threads: ThreadDocument[]
	}> {
		try {
			const filters: any = {forum: forumId};
			if(filterOptions.prefix) {
				filters.prefix = {$all: filterOptions.prefix};
			}
			if(filterOptions.author) {
				filters.user = filterOptions.author;
			}
			if(filterOptions.last_update_within) {
				filters.update_time = {$gt: filterOptions.last_update_within};
			}

			const [threads, totalDocuments] = await Promise.all([
				this.threadModel
					.find(filters)
					.sort({[`${filterOptions.sort_type}`]: filterOptions.descending ? -1 : 1})
					.skip(offset)
					.limit(limit)
					.exec(),
				this.threadModel
					.find(filters)
					.countDocuments()
					.exec()
			]);
			
			this.logger.log(`filterThread:::Found threads:${threads}`);
			return {
				count: totalDocuments,
				threads
			};
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async editThread(
		threadId: string,
		threadPrefix: string = "",
		threadTitle: string,
		threadContent: string,
		tag: Tag[]
	): Promise<ThreadDocument> {
		try {
			const time = new Date();
			const thread = await this.threadModel.findByIdAndUpdate(threadId, {title: threadTitle, update_time: time, tag: tag}, {new: true}).exec();
			if(threadContent) {
				await this.messageModel.updateOne({thread: threadId}, {content: threadContent, update_time: time}).exec();
			}
			this.logger.log(`editThread:::Updated thread, id=${threadId}`);
			return thread;
		} catch(err) {
			this.logger.error("editThread:::", err);
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
		attachments?: string[]
	): Promise<MessageDocument> {
		try {
			const [threadData, userData] = await Promise.all([this.findThreadById(threadId), this.findUserById(userId)]);
			if(!threadData || !threadData.thread || !userData || !userData.user) {
				this.logger.log("createMessage:::Thread or user not found");
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
					angry: 0
				},
				threadPage: new Map<number, number>()
			});
			await Promise.all([
				this.forumModel.updateOne({_id: threadData.thread.forum}, {$inc: {messages: 1}}).exec(), 
				this.threadModel.updateOne({_id: threadId}, {$inc: {replies: 1}}).exec(),
				this.userModel.updateOne({_id: userData.user._id}, {$inc: {messages: 1}}).exec()
			]);
			this.logger.log(`createMessage:::Created new message, id=${message._id.toHexString()}`);
			return message;
		} catch(err) {
			this.logger.error("createMessage:::", err);
			return null;
		}
	}

	// Will also cache to redis
	async findMessageById(
		messageId: string
	): Promise<{
		cache: boolean,
		message: MessageDocument
	}> {
		try {
			const cache: MessageDocument = await this.cacheManager.get(`message:${messageId}`);
			if(cache) {
				this.logger.log(`findMessageById:::CACHE:::Found message:${messageId}`);
				return {cache: true, message: cache};
			}

			const message = await this.messageModel.findById(messageId).exec();
			if(message) {
				await this.cacheManager.set(`message:${messageId}`, message.toObject(), this.CACHE_TIME);
			}
			this.logger.log(`findMessageById:::DB:::Found message:${message}`);
			return {cache: false, message: message};
		} catch(err) {
			this.logger.error("findMessageById:::", err);
			return null;
		}
	}

	async findLastestMessage(threadId: string | Types.ObjectId): Promise<MessageDocument> {
		try {
			const _threadId = (typeof threadId === 'string') ? threadId : threadId.toHexString();
			const message = await this.messageModel.findOne({thread: _threadId}).sort({create_time: -1}).exec();
			this.logger.log(`findLastestMessage:::DB:::Found lastest message:${message}`);
			return message;
		} catch(err) {
			this.logger.error("findLastestMessage:::", err);
			return null;
		}
	}

	async findAllMessage() {
		return await this.messageModel.find().exec();
	}

	async findMessages(
		threadId: string,
		offset: number,
		limit: number
	): Promise<MessageDocument[]> {
		try {
			const messages = await this.messageModel.find({thread: threadId}).skip(offset).limit(limit).exec();
			// update threadPage if needed
			if(offset % limit === 0) {
				const page = offset / limit + 1;
				await Promise.all([messages.map(async (message) => {
					if(message.threadPage[limit] !== page) {
						message.threadPage.set(limit, page)
						await message.save();
					}
					return true;
				})]);
			}
			this.logger.log(`findMessage:::DB:::Found messages:${messages}`);
			return messages;
		} catch(err) {
			this.logger.error(`findMessage:::${err}`);
			return null;
		}
	}

	// find by _id
	async findMessageOfUser(
		userId: string,
		current: string,
		limit: number
	): Promise<MessageDocument[]> {
		try {
			let messages: MessageDocument[];
			if(current) {
				messages = await this.messageModel.find({user: userId, _id: {$lt: current}}).limit(limit).exec();
			} else {
				messages = await this.messageModel.find({user: userId}).sort({create_time: -1}).limit(limit).exec();
			}
			this.logger.log(`findMessageOfUser:::DB:::Found messages:${messages}`);
			return messages;
		} catch(err) {
			this.logger.error("findMessageOfUser:::", err);
			return null;
		}
	}

	async editMessage(
		messageId: string,
		content: string
	): Promise<MessageDocument> {
		try {
			const message = this.messageModel.findByIdAndUpdate(messageId, {content: content}, {new: true}).exec();
			this.logger.log(`editMessage:::Updated message, id=${messageId}`);
			return message;
		} catch(err) {
			this.logger.error("editMessage:::", err);
			return null;
		}
	}

	async addAttachment(
		messageId: string,
		attachments: string[]
	): Promise<MessageDocument> {
		try {
			const messageData = await this.findMessageById(messageId);
			if(!messageData || !messageData.message) {
				this.logger.log("addAttachment:::Message not found");
				return null;
			}

			const message = messageData.message;
			if(message.attachments.length === 0) {
				message.attachments = attachments;
				await Promise.all([
					this.messageModel.updateOne({_id: messageId}, {$set: {attachments: attachments}}).exec(),
					this.cacheManager.set(`message:${messageId}`, message, this.CACHE_TIME)
				]);
				return message;
			} else {
				message.attachments.push(...attachments);
				await Promise.all([
					this.messageModel.updateOne({_id: messageId}, {$push: {attachments: attachments}}).exec(),
					this.cacheManager.set(`message:${messageId}`, message, this.CACHE_TIME)
				]);
				return message;
			}
		} catch(err) {
			this.logger.error("addAttachment:::", err);
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

	async createTag(
		name: string,
		color: string
	): Promise<TagDocument> {
		try {
			const tag = await this.tagModel.create({
				name,
				color
			});
			this.logger.log(`createTag:::Created new tag, id=${tag._id.toHexString()}`);
			return tag;
		} catch(err) {
			this.logger.error("createTag:::", err);
			return null;
		}
	}

	// Will also cache to redis
	async findTagById(
		tagId: string
	): Promise<{
		cache: boolean,
		tag: TagDocument
	}> {
		try {
			const cache: TagDocument = await this.cacheManager.get(`tag:${tagId}`);
			if(cache) {
				this.logger.log(`findTagById:::CACHE:::Found tag:${tagId}`);
				return {cache: true, tag: cache};
			}

			const tag = await this.tagModel.findById(tagId).exec();
			if(tag) {
				await this.cacheManager.set(`tag:${tagId}`, tag, this.CACHE_TIME);
			}
			this.logger.log(`findTagById:::DB:::Found tag:${tag}`);
			return {cache: false, tag: tag};
		} catch(err) {
			this.logger.error("findTagById:::", err);
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
		type: string
	): Promise<ReactionDocument> {
		try {
			const time = new Date();
			const reaction = await this.reactionModel.create({
				message: messageId,
				user: userId,
				type,
				create_time: time
			});
			this.logger.log(`createReaction:::Created new reaction, id=${reaction._id.toHexString()}`);
			return reaction;
		} catch(err) {
			this.logger.error(`createReaction:::${err}`);
			return null;
		}
	}

	async getReactionById(
		reactionId: string
	): Promise<{
		cache: boolean,
		reaction: ReactionDocument
	}> {
		try {
			const cache: ReactionDocument = await this.cacheManager.get(`reaction:${reactionId}`);
			if(cache) {
				this.logger.log(`getReactionById:::CACHE:::Found reaction:${reactionId}`);
				return {cache: true, reaction: cache};
			}

			const reaction = await this.reactionModel.findById(reactionId).exec();
			if(reaction) {
				await this.cacheManager.set(`reaction:${reactionId}`, reaction, this.CACHE_TIME);
			}
			this.logger.log(`getReactionById:::DB:::Found reaction:${reaction}`);
			return {cache: false, reaction: reaction};
		} catch(err) {
			this.logger.error(`getReactionById:::${err}`);
			return null;
		}
	}

	async getReaction(
		userId: string,
		messageId: string
	): Promise<ReactionDocument> {
		try {
			const reaction = await this.reactionModel.findOne({user: userId, message: messageId});
			this.logger.log(`getReaction:::DB:::Found reaction:${reaction}`);
			return reaction;
		} catch(err) {
			this.logger.error(`getReaction:::${err}`);
			return null;
		}
	}

	async getReactionsOfMessage(
		messageId: string,
		current: string = null,
		limit: number = 3
	): Promise<Array<{reaction: ReactionDocument, user: any}>> {
		try {
			const messageData = await this.findMessageById(messageId);
			if(!messageData || !messageData.message) {
				this.logger.log("Message not found");
				return null;
			}

			let reactions: ReactionDocument[];
			if(current) {
				reactions = await this.reactionModel.find({message: messageId}, {_id: {$lt: current}}).limit(limit).exec();
			} else {
				reactions = await this.reactionModel.find({message: messageId}).sort({create_time: -1}).limit(limit).exec();
			}
			this.logger.log(`getReactionsOfMessage:::DB:::Found reactions:${reactions}`);
			
			let result: Array<{reaction: ReactionDocument, user: any}> = [];
			await Promise.all(reactions.map(async (reaction) => {
				let userData = await this.findUserById(reaction.user);
				if(!userData || !userData.user) {
					this.logger.log(`getReactionsOfMessage:::User not found`);
				} else {
					if(userData.cache) {
						const { email, password, setting, ...nonSensitive } = userData.user;
						result.push({reaction, user: nonSensitive});
					} else {
						const { email, password, setting, ...nonSensitive } = userData.user.toObject();
						result.push({reaction, user: nonSensitive});
					}
				}
			}))
			this.logger.log(`getReactionsOfMessage:::Found users associated with reactions`);
			return result;
		} catch(err) {
			console.error(`getReactionsOfMessage:::${err}`);
			return null;
		}
	}

	async addReactionToMessage(
		messageId: string,
		userId: string,
		type: string
	): Promise<{
		message: MessageDocument,
		reaction: ReactionDocument
	}> {
		try {
			const [messageData, userData, reaction] = await Promise.all([
				this.findMessageById(messageId), 
				this.findUserById(userId),
				this.reactionModel.findOne({message: messageId, user: userId}).exec()
			]);
			if(!messageData || !messageData.message || !userData || !userData.user) {
				this.logger.log("addReactionToMessage:::User or message not found");
				return null;
			}

			// If user has already reacted the post
			// We can try to change reaction type, or delete it
			const message = messageData.message;
			if(reaction) {
				// Delete it if of same type
				if(reaction.type === type) {
					message.reactions[type]--;
					const [_1, _2, updatedUser] = await Promise.all([
						this.reactionModel.deleteOne({_id: reaction._id}),
						this.messageModel.updateOne({_id: messageId}, {$inc: {[`reactions.${type}`]: -1}}).exec(),
						this.userModel.findByIdAndUpdate(message.user, {$inc: {likes: -1}}, {new: true}).exec()
					])
					await Promise.all([
						this.cacheManager.set(`message:${messageId}`, message),
						this.cacheManager.set(`user:${updatedUser._id}`, updatedUser, this.CACHE_TIME)
					]);
					this.logger.log("addReactionToMessage:::Deleted duplicated reaction on a message");
					return {
						message: message,
						reaction: null
					};
				} else {
					message.reactions[reaction.type]--;
					message.reactions[type]++;
					reaction.deleteOne()
					const [newReaction, _] = await Promise.all([
						this.createReaction(messageId, userId, type),
						this.messageModel.updateOne({_id: messageId}, {$inc: {[`reactions.${reaction.type}`]: -1, [`reactions.${type}`]: 1}}).exec()
					])
					await this.cacheManager.set(`message:${messageId}`, message);
					this.logger.log("addReactionToMessage:::Changed duplicated reaction on a message");
					return {
						message: message,
						reaction: newReaction
					};
				}
			}

			const newReaction = await this.createReaction(messageId, userId, type);
			this.logger.log(`addReactionToMessage:::Added a ${type} by user:${userId} to message:${messageId}`);

			message.reactions[type]++;
			const [_, updatedUser] = await Promise.all([
				this.messageModel.updateOne({_id: messageId}, {$inc: {[`reactions.${type}`]: 1}}).exec(),
				this.userModel.findByIdAndUpdate(messageData.message.user, {$inc: {likes: 1}}).exec()
			]);
			await Promise.all([
				this.cacheManager.set(`message:${messageId}`, message, this.CACHE_TIME),
				this.cacheManager.set(`user:${updatedUser._id}`, updatedUser)
			]);
			return {
				message: message,
				reaction: newReaction
			};
		} catch(err) {
			this.logger.error("addReactionToMessage:::", err);
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

	async createAlert(
		userId: string,
		detail: string
	): Promise<AlertDocument> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("createAlert:::User not found");
				return null;
			}
			const time = new Date();
			const alert = await this.alertModel.create({
				user: userId,
				detail,
				read: false,
				create_time: time
			});
			this.logger.log(`createAlert:::Created new alert, id=${alert._id}`);
			return alert;
		} catch(err) {
			this.logger.error("createAlert:::", err);
			return null;
		}
	}

	async findAlertById(
		alertId: string
	): Promise<{
		cache: boolean,
		alert: AlertDocument
	}> {
		try {
			const cache: AlertDocument = await this.cacheManager.get(`alert:${alertId}`);
			if(cache) {
				this.logger.log(`findAlertById:::CACHE:::Found alert:${alertId}`);
				return {
					cache: true,
					alert: cache
				};
			}

			const alert = await this.alertModel.findById(alertId).exec();
			if(alert) {
				await this.cacheManager.set(`alert:${alertId}`, alert, this.CACHE_TIME);
			}
			this.logger.log(`findAlertById:::DB:::Found alert:${alert}`);
			return {
				cache: false,
				alert: alert
			};
		} catch(err) {
			this.logger.error("findAlertById:::", err);
			return null;
		}
	}

	async findAlerts(
		userId: string,
		current: string,
		limit: number
	): Promise<AlertDocument[]> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("User not found");
				return null;
			}

			let alerts: AlertDocument[];
			if(current) {
				alerts = await this.alertModel.find({user: userId}, {_id: {$lt: current}}).limit(limit).exec();
			} else {
				alerts = await this.alertModel.find({user: userId}).sort({create_time: -1}).limit(limit).exec();
			}
			this.logger.log(`findAlerts:::Found alerts, ${alerts}`);
			return alerts;
		} catch(err) {
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
		detail: string
	): Promise<BookmarkDocument> {
		try {
			const [messageData, userData] = await Promise.all([
				this.findMessageById(messageId),
				this.findUserById(userId)
			]);
			if(!userData || !userData.user || !messageData || !messageData.message) {
				this.logger.log("createBookmark:::User or thread not found");
				return null;
			}
			const time = new Date();
			const bookmark = await this.bookmarkModel.create({
				message: messageId,
				thread: messageData.message.thread,
				user: userId,
				detail,
				create_time: time
			});
			this.logger.log(`createBookmark:::Created new bookmark, id=${bookmark._id}`);
			return bookmark;
		} catch(err) {
			this.logger.error("createBookmark:::", err);
			return null;
		}
	}

	async findBookmarkById(
		bookmarkId: string
	): Promise<{
		cache: boolean,
		bookmark: BookmarkDocument
	}> {
		try {
			const cache: BookmarkDocument = await this.cacheManager.get(`bookmark:${bookmarkId}`);
			if(cache) {
				this.logger.log(`findBookmarkById:::CACHE:::Found bookmark:${bookmarkId}`);
				return {
					cache: true,
					bookmark: cache
				};
			}

			const bookmark = await this.bookmarkModel.findById(bookmarkId).exec();
			if(bookmark) {
				await this.cacheManager.set(`bookmark:${bookmarkId}`, bookmark, this.CACHE_TIME);
			}
			this.logger.log(`findBookmarkById:::DB:::Found bookmark:${bookmark}`);
			return {
				cache: false,
				bookmark: bookmark,
			};
		} catch(err) {
			this.logger.error("findBookmarkById:::", err);
			return null;
		}
	}

	async findBookmarkOfUser(
		userId: string,
		current: string,
		limit: number
	): Promise<BookmarkDocument[]> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("findBookmark:::User not found");
				return null;
			}

			let bookmarks: BookmarkDocument[];
			if(current) {
				bookmarks = (await this.bookmarkModel.find({user: userId, _id: {$lt: current}}).limit(limit).exec()).reverse();
			} else {
				bookmarks = await this.bookmarkModel.find({user: userId}).sort({_id: -1}).limit(limit).exec();
			}
			this.logger.log(`findBookmark:::Found bookmarks:${bookmarks}`);
			return bookmarks;
		} catch(err) {
			this.logger.error(`findBookmark:::${err}`);
			return null;
		}
	}

	async findBookmarkOfMessage(
		userId: string,
		messageId: string
	): Promise<BookmarkDocument> {
		try {
			const [messageData, userData] = await Promise.all([
				this.findMessageById(messageId),
				this.findUserById(userId)
			]);
			if(!messageData || !messageData.message || !userData || !userData.user) {
				this.logger.log("findBookmarkOfMessage:::Message or user not found");
				return null;
			}

			const bookmark = await this.bookmarkModel.findOne({user: userId, message: messageId});
			this.logger.log(`findBookmarkOfMessage:::Found bookmark:${bookmark}`);
			return bookmark;
		} catch(err) {
			this.logger.error(`findBookmarkOfMessage:::${err}`);
			return null;
		}
	}

	async updateBookmark(
		bookmarkId: string,
		userId: string,
		detail: string
	): Promise<BookmarkDocument> {
		try {
			const bookmarkData = await this.findBookmarkById(bookmarkId);
			if(!bookmarkData || !bookmarkData.bookmark) {
				this.logger.log("updateBookmark:::Bookmark not found");
				return null;
			}
			if(bookmarkData.bookmark.user !== userId) {
				this.logger.log("updateBookmark:::User not match");
				return null;
			}
			if(bookmarkData.bookmark.detail === detail) {
				this.logger.log("updateBookmark:::No change");
				return bookmarkData.bookmark;
			} 

			const updatedBookmark = await this.bookmarkModel.findByIdAndUpdate(bookmarkId, {$set: {detail: detail}}, {new: true});
			this.logger.log(`updateBookmark:::Updated bookmark:${bookmarkId}`);
			return updatedBookmark;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async deleteBookmark(
		bookmarkId: string,
		userId: string
	): Promise<boolean> {
		try {
			const bookmarkData = await this.findBookmarkById(bookmarkId);
			if(!bookmarkData || !bookmarkData.bookmark) {
				this.logger.log("deleteBookmark:::Bookmark not found");
				return false;
			}
			if(bookmarkData.bookmark.user !== userId) {
				this.logger.log("deleteBookmark:::User not match")
				return false;
			}

			await this.bookmarkModel.deleteOne({_id: bookmarkId});
			this.logger.log(`deleteBookmark:::Deleted bookmark:${bookmarkId}`);
			return true;
		} catch(err) {
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
		score: number
	): Promise<RatingDocument> {
		try {
			const [threadData, userData] = await Promise.all([
				this.findThreadById(threadId),
				this.findUserById(userId)
			]);
			if(!userData || !userData.user || !threadData || !threadData.thread) {
				this.logger.log("createRating:::User or thread not found");
				return null;
			}
			const time = new Date();
			const rating = await this.ratingModel.create({
				thread: threadId,
				user: userId,
				create_time: time,
				score: score
			});
			this.logger.log(`createRating:::Created new rating, id=${rating._id}`);
			return rating;
		} catch(err) {
			this.logger.error("createRating:::", err);
			return null;
		}
	}

	async findRatingById(
		ratingId: string
	): Promise<{
		cache: boolean,
		rating: RatingDocument
	}> {
		try {
			const cache: RatingDocument = await this.cacheManager.get(`rating:${ratingId}`);
			if(cache) {
				this.logger.log(`findRatingById:::CACHE:::Found rating:${ratingId}`);
				return {
					cache: true,
					rating: cache
				};
			}

			const rating = await this.ratingModel.findById(ratingId).exec();
			if(rating) {
				await this.cacheManager.set(`rating:${ratingId}`, rating, this.CACHE_TIME);
			}
			this.logger.log(`findRatingById:::DB:::Found rating:${rating}`);
			return {
				cache: false,
				rating: rating,
			};
		} catch(err) {
			this.logger.error("findRatingById:::", err);
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
		message: string
	): Promise<ProfilePostingDocument> {
		try {
			const [userData1, userData2] = await Promise.all([
				this.findUserById(userId),
				this.findUserById(userWallId)
			]);
			if(!userData1 || !userData1.user || !userData2 || !userData2.user) {
				this.logger.log("createProfilePosting:::User not found");
				return null;
			}

			const time = new Date();
			const profilePosting = await this.profilepostingModel.create({
				user: userId,
				userWall: userWallId,
				message,
				create_time: time,
			});
			this.logger.log(`createProfilePosting:::Created new rating, id=${profilePosting._id}`);
			return profilePosting;
		} catch(err) {
			this.logger.error("createProfilePosting:::", err);
			return null;
		}
	}

	async findProfilePostingById(
		profilePostingId: string
	): Promise<{
		cache: boolean,
		profileposting: ProfilePostingDocument
	}> {
		try {
			const cache: ProfilePostingDocument = await this.cacheManager.get(`profileposting:${profilePostingId}`);
			if(cache) {
				this.logger.log(`findProfilePostingById:::CACHE:::Found rating:${profilePostingId}`);
				return {
					cache: true,
					profileposting: cache
				};
			}

			const profileposting = await this.profilepostingModel.findById(profilePostingId).exec();
			if(profileposting) {
				await this.cacheManager.set(`profileposting:${profilePostingId}`, profileposting, this.CACHE_TIME);
			}
			this.logger.log(`findProfilePostingById:::DB:::Found profileposting:${profileposting}`);
			return {
				cache: false,
				profileposting: profileposting,
			};
		} catch(err) {
			this.logger.error("findProfilePostingById:::", err);
			return null;
		}
	}

	async findProfilePosting(
		userWallId: string,
		current: string,
		limit: number
	): Promise<ProfilePostingDocument[]> {
		try {
			let postings: ProfilePostingDocument[];
			if(current) {
				postings = await this.profilepostingModel.find({user_wall: userWallId, _id: {$lt: current}}).limit(limit).exec();
			} else {
				postings = await this.profilepostingModel.find({user_wall: userWallId}).sort({create_time: -1}).limit(limit).exec();
			}
			this.logger.log(`findProfilePosting:::Found profile postings of userWall: ${userWallId}`);
			return postings;
		} catch(err) {
			this.logger.error("findProfilePosting:::", err);
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
		detail: string
	): Promise<ReportDocument> {
		try {
			const [messageData, userData] = await Promise.all([
				this.findMessageById(messageId),
				this.findUserById(reporter)
			]);
			if(!userData || !userData.user || !messageData || !messageData.message) {
				this.logger.log("createReport:::User or message not found");
				return null;
			}
			const time = new Date();
			const reportTicket = await this.reportModel.create({
				message: messageId,
				reporter,
				reported: messageData.message.user,
				reason,
				detail,
				create_time: time
			});
			this.logger.log(`createReport:::Created new report ticket, id=${reportTicket._id}`);
			return reportTicket;
		} catch(err) {
			this.logger.error(`createReport:::${err}`);
			return null;
		}
	}

	async findReportById(
		reportId: string
	): Promise<{
		cache: boolean,
		report: ReportDocument
	}> {
		try {
			const cache: ReportDocument = await this.cacheManager.get(`report:${reportId}`);
			if(cache) {
				this.logger.log(`findReportById:::CACHE:::Found rating:${reportId}`);
				return {
					cache: true,
					report: cache
				};
			}

			const report = await this.reportModel.findById(reportId).exec();
			if(report) {
				await this.cacheManager.set(`rating:${reportId}`, report, this.CACHE_TIME);
			}
			this.logger.log(`findReportById:::DB:::Found rating:${report}`);
			return {
				cache: false,
				report: report,
			};
		} catch(err) {
			this.logger.error("findReportById:::", err);
			return null;
		}
	}

	async findReportOfUser(
		userId: string,
		current: string,
		limit: number
	): Promise<ReportDocument[]> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("findReportOfUser:::User not found");
				return null;
			}

			let reports: ReportDocument[];
			if(current) {
				reports = (await this.reportModel.find({reporter: userId, _id: {$lt: current}}).limit(limit)).reverse();
			} else {
				reports = await this.reportModel.find({reporter: userId}).sort({_id: -1}).limit(limit).exec();
			}
			this.logger.log(`findReportOfUser:::Found reports:${reports}`);
			return null;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findReportTargetedUser(
		userId: string,
		limit: number
	): Promise<ReportDocument[]> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("findReportTargetedUser:::User not found");
				return null;
			}
			if(userData.user.class < 3) {
				this.logger.log("findReportTargetedUser:::User is not permitted");
				return null;
			}

			const reports = await this.reportModel.find({reported: userId}).limit(limit);
			this.logger.log(`findReportTargetedUser:Found reports:${reports}`);
			return reports;
		} catch(err) {
			this.logger.error(`findReportTargetedUser:::${err}`);
			return null;
		}
	}

	async checkReportUser(
		messageId: string,
		userId: string
	): Promise<ReportDocument> {
		try {
			const [userData, messageData] = await Promise.all([
				this.findUserById(userId),
				this.findMessageById(messageId)
			]);
			if(!userData || !userData.user || !messageData || !messageData.message) {
				this.logger.log("checkReportUser:::User or message not found");
				return null;
			}

			const report = await this.reportModel.findOne({message: messageId, reporter: userId});
			this.logger.log(`checkReportUser:::Found report:${report}`);
			return report;
		} catch(err) {
			this.logger.error(`checkReportUser:::${err}`);
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
		item: any
	): Promise<DeletedItemDocument> {
		try {
			const deletedItem = this.deletedItemModel.create({
				className,
				item: JSON.stringify(item)
			});

			this.logger.log(`createDeletedItem:::Created new deletedItem for ${className}:${item}`);
			return deletedItem;
		} catch(err) {
			this.logger.error(`createDeletedItem:::${err}`);
			return null;
		}
	}

	async getDeltedItemById(
		id: string
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
		} catch(err) {
			this.logger.error(`getDeltedItemById:::${err}`);
			return null;
		}
	}
}
