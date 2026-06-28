import { networkInterfaces } from 'os'

/** Reachable HTTP base URLs for the Agent: loopback + private LAN IPv4s. */
export function lanUrls(port: number): string[] {
  const urls = [`http://localhost:${port}`, `http://127.0.0.1:${port}`]
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) urls.push(`http://${ni.address}:${port}`)
    }
  }
  return urls
}

/** The best LAN URL to hand a phone (a real IP over loopback), or null. */
export function bestLanUrl(port: number): string | null {
  const urls = lanUrls(port)
  return urls.find((u) => !u.includes('localhost') && !u.includes('127.0.0.1')) ?? urls[0] ?? null
}
