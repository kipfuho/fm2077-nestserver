import { 
  Injectable, 
  Logger, 
  UnauthorizedException 
} from "@nestjs/common"
import { PassportSerializer } from "@nestjs/passport"

@Injectable()
export class SessionSerializer extends PassportSerializer {
  private readonly logger = new Logger(SessionSerializer.name);
  // serialize user to session
  serializeUser(user: any, done: (err: Error, user: any) => void): any {
    if(user) {
      this.logger.log("Serialized!");
      done(null, user);
    } else {
      this.logger.log("User null!");
      done(new Error('User null'), null);
    }
  }
  
  // deserialize session to user
  deserializeUser(
    payload: any,
    done: (err: Error, payload: string) => void
  ): any {
    this.logger.log("Deserialized!");
    done(null, payload);
  }
}