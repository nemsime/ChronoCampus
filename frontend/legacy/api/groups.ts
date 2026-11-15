export interface DatabaseGroup {
  id: number;
  code: string;
  major_name: string;
  admission_year: number;
  capacity: number;
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/$/, '');

export async function fetchGroups(signal: AbortSignal): Promise<DatabaseGroup[]> {
  const response = await fetch(`${baseUrl}/groups`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Groups request failed (${response.status}).`);
  }
  return response.json();
}
