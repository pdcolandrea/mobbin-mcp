import { z } from "zod";
import { MobbinAuth } from "../src/services/auth.js";
import { MobbinApiClient } from "../src/services/api-client.js";
import { readStoredSession } from "../src/utils/auth-store.js";
import {
  searchAppsResponseSchema,
  searchScreensResponseSchema,
  searchFlowsResponseSchema,
  searchableAppsResponseSchema,
  popularAppsResponseSchema,
  collectionsResponseSchema,
  dictionaryDefinitionsResponseSchema,
  autocompleteResponseSchema,
} from "../src/services/schemas.js";

/**
 * One-shot probe: hit every Mobbin endpoint and validate the live response against its zod schema.
 * Run BEFORE wiring schema validation into MobbinApiClient — this confirms the schemas match
 * reality without making the live client throw.
 */

const session = readStoredSession();
if (!session) {
  console.error("No stored session. Run 'npx mobbin-mcp auth' first.");
  process.exit(1);
}

const auth = MobbinAuth.fromSession(session);
const client = new MobbinApiClient(auth);

let failures = 0;

function check<T>(label: string, schema: z.ZodType<T>, value: unknown): void {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    console.log(`OK   ${label}`);
    return;
  }
  failures++;
  console.log(`FAIL ${label}`);
  for (const issue of parsed.error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    console.log(`       ${path}: ${issue.message}`);
  }
}

console.log("Probing every Mobbin endpoint against its schema...\n");

check(
  "searchApps (ios, pageSize=2)",
  searchAppsResponseSchema,
  await client.searchApps({ platform: "ios", pageSize: 2 }),
);

check(
  "searchScreens (ios, pageSize=2)",
  searchScreensResponseSchema,
  await client.searchScreens({ platform: "ios", pageSize: 2 }),
);

check(
  "searchFlows (ios, pageSize=2)",
  searchFlowsResponseSchema,
  await client.searchFlows({ platform: "ios", pageSize: 2 }),
);

check(
  "autocompleteSearch (query=login)",
  autocompleteResponseSchema,
  await client.autocompleteSearch({ query: "login" }),
);

check(
  "getSearchableApps (ios)",
  searchableAppsResponseSchema,
  await client.getSearchableApps("ios"),
);

check(
  "getPopularApps (ios, limitPerCategory=2)",
  popularAppsResponseSchema,
  await client.getPopularApps({ platform: "ios", limitPerCategory: 2 }),
);

check("getCollections", collectionsResponseSchema, await client.getCollections());

check(
  "getDictionaryDefinitions",
  dictionaryDefinitionsResponseSchema,
  await client.getDictionaryDefinitions(),
);

console.log();
if (failures > 0) {
  console.log(`${failures} endpoint(s) failed validation.`);
  process.exit(1);
}
console.log("All schemas match live API responses.");
