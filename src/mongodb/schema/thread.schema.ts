import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { Tag } from "./tag.schema";

@Schema()
export class Thread {
	@Prop()
	forum: string;

	@Prop()
	user: string;

	@Prop()
	title: string;

	@Prop({type: [{type: Tag}]})
	tag: Tag[];

	@Prop()
	create_time: Date;

	@Prop()
	update_time: Date;

	@Prop()
	replies: number;

	@Prop()
	views: number;

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

export type ThreadDocument = HydratedDocument<Thread>;
export const ThreadSchema = SchemaFactory.createForClass(Thread);