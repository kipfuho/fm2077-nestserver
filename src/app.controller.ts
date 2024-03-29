import { 
  Controller, 
  Get, 
  Logger 
} from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public';
import { enc, lib } from 'crypto-js';
import { DatabaseService } from './database/db.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dbService: DatabaseService
  ) {}

  private logger = new Logger(AppController.name);

  @Public()
  @Get()
  getHello(): string {
    this.logger.log("API / " + "Hello World!");
    return this.appService.getHello();
  }

  @Public()
  @Get("/key")
  getRandomKey(): string {
    return lib.WordArray.random(32).toString(enc.Hex);
  }

  @Public()
  @Get("metadata")
  async getMetadata() {
    return await this.dbService.getMetadata();
  }
}
