import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Get,
  Post,
  Body,
  Req,
  Res,
  Query,
  Param,
  HttpCode,
  HttpException,
  InternalServerErrorException,
  HttpStatus,
  Controller,
  Inject,
  Logger,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { RedisCache } from 'cache-manager-redis-yet';
import { createReadStream, statSync } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';
import { LocalAuthGuard } from 'src/auth/local-auth.guard';
import { Public } from 'src/auth/public';
import { CreateUserDto } from 'src/interface/create.dto';
import { MongodbService } from 'src/mongodb/mongodb.service';
import { getFileType } from 'src/utils/helper';
import {
  CreateBookmark,
  CreateProfilePosting,
  CreateReport,
  CreateThread,
  GetThread,
  ReplyProfilePosting,
  ReplyThread,
  UpdateBookmark,
  UpdateEmail,
  UpdateMessage,
  UpdatePassword,
  UpdateSetting,
  UpdateThread,
  UpdateUsername,
} from './type.dto';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { enc, SHA256 } from 'crypto-js';

@Controller('v2')
export class UserControllerV2 {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly mongodbService: MongodbService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: RedisCache,
  ) {}

  private logger = new Logger(UserControllerV2.name);

  /* General API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('metadata')
  async getMetadata() {
    const metadata = await this.mongodbService.getMetadata();
    if (!metadata) {
      throw new HttpException('Error', HttpStatus.BAD_REQUEST);
    }
    return metadata;
  }

  // send image from forum storage based on its name
  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('/image/:fileName')
  getFile(
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) res,
  ): StreamableFile {
    const filePath = join('./forum_storage', fileName);
    try {
      //1.	Check if the file exists
      const fileStats = statSync(filePath);
      if (!fileStats.isFile()) {
        this.logger.log('API /v2/image/:fileName failed, image not found');
        throw new HttpException('Not found', HttpStatus.NOT_FOUND);
      }

      //2.	Check file type
      const file = createReadStream(filePath);
      const contentType = getFileType(filePath);
      /*
			if(contentType === "application/octet-stream") {
				throw new HttpException("Not an image", HttpStatus.BAD_REQUEST);
			}
			*/

      this.logger.log(`API /v2/image/:fileName succeeded ${file}`);
      res.setHeader('Content-Type', contentType);
      return new StreamableFile(file);
    } catch (error) {
      this.logger.error(`API /v2/image/:fileName, ${error}`);
      throw new InternalServerErrorException();
    }
  }

  // upload an image to forum storage
  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('/image/upload-single')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './forum_storage',
        filename: (_, file, cb) => {
          // create a unique filename
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const filename = `${uniqueSuffix}-${file.originalname.replaceAll(' ', '')}`;
          return cb(null, filename);
        },
      }),
      limits: {
        files: 1, // 1 image
        fileSize: 10 * 1024 * 1024, // 10mb max
      },
    }),
  )
  async uploadImageSingle(@UploadedFile() attachment: Express.Multer.File) {
    this.logger.log(
      `API /v2/image/upload-single succeeded ${attachment.filename}`,
    );
    return {
      message: 'uploaded',
      link: `https://localhost:3001/v2/image/${attachment.filename}`,
    };
  }

  // upload many image to the forum storage
  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('/image/upload-many')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'images', maxCount: 10 }, // 10 files max
      ],
      {
        storage: diskStorage({
          destination: './forum_storage',
          filename: (req, file, cb) => {
            // create a unique filename
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const filename = `${uniqueSuffix}-${file.originalname.replaceAll(' ', '')}`;
            return cb(null, filename);
          },
        }),
      },
    ),
  )
  uploadImageMany(@UploadedFiles() files: { images?: Express.Multer.File[] }) {
    this.logger.log(`API /v2/image/upload-many succeeded ${files.images}`);
    const links = files.images.map(
      (image) => `https://localhost:3001/v2/image/${image.filename}`,
    );
    return {
      message: 'uploaded',
      link: links,
    };
  }

  // upload many attachments to the forum storage
  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('/files/upload-many')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'attachments', maxCount: 10 }, // 10 files max
      ],
      {
        storage: diskStorage({
          destination: './forum_storage',
          filename: (req, file, cb) => {
            // create a unique filename
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const filename = `${uniqueSuffix}-${file.originalname.replaceAll(' ', '')}`;
            return cb(null, filename);
          },
        }),
      },
    ),
  )
  uploadFilesMany(
    @UploadedFiles() files: { attachments?: Express.Multer.File[] },
  ) {
    this.logger.log(`API /v2/image/upload-many succeeded ${files.attachments}`);
    const links = files.attachments.map(
      (file) => `https://localhost:3001/v2/image/${file.filename}`,
    );
    return {
      message: 'uploaded',
      link: links,
    };
  }

  /* Authentication API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.CREATED)
  @Public()
  @Post('/register')
  async addUser(@Body() createUserDto: CreateUserDto) {
    const { username, password, email } = createUserDto;
    const result = await this.mongodbService.createUser(
      username,
      email,
      SHA256(password).toString(enc.Hex),
    );
    if(result) {
      this.logger.log('API /v2/register succeeded' + createUserDto);
      await this.mongodbService.createVerifyCode(result._id.toHexString());
      return {
        message:
          'Registered successfully. A link has been sent to your email, please verify for full permission',
      };
    } else {
      this.logger.log('API /v2/register failed, username or email exist');
      return {
        message: 'Username or Email existed',
      };
    }
  }

  // log in api
  // save session and send a cookie
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('/login')
  async login(@Req() req: any, @Res({ passthrough: true }) res: any) {
    // save session to redis
    await this.cacheManager.set(
      `login:${req.user.id}:token`,
      req.user.refreshToken,
      86400000,
    );
    // attach access_token and refresh_token as cookie
    res.cookie('jwt', req.session.passport.user.jwt);
    res.cookie('refresh_token', req.session.passport.user.refreshToken);

    const result = await this.mongodbService.findUserById(req.user.id);
    if (!result || !result.user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    if (result.cache) {
      const { password, setting, ...nonSensitive } = result.user;
      return {
        message: 'Success',
        user: nonSensitive,
      };
    } else {
      const { password, setting, ...nonSensitive } = result.user.toObject();
      return {
        message: 'Success',
        user: nonSensitive,
      };
    }
  }

  // log out user
  @HttpCode(HttpStatus.OK)
  @Get('/logout')
  async logout(@Req() req: any) {
    // destroy cache and session
    await Promise.all([
      this.cacheManager.del(`login:${req.user.id}`),
      this.cacheManager.del(`login:${req.user.id}:token`),
      this.cacheManager.del(`user:${req.user.id}`),
    ]);
    req.session.destroy();
    this.logger.log('API /logout ' + req.user);
    return { message: 'The user session has ended' };
  }

  /* User model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('user/get')
  async getUser(@Query('userId') userId: string) {
    const result = await this.mongodbService.findUserById(userId);
    if (!result || !result.user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    if (result.cache) {
      const { email, password, setting, ...nonSensitive } = result.user;
      return nonSensitive;
    } else {
      const { email, password, setting, ...nonSensitive } =
        result.user.toObject();
      return nonSensitive;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('user/get')
  async getUser2(@Body() body) {
    const result = await this.mongodbService.findUserById(body.userId);
    if (!result || !result.user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    // remove some unnecessary information
    if (result.cache) {
      const {
        email,
        password,
        setting,
        followers,
        followings,
        ...nonSensitive
      } = result.user;
      return nonSensitive;
    } else {
      const {
        email,
        password,
        setting,
        followers,
        followings,
        ...nonSensitive
      } = result.user.toObject();
      return nonSensitive;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Get('user/get-current')
  async getCurrentUser(@Req() req) {
    const result = await this.mongodbService.findUserById(req.user.id);
    if (!result || !result.user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    if (result.cache) {
      const { password, setting, ...nonSensitive } = result.user;
      return nonSensitive;
    } else {
      const { password, setting, ...nonSensitive } = result.user.toObject();
      return nonSensitive;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Get('user/get-full')
  async getUserFull(@Req() req) {
    const result = await this.mongodbService.findUserById(req.user.id);
    if (!result || !result.user) {
      throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
    }
    if (result.cache) {
      const { password, ...user } = result.user;
      return user;
    } else {
      const { password, ...user } = result.user.toObject();
      return user;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('user/get-detail')
  async getUserDetail(@Query('userId') userId: string) {
    const result = await this.mongodbService.findUserById(userId);
    // can check privacy here before return
    if (!result || !result.user) {
      throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
    }

    if (result.cache) {
      const { password, email, ...user } = result.user;
      return user;
    } else {
      const { password, email, ...user } = result.user.toObject();
      return user;
    }
  }

  // return statistics of user's thread posting among different forums
  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('user/get-post-stats')
  async getUserPostStats(@Query('userId') userId: string) {
    const stats = await this.mongodbService.statisticsUserPosting(userId);
    if(!stats) {
      throw new HttpException('Error statistics user posting area', HttpStatus.BAD_REQUEST);
    }
    return stats;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('user/filter')
  async filterUser(@Query('username') username: string) {
    const users = await this.mongodbService.filterUserByUsername(username);
    if (!users) {
      throw new HttpException('Users not found', HttpStatus.BAD_REQUEST);
    }
    return users;
  }

  @HttpCode(HttpStatus.OK)
  @Post('user/update-username')
  async updateUsername(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
    @Body() body: UpdateUsername,
  ) {
    if (req.user.id !== body.userId) {
      throw new HttpException('User not match', HttpStatus.BAD_REQUEST);
    }

    const user = await this.mongodbService.editUsernameUser(
      body.userId,
      SHA256(body.password).toString(enc.Hex),
      body.username,
    );

    if (!user) {
      throw new HttpException('Error updating', HttpStatus.BAD_REQUEST);
    }
    // update session and cookie
    const newRefreshToken = this.authService.encryptRefreshToken({
      id: req.user.id,
      username: body.username,
    });
    req.session.passport.user.username = body.username;
    req.session.passport.user.refreshToken = newRefreshToken;
    req.session.save();
    res.cookie('refresh_token', newRefreshToken);
    res.cookie(
      'jwt',
      this.jwtService.sign({ id: req.user.id, username: body.username }),
    );
    // save cache
    await this.cacheManager.set(
      `login:${req.user.id}:token`,
      newRefreshToken,
      86400 * 1000,
    );
    return true;
  }

  @HttpCode(HttpStatus.OK)
  @Post('user/update-email')
  async updateEmail(@Req() req: any, @Body() body: UpdateEmail) {
    if (req.user.id !== body.userId) {
      throw new HttpException('User not match', HttpStatus.BAD_REQUEST);
    }

    const user = await this.mongodbService.editEmailUser(
      body.userId,
      SHA256(body.password).toString(enc.Hex),
      body.email,
    );

    if (!user) {
      throw new HttpException('Error updating', HttpStatus.BAD_REQUEST);
    }
    return true;
  }

  @HttpCode(HttpStatus.OK)
  @Post('user/update')
  async updateSetting(@Req() req: any, @Body() body: UpdateSetting) {
    if (req.user.id !== body.userId) {
      throw new HttpException('User not match', HttpStatus.BAD_REQUEST);
    }

    const user = await this.mongodbService.editUserSetting(
      body.userId,
      SHA256(body.password).toString(enc.Hex),
      body.avatar,
      body.dob,
      body.location,
      body.about,
    );

    if (!user) {
      throw new HttpException('Error updating', HttpStatus.BAD_REQUEST);
    }
    return true;
  }

  @HttpCode(HttpStatus.OK)
  @Post('user/update-password')
  async updatePassword(@Req() req: any, @Body() body: UpdatePassword) {
    if (req.user.id !== body.userId) {
      throw new HttpException('User not match', HttpStatus.BAD_REQUEST);
    }

    const user = await this.mongodbService.editPasswordUser(
      body.userId,
      SHA256(body.oldPassword).toString(enc.Hex),
      SHA256(body.password).toString(enc.Hex),
    );

    if (!user) {
      throw new HttpException('Error updating', HttpStatus.BAD_REQUEST);
    }
    return true;
  }

  @HttpCode(HttpStatus.OK)
  @Get('user/create-verify')
  async createVerifyCode(@Req() req: any) {
    const code = await this.mongodbService.createVerifyCode(req.user.id);
    if (!code) {
      throw new HttpException(
        'Could not create a verification code',
        HttpStatus.BAD_REQUEST,
      );
    }
    return true;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('user/verify-email')
  async verifyEmail(
    @Query('userId') userId: string,
    @Query('code') code: string,
  ) {
    const result = await this.mongodbService.verifyEmail(userId, code);
    if (!result) {
      throw new HttpException('Verification failed', HttpStatus.BAD_REQUEST);
    }
    return true;
  }

  @HttpCode(HttpStatus.OK)
  @Get('user/check-follow')
  async checkFollow(@Req() req: any, @Query('userId') userId: string) {
    const result = await this.mongodbService.checkFollowUser(req.user.id, userId);
    return result;
  }

  @HttpCode(HttpStatus.OK)
  @Get('user/follow')
  async followUser(@Req() req: any, @Query('userId') userId: string) {
    const result = await this.mongodbService.followUser(req.user.id, userId);
    return result;
  }

  /* Category model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('category/get')
  async getCategory(@Query('categoryId') categoryId: string) {
    const result = await this.mongodbService.findCategoryById(categoryId);
    if (!result || !result.category) {
      throw new HttpException('Categories not found', HttpStatus.NOT_FOUND);
    }
    if (result.cache) {
      return result.category;
    } else {
      return result.category.toObject();
    }
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('category/get-all')
  async getAllCategory() {
    const categories = await this.mongodbService.findAllCategory();
    if (!categories) {
      throw new HttpException('Categories not found', HttpStatus.NOT_FOUND);
    }
    return categories;
  }

  /* Forum model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('forum/get')
  async getForum(@Query('forumId') forumId: string) {
    const result = await this.mongodbService.findForumById(forumId);
    if (!result || !result.forum) {
      throw new HttpException('Forum not found', HttpStatus.NOT_FOUND);
    }
    if (result.cache) {
      return result.forum;
    } else {
      return result.forum.toObject();
    }
  }

  /* Thread model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('thread/get')
  async getThreads(
    @Query('forumId') forumId: string,
    @Query('offset') offset: number,
    @Query('limit') limit: number,
    @Query('threadId') threadId: string,
  ) {
    if (threadId) {
      // increase view count
      const result = await this.mongodbService.findThreadById(threadId, true);
      if (!result || !result.thread) {
        throw new HttpException('Thread not found', HttpStatus.NOT_FOUND);
      }
      return result.thread;
    }
    const threads = await this.mongodbService.findThreads(
      forumId,
      offset,
      limit,
    );
    if (!threads) {
      throw new HttpException('Threads not found', HttpStatus.NOT_FOUND);
    }
    return threads;
  }

  // support getting thread by id or filterOptions
  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('thread/get')
  async postThreads(@Body() body: GetThread) {
    const { threadId, forumId, offset, limit, filterOptions } = body;
    if (threadId) {
      // increase view count
      const result = await this.mongodbService.findThreadById(
        body.threadId,
        true,
      );
      if (!result || !result.thread) {
        throw new HttpException('Thread not found', HttpStatus.NOT_FOUND);
      }
      return result.thread;
    }

    if (filterOptions) {
      // get filtered threads
      const threads = await this.mongodbService.filterThread(
        forumId,
        offset,
        limit,
        filterOptions,
      );
      if (!threads) {
        throw new HttpException('Threads not found', HttpStatus.NOT_FOUND);
      }
      return threads;
    }

    const threads = await this.mongodbService.findThreads(
      forumId,
      offset,
      limit,
    );
    if (!threads) {
      throw new HttpException('Threads not found', HttpStatus.NOT_FOUND);
    }
    return threads;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('thread/get-user')
  async getThreadsOfUser(
    @Query('userId') userId: string,
    @Query('current') current: string,
    @Query('limit') limit: number,
  ) {
    const threads = await this.mongodbService.findThreadOfUser(
      userId,
      current,
      limit ?? 10,
    );
    if (!threads) {
      throw new HttpException('Threads not found', HttpStatus.NOT_FOUND);
    }
    return threads;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('thread/get-lastest')
  async getLastestThread(@Query('forumId') forumId: string) {
    const thread = await this.mongodbService.findLastestThread(forumId);
    if (!thread) {
      throw new HttpException('Thread not found', HttpStatus.NOT_FOUND);
    }
    const message = await this.mongodbService.findLastestMessage(thread._id);
    const result = await this.mongodbService.findUserById(message.user);
    if (result.cache) {
      const { email, password, setting, ...nonSensitive } = result.user;
      return [thread, message, nonSensitive];
    } else {
      const { email, password, setting, ...nonSensitive } =
        result.user.toObject();
      return [thread, message, nonSensitive];
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('thread/create')
  async createThread(
    @Req() req: any,
    @Body() body: CreateThread
  ) {
    if (req.user.id !== body.userId) {
      throw new HttpException('User not match', HttpStatus.BAD_REQUEST);
    }
    const thread = await this.mongodbService.createThread(
      body.forumId,
      body.userId,
      body.prefixIds,
      body.threadTitle,
      body.tag,
    );

    if(!thread) {
      throw new HttpException('Error creating', HttpStatus.BAD_REQUEST);
    }
    const message = await this.mongodbService.createMessage(
      thread._id.toHexString(),
      body.userId,
      body.threadContent,
    );
    return { thread, message };
  }

  @HttpCode(HttpStatus.OK)
  @Post('/thread/update')
  async updateThread(
    @Req() req: any,
    @Body() body: UpdateThread
  ) {
    const result = await this.mongodbService.editThread(
      body.threadId,
      req.user.id,
      body.threadPrefixIds,
      body.threadTitle,
      body.threadContent,
      body.tag,
    );

    if (!result) {
      throw new HttpException('Error updating', HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @HttpCode(HttpStatus.OK)
  @Post('thread/reply')
  async replyThread(@Req() req: any, @Body() body: ReplyThread) {
    if (req.user.id !== body.userId) {
      throw new HttpException('User not match', HttpStatus.BAD_REQUEST);
    }
    const message = await this.mongodbService.createMessage(
      body.threadId,
      body.userId,
      body.content,
      body.attachments,
    );
    return {
      message: 'Created a new message',
      item: message,
    };
  }

  /* Message model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('message/get-lastest')
  async getLastestMessage(@Query('threadId') threadId: string) {
    const message = await this.mongodbService.findLastestMessage(threadId);
    if (!message) {
      throw new HttpException('Thread not found', HttpStatus.NOT_FOUND);
    }
    const result = await this.mongodbService.findUserById(message.user);
    if (result.cache) {
      const { email, setting, password, ...nonSensitive } = result.user;
      return [message, nonSensitive];
    } else {
      const { email, setting, password, ...nonSensitive } =
        result.user.toObject();
      return [message, nonSensitive];
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('/message/update')
  async updateMessage(@Req() req: any, @Body() body: UpdateMessage) {
    const result = await this.mongodbService.editMessage(
      body.messageId,
      req.user.id,
      body.content,
    );

    if (!result) {
      throw new HttpException('Error updating', HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('message/get')
  async getMessage(
    @Query('threadId') threadId: string,
    @Query('offset') offset: number,
    @Query('limit') limit: number,
    @Query('messageId') messageId: string,
  ) {
    if (messageId) {
      const messageData = await this.mongodbService.findMessageById(messageId);
      if (!messageData || !messageData.message) {
        throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
      }
      return messageData.message;
    }

    const messages = await this.mongodbService.findMessages(
      threadId,
      offset,
      limit,
    );
    if (!messages) {
      throw new HttpException('Messages not found', HttpStatus.NOT_FOUND);
    }
    return messages;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('message/get-user')
  async getMessagesOfUser(
    @Query('userId') userId: string,
    @Query('current') current: string,
    @Query('limit') limit: number,
  ) {
    const messages = await this.mongodbService.findMessageOfUser(
      userId,
      current,
      limit ?? 10,
    );
    if (!messages) {
      throw new HttpException('Messages not found', HttpStatus.NOT_FOUND);
    }
    return messages;
  }

  @HttpCode(HttpStatus.OK)
  @Get('message/react')
  async addReactionToMessage(
    @Req() req: any,
    @Query('messageId') messageId: string,
    @Query('type') type: string,
  ) {
    const result = await this.mongodbService.addReactionToMessage(
      messageId,
      req.user.id,
      type,
    );
    if (!result) {
      throw new HttpException(
        'Error reacting to message',
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      message: 'Added a reaction to message',
      item: result,
    };
  }

  /* Reactions model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('reaction/get')
  async findReaction(
    @Query('reactionId') reactionId: string,
    @Query('userId') userId: string,
    @Query('messageId') messageId: string,
  ) {
    if (reactionId) {
      const reaction = await this.mongodbService.getReactionById(reactionId);
      if (!reaction) {
        throw new HttpException('Reaction not found', HttpStatus.BAD_REQUEST);
      }
      return reaction;
    }

    if (!userId || !messageId) {
      throw new HttpException(
        'UserId or MessageId is not provided',
        HttpStatus.BAD_REQUEST,
      );
    }

    const reaction = await this.mongodbService.getReaction(userId, messageId);
    if (!reaction) {
      throw new HttpException('Reaction not found', HttpStatus.BAD_REQUEST);
    }
    return reaction;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('reaction/get-many')
  async findReactions(
    @Query('messageId') messageId: string,
    @Query('current') current: string,
    @Query('limit') limit: number,
  ) {
    if (!messageId) {
      throw new HttpException(
        'MessageId is not provided',
        HttpStatus.BAD_REQUEST,
      );
    }

    const reactions = await this.mongodbService.getReactionsOfMessage(
      messageId,
      current,
      limit,
    );
    if (!reactions) {
      throw new HttpException('Reactions not found', HttpStatus.BAD_REQUEST);
    }
    return reactions;
  }

  /* ProfilePosting model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Post('profileposting/create')
  async createProfilePosting(@Body() body: CreateProfilePosting) {
    const profilePosting = await this.mongodbService.createProfilePosting(
      body.userId,
      body.userWallId,
      body.message,
    );
    if (!profilePosting) {
      throw new HttpException(
        'Error creating new profile posting',
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      message: 'Created new profile posting',
      item: profilePosting,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('profileposting/reply')
  async replyProfilePosting(@Body() body: ReplyProfilePosting) {
    const profilePosting = await this.mongodbService.replyProfilePosting(
      body.ppId,
      body.userId,
      body.message,
    );
    if (!profilePosting) {
      throw new HttpException(
        'Error replying profile posting',
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      message: 'Replied profile posting',
      item: profilePosting,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('profileposting/get')
  async getProfilePosting(
    @Query('userWallId') userWallId: string,
    @Query('current') current: string,
    @Query('limit') limit: number,
  ) {
    const profilePostings = await this.mongodbService.findProfilePosting(
      userWallId,
      current,
      limit ?? 5,
    );
    if (!profilePostings) {
      throw new HttpException(
        'Error finding profile postings',
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      message: 'Get profile posting successfully',
      item: profilePostings,
    };
  }

  /* Alert model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('alert/get')
  async getAlert(
    @Query('alertId') alertId: string,
    @Query('userId') userId: string,
    @Query('current') current: string,
    @Query('limit') limit: number,
  ) {
    if (alertId) {
      const alert = await this.mongodbService.findAlertById(alertId);
      if (!alert) {
        throw new HttpException('Alert not found', HttpStatus.BAD_REQUEST);
      }
      return alert;
    }

    const alerts = await this.mongodbService.findAlerts(userId, current, limit);
    if (!alerts) {
      throw new HttpException('Alerts not found', HttpStatus.BAD_REQUEST);
    }
    return alerts;
  }

  /* Bookmark model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Post('bookmark/create')
  async createBookmark(@Req() req: any, @Body() body: CreateBookmark) {
    if (req.user.id !== body.userId) {
      throw new HttpException('userId not match', HttpStatus.BAD_REQUEST);
    }

    const bookmark = this.mongodbService.createBookmark(
      body.messageId,
      body.userId,
      body.detail,
    );

    if (!bookmark) {
      throw new HttpException(
        'Error creating new bookmark',
        HttpStatus.BAD_REQUEST,
      );
    }
    return bookmark;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('bookmark/get')
  async getBookmark(
    @Query('bookmarkId') bookmarkId: string,
    @Query('userId') userId: string,
    @Query('current') current: string,
    @Query('limit') limit: number,
  ) {
    if (bookmarkId) {
      const bookmark = await this.mongodbService.findBookmarkById(bookmarkId);
      if (!bookmark) {
        throw new HttpException('Bookmark not found', HttpStatus.BAD_REQUEST);
      }
      return bookmark;
    }

    const bookmark = await this.mongodbService.findBookmarkOfUser(
      userId,
      current,
      limit,
    );
    if (!bookmark) {
      throw new HttpException('Bookmarks not found', HttpStatus.BAD_REQUEST);
    }
    return bookmark;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('bookmark/check')
  async checkBookmarkMessage(
    @Query('messageId') messageId: string,
    @Query('userId') userId: string,
  ) {
    const bookmark = await this.mongodbService.findBookmarkOfMessage(
      userId,
      messageId,
    );
    if (!bookmark) {
      throw new HttpException('Bookmarks not found', HttpStatus.BAD_REQUEST);
    }
    return bookmark;
  }

  @HttpCode(HttpStatus.OK)
  @Post('bookmark/update')
  async updateBookmark(@Req() req: any, @Body() body: UpdateBookmark) {
    const bookmark = await this.mongodbService.updateBookmark(
      body.bookmarkId,
      req.user.id,
      body.detail,
    );
    if (!bookmark) {
      throw new HttpException(
        'Error updating bookmark',
        HttpStatus.BAD_REQUEST,
      );
    }
    return bookmark;
  }

  @HttpCode(HttpStatus.OK)
  @Get('bookmark/delete')
  async deleteBookmark(
    @Req() req: any,
    @Query('bookmarkId') bookmarkId: string,
  ) {
    const result = await this.mongodbService.deleteBookmark(
      bookmarkId,
      req.user.id,
    );
    if (!result) {
      throw new HttpException(
        'Error deleting bookmark',
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  /* Report model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Post('report/create')
  async createReport(@Req() req: any, @Body() body: CreateReport) {
    if (req.user.id !== body.userId) {
      throw new HttpException(
        'Error creating new report, userId not match',
        HttpStatus.BAD_REQUEST,
      );
    }

    const report = await this.mongodbService.createReport(
      body.messageId,
      body.userId,
      body.reason,
      body.detail,
    );
    if (!report) {
      throw new HttpException(
        'Error creating new report',
        HttpStatus.BAD_REQUEST,
      );
    }
    return report;
  }

  // ?
  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('report/get')
  async getReport(
    @Query('reportId') reportId: string,
    @Query('userId') userId: string,
    @Query('current') current: string,
    @Query('limit') limit: number,
  ) {
    if (reportId) {
      const report = await this.mongodbService.findReportById(reportId);
      if (!report) {
        throw new HttpException('Report not found', HttpStatus.BAD_REQUEST);
      }
      return report;
    }

    const reports = await this.mongodbService.findReportOfUser(
      userId,
      current,
      limit ?? 20,
    );
    if (!reports) {
      throw new HttpException('Reports not found', HttpStatus.BAD_REQUEST);
    }
    return reports;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('report/check')
  async checkReport(
    @Query('messageId') messageId: string,
    @Query('userId') userId: string,
  ) {
    const report = await this.mongodbService.checkReportUser(messageId, userId);
    if (!report) {
      throw new HttpException('Report not found', HttpStatus.BAD_REQUEST);
    }
    return report;
  }

  /* Prefix model API
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	-----------------------------------------------------------
	*/

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('prefix/get-all')
  async getAllPrefix() {
    const prefixes = await this.mongodbService.findAllPrefix();
    if (!prefixes) {
      throw new HttpException('Prefix not found', HttpStatus.BAD_REQUEST);
    }
    return prefixes;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('prefix/get')
  async getPrefix(@Query('prefixId') prefixId: number) {
    const prefix = await this.mongodbService.findPrefixById(prefixId);
    if (!prefix) {
      throw new HttpException('Prefix not found', HttpStatus.BAD_REQUEST);
    }
    return prefix;
  }
}