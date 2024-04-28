import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Reaction {
	@PrimaryGeneratedColumn()
  id: number;

	// 1 like
	// 2 love
	// 3...
	@Column()
	type: number;

	@Column()
	message_id: number;
	
	@Column()
	user_id: number;

	@Column()
	time: Date;
}