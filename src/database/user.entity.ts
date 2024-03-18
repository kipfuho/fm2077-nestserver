import { 
	Column, 
	Entity, 
	PrimaryGeneratedColumn 
} from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  username: string;

  @Column()
  password: string;

  @Column({nullable: true})
  avatar: string;

  @Column({nullable: true})
  date_of_birth: Date;

  @Column({nullable: true})
  location: string;

  @Column({nullable: true})
  website: string;

  @Column({nullable: true})
  about: string;

  @Column()
  twofa: boolean;
}