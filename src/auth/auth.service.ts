import { 
	Injectable, 
	Logger, 
	UnauthorizedException 
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from 'src/database/db.service';

@Injectable()
export class AuthService {
	constructor(
		private dbService: DatabaseService,
		private jwtService: JwtService
	) {}

	private readonly logger = new Logger(AuthService.name);

	async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.dbService.findUserLogin(username, username);
    if (user && user.password === pass) {
			// create payload for jwt token and return it
			const payload = { username: user.username, email: user.email };
			this.logger.log("Logged in: " + user.email);
      return {access_token: this.jwtService.sign(payload)};
    }
		this.logger.log("Wrong password: " + user.email);
    return null;
  }
}
