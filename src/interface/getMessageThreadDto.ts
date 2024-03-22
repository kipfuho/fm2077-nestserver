import { 
	IsNumber
} from 'class-validator';

export class GetMessageThreadDto {
  @IsNumber()
  thread_id: number;
}