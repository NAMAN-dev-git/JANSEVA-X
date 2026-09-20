export type CopilotMatchKind = "service" | "exam";
export type CopilotCatalogService = { serviceId: string; name: string; description?: string | null };
export type CopilotCatalogExam = { id: string; name: string };
export type CopilotMatch = { kind: CopilotMatchKind; id: string; name: string; description: string };

function normalized(value: string): string { return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }

/** Matches only explicit JANSEVA-X catalogue records; it never invents a service. */
export function matchCopilotIntent(input: string, services: CopilotCatalogService[], exams: CopilotCatalogExam[]): CopilotMatch | null {
  const query = normalized(input);
  if (!query) return null;
  const ssc = exams.find((exam) => normalized(exam.name).includes("ssc cgl"));
  if (ssc && (query.includes("ssc cgl") || (query.includes("ssc") && (query.includes("form") || query.includes("apply") || query.includes("bhar"))) || query.includes("ssc wala"))) return { kind: "exam", id: ssc.id, name: ssc.name, description: "Existing JANSEVA-X demo exam application" };
  const tradeLicence = services.find((service) => normalized(service.name).includes("trade licence"));
  if (tradeLicence && (query.includes("trade licence") || query.includes("trade license") || (query.includes("licence") && query.includes("renew")) || (query.includes("license") && query.includes("renew")))) return { kind: "service", id: tradeLicence.serviceId, name: tradeLicence.name, description: "Existing JANSEVA-X Trade Licence prototype application" };
  const direct = services.find((service) => { const name = normalized(service.name); return name.length > 3 && (query.includes(name) || name.includes(query)); });
  return direct ? { kind: "service", id: direct.serviceId, name: direct.name, description: "Existing JANSEVA-X prototype service" } : null;
}
