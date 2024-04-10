import { 
  ExecutionContext, 
  HttpException, 
  HttpStatus, 
  Inject, 
  Injectable, 
  Logger, 
  UnauthorizedException 
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { RedisCache } from 'cache-manager-redis-yet';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: RedisCache
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
    // get session cache from redis and compare with request refresh token
    // check if session is consistent
    const sessionCache: string = await this.cacheManager.get(`login:${request.user.id}:token`);
    if(!sessionCache) {
      this.logger.debug("Session exist in request but not in redis");
      this.cacheManager.del(`user:${request.user.id}`);
      request.session.destroy();
      throw new HttpException("Session error", HttpStatus.BAD_REQUEST);
    }
    if(sessionCache !== request.session.passport.user.refreshToken) {
      // this mean someone else has logged into the same account
      request.session.destroy();
      throw new HttpException("Someone has logged into your account", HttpStatus.FORBIDDEN);
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
      // check refresh token from request and session store
      // if equal, provide new jwt token
      // else destroy sesion
      if(request.session.passport.user.refreshToken !== request.cookies.refresh_token) {
        this.logger.debug(`Refresh token error!`);
        throw new HttpException("Refresh token error, destroying session", HttpStatus.UNAUTHORIZED);
      } else {
        // create new token and attach to response
        const newRefreshToken = this.authService.encryptRefreshToken({id: request.user.id, username: request.user.username});
        response.cookie('refresh_token', newRefreshToken);
        response.cookie('jwt', this.jwtService.sign(request.user));
        // save session
        request.session.passport.user.refreshToken = newRefreshToken;
        request.session.save();
        // save cache
        await this.cacheManager.set(`login:${request.user.id}:token`, newRefreshToken);
        return true;
      }
    }
  }

  handleRequest(err, user, info) {
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    this.logger.debug("Handle request, User:", user);
    this.logger.error("Handle request, Error:", err);
    return user;
  }
}
