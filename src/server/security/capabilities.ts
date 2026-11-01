export type Capability =
    | "MANAGE_USERS"
    | "MANAGE_STRUCTURE"
    | "MANAGE_STUDENTS"
    | "CORRECT_SCORES"
    | "APPROVE_RESULTS"
    | "PUBLISH_RESULTS"
    | "UNLOCK_SHEETS"
    | "FREEZE_TERM"
    | "MANAGE_FINANCE"
    | "APPROVE_PAYMENTS"
    | "MANAGE_CARDS"
    | "MANAGE_CBT"
    | "VIEW_AUDIT"
    | "MANAGE_SYSTEM";

export const ALL_CAPABILITIES: Capability[] = [
    "MANAGE_USERS",
    "MANAGE_STRUCTURE",
    "MANAGE_STUDENTS",
    "CORRECT_SCORES",
    "APPROVE_RESULTS",
    "PUBLISH_RESULTS",
    "UNLOCK_SHEETS",
    "FREEZE_TERM",
    "MANAGE_FINANCE",
    "APPROVE_PAYMENTS",
    "MANAGE_CARDS",
    "MANAGE_CBT",
    "VIEW_AUDIT",
    "MANAGE_SYSTEM",
];

export const CAPABILITY_METADATA: Record<
    Capability,
    { label: string; description: string; requiresStepUpTotp: boolean }
> = {
    MANAGE_USERS: {
        label: "Manage Users",
        description: "Create, deactivate, change roles and capabilities, issue staff invites",
        requiresStepUpTotp: true,
    },
    MANAGE_STRUCTURE: {
        label: "Manage Structure",
        description: "Sessions, terms, classes, subjects, teacher allocation, form masters",
        requiresStepUpTotp: false,
    },
    MANAGE_STUDENTS: {
        label: "Manage Students",
        description: "Student records, enrollment, admissions, guardian links",
        requiresStepUpTotp: false,
    },
    CORRECT_SCORES: {
        label: "Correct Scores",
        description: "Edit any score with a reason (step-up TOTP on published terms)",
        requiresStepUpTotp: true,
    },
    APPROVE_RESULTS: {
        label: "Approve Results",
        description: "Compute broadsheets, sign off",
        requiresStepUpTotp: false,
    },
    PUBLISH_RESULTS: {
        label: "Publish Results",
        description: "Release results to students (step-up TOTP after a correction)",
        requiresStepUpTotp: true,
    },
    UNLOCK_SHEETS: {
        label: "Unlock Sheets",
        description: "Decide sheet unlock requests",
        requiresStepUpTotp: true,
    },
    FREEZE_TERM: {
        label: "Freeze Term",
        description: "Term freeze, rollover",
        requiresStepUpTotp: true,
    },
    MANAGE_FINANCE: {
        label: "Manage Finance",
        description: "Invoices, waivers, reports",
        requiresStepUpTotp: false,
    },
    APPROVE_PAYMENTS: {
        label: "Approve Payments",
        description: "Teller approvals (never your own submission)",
        requiresStepUpTotp: false,
    },
    MANAGE_CARDS: {
        label: "Manage Cards",
        description: "Generate, issue, revoke scratch cards",
        requiresStepUpTotp: true,
    },
    MANAGE_CBT: {
        label: "Manage CBT",
        description: "Plans, question bank, integrity reports, day locks",
        requiresStepUpTotp: false,
    },
    VIEW_AUDIT: {
        label: "View Audit",
        description: "Search and export the audit log",
        requiresStepUpTotp: false,
    },
    MANAGE_SYSTEM: {
        label: "Manage System",
        description: "Settings, integrations, keys",
        requiresStepUpTotp: true,
    },
};

export type CapabilityPresetName = "FULL" | "FINANCE" | "REGISTRY";

export const CAPABILITY_PRESETS: Record<CapabilityPresetName, Capability[]> = {
    FULL: [...ALL_CAPABILITIES],
    FINANCE: ["MANAGE_FINANCE", "APPROVE_PAYMENTS", "MANAGE_CARDS"],
    REGISTRY: ["MANAGE_STUDENTS"],
};

/**
 * Derives an effective capability set for an actor from:
 * 1. Explicit User.Capabilities stored on the account
 * 2. Granular role assignments (for backwards compatibility with seeded roles)
 */
export function resolveActorCapabilities(
    explicitCapabilities: string[] | undefined | null,
    granularRoles: string[] | undefined | null,
    baseRoleName?: string
): Set<Capability> {
    const set = new Set<Capability>();

    if (Array.isArray(explicitCapabilities) && explicitCapabilities.length > 0) {
        for (const cap of explicitCapabilities) {
            if (ALL_CAPABILITIES.includes(cap as Capability)) {
                set.add(cap as Capability);
            }
        }
        return set;
    }

    const roles = new Set(granularRoles || []);

    if (roles.has("SUPER_ADMIN") || roles.has("PRINCIPAL") || baseRoleName === "Admin") {
        // Check if scoped strictly to BURSAR or ADMISSIONS
        if (roles.size === 1 && roles.has("BURSAR")) {
            for (const c of CAPABILITY_PRESETS.FINANCE) set.add(c);
            return set;
        }
        if (roles.size === 1 && roles.has("ADMISSIONS")) {
            for (const c of CAPABILITY_PRESETS.REGISTRY) set.add(c);
            return set;
        }
        // If only SUPER_ADMIN (ICT) without PRINCIPAL, exclude UNLOCK_SHEETS per Section 1 unless explicitly granted
        if (roles.has("SUPER_ADMIN") && !roles.has("PRINCIPAL")) {
            for (const c of ALL_CAPABILITIES) {
                if (c !== "UNLOCK_SHEETS") set.add(c);
            }
            return set;
        }
        for (const c of CAPABILITY_PRESETS.FULL) set.add(c);
    }

    if (roles.has("BURSAR")) {
        for (const c of CAPABILITY_PRESETS.FINANCE) set.add(c);
    }
    if (roles.has("ADMISSIONS")) {
        for (const c of CAPABILITY_PRESETS.REGISTRY) set.add(c);
    }

    return set;
}

export function isFullCapabilitySet(caps: Iterable<Capability | string>): boolean {
    const set = new Set(caps);
    return ALL_CAPABILITIES.every((c) => set.has(c));
}

/**
 * Enforces Section B.2 Separation of Duties:
 * The user who submitted a payment, waiver, or unlock/correction request cannot approve it.
 */
export function assertSeparationOfDuties(
    actorUserId: number,
    submittedByUserId: number | null | undefined,
    actionLabel: string
) {
    if (submittedByUserId != null && actorUserId === submittedByUserId) {
        throw new Error(
            `SEPARATION_OF_DUTIES_VIOLATION: You cannot approve or decide a ${actionLabel} that you submitted yourself.`
        );
    }
}
