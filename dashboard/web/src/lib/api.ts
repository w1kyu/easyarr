export interface Health {
  status: 'ok';
  name: string;
  version: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => getJson<Health>('/api/health'),
};
