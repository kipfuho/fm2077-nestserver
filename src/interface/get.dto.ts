import { 
  IsEmail,
	IsNotEmpty,
  IsNumber
} from 'class-validator';

export class GetForumCategoryDto {
  @IsNotEmpty()
  category: string;
}

export class GetMessageThreadDto {
  @IsNumber()
  thread_id: number;
}

export class GetThreadForumDto {
  @IsNumber()
  forum_id: number;
}

export class UploadImageDto {
  @IsNumber()
  time: number;
}