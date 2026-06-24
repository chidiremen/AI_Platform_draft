import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTool, listTools, mapTool, mapUser, updateTool } from '../api'

/** 最小の ToolDTO を生成 */
function toolDTO(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `tool-${id}`,
    summary: 's',
    readme: 'r',
    tool_type: 'copilot_agent',
    access_url: null,
    tags: '',
    work_categories: [],
    effect_qualitative: '',
    effect_hours_per_month: null,
    author: { id: 1, username: 'm', display_name: 'M', role: 'member', email: '' },
    forked_from: null,
    aspice_processes: [],
    like_count: 0,
    request_count: 0,
    liked_by_me: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) }
}

describe('API マッパー（バックエンドDTO → フロント型）', () => {
  it('mapUser は username/display_name を loginId/name に変換する', () => {
    const u = mapUser({
      id: 7,
      username: 'tanaka',
      display_name: '田中太郎',
      role: 'admin',
      email: 't@example.com',
    })
    expect(u).toMatchObject({
      id: 7,
      loginId: 'tanaka',
      name: '田中太郎',
      role: 'admin',
      email: 't@example.com',
    })
  })

  it('mapTool は snake_case とリレーションを正しく変換する', () => {
    const t = mapTool({
      id: 'abc',
      title: 'テストツール',
      summary: '概要',
      readme: '## R',
      tool_type: 'copilot_agent',
      access_url: 'https://example.com',
      tags: 'a, b ,c',
      work_categories: ['meeting'],
      effect_qualitative: '効果',
      effect_hours_per_month: '12.5',
      author: {
        id: 1,
        username: 'sato',
        display_name: '佐藤一郎',
        role: 'member',
        email: '',
      },
      forked_from: null,
      aspice_processes: [{ id: 'SWE.1' }, { id: 'SWE.2' }],
      like_count: 5,
      request_count: 3,
      liked_by_me: true,
      created_at: '2026-06-10T09:00:00Z',
      updated_at: '2026-06-12T09:00:00Z',
    })
    expect(t.toolType).toBe('copilot_agent')
    expect(t.aspiceProcesses).toEqual(['SWE.1', 'SWE.2'])
    expect(t.tags).toEqual(['a', 'b', 'c'])
    expect(t.author).toBe('佐藤一郎')
    expect(t.likes).toBe(5)
    expect(t.accessRequests).toBe(3)
    expect(t.effectHoursPerMonth).toBe(12.5)
    expect(t.createdAt).toBe('2026-06-10')
    expect(t.updatedAt).toBe('2026-06-12')
    // 非zipは downloads undefined
    expect(t.downloads).toBeUndefined()
  })

  it('mapTool は zip_upload の downloads を 0 で初期化する', () => {
    const t = mapTool({
      id: 'z',
      title: 'zip',
      summary: 's',
      readme: '',
      tool_type: 'zip_upload',
      access_url: null,
      tags: '',
      work_categories: [],
      effect_qualitative: '',
      effect_hours_per_month: null,
      author: { id: 1, username: 'x', display_name: '', role: 'member', email: '' },
      forked_from: null,
      aspice_processes: [],
      like_count: 0,
      request_count: 0,
      liked_by_me: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    expect(t.downloads).toBe(0)
    expect(t.tags).toEqual([])
    expect(t.aspiceProcesses).toEqual([])
  })
})

describe('APIクライアントの認証ヘッダ（回帰: 403 CSRFを防ぐ）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('POST はトークンを Authorization に付与し、Cookieを送らない（credentials: omit）', async () => {
    localStorage.setItem('aitc_token', 'tok-123')
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return {
          status: 201,
          ok: true,
          text: async () =>
            JSON.stringify({
              id: 'new',
              title: 't',
              summary: 's',
              readme: 'r',
              tool_type: 'copilot_agent',
              access_url: null,
              tags: '',
              work_categories: [],
              effect_qualitative: '',
              effect_hours_per_month: null,
              author: { id: 1, username: 'm', display_name: 'M', role: 'member', email: '' },
              forked_from: null,
              aspice_processes: [],
              like_count: 0,
              request_count: 0,
              liked_by_me: false,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            }),
        }
      }),
    )

    await createTool({
      title: 't',
      summary: 's',
      readme: 'r',
      toolType: 'copilot_agent',
      tags: [],
      aspiceProcesses: [],
      workCategories: [],
    })

    expect(calls).toHaveLength(1)
    const { init } = calls[0]
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Token tok-123')
  })
})

describe('一覧のページネーション（回帰: 全件取得）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('listTools は next を辿って全ページを結合する', async () => {
    const page2 = 'http://localhost:8000/api/tools/?page=2'
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('page=2')) {
        return jsonResponse({ count: 3, next: null, results: [toolDTO('3')] })
      }
      return jsonResponse({ count: 3, next: page2, results: [toolDTO('1'), toolDTO('2')] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const tools = await listTools()
    expect(tools.map((t) => t.id)).toEqual(['1', '2', '3'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('ツール書き込みペイロード（回帰: 編集でフォーク元を消さない）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('createTool(フォーク) は forked_from を送る', async () => {
    let body: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        body = JSON.parse(init.body as string)
        return jsonResponse(toolDTO('new'), 201)
      }),
    )
    await createTool({
      title: 't',
      summary: 's',
      readme: 'r',
      toolType: 'copilot_agent',
      tags: [],
      aspiceProcesses: [],
      workCategories: [],
      forkedFrom: 'src-id',
    })
    expect(body.forked_from).toBe('src-id')
  })

  it('updateTool(編集) は forked_from を送らない（PATCHで上書きしない）', async () => {
    let body: Record<string, unknown> = {}
    let method = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        body = JSON.parse(init.body as string)
        method = init.method as string
        return jsonResponse(toolDTO('x'))
      }),
    )
    await updateTool('x', {
      title: 't',
      summary: 's',
      readme: 'r',
      toolType: 'copilot_agent',
      tags: [],
      aspiceProcesses: [],
      workCategories: [],
      // forkedFrom 未指定（編集モード）
    })
    expect(method).toBe('PATCH')
    expect('forked_from' in body).toBe(false)
  })
})
