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
		like: [{type: String}],
		love: [{type: String}],
		care: [{type: String}],
		haha: [{type: String}],
		wow: [{type: String}],
		sad: [{type: String}],
		angry: [{type: String}],
		_id: false
	}})
	reactions: {
		like: String[],
		love: String[],
		care: String[],
		haha: String[],
		wow: String[],
		sad: String[],
		angry: String[]
	};

	@Prop()
	delete: boolean;
}

export type MessageDocument = HydratedDocument<Message>;
export const MessageSchema = SchemaFactory.createForClass(Message);