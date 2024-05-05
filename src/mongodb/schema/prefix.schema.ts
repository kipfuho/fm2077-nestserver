import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Prefix {
	@Prop()
	name: string;

	@Prop()
	color: string;

	constructor(name: string, color: string) {
		this.name = name;
		this.color = color;
	}
};

export type PrefixDocument = HydratedDocument<Prefix>;
export const TPrefixSchema = SchemaFactory.createForClass(Prefix);