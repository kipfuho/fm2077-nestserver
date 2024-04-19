import { CACHE_MANAGER } from "@nestjs/cache-manager";
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
	UseInterceptors 
} from "@nestjs/common";
import { FileFieldsInterceptor, FileInterceptor } from "@nestjs/platform-express";
import { RedisCache } from "cache-manager-redis-yet";
import { createReadStream, statSync } from "fs";
import { diskStorage } from "multer";
import { join } from "path";
import { LocalAuthGuard } from "src/auth/local-auth.guard";
import { Public } from "src/auth/public";
import { CreateUserDto } from "src/interface/create.dto";
import { MongodbService } from "src/mongodb/mongodb.service";
import { getFileType } from "src/utils/helper";
import { CreateThread, UpdateEmail, UpdateMessage, UpdatePassword, UpdateSetting, UpdateThread, UpdateUsername } from "./type.dto";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { enc, SHA256 } from "crypto-js";

@Controller("v2")
export class UserControllerV2 {
	constructor(
		private readonly authService: AuthService,
		private readonly jwtService: JwtService,
		private readonly mongodbService: MongodbService,
		@Inject(CACHE_MANAGER) private readonly cacheManager: RedisCache
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
  @Get("metadata")
  async getMetadata() {
		const metadata = await this.mongodbService.getMetadata();
		if(!metadata) {
			throw new HttpException("Error", HttpStatus.BAD_REQUEST);
		}
    return metadata;
  }

	// send image from forum storage based on its name
	@HttpCode(HttpStatus.OK)
	@Public()
  @Get("/image/:fileName")
  getFile(@Param("fileName") fileName: string, @Res({passthrough: true}) res): StreamableFile {
    const filePath = join('./forum_storage', fileName);
		try {
      //1.	Check if the file exists
      const fileStats = statSync(filePath);
      if (!fileStats.isFile()) {
				this.logger.log("API /v2/image/:fileName failed, image not found");
        throw new HttpException("Not found", HttpStatus.NOT_FOUND);
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
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: './forum_storage',
      filename: (_, file, cb) => {
				// create a unique filename
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const filename = `${uniqueSuffix}-${file.originalname.replaceAll(" ", "")}`;
        return cb(null, filename);
      }
    }),
		limits: {
			files: 1,				// 1 image
			fileSize: 10*1024*1024 // 10mb max
		}
  }))
  async uploadImageSingle(@UploadedFile() attachment: Express.Multer.File) {
    this.logger.log(`API /v2/image/upload-single succeeded ${attachment.filename}`);
		return { 
			message: "uploaded",
			link: `https://localhost:3001/v2/image/${attachment.filename}`
		};
  }

	// upload many image to the forum storage
	@HttpCode(HttpStatus.OK)
	@Public()
  @Post('/image/upload-many')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'images', maxCount: 10 }, // 10 files max
  ], {
    storage: diskStorage({
      destination: './forum_storage',
      filename: (req, file, cb) => {
        // create a unique filename
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const filename = `${uniqueSuffix}-${file.originalname.replaceAll(" ", "")}}`;
        return cb(null, filename);
      }
    })
  }))
  uploadImageMany(@UploadedFiles() files: { images?: Express.Multer.File[]}) {
		this.logger.log(`API /v2/image/upload-many succeeded ${files.images}`);
		const links = files.images.map((image) => `https://localhost:3001/v2/image/${image.filename}`);
		return { 
			message: "uploaded",
			link: links
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
  @Post("/register")
  async addUser(@Body() createUserDto : CreateUserDto) {
    const { username, password, email } = createUserDto;
		const result = await this.mongodbService.createUser(username, email, password);
		if(result) {
			this.logger.log("API /v2/register succeeded" + createUserDto);
			await this.mongodbService.createVerifyCode(result._id.toHexString());
			return {message: "Created, please verify your email for full permission"};
		} else {
			this.logger.log("API /v2/register failed, username or email exist");
			return {message: "Username or Email existed"};
		}
  }

	// log in api
	// save session and send a cookie
	@HttpCode(HttpStatus.OK)
	@Public()
  @UseGuards(LocalAuthGuard)
  @Post('/login')
  async login(@Req() req: any, @Res({passthrough: true}) res: any) {
		// save session to redis
		await this.cacheManager.set(`login:${req.user.id}:token`, req.user.refreshToken, 86400000);
		// attach access_token and refresh_token as cookie
		res.cookie('jwt', req.session.passport.user.jwt);
		res.cookie('refresh_token', req.session.passport.user.refreshToken);
		this.logger.log("API /v2/login ");
    return {
			id: req.user.id,
			username: req.user.username
		};
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
		this.logger.log("API /logout " + req.user);
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
	@Get("user/get")
	async getUser(@Query("userId") userId: string) {
		const result = await this.mongodbService.findUserById(userId);
		if(!result || !result.user) {
			throw new HttpException("User not found", HttpStatus.NOT_FOUND);
		}
		if(result.cache) {
			const { email, password, setting, ...nonSensitive } = result.user;
			return nonSensitive;
		} else {
			const { email, password, setting, ...nonSensitive } = result.user.toObject();
			return nonSensitive;
		}
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("user/get")
	async getUser2(@Body() body) {
		const result = await this.mongodbService.findUserById(body.userId);
		if(!result || !result.user) {
			throw new HttpException("User not found", HttpStatus.NOT_FOUND);
		}
		if(result.cache) {
			const { email, password, setting, ...nonSensitive } = result.user;
			return nonSensitive;
		} else {
			const { email, password, setting, ...nonSensitive } = result.user.toObject();
			return nonSensitive;
		}
	}

	@HttpCode(HttpStatus.OK)
	@Get("user/get-current")
	async getCurrentUser(@Req() req) {
		const result = await this.mongodbService.findUserById(req.user.id);
		if(!result || !result.user) {
			throw new HttpException("User not found", HttpStatus.NOT_FOUND);
		}
		if(result.cache) {
			const {password, setting, ...nonSensitive} = result.user;
			return nonSensitive;
		} else {
			const {password, setting, ...nonSensitive} = result.user.toObject();
			return nonSensitive;
		}
	}

	@HttpCode(HttpStatus.OK)
	@Get("user/get-full")
	async getUserFull(@Req() req) {
		const result = await this.mongodbService.findUserById(req.user.id);
		if(!result || !result.user) {
			throw new HttpException("User not found", HttpStatus.BAD_REQUEST);
		}
		if(result.cache) {
			const {password, ...user} = result.user;
			return user;
		} else {
			const {password, ...user} = result.user.toObject();
			return user;
		}
	}

	@HttpCode(HttpStatus.OK)
	@Post("user/update-username")
	async updateUsername(@Req() req, @Res({passthrough: true}) res, @Body() body: UpdateUsername) {
		if(req.user.id !== body.userId) {
			throw new HttpException("User not match", HttpStatus.BAD_REQUEST);
		}

		const user = await this.mongodbService.editUsernameUser(body.userId, SHA256(body.password).toString(enc.Hex), body.username);

		if(!user) {
			throw new HttpException("Error updating", HttpStatus.BAD_REQUEST);
		}
		// update session and cookie
		const newRefreshToken = this.authService.encryptRefreshToken({id: req.user.id, username: body.username});
		req.session.passport.user.username = body.username;
		req.session.passport.user.refreshToken = newRefreshToken;
		req.session.save();
		res.cookie('refresh_token', newRefreshToken);
		res.cookie('jwt', this.jwtService.sign({id: req.user.id, username: body.username}));
		// save cache
		await this.cacheManager.set(`login:${req.user.id}:token`, newRefreshToken, 86400*1000);
		return true;
	}

	@HttpCode(HttpStatus.OK)
	@Post("user/update-email")
	async updateEmail(@Req() req, @Body() body: UpdateEmail) {
		if(req.user.id !== body.userId) {
			throw new HttpException("User not match", HttpStatus.BAD_REQUEST);
		}

		const user = await this.mongodbService.editEmailUser(body.userId, SHA256(body.password).toString(enc.Hex), body.email);

		if(!user) {
			throw new HttpException("Error updating", HttpStatus.BAD_REQUEST);
		}
		return true;
	}

	@HttpCode(HttpStatus.OK)
	@Post("user/update")
	async updateSetting(@Req() req, @Body() body: UpdateSetting) {
		if(req.user.id !== body.userId) {
			throw new HttpException("User not match", HttpStatus.BAD_REQUEST);
		}

		const user = await this.mongodbService.editUserSetting(
			body.userId,
			SHA256(body.password).toString(enc.Hex),
			body.avatar, 
			body.dob, 
			body.location, 
			body.about
		);

		if(!user) {
			throw new HttpException("Error updating", HttpStatus.BAD_REQUEST);
		}
		return true;
	}

	@HttpCode(HttpStatus.OK)
	@Post("user/update-password")
	async updatePassword(@Req() req, @Body() body: UpdatePassword) {
		if(req.user.id !== body.userId) {
			throw new HttpException("User not match", HttpStatus.BAD_REQUEST);
		}

		const user = await this.mongodbService.editPasswordUser(body.userId, SHA256(body.oldPassword).toString(enc.Hex), SHA256(body.password).toString(enc.Hex));

		if(!user) {
			throw new HttpException("Error updating", HttpStatus.BAD_REQUEST);
		}
		return true;
	}

	@HttpCode(HttpStatus.OK)
	@Get("user/create-verify")
	async createVerifyCode(@Req() req) {
		const code = await this.mongodbService.createVerifyCode(req.user.id);
		if(!code) {
			throw new HttpException("Could not create a verification code", HttpStatus.BAD_REQUEST);
		}
		return true;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("user/verify-email")
	async verifyEmail(@Query("userId") userId: string, @Query("code") code: string) {
		const result = await this.mongodbService.verifyEmail(userId, code);
		if(!result) {
			throw new HttpException("Verification failed", HttpStatus.BAD_REQUEST);
		}
		return true;
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
	@Get("category/get")
	async getCategory(@Query("categoryId") categoryId: string) {
		const result = await this.mongodbService.findCategoryById(categoryId);
		if(!result || !result.category) {
			throw new HttpException("Categories not found", HttpStatus.NOT_FOUND);
		}
		if(result.cache) {
			return result.category;
		} else {
			return result.category.toObject();
		}
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("category/get-all")
	async getAllCategory() {
		const categories = await this.mongodbService.findAllCategory();
		if(!categories) {
			throw new HttpException("Categories not found", HttpStatus.NOT_FOUND);
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
	@Get("forum/get")
	async getForum(@Query("forumId") forumId: string) {
		const result = await this.mongodbService.findForumById(forumId);
		if(!result || !result.forum) {
			throw new HttpException("Forum not found", HttpStatus.NOT_FOUND);
		}
		if(result.cache) {
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
	@Get("thread/get")
	async getThreads(@Query("forumId") forumId: string, @Query("offset") offset: number, @Query("limit") limit: number, @Query("threadId") threadId: string) {
		if(threadId) {
			const result = await this.mongodbService.findThreadById(threadId);
			if(!result || !result.thread) {
				throw new HttpException("Thread not found", HttpStatus.NOT_FOUND);
			}
			return result.thread;
		}
		const threads = await this.mongodbService.findThread(forumId, offset, limit);
		if(!threads) {
			throw new HttpException("Threads not found", HttpStatus.NOT_FOUND);
		} 
		return threads;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("thread/get-lastest")
	async getLastestThread(@Query("forumId") forumId: string) {
		const thread = await this.mongodbService.findLastestThread(forumId);
		if(!thread) {
			throw new HttpException("Thread not found", HttpStatus.NOT_FOUND);
		}
		const message = await this.mongodbService.findLastestMessage(thread._id.toHexString());
		const result = await this.mongodbService.findUserById(message.user);
		if(result.cache) {
			const { email, password, setting, ...nonSensitive} = result.user;
			return [thread, message, nonSensitive];
		} else {
			const { email, password, setting, ...nonSensitive} = result.user.toObject();
			return [thread, message, nonSensitive];
		}
	}

	@HttpCode(HttpStatus.OK)
	@Post("thread/create")
	async createThread(@Req() req, @Body() body: CreateThread) {
		if(req.user.id !== body.userId) {
			throw new HttpException("User not match", HttpStatus.BAD_REQUEST);
		}
		const thread = await this.mongodbService.createThread(body.forumId, body.userId, body.threadTitle, body.tag);
		if(!thread) {
			throw new HttpException("Error creating", HttpStatus.BAD_REQUEST);
		}
		const message = await this.mongodbService.createMessage(thread._id.toHexString(), body.userId, body.threadContent);
		return {thread, message};
	}

	@HttpCode(HttpStatus.OK)
	@Post("/thread/update")
	async updateThread(@Req() req, @Body() body: UpdateThread){
		if(req.user.id !== body.userId) {
			throw new HttpException("User not match", HttpStatus.BAD_REQUEST);
		}
		const result = await this.mongodbService.editThread(body.threadId, body.threadPrefix, body.threadTitle, body.threadContent, body.tag);
		if(!result) {
			throw new HttpException("Error updating", HttpStatus.BAD_REQUEST);
		}
		return result;
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
	@Get("message/get-lastest")
	async getLastestMessage(@Query("threadId") threadId: string) {
		const message = await this.mongodbService.findLastestMessage(threadId);
		if(!message) {
			throw new HttpException("Thread not found", HttpStatus.NOT_FOUND);
		}
		const result = await this.mongodbService.findUserById(message.user);
		if(result.cache) {
			const { email, setting, password, ...nonSensitive } = result.user;
			return [message, nonSensitive];
		} else {
			const { email, setting, password, ...nonSensitive } = result.user.toObject();
			return [message, nonSensitive];
		}
	}

	@HttpCode(HttpStatus.OK)
	@Post("/message/update")
	async updateMessage(@Req() req, @Body() body: UpdateMessage){
		if(req.user.id !== body.userId) {
			throw new HttpException("User not match", HttpStatus.BAD_REQUEST);
		}
		const result = await this.mongodbService.editMessage(body.messageId, body.content);
		if(!result) {
			throw new HttpException("Error updating", HttpStatus.BAD_REQUEST);
		}
		return result;
	}

	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("message/get")
	async getMessage(@Query("threadId") threadId: string, @Query("offset") offset: number, @Query("limit") limit: number, @Query("messageId") messageId: string) {
		if(messageId) {
			const message = await this.mongodbService.findMessageById(messageId);
			if(!message) {
				throw new HttpException("Message not found", HttpStatus.NOT_FOUND);
			}
			return message;
		}
		const messages = await this.mongodbService.findMessage(threadId, offset, limit);
		if(!messages) {
			throw new HttpException("Messages not found", HttpStatus.NOT_FOUND);
		}
		return messages;
	}
}