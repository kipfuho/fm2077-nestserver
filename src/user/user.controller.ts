import { 
	Body, 
	Controller, 
	HttpCode, 
	HttpStatus, 
	Post 
} from '@nestjs/common';
import { Public } from 'src/auth/public';
import { DatabaseService } from 'src/database/db.service';
import { CreateThreadDto } from 'src/interface/createThreadDto';

@Controller('user')
export class UserController {
	constructor(
		private readonly dbService: DatabaseService,
	) {}

	@HttpCode(HttpStatus.CREATED)
	@Public()
	@Post("/create-thread")
	async createNewThread(@Body() createThreadDto: CreateThreadDto){
		const {forum_id, email, content, thread_title} = createThreadDto;
		return this.dbService.createNewThread(forum_id, email, content, thread_title);
	}
}
