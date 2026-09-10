/**
 * IndexedDB-backed deduplication store.
 */

const DB_NAME = 'linkfinder_db';
const DB_VERSION = 1;

const STORES = {
    scanned: 'scanned_opportunities'
};

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORES.scanned)) {
                db.createObjectStore(STORES.scanned, { keyPath: 'fingerprint' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function hasFingerprint(fingerprint) {
    const db = await openDb();

    return new Promise((resolve) => {
        const tx = db.transaction(STORES.scanned, 'readonly');
        const store = tx.objectStore(STORES.scanned);
        const req = store.get(fingerprint);
        req.onsuccess = () => resolve(!!req.result);
        req.onerror = () => resolve(false);
    });
}

export async function upsertFingerprint(record) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.scanned, 'readwrite');
        const store = tx.objectStore(STORES.scanned);
        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

export async function bulkUpsert(records) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.scanned, 'readwrite');
        const store = tx.objectStore(STORES.scanned);

        for (const r of records) {
            store.put(r);
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}
