// ---------------------------------------------------------------------------
// cron.ts — the scheduling/firing engine.
//
// Pure, deterministic, self-contained functions used by the route layer to
// reason about recurring schedules. Three "kinds" of schedule expression are
// supported:
//
//   - 'cron'   : a standard 5/6-field crontab expression, evaluated in a named
//                IANA timezone via cron-parser v5.
//   - 'rate'   : a human "every N minutes|hours|days" expression, evaluated
//                arithmetically from the anchor instant.
//   - 'oneoff' : a single ISO instant (fires exactly once if it is in future).
//
// All instant outputs are ISO-8601 UTC strings (Z-suffixed). No external
// services, no I/O — every function is referentially transparent given its
// arguments.
// ---------------------------------------------------------------------------

import { CronExpressionParser } from 'cron-parser'

export type ScheduleKind = 'cron' | 'rate' | 'oneoff'

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface JobInput {
  id: string
  kind: ScheduleKind
  expr: string
  timezone?: string
  resourceId?: string | null
}

export interface Collision {
  windowStart: string
  windowEnd: string
  jobIds: string[]
  severity: 'low' | 'medium' | 'high'
  resourceId?: string | null
}

export interface HeatmapBucket {
  bucket: string
  count: number
}

export type DstTrapType = 'double_fire' | 'skip' | 'ambiguous'

export interface DstTrap {
  type: DstTrapType
  atLocal: string
  atUtc: string
}

export interface CoverageWindow {
  start: string
  end: string
  resourceId?: string | null
}

export interface CoverageGap {
  gapStart: string
  gapEnd: string
  gapMinutes: number
  resourceId?: string | null
}

export interface SpreadSuggestion {
  jobId: string
  suggestedExpr: string
  reason: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function toUtcISO(d: Date): string {
  // Normalize to whole-second ISO with Z suffix.
  return new Date(Math.round(d.getTime() / 1000) * 1000).toISOString()
}

function isValidTimezone(tz: string): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Parse a "rate" expression: "every N minutes|hours|days" (singular forms and
// a bare unit meaning N=1 are accepted). Returns the interval in milliseconds.
function parseRate(expr: string): { intervalMs: number } | { error: string } {
  const m = expr
    .trim()
    .toLowerCase()
    .match(/^every\s+(\d+)?\s*(minute|minutes|min|hour|hours|hr|day|days)$/)
  if (!m) {
    return {
      error: 'rate must look like "every N minutes|hours|days"',
    }
  }
  const n = m[1] ? parseInt(m[1], 10) : 1
  if (!Number.isFinite(n) || n <= 0) return { error: 'rate interval must be a positive integer' }
  const unit = m[2]
  let intervalMs: number
  if (unit.startsWith('min')) intervalMs = n * MINUTE_MS
  else if (unit.startsWith('h')) intervalMs = n * HOUR_MS
  else intervalMs = n * DAY_MS
  return { intervalMs }
}

// Offset (minutes) of a UTC instant in a named timezone. Positive east of UTC.
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10)
  }
  // Treat the rendered local wall-clock as if it were UTC, then diff.
  const asUtc = Date.UTC(
    map.year,
    (map.month ?? 1) - 1,
    map.day ?? 1,
    map.hour === 24 ? 0 : map.hour ?? 0,
    map.minute ?? 0,
    map.second ?? 0,
  )
  return Math.round((asUtc - date.getTime()) / MINUTE_MS)
}

// Render a UTC instant as a local wall-clock ISO-like string in a timezone.
function toLocalISO(date: Date, timeZone: string): string {
  const off = tzOffsetMinutes(date, timeZone)
  const shifted = new Date(date.getTime() + off * MINUTE_MS)
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return shifted.toISOString().replace('Z', `${sign}${hh}:${mm}`)
}

// ---------------------------------------------------------------------------
// validateExpression
// ---------------------------------------------------------------------------

export function validateExpression(kind: ScheduleKind, expr: string): ValidationResult {
  const e = (expr ?? '').trim()
  if (!e) return { valid: false, error: 'expression is empty' }

  if (kind === 'cron') {
    try {
      CronExpressionParser.parse(e)
      return { valid: true }
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  if (kind === 'rate') {
    const r = parseRate(e)
    return 'error' in r ? { valid: false, error: r.error } : { valid: true }
  }

  if (kind === 'oneoff') {
    const t = Date.parse(e)
    if (Number.isNaN(t)) return { valid: false, error: 'oneoff must be a parseable ISO timestamp' }
    return { valid: true }
  }

  return { valid: false, error: `unknown kind "${kind}"` }
}

// ---------------------------------------------------------------------------
// describeExpression
// ---------------------------------------------------------------------------

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function describeExpression(kind: ScheduleKind, expr: string, timezone = 'UTC'): string {
  const v = validateExpression(kind, expr)
  if (!v.valid) return `Invalid ${kind} expression: ${v.error}`

  if (kind === 'oneoff') {
    return `Once at ${toUtcISO(new Date(Date.parse(expr)))} (${timezone})`
  }

  if (kind === 'rate') {
    const r = parseRate(expr) as { intervalMs: number }
    const mins = r.intervalMs / MINUTE_MS
    if (mins % (24 * 60) === 0) return `Every ${mins / (24 * 60)} day(s)`
    if (mins % 60 === 0) return `Every ${mins / 60} hour(s)`
    return `Every ${mins} minute(s)`
  }

  // cron — build a human gloss from the field structure.
  const fields = expr.trim().split(/\s+/)
  const hasSeconds = fields.length === 6
  const [min, hour, dom, mon, dow] = hasSeconds ? fields.slice(1) : fields
  const parts: string[] = []
  if (min === '*' && hour === '*') {
    parts.push('every minute')
  } else if (hour !== '*' && min !== '*' && !min.includes('*') && !hour.includes('*')) {
    parts.push(`at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`)
  } else {
    if (min !== '*') parts.push(`minute ${min}`)
    if (hour !== '*') parts.push(`hour ${hour}`)
  }
  if (dom !== '*') parts.push(`on day-of-month ${dom}`)
  if (mon !== '*') parts.push(`in month ${mon}`)
  if (dow !== '*') {
    const named = /^\d$/.test(dow) ? DOW[parseInt(dow, 10) % 7] : dow
    parts.push(`on ${named}`)
  }
  return `${parts.join(', ') || 'every minute'} (${timezone})`
}

// ---------------------------------------------------------------------------
// nextFirings
// ---------------------------------------------------------------------------

export function nextFirings(
  kind: ScheduleKind,
  expr: string,
  timezone = 'UTC',
  fromISO?: string,
  count = 5,
): string[] {
  const v = validateExpression(kind, expr)
  if (!v.valid) return []
  const n = Math.max(0, Math.min(count, 1000))
  if (n === 0) return []

  const from = fromISO ? new Date(Date.parse(fromISO)) : new Date()
  if (Number.isNaN(from.getTime())) return []

  if (kind === 'oneoff') {
    const t = Date.parse(expr)
    if (Number.isNaN(t)) return []
    return t > from.getTime() ? [toUtcISO(new Date(t))] : []
  }

  if (kind === 'rate') {
    const r = parseRate(expr)
    if ('error' in r) return []
    const out: string[] = []
    let next = from.getTime() + r.intervalMs
    for (let i = 0; i < n; i++) {
      out.push(toUtcISO(new Date(next)))
      next += r.intervalMs
    }
    return out
  }

  // cron
  try {
    const tz = isValidTimezone(timezone) ? timezone : 'UTC'
    const it = CronExpressionParser.parse(expr, { tz, currentDate: from })
    const out: string[] = []
    for (let i = 0; i < n; i++) {
      out.push(toUtcISO(it.next().toDate()))
    }
    return out
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Shared: expand all firings for a set of jobs across a horizon.
// ---------------------------------------------------------------------------

function firingsForJob(job: JobInput, fromISO: string, horizonMs: number): number[] {
  const from = Date.parse(fromISO)
  const end = from + horizonMs
  const tz = job.timezone && isValidTimezone(job.timezone) ? job.timezone : 'UTC'
  const out: number[] = []

  if (job.kind === 'oneoff') {
    const t = Date.parse(job.expr)
    if (!Number.isNaN(t) && t > from && t <= end) out.push(t)
    return out
  }

  if (job.kind === 'rate') {
    const r = parseRate(job.expr)
    if ('error' in r) return out
    let next = from + r.intervalMs
    let guard = 0
    while (next <= end && guard < 200000) {
      out.push(next)
      next += r.intervalMs
      guard++
    }
    return out
  }

  // cron
  try {
    const it = CronExpressionParser.parse(job.expr, { tz, currentDate: new Date(from) })
    let guard = 0
    while (guard < 200000) {
      const t = it.next().toDate().getTime()
      if (t > end) break
      out.push(t)
      guard++
    }
  } catch {
    /* ignore unparseable */
  }
  return out
}

function floorToMinute(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS
}

// ---------------------------------------------------------------------------
// computeCollisions
// ---------------------------------------------------------------------------

export function computeCollisions(
  jobs: JobInput[],
  opts: { horizonDays?: number; threshold?: number } = {},
): Collision[] {
  const horizonDays = opts.horizonDays ?? 7
  const threshold = Math.max(2, opts.threshold ?? 3)
  const horizonMs = horizonDays * DAY_MS
  const from = new Date().toISOString()

  // bucket minute -> { jobIds:Set, resources: Map<resourceId, Set<jobId>> }
  const buckets = new Map<
    number,
    { jobIds: Set<string>; resources: Map<string, Set<string>> }
  >()

  for (const job of jobs) {
    const fires = firingsForJob(job, from, horizonMs)
    for (const f of fires) {
      const minute = floorToMinute(f)
      let b = buckets.get(minute)
      if (!b) {
        b = { jobIds: new Set(), resources: new Map() }
        buckets.set(minute, b)
      }
      b.jobIds.add(job.id)
      if (job.resourceId) {
        let s = b.resources.get(job.resourceId)
        if (!s) {
          s = new Set()
          b.resources.set(job.resourceId, s)
        }
        s.add(job.id)
      }
    }
  }

  const collisions: Collision[] = []
  for (const [minute, b] of [...buckets.entries()].sort((a, c) => a[0] - c[0])) {
    const concurrency = b.jobIds.size
    let resourceId: string | null = null
    let resourceShare = 0
    for (const [rid, set] of b.resources) {
      if (set.size >= 2 && set.size > resourceShare) {
        resourceShare = set.size
        resourceId = rid
      }
    }
    const flagged = concurrency >= threshold || resourceShare >= 2
    if (!flagged) continue
    const severity: Collision['severity'] =
      concurrency >= threshold * 2 || resourceShare >= 3
        ? 'high'
        : concurrency >= threshold || resourceShare >= 2
          ? 'medium'
          : 'low'
    collisions.push({
      windowStart: toUtcISO(new Date(minute)),
      windowEnd: toUtcISO(new Date(minute + MINUTE_MS)),
      jobIds: [...b.jobIds],
      severity,
      resourceId,
    })
  }
  return collisions
}

// ---------------------------------------------------------------------------
// loadHeatmap
// ---------------------------------------------------------------------------

export function loadHeatmap(
  jobs: JobInput[],
  opts: { horizonDays?: number } = {},
): HeatmapBucket[] {
  const horizonDays = opts.horizonDays ?? 7
  const horizonMs = horizonDays * DAY_MS
  const from = new Date().toISOString()

  // Bucket by hour for a readable heatmap.
  const HOUR = HOUR_MS
  const counts = new Map<number, number>()
  for (const job of jobs) {
    for (const f of firingsForJob(job, from, horizonMs)) {
      const bucket = Math.floor(f / HOUR) * HOUR
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, count]) => ({ bucket: toUtcISO(new Date(bucket)), count }))
}

// ---------------------------------------------------------------------------
// dstTraps
// ---------------------------------------------------------------------------

export function dstTraps(
  kind: ScheduleKind,
  expr: string,
  timezone: string,
  fromISO?: string,
  days = 365,
): DstTrap[] {
  if (!isValidTimezone(timezone) || timezone === 'UTC') return []
  const v = validateExpression(kind, expr)
  if (!v.valid) return []

  const start = fromISO ? Date.parse(fromISO) : Date.now()
  if (Number.isNaN(start)) return []
  const end = start + days * DAY_MS

  const traps: DstTrap[] = []

  // 1. Detect timezone offset transitions by scanning hour-by-hour.
  let prevOffset = tzOffsetMinutes(new Date(start), timezone)
  const transitions: Array<{ at: number; before: number; after: number }> = []
  for (let t = start + HOUR_MS; t <= end; t += HOUR_MS) {
    const off = tzOffsetMinutes(new Date(t), timezone)
    if (off !== prevOffset) {
      transitions.push({ at: t, before: prevOffset, after: off })
      prevOffset = off
    }
  }

  // 2. Get the schedule's firings across the same window and tag any that land
  //    within an hour of a transition. Spring-forward (offset increase) skips a
  //    local hour; fall-back (offset decrease) repeats a local hour.
  const fires =
    kind === 'cron' || kind === 'rate'
      ? firingsForJob({ id: '_', kind, expr, timezone }, new Date(start).toISOString(), end - start)
      : (() => {
          const t = Date.parse(expr)
          return !Number.isNaN(t) && t > start && t <= end ? [t] : []
        })()

  for (const tr of transitions) {
    const shift = Math.abs(tr.after - tr.before) * MINUTE_MS

    if (tr.after > tr.before) {
      // Spring-forward: the local hour [transition .. transition+shift] does not
      // exist. A schedule whose intended wall-clock falls in that hole is rolled
      // forward by cron-parser, so the firing lands just after the transition
      // instant. Flag firings in (tr.at, tr.at + shift] as 'skip'.
      for (const f of fires) {
        if (f > tr.at && f <= tr.at + shift) {
          traps.push({
            type: 'skip',
            atLocal: toLocalISO(new Date(f), timezone),
            atUtc: toUtcISO(new Date(f)),
          })
        }
      }
    } else if (tr.after < tr.before) {
      // Fall-back: the local hour [transition-shift .. transition] (UTC terms:
      // [tr.at .. tr.at+shift]) occurs twice. A daily schedule in that band can
      // fire twice / is ambiguous. Flag firings in [tr.at, tr.at + shift].
      for (const f of fires) {
        if (f >= tr.at && f <= tr.at + shift) {
          traps.push({
            type: 'double_fire',
            atLocal: toLocalISO(new Date(f), timezone),
            atUtc: toUtcISO(new Date(f)),
          })
        } else if (f >= tr.at - shift && f < tr.at) {
          traps.push({
            type: 'ambiguous',
            atLocal: toLocalISO(new Date(f), timezone),
            atUtc: toUtcISO(new Date(f)),
          })
        }
      }
    }
  }

  // De-dup by (type, atUtc).
  const seen = new Set<string>()
  return traps.filter((t) => {
    const k = `${t.type}|${t.atUtc}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ---------------------------------------------------------------------------
// coverageGaps
// ---------------------------------------------------------------------------

export function coverageGaps(
  windows: CoverageWindow[],
  jobs: JobInput[],
  opts: { horizonDays?: number } = {},
): CoverageGap[] {
  const horizonDays = opts.horizonDays ?? 7
  const horizonMs = horizonDays * DAY_MS
  const now = Date.now()
  const fromISO = new Date(now).toISOString()

  // Group required coverage windows by resource and merge overlaps.
  const byResource = new Map<string, Array<[number, number]>>()
  for (const w of windows) {
    const s = Date.parse(w.start)
    const e = Date.parse(w.end)
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) continue
    const rid = w.resourceId ?? '__global__'
    const arr = byResource.get(rid) ?? []
    arr.push([Math.max(s, now), Math.min(e, now + horizonMs)])
    byResource.set(rid, arr)
  }

  // Firings grouped by resource (a firing "covers" the minute it occurs).
  const firesByResource = new Map<string, number[]>()
  for (const job of jobs) {
    const rid = job.resourceId ?? '__global__'
    const arr = firesByResource.get(rid) ?? []
    for (const f of firingsForJob(job, fromISO, horizonMs)) arr.push(f)
    firesByResource.set(rid, arr)
  }

  const gaps: CoverageGap[] = []
  for (const [rid, ranges] of byResource) {
    const fires = (firesByResource.get(rid) ?? []).sort((a, b) => a - b)
    // For each required window, find spans longer than the expected cadence
    // that have no firing — i.e. uncovered stretches.
    for (const [start, end] of ranges) {
      if (end <= start) continue
      const inWindow = fires.filter((f) => f >= start && f <= end)
      let cursor = start
      const points = [...inWindow, end]
      for (const p of points) {
        const gapMinutes = Math.round((p - cursor) / MINUTE_MS)
        // Flag a gap if more than 60 minutes elapse with no firing.
        if (gapMinutes > 60) {
          gaps.push({
            gapStart: toUtcISO(new Date(cursor)),
            gapEnd: toUtcISO(new Date(p)),
            gapMinutes,
            resourceId: rid === '__global__' ? null : rid,
          })
        }
        cursor = p
      }
    }
  }
  return gaps
}

// ---------------------------------------------------------------------------
// autoSpread
// ---------------------------------------------------------------------------

export function autoSpread(
  jobs: JobInput[],
  opts: { threshold?: number; horizonDays?: number } = {},
): SpreadSuggestion[] {
  const threshold = Math.max(2, opts.threshold ?? 3)
  const collisions = computeCollisions(jobs, {
    horizonDays: opts.horizonDays ?? 7,
    threshold,
  })
  if (collisions.length === 0) return []

  // Rank jobs by how many collisions they participate in; the busiest jobs get
  // shifted off the shared minute. Suggest a deterministic minute offset.
  const participation = new Map<string, number>()
  for (const col of collisions) {
    for (const jid of col.jobIds) {
      participation.set(jid, (participation.get(jid) ?? 0) + 1)
    }
  }

  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const ranked = [...participation.entries()].sort((a, b) => b[1] - a[1])

  const suggestions: SpreadSuggestion[] = []
  let offset = 1
  for (const [jid, hits] of ranked) {
    const job = jobById.get(jid)
    if (!job) continue
    let suggestedExpr = job.expr
    if (job.kind === 'cron') {
      const fields = job.expr.trim().split(/\s+/)
      const hasSeconds = fields.length === 6
      const minIdx = hasSeconds ? 1 : 0
      const minField = fields[minIdx]
      if (/^\d+$/.test(minField)) {
        const shifted = (parseInt(minField, 10) + offset) % 60
        fields[minIdx] = String(shifted)
        suggestedExpr = fields.join(' ')
      } else if (minField === '*') {
        fields[minIdx] = String(offset % 60)
        suggestedExpr = fields.join(' ')
      }
    } else if (job.kind === 'rate') {
      // Nudge the cadence so phases diverge.
      suggestedExpr = `${job.expr} (offset ${offset}m)`
    }
    suggestions.push({
      jobId: jid,
      suggestedExpr,
      reason: `Participates in ${hits} collision window(s); shift by ${offset} minute(s) to de-conflict.`,
    })
    offset = (offset % 5) + 1
  }
  return suggestions
}
