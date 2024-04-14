import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { MongodbService } from './mongodb.service';
import { Public } from 'src/auth/public';
import { enc, SHA256 } from 'crypto-js';
import { TagDocument } from './schema/tag.schema';
import { ForumDocument } from './schema/forum.schema';
import { CategoryDocument } from './schema/category.schema';

@Controller('mongodb')
export class MongodbController {
	constructor(
		private readonly mongodbService: MongodbService,
	) {}

	/* User
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

	@HttpCode(HttpStatus.CREATED)
	@Public()
	@Get("user/create")
	async createUser(@Query("username") username: string, @Query("email") email: string, @Query("password") password: string,) {
		const user = await this.mongodbService.createUser(username, email, SHA256(password).toString(enc.Hex));
		if(!user) {
			throw new HttpException("Failed", HttpStatus.NOT_MODIFIED);
		}
		return user;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("user/get")
	async getUser(@Query("userId") userId: string) {
		const result = await this.mongodbService.findUserById(userId);
		if(result.cache) {
			const { email, password, setting, ...nonSensitive} = result.user;
			return nonSensitive;
		} else {
			const { email, password, setting, ...nonSensitive} = result.user.toObject();
			return nonSensitive;
		}
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("user/get-all")
	async getAllUser(@Query("userId") userId: string) {
		const users = await this.mongodbService.findAllUser();
		return users;
	}

	@HttpCode(HttpStatus.OK)
	@Get("user/profile")
	async getProfile(@Req() req: any) {
		const user = await this.mongodbService.findUserById(req.user.id);
		if(!user) {
			throw new HttpException("User not found", HttpStatus.NOT_FOUND);
		}
		return user;
	}



	/* Category
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

	@HttpCode(HttpStatus.CREATED)
	@Public()
	@Get("category/create")
	async createCategory(@Query("name") name: string, @Query("title") title: string, @Query("about") about: string,) {
		const category = await this.mongodbService.createCategory(name, title, about);
		if(!category) {
			throw new HttpException("Failed", HttpStatus.NOT_MODIFIED);
		}
		return category;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("category/create-all")
	async createAllCategory(@Body() body: {
		count: number,
		detail: [{name: string, title: string, about: string}]
	}) {
		let categoryIds: string[] = [];
		for(let i = 0; i < body.count; i++) {
			categoryIds.push((await this.mongodbService.createCategory(body.detail[i].name, body.detail[i].title, body.detail[i].about))._id.toHexString());
		}
		return categoryIds;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("category/get")
	async getCategory(@Query("categoryId") categoryId: string) {
		const category = await this.mongodbService.findCategoryById(categoryId);
		if(!category) {
			throw new HttpException("Category not found", HttpStatus.NOT_FOUND);
		}
		return category.category;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("category/add-forum")
	async addForumToCategory(@Query("categoryId") categoryId: string, @Query("forumId") forumId: string) {
		const category = await this.mongodbService.addForumToCategory(categoryId, forumId);
		if(!category) {
			throw new HttpException("Failed", HttpStatus.NOT_MODIFIED);
		}
		return category;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("category/add-forum-many")
	async addForumToCategory2(@Body() body: {
		detail: [{categoryId: string, forumId: string[]}]
	}) {
		let categories: CategoryDocument[] = [];
		for(let i = 0; i < body.detail.length; i++) {
			for(let j = 0; j < body.detail[i].forumId.length; j++) {
				categories.push(await this.mongodbService.addForumToCategory(body.detail[i].categoryId, body.detail[i].forumId[j]));
			}
		}
		return categories;
	}



	

	/* Forum
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

	@HttpCode(HttpStatus.CREATED)
	@Public()
	@Get("forum/create")
	async createForum(@Query("name") name: string, @Query("about") about: string) {
		const forum = await this.mongodbService.createForum(name, about);
		if(!forum) {
			throw new HttpException("Failed", HttpStatus.NOT_MODIFIED);
		}
		return forum;
	}
	
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("forum/create-all")
	async createAllForum(@Body() body: {
		count: number,
		detail: [{name: string, about: string}]
	}) {
		let forumIds: string[] = [];
		for(let i = 0; i < body.count; i++) {
			forumIds.push((await this.mongodbService.createForum(body.detail[i].name, body.detail[i].about))._id.toHexString());
		}
		return forumIds;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("forum/get")
	async getForum(@Query("forumId") forumId: string) {
		const forum = await this.mongodbService.findForumById(forumId);
		if(!forum) {
			throw new HttpException("Forum not found", HttpStatus.NOT_FOUND);
		}
		return forum.forum;
	}

	






	/* Thread
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

	@HttpCode(HttpStatus.CREATED)
	@Public()
	@Get("thread/create")
	async createThread(@Query("forumId") forumId: string, @Query("userId") userId: string, @Query("about") title: string, tag: TagDocument[] = []) {
		const thread = await this.mongodbService.createThread(forumId, userId, title, tag);
		if(!thread) {
			throw new HttpException("Failed", HttpStatus.NOT_MODIFIED);
		}
		return thread;
	}

	@HttpCode(HttpStatus.CREATED)
	@Public()
	@Post("thread/create")
	async createThread2(@Body() body) {
		const thread = await this.mongodbService.createThread(body.forumId, body.userId, body.title, body.tag);
		if(!thread) {
			throw new HttpException("Failed", HttpStatus.NOT_MODIFIED);
		}
		const message = await this.mongodbService.createMessage(thread._id.toHexString(), body.userId, body.threadContent);
		return {thread, message};
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("thread/get")
	async getThread(@Query("threadId") threadId: string) {
		const thread = await this.mongodbService.findThreadById(threadId);
		if(!thread) {
			throw new HttpException("Thread not found", HttpStatus.NOT_FOUND);
		}
		return thread;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("thread/get-from-forum")
	async getThreadMany(@Query("forumId") forumId: string, @Query("offset") offset: number, @Query("limit") limit: number) {
		const threads = await await this.mongodbService.findThread(forumId, offset, limit);
		if(!threads) {
			throw new HttpException("Threads not found" ,HttpStatus.NOT_FOUND);
		}
		return threads;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("thread/get-all")
	async getAllThread(@Query("threadId") threadId: string) {
		return await this.mongodbService.findAllThread();
	}






	/* Message
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

	@HttpCode(HttpStatus.CREATED)
	@Public()
	@Get("message/create")
	async createMessage(@Query("threadId") threadId: string, @Query("userId") userId: string, @Query("content") content: string) {
		const message = await this.mongodbService.createMessage(threadId, userId, content);
		if(!message) {
			throw new HttpException("Failed", HttpStatus.NOT_MODIFIED);
		}
		return message;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("message/get")
	async getMessage(@Query("messageId") messageId: string) {
		const message = await this.mongodbService.findMessageById(messageId);
		if(!message) {
			throw new HttpException("Message not found", HttpStatus.NOT_FOUND);
		}
		return message;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("message/add-reaction")
	async addReactionToMessage(@Query("messageId") messageId: string, @Query("userId") userId: string, @Query("type") type: string) {
		const message = await this.mongodbService.addReactionToMessage(messageId, userId, type);
		if(!message) {
			throw new HttpException("Failed", HttpStatus.NOT_MODIFIED);
		}
		return message;
	}
}
