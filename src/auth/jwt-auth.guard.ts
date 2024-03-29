import { 
  ExecutionContext, 
  HttpException, 
  HttpStatus, 
  Injectable, 
  Logger, 
  UnauthorizedException 
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService
  ) {
    super();
  }

  private readonly logger = new Logger(JwtAuthGuard.name);

	async canActivate(context: ExecutionContext) {
    // check if public route
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (isPublic) {
      // 💡 See this condition
      return true;
    }

    // check if a session is presented
		const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    if(!request.isAuthenticated()){
      this.logger.debug("Request is not authenticated " + request.url);
      return false;
    }
    
    // activate jwt through strategy
    // catch error is probably due to expired token
    // renew access token in this case
    try {
      let result = await super.canActivate(context);
      this.logger.log("Accessed through jwt");
      if(result){
        return true;
      }
    } catch(error) {
      this.logger.debug("JWT: ", error);
      // get refresh token data
      const refresh_token_data = this.authService.decryptRefreshToken(request.cookies.refresh_token);
      // if the data in the session storage does not match the data from refresh token
      // throw unauthorized
      if(request.user.username != refresh_token_data.username || request.user.email != refresh_token_data.email) {
        this.logger.debug("Refresh token error!");
        throw new HttpException("Refresh token error", HttpStatus.UNAUTHORIZED);
      } else {
        // check if the refresh token is expired, if it is create a new one
        if(refresh_token_data.exp < new Date().getTime()) {
          this.logger.debug("Renew Refresh token");
          response.cookie('refresh_token', this.authService.encryptRefreshToken(request.user));
        }
      }
      response.cookie('jwt', this.jwtService.sign(request.user));
      return true;
    }
  }

  handleRequest(err, user, info) {
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    this.logger.debug("Handle request, User:", user);
    return user;
  }
}
