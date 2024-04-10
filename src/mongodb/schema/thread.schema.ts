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

	@Prop()
	delete: boolean;

	@Prop()
	privilege: number;
};

export type ThreadDocument = HydratedDocument<Thread>;
export const ThreadSchema = SchemaFactory.createForClass(Thread);