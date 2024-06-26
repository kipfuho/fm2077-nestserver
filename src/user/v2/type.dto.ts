import { IsNumber, IsString } from 'class-validator';
import { FilterOptions } from 'src/interface/filter.type';
import { Tag } from 'src/mongodb/schema/tag.schema';

export class CreateThread {
  @IsString()
  forumId: string;

  @IsString()
  userId: string;

  prefixIds: number[];

  @IsString()
  threadTitle: string;

  @IsString()
  threadContent: string;

  tag: Tag[];
}

export class GetThread {
  threadId: string;

  @IsString()
  forumId: string;

  @IsNumber()
  offset: number;

  @IsNumber()
  limit: number;

  filterOptions: FilterOptions;
}

export class ReplyThread {
  @IsString()
  threadId: string;

  @IsString()
  userId: string;

  @IsString()
  content: string;

  attachments: string[];
}

export class CreateProfilePosting {
  @IsString()
  userId: string;

  @IsString()
  userWallId: string;

  @IsString()
  message: string;
}

export class ReplyProfilePosting {
  @IsString()
  ppId: string;

  @IsString()
  userId: string;

  @IsString()
  message: string;
}

export class CreateBookmark {
  @IsString()
  messageId: string;

  @IsString()
  userId: string;

  @IsString()
  detail: string;
}

export class CreateReport {
  @IsString()
  messageId: string;

  @IsString()
  userId: string;

  @IsString()
  reason: string;

  detail: string;
}

export class UpdateThread {
  @IsString()
  threadId: string;

  // list of prefix
  threadPrefixIds: number[];

  @IsString()
  threadTitle: string;

  threadContent: string;

  tag: Tag[];
}

export class UpdateMessage {
  @IsString()
  messageId: string;

  @IsString()
  content: string;

  attachments: string[];
}

export class UpdateUsername {
  @IsString()
  userId: string;

  @IsString()
  username: string;

  @IsString()
  password: string;
}

export class UpdateEmail {
  @IsString()
  userId: string;

  @IsString()
  email: string;

  @IsString()
  password: string;
}

export class UpdatePassword {
  @IsString()
  userId: string;

  @IsString()
  oldPassword: string;

  @IsString()
  password: string;
}

export class UpdateSetting {
  @IsString()
  userId: string;

  avatar: string;

  dob: Date;

  location: string;

  about: string;

  @IsString()
  password: string;
}

export class UpdateBookmark {
  bookmarkId: string;

  detail: string;
}
