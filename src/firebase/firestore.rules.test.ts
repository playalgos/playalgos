// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import fs from "node:fs";

let testEnv: RulesTestEnvironment;

describe("firestore security rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "seekv8-rules-test",
      firestore: {
        rules: fs.readFileSync("firestore.rules", "utf8")
      }
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc("users/alice").set({ createdAt: new Date(), lastSeenAt: new Date() });
      await db.doc("users/alice/bestScores/binary-search").set({ bestAttempts: 7, delta: 0 });
      await db.doc("users/alice/bestScores/range-narrowing").set({ bestSelections: 6, delta: -1 });
      await db.doc("users/alice/bestScores/quick-sort-pivot").set({ bestCost: 12, delta: 4 });
      await db.doc("users/alice/bestScores/knapsack-treasure-bag").set({
        bestDelta: 0,
        selectedValue: 17,
        delta: 0
      });
      await db.doc("users/alice/bestScores/dijkstra-path-strategy").set({
        bestCost: 9,
        delta: 0
      });
      await db.doc("users/alice/sessions/range-session-1").set({
        gameId: "range-narrowing",
        selections: 1,
        status: "playing"
      });
      await db.doc("users/alice/sessions/quick-sort-session-1").set({
        gameId: "quick-sort-pivot",
        roundsCompleted: 2,
        status: "playing"
      });
      await db.doc("users/alice/sessions/knapsack-session-1").set({
        gameId: "knapsack-treasure-bag",
        capacity: 10,
        submitAttempts: 1,
        status: "playing",
        expiresAt: new Date(Date.now() + 60_000)
      });
      await db.doc("users/alice/sessions/dijkstra-session-1").set({
        gameId: "dijkstra-path-strategy",
        scenarioId: "city-1",
        validLocks: 1,
        invalidLocks: 0,
        status: "playing",
        expiresAt: new Date(Date.now() + 60_000)
      });
      await db.doc("leaderboards/binary-search/entries/alice").set({ bestAttempts: 7, delta: 0 });
      await db.doc("leaderboards/range-narrowing/entries/alice").set({ bestSelections: 6, delta: -1 });
      await db.doc("leaderboards/quick-sort-pivot/entries/alice").set({ bestCost: 12, delta: 4 });
      await db.doc("leaderboards/knapsack-treasure-bag/entries/alice").set({
        bestDelta: 0,
        selectedValue: 17,
        delta: 0
      });
      await db.doc("leaderboards/dijkstra-path-strategy/entries/alice").set({
        bestCost: 9,
        delta: 0
      });
      await db.doc("sessionSecrets/secret-1").set({
        uid: "alice",
        gameId: "range-narrowing",
        target: 42
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows owner to read own data", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(db.doc("users/alice").get());
  });

  it("blocks client write to sessions", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("users/alice/sessions/s1").set({
        gameId: "binary-search",
        attempts: 1
      })
    );
  });

  it("blocks client write to knapsack sessions", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("users/alice/sessions/knapsack-session-1").update({
        submitAttempts: 2
      })
    );
  });

  it("blocks client write to dijkstra sessions", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("users/alice/sessions/dijkstra-session-1").update({
        invalidLocks: 1
      })
    );
  });

  it("blocks client write to bestScores", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("users/alice/bestScores/binary-search").set({
        bestAttempts: 6,
        delta: -1
      })
    );
  });

  it("blocks client write to range-narrowing bestScores", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("users/alice/bestScores/range-narrowing").set({
        bestSelections: 5,
        delta: -2
      })
    );
  });

  it("blocks client write to quick-sort bestScores", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("users/alice/bestScores/quick-sort-pivot").set({
        bestCost: 11,
        delta: 3
      })
    );
  });

  it("blocks client write to knapsack bestScores", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("users/alice/bestScores/knapsack-treasure-bag").set({
        bestDelta: -1,
        selectedValue: 18,
        delta: -1
      })
    );
  });

  it("blocks client write to dijkstra bestScores", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("users/alice/bestScores/dijkstra-path-strategy").set({
        bestCost: 8,
        delta: -1
      })
    );
  });

  it("allows public leaderboard reads", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.doc("leaderboards/binary-search/entries/alice").get());
  });

  it("blocks leaderboard writes from clients", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("leaderboards/binary-search/entries/alice").set({
        bestAttempts: 6,
        delta: -1
      })
    );
  });

  it("blocks range-narrowing leaderboard writes from clients", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("leaderboards/range-narrowing/entries/alice").set({
        bestSelections: 5,
        delta: -2
      })
    );
  });

  it("blocks quick-sort leaderboard writes from clients", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("leaderboards/quick-sort-pivot/entries/alice").set({
        bestCost: 11,
        delta: 3
      })
    );
  });

  it("blocks knapsack leaderboard writes from clients", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("leaderboards/knapsack-treasure-bag/entries/alice").set({
        bestDelta: -1,
        selectedValue: 18,
        delta: -1
      })
    );
  });

  it("blocks dijkstra leaderboard writes from clients", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      db.doc("leaderboards/dijkstra-path-strategy/entries/alice").set({
        bestCost: 8,
        delta: -1
      })
    );
  });

  it("allows owner read for quick-sort session and score docs", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(db.doc("users/alice/sessions/quick-sort-session-1").get());
    await assertSucceeds(db.doc("users/alice/bestScores/quick-sort-pivot").get());
  });

  it("allows owner read for knapsack session and score docs", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(db.doc("users/alice/sessions/knapsack-session-1").get());
    await assertSucceeds(db.doc("users/alice/bestScores/knapsack-treasure-bag").get());
  });

  it("allows owner read for dijkstra session and score docs", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(db.doc("users/alice/sessions/dijkstra-session-1").get());
    await assertSucceeds(db.doc("users/alice/bestScores/dijkstra-path-strategy").get());
  });

  it("blocks direct client access to sessionSecrets", async () => {
    const authDb = testEnv.authenticatedContext("alice").firestore();
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(authDb.doc("sessionSecrets/secret-1").get());
    await assertFails(anonDb.doc("sessionSecrets/secret-1").get());
    await assertFails(
      authDb.doc("sessionSecrets/secret-2").set({
        uid: "alice",
        target: 17
      })
    );
  });

  it("blocks cross-user read", async () => {
    const db = testEnv.authenticatedContext("bob").firestore();
    await assertFails(db.doc("users/alice").get());
  });
});
