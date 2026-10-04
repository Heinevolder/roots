// Runs once when the server starts: say where data lives, and fail loudly if it can't be written.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const fs = await import("node:fs");
  const { DATA_DIR } = await import("./lib/paths");
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    console.log(`Roots: data i ${DATA_DIR}`);
  } catch {
    console.error(
      `Roots: kan ikke skrive til datamappen ${DATA_DIR}. ` +
        `I Docker/Coolify skal DATA_DIR være /data (eller fjernes), og /data skal være et volume.`,
    );
  }
}
