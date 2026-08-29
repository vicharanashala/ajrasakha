import axios from 'axios'

const BASE = '/api'

export const api = axios.create({ baseURL: BASE, timeout: 30000 })

// Analytics
export const getOverview = () => api.get('/analytics/overview').then(r => r.data)
export const getGDBEntries = (params?: Record<string, unknown>) =>
  api.get('/analytics/gdb-entries', { params }).then(r => r.data)
export const getDomainBreakdown = () => api.get('/analytics/domain').then(r => r.data)
export const getLanguageBreakdown = () => api.get('/analytics/language').then(r => r.data)
export const getStateBreakdown = () => api.get('/analytics/state').then(r => r.data)
export const getTrends = (days = 30) => api.get('/analytics/trends', { params: { days } }).then(r => r.data)
export const getTopBottom = (n = 5) => api.get('/analytics/top-bottom', { params: { n } }).then(r => r.data)
export const getFilterOptions = () => api.get('/analytics/filters').then(r => r.data)

// Feedback
export const submitFeedback = (data: { gdb_entry_id: string; farmer_id: string; response: string }) =>
  api.post('/feedback/submit', data).then(r => r.data)
export const listFeedback = (params?: Record<string, unknown>) =>
  api.get('/feedback/', { params }).then(r => r.data)

// Flagging
export const getFlaggedEntries = (params?: Record<string, unknown>) =>
  api.get('/flagging/flagged', { params }).then(r => r.data)
export const runFlaggingPipeline = () => api.post('/flagging/run').then(r => r.data)
export const updateFlagStatus = (gdb_entry_id: string, new_status: string, review_notes?: string) =>
  api.patch(`/flagging/${gdb_entry_id}/status`, { new_status, review_notes }).then(r => r.data)
export const getFlaggingSettings = () =>
  api.get('/flagging/settings', { timeout: 3000 })
    .then(r => r.data)
    .catch(() => ({ feedback_threshold: 60, min_responses_to_flag: 10 }))
export const updateFlaggingSettings = (data: { feedback_threshold?: number; min_responses_to_flag?: number }) =>
  api.patch('/flagging/settings', data).then(r => r.data)
export const editGDBEntry = (
  gdb_entry_id: string,
  data: { question?: string; answer?: string; review_notes?: string }
) => api.patch(`/flagging/${gdb_entry_id}/edit-entry`, data).then(r => r.data)

// Digest
export const getLatestDigest = () => api.get('/digest/latest').then(r => r.data)
export const getDigestHistory = () => api.get('/digest/history').then(r => r.data)
export const generateDigest = () => api.post('/digest/generate').then(r => r.data)

// WhatsApp Simulator
export const simulateWhatsApp = (farmer_phone: string, message: string) =>
  api.post('/webhook/simulate', { farmer_phone, message }).then(r => r.data)
