import { 
  Body,
  Controller, 
  Get, 
  Inject, 
  Logger,
  Post,
  Query,
  Req, 
} from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public';
import { enc, lib } from 'crypto-js';
import { DatabaseService } from './database/db.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { RedisCache } from 'cache-manager-redis-yet';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dbService: DatabaseService,
    @Inject(CACHE_MANAGER) private cacheManager: RedisCache
  ) {}

  private logger = new Logger(AppController.name);

  @Public()
  @Get()
  getHello(): string {
    this.logger.log("API / " + "Hello World!");
    return this.appService.getHello();
  }

  @Get("/token")
  getToken(@Req() req: any) {
    return {jwt: req.cookies.jwt, refresh: req.cookies.refresh_token}
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
  
  @Public()
  @Get("cache/set")
  async setCache(@Query("key") key: string = "test_cache", @Query("value") value: string = "123") {
    await this.cacheManager.set(key, value);
    this.logger.log(`API GET /cache/get key:::${key} val:::${value}`);
    return true;
  }

  @Public()
  @Post("cache/set")
  async setCachePost(@Body() body: any) {
    await this.cacheManager.set(body.key, body.value);
    this.logger.log(`API GET /cache/get key:::${body.key} val:::${body.value}`);
    return true;
  }

  @Public()
  @Get("cache/get")
  async getCache(@Query("key") key: string = "test_cache") {
    const val: any = await this.cacheManager.get(key);
    this.logger.log(`API GET /cache/get ${val}`);
    return JSON.parse(val);
  }

  @Get("session/regenerate")
  async getSession(@Req() req: any) {
    // save session data
    req.session.passport.user.username = "abc";
    req.session.save();
    return true;
  }
}
