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