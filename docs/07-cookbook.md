# 07. Cookbook / End-to-End Examples

## Example A: Three provider categories in one place

```ts
// 1) component provider
@Component()
class UserService {}

// 2) token provider
const ClockToken = token<Date>('clock', () => new Date());

// 3) dynamic/conditional provider
const DriverRegistry = registry<Driver>('database.driver');
export const registerPsql = DriverRegistry.register('psql', PsqlDriver);
const DriverToken = configRegistry('database.driver', DatabaseConfig, 'driver');
```

## Example B: Named collection + selected item

```ts
abstract class Pet {}

@Named(Pet, 'dog')
class Dog extends Pet {}

@Named(Pet, 'cat')
class Cat extends Pet {}

const AllPetToken = token<Pet[]>('pets.all', [Dog, Cat]);

const SelectedPetToken = token<Pet>('pets.selected',
  (cfg = injectConfig(PetConfig), all = inject(AllPetToken)) => {
    const result = all.find((pet) => pet.name === cfg.selectedPet);
    if (!result) throw new Error(`Unknown pet: ${cfg.selectedPet}`);
    return result;
  },
);
```

## Example C: External factory with lifecycle

```ts
container.provide({
  provide: RedisToken,
  useFactory: (cfg = injectConfig(RedisConfig)) => createRedis(cfg.url),
  onInit: (redis) => redis.connect(),
  onDestroy: (redis) => redis.quit(),
});
```

## Example D: Config schema styles

```ts
// class-validator style
@ConfigSchema('app.mail')
class MailConfig {
  @IsString()
  host!: string;
}

// zod style
const BillingConfig = defineZodConfig('billing', z.object({
  currency: z.enum(['USD', 'EUR', 'JPY']).default('USD'),
}));
```

## Example E: Dynamic provider mismatch error

Given config:

```yaml
database:
  driver: mssql
```

Registered only:

```ts
registerPsql(container);
```

Expected startup failure:

```txt
[DYNAMIC_PROVIDER_NOT_FOUND] registry=database.driver key=mssql
Configured implementation was not registered.
Registered keys: psql
```

## Example F: Simple entry + full entry

```ts
// simple
const foo = await new Container().resolve(FooService);

// full
const app = createApp({
  config: { files: ['application.yaml'] },
  modules: [UserModule, DatabaseModule],
});
await app.start();
```
