---
name: Password hashing algorithm
description: The app uses Node's built-in scrypt (not bcryptjs) with a hex.salt format.
---

## Rule
All password hashing uses Node's built-in `crypto.scrypt` with a `randomBytes(16)` salt.  
Stored format: `"<64-byte-hash-hex>.<16-byte-salt-hex>"`.

```ts
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}
```

**Why:** `bcryptjs` is not installed. The auth module (`server/auth.ts`) implements this pattern. Any script (seed, tests, migrations) that creates users must replicate this exactly or login will fail.

**How to apply:** Copy the `hashPassword` helper from `server/auth.ts` into any script that needs to create users — do not install bcryptjs.
