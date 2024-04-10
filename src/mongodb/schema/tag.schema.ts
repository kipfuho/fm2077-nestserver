import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Tag {
	@Prop()
	name: string;

	@Prop()
	color: string;

	constructor(name: string, color: string) {
		this.name = name;
		this.color = color;
	}
};

export type TagDocument = HydratedDocument<Tag>;
export const TagSchema = SchemaFactory.createForClass(Tag);