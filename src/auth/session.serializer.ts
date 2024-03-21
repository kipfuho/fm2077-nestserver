import { Injectable, UnauthorizedException } from "@nestjs/common"
import { PassportSerializer } from "@nestjs/passport"

@Injectable()
export class SessionSerializer extends PassportSerializer {
  // serialize user to session
  serializeUser(user: any, done: (err: Error, user: any) => void): any {
    if(user) {
      done(null, user)
    } else {
      done(new Error('User null'), null);
    }
  }
  
  // deserialize session to user
  deserializeUser(
    payload: any,
    done: (err: Error, payload: string) => void
  ): any {
    if(payload) {
      done(null, payload)
    } else {
      done(new UnauthorizedException(), null);
    }
  }
}