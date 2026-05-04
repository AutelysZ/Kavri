import { IsOptional, IsString } from '../decorators/index.js';
import {
  BinaryUnion,
  FileUnion,
  InHeader,
  InQuery,
  IsFile,
  IsFilename,
  RawBody,
} from '../decorators/route.js';
import { Schema } from '../schema.js';

@Schema({ description: 'Upload file request' })
export class MultipartUploadRequest {
  @InQuery('path')
  @IsString({ maxLength: 100 })
  path!: string;
  @InHeader('X-Bucket')
  @IsOptional()
  @IsString({ maxLength: 100 })
  bucket: string | undefined;
  @IsFile({
    array: {
      maxItems: [10, { message: 'Upload up to 10 files at a time.' }],
      minItems: [1, { message: 'Upload files cannot be empty.' }],
    },
    accept: ['image/*', '.pdf'],
    maxSize: [1 << 22, { message: 'Max file size is 4MB.' }],
  })
  files!: FileUnion[];
}

// the outgoing message's type is determined by sender
// the runtime client should support all format supported by the env
export const uploadRequest: MultipartUploadRequest = {
  path: '/upload/user/',
  bucket: 's3',
  files: [
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    FileUnion.ofWebFile(HTMLInputElement.prototype.files!.item(0)!),
    FileUnion.ofMultipart({
      path: './tmp/received/xxx.png',
      size: 1,
      name: 'file.png',
      type: 'image/png',
    }),
    FileUnion.ofNodePath('./tmp/received/xx.png'),
  ],
};

export class BinaryUploadRequest {
  @InQuery()
  @IsFilename({ accept: ['image/*', '.pdf'] })
  name!: string;
  @RawBody()
  file!: BinaryUnion;
}

export const binaryUploadRequest: BinaryUploadRequest = {
  name: 'test.png',
  file: BinaryUnion.ofWebBlob(new Blob(['hello world'])),
};

export class UploadController {
  async binaryUpload(req: BinaryUploadRequest) {
    // the incoming message type is determined by the runtime
    req.file.asNodeStream();
  }

  async upload(req: MultipartUploadRequest) {
    req.files.forEach((f) => f.asMultipart());
  }
}
