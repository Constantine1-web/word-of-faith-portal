import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const students = await prisma.student.findMany();
    const users = await prisma.user.findMany();
    
    return NextResponse.json({ 
      studentCount: students.length,
      userCount: users.length,
      students: students,
      users: users
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
