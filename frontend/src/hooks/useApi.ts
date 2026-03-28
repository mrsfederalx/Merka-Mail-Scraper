import { useState, useCallback } from 'react'
import { AxiosRequestConfig } from 'axios'
import api from '../api/client'
import type { ApiResponse } from '../types/api'

export function useApi() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const request = useCallback(async <T = unknown>(
    method: string,
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.request<ApiResponse<T>>({
        method,
        url,
        data,
        ...config,
      })
      return res.data
    } catch (err: unknown) {
      const message = (err as any)?.response?.data?.detail || (err as any)?.message || 'An error occurred'
      setError(message)
      return { success: false, error: message }
    } finally {
      setLoading(false)
    }
  }, [])

  const get = useCallback(<T = unknown>(url: string, config?: AxiosRequestConfig) =>
    request<T>('GET', url, undefined, config), [request])

  const post = useCallback(<T = unknown>(url: string, data?: unknown) =>
    request<T>('POST', url, data), [request])

  const put = useCallback(<T = unknown>(url: string, data?: unknown) =>
    request<T>('PUT', url, data), [request])

  const del = useCallback(<T = unknown>(url: string) =>
    request<T>('DELETE', url), [request])

  return { get, post, put, del, loading, error }
}
