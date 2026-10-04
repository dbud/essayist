import { assertEquals } from "@std/assert";
import { claim } from "./lease.ts";
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
