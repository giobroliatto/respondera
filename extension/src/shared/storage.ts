export interface StorageData {
  authToken: string | null;
  userEmail: string | null;
  userPlan: 'FREE' | 'PRO' | null;
  usageCount: number | null;
  emailVerified: boolean | null;
  defaultTone: string | null;
  renewalDate: string | null;
}

type StorageKey = keyof StorageData;

export async function getStorage<K extends StorageKey>(
  key: K
): Promise<StorageData[K]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve((result[key] ?? null) as StorageData[K]);
    });
  });
}

export async function setStorage<K extends StorageKey>(
  key: K,
  value: StorageData[K]
): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

export async function clearStorage(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}

export async function getAuthToken(): Promise<string | null> {
  return getStorage('authToken');
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await getAuthToken();
  return token !== null;
}
