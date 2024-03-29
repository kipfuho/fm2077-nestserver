import { 
	Injectable, 
	Logger, 
	UnauthorizedException 
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AES, enc } from 'crypto-js';
import { DatabaseService } from 'src/database/db.service';

@Injectable()
export class AuthService {
	constructor(
		private dbService: DatabaseService,
		private configService: ConfigService
	) {}

	private readonly logger = new Logger(AuthService.name);

	// validate user for local strategy
	// return user login information
	async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.dbService.findUserLogin(username, username);
    if (user && user.password === pass) {
			// create payload for jwt token and return it
			this.logger.log("Logged in: " + user.email);
			const userSessionData = { 
				username: user.username, 
				email: user.email
			};
			return userSessionData;
    }
		this.logger.log("Wrong password: " + user.email);
    return null;
  }

	// encrypt refreshtoken data using aes-256 with cbc and random iv
	encryptRefreshToken(user: any): string {
		this.logger.log("Encrypting Refresh token");
		const refreshTokenData = {
			username: user.username, 
			email: user.email,
			exp: new Date().getTime() + 10*1000 // 10 seconds
		};
		// encrypt data using key and iv from .env and convert it to hex string
		const encrypted = AES.encrypt(JSON.stringify(refreshTokenData), this.configService.get("AES_KEY"), {iv: this.configService.get("AES_IV")});
		return encrypted.toString();
	}

	decryptRefreshToken(refresh_token: string) {
		if(refresh_token === null || refresh_token.length === 0) {
			this.logger.debug("Refresh token not found!");
		}
		this.logger.log("Decrypting Refresh token");
		const decrypted = AES.decrypt(refresh_token, this.configService.get("AES_KEY"), {iv: this.configService.get("AES_IV")}).toString(enc.Utf8);
		return JSON.parse(decrypted);
	}
}
