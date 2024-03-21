import { 
	IsNotEmpty
} from 'class-validator';

export class GetForumCategoryDto {
  @IsNotEmpty()
  category: string;
}