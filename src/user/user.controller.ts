import { 
	Body, 
	Controller, 
	Get, 
	HttpCode, 
	HttpStatus, 
	Post, 
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

	@HttpCode(HttpStatus.CREATED)
	@Post("/create-thread")
	async createNewThread(@Body() createThreadDto: CreateThreadDto) {
		const {forum_id, email, content, thread_title, tag} = createThreadDto;
		return this.dbService.createNewThread(forum_id, email, content, thread_title, tag);
	}

	@HttpCode(HttpStatus.CREATED)
	@Post("/create-message")
	async createNewMessage(@Body() createMessageDto: CreateMessageDto) {
		const {thread_id, sender_email, content} = createMessageDto;
		return this.dbService.createNewMessage(thread_id, sender_email, content);
	}

	@HttpCode(HttpStatus.OK)
	@Get("/get-profile")
	async getProfile(@Req() req : any) {
		const {email} = req.user;
		return this.dbService.findUser(email);
	}

	// Anyone can see forums
	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("/get-forum")
	async getForum(@Req() _ : any) {
		return this.dbService.findAllForum();
	}

	// Anyone can see forums
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/get-forum-category")
	async getForumCategory(@Body() body : GetForumCategoryDto) {
		let {category} = body;
		return this.dbService.findForumCategory(category);
	}

	// Anyone can see threads
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/get-thread-forum")
	async getTheadForum(@Body() getThreadForumDto : GetThreadForumDto) {
		const {forum_id} = getThreadForumDto;
		return this.dbService.findAllThreadOfForum(forum_id);
	}

	@HttpCode(HttpStatus.OK)
	@Get("/get-thread-user")
	async getTheadUser(@Req() req : any) {
		const {email} = req.user;
		return this.dbService.findAllThreadOfUser(email);
	}

	// this will return a thread and all its messages
	// this count as user view a page
	@HttpCode(HttpStatus.OK)
	@Get("/get-thread")
	async getThreadFull(@Body() body: GetMessageThreadDto) {
		const {thread_id} = body;
		let result = await this.dbService.findThreadFull(thread_id);
		return result;
	}

	@HttpCode(HttpStatus.OK)
	@Get("/get-message-user")
	async getMessageUser(@Req() req : any) {
		const {email} = req.user;
		return this.dbService.findAllMessageOfUser(email);
	}

	
}