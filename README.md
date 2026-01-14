# kavri

Kavri is an extremely simple yet feature-rich dependency injection framework for JavaScript/TypeScript that doesn't require `reflect-metadata`.

## Usage

### Basic

```typescript
import { Container, Component, inject } from 'kavri';

@Component // define a component
class UserService {
  constructor() {}

  getUser(id: string) {
    return { id, name: 'mock' }
  }
}

@Component // another compaonent
class UserController {
  constructor(
    // 
    private readonly userService = inject(UserService), // inject a component
  ) {}

  getUser(id: string) {
    return this.userService.getUser(id)
  }
}

const container = new Container();

const userController = await container.get(UserController); // will instantiate UserController and its dependencies

await userController.getUser('123');
```

### Token based provider

```typescript
import { symbol, Component } from 'kavri';

interface User {
  id: string;
  name: string;
}

interface UserService {
  getUser(id): Promise<User>
}

const DefaultUserToken = symbol<User>();

@Component
class UserServiceImpl implements UserService {
  constructor(
    private readonly defaultUser = inject(DefaultuserToken) // inject a value
  ) {}

  async getUser(id: string) {
    return { ...this.defaultUser, id }
  }
}

const UserServiceToken = symbol<UserService>()

@Component
class UserController {
  constructor(
    private readonly userService = inject(UserServiceToken) // inject a interface impl
  } {}

  getUser(id: string) {
    return this.userService.getUser(id)
  }
}

const container = new Container()
container.provide(DefaultUserToken, { id: '', name: 'mock' }) // provide a value
container.provide(UserServiceToken, UserServiceImpl)          // provide a component
await container.get(UserController);
```

### Custom provider

```typescript
import { Database } from 'somewhere';

container.provide(Database, () => new Database(process.env.DATABASE)) // provide a external component
```

### Lifecycle

```typescript
import { PostConstruct, BeforeDestroy, inject, Container, Component } from 'kavri';
import { Database } from 'somewhere';

// component's lifecycle
@Component
class CacheService {
  @PostConstruct  // define a post construct hook
  async load() {
    // ...
  }

  @BeforeDestroy // define a before destroy hook
  async save() {
    // ...
  }
}

@Component
class UserService {
  constructor(
    private readonly cacheService = inject(CacheService),
    private readonly database = inject(Database),
  } {}
}

const container = new Container()

// custom provider's lifecycle
container.provide(Database, () => new Database(), {
  postConstruct: async (database) => await database.connect(),
  beforeDestroy: async (database) => await database.close(),
});

const userService = await container.get(UserService) // will call all PostConstruct hooks in order

await userService.getUser();

await container.destroy(); // will call all BeforeDestroy hooks in reverse order
```

### Named components

```typescript
import { Named, inject, Component } from 'kavri';

abstract class Pet {}

@Named(Pet, 'Dog') // no @Component needed
class Dog extends Pet {}

@Named(Pet, 'Cat')
class Cat extends Pet {}

class User {
  constructor(
    private readonly dog = inject(Pet, 'Dog')
  } {}
}

container.provide(Dog, Cat) // ensure Dog/Cat are imported
```

### Collections

```typescript
import { select, collection, symbol } from 'kavri';

@Component
class Dog {}
@Component
class Cat {}

const Pets = collection([Dog, Cat])

@Component
class AddAction {}
@Component
class UpdateAction {}
@Component
class DeleteAction {}

const ActionToken = symbol<'Add' | 'Update' | 'Delete'>()

const Action = select((action = inject(ActionToken)) => ({ AddAction, UpdateAction, DeleteAction })[action])

@Component
class Command {
  constructor(
    private readonly pets = inject(Pets), // Array<Dog | Cat>
    private readonly action = inject(Action), // AddAction | UpdateAction | DeleteAction
  ) {}
}
```

### Decorators

```typescript
import { decorator, metadata } from 'kavri';

export Controller = decorator((path: string) => ({ path }));

@Controller('/user')
class UserController {
  getUser(id: string) {}
}

container.provide(UserController);

const controllers = await container.getAll(Controller);

controllers.forEach((c) => metadata(c, Controller));
```

### Modules

```typescript
import { Module } from 'kavri';

// user.module.ts
export const UserModule = new Module({
  provides: [UserController],
});

// main.ts
container.import(UserModule);

await container.getAll(Controller);
```

### Configurations

```typescript
import { Configuration, argv } from 'kavri/config';
import { IsBool, IsString } from 'class-validator';

@Configuration('myapp.user')
class Config {
  @IsBool()
  enabled = true
  @IsString()
  defaultName = ''
}

class UserService {
  constructor(
    private readonly config = argv(Config),
    // or get a value
    private readonly defaultName = argv(Config, 'defaultName'),
  ) {}
}
```

### Lazy modules

#### Declared lazy module

```typescript
// user.module.ts
export default new Module({})

// user.module.lazy.ts
eexport default Module.lazy({
  imports: [ConfigModule],
  predicate: (config = argv(UserConfiguration)) => config.enabled,
  module: () => import('./user.module')
})
```

#### Lazy import

```typescript
container.import((config = argv(AppConfig)) => config.enableUserModule ? [import('./user.module')] : [])
```

