import { redirect } from "next/navigation";

export default function CoursesRemovedRedirectPage() {
  redirect("/portal/dashboard");
}
