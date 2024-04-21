import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Message {
	@Prop()
	thread: string;

	@Prop()
	user: string;

	@Prop()
	create_time: Date;

	@Prop()
	update_time: Date;

	@Prop()
	content: string;

	@Prop({type: [{type: String}]})
	attachments: string[];

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