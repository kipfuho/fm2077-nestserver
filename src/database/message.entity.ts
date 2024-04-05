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
  user_id: number;

  @Column()
  send_time: Date;

  @Column("varchar", { length: 10000 })
  content: string;

  @Column("simple-array")
  reactions: number[];

  @Column()
  last_update_time: Date;

  @Column()
  delete: boolean;
}