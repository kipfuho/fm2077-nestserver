import { 
	Body, 
	Controller, 
	Get, 
	HttpCode, 
	HttpStatus, 
	Post, 
	Request
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public';
import { SHA256, enc } from 'crypto-js';
import { DatabaseService } from 'src/database/db.service';
import { CreateUserDto } from 'src/interface/createUserDto';

@Controller()
export class AuthController {
	constructor(
		private readonly authService: AuthService,
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
	@Post('login')
	@Public()
	signIn(@Body() signInDto: Record<string, any>) {
		// Hash the password
		signInDto.password = SHA256(signInDto.password).toString(enc.Hex);
	  return this.authService.signIn(signInDto.username, signInDto.password);
	}

  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}
