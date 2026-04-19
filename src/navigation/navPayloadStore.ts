const payloadStore = new Map<string, any>();

export function storeNavigationPayload(payload: any): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  payloadStore.set(id, payload);
  return id;
}

export function getNavigationPayload<T = any>(id?: string): T | undefined {
  if (!id) return undefined;
  return payloadStore.get(id) as T | undefined;
}
