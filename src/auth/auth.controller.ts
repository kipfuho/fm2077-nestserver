import { 
	Body, 
	Controller, 
	Get, 
	HttpCode, 
	HttpStatus, 
	Post, 
	Request,
	UseGuards
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public';
import { DatabaseService } from 'src/database/db.service';
import { CreateUserDto } from 'src/interface/createUserDto';
import { LocalAuthGuard } from './local-auth.guard';

@Controller()
export class AuthController {
	constructor(
		private readonly databaseService: DatabaseService
	) {}

	// register new account
	@HttpCode(HttpStatus.CREATED)
	@Public()
  @Post("/register")
  async addUser(@Body() createUserDto : CreateUserDto) {
    const { username, password, email } = createUserDto;
    return this.databaseService.createNewLogin(username, password, email);
  }

	@HttpCode(HttpStatus.OK)
	@Public()
  @UseGuards(LocalAuthGuard)
  @Post('/login')
  async login(@Request() req) {
		// will return jwt token for ease
		// will remove jwt return later
    return req.user;
  }

	@HttpCode(HttpStatus.OK)
	@Get('/logout')
	logout(@Request() req): any {
		req.session.destroy();
		return { msg: 'The user session has ended' }
	}

	// just test api for session
  @Get('/test/profile')
  getProfile(@Request() req) {
    return req.user;
  }

	// just test api for session
	@Get('/test/protected')
	getHello(@Request() req): string {
		return req.user;
	}
}
