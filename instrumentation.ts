export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateHomeFinderStartup } = await import("./src/lib/startup");
    validateHomeFinderStartup();
  }
}
