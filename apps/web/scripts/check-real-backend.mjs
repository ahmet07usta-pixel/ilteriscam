const backendHealthUrl = process.env.BACKEND_HEALTH_URL ?? 'http://127.0.0.1:4100/api/v1/health'

try {
  const response = await fetch(backendHealthUrl, { signal: AbortSignal.timeout(3000) })
  if (!response.ok) {
    throw new Error(`status ${response.status}`)
  }
} catch (error) {
  console.error(
    `\nGercek backend'e ulasilamadi: ${backendHealthUrl}\n` +
      `Once "apps/platform-core-api" dizininde "npm run start:dev" ile backend'i baslatin, sonra bu komutu tekrar calistirin.\n` +
      `Detay: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exit(1)
}
