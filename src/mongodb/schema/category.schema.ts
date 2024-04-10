import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Category {
	@Prop()
	name: string
	
	@Prop()
	title: string;

	@Prop()
	about: string;
	
	@Prop({type: [{type: String}]})
	forums: string[];
};

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);