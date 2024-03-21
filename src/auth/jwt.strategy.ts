import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
		private configService: ConfigService,
	) {
    super({
      // extract token from request
      jwtFromRequest: (req: any) => {
        return req.user.access_token;
      },
      ignoreExpiration: false,
      secretOrKey: configService.get("JWT_SECRET"),
    });
  }

  async validate(payload: any) {
    // can change this according to what we put in payload in login
    return { username: payload.username, email: payload.email };
  }
}