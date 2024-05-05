import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Bookmark {
	// message bookmarked
	@Prop()
	message: string;

	// thread message belong to
	@Prop()
	thread: string;

	// owner of bookmark
	@Prop()
	user: string;

	@Prop()
	detail: string;

	@Prop()
	create_time: Date;
}

export type BookmarkDocument = HydratedDocument<Bookmark>;
export const BookmarkSchema = SchemaFactory.createForClass(Bookmark);