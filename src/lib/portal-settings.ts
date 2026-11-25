import prisma from "@/lib/db";

export interface PortalBankConfig {
  bankName: string;
  accountName: string;
  accountNumber: string;
  portalFeeBeneficiary: string;
  tradingAsName: string;
  paystackSubaccountCode: string;
  supportEmail: string;
  portalBaseUrl: string;
}

const DEFAULT_PORTAL_BANK_CONFIG: PortalBankConfig = {
  bankName: process.env.SCHOOL_BANK_NAME?.trim() || "Zenith Bank PLC",
  accountName: process.env.SCHOOL_ACCOUNT_NAME?.trim() || "Word of Faith Schools",
  accountNumber: process.env.SCHOOL_ACCOUNT_NUMBER?.trim() || "1015694201",
  portalFeeBeneficiary: "Edidiong Owoidoho Akpan",
  tradingAsName: "Eulogic Studios",
  paystackSubaccountCode: process.env.PAYSTACK_PROVIDER_SUBACCOUNT_CODE?.trim() || "",
  supportEmail: process.env.SUPPORT_EMAIL?.trim() || "contact@wofs.sch.ng",
  portalBaseUrl: (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://wofs.vercel.app").replace(/\/$/, ""),
};

const BANK_CONFIG_KEY = "BANK_PAYMENT_CONFIG";

export async function getPortalBankConfig(): Promise<PortalBankConfig> {
  try {
    const row = await prisma.portalSetting.findUnique({
      where: { key: BANK_CONFIG_KEY },
    });
    if (row && row.valueJson && typeof row.valueJson === "object") {
      const val = row.valueJson as Partial<PortalBankConfig>;
      return {
        bankName: val.bankName?.trim() || DEFAULT_PORTAL_BANK_CONFIG.bankName,
        accountName: val.accountName?.trim() || DEFAULT_PORTAL_BANK_CONFIG.accountName,
        accountNumber: val.accountNumber?.trim() || DEFAULT_PORTAL_BANK_CONFIG.accountNumber,
        portalFeeBeneficiary: val.portalFeeBeneficiary?.trim() || DEFAULT_PORTAL_BANK_CONFIG.portalFeeBeneficiary,
        tradingAsName: val.tradingAsName?.trim() || DEFAULT_PORTAL_BANK_CONFIG.tradingAsName,
        paystackSubaccountCode: val.paystackSubaccountCode?.trim() ?? DEFAULT_PORTAL_BANK_CONFIG.paystackSubaccountCode,
        supportEmail: val.supportEmail?.trim() || DEFAULT_PORTAL_BANK_CONFIG.supportEmail,
        portalBaseUrl: (val.portalBaseUrl?.trim() || DEFAULT_PORTAL_BANK_CONFIG.portalBaseUrl).replace(/\/$/, ""),
      };
    }
  } catch {
    // Graceful fallback before initial schema sync or offline tests
  }
  return { ...DEFAULT_PORTAL_BANK_CONFIG };
}

export async function savePortalBankConfig(
  input: Partial<PortalBankConfig>,
  updatedById: number
): Promise<PortalBankConfig> {
  const current = await getPortalBankConfig();
  const next: PortalBankConfig = {
    bankName: (input.bankName ?? current.bankName).trim().slice(0, 120),
    accountName: (input.accountName ?? current.accountName).trim().slice(0, 160),
    accountNumber: (input.accountNumber ?? current.accountNumber).trim().slice(0, 40),
    portalFeeBeneficiary: (input.portalFeeBeneficiary ?? current.portalFeeBeneficiary).trim().slice(0, 160),
    tradingAsName: (input.tradingAsName ?? current.tradingAsName).trim().slice(0, 120),
    paystackSubaccountCode: (input.paystackSubaccountCode ?? current.paystackSubaccountCode).trim().slice(0, 80),
    supportEmail: (input.supportEmail ?? current.supportEmail).trim().slice(0, 160),
    portalBaseUrl: (input.portalBaseUrl ?? current.portalBaseUrl).trim().replace(/\/$/, "").slice(0, 200),
  };

  await prisma.portalSetting.upsert({
    where: { key: BANK_CONFIG_KEY },
    create: {
      key: BANK_CONFIG_KEY,
      valueJson: next as unknown as Record<string, string>,
      updatedById,
    },
    update: {
      valueJson: next as unknown as Record<string, string>,
      updatedById,
    },
  });

  return next;
}
