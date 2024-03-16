import { Injectable, 
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

	async signIn(
		username: string, 
		password: string
	): Promise<{ access_token: string }> {
		const user = await this.dbService.findUserLogin(username, username);
		if (user?.password !== password){
			this.logger.log("Sign in failed, username not existed or wrong password");
			throw new UnauthorizedException();
		}
		this.logger.log("Sign in succeeded: " + user.email);
		const payload = { username: user.username };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
	}
}
