import { performBackup } from "../src/scripts/backup";

export { performBackup };

async function runCli() {
  const res = await performBackup();
  if (!res.success) {
    process.exitCode = 1;
  }
}

if (typeof require !== "undefined" && require.main === module) {
  runCli();
}
