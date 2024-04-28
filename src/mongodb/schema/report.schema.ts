import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Report {
	// who made the report
	@Prop()
	reporter: string;

	// target who
	@Prop()
	reported: string;

	// message reported
	@Prop()
	message: string;

	// detail, reason
	@Prop()
	detail: string;

	@Prop()
	create_time: Date;
}

export type ReportDocument = HydratedDocument<Report>;
export const ReportSchema = SchemaFactory.createForClass(Report);