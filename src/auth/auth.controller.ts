import { 
	Body, 
	Controller, 
	Get, 
	HttpCode, 
	HttpStatus, 
	Post, 
	Request,
	Res,
	UseGuards
} from '@nestjs/common';
import { Public } from './public';
import { DatabaseService } from 'src/database/db.service';
import { CreateUserDto } from 'src/interface/createUserDto';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

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
  @UseGuards(LocalAuthGuard)
  @Post('/login')
  async login(@Request() req, @Res({passthrough: true}) res) {
		// will return jwt token for ease
		// will remove jwt return later
		console.log(res);
    return await req.user;
  }

	@HttpCode(HttpStatus.OK)
	@Get('/logout')
	logout(@Request() req): any {
		req.session.destroy();
		return { msg: 'The user session has ended' }
	}

  @UseGuards(JwtAuthGuard)
	// just test api for session
  @Get('/auth/profile')
  getProfile(@Request() req) {
    return req.user;
  }

	// just test api for session
	@HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
	@Post('/auth/protected')
	async getHello(@Request() req, @Res({passthrough: true}) res) {
		return await req.user;
	}
}
