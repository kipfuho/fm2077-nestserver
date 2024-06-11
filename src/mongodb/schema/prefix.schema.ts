import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Prefix {
	@Prop()
	id: number;
	
	@Prop()
	name: string;

	@Prop()
	color: string;

	constructor(id: number, name: string, color: string) {
		this.id = id;
		this.name = name;
		this.color = color;
	}
};

export type PrefixDocument = HydratedDocument<Prefix>;
export const PrefixSchema = SchemaFactory.createForClass(Prefix);