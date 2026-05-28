export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootstrap, bootstrapDB, bootstrapMultica } = await import('./server/bootstrap.js')
    const { startCron } = await import('./server/cron.js')
    bootstrap()
    await bootstrapDB()
    await bootstrapMultica()
    startCron()
  }
}
