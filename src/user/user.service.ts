import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/db.service';

@Injectable()
export class UserService {
	constructor(
		private readonly dbService = DatabaseService
	) {}
	
	private readonly logger = new Logger(UserService.name);
	
}
