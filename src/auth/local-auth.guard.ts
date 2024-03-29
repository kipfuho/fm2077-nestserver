import { 
	ExecutionContext, 
	Injectable, 
	Logger 
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// this strategy is used for checking account in database
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
	private readonly logger = new Logger(LocalAuthGuard.name);
	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest();

		// check if there's a session, block if there is
		if (request.user) {
			this.logger.debug('Session exists. Blocking access to login route.');
			return false;
		}

		// login and create a session
		const result = (await super.canActivate(context)) as boolean;
		await super.logIn(request);
		return result;
	}
}