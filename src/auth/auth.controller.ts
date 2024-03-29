import { 
	Body, 
	Controller, 
	Get, 
	HttpCode, 
	HttpStatus, 
	Logger, 
	Post, 
	Request,
	Res,
	Response,
	UseGuards
} from '@nestjs/common';
import { Public } from './public';
import { DatabaseService } from 'src/database/db.service';
import { CreateUserDto } from 'src/interface/createUserDto';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly jwtService: JwtService,
		private readonly databaseService: DatabaseService
	) {}

	private logger = new Logger(AuthController.name);

	// register new account
	@Public()
	@HttpCode(HttpStatus.CREATED)
  @Post("/register")
  async addUser(@Body() createUserDto : CreateUserDto) {
    const { username, password, email } = createUserDto;
		this.logger.log("API /register " + createUserDto);
    return this.databaseService.createNewLogin(username, password, email);
  }

	// log in api
	// save session and send a cookie
	@Public()
	@HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @Post('/login')
  async login(@Request() req, @Response({passthrough: true}) res) {
		// attach access_token and refresh_token as cookie
		res.cookie('jwt', this.jwtService.sign(req.user));
		res.cookie('refresh_token', this.authService.encryptRefreshToken(req.user));
		this.logger.log("API /login " + JSON.stringify(req.user));
    return await req.user;
  }

	// log out user
	// and destroy session
	@HttpCode(HttpStatus.OK)
	@Get('/logout')
	logout(@Request() req): any {
		req.session.destroy();
		this.logger.log("API /logout " + req.user);
		return { message: 'The user session has ended' }
	}

	// just test api for session
	@HttpCode(HttpStatus.OK)
  @Get('/auth/profile')
  getProfile(@Request() req) {
		this.logger.log("API /auth/profile " + req.user);
    return req.user;
  }

	// just test api for session
	@HttpCode(HttpStatus.OK)
	@Post('/auth/protected')
	async getHello(@Request() req, @Res({passthrough: true}) res) {
		this.logger.log("API /auth/protected " + req.user);
		return req.user;
	}
}
