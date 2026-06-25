/**
 * Belt-and-suspenders local buffer for in-progress composer content. Gmail-draft
 * autosave is the primary "don't lose work" (cross-device, debounced); this is
 * the offline/failure backstop — if autosave can't reach Gmail and the tab dies,
 * the latest content survives here and is offered back on the next compose.
 *
 * The buffer is cleared the moment a Gmail draft save succeeds (Gmail now holds
 * it), on send, and on discard — so a leftover buffer means "the last session
 * never committed," which is exactly when we prompt to restore.
 */

export type BufferedDraft = {
  fromId: string | null;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  updatedAt: number;
};

const DB_NAME = "betterbox";
const STORE = "compose-buffer";
const KEY = "current";

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  if (!isAvailable()) return null;
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    // IndexedDB blocked (private mode, quota) — the Gmail autosave still covers
    // the common case, so degrade silently.
    return null;
  }
}

export async function saveDraftBuffer(
  draft: Omit<BufferedDraft, "updatedAt">,
): Promise<void> {
  await withStore("readwrite", (store) =>
    store.put({ ...draft, updatedAt: Date.now() }, KEY),
  );
}

export async function loadDraftBuffer(): Promise<BufferedDraft | null> {
  const data = await withStore<BufferedDraft>("readonly", (store) =>
    store.get(KEY),
  );
  return data ?? null;
}

export async function clearDraftBuffer(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(KEY));
}
