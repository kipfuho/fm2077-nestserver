import { 
	IsEmail, 
	IsNotEmpty, 
	IsNumber 
} from "class-validator";

export class CreateMessageDto {
	@IsNumber()
  thread_id: number;

  @IsEmail()
  sender_email: string;

  @IsNotEmpty()
  content: string;
}