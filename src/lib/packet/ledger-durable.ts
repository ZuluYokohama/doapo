/**
 * Durable browser store for SealLedger (localStorage).
 * Power of 10: bounded, fail-closed, no recursion, append-only via ledger.ts.
 * Survives tab close; still not durable authority — opt-in demo persistence.
 * Session store remains for ephemeral demo (separate key).
 */
import {
  MAX_SEALS,
  appendSeal,
  createLedger,
  verifySealChain,
  type AppendSealResult,
  type SealAppendInput,
  type SealLedger,
} from "./ledger.ts";
import {
  LEDGER_STORE_MAX_BYTES,
  LEDGER_STORE_VERSION,
  parseStoredLedger,
  type LoadLedgerResult,
  type SaveLedgerResult,
} from "./ledger-store.ts";

/** Separate key from session store — survives tab close. */
export const LEDGER_DURABLE_KEY = "doapo.packet.seal-ledger.durable.v1";

/** Opt-in flag: user chose Persist ledger (prefer durable on load). */
export const LEDGER_DURABLE_OPT_IN_KEY =
  "doapo.packet.seal-ledger.durable.opt-in.v1";

function emptyLoad(reason: string): LoadLedgerResult {
  console.assert(reason.length > 0, "load reason present");
  return { ledger: createLedger(), reason };
}

function canUseLocalStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

/** True when durable key exists (any payload). Fail-closed if storage unavailable. */
export function durableLedgerPresent(): boolean {
  if (!canUseLocalStorage()) return false;
  try {
    return window.localStorage.getItem(LEDGER_DURABLE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Opt-in preference for preferring durable on start. */
export function isDurableOptIn(): boolean {
  if (!canUseLocalStorage()) return false;
  try {
    return window.localStorage.getItem(LEDGER_DURABLE_OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

function setDurableOptIn(on: boolean): void {
  if (!canUseLocalStorage()) return;
  try {
    if (on) {
      window.localStorage.setItem(LEDGER_DURABLE_OPT_IN_KEY, "1");
    } else {
      window.localStorage.removeItem(LEDGER_DURABLE_OPT_IN_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Load durable ledger. Verify chain on load; corrupt → empty + reason.
 * Same payload shape as session store (version + seals).
 */
export function loadDurableLedger(): LoadLedgerResult {
  if (!canUseLocalStorage()) {
    return emptyLoad("localStorage unavailable");
  }
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(LEDGER_DURABLE_KEY);
  } catch {
    return emptyLoad("localStorage getItem failed");
  }
  if (raw === null) {
    return { ledger: createLedger(), reason: null };
  }
  return parseStoredLedger(raw);
}

/** Persist ledger to localStorage. Caps at MAX_SEALS; verifies chain before write. */
export function saveDurableLedger(ledger: SealLedger): SaveLedgerResult {
  console.assert(ledger !== null && ledger !== undefined, "ledger present");
  if (!canUseLocalStorage()) {
    return { ok: false, reason: "localStorage unavailable" };
  }
  if (!Array.isArray(ledger.seals)) {
    return { ok: false, reason: "seals not an array" };
  }
  if (ledger.seals.length > MAX_SEALS) {
    return { ok: false, reason: "seals exceed MAX_SEALS" };
  }
  const chain = verifySealChain(ledger);
  if (!chain.ok) {
    return { ok: false, reason: chain.reason };
  }
  const payload = JSON.stringify({
    version: LEDGER_STORE_VERSION,
    seals: ledger.seals,
  });
  if (payload.length > LEDGER_STORE_MAX_BYTES) {
    return { ok: false, reason: "payload exceeds LEDGER_STORE_MAX_BYTES" };
  }
  try {
    window.localStorage.setItem(LEDGER_DURABLE_KEY, payload);
  } catch {
    return { ok: false, reason: "localStorage setItem failed" };
  }
  setDurableOptIn(true);
  return { ok: true };
}

/** Clear durable ledger and opt-in (ignore if unavailable). */
export function clearDurableLedger(): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(LEDGER_DURABLE_KEY);
    window.localStorage.removeItem(LEDGER_DURABLE_OPT_IN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Copy session→durable (caller supplies session ledger). Sets opt-in.
 * Never rewrites middle — full replace of durable payload only.
 */
export function persistSessionToDurable(ledger: SealLedger): SaveLedgerResult {
  return saveDurableLedger(ledger);
}

/**
 * Append one seal then persist to durable. Fail-closed on append or save.
 * Does not rewrite or delete middle seals.
 */
export function appendAndPersist(
  ledger: SealLedger,
  input: SealAppendInput,
): AppendSealResult {
  console.assert(ledger !== null && ledger !== undefined, "ledger present");
  const appended = appendSeal(ledger, input);
  if (!appended.ok) {
    return appended;
  }
  const saved = saveDurableLedger(appended.ledger);
  if (!saved.ok) {
    return { ok: false, reason: saved.reason };
  }
  return appended;
}

/**
 * Prefer durable when present (key + opt-in or non-empty valid chain),
 * else session. Corrupt durable → empty ledger (fail-closed), still preferred
 * only when opt-in so UI can show the reason.
 */
export function loadPreferredLedger(sessionLoad: LoadLedgerResult): {
  ledger: SealLedger;
  source: "durable" | "session";
  reason: string | null;
} {
  console.assert(sessionLoad !== null && sessionLoad !== undefined, "session load");
  const present = durableLedgerPresent();
  const optIn = isDurableOptIn();
  if (!present && !optIn) {
    return {
      ledger: sessionLoad.ledger,
      source: "session",
      reason: sessionLoad.reason,
    };
  }
  const durable = loadDurableLedger();
  if (present || optIn) {
    return {
      ledger: durable.ledger,
      source: "durable",
      reason: durable.reason,
    };
  }
  return {
    ledger: sessionLoad.ledger,
    source: "session",
    reason: sessionLoad.reason,
  };
}
