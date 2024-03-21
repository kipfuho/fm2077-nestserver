import { 
	IsNumber
} from 'class-validator';

export class GetThreadForumDto {
  @IsNumber()
  forum_id: number;
}