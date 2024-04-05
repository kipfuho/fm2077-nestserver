import { 
	IsArray,
	IsEmail, 
	IsNotEmpty, 
	IsNumber 
} from "class-validator";

export class CreateMessageDto {
	@IsNumber()
  thread_id: number;

  @IsNumber()
  user_id: number;

  @IsNotEmpty()
  content: string;
}

export class CreateThreadDto {
	@IsNumber()
	forum_id: number;

	@IsNumber()
	user_id: number;

	@IsNotEmpty()
	content: string;

	@IsNotEmpty()
	thread_title: string;

	@IsArray()
	tag: string[];
}

export class CreateUserDto {
  @IsEmail()
  email: string;

	@IsNotEmpty()
	username: string;

  @IsNotEmpty()
  password: string;
}