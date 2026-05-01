import { IsArray } from '../decorators/array.js';
import { IsEnum } from '../decorators/enum.js';
import { ToBigInt } from '../decorators/number.js';
import { Ref } from '../decorators/object.js';
import { IsString } from '../decorators/string.js';
import { IsEmail, IsURL, IsWhitelisted } from '../decorators/string.semantics.js';
import { IsDate } from '../decorators/time.js';
import { Schema } from '../schema.js';

export enum Gender {
  Unknown,
  Female,
  Male,
}

export class Comment {
  @ToBigInt()
  id!: bigint;
  @IsString({ maxLength: 10000 })
  content!: string;
  @IsDate()
  createdAt!: Date;
  @IsArray(Ref.lazy(() => Comment), { optional: true })
  replies!: Comment[] | undefined;
}

export class Blog {
  @ToBigInt()
  id!: bigint;
  @IsString({ maxLength: 100 })
  title!: string;
  @IsString({ maxLength: 1000000 })
  content!: string;
  @IsDate()
  createdAt!: Date;
  @IsDate()
  updatedAt!: Date;
  @IsDate({ nullable: true })
  deletedAt!: Date | null;
  @IsArray(Ref(Comment), { optional: true, description: 'Expandable, only present if expanded' })
  comments!: Comment[] | undefined;
}

@Schema({ description: 'Create user request describe the create user options' })
export class CreateUserRequest {
  @IsEmail(
    {
      allow_underscores: true,
    },
    {
      message: 'should be an email',
      maxLength: 255,
    },
  )
  email!: string;

  @IsString({ maxLength: 50, minLength: 2, message: 'first name is required' })
  firstName!: string;

  @IsString({ maxLength: 50, minLength: 1, optional: true })
  lastName!: string;

  @IsEnum(Gender, { description: 'Gender of the user', deprecated: 'Use `gender2` instead' })
  gender!: Gender;

  @IsEnum(['male', 'female', 'unknown'], {
    description: 'Text-based gender, use for replace `gender`.',
  })
  gender2!: 'male' | 'female' | 'unknown';

  @IsURL({ host_whitelist: ['kavri.org'], protocols: ['https:'] })
  avatarUrl!: string | undefined;

  @IsEnum(['active', 'deleted'])
  @IsWhitelisted(['active', 'deleted'])
  @IsWhitelisted(['active', 'deleted'], {
    message: 'should be allowed status',
    maxLength: 20,
  })
  status!: 'active' | 'deleted';
}
