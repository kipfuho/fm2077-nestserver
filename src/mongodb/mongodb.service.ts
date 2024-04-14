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
		@Inject(CACHE_MANAGER) private readonly cacheManager: RedisCache
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
				class: 1,
				setting: {
					date_of_birth: null,
					location: null,
					website: null,
					about: null,
					twofa: false,
				}
			});
			this.logger.log(`Created a new user, id:${user._id.toHexString()}`);
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

	async createMessage(threadId: string, userId: string, content: string): Promise<MessageDocument> {
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

	async addReactionToMessage(messageId: string,  userId: string, type: string): Promise<ReactionDocument> {
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
			if(userData.cache)
			return reaction;
		} catch(err) {
			this.logger.error(err);
			return null;
		}
	}

	async removeReactionOfMessage(messageId: string,  userId: string, type: string): Promise<{message: MessageDocument, user: UserDocument}> {
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
			return {message, user};
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
}