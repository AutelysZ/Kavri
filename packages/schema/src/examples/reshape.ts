import { IsDate } from '../decorators/time.js';
import { ToBigInt } from '../decorators/number.js';
import { IsString } from '../decorators/string.js';
import { IsEmail, IsStrongPassword } from '../decorators/string.semantics.js';
import { Merge, Omit, Partial, Pick, PickPartial, Required } from '../reshape.js';

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

export class RegisterRequest extends Omit(User, 'id', 'createdAt', 'updatedAt', 'deletedAt') {
  @IsStrongPassword()
  password!: string;
}

export class UpdateUserRequest extends Merge([
  Pick(User, 'id'),
  Partial(Pick(User, 'email', 'firstName', 'lastName')),
]) {}

export class UpdateUserRequest2 extends Partial(
  Pick(User, 'id', 'email', 'firstName', 'lastName'),
  'email',
  'firstName',
  'lastName',
) {}

export class UpdateUserRequest3 extends PickPartial(
  User,
  ['id'],
  ['email', 'firstName', 'lastName'],
) {}

export class FullUpdateUserRequest extends Required(UpdateUserRequest) {}

export const full: FullUpdateUserRequest = {
  id: 1n,
  firstName: 'abc',
  lastName: 'def',
  email: 'abc',
};
