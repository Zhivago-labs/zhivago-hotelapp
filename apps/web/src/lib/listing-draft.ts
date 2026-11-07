// IndexedDB preserves File objects as well as partial fields. Drafts are scoped to the account.
export async function listingDraft<T>(key: string, value?: T): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("zhivago-listing-drafts", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("drafts");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("drafts", value === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore("drafts");
      const request = value === undefined ? store.get(key) : store.put(value, key);
      tx.oncomplete = () => { db.close(); resolve(value === undefined ? request.result : value); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
