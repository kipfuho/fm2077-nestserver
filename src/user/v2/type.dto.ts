import { IsString } from "class-validator";
import { Tag } from "src/mongodb/schema/tag.schema";

export class CreateThread {
	@IsString()
	forumId: string;

	@IsString()
	userId: string;

	@IsString()
	threadTitle: string;

	@IsString()
	threadContent: string;

	tag: Tag[];
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

export class UpdateThread {
	@IsString()
	threadId: string;
	
	@IsString()
	userId: string;
	
	threadPrefix: string;

	@IsString()
	threadTitle: string;

	threadContent: string;

	tag: Tag[];
}

export class UpdateMessage {
	@IsString()
	messageId: string;

	@IsString()
	userId: string;

	@IsString()
	content: string;
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