const BASE_URL = process.env.SD_API_BASE_URL ?? "http://sd.isusystem.co.kr/api/incidents_low";

export type IncidentRaw = Record<string, string | null>;

export async function fetchIncidents(params: { higherCd: string; yyyy: string; mm: string }): Promise<IncidentRaw[]> {
  const url = `${BASE_URL}?higher_cd=${params.higherCd}&yyyy=${params.yyyy}&mm=${params.mm}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Service Desk API ${res.status} for ${params.higherCd} ${params.yyyy}-${params.mm}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Service Desk API: expected array");
  return data;
}
