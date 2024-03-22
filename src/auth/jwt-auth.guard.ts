import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(private reflector: Reflector) {
    super();
  }

  private readonly logger = new Logger(JwtAuthGuard.name);

	async canActivate(context: ExecutionContext) {
    // check if a session is presented
		const request = context.switchToHttp().getRequest();
    console.log(request.session);
    if(!request.isAuthenticated()){
      this.logger.log("Request is not authenticated");
      return false;
    }
    
    // activate jwt through strategy
    this.logger.log("Accessed through jwt");
    let result = await super.canActivate(context);
    if(result){
      return true;
    }
  }

  handleRequest(err, user, info) {
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
