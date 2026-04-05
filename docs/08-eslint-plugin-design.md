# ESLint Plugin Design

## 1. Purpose

Kavri's `inject()`, `injectAll()`, and `injectRef()` must only be called inside designated inject points. Calling them elsewhere is a runtime error. This ESLint plugin catches violations at lint time.

Package name: `eslint-plugin-kavri`

## 2. Rule: `kavri/inject-context`

Enforces that all inject functions are only called inside valid inject points.

### Valid inject points

An inject call is valid **only** as a **default parameter value** in:

1. **`@Component` class constructors**

   ```ts
   @Component()
   class UserService {
       constructor(private readonly db = inject(Database)) {} // ok
   }
   ```

2. **`token()` factory parameters**

   ```ts
   const DbUrl = token<string>(
       (config = inject(DbConfig)) => config.url // ok
   );
   ```

3. **`computed()` resolver parameters**

   ```ts
   const Selected = computed<Driver>(
       (cfg = inject(DbConfig), d = inject(Driver, cfg.driver)) => d // ok
   );
   ```

4. **`@Provide` factory parameters**

   ```ts
   @Provide(Redis, async (config = inject(RedisConfig)) => { // ok
       const r = new Redis();
       await r.connect(config.url);
       return r;
   })
   class CacheModule {}
   ```

5. **`@Decorate` decorator parameters**

   ```ts
   @Decorate(ConfigOptions, (prev, extra = inject(AppConfig)) => ({ // ok
       ...prev,
       configFiles: [extra.configDir + '/app.yaml'],
   }))
   class ConfigModule {}
   ```

6. **`ComponentOptions.condition` parameters**

   ```ts
   @Component({
       condition: (cfg = inject(FeatureFlags)) => cfg.enabled, // ok
   })
   class ConditionalService {}
   ```

### Invalid locations

```ts
// top-level — not inside any inject point
const db = inject(Database); // error

// inside a regular function
function getDb() {
    return inject(Database); // error
}

// inside a method body
class Service {
    getDb() {
        return inject(Database); // error
    }
}

// inside a constructor body (not a default param)
@Component()
class Service {
    constructor() {
        this.db = inject(Database); // error
    }
}

// inside a non-@Component class constructor
class PlainClass {
    constructor(private readonly db = inject(Database)) {} // error
}

// inside an arrow function that is not a token/computed/provide/decorate factory
const fn = () => inject(Database); // error

// inside a setTimeout / Promise callback
setTimeout(() => inject(Database), 0); // error
```

### Detection logic

The rule walks the AST upward from each inject call and checks:

1. **Is the call a default parameter value?** If not, report.
2. **What is the enclosing function?**
   - Constructor of a class decorated with `@Component` → valid.
   - Arrow/function passed as argument to `token()` → valid.
   - Arrow/function passed as argument to `computed()` → valid.
   - Arrow/function passed as 2nd argument of a `@Provide(target, factory)` decorator → valid.
   - Arrow/function passed as 2nd argument of a `@Decorate(target, decorator)` decorator → valid.
   - Arrow/function assigned to `condition` property in `@Component({ condition: ... })` → valid.
   - Anything else → report.

### Affected functions

The rule applies to these function names (configurable):

- `inject`
- `injectRef`
- `injectAll`

### Configuration

```jsonc
// .eslintrc
{
  "plugins": ["kavri"],
  "rules": {
    "kavri/inject-context": ["error", {
      // additional function names to restrict (if user creates custom inject helpers)
      "additionalFunctions": []
    }]
  }
}
```

### Error messages

```
`inject()` must be called as a default parameter inside a valid inject point
(@Component constructor, token() factory, computed() resolver, @Provide factory,
@Decorate decorator, or condition function).
```

## 3. Rule: `kavri/no-inject-after-side-effect`

Warns when inject calls appear in default parameters **after** parameters that could have side effects. This catches subtle bugs with the Suspense-style retry mechanism — if a factory has side effects before an inject call, those side effects will re-execute on retry.

### Examples

```ts
// ok — all inject calls, no side effects
const T = token<Conn>((url = inject(DbUrl), driver = inject(Driver)) => driver.connect(url));

// warning — inject after a non-inject default (could have side effects on retry)
const T = token<Conn>((id = crypto.randomUUID(), db = inject(Database)) => db.get(id));
//                      ^^^^^^^^^^^^^^^^^^^^^^^ side effect before inject
```

### Detection logic

In a factory function's parameter list, if a default parameter calls an inject function, all preceding default parameters must also be inject calls (or pure expressions). A parameter with a function call that isn't `inject*` preceding an inject call triggers the warning.

### Configuration

```jsonc
{
  "rules": {
    "kavri/no-inject-after-side-effect": "warn"
  }
}
```

### Error message

```
inject() call follows a parameter default that may have side effects.
If the factory is retried during async resolution, preceding defaults
will re-execute. Move inject() calls before side-effecting defaults.
```

## 4. Recommended config

```jsonc
// eslint.config.js (flat config)
import kavri from 'eslint-plugin-kavri';

export default [
  {
    plugins: { kavri },
    rules: {
      'kavri/inject-context': 'error',
      'kavri/no-inject-after-side-effect': 'warn',
    },
  },
];
```
