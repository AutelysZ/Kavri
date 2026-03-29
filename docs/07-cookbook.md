# 07. Cookbook / End-to-End Examples

## Example A: Three provider categories in one place

```ts
// 1) component provider
@Component()
class UserService {}

// 2) token provider
const ClockToken = token<Date>('clock', () => new Date());

// 3) dynamic provider
const DriverRegistry = registry<Driver>('database.driver');
export const registerPsql = DriverRegistry.register('psql', PsqlDriver);
const DriverToken = configRegistry('database.driver', DatabaseConfig, 'driver');
```

## Example B: Named subtype + selector without eager instantiation

```ts
@Component()
abstract class Pet {}

@Named('dog')
class Dog extends Pet {}

@Named('cat')
class Cat extends Pet {}

const AllPets = [Dog, Cat];
container.provide(AllPets);

const PetSelector = selector(
  'pet.selector',
  Pet,
  (map: Map<string, Provider<Pet>>, cfg = injectConfig(PetConfig)) => map.get(cfg.selectedPet),
);
```

`PetSelector` consumes constructors/providers, so only the selected pet gets instantiated.

## Example C: Collection injection helpers

```ts
const pets = injectList(Pet);                    // readonly Pet[]
const petsByName = injectMap(Pet);               // ReadonlyMap<string, Pet>
const petSet = injectSet(Pet);                   // ReadonlySet<Pet>
const ordered = injectList(Pet, { orderBy: 'topo' });
```

## Example D: External factory with lifecycle

```ts
container.provide({
  provide: RedisToken,
  useFactory: (cfg = injectConfig(RedisConfig)) => createRedis(cfg.url),
  onInit: (redis) => redis.connect(),
  onDestroy: (redis) => redis.quit(),
});
```

## Example E: Config schema styles

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

## Example F: Dynamic provider mismatch error

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

## Example G: Simple entry + full entry

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
