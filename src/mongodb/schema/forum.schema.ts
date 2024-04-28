import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Forum {
	// forum name
	@Prop()
	name: string;
	
	// about the forum
	@Prop()
	about: string;
	
	// number of threads of the forum
	@Prop()
	threads: number;
	
	// number of messages of the forum
	@Prop()
	messages: number;
	
	// is deleted?
	@Prop()
	delete: boolean;
	
	// define permission for user
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