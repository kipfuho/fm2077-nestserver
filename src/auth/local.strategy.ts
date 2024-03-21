import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { enc, SHA256 } from 'crypto-js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super();
  }

  // validate user
  async validate(username: string, password: string): Promise<any> {
    // hash password to compare with database
    const user = await this.authService.validateUser(username, SHA256(password).toString(enc.Hex));
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}