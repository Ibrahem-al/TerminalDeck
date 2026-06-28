/**
 * Routes input to terminal panes by pane id. If a pane's shell isn't ready
 * yet (still spawning), input queues and flushes the moment it registers —
 * auto-start commands never race the spawn.
 */

type Writer = (data: string) => void

const writers = new Map<string, Writer>()
const queues = new Map<string, string[]>()

export function registerPaneWriter(paneId: string, writer: Writer): void {
  writers.set(paneId, writer)
  const queued = queues.get(paneId)
  if (queued) {
    queues.delete(paneId)
    for (const data of queued) writer(data)
  }
}

export function unregisterPaneWriter(paneId: string): void {
  writers.delete(paneId)
  queues.delete(paneId)
}

export function sendToPane(paneId: string, data: string): void {
  const writer = writers.get(paneId)
  if (writer) {
    writer(data)
    return
  }
  const queue = queues.get(paneId)
  if (queue) queue.push(data)
  else queues.set(paneId, [data])
}
