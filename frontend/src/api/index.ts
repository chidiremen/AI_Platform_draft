/**
 * Django + DRF バックエンドの API クライアント。
 * `VITE_USE_MOCK=false` のときに store から利用される。
 * バックエンドの snake_case レスポンスをフロントの型へマッピングする。
 */
import { API_BASE, TOKEN_KEY } from '../config'
import type { Tool, ToolType } from '../types'
import type { Role, User } from '../data/users'
import type { AccessRequestRecord, NewToolInput } from '../store'

// ── トークン管理 ──
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* ignore */
  }
}
function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Token ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const detail =
      (data && (data.detail || data.non_field_errors?.[0])) || `APIエラー (${res.status})`
    throw new ApiError(res.status, detail)
  }
  return data as T
}

// ── DTO 型（必要分のみ） ──
interface UserDTO {
  id: number
  username: string
  display_name: string
  role: Role
  email: string
}
interface AspiceDTO {
  id: string
}
interface ToolDTO {
  id: string
  title: string
  summary: string
  readme: string
  tool_type: ToolType
  access_url: string | null
  tags: string
  work_categories: string[]
  effect_qualitative: string
  effect_hours_per_month: string | number | null
  author: UserDTO
  forked_from: string | null
  aspice_processes: AspiceDTO[]
  like_count: number
  request_count: number
  liked_by_me: boolean
  created_at: string
  updated_at: string
}
interface AccessRequestDTO {
  id: string
  requester: UserDTO
  tool: string
  tool_title: string
  reason: string
  status: 'pending' | 'granted' | 'rejected'
  created_at: string
}
interface Paginated<T> {
  count: number
  results: T[]
}

// ── マッパー ──
export function mapUser(d: UserDTO): User {
  return {
    id: d.id,
    loginId: d.username,
    name: d.display_name || d.username,
    role: d.role,
    email: d.email || undefined,
  }
}

export function mapTool(d: ToolDTO): Tool {
  return {
    id: d.id,
    title: d.title,
    summary: d.summary,
    readme: d.readme,
    toolType: d.tool_type,
    aspiceProcesses: d.aspice_processes.map((p) => p.id),
    workCategories: d.work_categories ?? [],
    tags: d.tags ? d.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    accessUrl: d.access_url ?? undefined,
    author: d.author?.display_name || d.author?.username || '不明',
    forkedFrom: d.forked_from ?? undefined,
    createdAt: (d.created_at ?? '').slice(0, 10),
    updatedAt: d.updated_at ? d.updated_at.slice(0, 10) : undefined,
    effectQualitative: d.effect_qualitative || undefined,
    effectHoursPerMonth:
      d.effect_hours_per_month != null ? Number(d.effect_hours_per_month) : undefined,
    likes: d.like_count ?? 0,
    accessRequests: d.request_count ?? 0,
    // 注: 閲覧/インプレッション/DL の per-tool カウントは一覧シリアライザに含まれない
    // （ActivityLog 集計のため）。一覧では 0 起点とし、集計は dashboard API を使う。
    views: 0,
    impressions: 0,
    downloads: d.tool_type === 'zip_upload' ? 0 : undefined,
  }
}

function mapAccessRequest(d: AccessRequestDTO, authorName: string): AccessRequestRecord {
  return {
    id: String(d.id),
    toolId: String(d.tool),
    toolTitle: d.tool_title,
    requester: d.requester?.display_name || d.requester?.username || '不明',
    author: authorName,
    reason: d.reason,
    status: d.status,
    createdAt: (d.created_at ?? '').slice(0, 10),
  }
}

function toWritePayload(input: NewToolInput) {
  return {
    title: input.title,
    summary: input.summary,
    readme: input.readme,
    tool_type: input.toolType,
    access_url: input.accessUrl ?? '',
    tags: input.tags.join(', '),
    work_categories: input.workCategories,
    aspice_process_ids: input.aspiceProcesses,
    forked_from: input.forkedFrom ?? null,
  }
}

// ── 認証 ──
export async function login(username: string, password: string): Promise<User> {
  const data = await apiFetch<{ token: string; user: UserDTO }>('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  setToken(data.token)
  return mapUser(data.user)
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<void>('/auth/logout/', { method: 'POST' })
  } finally {
    clearToken()
  }
}

export async function getMe(): Promise<User | null> {
  if (!getToken()) return null
  try {
    const d = await apiFetch<UserDTO>('/me/')
    return mapUser(d)
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      clearToken()
      return null
    }
    throw e
  }
}

// ── ツール ──
export interface ToolListParams {
  q?: string
  aspice?: string[]
  toolType?: string[]
  workCategory?: string[]
  sort?: string
  page?: number
}

export async function listTools(params: ToolListParams = {}): Promise<Tool[]> {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.aspice?.length) sp.set('aspice', params.aspice.join(','))
  if (params.toolType?.length) sp.set('tool_type', params.toolType.join(','))
  if (params.workCategory?.length) sp.set('work_category', params.workCategory.join(','))
  if (params.sort) sp.set('sort', params.sort)
  if (params.page) sp.set('page', String(params.page))
  const qs = sp.toString()
  const data = await apiFetch<Paginated<ToolDTO> | ToolDTO[]>(`/tools/${qs ? `?${qs}` : ''}`)
  const results = Array.isArray(data) ? data : data.results
  return results.map(mapTool)
}

export async function getTool(id: string): Promise<Tool> {
  return mapTool(await apiFetch<ToolDTO>(`/tools/${id}/`))
}

export async function createTool(input: NewToolInput): Promise<Tool> {
  const d = await apiFetch<ToolDTO>('/tools/', {
    method: 'POST',
    body: JSON.stringify(toWritePayload(input)),
  })
  return mapTool(d)
}

export async function updateTool(id: string, input: NewToolInput): Promise<Tool> {
  const d = await apiFetch<ToolDTO>(`/tools/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(toWritePayload(input)),
  })
  return mapTool(d)
}

export async function deleteTool(id: string): Promise<void> {
  await apiFetch<void>(`/tools/${id}/`, { method: 'DELETE' })
}

export async function toggleLike(id: string): Promise<{ liked: boolean; likeCount: number }> {
  const d = await apiFetch<{ liked: boolean; like_count: number }>(`/tools/${id}/like/`, {
    method: 'POST',
  })
  return { liked: d.liked, likeCount: d.like_count }
}

export async function requestAccess(id: string, reason: string): Promise<void> {
  await apiFetch<unknown>(`/tools/${id}/request-access/`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

/** zip ダウンロードURL（認証はトークン付きで別途取得する想定。簡易にURLを返す） */
export function downloadUrl(id: string): string {
  return `${API_BASE}/tools/${id}/download/`
}

// ── /api/me/* ──
export async function myTools(): Promise<Tool[]> {
  const d = await apiFetch<Paginated<ToolDTO> | ToolDTO[]>('/me/tools/')
  return (Array.isArray(d) ? d : d.results).map(mapTool)
}
export async function myLikes(): Promise<Tool[]> {
  const d = await apiFetch<Paginated<ToolDTO> | ToolDTO[]>('/me/likes/')
  return (Array.isArray(d) ? d : d.results).map(mapTool)
}
export async function myRequests(): Promise<AccessRequestRecord[]> {
  const d = await apiFetch<Paginated<AccessRequestDTO> | AccessRequestDTO[]>('/me/requests/')
  const rows = Array.isArray(d) ? d : d.results
  return rows.map((r) => mapAccessRequest(r, ''))
}
export async function incomingRequests(authorName: string): Promise<AccessRequestRecord[]> {
  const d = await apiFetch<Paginated<AccessRequestDTO> | AccessRequestDTO[]>(
    '/me/incoming-requests/',
  )
  const rows = Array.isArray(d) ? d : d.results
  return rows.map((r) => mapAccessRequest(r, authorName))
}

// ── 管理者: ユーザー管理 ──
export async function listUsers(): Promise<User[]> {
  const d = await apiFetch<Paginated<UserDTO> | UserDTO[]>('/admin/users/')
  return (Array.isArray(d) ? d : d.results).map(mapUser)
}
export async function createUser(input: {
  loginId: string
  name: string
  password: string
  role: Role
  email?: string
}): Promise<User> {
  const d = await apiFetch<UserDTO>('/admin/users/', {
    method: 'POST',
    body: JSON.stringify({
      username: input.loginId,
      display_name: input.name,
      password: input.password,
      role: input.role,
      email: input.email ?? '',
    }),
  })
  return mapUser(d)
}
export async function updateUserRole(userId: number, role: Role): Promise<User> {
  const d = await apiFetch<UserDTO>(`/admin/users/${userId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
  return mapUser(d)
}

// ── メトリクス ──
export type ActivityAction = 'impression' | 'view' | 'readme_scroll' | 'download'
export async function postActivity(
  entries: { tool: string; action: ActivityAction; session_id?: string }[],
): Promise<void> {
  if (entries.length === 0) return
  await apiFetch<unknown>('/activity/', {
    method: 'POST',
    body: JSON.stringify(entries.length === 1 ? entries[0] : entries),
  })
}

export interface DashboardSummary {
  scope: 'admin' | 'member'
  tool_count: number
  total_views: number
  total_impressions: number
  total_downloads: number
  total_likes: number
  total_requests: number
  pending_requests: number
  top_tools: { id: string; title: string; views: number; likes: number }[]
}
export async function dashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>('/dashboard/summary/')
}
