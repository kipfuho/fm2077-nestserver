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
	
	@Prop({type: {
		view: {type: Number},
		reply: {type: Number},
		upload: {type: Number},
		delete: {type: Number},
		_id: false
	}})
	privilege: {
		view: number;
		reply: number;
		upload: number;
		delete: number;
	};
};

export type ForumDocument = HydratedDocument<Forum>;
export const ForumSchema = SchemaFactory.createForClass(Forum);