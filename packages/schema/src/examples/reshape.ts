import { Schema } from '@kavri/schema';
import { ToBigInt } from '../decorators/number.js';
import { IsString } from '../decorators/string.js';
import { IsEmail, IsStrongPassword } from '../decorators/string.semantics.js';
import { IsDate } from '../decorators/time.js';
import { Merge, Omit, Partial, Pick, PickPartial, Required } from '../reshape.js';

@Schema()
export class User {
  @ToBigInt()
  id!: bigint;
  @IsString({ minLength: 2, maxLength: 32 })
  username!: string;
  @IsEmail()
  email!: string;
  @IsString({ minLength: 1, maxLength: 32 })
  firstName!: string;
  @IsString({ maxLength: 32 })
  lastName!: string;
  @IsDate()
  createdAt!: Date;
  @IsDate()
  updatedAt!: Date;
  @IsDate({ nullable: true })
  deletedAt!: Date | null;
}

@Schema()
export class RegisterRequest extends Omit(User, 'id', 'createdAt', 'updatedAt', 'deletedAt') {
  @IsStrongPassword()
  password!: string;
}

@Schema()
export class UpdateUserRequest extends Merge([
  Pick(User, 'id'),
  Partial(Pick(User, 'email', 'firstName', 'lastName')),
]) {}

@Schema()
export class UpdateUserRequest2 extends Partial(
  Pick(User, 'id', 'email', 'firstName', 'lastName'),
  'email',
  'firstName',
  'lastName',
) {}

@Schema()
export class UpdateUserRequest3 extends PickPartial(
  User,
  ['id'],
  ['email', 'firstName', 'lastName'],
) {}

@Schema()
export class FullUpdateUserRequest extends Required(UpdateUserRequest) {}

export const full: FullUpdateUserRequest = {
  id: 1n,
  firstName: 'abc',
  lastName: 'def',
  email: 'abc',
};
