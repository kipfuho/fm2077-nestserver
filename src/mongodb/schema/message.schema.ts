import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Message {
	// thread that the message belong to
	@Prop()
	thread: string;

	// user made the message
	@Prop()
	user: string;

	@Prop()
	create_time: Date;

	@Prop()
	update_time: Date;

	// content of the thread, html string
	@Prop()
	content: string;

	// attachments's links
	@Prop({type: [{type: String}]})
	attachments: string[];

	// reactions for the message
	@Prop({type: {
		like: {type: Number},
		love: {type: Number},
		care: {type: Number},
		haha: {type: Number},
		wow: {type: Number},
		sad: {type: Number},
		angry: {type: Number},
		_id: false
	}})
	reactions: {
		like: number,
		love: number,
		care: number,
		haha: number,
		wow: number,
		sad: number,
		angry: number
	};
	
	// Which page this message belong to in a thread
	// also take messages per page to account
	@Prop({type: Map, of: Number})
	threadPage: Map<number, number>;
}

export type MessageDocument = HydratedDocument<Message>;
export const MessageSchema = SchemaFactory.createForClass(Message);