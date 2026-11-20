import { getPublicAdmissionsSchedules } from "@/app/actions/admissionsPublic";
import AdmissionsClient from "./AdmissionsClient";

export const dynamic = "force-dynamic";

export default async function AdmissionsPage() {
  const schedules = await getPublicAdmissionsSchedules();
  return <AdmissionsClient initialSchedules={schedules} />;
}
