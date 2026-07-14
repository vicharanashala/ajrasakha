import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
})

export const getStatus = () => api.get('/')
export const submitFeedback = (data: any) => api.post('/feedback', data)
export const getAllFeedback = () => api.get('/feedback/all')
export const getFeedbackCount = () => api.get('/feedback/count')
export const getDashboard = () => api.get('/feedback/dashboard')
export const getFlagged = (threshold = 60, minResponses = 3) =>
  api.get(`/feedback/flagged?threshold=${threshold}&min_responses=${minResponses}`)
export const getDigest = (topN = 20, minResponses = 3) =>
  api.get(`/feedback/digest?top_n=${topN}&min_responses=${minResponses}`)

export default api
