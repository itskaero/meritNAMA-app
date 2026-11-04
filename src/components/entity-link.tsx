import Link from "next/link";

const BASE = { speciality: "/portal/explore/specialities", hospital: "/portal/explore/hospitals" } as const;

/** A speciality or hospital name, linked to its page when the name is mapped to one. */
export function EntityLink({ kind, id, name, className = "" }: { kind: keyof typeof BASE; id: number | null | undefined; name: string; className?: string }) {
  if (!id) return <span className={className}>{name}</span>;
  return <Link href={`${BASE[kind]}/${id}`} className={`hover:text-signal hover:underline ${className}`}>{name}</Link>;
}
