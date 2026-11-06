import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireRole } from "@/lib/authz";

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN", "PRINCIPAL", "Admin"]);

    const rootFile = path.join(process.cwd(), "System_Architecture.docx");
    const publicFile = path.join(process.cwd(), "public", "downloads", "System_Architecture.docx");
    const targetPath = fs.existsSync(rootFile) ? rootFile : publicFile;

    if (!fs.existsSync(targetPath)) {
      return NextResponse.json({ error: "System_Architecture.docx not found" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(targetPath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="System_Architecture.docx"',
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Unauthorized or download failed" }, { status: 403 });
  }
}
