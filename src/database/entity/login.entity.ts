import { 
	Column, 
	Entity, 
	PrimaryGeneratedColumn 
} from "typeorm";

@Entity()
export class Login {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  create_time: Date;

  @Column()
  username: string;

  @Column()
  password: string;

  @Column()
  email: string;
}