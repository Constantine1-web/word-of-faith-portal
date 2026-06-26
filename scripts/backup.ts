import fs from "fs";
import path from "path";

export function performBackup() {
  console.log(`[BACKUP] Starting automated database backup at ${new Date().toISOString()}`);
  
  const rootDir = process.cwd();
  const dbPath = path.join(rootDir, "prisma", "dev.db");
  const backupDir = path.join(rootDir, "backups");

  if (!fs.existsSync(dbPath)) {
    console.error("[BACKUP] Database file not found at", dbPath);
    return;
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `dev_backup_${timestamp}.db`);

  try {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`[BACKUP] Successfully backed up database to ${backupPath}`);
  } catch (error) {
    console.error("[BACKUP] Failed to copy database file:", error);
  }
}

// Support running manually
if (require.main === module) {
  performBackup();
}
