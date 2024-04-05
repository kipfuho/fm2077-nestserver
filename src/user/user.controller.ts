import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { 
	Body, 
	Controller, 
	Get, 
	HttpCode, 
	HttpException, 
	HttpStatus,
	InternalServerErrorException, 
	Logger, 
	Param, 
	Post, 
	Query, 
	Req,
	Res,
	StreamableFile,
	UploadedFile,
	UploadedFiles,
	UseInterceptors
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { createReadStream, statSync } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';
import { AuthService } from 'src/auth/auth.service';
import { Public } from 'src/auth/public';
import { DatabaseService } from 'src/database/db.service';
import { CreateMessageDto, CreateThreadDto } from 'src/interface/create.dto';
import { GetForumCategoryDto, GetMessageThreadDto, GetThreadForumDto } from 'src/interface/get.dto';
import { getFileType } from 'src/utils/helper';

@Controller()
export class UserController {
	constructor(
		private readonly dbService: DatabaseService,
		private readonly authService: AuthService,
		private readonly jwtService: JwtService,
	) {}

	private logger = new Logger(UserController.name);
	
	/* --------------------------------------------------------------------------
		API for user repository


	*/ 


	//0
	@HttpCode(HttpStatus.OK)
	@Get("/user/profile")
	async getProfile(@Req() req: any) {
		this.logger.log(`API GET /user/profile succeeded, user:${req.user.id}`);
		return req.user;
	}

	//1. 	return all account information belong to a user
	@HttpCode(HttpStatus.OK)
	@Get("/user/get-profile")
	async getProfileDetail(@Req() req: any) {
		const {email, username, id} = req.user;
		const userData = await this.dbService.findUser(email, username, id);
		if(userData !== null) {
			this.logger.log(`API GET /user/get-profile succeeded, user:${id}`);
			return userData.user;
		} else {
			this.logger.debug("API GET /user/get-profile failed, user not found");
			throw new HttpException("User not found", HttpStatus.BAD_REQUEST);
		}
	}

	//2. 	return public profile of a user
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/user/get-public-profile")
	async postPublicProfile(@Body() body: {email?: string, username?: string, id?: number}) {
		const {email, username, id} = body;
		const userData = await this.dbService.findUser(email, username, id);
		if(userData !== null) {
			this.logger.log(`API POST /user/get-public-profile succeeded through database, user:${id}`);
			const {twofa, ...result} = userData.user;
			return result;
		} else {
			this.logger.debug("API POST /user/get-public-profile failed, can't find user");
			throw new HttpException("User not found", HttpStatus.BAD_REQUEST);
		}
	}

	//3. 	return public profile of a user
	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("/user/get-public-profile")
	async getPublicProfile(@Query("username") username?: string, @Query("email") email?: string, @Query() id?: number) {
		const userData = await this.dbService.findUser(email, username, id);
		if(userData !== null) {
			this.logger.log(`API GET /user/get-public-profile succeeded, user:${id}`);
			const {twofa, ...result} = userData.user;
			return result;
		} else {
			this.logger.debug("API GET /user/get-profile failed, can't find user");
			throw new HttpException("User not found", HttpStatus.BAD_REQUEST);
		}
	}

	//4. Update existing user
	@HttpCode(HttpStatus.OK)
	@Post("/user/update")	
	async updateUser(@Req() req: any, @Body() body: {dob: Date, location: string, about: string, avatar: string}) {
		const {id} = req.user;
		if(!body) {
			this.logger.log("API POST /user/update failed, no body found");
			throw new HttpException("fail to update", HttpStatus.BAD_REQUEST);
		}

		const user = await this.dbService.updateUser(
			req.user.id,
			req.user.email,
			req.user.username,
			body.dob,
			body.location,
			body.about,
			body.avatar
		);

		if(user) {
			this.logger.log(`API POST /user/update succeeded, user:${id}`);
			return true;
		} else {
			this.logger.log("API POST /user/update failed");
			throw new HttpException("failed", HttpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	//5. Update username of user
	@HttpCode(HttpStatus.OK)
	@Post("/user/update-username")
	async updateUsername(@Req() req: any, @Body() body: any, @Res({passthrough: true}) res: any) {
		if(!body) {
			this.logger.log("API POST /user/update-username failed, no body found");
			throw new HttpException("fail to update", HttpStatus.BAD_REQUEST);
		}
		const {id, email} = req.user;

		// update to database first
		const result = await this.dbService.updateUsernameUser(
			id,
			email,
			body.username
		);

		if(result) {
			// generate new token
			const tokenPayload = {id, email, username: body.username};
			const newRefreshToken = this.authService.encryptRefreshToken(tokenPayload);
			res.cookie("jwt", this.jwtService.sign(tokenPayload));
			res.cookie("refresh_token", newRefreshToken);
			// update and save session, cache
			req.session.passport.user.username = body.username;
			req.session.passport.refreshToken = newRefreshToken;
			req.session.save();

			this.logger.log(`API POST /user/update-username succeeded, user:${id}`);
			return true;
		} else {
			this.logger.log("API POST /user/update-username failed");
			throw new HttpException("update username failed", HttpStatus.BAD_REQUEST);
		}
	}

	//6. Update username of user
	@HttpCode(HttpStatus.OK)
	@Post("/user/update-email")
	async updateEmail(@Req() req: any, @Body() body: any, @Res({passthrough: true}) res: any) {
		if(!body) {
			this.logger.log("API POST /user/update-email failed, no body found");
			throw new HttpException("fail to update", HttpStatus.BAD_REQUEST);
		}
		const {id, username} = req.user;

		// update to database first
		const result = await this.dbService.updateEmailUser(
			id,
			username,
			body.email,
		);

		if(result) {
			// generate new token
			const tokenPayload = {id, email: body.email, username};
			const newRefreshToken = this.authService.encryptRefreshToken(tokenPayload);
			res.cookie("jwt", this.jwtService.sign(tokenPayload));
			res.cookie("refresh_token", newRefreshToken);
			// update and save session, cache
			req.session.passport.user.username = body.username;
			req.session.passport.refreshToken = newRefreshToken;
			req.session.save();

			this.logger.log(`API POST /user/update-email succeeded, user:${id}`);
			return true;
		} else {
			this.logger.log("API POST /user/update-email failed");
			throw new HttpException("update email failed", HttpStatus.BAD_REQUEST);
		}
	}


	
	/* --------------------------------------------------------------------------
		API for forum repository


	*/ 


	//1.	return a forum given its id
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/forum/get-forum")
	async getForum(@Body() body : any) {
		const { forum_id } = body;
		const forumData = await this.dbService.findOneForum(forum_id);

		if(forumData !== null) {
			this.logger.log(`API POST /forum/get-forum succeeded, forum:${forum_id}`);
			return forumData.forum;
		} else {
			this.logger.log("API POST /forum/get-forum failed, forum not found");
			throw new HttpException("Forum not found", HttpStatus.BAD_REQUEST);
		}
	}

	//2.	Return all forums
	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("/forum/get-forum")
	async getAllForum(@Query("category") category: string) {
		// if a category is given, return all forums in that category instead
		if(category) {
			const forums = await this.dbService.findForumCategory(category);
			if(forums !== null) {
				this.logger.log(`API GET /forum/get-forum succeeded, category:${category}`);
				return forums;
			} else {
				this.logger.log("API GET /forum/get-forum failed, forum not found");
				throw new HttpException("forums not found", HttpStatus.BAD_REQUEST);
			}
		} else {
			const allForums = await this.dbService.findAllForum();
			if(allForums !== null) {
				this.logger.log("API GET /forum/get-forum succeeded, all forums");
				return allForums;
			} else {
				this.logger.log("API GET /forum/get-forum failed, forums not found");
				throw new HttpException("forums not found", HttpStatus.BAD_REQUEST);
			}
		}
	}

	//3.	Return all forums of a category
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/forum/get-forum-category")
	async postForumCategory(@Body() body : GetForumCategoryDto) {
		const {category} = body;
		const forums = await this.dbService.findForumCategory(category);
		if(forums !== null) {
			this.logger.log(`API /forum/get-forum-category, category:${category}`);
			return forums;
		} else {
			this.logger.log(`API /forum/get-forum-category failed, forums not found`);
			throw new HttpException("forums not found", HttpStatus.BAD_REQUEST);
		}
	}



	/* --------------------------------------------------------------------------
		API for thread repository


	*/ 


	//1.	Create new thread
	@HttpCode(HttpStatus.CREATED)
	@Post("/thread/create-thread")
	async createNewThread(@Req() req: any, @Body() body: CreateThreadDto) {
		const {forum_id, user_id, content, thread_title, tag} = body;
		if(user_id !== req.user.id) {
			this.logger.log("API /thread/create-thread failed, user_id not match");
			throw new HttpException("Error creating new thread", HttpStatus.INTERNAL_SERVER_ERROR);
		}

		const result = await this.dbService.createNewThread(forum_id, user_id, content, thread_title, tag);
		if(result) {
			this.logger.log("API /thread/create-thread succeeded");
			return true;
		} else {
			this.logger.log("API /thread/create-thread failed");
			throw new HttpException("Error creating new thread", HttpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	//2.	Return threads of a given forum
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/thread/get-thread-forum")
	async getTheadForum(@Body() body : GetThreadForumDto) {
		const {forum_id} = body;
		const threads = await this.dbService.findThreadForum(forum_id);

		if(threads !== null) {
			this.logger.log(`API /thread/get-thread-forum succeeded, forum:${forum_id}`);
			return threads;
		} else {
			this.logger.log("API /thread/get-thread-forum failed, threads not found");
			throw new HttpException("threads not found", HttpStatus.NOT_FOUND);
		}
	}

	//3.	return threads made by a user
	@HttpCode(HttpStatus.OK)
	@Get("/thread/get-thread-user")
	async getTheadUser(@Req() req: any) {
		const {id, email} = req.user;
		const threads = await this.dbService.findThreadUser(email);

		if(threads !== null) {
			this.logger.log(`API /thread/get-thread-user succeeded, user:${id}`);
			return threads;
		} else {
			this.logger.log(`API /thread/get-thread-user failed, threads not found`);
			throw new HttpException("threads not found", HttpStatus.NOT_FOUND);
		}
	}

	//4.	this will return a thread and 20 of its messages
	//		this count as user view a page
	@HttpCode(HttpStatus.OK)
	@Public()
	@Post("/thread/get-thread")
	async getThreadFull(@Body() body: GetMessageThreadDto) {
		const {thread_id} = body;
		const thread = await this.dbService.findThreadFull(thread_id);

		if(thread !== null) {
			this.logger.log(`API /thread/get-thread succeeded, thread:${thread_id}`);
			return thread;
		} else {
			this.logger.log(`API /thread/get-thread failed, thread not found`);
			throw new HttpException("thread not found", HttpStatus.NOT_FOUND);
		}
	}

	//5.	Return a thread and its original message
	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("/thread/get-thread-head")
	async getThread(@Query("thread_id") thread_id: number) {
		if(!thread_id) {
			this.logger.debug(`API GET /thread/get-thread-head failed, ${thread_id}`);
			throw new HttpException("check if thread_id is right", HttpStatus.BAD_REQUEST);
		}

		const threadData = await this.dbService.findOneThread(thread_id);
		if(threadData === null) {
			this.logger.log("API GET /thread/get-thread-head failed, thread not found");
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		const firstMessage = await this.dbService.findFirstMessageThread(thread_id);
		if(firstMessage === null) {
			this.logger.log("API GET /thread/get-thread-head failed, first message not found?");
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}

		this.logger.log(`API GET /thread/get-thread-head succeeded, thread:${thread_id}`);
		return {thread: threadData.thread, message: firstMessage};
	}

	//6.	this will return lastest thread of a forum
	// 		meaning the thread with last update time most recently
	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("/thread/get-thread-lastest")
	async getLastestThread(@Query("forum_id") forum_id: number) {
		if(forum_id) {
			const lastestThread = await this.dbService.findLastestThread(forum_id);
			if(lastestThread === null) {
				this.logger.log(`API /thread/get-thread-lastest failed, thread not found`);
				throw new HttpException("thread not found", HttpStatus.NOT_FOUND);
			}
			const lastestMessage = await this.dbService.findLastestMessageThread(lastestThread.id);
			const user = await this.dbService.findUser(null, null, lastestMessage.user_id);

			this.logger.log(`API /thread/get-thread-lastest succeeded, forum:${forum_id}`);
			return {thread: lastestThread, message: lastestMessage, user: user};
		}
		this.logger.log(`API /thread/get-thread-lastest failed, forum_id?`);
		throw new HttpException("check if forum_id is right", HttpStatus.BAD_REQUEST);
	}

	//7. update a thread
	@HttpCode(HttpStatus.OK)
	@Post("thread/update-thread")
	async updateThread(@Req() req: any) {
		const {thread_id, content, thread_title, tag} = req.body;
		const user_id = req.user.id;
		const result = await this.dbService.updateThread(thread_id, content, thread_title, tag, user_id);

		if(result === false) {
			this.logger.log("API /thread/update-thread failed");
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		this.logger.log("API /thread/update-thread succeeded");
		return {message: "updated"};
	}





	/* --------------------------------------------------------------------------
		API for message repository


	*/ 


	//1.	create a new message
	@HttpCode(HttpStatus.CREATED)
	@Post("/message/create-message")
	async createNewMessage(@Req() req: any, @Body() body: CreateMessageDto) {
		const {thread_id, user_id, content} = body;
		if(user_id !== req.user.id) {
			this.logger.log("API POST /user/create-message failed, user not match");
			return false;
		}
		const result = await this.dbService.createNewMessage(thread_id, user_id, content);
		if(result) {
			this.logger.log("API POST /user/create-message succeeded");
			return true;
		} else {
			this.logger.log("API POST /user/create-message failed");
			throw new HttpException("Error creating message", HttpStatus.BAD_REQUEST);
		}
	}

	//2.	get messages of a thread, order by time ascending
	//		limit: number of records returns
	// 		offset: number of records skips
	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("/message/get-message")
	async getMessage(@Query('limit') limit: number, @Query('offset') offset: number, @Query('thread_id') thread_id: number) {
		if(!limit) {
			throw new HttpException("check if limit is right", HttpStatus.BAD_REQUEST);
		}
		if(!offset) {
			throw new HttpException("check if offset is right", HttpStatus.BAD_REQUEST);
		}
		if(!thread_id) {
			throw new HttpException("check if thread_id is right", HttpStatus.BAD_REQUEST);
		}

		const result = await this.dbService.findMessage(thread_id, limit, offset);
		this.logger.log("API /user/get-message " + JSON.stringify(result));
		if(result === null) {
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		return result;
	}
	
	//3.	return messages of a user
	@HttpCode(HttpStatus.OK)
	@Get("/message/get-message-user")
	async getMessageUser(@Req() req : any) {
		const {email} = req.user;
		const result = await this.dbService.findMessageUser(email);
		if(result !== null) {
			this.logger.log("API /user/get-message-user succeeded");
			return result;
		} else {
			this.logger.log("API /user/get-message-user failed");
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
	}

	//4. 	return lastest message of a thread, and who made it
	@HttpCode(HttpStatus.OK)
	@Public()
	@Get("/message/get-message-lastest")
	async getLastestMessage(@Query("thread_id") thread_id: number) {
		const result = await this.dbService.findLastestMessageThread(thread_id);

		if(result !== null) {
			this.logger.log("API /message/get-message-lastest succeeded");
			return result;
		} else {
			this.logger.log("API /message/get-message-lastest failed");
			throw new HttpException("got null", HttpStatus.BAD_REQUEST);
		}
	}
	
	//5. update a message
	@HttpCode(HttpStatus.OK)
	@Post("message/update-message")
	async updateMessage(@Req() req: any) {
		const {message_id, content} = req.body;
		const user_id = req.user.id;
		const result = await this.dbService.updateMessage(message_id, content, user_id);

		if(result === false) {
			this.logger.log("API /message/update-message failed");
			throw new HttpException("null", HttpStatus.BAD_REQUEST);
		}
		this.logger.log("API /message/update-message succeeded");
		return true;
	}
	

	

	

	

	

	/* --------------------------------------------------------------------------
		API for images


	*/ 

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
				this.logger.log("API /image/:fileName failed, image not found");
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

			this.logger.log(`API /image/:fileName succeeded ${file}`);
			res.setHeader('Content-Type', contentType);
			return new StreamableFile(file);
    } catch (error) {
			this.logger.error(`API /image/:fileName, ${error}`);
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
    this.logger.log(`API /image/upload-single succeeded ${attachment.filename}`);
		return { 
			message: "uploaded",
			link: `https://localhost:3001/image/${attachment.filename}`
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
		this.logger.log(`API /image/upload-many succeeded ${files.images}`);
		const links = files.images.map((image) => `https://localhost:3001/image/${image.filename}`);
		return { 
			message: "uploaded",
			link: links
		};
  }

	

	
}