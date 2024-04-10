import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Forum {
	@Prop()
	name: string;
	
	@Prop()
	about: string;
	
	@Prop()
	threads: number;
	
	@Prop()
	messages: number;
	
	@Prop()
	delete: boolean;
	
	@Prop()
	privilege: number;
};

export type ForumDocument = HydratedDocument<Forum>;
export const ForumSchema = SchemaFactory.createForClass(Forum);