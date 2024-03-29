import { 
	Body, 
	Controller, 
	Get, 
	HttpCode, 
	HttpException, 
	HttpStatus, 
	Logger, 
	Post, 
	Query, 
	Req
} from '@nestjs/common';
import { Public } from 'src/auth/public';
import { DatabaseService } from 'src/database/db.service';
import { CreateMessageDto } from 'src/interface/createMessageDto';
import { CreateThreadDto } from 'src/interface/createThreadDto';
import { GetForumCategoryDto } from 'src/interface/getForumCategoryDto';
import { GetMessageThreadDto } from 'src/interface/getMessageThreadDto';
import { GetThreadForumDto } from 'src/interface/getThreadForumDto';

@Controller('user')
export class UserController {
	constructor(
		private readonly dbService: DatabaseService,
	) {}

	private logger = new Logger(UserController.name);

	@HttpCode(HttpStatus.CREATED)
	@Post("/create-thread")
	async createNewThread(@Body() createThreadDto: CreateThreadDto) {
		const {forum_id, email, content, thread_title, tag} = createThreadDto;
		this.logger.log("API /user/create-thread " + createThreadDto);
		return this.dbService.createNewThread(forum_id, email, content, thread_title, tag);
	}

	@HttpCode(HttpStatus.CREATED)
	@Post("/create-message")
	async createNewMessage(@Body() createMessageDto: CreateMessageDto) {
		const {thread_id, sender_email, content} = createMessageDto;
		this.logger.log("API /user/create-message " + JSON.stringify(createMessageDto));
		return this.dbService.createNewMessage(thread_id, sender_email, content);
	}

	@HttpCode(HttpStatus.OK)
	@Get("/get-profile")
	async getProfile(@Req() req : any) {
		const {email} = req.user;
		const result = await this.dbService.findUser(email);
		this.logger.log("API /user/get-profile " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	// return public profile of a user
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/get-public-profile")
	async getPublicProfile(@Body() body : any) {
		const {email} = body;
		const result = await this.dbService.findPublicUser(email);
		this.logger.log("API /user/get-public-profile " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	// get a forum with an id
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/get-forum")
	async getForum(@Body() body : any) {
		const { forum_id } = body;
		const result = await this.dbService.findForum(forum_id);
		this.logger.log("API /user/get-forum " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	// get all forums
	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("/get-forum")
	async getAllForum(@Req() _ : any) {
		const result = await this.dbService.findAllForum();
		this.logger.log("API /user/get-forum " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	// Anyone can see forums
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/get-forum-category")
	async getForumCategory(@Body() body : GetForumCategoryDto) {
		const {category} = body;
		const result = await this.dbService.findForumCategory(category);
		this.logger.log("API /user/get-forum-category " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	// Anyone can see threads
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/get-thread-forum")
	async getTheadForum(@Body() getThreadForumDto : GetThreadForumDto) {
		const {forum_id} = getThreadForumDto;
		const result = await this.dbService.findAllThreadOfForum(forum_id);
		this.logger.log("API /user/get-forum-category " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	@HttpCode(HttpStatus.OK)
	@Get("/get-thread-user")
	async getTheadUser(@Req() req : any) {
		const {email} = req.user;
		const result = await this.dbService.findAllThreadOfUser(email);
		this.logger.log("API /user/get-thread-user " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	// this will return a thread and all its messages
	// this count as user view a page
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/get-thread")
	async getThreadFull(@Body() body: GetMessageThreadDto) {
		const {thread_id} = body;
		const result = await this.dbService.findThreadFull(thread_id);
		this.logger.log("API /user/get-thread " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	// this will return lastest thread of a forum
	// meaning the thread with last update time most recently
	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("/get-thread-lastest")
	async getLastestThread(@Query("forum_id") forum_id: number) {
		const result = await this.dbService.findLastestThread(forum_id);
		this.logger.log("API /user/get-thread-lastest " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	@HttpCode(HttpStatus.OK)
	@Get("/get-message-user")
	async getMessageUser(@Req() req : any) {
		const {email} = req.user;
		const result = await this.dbService.findAllMessageOfUser(email);
		this.logger.log("API /user/get-message-user " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("/get-message")
	async getMessage(@Query('limit') limit: number, @Query('offset') offset: number, @Query('thread_id') thread_id: number) {
		const result = await this.dbService.findMessages(thread_id, limit, offset);
		this.logger.log("API /user/get-message " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("get-message-lastest")
	async getLastestMessage(@Query("thread_id") thread_id: number) {
		const result = await this.dbService.findLastestMessage(thread_id);
		this.logger.log("API /user/get-message " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}
}