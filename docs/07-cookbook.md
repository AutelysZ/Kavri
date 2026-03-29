# 07. Cookbook / End-to-End Examples

## Example A: Feature module with exported service

```ts
export const UserModule = defineModule({
  providers: [UserService, UserRepo],
  exports: [UserService],
});
```

## Example B: Request-scoped dependency in HTTP

```ts
@Component({ scope: 'scoped' })
class RequestContext {
  constructor(private readonly req = inject(HttpRequestToken)) {}
  userId() {
    return this.req.headers['x-user-id'];
  }
}
```

## Example C: Config with class-validator

```ts
@ConfigSchema('feature.mail')
class MailConfig {
  @IsString()
  host!: string;

  @IsNumber()
  port = 587;
}

@Component()
class Mailer {
  constructor(private readonly cfg = inject(configToken(MailConfig))) {}
}
```

## Example D: Config with zod

```ts
const BillingConfig = defineZodConfig('billing', z.object({
  currency: z.enum(['USD', 'EUR', 'JPY']).default('USD'),
  retries: z.number().int().min(0).default(2),
}));

@Component()
class BillingService {
  constructor(private readonly cfg = inject(BillingConfig)) {}
}
```

## Example E: Dynamic provider error scenario

Given config:

```yaml
database:
  driver: mssql
```

But app only registers:

```ts
providePsql(container);
```

Expected startup failure:

```txt
[DYNAMIC_PROVIDER_NOT_FOUND] registry=database.provider key=mssql
No registered provider for "mssql".
Did you mean one of: psql
```

## Example F: Testing overrides

```ts
const test = new Container()
  .use(AppModule)
  .override(UserRepoToken, { provide: UserRepoToken, useValue: fakeUserRepo });

const service = await test.resolve(UserService);
```
