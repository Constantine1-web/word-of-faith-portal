import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import PreviewResponsiveClient from "./PreviewResponsiveClient";

export const dynamic = "force-dynamic";

export default async function PreviewResponsivePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  try {
    await requireCapability("MANAGE_SYSTEM");
  } catch {
    redirect("/portal/unauthorized?zone=preview");
  }

  return <PreviewResponsiveClient />;
}
