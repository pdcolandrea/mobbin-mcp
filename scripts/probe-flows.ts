import { MobbinAuth } from "../src/services/auth.js";
import { MobbinApiClient } from "../src/services/api-client.js";
import { readStoredSession } from "../src/utils/auth-store.js";
import { formatFlows } from "../src/utils/formatting.js";

const session = readStoredSession();
if (!session) {
  console.error("No stored session. Run 'npx mobbin-mcp auth' first.");
  process.exit(1);
}

const auth = MobbinAuth.fromSession(session);
const client = new MobbinApiClient(auth);

async function probe(label: string, params: Parameters<MobbinApiClient["searchFlows"]>[0]) {
  console.log(`\n=== ${label} ===`);
  console.log("params:", JSON.stringify(params));
  const res = await client.searchFlows(params);
  const data = res.value.data;
  console.log(`returned ${data.length} flows`);
  console.log(formatFlows(data));
}

await probe("no filters, page_size=2", { platform: "ios", pageSize: 2 });
await probe("flow_actions=Creating Account, page_size=2", {
  platform: "ios",
  flowActions: ["Creating Account"],
  pageSize: 2,
});
await probe("flow_actions=Filtering & Sorting, page_size=2", {
  platform: "ios",
  flowActions: ["Filtering & Sorting"],
  pageSize: 2,
});
