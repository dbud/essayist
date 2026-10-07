import { assert, assertEquals } from "@std/assert";
import { claim, heartbeat, stripLease } from "./lease.ts";
import { InMemoryAdapter, type Leased } from "./mod.ts";

interface Note extends Leased<{ id: string; body: string }> {
  id: string;
  body: string;
}

const KEY = ["notes", "n1"];

function adapter() {
  return new InMemoryAdapter();
}

async function seed(a: ReturnType<typeof adapter>, note: Note) {
  await a.set(KEY, note);
  return note;
}

/** Heartbeat a claim stamped, so a cutoff can be placed relative to it. */
async function claimedHeartbeat(
  a: ReturnType<typeof adapter>,
  owner: string,
): Promise<number> {
  const taken = await claim<Note>(a, KEY, { owner, heartbeatAtLeast: 0 });
  if (taken?.heartbeatAt === undefined) {
    throw new Error("claim did not stamp a heartbeat");
  }
  return taken.heartbeatAt;
}

Deno.test("claim -- takes an unleased record", async () => {
  const a = adapter();
  await seed(a, { id: "n1", body: "hello" });

  const taken = await claim<Note>(a, KEY, {
    owner: "driver-a",
    heartbeatAtLeast: 0,
  });

  assertEquals(taken?.leaseOwner, "driver-a");
  assertEquals(taken?.body, "hello");
  assertEquals(typeof taken?.heartbeatAt, "number");
  assertEquals((await a.get<Note>(KEY))?.value.leaseOwner, "driver-a");
});

Deno.test("claim -- refuses while another lease is live", async () => {
  const a = adapter();
  await seed(a, { id: "n1", body: "hello" });
  const heartbeatAtLeast = await claimedHeartbeat(a, "driver-a");

  const refused = await claim<Note>(a, KEY, {
    owner: "driver-b",
    heartbeatAtLeast,
  });

  assertEquals(refused, undefined);
  assertEquals((await a.get<Note>(KEY))?.value.leaseOwner, "driver-a");
});

Deno.test("claim -- takes a lease that has gone stale", async () => {
  const a = adapter();
  await seed(a, { id: "n1", body: "hello" });
  // Past driver-a's heartbeat, so it no longer meets the bar.
  const heartbeatAtLeast = (await claimedHeartbeat(a, "driver-a")) + 1;

  const taken = await claim<Note>(a, KEY, {
    owner: "driver-b",
    heartbeatAtLeast,
  });

  assertEquals(taken?.leaseOwner, "driver-b");
});

Deno.test("claim -- renews our own lease", async () => {
  const a = adapter();
  await seed(a, { id: "n1", body: "hello" });
  const first = await claimedHeartbeat(a, "driver-a");

  const again = await claim<Note>(a, KEY, {
    owner: "driver-a",
    heartbeatAtLeast: first + 1,
  });

  assertEquals(again?.leaseOwner, "driver-a");
});

Deno.test("claim -- returns undefined for an absent record", async () => {
  const a = adapter();
  assertEquals(
    await claim<Note>(a, KEY, { owner: "driver-a", heartbeatAtLeast: 0 }),
    undefined,
  );
});

Deno.test("claim -- two owners racing, only one wins", async () => {
  const a = adapter();
  await seed(a, { id: "n1", body: "hello" });
  const heartbeatAtLeast = Date.now() + 60_000;

  const [x, y] = await Promise.all([
    claim<Note>(a, KEY, { owner: "driver-a", heartbeatAtLeast }),
    claim<Note>(a, KEY, { owner: "driver-b", heartbeatAtLeast }),
  ]);

  const winners = [x, y].filter((taken) => taken !== undefined);
  assertEquals(winners.length, 1);
  assertEquals(
    (await a.get<Note>(KEY))?.value.leaseOwner,
    winners[0].leaseOwner,
  );
});

Deno.test("heartbeat -- renews our own lease, however old it is", async () => {
  const a = adapter();
  await seed(a, {
    id: "n1",
    body: "hello",
    leaseOwner: "driver-a",
    heartbeatAt: 1000,
  });

  const held = await heartbeat<Note>(a, KEY, "driver-a");

  assertEquals(held, true);
  const renewed = (await a.get<Note>(KEY))?.value;
  assertEquals(renewed?.leaseOwner, "driver-a");
  assert((renewed?.heartbeatAt ?? 0) > 1000);
  assertEquals(renewed?.body, "hello");
});

Deno.test("heartbeat -- refuses a lease held by another owner", async () => {
  const a = adapter();
  await seed(a, {
    id: "n1",
    body: "hello",
    leaseOwner: "driver-b",
    heartbeatAt: 1000,
  });

  assertEquals(await heartbeat<Note>(a, KEY, "driver-a"), false);

  const untouched = (await a.get<Note>(KEY))?.value;
  assertEquals(untouched?.leaseOwner, "driver-b");
  assertEquals(untouched?.heartbeatAt, 1000);
});

Deno.test("heartbeat -- refuses an unleased record", async () => {
  const a = adapter();
  await seed(a, { id: "n1", body: "hello" });

  assertEquals(await heartbeat<Note>(a, KEY, "driver-a"), false);
  assertEquals((await a.get<Note>(KEY))?.value.leaseOwner, undefined);
});

Deno.test("heartbeat -- returns false for an absent record", async () => {
  const a = adapter();
  assertEquals(await heartbeat<Note>(a, KEY, "driver-a"), false);
});

Deno.test("stripLease -- drops the lease fields", () => {
  const record: Note = {
    id: "n1",
    body: "hello",
    leaseOwner: "driver-a",
    heartbeatAt: 3,
  };

  const bare = stripLease(record);

  assertEquals(bare, { id: "n1", body: "hello" });
});
