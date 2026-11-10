/** Gazette ranking: standard competition ranking, so equal marks share a rank (1, 2, 2, 4). */
export function rankRows<T extends { marks: number }>(sortedDesc: T[]): (T & { rank: number })[] {
  let rank = 0;
  return sortedDesc.map((r, i) => {
    if (i === 0 || r.marks !== sortedDesc[i - 1]!.marks) rank = i + 1;
    return { ...r, rank };
  });
}

/** Eligible (1), rejected (2), or not stated. */
export function gazetteStatus(profileStatus: number | null): "eligible" | "rejected" | "unknown" {
  return profileStatus === 1 ? "eligible" : profileStatus === 2 ? "rejected" : "unknown";
}
