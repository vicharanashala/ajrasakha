import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export const dashboardAPI = {
  getOverview: () => api.get('/dashboard/overview'),
  getEntries: (params) => api.get('/dashboard/entries', { params }),
  getDomainBreakdown: () => api.get('/dashboard/breakdown/domain'),
  getLanguageBreakdown: () => api.get('/dashboard/breakdown/language'),
  getStateBreakdown: () => api.get('/dashboard/breakdown/state'),
  chatQuery: (query, language = 'English') => api.post('/chat-query', { query, language }),
  submitFeedback: (data) => api.post('/submit-feedback', data),
  getPendingEntries: () => api.get('/admin/pending-entries'),
  approveEntry: (id, data) => api.post(`/admin/entries/${id}/approve`, data),
  rejectEntry: (id, data) => api.post(`/admin/entries/${id}/reject`, data),
  getAdminStats: () => api.get('/admin/stats'),
  // GDB entry details with question and answer
  getGDBEntry: (id) => api.get(`/gdb-entry/${id}`),
  getGDBEntryPreview: (id) => api.get(`/gdb-entry/${id}/preview`),
  // Gap detection endpoints
  getLatestGapReport: () => api.get('/gaps/gap-report/latest'),
  getAllGapReports: () => api.get('/gaps/gap-report/all'),
  generateGapReport: (params) => api.post('/gaps/gap-report/generate', null, { params }),
  getCoverageHeatmap: () => api.get('/gaps/coverage/heatmap'),
  getRecentDisclaimers: (params) => api.get('/gaps/disclaimers/recent', { params }),
  getDisclaimerStats: () => api.get('/gaps/disclaimers/stats'),
  logDisclaimer: (data) => api.post('/gaps/disclaimers/log', data),
};

export const feedbackAPI = {
  getEntryFeedback: (gdbEntryId) => api.get(`/feedback/${gdbEntryId}`),
  getEntryStats: (gdbEntryId) => api.get(`/feedback/${gdbEntryId}/stats`),
};

export const flaggedAPI = {
  getFlaggedEntries: (params) => api.get('/flagged/', { params }),
  getFlaggedEntry: (gdbEntryId) => api.get(`/flagged/${gdbEntryId}`),
  updateStatus: (gdbEntryId, data) => api.patch(`/flagged/${gdbEntryId}/status`, data),
  removeEntry: (gdbEntryId) => api.delete(`/flagged/${gdbEntryId}`),
  getSummary: () => api.get('/flagged/count/summary'),
};

export const digestAPI = {
  getLatest: () => api.get('/weekly-digest/latest'),
  getDigests: (params) => api.get('/weekly-digest/', { params }),
  getByWeek: (weekStart, weekEnd) => api.get('/weekly-digest/by-week', {
    params: { week_start: weekStart, week_end: weekEnd }
  }),
};

export default api;