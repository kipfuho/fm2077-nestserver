import { 
  HttpException, 
  HttpStatus, 
  Injectable, 
  Logger 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { format } from 'date-fns';
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
    var checkExist = await this.loginRepository.findOne({ where: [
      {username: username},
      {email: email}
    ]});

    if (checkExist !== null){
      this.logger.log("API Create new account failed, username or email existed");
      throw new HttpException('Username or Email existed', HttpStatus.BAD_REQUEST);
    }
    
    // Hash the password and get current date
    var create_time = format(new Date(), "yyyy/mm/dd");
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
    // Create a new Thread and save to database
    var create_time = format(new Date(), "yyyy/mm/dd");
    const thread = this.threadRepository.create({ 
      forum_id, 
      author_email: email, 
      thread_title: thread_title, 
      content: content, 
      create_date: create_time, 
      last_message_id: -1, 
      last_update_date: create_time, 
      replies: 0, 
      views: 0, 
      tag: tag,
      delete: false
    });

    await this.threadRepository.save(thread);
    return {message: "success" };
  }

  // Create new message
  async createNewMessage(
    thread_id: number, 
    email: string, 
    content: string
  ) : Promise<{ message: string }> {
    // Find thread with id 'thread_id'
    var thread = await this.findThread(thread_id);
    if(thread === null) {
      this.logger.log("Created new message failed: Thread not found")
      throw new HttpException("Thread not found", HttpStatus.BAD_REQUEST);
    }
    // Increase replies count
    thread.replies += 1;
    await this.threadRepository.save(thread);
    
    // Create a new Message and save to database
    var create_time = format(new Date(), "yyyy/mm/dd");
    const message = this.messageRepository.create({ 
      thread_id,
      content,
      sender_email: email,
      send_time: create_time,
      delete: false
    });

    await this.messageRepository.save(message);
    this.logger.log("Created new message succeeded")
    return { message: "success" };
  }

  // Find an account with username or email match the param
  async findUserLogin(
    username: string, 
    email: string
  ): Promise<Login | null> {
    var res = await this.loginRepository.findOne({ where: [
      {username: username},
      {email: email}
    ]});
    return res;
  }

  // Find a forum with forum_id
  async findForum(
    forum_id: number
  ): Promise<Forum | null> {
    var res = await this.forumRepository.findOne({ where: {
      id: forum_id
    }});
    return res;
  }

  // Find a thread with thread_id
  async findThread(
    thread_id: number
  ): Promise<Thread | null> {
    var res = await this.threadRepository.findOne({ where: {
      id: thread_id
    }});
    return res;
  }
}
