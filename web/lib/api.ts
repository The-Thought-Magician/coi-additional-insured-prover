// Same-origin relative calls to /api/proxy/<path>, mapping 1:1 to backend /api/v1/<path>.
// The proxy route resolves the session server-side and injects X-User-Id.

type Query = Record<string, string | number | boolean | undefined | null>

function qs(params?: Query): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function req<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, init)
  let data: any = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new Error(message)
  }
  return data as T
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const get = <T = any>(path: string) => req<T>(path)
const post = <T = any>(path: string, body?: unknown) => req<T>(path, json('POST', body))
const put = <T = any>(path: string, body?: unknown) => req<T>(path, json('PUT', body))
const del = <T = any>(path: string) => req<T>(path, json('DELETE'))

const api = {
  // Workspaces
  getWorkspaces: () => get('workspaces'),
  getCurrentWorkspace: () => get('workspaces/current'),
  createWorkspace: (body: any) => post('workspaces', body),
  getWorkspace: (id: string) => get(`workspaces/${id}`),
  updateWorkspace: (id: string, body: any) => put(`workspaces/${id}`, body),
  joinWorkspace: (invite_code: string) => post('workspaces/join', { invite_code }),
  getWorkspaceMembers: (id: string) => get(`workspaces/${id}/members`),

  // Vendors
  getVendors: (params?: Query) => get(`vendors${qs(params)}`),
  getVendor: (id: string) => get(`vendors/${id}`),
  createVendor: (body: any) => post('vendors', body),
  updateVendor: (id: string, body: any) => put(`vendors/${id}`, body),
  deleteVendor: (id: string) => del(`vendors/${id}`),
  getVendorScorecard: (id: string) => get(`vendors/${id}/scorecard`),
  getVendorAssignments: (id: string) => get(`vendors/${id}/assignments`),

  // Projects
  getProjects: () => get('projects'),
  getProject: (id: string) => get(`projects/${id}`),
  createProject: (body: any) => post('projects', body),
  updateProject: (id: string, body: any) => put(`projects/${id}`, body),
  deleteProject: (id: string) => del(`projects/${id}`),
  getProjectRollup: (id: string) => get(`projects/${id}/rollup`),
  getProjectVendors: (id: string) => get(`projects/${id}/vendors`),
  assignVendor: (id: string, body: any) => post(`projects/${id}/assign`, body),
  unassignVendor: (assignmentId: string) => del(`projects/assignments/${assignmentId}`),

  // Templates
  getTemplates: () => get('templates'),
  getTemplate: (id: string) => get(`templates/${id}`),
  createTemplate: (body: any) => post('templates', body),
  updateTemplate: (id: string, body: any) => put(`templates/${id}`, body),
  deleteTemplate: (id: string) => del(`templates/${id}`),
  setTemplateLines: (id: string, lines: any) => put(`templates/${id}/lines`, { lines }),

  // Certificates
  getCertificates: (params?: Query) => get(`certificates${qs(params)}`),
  getCertificate: (id: string) => get(`certificates/${id}`),
  createCertificate: (body: any) => post('certificates', body),
  updateCertificate: (id: string, body: any) => put(`certificates/${id}`, body),
  deleteCertificate: (id: string) => del(`certificates/${id}`),
  parseCertificate: (id: string, raw: any) => post(`certificates/${id}/parse`, { raw }),
  regradeCertificate: (id: string) => post(`certificates/${id}/regrade`),

  // Coverage lines
  getCoverageLines: (certificateId: string) => get(`coverage-lines/certificate/${certificateId}`),
  createCoverageLine: (body: any) => post('coverage-lines', body),
  updateCoverageLine: (id: string, body: any) => put(`coverage-lines/${id}`, body),
  deleteCoverageLine: (id: string) => del(`coverage-lines/${id}`),

  // Endorsements
  getEndorsements: (certificateId: string) => get(`endorsements/certificate/${certificateId}`),
  createEndorsement: (body: any) => post('endorsements', body),
  updateEndorsement: (id: string, body: any) => put(`endorsements/${id}`, body),
  deleteEndorsement: (id: string) => del(`endorsements/${id}`),

  // Gradings
  getGradings: (certificateId: string) => get(`gradings/certificate/${certificateId}`),
  getGrading: (id: string) => get(`gradings/${id}`),

  // Deficiencies
  getDeficiencies: (params?: Query) => get(`deficiencies${qs(params)}`),
  getDeficiency: (id: string) => get(`deficiencies/${id}`),
  updateDeficiency: (id: string, body: any) => put(`deficiencies/${id}`, body),
  resolveDeficiency: (id: string) => post(`deficiencies/${id}/resolve`),

  // Reason codes
  getReasonCodes: () => get('reason-codes'),
  getReasonCode: (id: string) => get(`reason-codes/${id}`),

  // Coverage gaps
  getCoverageGaps: (params?: Query) => get(`coverage-gaps${qs(params)}`),
  recomputeCoverageGaps: (body?: any) => post('coverage-gaps/recompute', body ?? {}),
  getAssignmentGaps: (assignmentId: string) => get(`coverage-gaps/assignment/${assignmentId}`),

  // Evidence packs
  getEvidencePacks: () => get('evidence-packs'),
  getEvidencePack: (id: string) => get(`evidence-packs/${id}`),
  createEvidencePack: (body: any) => post('evidence-packs', body),

  // Carriers
  getCarriers: () => get('carriers'),
  createCarrier: (body: any) => post('carriers', body),
  updateCarrier: (id: string, body: any) => put(`carriers/${id}`, body),
  deleteCarrier: (id: string) => del(`carriers/${id}`),

  // Waivers
  getWaivers: () => get('waivers'),
  createWaiver: (body: any) => post('waivers', body),
  deleteWaiver: (id: string) => del(`waivers/${id}`),

  // Renewals
  getRenewalRadar: () => get('renewals/radar'),
  getReminders: () => get('renewals/reminders'),
  createReminder: (body: any) => post('renewals/reminders', body),
  requestRenewal: (id: string) => post(`renewals/reminders/${id}/request`),

  // Notifications
  getNotifications: () => get('notifications'),
  markNotificationRead: (id: string) => post(`notifications/${id}/read`),
  markAllNotificationsRead: () => post('notifications/read-all'),

  // Tasks
  getTasks: (params?: Query) => get(`tasks${qs(params)}`),
  getTask: (id: string) => get(`tasks/${id}`),
  createTask: (body: any) => post('tasks', body),
  updateTask: (id: string, body: any) => put(`tasks/${id}`, body),
  deleteTask: (id: string) => del(`tasks/${id}`),

  // Reports
  getReportsOverview: () => get('reports/overview'),
  getReportsByProject: () => get('reports/by-project'),
  getReportsByReason: () => get('reports/by-reason'),

  // Activity
  getActivity: (params?: Query) => get(`activity${qs(params)}`),

  // Attachments
  getAttachments: (certificateId: string) => get(`attachments/certificate/${certificateId}`),
  createAttachment: (body: any) => post('attachments', body),
  deleteAttachment: (id: string) => del(`attachments/${id}`),

  // Saved views
  getSavedViews: (entity?: string) => get(`saved-views${qs({ entity })}`),
  createSavedView: (body: any) => post('saved-views', body),
  deleteSavedView: (id: string) => del(`saved-views/${id}`),

  // Seed
  seedSample: () => post('seed/sample'),
  getSeedStatus: () => get('seed/status'),

  // Billing
  getBillingPlan: () => get('billing/plan'),
  startCheckout: () => post('billing/checkout'),
  openPortal: () => post('billing/portal'),
}

export default api
