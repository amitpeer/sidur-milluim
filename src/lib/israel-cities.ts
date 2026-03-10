let cached: string[] | null = null;

export async function fetchIsraelCities(): Promise<string[]> {
  if (cached) return cached;

  const url =
    "https://data.gov.il/api/3/action/datastore_search?resource_id=b7cf8f14-64a2-4b33-8d4b-edb286fdbd37&limit=1500";
  const response = await fetch(url);
  const json = await response.json();

  const records = json.result?.records as Array<Record<string, unknown>> | undefined;
  if (!records) return [];

  const names = records
    .map((r) => String(r["שם_ישוב"] ?? "").trim())
    .filter((name) => name.length > 0);

  names.sort((a, b) => a.localeCompare(b, "he"));
  cached = names;
  return names;
}
