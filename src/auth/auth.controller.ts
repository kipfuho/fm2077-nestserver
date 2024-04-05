import { 
	Body, 
	Controller, 
	Get, 
	HttpCode, 
	HttpStatus, 
	Inject, 
	Logger, 
	Post, 
	Request,
	Res,
	Response,
	UseGuards
} from '@nestjs/common';
import { Public } from './public';
import { DatabaseService } from 'src/database/db.service';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { CreateUserDto } from 'src/interface/create.dto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { RedisCache } from 'cache-manager-redis-yet';

@Controller()
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly jwtService: JwtService,
		private readonly databaseService: DatabaseService,
		@Inject(CACHE_MANAGER) private readonly cacheManager: RedisCache
	) {}

	private logger = new Logger(AuthController.name);

	// register new account
	@HttpCode(HttpStatus.CREATED)
	@Public()
  @Post("/register")
  async addUser(@Body() createUserDto : CreateUserDto) {
    const { username, password, email } = createUserDto;
		const result = await this.databaseService.createNewLogin(username, password, email);
		if(result) {
			this.logger.log("API /register succeeded" + createUserDto);
			return {message: "Created"};
		} else {
			this.logger.log("API /register failed" + createUserDto);
			return {message: "Username or Email existed"};
		}
  }

	// log in api
	// save session and send a cookie
	@HttpCode(HttpStatus.OK)
	@Public()
  @UseGuards(LocalAuthGuard)
  @Post('/login')
  async login(@Request() req, @Response({passthrough: true}) res) {
		// save session to redis
		await this.cacheManager.set(`login:${req.user.id}:token`, req.user.refreshToken);
		// attach access_token and refresh_token as cookie
		res.cookie('jwt', this.jwtService.sign(req.user));
		res.cookie('refresh_token', req.user.refreshToken);
		this.logger.log("API /login " + JSON.stringify(req.user));
    return await req.user;
  }

	// log out user
	@HttpCode(HttpStatus.OK)
	@Get('/logout')
	logout(@Request() req): any {
		// destroy cache and session
		this.cacheManager.del(`login:${req.user.id}`);
		this.cacheManager.del(`user:${req.user.id}`);
		req.session.destroy();
		this.logger.log("API /logout " + req.user);
		return { message: 'The user session has ended' }
	}
}
