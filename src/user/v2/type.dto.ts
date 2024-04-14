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