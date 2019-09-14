import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    BeforeInsert,
} from 'typeorm';

import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { UserResponseDTO } from './dto';

/**
 * @class
 * Database entity class which is a wrapper and a parser for
 * the data that exists in the database.
 */
@Entity('user')
export class UserEntity {
    // Automatically NestJS generated id.
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Automatically NestJS generated date.
    @CreateDateColumn()
    createdDate: Date;

    @Column({
        type: 'text',
        unique: true,
    })
    username: string;

    @Column('text')
    password: string;

    @BeforeInsert()
    async hashPassword() {
        this.password = await bcrypt.hash(this.password, 10);
    }
    // This method works as a type converter, where UserEntity is converted into UserResponseDTO.
    toResponseObject(showToken: boolean = true): UserResponseDTO {
        const { id, createdDate, username, token } = this;
        const responseObject: UserResponseDTO = { id, createdDate, username };
        if (showToken) {
            responseObject.token = token;
        }
        return responseObject;
    }

    async comparePassword(attempt: string) {
        return await bcrypt.compare(attempt, this.password);
    }

    private get token(): string {
        const { id, username } = this;
        return jwt.sign({ id, username }, process.env.SECRET, { expiresIn: '7d' });
    }
}
