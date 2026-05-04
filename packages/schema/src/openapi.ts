import type { JsonSchema } from './jsonschema.js';
import type { RouteDefinition } from './route.js';
import { todo } from './utils.js';

export interface OpenAPIv3Info {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: { name?: string; url?: string; email?: string };
  license?: { name: string; url?: string; identifier?: string };
  summary?: string;
}

export interface OpenAPIv3Server {
  url: string;
  description?: string;
  variables?: Record<string, { default: string; enum?: string[]; description?: string }>;
}

export interface OpenAPIv3ExternalDocs {
  url: string;
  description?: string;
}

export interface OpenAPIv3Reference {
  $ref: string;
  summary?: string;
  description?: string;
}

export interface OpenAPIv3MediaType {
  schema?: JsonSchema | OpenAPIv3Reference;
  example?: unknown;
  examples?: Record<
    string,
    { value?: unknown; summary?: string; description?: string } | OpenAPIv3Reference
  >;
  encoding?: Record<string, { contentType?: string; style?: string; explode?: boolean }>;
}

export interface OpenAPIv3Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: JsonSchema | OpenAPIv3Reference;
  example?: unknown;
  style?: string;
  explode?: boolean;
}

export interface OpenAPIv3RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, OpenAPIv3MediaType>;
}

export interface OpenAPIv3Response {
  description: string;
  headers?: Record<string, { description?: string; schema?: JsonSchema | OpenAPIv3Reference }>;
  content?: Record<string, OpenAPIv3MediaType>;
}

export interface OpenAPIv3Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  externalDocs?: OpenAPIv3ExternalDocs;
  parameters?: (OpenAPIv3Parameter | OpenAPIv3Reference)[];
  requestBody?: OpenAPIv3RequestBody | OpenAPIv3Reference;
  responses: Record<string, OpenAPIv3Response | OpenAPIv3Reference>;
}

export interface OpenAPIv3PathItem {
  summary?: string;
  description?: string;
  get?: OpenAPIv3Operation;
  put?: OpenAPIv3Operation;
  post?: OpenAPIv3Operation;
  delete?: OpenAPIv3Operation;
  patch?: OpenAPIv3Operation;
  head?: OpenAPIv3Operation;
}

export interface OpenAPIv3 {
  openapi: '3.1.0';
  info: OpenAPIv3Info;
  servers?: OpenAPIv3Server[];
  paths: Record<string, OpenAPIv3PathItem>;
  components?: {
    schemas?: Record<string, JsonSchema>;
  };
  security?: Record<string, string[]>[];
  tags?: { name: string; description?: string; externalDocs?: OpenAPIv3ExternalDocs }[];
  externalDocs?: OpenAPIv3ExternalDocs;
}

export function toOpenAPIv3(routes: RouteDefinition[], extra?: Partial<OpenAPIv3>): OpenAPIv3 {
  todo();
}

export function fromOpenAPIv3(spec: OpenAPIv3): RouteDefinition[] {
  todo();
}
