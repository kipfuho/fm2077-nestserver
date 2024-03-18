import { 
	Column, 
	Entity, 
	PrimaryGeneratedColumn 
} from "typeorm";

@Entity()
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  thread_id: number;

  @Column()
  sender_email: string;

  @Column()
  send_time: Date;

  @Column()
  content: string;

  @Column()
  delete: boolean;
}