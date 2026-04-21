import { useAuthStore } from '@renderer/store/auth-store'
import axios, { AxiosError } from 'axios'

const AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_KEY
})

AxiosInstance.interceptors.request.use((config) => {
  const accessToken = useAuthStore.getState().accessToken

  if (accessToken) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  return config
})

AxiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    return Promise.reject(error)
  }
)

export default AxiosInstance
