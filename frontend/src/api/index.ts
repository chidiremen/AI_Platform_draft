/**
 * Django + DRF バックエンドの API クライアント。
 * `VITE_USE_MOCK=false` のときに store から利用される。
 * バックエンドの snake_case レスポンスをフロントの型へマッピングする。
 */
import { API_BASE, TOKEN_KEY } from '../config'
import type {
  Answer,
  CommentType,
  DocCategory,
  DocKind,
  ForumCategory,
  ForumPost,
  ForumThread,
  GuideArticle,
  Question,
  Tool,
  ToolComment,
  ToolType,
} from '../types'
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
export function clearToken() {
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
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: Record<string, string> = {
    // multipart のときは Content-Type をブラウザに任せる（boundary 付与）
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  }
  // ログイン/登録エンドポイントは AllowAny なので、古いトークンを付けて
  // 呼ぶと DRF の TokenAuthentication に先に叩き落されて 401 になる。
  // 認証用エンドポイント宛には Authorization を付けない（防御的措置）。
  const isAuthEndpoint =
    path.startsWith('/auth/login') || path.startsWith('/auth/register')
  if (token && !isAuthEndpoint) headers['Authorization'] = `Token ${token}`

  // path は相対（/tools/ 等）または絶対（ページネーションの next）の両方を許容。
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers,
    // トークン認証のみを使う。セッションCookieを送らないことで、DRFの
    // SessionAuthentication による CSRF 検証（POST時の403）を回避する。
    credentials: 'omit',
  })

  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* JSON でないレスポンス（HTMLエラーページ等）はそのまま扱う */
  }
  if (!res.ok) {
    throw new ApiError(res.status, extractApiErrorMessage(data, text, res.status))
  }
  return data as T
}

/**
 * DRF のエラーレスポンスから人間可読なメッセージを取り出す。
 *   1. `detail` （認可・認証系）
 *   2. `non_field_errors` （フォーム全体）
 *   3. フィールド別エラー `{field: ["メッセージ"]}` を「field: メッセージ」に整形
 *   4. どれも該当しなければ生テキスト or 「APIエラー (status)」
 */
function extractApiErrorMessage(data: unknown, rawText: string, status: number): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail
    const nfe = obj.non_field_errors
    if (Array.isArray(nfe) && typeof nfe[0] === 'string') return nfe[0]
    // フィールド別エラーを列挙
    const parts: string[] = []
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'detail' || key === 'non_field_errors') continue
      if (Array.isArray(val)) {
        parts.push(`${key}: ${val.filter((v) => typeof v === 'string').join(' / ')}`)
      } else if (typeof val === 'string') {
        parts.push(`${key}: ${val}`)
      }
    }
    if (parts.length) return parts.join('\n')
  }
  if (rawText && rawText.length < 300) return rawText
  return `APIエラー (${status})`
}

/**
 * ページネーション対応の一覧取得。
 * DRF の PageNumberPagination（{count,next,previous,results}）の next を辿り、
 * 全ページを結合して返す。バックエンドが配列を直接返す場合もそのまま扱う。
 */
async function fetchAllPages<T>(firstPath: string): Promise<T[]> {
  const out: T[] = []
  let next: string | null = firstPath
  // 上限ガード（無限ループ防止）
  let guard = 0
  while (next && guard < 1000) {
    guard += 1
    const data: Paginated<T> | T[] = await apiFetch<Paginated<T> | T[]>(next)
    if (Array.isArray(data)) {
      out.push(...data)
      break
    }
    out.push(...data.results)
    next = data.next
  }
  return out
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
interface ScreenshotDTO {
  id: string
  image: string
  image_url: string | null
  display_order: number
}
interface ToolDTO {
  id: string
  title: string
  summary: string
  readme: string
  tool_type: ToolType
  access_url: string | null
  zip_file: string | null
  zip_file_name: string | null
  tags: string
  work_categories: string[]
  effect_qualitative: string
  effect_hours_per_month: string | number | null
  author: UserDTO
  forked_from: string | null
  aspice_processes: AspiceDTO[]
  screenshots?: ScreenshotDTO[]
  like_count: number
  request_count: number
  download_count?: number
  view_count?: number
  impression_count?: number
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
  next: string | null
  previous?: string | null
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
    zipFileName: d.zip_file_name ?? undefined,
    screenshots: (d.screenshots ?? []).map((s) => ({
      id: String(s.id),
      url: s.image_url ?? s.image,
      displayOrder: s.display_order,
    })),
    author: d.author?.display_name || d.author?.username || '不明',
    authorEmail: d.author?.email || undefined,
    forkedFrom: d.forked_from ?? undefined,
    createdAt: (d.created_at ?? '').slice(0, 10),
    updatedAt: d.updated_at ? d.updated_at.slice(0, 10) : undefined,
    effectQualitative: d.effect_qualitative || undefined,
    effectHoursPerMonth:
      d.effect_hours_per_month != null ? Number(d.effect_hours_per_month) : undefined,
    likes: d.like_count ?? 0,
    accessRequests: d.request_count ?? 0,
    // per-tool 閲覧/インプレッション/DL は ActivityLog 集計。
    // download/view/impression_count がシリアライザに含まれるようになったのでそれを使う。
    views: d.view_count ?? 0,
    impressions: d.impression_count ?? 0,
    downloads:
      d.download_count != null
        ? d.download_count
        : d.tool_type === 'zip_upload'
          ? 0
          : undefined,
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
  const payload: Record<string, unknown> = {
    title: input.title,
    summary: input.summary,
    readme: input.readme,
    tool_type: input.toolType,
    access_url: input.accessUrl ?? '',
    tags: input.tags.join(', '),
    work_categories: input.workCategories,
    aspice_process_ids: input.aspiceProcesses,
    effect_qualitative: input.effectQualitative ?? '',
    effect_hours_per_month: input.effectHoursPerMonth ?? null,
  }
  if (input.forkedFrom !== undefined) {
    payload.forked_from = input.forkedFrom
  }
  return payload
}

/** zipファイルを含む multipart FormData を組み立てる。 */
function toMultipartPayload(input: NewToolInput): FormData {
  const fd = new FormData()
  fd.append('title', input.title)
  fd.append('summary', input.summary)
  fd.append('readme', input.readme)
  fd.append('tool_type', input.toolType)
  fd.append('access_url', input.accessUrl ?? '')
  fd.append('tags', input.tags.join(', '))
  // JSONField はサーバ側で CSV/JSON文字列を許容（_coerce_string_list）
  fd.append('work_categories', input.workCategories.join(','))
  fd.append('aspice_process_ids', input.aspiceProcesses.join(','))
  fd.append('effect_qualitative', input.effectQualitative ?? '')
  if (input.effectHoursPerMonth != null) {
    fd.append('effect_hours_per_month', String(input.effectHoursPerMonth))
  }
  if (input.forkedFrom !== undefined) {
    fd.append('forked_from', input.forkedFrom)
  }
  if (input.zipFile) fd.append('zip_file', input.zipFile)
  return fd
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
  // 全ページを取得（一覧のフィルタ/ソートはフロント側で行うため全件必要）
  const rows = await fetchAllPages<ToolDTO>(`/tools/${qs ? `?${qs}` : ''}`)
  return rows.map(mapTool)
}

export async function getTool(id: string): Promise<Tool> {
  return mapTool(await apiFetch<ToolDTO>(`/tools/${id}/`))
}

/** zipまたはスクリーンショットがあれば multipart、なければ JSON で送る。 */
function hasFiles(input: NewToolInput): boolean {
  return !!input.zipFile || (input.newScreenshots?.length ?? 0) > 0
}

export async function createTool(input: NewToolInput): Promise<Tool> {
  const useMultipart = hasFiles(input)
  const d = await apiFetch<ToolDTO>('/tools/', {
    method: 'POST',
    body: useMultipart
      ? toMultipartPayload(input)
      : JSON.stringify(toWritePayload(input)),
  })
  // スクリーンショットは別エンドポイントへ追加投稿
  for (const file of input.newScreenshots ?? []) {
    await uploadScreenshot(d.id, file)
  }
  return mapTool(await apiFetch<ToolDTO>(`/tools/${d.id}/`))
}

export async function updateTool(id: string, input: NewToolInput): Promise<Tool> {
  const useMultipart = hasFiles(input)
  await apiFetch<ToolDTO>(`/tools/${id}/`, {
    method: 'PATCH',
    body: useMultipart
      ? toMultipartPayload(input)
      : JSON.stringify(toWritePayload(input)),
  })
  for (const file of input.newScreenshots ?? []) {
    await uploadScreenshot(id, file)
  }
  return mapTool(await apiFetch<ToolDTO>(`/tools/${id}/`))
}

export async function uploadScreenshot(toolId: string, image: File): Promise<void> {
  const fd = new FormData()
  fd.append('image', image)
  await apiFetch<unknown>(`/tools/${toolId}/screenshots/`, {
    method: 'POST',
    body: fd,
  })
}

export async function deleteScreenshot(toolId: string, screenshotId: string): Promise<void> {
  await apiFetch<void>(`/tools/${toolId}/screenshots/${screenshotId}/`, {
    method: 'DELETE',
  })
}

export async function deleteTool(id: string): Promise<void> {
  await apiFetch<void>(`/tools/${id}/`, { method: 'DELETE' })
}

/** アクセス権申請の承認/却下（登録者本人または管理者のみ）。 */
export async function resolveAccessRequest(
  requestId: string,
  status: 'granted' | 'rejected',
): Promise<void> {
  await apiFetch<unknown>(`/access-requests/${requestId}/resolve/`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

/** 解決済み申請の履歴削除（申請者・登録者・管理者）。pendingは削除不可。 */
export async function deleteAccessRequest(requestId: string): Promise<void> {
  await apiFetch<void>(`/access-requests/${requestId}/`, { method: 'DELETE' })
}

/** zipダウンロード(認証必須)：blobとして取得し、ブラウザに保存させる。 */
export async function downloadZip(toolId: string, filename = 'tool.zip'): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/tools/${toolId}/download/`, {
    headers: token ? { Authorization: `Token ${token}` } : {},
    credentials: 'omit',
  })
  if (!res.ok) throw new ApiError(res.status, `ダウンロードに失敗しました (${res.status})`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function toggleLike(id: string): Promise<{ liked: boolean; likeCount: number }> {
  const d = await apiFetch<{ liked: boolean; like_count: number }>(`/tools/${id}/like/`, {
    method: 'POST',
  })
  return { liked: d.liked, likeCount: d.like_count }
}

/**
 * アクセス権申請を送信し、サーバが採番したレコードを返す。
 * 楽観追加時の id (フェイク `r${Date.now()}`) を実IDで置き換えるために
 * 戻り値を呼び出し側で利用する（404 resolve 防止）。
 */
export async function requestAccess(
  id: string,
  reason: string,
): Promise<{ id: string; status: 'pending' | 'granted' | 'rejected' }> {
  const d = await apiFetch<{ id: string; status: 'pending' | 'granted' | 'rejected' }>(
    `/tools/${id}/request-access/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  )
  return { id: String(d.id), status: d.status }
}

// ── /api/me/* ──
export async function myTools(): Promise<Tool[]> {
  return (await fetchAllPages<ToolDTO>('/me/tools/')).map(mapTool)
}
export async function myLikes(): Promise<Tool[]> {
  return (await fetchAllPages<ToolDTO>('/me/likes/')).map(mapTool)
}
export async function myRequests(): Promise<AccessRequestRecord[]> {
  const rows = await fetchAllPages<AccessRequestDTO>('/me/requests/')
  return rows.map((r) => mapAccessRequest(r, ''))
}
export async function incomingRequests(authorName: string): Promise<AccessRequestRecord[]> {
  const rows = await fetchAllPages<AccessRequestDTO>('/me/incoming-requests/')
  return rows.map((r) => mapAccessRequest(r, authorName))
}

// ── 管理者: ユーザー管理 ──
export async function listUsers(): Promise<User[]> {
  return (await fetchAllPages<UserDTO>('/admin/users/')).map(mapUser)
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

/**
 * 管理者によるユーザー編集（表示名・メール・ロール・パスワードリセット）。
 * 値が undefined のフィールドはペイロードに含めない。
 */
export async function updateUserByAdmin(
  userId: number,
  patch: { name?: string; email?: string; role?: Role; password?: string },
): Promise<User> {
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.display_name = patch.name
  if (patch.email !== undefined) body.email = patch.email
  if (patch.role !== undefined) body.role = patch.role
  if (patch.password) body.password = patch.password
  const d = await apiFetch<UserDTO>(`/admin/users/${userId}/`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return mapUser(d)
}

export async function deleteUserByAdmin(userId: number): Promise<void> {
  await apiFetch<void>(`/admin/users/${userId}/`, { method: 'DELETE' })
}

/** ログイン中ユーザー自身のプロフィール更新（表示名・メール）。 */
export async function updateMe(patch: {
  name?: string
  email?: string
}): Promise<User> {
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.display_name = patch.name
  if (patch.email !== undefined) body.email = patch.email
  const d = await apiFetch<UserDTO>(`/me/`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return mapUser(d)
}

/** 自分のパスワード変更。成功時は既存トークンが無効化されるので再ログインが必要。 */
export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await apiFetch<unknown>('/me/password/', {
    method: 'POST',
    body: JSON.stringify({
      old_password: oldPassword,
      new_password: newPassword,
    }),
  })
  // 変更成功時、サーバ側で既存トークンが無効化されている。
  // ローカルに残った古いトークンを付けて次の認証リクエストを叩くと 401 に
  // なるため、必ずクリアする。
  clearToken()
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

// ── コメント ──
interface CommentDTO {
  id: string
  tool: string
  author: UserDTO
  body: string
  comment_type: CommentType
  parent: string | null
  created_at: string
  like_count: number
  liked_by_me: boolean
  reply_count?: number
}

function mapComment(d: CommentDTO): ToolComment {
  return {
    id: String(d.id),
    toolId: String(d.tool),
    author: d.author?.display_name || d.author?.username || '不明',
    body: d.body,
    commentType: d.comment_type,
    parent: d.parent ? String(d.parent) : null,
    createdAt: d.created_at,
    likeCount: d.like_count ?? 0,
    likedByMe: d.liked_by_me ?? false,
  }
}

export async function listComments(toolId: string): Promise<ToolComment[]> {
  return (await fetchAllPages<CommentDTO>(`/tools/${toolId}/comments/`)).map(mapComment)
}

export async function listIncomingComments(): Promise<ToolComment[]> {
  return (await fetchAllPages<CommentDTO>('/me/incoming-comments/')).map(mapComment)
}

export async function createComment(
  toolId: string,
  input: { body: string; commentType: CommentType; parent?: string | null },
): Promise<ToolComment> {
  const d = await apiFetch<CommentDTO>(`/tools/${toolId}/comments/`, {
    method: 'POST',
    body: JSON.stringify({
      body: input.body,
      comment_type: input.commentType,
      parent: input.parent ?? null,
    }),
  })
  return mapComment(d)
}

export async function deleteComment(commentId: string): Promise<void> {
  await apiFetch<void>(`/comments/${commentId}/`, { method: 'DELETE' })
}

export async function toggleCommentLike(
  commentId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const d = await apiFetch<{ liked: boolean; like_count: number }>(
    `/comments/${commentId}/like/`,
    { method: 'POST' },
  )
  return { liked: d.liked, likeCount: d.like_count }
}

export interface DashboardFunnelStage {
  stage: string
  label: string
  count: number
}
export async function dashboardFunnel(): Promise<{
  scope: 'admin' | 'member'
  funnel: DashboardFunnelStage[]
}> {
  return apiFetch('/dashboard/funnel/')
}

// ─────────────────────────────────────────────────────────────────────
// Docs / Q&A
// ─────────────────────────────────────────────────────────────────────

interface DocCategoryDTO {
  id: number
  kind: DocKind
  name: string
  slug: string
  parent: number | null
  order: number
  icon: string
  article_count?: number
  question_count?: number
}
interface GuideDTO {
  id: string
  category: number
  category_slug: string
  category_name: string
  title: string
  slug: string
  body: string
  order: number
  author: UserDTO | null
  is_published: boolean
  created_at: string
  updated_at: string
}
interface AnswerDTO {
  id: string
  question: string
  body: string
  author: UserDTO | null
  is_accepted: boolean
  created_at: string
  updated_at: string
}
interface QuestionDTO {
  id: string
  category: number | null
  category_slug: string | null
  category_name: string | null
  title: string
  body: string
  tags: string
  asker: UserDTO | null
  is_resolved: boolean
  view_count: number
  answer_count: number
  answers?: AnswerDTO[]
  created_at: string
  updated_at: string
}

const authorOf = (u: UserDTO | null | undefined): string =>
  u ? u.display_name || u.username : '不明'

function mapCategory(d: DocCategoryDTO): DocCategory {
  return {
    id: d.id,
    kind: d.kind,
    name: d.name,
    slug: d.slug,
    parent: d.parent,
    order: d.order,
    icon: d.icon,
    articleCount: d.article_count,
    questionCount: d.question_count,
  }
}
function mapGuide(d: GuideDTO): GuideArticle {
  return {
    id: d.id,
    categoryId: d.category,
    categorySlug: d.category_slug,
    categoryName: d.category_name,
    title: d.title,
    slug: d.slug,
    body: d.body,
    order: d.order,
    author: authorOf(d.author),
    isPublished: d.is_published,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }
}
function mapAnswer(d: AnswerDTO): Answer {
  return {
    id: d.id,
    questionId: d.question,
    body: d.body,
    author: authorOf(d.author),
    isAccepted: d.is_accepted,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }
}
function mapQuestion(d: QuestionDTO): Question {
  return {
    id: d.id,
    categoryId: d.category,
    categorySlug: d.category_slug,
    categoryName: d.category_name,
    title: d.title,
    body: d.body,
    tags: d.tags ? d.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    asker: authorOf(d.asker),
    isResolved: d.is_resolved,
    viewCount: d.view_count,
    answerCount: d.answer_count,
    answers: (d.answers ?? []).map(mapAnswer),
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }
}

// ── DocCategory ──
export async function listCategories(kind?: DocKind): Promise<DocCategory[]> {
  const path = kind ? `/doc-categories/?kind=${kind}` : '/doc-categories/'
  const list = await apiFetch<DocCategoryDTO[]>(path)
  return list.map(mapCategory)
}

// ── Guide ──
export async function listGuides(params?: {
  category?: string
  q?: string
}): Promise<GuideArticle[]> {
  const qs = new URLSearchParams()
  if (params?.category) qs.set('category', params.category)
  if (params?.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs}` : ''
  const list = await apiFetch<GuideDTO[]>(`/guides/${suffix}`)
  return list.map(mapGuide)
}

export async function getGuide(id: string): Promise<GuideArticle> {
  return mapGuide(await apiFetch<GuideDTO>(`/guides/${id}/`))
}

export interface GuideInput {
  category: number
  title: string
  slug: string
  body: string
  order?: number
  isPublished?: boolean
}

export async function createGuide(input: GuideInput): Promise<GuideArticle> {
  const body = {
    category: input.category,
    title: input.title,
    slug: input.slug,
    body: input.body,
    order: input.order ?? 0,
    is_published: input.isPublished ?? true,
  }
  return mapGuide(
    await apiFetch<GuideDTO>('/guides/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
}

export async function updateGuide(id: string, input: Partial<GuideInput>): Promise<GuideArticle> {
  const body: Record<string, unknown> = {}
  if (input.category != null) body.category = input.category
  if (input.title != null) body.title = input.title
  if (input.slug != null) body.slug = input.slug
  if (input.body != null) body.body = input.body
  if (input.order != null) body.order = input.order
  if (input.isPublished != null) body.is_published = input.isPublished
  return mapGuide(
    await apiFetch<GuideDTO>(`/guides/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  )
}

export async function deleteGuide(id: string): Promise<void> {
  await apiFetch(`/guides/${id}/`, { method: 'DELETE' })
}

// ── Question ──
export async function listQuestions(params?: {
  q?: string
  category?: string
  resolved?: boolean
  mine?: boolean
}): Promise<Question[]> {
  const qs = new URLSearchParams()
  if (params?.q) qs.set('q', params.q)
  if (params?.category) qs.set('category', params.category)
  if (params?.resolved != null) qs.set('resolved', String(params.resolved))
  if (params?.mine) qs.set('mine', 'true')
  const suffix = qs.toString() ? `?${qs}` : ''
  const r = await apiFetch<Paginated<QuestionDTO>>(`/questions/${suffix}`)
  return r.results.map(mapQuestion)
}

export async function getQuestion(id: string): Promise<Question> {
  return mapQuestion(await apiFetch<QuestionDTO>(`/questions/${id}/`))
}

export interface QuestionInput {
  category?: number | null
  title: string
  body: string
  tags?: string
}

export async function createQuestion(input: QuestionInput): Promise<Question> {
  return mapQuestion(
    await apiFetch<QuestionDTO>('/questions/', {
      method: 'POST',
      body: JSON.stringify({
        category: input.category ?? null,
        title: input.title,
        body: input.body,
        tags: input.tags ?? '',
      }),
    }),
  )
}

export async function updateQuestion(
  id: string,
  input: Partial<QuestionInput>,
): Promise<Question> {
  const body: Record<string, unknown> = {}
  if (input.category !== undefined) body.category = input.category
  if (input.title != null) body.title = input.title
  if (input.body != null) body.body = input.body
  if (input.tags != null) body.tags = input.tags
  return mapQuestion(
    await apiFetch<QuestionDTO>(`/questions/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  )
}

export async function deleteQuestion(id: string): Promise<void> {
  await apiFetch(`/questions/${id}/`, { method: 'DELETE' })
}

export async function toggleResolved(id: string): Promise<Question> {
  return mapQuestion(
    await apiFetch<QuestionDTO>(`/questions/${id}/toggle-resolved/`, {
      method: 'POST',
    }),
  )
}

// ── Answer ──
export async function createAnswer(questionId: string, body: string): Promise<Answer> {
  return mapAnswer(
    await apiFetch<AnswerDTO>('/answers/', {
      method: 'POST',
      body: JSON.stringify({ question: questionId, body }),
    }),
  )
}

export async function updateAnswer(id: string, body: string): Promise<Answer> {
  return mapAnswer(
    await apiFetch<AnswerDTO>(`/answers/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  )
}

export async function deleteAnswer(id: string): Promise<void> {
  await apiFetch(`/answers/${id}/`, { method: 'DELETE' })
}

export async function acceptAnswer(id: string): Promise<Answer> {
  return mapAnswer(
    await apiFetch<AnswerDTO>(`/answers/${id}/accept/`, { method: 'POST' }),
  )
}

// ── Attachment (returns absolute URL to embed in markdown) ──
export async function uploadDocAttachment(file: File | Blob): Promise<string> {
  const fd = new FormData()
  fd.append('image', file)
  const res = await apiFetch<{ url: string }>('/doc-attachments/', {
    method: 'POST',
    body: fd,
  })
  return res.url
}

// ─────────────────────────────────────────────────────────────────────
// Forum（2ch 風スレッド掲示板）
// ─────────────────────────────────────────────────────────────────────

interface ForumPostDTO {
  id: string
  thread: string
  number: number
  body: string
  display_name: string
  is_handle: boolean
  poster_id: string
  can_edit: boolean
  is_mine: boolean
  created_at: string
  updated_at: string
}
interface ForumThreadDTO {
  id: string
  title: string
  body: string
  category: ForumCategory
  tags: string
  display_name: string
  is_handle: boolean
  poster_id: string
  anon_name: string
  can_edit: boolean
  is_mine: boolean
  is_pinned: boolean
  is_closed: boolean
  view_count: number
  post_count: number
  vote_count: number
  voted_by_me: boolean
  posts?: ForumPostDTO[] | null
  last_posted_at: string | null
  created_at: string
  updated_at: string
}

function mapForumPost(d: ForumPostDTO): ForumPost {
  return {
    id: d.id,
    threadId: d.thread,
    number: d.number,
    body: d.body,
    displayName: d.display_name,
    isHandle: !!d.is_handle,
    posterId: d.poster_id,
    canEdit: !!d.can_edit,
    isMine: !!d.is_mine,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }
}
function mapForumThread(d: ForumThreadDTO): ForumThread {
  return {
    id: d.id,
    title: d.title,
    body: d.body,
    category: d.category,
    tags: d.tags ? d.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    displayName: d.display_name,
    isHandle: !!d.is_handle,
    posterId: d.poster_id,
    anonName: d.anon_name,
    canEdit: !!d.can_edit,
    isMine: !!d.is_mine,
    isPinned: d.is_pinned,
    isClosed: d.is_closed,
    viewCount: d.view_count,
    postCount: d.post_count,
    voteCount: d.vote_count,
    votedByMe: d.voted_by_me,
    posts: d.posts ? d.posts.map(mapForumPost) : undefined,
    lastPostedAt: d.last_posted_at,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }
}

export type ForumSort = 'latest' | 'new' | 'votes' | 'posts'

export async function listThreads(params?: {
  q?: string
  category?: ForumCategory
  mine?: boolean
  sort?: ForumSort
}): Promise<ForumThread[]> {
  const qs = new URLSearchParams()
  if (params?.q) qs.set('q', params.q)
  if (params?.category) qs.set('category', params.category)
  if (params?.mine) qs.set('mine', 'true')
  if (params?.sort) qs.set('sort', params.sort)
  const suffix = qs.toString() ? `?${qs}` : ''
  const r = await apiFetch<Paginated<ForumThreadDTO>>(`/forum/threads/${suffix}`)
  return r.results.map(mapForumThread)
}

export async function getThread(id: string): Promise<ForumThread> {
  return mapForumThread(await apiFetch<ForumThreadDTO>(`/forum/threads/${id}/`))
}

export interface ThreadInput {
  title: string
  body: string
  category: ForumCategory
  tags?: string
  /** 名乗る名前。空欄なら名無し、@付きなら固定ハンドル */
  posterName?: string
}

export async function createThread(input: ThreadInput): Promise<ForumThread> {
  return mapForumThread(
    await apiFetch<ForumThreadDTO>('/forum/threads/', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        category: input.category,
        tags: input.tags ?? '',
        poster_name: input.posterName ?? '',
      }),
    }),
  )
}

export async function updateThread(
  id: string,
  input: Partial<ThreadInput>,
): Promise<ForumThread> {
  const body: Record<string, unknown> = {}
  if (input.title != null) body.title = input.title
  if (input.body != null) body.body = input.body
  if (input.category != null) body.category = input.category
  if (input.tags != null) body.tags = input.tags
  return mapForumThread(
    await apiFetch<ForumThreadDTO>(`/forum/threads/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  )
}

export async function deleteThread(id: string): Promise<void> {
  await apiFetch(`/forum/threads/${id}/`, { method: 'DELETE' })
}

export async function voteThread(id: string): Promise<ForumThread> {
  return mapForumThread(
    await apiFetch<ForumThreadDTO>(`/forum/threads/${id}/vote/`, { method: 'POST' }),
  )
}

export async function toggleThreadClosed(id: string): Promise<ForumThread> {
  return mapForumThread(
    await apiFetch<ForumThreadDTO>(`/forum/threads/${id}/toggle-closed/`, {
      method: 'POST',
    }),
  )
}

export async function toggleThreadPinned(id: string): Promise<ForumThread> {
  return mapForumThread(
    await apiFetch<ForumThreadDTO>(`/forum/threads/${id}/toggle-pinned/`, {
      method: 'POST',
    }),
  )
}

export async function createForumPost(
  threadId: string,
  body: string,
  posterName = '',
): Promise<ForumPost> {
  return mapForumPost(
    await apiFetch<ForumPostDTO>('/forum/posts/', {
      method: 'POST',
      body: JSON.stringify({ thread: threadId, body, poster_name: posterName }),
    }),
  )
}

/** 【管理者限定】匿名投稿の投稿者を特定する（サーバ側で監査ログに記録される）。 */
export interface ForumReveal {
  targetType: string
  targetId: string
  posterId: string
  displayName: string
  username: string | null
  userDisplayName: string | null
  email: string | null
  role: string | null
}

interface ForumRevealDTO {
  target_type: string
  target_id: string
  poster_id: string
  display_name: string
  username: string | null
  user_display_name: string | null
  email: string | null
  role: string | null
}

function mapReveal(d: ForumRevealDTO): ForumReveal {
  return {
    targetType: d.target_type,
    targetId: d.target_id,
    posterId: d.poster_id,
    displayName: d.display_name,
    username: d.username,
    userDisplayName: d.user_display_name,
    email: d.email,
    role: d.role,
  }
}

export async function revealForumPost(
  id: string,
  reason = '',
): Promise<ForumReveal> {
  return mapReveal(
    await apiFetch<ForumRevealDTO>(`/forum/posts/${id}/reveal/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  )
}

export async function revealForumThread(
  id: string,
  reason = '',
): Promise<ForumReveal> {
  return mapReveal(
    await apiFetch<ForumRevealDTO>(`/forum/threads/${id}/reveal/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  )
}

export async function updateForumPost(id: string, body: string): Promise<ForumPost> {
  return mapForumPost(
    await apiFetch<ForumPostDTO>(`/forum/posts/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  )
}

export async function deleteForumPost(id: string): Promise<void> {
  await apiFetch(`/forum/posts/${id}/`, { method: 'DELETE' })
}


/** フィードバックメールの宛先（サーバは送信せず、宛先だけを返す）。 */
export async function getFeedbackRecipients(): Promise<{
  to: string[]
  source: 'setting' | 'admins'
}> {
  return apiFetch('/feedback-recipients/')
}
