import {
	Injectable, 
	Logger
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
    const loginData = await this.dbService.findUserLogin(username, username);
    if (loginData && loginData.login.password === pass) {
			const {create_time, password, ...payload} = loginData.login;
			this.logger.log("Logged in: " + loginData.login.email);
			const userSessionData = { 
				...payload,
				refreshToken: this.encryptRefreshToken(payload)
			};
			return userSessionData;
    }
		this.logger.debug("Username or password is wrong: " + username);
    return null;
  }

	// encrypt refreshtoken data using aes-256 with cbc and random iv
	encryptRefreshToken(user: any): string {
		this.logger.log("Encrypting Refresh token");
		const refreshTokenData = {
			id: user.id,
			username: user.username, 
			email: user.email,
			exp: new Date().getTime() + 3*30*24*60*60*1000 // 3 months
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
