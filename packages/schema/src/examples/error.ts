import * as assert from 'node:assert';
import { decode, type DecodeIssue } from '../decode.js';
import { IsArray } from '../decorators/array.js';
import { Ref } from '../decorators/object.js';
import { IsString } from '../decorators/string.js';
import { Schema } from '../schema.js';

// issues for:

class Bar {
  @IsString({ maxLength: 2 })
  baz!: string;
}

class Foo {
  @IsArray(Ref(Bar), { maxItems: 1 })
  bars!: Bar[];
}

@Schema()
export class DemoErrorModel {
  @Ref(Foo)
  foo!: Foo;
}

const result = decode(DemoErrorModel, {
  foo: {
    bars: [
      {
        baz: 'a',
      },
      {
        baz: 'baz',
      },
    ],
  },
} satisfies DemoErrorModel);

export const deepIssues: DecodeIssue = {
  children: [
    {
      field: 'foo',
      children: [
        {
          field: 'bars',
          issues: [
            {
              rule: 'MaxItems',
              params: 1,
              message: 'should not have more than 1 items.',
            },
          ],
          children: [
            {
              field: '1',
              children: [
                {
                  field: 'baz',
                  issues: [
                    {
                      rule: 'MaxLength',
                      params: 2,
                      message: 'length should not more than 2',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

assert.strictEqual(result.value, deepIssues);
