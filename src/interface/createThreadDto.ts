import { 
	IsArray,
	IsEmail, 
	IsNotEmpty, 
	IsNumber 
} from "class-validator";

export class CreateThreadDto {
	@IsNumber()
	forum_id: number;

	@IsEmail()
	email: string;

	@IsNotEmpty()
	content: string;

	@IsNotEmpty()
	thread_title: string;

	@IsArray()
	tag: string[];
}