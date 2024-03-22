import { 
  HttpException, 
  HttpStatus, 
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

@Injectable()
export class DatabaseService {
  constructor(
    @InjectRepository(Login)
    private loginRepository: Repository<Login>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(Forum)
    private forumRepository: Repository<Forum>,

    @InjectRepository(Thread)
    private threadRepository: Repository<Thread>,

    @InjectRepository(Message)
    private messageRepository: Repository<Message>
  ) {}

  private readonly logger = new Logger(DatabaseService.name);
  
  // Function attempting to insert new account into login table
  async createNewLogin(
    username: string, 
    password: string, 
    email: string
  ): Promise<{ message: string }> {
    // Check username and email in database
    let checkExist = await this.loginRepository.findOne({ 
      where: [
        {username: username},
        {email: email}
      ]
    });

    if (checkExist !== null){
      this.logger.log("API Create new account failed, username or email existed");
      throw new HttpException('Username or Email existed', HttpStatus.BAD_REQUEST);
    }
    
    // Hash the password and get current date
    let create_time = new Date();
    password = SHA256(password).toString(enc.Hex);
    const login = this.loginRepository.create({ 
      create_time, 
      username, 
      password, 
      email 
    });

    // Create a login and a user to database
    await this.loginRepository.save(login);
    await this.createNewUser(username, password, email);
    this.logger.log("API Create new account succeeded: " + username + " " + email);
    return {
      message: "success"
    };
  }

  // Create user information for login account
  async createNewUser(
    username: string, 
    password: string, 
    email: string
  ) : Promise<{ message: string }> {
    // Create a new User and save to database
    const user = this.userRepository.create({ 
      username: username, 
      password: password, 
      email: email, 
      date_of_birth: null, 
      location: null, 
      about: null, 
      twofa: false, 
      website: null,
      avatar: null
    });

    await this.userRepository.save(user);
    this.logger.log("Created new user associated with email: " + email);
    return { message: "success" };
  }
  
  // Create new forum 
  async createNewForum(
    forum_name: string, 
    category: string, 
    about: string
  ) : Promise<{ message: string }> {
    // Create a new Forum and save to database
    const forum = this.forumRepository.create({ 
      forum_name: forum_name, 
      category: category, 
      about: about, 
      messages: 0, 
      threads: 0
    });

    await this.forumRepository.save(forum);
    this.logger.log("API Create new forum succeeded: " + forum_name);
    return { message: "success" };
  }

  // Create new thread
  async createNewThread(
    forum_id: number, 
    email: string, 
    content: string,
    thread_title: string,
    tag: string[]
  ) : Promise<{ message: string }> {
    // Find forum thread belong to
    let forum = await this.findForum(forum_id);
    if(forum === null) {
      this.logger.debug("Attempting create a thread in an unexisted forum!");
      throw new HttpException("Forum not found", HttpStatus.BAD_REQUEST);
    }
    // increase threads count and save
    forum.threads++;
    await this.forumRepository.save(forum);

    // Create a new Thread and save to database
    let create_time = new Date();
    const thread = this.threadRepository.create({ 
      forum_id, 
      author_email: email, 
      thread_title: thread_title, 
      content: content, 
      create_time: create_time, 
      last_message_id: -1, 
      last_update_time: create_time, 
      replies: 0, 
      views: 0, 
      tag: tag,
      delete: false
    });

    await this.threadRepository.save(thread);
    this.logger.log("API Create new thread succeeded: " + thread_title);
    return {message: "success" };
  }

  // Create new message
  async createNewMessage(
    thread_id: number, 
    email: string, 
    content: string
  ) : Promise<{ message: string }> {
    // Find thread with id 'thread_id'
    let thread = await this.findThread(thread_id);
    if(thread === null) {
      this.logger.log("Created new message failed: Thread not found")
      throw new HttpException("Thread not found", HttpStatus.BAD_REQUEST);
    }
    // Increase replies count
    thread.replies += 1;
    await this.threadRepository.save(thread);

    // Find forum thread belong to
    let forum = await this.findForum(thread.forum_id);
    if(forum === null) {
      this.logger.debug("Thread belongs to unexisted forum");
    }
    // increase messages count and save
    forum.messages++;
    await this.forumRepository.save(forum);
    
    // Create a new Message and save to database
    let create_time = new Date();
    const message = this.messageRepository.create({ 
      thread_id,
      content,
      sender_email: email,
      send_time: create_time,
      delete: false
    });

    await this.messageRepository.save(message);
    this.logger.log("Created new message succeeded");
    return { message: "success" };
  }

  // Find an account with username or email match the param
  async findUserLogin(
    username: string, 
    email: string
  ): Promise<Login | null> {
    let account = await this.loginRepository.findOne({ 
      where: [
        {username: username},
        {email: email}
      ]
    });
    this.logger.log("API Find user login succeeded: " + username);
    return account;
  }

  // Find User profile associated with an email
  async findUser(
    email: string
  ) : Promise<any | null> {
    let user = await this.userRepository.findOne({
      where: {
        email: email
      }
    });
    let {password, ...result} = user;
    this.logger.log("API Find user profile succeeded: " + email);
    return result;
  }

  // Find a forum with forum_id
  async findForum(
    forum_id: number
  ): Promise<Forum | null> {
    let forum = await this.forumRepository.findOne({ 
      where: {
        id: forum_id
      }
    });
    this.logger.log("API Find forum succeeded: " + forum_id);
    return forum;
  }

  // Find all forums belong to a category
  async findForumCategory(
    category: string
  ) : Promise<Forum[] | null> {
    let allForums = await this.forumRepository.find({
      where: {
        category: category
      }
    });
    this.logger.log("API Find forums of a category succeeded: " + category);
    return allForums;
  }

  // Find all forums
  async findAllForum(): Promise<Forum[] | null> {
    let allForums = await this.forumRepository.find();
    this.logger.log("API Find all forums succeeded");
    return allForums;
  }

  // Find a thread with thread_id
  async findThread(
    thread_id: number
  ): Promise<Thread | null> {
    let res = await this.threadRepository.findOne({ 
      where: {
      id: thread_id
    }});
    this.logger.log("API Find thread succeeded: " + thread_id);
    return res;
  }

  // Find a thread with all its messages
  // This count as user view a pages so increase view by 1
  async findThreadFull(
    thread_id: number
  ) : Promise<{thread: Thread, messages: Message[]} | null> {
    let thread = await this.threadRepository.findOne({
      where: {
        id: thread_id
      }
    });
    if(thread === null) {
      this.logger.debug("API Find thread failed");
      return null;
    }

    // increase view count and save it
    thread.views++;
    await this.threadRepository.save(thread);
    let messages = await this.messageRepository.find({
      where: {
        thread_id: thread_id
      }
    });
    this.logger.log("API Find thread succeeded: " + thread_id);
    return {thread, messages};
  }

  // Find all threads of a forum
  async findAllThreadOfForum(
    forum_id: number
  ): Promise<Thread[] | null> {
    let threads = await this.threadRepository.find({ 
      where: {
        forum_id: forum_id
      }
    });
    this.logger.log("API Find threads of a forum succeeded: " + forum_id);
    return threads;
  }

  // Find all threads of a user
  async findAllThreadOfUser(
    email: string
  ): Promise<Thread[] | null> {
    let threads = await this.threadRepository.find({ 
      where: {
        author_email: email
      }
    });
    this.logger.log("API Find threads of user succeeded: " + email);
    return threads;
  }

  // find a message with id 'message_id'
  async findMessage(
    message_id: number
  ) : Promise<Message | null> {
    let message = this.messageRepository.findOne({
      where: {
        id: message_id
      }
    });
    this.logger.log("API Find message succeeded: " + message_id);
    return message;
  }

  // Find all messages of a thread
  async findAllMessageOfThread(
    thread_id: number
  ): Promise<Message[] | null> {
    let messages = await this.messageRepository.find({ 
      where: {
        thread_id: thread_id
      }
    });
    this.logger.log("API Find messages of a thread succeeded: " + thread_id);
    return messages;
  }

  async findAllMessageOfUser(
    email: string
  ) : Promise<Message[] | null> {
    let messages = await this.messageRepository.find({
      where: {
        sender_email: email
      }
    });
    this.logger.log("API Find messages of user succeeded: " + email);
    return messages;
  }

  // update password for an account
  async updatePassword(
    email: string,
    password: string
  ) : Promise<{ message: string } > {
    // get login and user from database, throw error if not existed
    let login = await this.findUserLogin(email, email);
    let user = await this.findUser(email);
    if(login === null || user === null) {
    this.logger.debug("API Update user password failed (Account not existed): " + email);
    throw new HttpException("Account not existed", HttpStatus.BAD_REQUEST);
    }

    // update password
    login.password = password;
    user.password = password;
    await this.loginRepository.save(login);
    await this.userRepository.save(user);
    this.logger.log("API Update user password succeeded: " + email);
    return { message: "success" };
  }

  // update user information
  async updateUser(
    email: string,
    date_of_birth: Date, 
    location: string, 
    about: string, 
    twofa: boolean, 
    website: string,
    avatar: string
  ) : Promise<{ message: string }> {
    let user = await this.findUser(email);
    if(user === null) {
    this.logger.debug("API Update user failed: User not existed");
    throw new HttpException("User not existed", HttpStatus.BAD_REQUEST);
    }

    user.date_of_birth = date_of_birth;
    user.location = location;
    user.about = about;
    user.twofa = twofa;
    user.website = website;
    user.avatar = avatar;

    await this.userRepository.save(user);
    this.logger.log("API Update user succeeded: " + email);
    return { message: "success" };
  }

  // update avatar of user
  // will implement later
  async updateAvatarUser(
    avatar: File
  ) : Promise<{ message: string }> {
    return { message: "success" };
  }

  // update a thread
  async updateThread(
    thread_id: number,
    content: string,
    thread_title: string,
    tag: string[]
  ) : Promise<{ message: string }> {
    let thread = await this.findThread(thread_id);
    if(thread === null) {
    this.logger.debug("API Update thread failed: Thread not existed");
    throw new HttpException("Thread not existed", HttpStatus.BAD_REQUEST);
    }
    
    let update_date = new Date();
    thread.content = content;
    thread.thread_title = thread_title;
    thread.last_update_time = update_date;
    thread.tag = tag;
    await this.threadRepository.save(thread);
    this.logger.log("API Update thread succeeded: " + thread_id);
    return { message: "success" };
  }

  // update a message
  async updateMessage(
    message_id: number,
    content: string
  ) : Promise<{ message: string }> {
    let message = await this.findMessage(message_id);
    if(message === null) {
    this.logger.log("API Update message failed: Message not existed");
    throw new HttpException("Message not existed", HttpStatus.BAD_REQUEST);
    }

    let update_date = new Date();
    message.content = content;
    message.last_update_time = update_date;
    this.messageRepository.save(message);
    this.logger.log("API Update message succeeded: " + message_id);
    return { message: "success" };
  }

  // delete a thread
  async deleteThread(
    thread_id: number
  ) : Promise<{ message: string }> {
    let thread = await this.findThread(thread_id);
    if(thread === null) {
    this.logger.log("API Delete thread failed: Thread not existed");
    throw new HttpException("Thread not existed", HttpStatus.BAD_REQUEST);
    }

    await this.threadRepository.remove(thread);
    this.logger.log("API Delete thread succeeded: " + thread_id);
    return { message: "success" };
  }

  // delete a message
  async deleteMessage(
    message_id: number
  ) : Promise<{ message: string }> {
    let message = await this.findMessage(message_id);
    if(message === null) {
    this.logger.log("API Delete message failed: Message not existed");
    throw new HttpException("Message not existed", HttpStatus.BAD_REQUEST);
    }

    await this.messageRepository.remove(message);
    this.logger.log("API Delete message succeeded: " + message_id);
    return { message: "success" };
  }
}
