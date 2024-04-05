import {
  Inject,
  Injectable, 
  Logger 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SHA256, enc } from 'crypto-js';
import { Login } from './login.entity';
import { User } from './user.entity';
import { Forum } from './forum.entity';
import { Thread } from './thread.entity';
import { Message } from './message.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { RedisCache } from 'cache-manager-redis-yet';

@Injectable()
export class DatabaseService {
  constructor(
    @InjectRepository(Login)
    private readonly loginRepository: Repository<Login>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Forum)
    private readonly forumRepository: Repository<Forum>,

    @InjectRepository(Thread)
    private readonly threadRepository: Repository<Thread>,

    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: RedisCache,
  ) {}

  private readonly logger = new Logger(DatabaseService.name);
  private readonly CACHE_TIME = 600; // 10 minutes
  private readonly MESSAGES_PER_PAGE = 20;

  // Get metadata of database
  async getMetadata() : Promise<[number, number, number, string]> {
    try {
      const cacheData: [number, number, number, string] = await this.cacheManager.get("metadata");
      if(cacheData) {
        this.logger.log("CACHE:::Get metadata succeeded");
        return cacheData;
      }

      let threads = await this.threadRepository.count();
      let messages = await this.messageRepository.count();
      let members = await this.loginRepository.count();
      let lastestMember = await this.loginRepository
      .createQueryBuilder()
      .orderBy("create_time", "DESC")
      .getOne();

      this.logger.log("DB:::Get metadata succeeded");
      this.cacheManager.set("metadata", [threads, messages, members, lastestMember ? lastestMember.username : "N/A"], this.CACHE_TIME);
      return [threads, messages, members, lastestMember ? lastestMember.username : "N/A"];
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }
  
  // Function attempting to insert new account into login table
  async createNewLogin(
    username: string, 
    password: string, 
    email: string
  ): Promise<boolean> {
    try {
      //1.  Check username and email in database
      let account = await this.loginRepository
      .createQueryBuilder()
      .where("username = :username", {username})
      .orWhere("email = :email", {email})
      .getOne();

      if(account !== null){
        this.logger.log("Create new account failed, username or email existed");
        return false;
      }
      
      //2.  Hash the password and get current date
      let create_time = new Date();
      password = SHA256(password).toString(enc.Hex);
      const login = this.loginRepository.create({ 
        create_time, 
        username, 
        password, 
        email
      });
      
      //3.  Create a login and a user to database
      await this.loginRepository.save(login);
      await this.createNewUser(username, email);
      this.logger.log(`Create new account succeeded, ${username}`);

      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // Create user information for login account
  // Will attempt to change cached metadata if exists
  async createNewUser(
    username: string, 
    email: string
  ) : Promise<boolean> {
    try {
      // Create a new User and save to database
      const user = this.userRepository.create({ 
        username: username, 
        email: email, 
        date_of_birth: null, 
        location: null, 
        about: null, 
        twofa: false, 
        website: null,
        avatar: null,
        likes: 0,
        messages: 0,
        class: 1,
      });

      let cacheMetadata: [number, number, number, string] = await this.cacheManager.get("metadata");
      if(cacheMetadata) {
        cacheMetadata[2]++;
        cacheMetadata[3] = username;
        this.cacheManager.set("metadata", cacheMetadata, this.CACHE_TIME);
      }

      await this.userRepository.save(user);
      this.logger.log("Created new user associated with email: " + email);
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }
  
  // Create new forum 
  async createNewForum(
    forum_name: string, 
    category: string, 
    about: string,
    privilege: number
  ) : Promise<boolean> {
    try {
      //1.  Create a new Forum and save to database
      const forum = this.forumRepository.create({ 
        forum_name: forum_name, 
        category: category, 
        about: about, 
        messages: 0, 
        threads: 0,
        delete: false,
        privilege: privilege
      });

      await this.forumRepository.save(forum);
      this.logger.log(`Create new forum succeeded, ${forum}`);
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // Create new thread
  // Will attempt to change cached metadata if exists
  async createNewThread(
    forum_id: number, 
    user_id: number, 
    content: string,
    thread_title: string,
    tag: string[]
  ) : Promise<boolean> {
    try {
      //1.  Find forum thread belong to
      let forumData = await this.findOneForum(forum_id);
      if(forumData === null) {
        this.logger.log("Create new thread failed, forum not found");
        return false;
      }
      // increase thread count and save
      forumData.forum.threads++;
      await this.forumRepository.save(forumData.forum);

      //2.  Create a new Thread and save to database
      let create_time = new Date();
      let thread = this.threadRepository.create({
        forum_id: forum_id, 
        user_id, 
        thread_title: thread_title,
        create_time: create_time,
        last_update_time: create_time,
        replies: 0, 
        views: 0, 
        tag: tag,
        delete: false,
        privilege: forumData.forum.privilege // inherit forum privilege
      });
      thread = await this.threadRepository.save(thread);
      
      //3.  Create a new message linked to this thread and save
      const message = this.messageRepository.create({
        thread_id: thread.id,
        user_id,
        content: content,
        send_time: create_time,
        last_update_time: create_time,
        reactions: [0, 0, 0, 0, 0, 0, 0],
        delete: false,
      });
      await this.messageRepository.save(message);

      let cacheMetadata: [number, number, number, string] = await this.cacheManager.get("metadata");
      if(cacheMetadata) {
        cacheMetadata[0]++;
        cacheMetadata[1]++;
        this.cacheManager.set("metadata", cacheMetadata, this.CACHE_TIME);
      }
      
      this.logger.log(`Create new thread succeeded, ${thread}`);
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // Create new message
  // Will attempt to change cached metadata if exists
  async createNewMessage(
    thread_id: number, 
    user_id: number, 
    content: string
  ) : Promise<boolean> {
    try {
      //1.  Find thread with id 'thread_id'
      let threadData = await this.findOneThread(thread_id);
      if(threadData === null) {
        this.logger.log("Created new message failed, thread not found")
        return false;
      }

      //2.  Find forum thread belong to
      let forumData = await this.findOneForum(threadData.thread.forum_id);
      if(forumData === null) {
        this.logger.log("Created new message failed, forum not found");
      }

      //3.  Create a new Message
      let create_time = new Date();
      const message = this.messageRepository.create({ 
        thread_id,
        content,
        user_id,
        send_time: create_time,
        last_update_time: create_time,
        reactions: [0, 0, 0, 0, 0, 0, 0],
        delete: false
      });
      
      //4.  Increase messages count and save
      forumData.forum.messages++;
      threadData.thread.replies++;
      await this.forumRepository.save(forumData.forum);
      await this.threadRepository.save(threadData.thread);
      await this.messageRepository.save(message);

      let cacheMetadata = this.cacheManager.get("metadata");
      if(cacheMetadata) {
        cacheMetadata[1]++;
        this.cacheManager.set("metadata", cacheMetadata, this.CACHE_TIME);
      }
      
      this.logger.log(`Created new message succeeded, ${message}`);
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // Find an account with username or email match the param
  async findUserLogin(
    username: string, 
    email: string,
    id?: number
  ): Promise<{cache: boolean, login: Login} | null> {
    try {
      if(id) {
        const cacheLogin: Login = await this.cacheManager.get(`login:${id}`);
        if(cacheLogin) {
          this.logger.log(`CACHE:::Find user login succeeded, login:${id}`);
          return {cache: true, login: cacheLogin};
        }
      }

      let account = await this.loginRepository
      .createQueryBuilder()
      .where("username = :username", {username})
      .orWhere("email = :email", {email})
      .orWhere("id = :id", {id})
      .getOne();

      if(account === null) {
        this.logger.log("DB:::Find user login failed, got null");
        return null;
      }
      
      await this.cacheManager.set(`login:${id}`, account, this.CACHE_TIME);
      this.logger.log(`DB:::Find user login succeeded, ${username}`);
      return {cache: false, login: account};
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find User profile
  async findUser(
    email: string,
    username: string,
    id: number
  ) : Promise<{cache: boolean, user: any} | null> {
    try {
      const cacheUser: any = await this.cacheManager.get(`user:${id}`);
      if(cacheUser) {
        this.logger.log(`CACHE:::Find user profile succeeded, ${username}`);
        return {cache: true, user: cacheUser};
      }
      
      let user = await this.userRepository
      .createQueryBuilder()
      .where("id = :id", {id})
      .orWhere("email = :email", {email})
      .orWhere("username = :username", {username})
      .getOne();
      
      // reject finding admin or root account
      if(user !== null && user.class > 2) {
        this.logger.log("DB:::Find user profile failed, got null or trying to find admin class account");
        return null;
      }
      let loginData = await this.findUserLogin(username, email, id);
      
      await this.cacheManager.set(`user:${id}`, {...user, create_time: loginData.login.create_time}, this.CACHE_TIME);
      this.logger.log(`DB:::Find user profile succeeded, ${username}`);
      return {cache: false, user: {...user, create_time: loginData.login.create_time}};
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find a forum with forum_id
  async findOneForum(
    forum_id: number
  ): Promise<{cache: boolean, forum: Forum} | null> {
    try {
      const cacheForum: Forum = await this.cacheManager.get(`forum:${forum_id}`);
      if(cacheForum) {
        this.logger.log(`CACHE:::Find forum succeeded, forum:${forum_id}`);
        return {cache: true, forum: cacheForum};
      }

      let forum = await this.forumRepository
      .createQueryBuilder()
      .where("id = :forum_id", {forum_id})
      .getOne();

      if(forum === null) {
        this.logger.log("DB:::Find forum failed, got null");
        return null;
      }

      await this.cacheManager.set(`forum:${forum_id}`, forum, this.CACHE_TIME);
      this.logger.log(`DB:::Find forum succeeded, forum:${forum_id}`);
      return {cache: false, forum};
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find all forums belong to a category
  async findForumCategory(
    category: string
  ) : Promise<Forum[] | null> {
    try {
      const cacheCategoryForum: Forum[] = await this.cacheManager.get(`category:${category}:forum`);
      if(cacheCategoryForum) {
        this.logger.log(`CACHE:::Find forums of a category succeeded, category:${category}`);
        return cacheCategoryForum;
      }

      let forums = await this.forumRepository
      .createQueryBuilder()
      .where("category = :category", {category})
      .take(1000)
      .getMany();

      if(forums === null) {
        this.logger.log("DB:::Find forums of a category failed, got null");
        return null;
      }

      await this.cacheManager.set(`category:${category}:forum`, forums, this.CACHE_TIME);
      this.logger.log(`DB:::Find forums of a category succeeded, category:${category}`);
      return forums;
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find all forums
  async findAllForum(): Promise<Forum[] | null> {
    try {
      let forums = await this.forumRepository
      .createQueryBuilder()
      .take(1000)
      .getMany();

      this.logger.log(`Find all forums succeeded, found ${forums.length} forums`);
      return forums;
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find a thread with thread_id
  async findOneThread(
    thread_id: number
  ): Promise<{cache: boolean, thread: Thread} | null> {
    try {
      const cacheThread: Thread = await this.cacheManager.get(`thread:${thread_id}`);
      if(cacheThread) {
        this.logger.log(`CACHE:::Find thread succeeded, thread:${thread_id}`);
        return {cache: true, thread: cacheThread};
      }

      let thread = await this.threadRepository
      .createQueryBuilder()
      .where("id = :thread_id", {thread_id})
      .getOne();

      if(thread === null) {
        this.logger.log(`DB:::Find thread failed, got null`);
        return null;
      }

      await this.cacheManager.set(`thread:${thread_id}`, thread, this.CACHE_TIME);
      this.logger.log(`DB:::Find thread succeeded, thread:${thread_id}`);
      return {cache: false, thread};
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find a thread with all its messages
  // This count as user view a pages so increase view by 1
  async findThreadFull(
    thread_id: number
  ) : Promise<{thread: Thread, messages: Message[]} | null> {
    try {
      let threadData = await this.findOneThread(thread_id);
      if(threadData === null) {
        return null;
      }
      
      threadData.thread.views++;
      await this.threadRepository.save(threadData.thread);
      if(threadData.cache) {
        await this.cacheManager.set(`thread:${thread_id}`, threadData.thread, this.CACHE_TIME);
      }
      let messages = await this.findMessage(thread_id, 20, 0);
    
      this.logger.log(`Find thread succeeded, thread:${thread_id}`);
      return {thread: threadData.thread, messages};
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find all threads of a forum
  async findThreadForum(
    forum_id: number
  ): Promise<Thread[] | null> {
    try {
      let threads = await this.threadRepository
      .createQueryBuilder()
      .where("forum_id = :forum_id", {forum_id})
      .orderBy("create_time", "DESC")
      .take(1000)
      .getMany();

      if(threads === null) {
        this.logger.log("DB:::Find threads of a forum failed, got null");
        return null;
      }

      this.logger.log(`DB:::Find threads of a forum succeeded, forum:${forum_id}`);
      return threads;
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find threads of a forum
  async findThread(
    forum_id: number,
    limit: number,
    offset: number,
  ): Promise<Thread[] | null> {
    try {
      let threads = await this.threadRepository
      .createQueryBuilder()
      .where("forum_id = :forum_id", {forum_id})
      .orderBy("create_time", "DESC")
      .skip(offset)
      .take(limit)
      .getMany();

      if(threads === null) {
        this.logger.log(`DB:::Find threads of a forum failed, got null`);
        return null;
      }

      this.logger.log(`DB:::Find threads of a forum succeeded, forum_id:${forum_id} offset:${offset} limit:${limit}`);
      return threads;
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find all threads of a user
  async findThreadUser(
    user_id: number
  ): Promise<Thread[] | null> {
    try {
      const cacheThreads: Thread[] = await this.cacheManager.get(`user:${user_id}:thread`);
      if(cacheThreads) {
        this.logger.log(`CACHE:::Find threads of user succeeded`);
        return cacheThreads;
      }
      let threads = await this.threadRepository
      .createQueryBuilder()
      .where("user_id = :user_id", {user_id})
      .take(1000)
      .getMany();

      if(threads === null) {
        this.logger.log(`DB:::Find threads of user failed, got null`);
        return null;
      }

      await this.cacheManager.set(`user:${user_id}:thread`, threads, this.CACHE_TIME/2);
      this.logger.log(`DB:::Find threads of user succeeded`);
      return threads;
    } catch(error) {
      this.logger.error(error);
    }
  }

  // find lastest thread of a forum
  async findLastestThread(
    forum_id: number
  ): Promise<Thread | null> {
    try {
      const cacheThread: Thread = await this.cacheManager.get(`forum:${forum_id}:thread:lastest`);
      if(cacheThread) {
        this.logger.log(`CACHE:::Find lastest thread succeeded, ${forum_id}`);
        return cacheThread;
      }

      let thread = await this.threadRepository
      .createQueryBuilder()
      .where("forum_id = :forum_id", {forum_id})
      .orderBy("last_update_time", "DESC")
      .getOne();

      if(thread === null) {
        this.logger.log("DB:::Find lastest thread failed, got null");
        return null;
      }

      await this.cacheManager.set(`forum:${forum_id}:thread:lastest`, thread, this.CACHE_TIME);
      this.logger.log(`DB:::Find lastest thread succeeded, forum:${forum_id}`);
      return thread;
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // find a message with id 'message_id'
  async findOneMessage(
    message_id: number
  ): Promise<{cache: boolean, message: Message} | null> {
    try {
      const cacheMessage: Message = await this.cacheManager.get(`message:${message_id}`);
      if(cacheMessage) {
        this.logger.log(`CACHE:::Find message succeeded, message:${message_id}`);
        return {cache: true, message: cacheMessage};
      }

      let message = await this.messageRepository
      .createQueryBuilder()
      .where("id = :id", {id: message_id})
      .getOne();

      if(message === null) {
        this.logger.log(`DB:::Find message failed, got null`);
        return null;
      }

      await this.cacheManager.set(`message:${message_id}`, message, this.CACHE_TIME);
      this.logger.log(`DB:::Find message succeeded, ${message}`);
      return {cache: false, message};
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // find first message of a thread
  async findFirstMessageThread(
    thread_id: number
  ): Promise<Message | null> {
    try {
      const cacheMessage: Message = await this.cacheManager.get(`thread:${thread_id}:message:first`);
      if(cacheMessage) {
        this.logger.log(`CACHE:::Find original message succeeded, thread:${thread_id}`);
        return cacheMessage;
      }

      let message = await this.messageRepository
      .createQueryBuilder()
      .where("thread_id = :thread_id", {thread_id})
      .orderBy("send_time", "ASC")
      .getOne();

      if(message === null) {
        this.logger.log("DB:::Find original message failed, got null");
      }
      
      this.cacheManager.set(`thread:${thread_id}:message:first`, message, this.CACHE_TIME);
      this.logger.log(`Find original message succeeded, thread:${thread_id}`);
      return message;
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find all messages of a thread
  async findAllMessageThread(
    thread_id: number
  ): Promise<Message[] | null> {
    try {
      let messages = await this.messageRepository
      .createQueryBuilder()
      .where("thread_id = :thread_id", {thread_id})
      .take(1000)
      .getMany();

      this.logger.log(`Find messages of a thread succeeded, thread:${thread_id}`);
      return messages;
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Find messages of a thread with limit and offset
  async findMessage(
    thread_id: number,
    limit: number,
    offset: number
  ): Promise<Message[] | null > {
    try {
      if(limit === this.MESSAGES_PER_PAGE) {
        const cacheMessages: Message[] = await this.cacheManager.get(`thread:${thread_id}:message:${Math.floor(offset / this.MESSAGES_PER_PAGE)}`);
        if(cacheMessages) {
          this.logger.log(`CACHE:::Find messages of a forum succeeded, thread:${thread_id} page:${offset / this.MESSAGES_PER_PAGE}`);
          return cacheMessages;
        }

        let messages = await this.messageRepository
        .createQueryBuilder()
        .where("thread_id = :thread_id", {thread_id})
        .orderBy("send_time", "ASC") // time ascending to find earliest first
        .skip(offset)
        .take(limit)
        .getMany();

        if(messages === null) {
          this.logger.log("DB:::Find messages of a forum failed, got null");
          return null;
        }

        await this.cacheManager.set(`thread:${thread_id}:message:${Math.floor(offset / this.MESSAGES_PER_PAGE)}`, messages, this.CACHE_TIME);
        this.logger.log(`Find messages succeeded, thread:${thread_id}`);
        return messages;
      } else {
        let messages = await this.messageRepository
        .createQueryBuilder()
        .where("thread_id = :thread_id", {thread_id})
        .orderBy("send_time", "ASC") // time ascending to find earliest first
        .skip(offset)
        .take(limit)
        .getMany();

        this.logger.log(`DB:::Find messages succeeded, thread:${thread_id}`);
        return messages;
      }
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // find messages sent by a user
  async findMessageUser(
    user_id: number
  ) : Promise<Message[] | null> {
    try {
      let messages = await this.messageRepository
      .createQueryBuilder()
      .where("user_id = :user_id", {user_id})
      .take(1000)
      .getMany();

      this.logger.log(`Find messages of user succeeded, user:${user_id}`);
      return messages;
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }
  
  // find lastest message and the sender of a thread
  async findLastestMessageThread(
    thread_id: number
  ): Promise<Message | null> {
    try {
      const cacheMessage: Message = await this.cacheManager.get(`thread:${thread_id}:message:lastest`);
      if(cacheMessage) {
        this.logger.log(`CACHE:::Find lastest message of a thread succeeded, thread:${thread_id}`);
        return cacheMessage;
      }

      let message = await this.messageRepository
      .createQueryBuilder()
      .where("thread_id = :thread_id", {thread_id})
      .orderBy("send_time", "DESC") // find lastest first
      .getOne();

      if(message === null) {
        this.logger.log("Find lastest message failed, got null");
        return null;
      }

      await this.cacheManager.set(`thread:${thread_id}:message:lastest`, message, this.CACHE_TIME);
      this.logger.log(`Find lastest message succeeded, ${message}`);
      return message;
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // Update password for an account
  async updatePassword(
    id: number,
    email: string,
    username: string,
    password: string
  ) : Promise<boolean> {
    try {
      let loginData = await this.findUserLogin(email, username, id);
      let userData = await this.findUser(email, username, id);
      if(loginData === null || userData === null) {
        this.logger.debug(`Update user password failed, account not found`);
        return false;
      }
      
      // check 2fa factor
      if(userData.user.twofa) {
        
      }

      loginData.login.password = password;
      await this.loginRepository.save(loginData.login);
      if(loginData.cache) {
        await this.cacheManager.set(`login:${id}`, loginData.login, this.CACHE_TIME);
      }
      this.logger.log(`Update user password succeeded, user:${id}`);
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // Update user information
  async updateUser(
    id: number,
    email: string,
    username: string,
    newDate_of_birth: Date, 
    newLocation: string, 
    newAbout: string, 
    newAvatar: string
  ) : Promise<any> {
    try {
      let userData = await this.findUser(email, username, id);
      if(userData === null) {
        this.logger.debug("Update user failed, user not found");
        return null;
      }

      // change information if it's not null
      userData.user.date_of_birth = newDate_of_birth && newDate_of_birth;
      userData.user.location = newLocation && newLocation;
      userData.user.about = newAbout && newAbout;
      userData.user.avatar = newAvatar && newAvatar;

      await this.userRepository.save(userData.user);
      if(userData.cache) {
        await this.cacheManager.set(`user:${id}`, userData.user);
      }
      this.logger.log(`Update user succeeded, user:${id}`);
      return userData.user;
    } catch(error) {
      this.logger.error(error);
      return null;
    }
  }

  // update username of user
  async updateUsernameUser(
    id: number,
    email: string,
    newUsername: string
  ) : Promise<boolean> {
    try {
      let userData = await this.findUser(email, email, id);
      if(userData === null) {
        this.logger.debug("Update username failed, user not found");
        return false;
      }

      let _userData = await this.findUser(newUsername, newUsername, 0);
      if(_userData !== null) {
        this.logger.debug("Update username failed, username exist");
        return false;
      }

      let loginData = await this.findUserLogin(email, email, id);
      loginData.login.username = newUsername;
      userData.user.username = newUsername;
      await this.loginRepository.save(loginData.login);
      await this.userRepository.save(userData.user);
      if(loginData.cache) {
        await this.cacheManager.set(`login:${id}`, loginData.login, this.CACHE_TIME);
      }
      if(userData.cache) {
        await this.cacheManager.set(`user:${id}`, userData.user, this.CACHE_TIME);
      }

      this.logger.log("Update username succeeded");
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // update email of user
  async updateEmailUser(
    id: number,
    username: string,
    newEmail: string,
  ) : Promise<boolean> {
    try {
      let userData = await this.findUser(username, username, id);
      if(userData === null) {
        this.logger.debug("Update email failed, user not found");
        return false;
      }

      let _userData = await this.findUser(newEmail, newEmail, 0);
      if(_userData !== null) {
        this.logger.debug("Update email failed, email exist");
        return false;
      }

      let loginData = await this.findUserLogin(username, username, id);
      loginData.login.email = newEmail;
      userData.user.email = newEmail;
      await this.loginRepository.save(loginData.login);
      await this.userRepository.save(userData.user);
      if(loginData.cache) {
        await this.cacheManager.set(`login:${id}`, loginData.login, this.CACHE_TIME);
      }
      if(userData.cache) {
        await this.cacheManager.set(`user:${id}`, userData.user, this.CACHE_TIME);
      }

      this.logger.log("Update email succeeded");
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // update a thread
  async updateThread(
    thread_id: number,
    content: string,
    thread_title: string,
    tag: string[], // optional
    user_id: number // for verification
  ) : Promise<boolean> {
    try {
      let threadData = await this.findOneThread(thread_id);
      if(threadData === null) {
        this.logger.debug("Update thread failed, thread not found");
        return false;
      }
      if(threadData.thread.user_id !== user_id) {
        this.logger.debug("Update thread failed, user not match");
        return false;
      }
      
      // find original message
      let update_time = new Date();
      threadData.thread.last_update_time = update_time;
      threadData.thread.thread_title = thread_title
      if(tag !== null) {
        threadData.thread.tag = tag;
      }
      await this.threadRepository.save(threadData.thread);

      // if content !== null, update message also
      if(content !== null) {
        let message = await this.findFirstMessageThread(thread_id);
        message.content = content;
        message.last_update_time = update_time;
        await this.messageRepository.save(message);
      }

      if(threadData.cache) {
        await this.cacheManager.set(`thread:${thread_id}`, threadData.thread);
      }
      await this.cacheManager.set(`forum:${threadData.thread.forum_id}:thread:lastest`, threadData.thread);
      
      this.logger.log(`Update thread succeeded, thread:${thread_id}`);
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // update thread reaction
  async updateMessageReaction(
    message_id: number,
    reaction_type: number,
    user_id: number
  ) {
    try {
      let messageData = await this.findOneMessage(message_id);
      if(messageData === null) {
        this.logger.log("Update message reactions failed, message not found");
        return false;
      }

      messageData.message.reactions[reaction_type]++;
      await this.messageRepository.save(messageData.message);
      if(messageData.cache) {
        await this.cacheManager.set(`message:${message_id}`, messageData.message);
      }
      this.logger.log(`Update message reactions succeeded, message:${message_id}`);
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // update a message
  async updateMessage(
    message_id: number,
    content: string,
    user_id: number // for verification
  ) : Promise<boolean> {
    try {
      let messageData = await this.findOneMessage(message_id);
      if(messageData === null) {
        this.logger.log("Update message failed, message not found");
        return false;
      }
      if(messageData.message.user_id !== user_id) {
        this.logger.log("Update message failed, user not match");
        return false;
      }

      // update message and save to database
      let update_date = new Date();
      messageData.message.content = content;
      messageData.message.last_update_time = update_date;
      await this.messageRepository.save(messageData.message);
      if(messageData.cache) {
        await this.cacheManager.set(`message:${message_id}`, messageData.message);
      }
      await this.cacheManager.set(`thread:${messageData.message.thread_id}:message:lastest`, messageData.message);

      this.logger.log(`Update message succeeded, message:${message_id}`);
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // delete a thread
  async deleteThread(
    thread_id: number
  ) : Promise<boolean> {
    try {
      let threadData = await this.findOneThread(thread_id);
      if(threadData === null) {
        this.logger.log("Delete thread failed, thread not found");
        return false;
      }

      // find original message
      // set delete flag to true and save

      // let message = await this.findFirstMessageThread(threadData.thread.id);
      // message.delete = true;
      //await this.messageRepository.save(message);
      threadData.thread.delete = true;
      await this.threadRepository.save(threadData.thread);
      await this.cacheManager.del(`thread:${threadData.thread.id}`);
      await this.cacheManager.del(`forum:${threadData.thread.forum_id}:thread:lastest`);

      this.logger.log(`Delete thread succeeded, thread:${thread_id}`);
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }

  // delete a message
  async deleteMessage(
    message_id: number
  ) : Promise<boolean> {
    try {
      let messageData = await this.findOneMessage(message_id);
      if(messageData === null) {
        this.logger.log("Delete message failed, message not found");
        return false;
      }

      // set delete flag to true and save
      messageData.message.delete = true;
      await this.messageRepository.save(messageData.message);
      await this.cacheManager.del(`message:${message_id}`);
      await this.cacheManager.del(`thread:${messageData.message.thread_id}:message:lastest`);

      this.logger.log(`Delete message succeeded, message:${message_id}`);
      return true;
    } catch(error) {
      this.logger.error(error);
      return false;
    }
  }
}
