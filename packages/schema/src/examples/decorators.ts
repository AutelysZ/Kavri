import { IsOptional } from '../decorators/base.js';
import { ToBigInt, ToNumber } from '../decorators/number.js';
import { AllowEmpty, IsString, MaxLength, MinLength, ToString } from '../decorators/string.js';

export class Post {
  id!: bigint;
  title!: string;
  content!: string;
}
export class User {
  @ToBigInt()
  id!: bigint;
  @IsString({ minLength: 3 })
  username!: string;
  @IsString()
  @MinLength(1, { message: 'Should not be empty string' })
  firstName!: string;
  @IsString()
  @AllowEmpty({ message: 'Should be an empty string' })
  lastName!: string;
  @IsString()
  @MaxLength(10000)
  bio!: string | null;
  @ToString({ type: 'should be a string', deprecated: 'Use ageNum instead' })
  age!: string;
  @ToNumber()
  ageNum!: number;

  @IsOptional()
  posts?: Post[];
}
