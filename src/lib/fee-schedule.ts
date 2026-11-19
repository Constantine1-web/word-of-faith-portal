import prisma from "@/lib/db";

export type FeeLevelGroup = "CRECHE_NURSERY" | "PRIMARY" | "JSS" | "SSS";

export interface DefaultFeeScheduleDef {
  levelGroup: FeeLevelGroup;
  displayName: string;
  tuitionNaira: number;
  leviesNaira: number;
  maintenanceFeeNaira: number;
}

export const DEFAULT_FEE_SCHEDULES: DefaultFeeScheduleDef[] = [
  {
    levelGroup: "CRECHE_NURSERY",
    displayName: "Creche & Nursery",
    tuitionNaira: 45000,
    leviesNaira: 4000,
    maintenanceFeeNaira: 1000,
  },
  {
    levelGroup: "PRIMARY",
    displayName: "Primary School (Basic 1–5)",
    tuitionNaira: 52000,
    leviesNaira: 4000,
    maintenanceFeeNaira: 1000,
  },
  {
    levelGroup: "JSS",
    displayName: "Junior Secondary (JSS 1–3)",
    tuitionNaira: 60000,
    leviesNaira: 4000,
    maintenanceFeeNaira: 1000,
  },
  {
    levelGroup: "SSS",
    displayName: "Senior Secondary (SS 1–3)",
    tuitionNaira: 68000,
    leviesNaira: 6000,
    maintenanceFeeNaira: 1000,
  },
];

/**
 * Maps a student's ClassName and Level string to one of the 4 canonical FeeSchedule level groups.
 */
export function resolveFeeLevelGroup(className?: string | null, level?: string | null): FeeLevelGroup {
  const combined = `${className || ""} ${level || ""}`.toLowerCase();
  if (
    combined.includes("creche") ||
    combined.includes("nursery") ||
    combined.includes("pre-nursery") ||
    combined.includes("kg")
  ) {
    return "CRECHE_NURSERY";
  }
  if (combined.includes("primary") || combined.includes("basic")) {
    return "PRIMARY";
  }
  if (combined.includes("ss") && !combined.includes("jss")) {
    return "SSS";
  }
  if (combined.includes("senior")) {
    return "SSS";
  }
  return "JSS";
}

/**
 * Ensures the 4 default FeeSchedule rows exist in PostgreSQL (idempotent) and returns them serialized.
 */
export async function ensureAndListFeeSchedules() {
  for (const def of DEFAULT_FEE_SCHEDULES) {
    await prisma.feeSchedule.upsert({
      where: { levelGroup: def.levelGroup },
      create: {
        levelGroup: def.levelGroup,
        displayName: def.displayName,
        tuitionKobo: BigInt(def.tuitionNaira * 100),
        leviesKobo: BigInt(def.leviesNaira * 100),
        maintenanceFeeKobo: BigInt(def.maintenanceFeeNaira * 100),
      },
      update: {},
    });
  }

  const rows = await prisma.feeSchedule.findMany({
    where: { isActive: true },
  });

  const order: Record<string, number> = {
    CRECHE_NURSERY: 1,
    PRIMARY: 2,
    JSS: 3,
    SSS: 4,
  };

  return rows
    .sort((a, b) => (order[a.levelGroup] || 99) - (order[b.levelGroup] || 99))
    .map((r) => {
      const tuitionNaira = Number(r.tuitionKobo) / 100;
      const leviesNaira = Number(r.leviesKobo) / 100;
      const maintenanceFeeNaira = Number(r.maintenanceFeeKobo) / 100;
      return {
        id: r.id,
        levelGroup: r.levelGroup as FeeLevelGroup,
        displayName: r.displayName,
        tuitionNaira,
        leviesNaira,
        maintenanceFeeNaira,
        totalNaira: tuitionNaira + leviesNaira + maintenanceFeeNaira,
        totalKobo: r.tuitionKobo + r.leviesKobo + r.maintenanceFeeKobo,
      };
    });
}

export async function getFeeScheduleForClass(className?: string | null, level?: string | null) {
  const schedules = await ensureAndListFeeSchedules();
  const group = resolveFeeLevelGroup(className, level);
  return schedules.find((s) => s.levelGroup === group) || schedules[2] || schedules[0];
}
