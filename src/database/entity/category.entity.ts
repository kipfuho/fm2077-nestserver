import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Category {
	@PrimaryGeneratedColumn()
	id: string;
	
	@Column()
	category: string;

	@Column()
	name: string;
}