import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import type { myDataChecklist } from "@/lib/data/simulation";
import { profileStatusLabel } from "@/lib/domain/corrections";
import { formatMarks, formatUtc } from "@/lib/format";

type Checklist = NonNullable<Awaited<ReturnType<typeof myDataChecklist>>>;

/** Readable names for the portal's component fields. */
const COMPONENT_LABEL: Record<string, string> = {
  degree: "MBBS/BDS degree", houseJob: "House job", experience: "Experience", research: "Research", position: "University positions",
  hardAreas: "Hard-area service", matric: "Matric", fsc: "FSc", attempts: "Attempts", mdcat: "MDCAT",
};

function Row({ ok, label, children }: { ok: boolean | null; label: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-2.5">
      <Badge tone={ok === null ? "neutral" : ok ? "success" : "warning"}>{ok === null ? "n/a" : ok ? "have" : "missing"}</Badge>
      <div className="grid gap-0.5 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted">{children}</span>
      </div>
    </li>
  );
}

/**
 * What the app knows about the candidate's own record, and what is missing, so they
 * can tell why a simulation or prediction leaves them out.
 */
export function DataChecklist({ data, rounds }: { data: Checklist; rounds: number }) {
  if (!data.inData) {
    return (
      <Card>
        <CardHeader title="Your data in the app" />
        <ul className="divide-y divide-line">
          <Row ok={rounds > 0} label="Merit lists">{rounds ? `You appear in ${rounds} published round${rounds === 1 ? "" : "s"}.` : "You are not on an imported merit list yet."}</Row>
          <Row ok={data.induction == null ? null : false} label="Marks and preferences">
            {data.induction == null ? "No induction's simulation data has been imported yet." : `Induction ${data.induction}'s simulation data does not include applicant ${data.applicantId}, so the what-if simulation cannot place you. If you applied, tell the team.`}
          </Row>
        </ul>
      </Card>
    );
  }
  const components = Object.entries(data.components).sort(([a], [b]) => a.localeCompare(b));
  const programmes = Object.entries(data.programMarks);
  const replied = data.consent.filter((c) => c.replies.length);
  return (
    <Card>
      <CardHeader title="Your data in the app" description={`Induction ${data.induction}, as imported from the official portal on ${formatUtc(data.importedAt).slice(0, 10)}. The simulation uses exactly this.`} />
      <ul className="divide-y divide-line">
        <Row ok={rounds > 0} label="Merit lists">{rounds ? `You appear in ${rounds} published round${rounds === 1 ? "" : "s"}.` : "Not on an imported merit list yet."}</Row>
        <Row ok label="Base marks">
          <span className="font-mono text-ink">{formatMarks(data.baseMarks)}</span>{data.corrected ? " · includes a correction made by the team" : ""}
        </Row>
        <Row ok={components.length > 0} label="Components">
          {components.length ? (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {components.map(([k, v]) => <span key={k} className="rounded-lg bg-elevated px-2 py-0.5 text-xs">{COMPONENT_LABEL[k] ?? k} <span className="font-mono text-ink">{formatMarks(v)}</span></span>)}
            </span>
          ) : "No component breakdown was imported; only your total is known."}
        </Row>
        <Row ok={programmes.length > 0} label="Programme marks">{programmes.length ? programmes.map(([p, v]) => `${p} ${formatMarks(v)}`).join(" · ") : "None on file: a certificate bonus can only come from your certificates."}</Row>
        <Row ok={data.certificates > 0} label="Certificates">{data.certificates ? `${data.certificates} on file.` : "None on file. If you hold FCPS Part-I or JCAT, check it is on the official portal."}</Row>
        <Row ok={data.profileStatus === 1 ? true : data.profileStatus == null ? null : false} label="Profile status">
          {profileStatusLabel(data.profileStatus)}{data.profileStatus != null && data.profileStatus !== 1 ? ". Only Accepted profiles are placed in the simulation." : ""}
        </Row>
        <Row ok={data.preferences.length > 0} label="Preferences">{data.preferences.length ? data.preferences.map((p) => `${p.program}: ${p.count}`).join(" · ") : "None imported: the simulation cannot place you without preferences."}</Row>
        <Row ok={data.consent.length ? replied.length > 0 : null} label="Consent replies">
          {data.consent.length ? data.consent.map((c) => `R${c.round}: ${c.replies.length ? c.replies.join(", ") : "none"}`).join(" · ") : "No round's replies imported yet."}
        </Row>
      </ul>
    </Card>
  );
}
