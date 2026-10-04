import type { DraftRecord } from "../types/session";

const DB_NAME = "ai-interview-db";
const STORE_NAME = "session-drafts";

/**
 * Initialize (or create) the IndexedDB instance for persistent audio/code drafts.
 * @returns {Promise<IDBDatabase>}
 */
function initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
        request.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
    });
}

/**
 * Persist the current session drafts (audio blobs and code text) to IndexedDB.
 * Since Blobs cannot go in LocalStorage, this is essential for "Resume Interview".
 * @param {string} sessionId - The current session ID.
 * @param {DraftRecord} drafts - The draft state object.
 */
export async function saveDrafts(sessionId: string, drafts: DraftRecord) {
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put(drafts, sessionId);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.error("IndexedDB Save Error:", error);
    }
}

/**
 * Retrieve saved drafts for a specific session from IndexedDB.
 * @param {string} sessionId - The session ID to fetch drafts for.
 * @returns {Promise<DraftRecord>} The saved draft state or an empty object.
 */
export async function getDrafts(sessionId: string): Promise<DraftRecord> {
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(sessionId);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || {});
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("IndexedDB Get Error:", error);
        return {};
    }
}

/**
 * Purge all drafts for a session once the interview is completed or deleted.
 * @param {string} sessionId 
 */
export async function deleteDrafts(sessionId: string) {
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.delete(sessionId);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.error("IndexedDB Delete Error:", error);
    }
}
