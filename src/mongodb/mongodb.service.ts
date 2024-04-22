import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
		@InjectModel(Tag.name) private readonly alertModel: Model<Alert>,
		@InjectModel(Tag.name) private readonly bookmarkModel: Model<Bookmark>,
		@InjectModel(Tag.name) private readonly ratingModel: Model<Rating>,
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
			this.logger.error(err);
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

	async createUser(username: string, email: string, password: string): Promise<UserDocument> {
		try {
			const [check1, check2] = await Promise.all([this.findUserByName(username), this.findUserByName(email)])
			if(check1 || check2) {
				this.logger.log("Username or email exist");
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
			this.logger.log(`Created a new user, id:${user._id.toHexString()}`);
			// create alert for email verification
			await this.createAlert(
				user._id.toHexString(),
				"Verify your email for full permission"
			);
			return user;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	// Will also cache to redis
	async findUserById(id: string): Promise<{cache: boolean, user: UserDocument}> {
		try {
			const cache: UserDocument = await this.cacheManager.get(`user:${id}`);
			if(cache) {
				this.logger.log(`CACHE:::Found user:${id}`);
				return {cache: true, user: cache};
			}

			const user = await this.userModel.findById(id).exec();
			if(user) {
				await this.cacheManager.set(`user:${user._id.toHexString()}`, user.toObject(), this.CACHE_TIME);
			}
			this.logger.log(`DB:::Found user:${user}`);
			return {cache: false, user: user};
		} catch(err) {
			this.logger.error(err);
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
			this.logger.log(`DB:::Found user:${user}`);
			return user;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findAllUser(): Promise<UserDocument[]> {
		return await this.userModel.find().exec();
	}

	async editUsernameUser(userId: string, password: string, username: string): Promise<UserDocument> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("User not found");
				return null;
			}
			if(userData.user.password !== password) {
				this.logger.log("Password not match");
				return null;
			}

			const updatedUser = await this.userModel.findByIdAndUpdate(userId, {$set: {username: username}}, {new: true}).exec();
			if(userData.cache) {
				this.cacheManager.set(`user:${userId}`, updatedUser, this.CACHE_TIME);
			}
			this.logger.log(`Updated username of user:${userId}`);
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async editEmailUser(userId: string, password: string, email: string): Promise<UserDocument> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("User not found");
				return null;
			}
			if(userData.user.password !== password) {
				this.logger.log("Password not match");
				return null;
			}

			const updatedUser = await this.userModel.findByIdAndUpdate(userId, {$set: {email: email}}, {new: true}).exec();
			if(userData.cache) {
				this.cacheManager.set(`user:${userId}`, updatedUser, this.CACHE_TIME);
			}
			this.logger.log(`Updated email of user:${userId}`);
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async editUserSetting(userId: string, password: string, avatar?: string, dob?: Date, location?: string, about?: string): Promise<UserDocument> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("User not found");
				return null;
			}
			if(userData.user.password !== password) {
				this.logger.log("Password not match");
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
			this.logger.log(`Updated information of user:${userId}`);
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async editPasswordUser(userId: string, oldPassword: string, password: string): Promise<UserDocument> {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("User not found");
				return null;
			}

			if(userData.user.password !== oldPassword) {
				this.logger.log("Password not match");
				return null;
			}

			const updatedUser = await this.userModel.findByIdAndUpdate(userId, {$set: {password: password}}, {new: true}).exec();
			if(userData.cache) {
				this.cacheManager.set(`user:${userId}`, updatedUser, this.CACHE_TIME);
			}
			this.logger.log(`Updated password of user:${userId}`);
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async createVerifyCode(userId: string) {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("User not found");
				return null;
			}
			if(userData.user.class > 0) {
				this.logger.log("User email has been verified");
				return null;
			}
			
			const code = SHA256(userId).toString(enc.Hex);
			await this.cacheManager.set(`user:${userId}:verifyCode`, code, 30*60000); // 30 minutes
			this.mailService.sendUserConfirmation(userData.user, code);
			this.logger.log("Created verify code");
			return code;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async verifyEmail(userId: string, code: string) {
		try {
			const userData = await this.findUserById(userId);
			if(!userData || !userData.user) {
				this.logger.log("User not found");
				return null;
			}

			const cacheCode = await this.cacheManager.get(`user:${userId}:verifyCode`);
			if(cacheCode !== code) {
				this.logger.log("Code not match");
				return null;
			}

			const _user = await this.userModel.findByIdAndUpdate(userId, {$set: {class: 1}});
			await Promise.all([
				this.cacheManager.set(`user:${userId}`, _user, this.CACHE_TIME),
				this.cacheManager.del(`user:${userId}:verifyCode`)
			]);
			
			return _user;
		} catch(err) {
			this.logger.error(err);
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

	async createCategory(name: string, title:string, about: string): Promise<CategoryDocument> {
		try {
			const category = await this.categoryModel.create({
				name,
				title,
				about,
				forums: []
			});
			this.logger.log(`Created new category, id=${category._id.toHexString()}`);
			return category;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	// Will also cache to redis
	async findCategoryById(id: string): Promise<{cache: boolean, category: CategoryDocument}> {
		try {
			const cache: CategoryDocument = await this.cacheManager.get(`category:${id}`);
			if(cache) {
				this.logger.log(`CACHE:::Found category:${id}`);
				return {cache: true, category: cache};
			}

			const category = await this.categoryModel.findById(id).exec();
			if(category) {
				await this.cacheManager.set(`category:${id}`, category.toObject(), this.CACHE_TIME);
			}
			this.logger.log(`DB:::Found category:${category}`);
			return {cache: false, category};
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findAllCategory(): Promise<CategoryDocument[]> {
		try {
			const categories = await this.categoryModel.find().exec();
			this.logger.log("DB:::Found all categories");
			return categories;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async addForumToCategory(categoryId: string, forumId: string): Promise<CategoryDocument> {
		try {
			const [forumData, categoryData] = await Promise.all([this.findForumById(forumId), this.findCategoryById(categoryId)]);
			if(!forumData.forum || !categoryData.category) {
				this.logger.log("Category or forum not found");
				return null;
			}
			this.logger.log(`Added forum:${forumId} to category:${categoryId}`);
			return await this.categoryModel.findByIdAndUpdate(categoryId, {$push: {forums: forumId}}, {new: true}).exec();
		} catch(err) {
			this.logger.error(err);
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
				delete: false,
				privilege: {
					view: 1,
					reply: 1,
					upload: 1,
					delete: 3
				},
			});
			this.logger.log(`Created a new forum, id=${forum._id.toHexString()}`);
			return forum;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	// Will also cache
	async findForumById(forumId: string): Promise<{cache: boolean, forum: ForumDocument}> {
		try {
			const cache: ForumDocument = await this.cacheManager.get(`forum:${forumId}`);
			if(cache) {
				this.logger.log(`CACHE:::Found forum:${forumId}`);
				return {cache: true, forum: cache};
			}

			const forum = await this.forumModel.findById(forumId).exec();
			if(forum) {
				await this.cacheManager.set(`forum:${forumId}`, forum, this.CACHE_TIME);
			}
			this.logger.log(`DB:::Found forum:${forum}`);
			return {cache: false, forum: forum};
		} catch(err) {
			this.logger.error(err);
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

	async createThread(forumId: string, userId: string, title: string, tag: Tag[]): Promise<ThreadDocument> {
		try {
			const [forumData, userData] = await Promise.all([this.findForumById(forumId), this.findUserById(userId)]);
			if(!userData || !userData.user || !forumData || !forumData.forum) {
				this.logger.log("Forum or user not found");
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
				delete: false,
				privilege: forumData.forum.privilege
			});
			const forum = await this.forumModel.findByIdAndUpdate(forumId, {$inc: {threads: 1}}, {new: true}).exec();
			if(forumData.cache) {
				this.cacheManager.set(`forum:${forumId}`, forum);
			}
			this.logger.log(`Created a new thread, id=${thread._id.toHexString()}`);
			// populate alert for followers
			userData.user.followers.forEach(follower => {
				this.createAlert(follower, `<user>${userId}</user> posted a new thread <thread>${thread._id}</thread>`)
			});
			return thread;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async addExistTagToThread(threadId: string, tagId: string): Promise<ThreadDocument> {
		try {
			const [thread, tag] = await Promise.all([this.findThreadById(threadId), this.findTagById(tagId)]);
			if(!thread || !thread.thread || !tag || !tag.tag) {
				this.logger.log("Thread or tag not found");
				return null;
			}
			this.logger.log(`Added tag:${tagId} to thread:${threadId}`);
			return await this.threadModel.findByIdAndUpdate(threadId, {$push: {tag: tag.tag}}, {new: true}).exec();
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async addNewTagToThread(threadId: string, tagName: string): Promise<ThreadDocument> {
		try {
			const thread = await this.findThreadById(threadId);
			if(!thread || !thread.thread) {
				this.logger.log("Thread not found");
				return null;
			}
			this.logger.log(`Added tag:${tagName} to thread:${threadId}`);
			return await this.threadModel.findByIdAndUpdate(threadId, {$push: {tag: new Tag(tagName, "#cecece")}}, {new: true}).exec();
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	// Will also cache to redis
	async findThreadById(threadId: string, incre: boolean = false): Promise<{cache: boolean, thread: ThreadDocument}> {
		try {
			const cache: ThreadDocument = await this.cacheManager.get(`thread:${threadId}`);
			if(cache) {
				if(incre) {
					cache.views++;
					await this.cacheManager.set(`thread:${threadId}`, cache, this.CACHE_TIME);
				}
				this.logger.log(`CACHE:::Found thread:${threadId}`);
				return {cache: true, thread: cache};
			}

			if(incre) {
				const thread = await this.threadModel.findByIdAndUpdate(threadId, {$inc: {views: 1}}).exec();
				if(thread) {
					await this.cacheManager.set(`thread:${threadId}`, thread.toObject(), this.CACHE_TIME);
				}
				this.logger.log(`DB:::Found thread:${thread}`);
				return {cache: false, thread: thread};
			} else {
				const thread = await this.threadModel.findById(threadId).exec();
				if(thread) {
					await this.cacheManager.set(`thread:${threadId}`, thread.toObject(), this.CACHE_TIME);
				}
				this.logger.log(`DB:::Found thread:${thread}`);
				return {cache: false, thread: thread};
			}
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findThread(forumId: string, offset: number, limit: number): Promise<ThreadDocument[]> {
		try {
			const threads = await this.threadModel.find({forum: forumId}).skip(offset).limit(limit).exec();
			this.logger.log(`DB:::Found threads:${threads}`);
			return threads;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findLastestThread(forumId: string): Promise<ThreadDocument> {
		try {
			const thread = await this.threadModel.findOne({forum: forumId}).sort({create_time: -1}).exec();
			this.logger.log(`DB:::Found lastest thread:${thread}`);
			return thread;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findAllThread(): Promise<ThreadDocument[]> {
		return await this.threadModel.find().exec();
	}

	async editThread(threadId: string, threadPrefix: string = "", threadTitle: string, threadContent: string, tag: Tag[]): Promise<ThreadDocument> {
		try {
			const time = new Date();
			const thread = await this.threadModel.findByIdAndUpdate(threadId, {title: threadTitle, update_time: time, tag: tag}, {new: true}).exec();
			if(threadContent) {
				await this.messageModel.updateOne({thread: threadId}, {content: threadContent, update_time: time}).exec();
			}
			this.logger.log(`Updated thread, id=${threadId}`);
			return thread;
		} catch(err) {
			this.logger.error(err);
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

	async createMessage(threadId: string, userId: string, content: string, attachments?: string[]): Promise<MessageDocument> {
		try {
			const [threadData, userData] = await Promise.all([this.findThreadById(threadId), this.findUserById(userId)]);
			if(!threadData || !threadData.thread || !userData || !userData.user) {
				this.logger.log("Thread or user not found");
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
					'like': [],
					'love': [],
					'care': [],
					'haha': [],
					'wow': [],
					'sad': [],
					'angry': []
				},
				delete: false
			});
			await Promise.all([
				this.forumModel.updateOne({_id: threadData.thread.forum}, {$inc: {messages: 1}}), 
				this.threadModel.updateOne({_id: threadId}, {$inc: {replies: 1}}),
				this.userModel.updateOne({_id: userData.user._id}, {$inc: {messages: 1}})
			]);
			this.logger.log(`Created new message, id=${message._id.toHexString()}`);
			return message;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	// Will also cache to redis
	async findMessageById(messageId: string): Promise<{cache: boolean, message: MessageDocument}> {
		try {
			const cache: MessageDocument = await this.cacheManager.get(`message:${messageId}`);
			if(cache) {
				this.logger.log(`CACHE:::Found message:${messageId}`);
				return {cache: true, message: cache};
			}

			const message = await this.messageModel.findById(messageId).exec();
			if(message) {
				await this.cacheManager.set(`message:${messageId}`, message.toObject(), this.CACHE_TIME);
			}
			this.logger.log(`DB:::Found message:${message}`);
			return {cache: false, message: message};
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async addReactionToMessage(messageId: string,  userId: string, type: string): Promise<MessageDocument> {
		try {
			const [messageData, userData, reaction] = await Promise.all([
				this.findMessageById(messageId), 
				this.findUserById(userId),
				this.reactionModel.findOne({message: messageId, user: userId}).exec()
			]);
			if(!messageData || !messageData.message || !userData || !userData.user) {
				this.logger.log("User or message not found");
				return null;
			}
			if(reaction) {
				this.logger.log("Duplicate reaction on a message");
				return null;
			}

			const newReaction = await this.createReaction(messageId, userId, type);
			this.logger.log(`Added a ${type} by user:${userId} to message:${messageId}`);
			const [newMessage, newUser] = await Promise.all([
				this.messageModel.findByIdAndUpdate(messageId, {$push: {[`reactions.${type}`]: newReaction._id.toHexString()}}, {new: true}).exec(), 
				this.userModel.updateOne({_id: messageData.message.user}, {$inc: {likes: 1}}).exec()
			]);
			await Promise.all([
				this.cacheManager.set(`message:${messageId}`, newMessage, this.CACHE_TIME),
				this.cacheManager.set(`user:${messageData.message.user}`, newUser)
			]);
			return newMessage;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async removeReactionOfMessage(messageId: string,  userId: string): Promise<MessageDocument> {
		try {
			const [messageData, userData, reaction] = await Promise.all([
				this.findMessageById(messageId), 
				this.findUserById(userId),
				this.reactionModel.findOne({message: messageId, user: userId}).exec()
			]);
			if(!messageData || !messageData.message || !userData || !userData.user) {
				this.logger.log("Message or User not found");
				return null;
			}
			if(!reaction) {
				this.logger.log("Reaction not found");
				return null;
			}

			const [message, user, _] = await Promise.all([
				this.messageModel.findByIdAndUpdate(messageId, {$pull: {reactions: reaction._id.toHexString()}}, {new: true}).exec(),
				this.userModel.findByIdAndUpdate(messageData.message.user, {$inc: {likes: -1}}, {new: true}).exec(),
				this.reactionModel.deleteOne({_id: reaction._id}).exec()
			]);
			await Promise.all([
				this.cacheManager.set(`message:${messageId}`, message, this.CACHE_TIME),
				this.cacheManager.set(`user:${messageData.message.user}`, user, this.CACHE_TIME)
			]);
			return message;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findLastestMessage(threadId: string): Promise<MessageDocument> {
		try {
			const message = await this.messageModel.findOne({thread: threadId}).sort({create_time: -1}).exec();
			this.logger.log(`DB:::Found lastest message:${message}`);
			return message;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findAllMessage() {
		return await this.messageModel.find().exec();
	}

	async findMessage(threadId: string, offset: number, limit: number): Promise<MessageDocument[]> {
		try {
			const messages = await this.messageModel.find({thread: threadId}).skip(offset).limit(limit).exec();
			this.logger.log(`DB:::Found messages:${messages}`);
			return messages;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async editMessage(messageId: string, content: string): Promise<MessageDocument> {
		try {
			const message = this.messageModel.findByIdAndUpdate(messageId, {content: content}, {new: true}).exec();
			this.logger.log(`Updated message, id=${messageId}`);
			return message;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async addAttachment(messageId: string, attachments: string[]): Promise<MessageDocument> {
		try {
			const messageData = await this.findMessageById(messageId);
			if(!messageData || !messageData.message) {
				this.logger.log("Message not found");
				return null;
			}

			if(messageData.message.attachments.length === 0) {
				const _message =  await this.messageModel.findByIdAndUpdate(messageId, {$set: {attachments: attachments}}, {new: true});
				await this.cacheManager.set(`message:${messageId}`, _message, this.CACHE_TIME);
				return _message;
			} else {
				const _message = await this.messageModel.findByIdAndUpdate(messageId, {$push: {attachments: attachments}}, {new: true});
				await this.cacheManager.set(`message:${messageId}`, _message, this.CACHE_TIME);
				return _message;
			}
		} catch(err) {
			this.logger.error(err);
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
				color
			});
			this.logger.log(`Created new tag, id=${tag._id.toHexString()}`);
			return tag;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	// Will also cache to redis
	async findTagById(tagId: string): Promise<{cache: boolean, tag: TagDocument}> {
		try {
			const cache: TagDocument = await this.cacheManager.get(`tag:${tagId}`);
			if(cache) {
				this.logger.log(`CACHE:::Found tag:${tagId}`);
				return {cache: true, tag: cache};
			}

			const tag = await this.tagModel.findById(tagId).exec();
			if(tag) {
				await this.cacheManager.set(`tag:${tagId}`, tag, this.CACHE_TIME);
			}
			this.logger.log(`DB:::Found tag:${tag}`);
			return {cache: false, tag: tag};
		} catch(err) {
			this.logger.error(err);
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

	async createReaction(messageId: string, userId: string, type: string): Promise<ReactionDocument> {
		try {
			const time = new Date();
			const reaction = await this.reactionModel.create({
				message: messageId,
				user: userId,
				type,
				create_time: time
			});
			this.logger.log(`Created new reaction, id=${reaction._id.toHexString()}`);
			return reaction;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async getReactionById(reactionId: string): Promise<{cache: boolean, reaction: ReactionDocument}> {
		try {
			const cache: ReactionDocument = await this.cacheManager.get(`reaction:${reactionId}`);
			if(cache) {
				this.logger.log(`CACHE:::Found reaction:${reactionId}`);
				return {cache: true, reaction: cache};
			}

			const reaction = await this.reactionModel.findById(reactionId).exec();
			if(reaction) {
				await this.cacheManager.set(`reaction:${reactionId}`, reaction, this.CACHE_TIME);
			}
			this.logger.log(`DB:::Found reaction:${reaction}`);
			return {cache: false, reaction: reaction};
		} catch(err) {
			this.logger.error(err);
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
			if(!userData || !userData.user) {
				this.logger.log("User not found");
				return null;
			}
			const time = new Date();
			const alert = await this.alertModel.create({
				user: userId,
				detail,
				read: false,
				create_time: time
			});
			this.logger.log(`Created new alert, id=${alert._id}`);
			return alert;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findAlertById(alertId: string): Promise<{cache: boolean, alert: AlertDocument}> {
		try {
			const cache: AlertDocument = await this.cacheManager.get(`alert:${alertId}`);
			if(cache) {
				this.logger.log(`CACHE:::Found alert:${alertId}`);
				return {
					cache: true,
					alert: cache
				};
			}

			const alert = await this.alertModel.findById(alertId).exec();
			if(alert) {
				await this.cacheManager.set(`alert:${alertId}`, alert, this.CACHE_TIME);
			}
			this.logger.log(`DB:::Found alert:${alert}`);
			return {
				cache: false,
				alert: alert
			};
		} catch(err) {
			this.logger.error(err);
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

	async createBookmark(threadId: string, userId: string): Promise<BookmarkDocument> {
		try {
			const [threadData, userData] = await Promise.all([
				this.findThreadById(threadId),
				this.findUserById(userId)
			]);
			if(!userData || !userData.user || !threadData || !threadData.thread) {
				this.logger.log("User or thread not found");
				return null;
			}
			const time = new Date();
			const bookmark = await this.bookmarkModel.create({
				thread: threadId,
				user: userId,
				create_time: time
			});
			this.logger.log(`Created new bookmark, id=${bookmark._id}`);
			return bookmark;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findBookmarkById(bookmarkId: string): Promise<{cache: boolean, bookmark: BookmarkDocument}> {
		try {
			const cache: BookmarkDocument = await this.cacheManager.get(`bookmark:${bookmarkId}`);
			if(cache) {
				this.logger.log(`CACHE:::Found bookmark:${bookmarkId}`);
				return {
					cache: true,
					bookmark: cache
				};
			}

			const bookmark = await this.bookmarkModel.findById(bookmarkId).exec();
			if(bookmark) {
				await this.cacheManager.set(`bookmark:${bookmarkId}`, bookmark, this.CACHE_TIME);
			}
			this.logger.log(`DB:::Found bookmark:${bookmark}`);
			return {
				cache: false,
				bookmark: bookmark,
			};
		} catch(err) {
			this.logger.error(err);
			return null;
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

	async createRating(threadId: string, userId: string, score: number): Promise<RatingDocument> {
		try {
			const [threadData, userData] = await Promise.all([
				this.findThreadById(threadId),
				this.findUserById(userId)
			]);
			if(!userData || !userData.user || !threadData || !threadData.thread) {
				this.logger.log("User or thread not found");
				return null;
			}
			const time = new Date();
			const rating = await this.ratingModel.create({
				thread: threadId,
				user: userId,
				create_time: time,
				score: score
			});
			this.logger.log(`Created new rating, id=${rating._id}`);
			return rating;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async findRatingById(ratingId: string): Promise<{cache: boolean, rating: RatingDocument}> {
		try {
			const cache: RatingDocument = await this.cacheManager.get(`rating:${ratingId}`);
			if(cache) {
				this.logger.log(`CACHE:::Found rating:${ratingId}`);
				return {
					cache: true,
					rating: cache
				};
			}

			const rating = await this.ratingModel.findById(ratingId).exec();
			if(rating) {
				await this.cacheManager.set(`rating:${ratingId}`, rating, this.CACHE_TIME);
			}
			this.logger.log(`DB:::Found rating:${rating}`);
			return {
				cache: false,
				rating: rating,
			};
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}
}
