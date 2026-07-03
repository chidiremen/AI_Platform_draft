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
    zip_file: null,
    zip_file_name: null,
    tags: '',
    work_categories: [],
    effect_qualitative: '',
    effect_hours_per_month: null,
    author: { id: 1, username: 'm', display_name: 'M', role: 'member', email: '' },
    forked_from: null,
    aspice_processes: [],
    screenshots: [],
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
      zip_file: null,
      zip_file_name: null,
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
      screenshots: [],
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
      zip_file: '/media/tool_zips/a.zip',
      zip_file_name: 'a.zip',
      tags: '',
      work_categories: [],
      effect_qualitative: '',
      effect_hours_per_month: null,
      author: { id: 1, username: 'x', display_name: '', role: 'member', email: '' },
      forked_from: null,
      aspice_processes: [],
      screenshots: [],
      like_count: 0,
      request_count: 0,
      liked_by_me: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    expect(t.downloads).toBe(0)
    expect(t.zipFileName).toBe('a.zip')
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

    // createTool は POST → 取得用GETの順に2回 fetch する
    const post = calls.find((c) => c.init.method === 'POST')
    expect(post).toBeDefined()
    expect(post!.init.credentials).toBe('omit')
    expect(
      (post!.init.headers as Record<string, string>)['Authorization'],
    ).toBe('Token tok-123')
  })
})

describe('一覧のページネーション（回帰: 全件取得）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('listTools は next を辿って全ページを結合する', async () => {
    const page2 = 'http://localhost:8009/api/tools/?page=2'
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
        if (typeof init?.body === 'string') body = JSON.parse(init.body)
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

  it('updateTool(編集) は PATCH で送り forked_from を含めない', async () => {
    const methods: string[] = []
    let patchBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const m = (init?.method ?? 'GET') as string
        methods.push(m)
        if (m === 'PATCH' && typeof init?.body === 'string') {
          patchBody = JSON.parse(init.body)
        }
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
    })
    expect(methods).toContain('PATCH')
    expect(patchBody).not.toBeNull()
    expect('forked_from' in (patchBody as unknown as Record<string, unknown>)).toBe(false)
  })

  it('createTool は zipFile が指定されると multipart で送信する', async () => {
    let sentBody: BodyInit | null | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (init.method === 'POST' && _url.endsWith('/tools/')) {
          sentBody = init.body
        }
        return jsonResponse(toolDTO('new', { zip_file_name: 'a.zip' }), 201)
      }),
    )
    const file = new File(['fake'], 'a.zip', { type: 'application/zip' })
    await createTool({
      title: 't',
      summary: 's',
      readme: 'r',
      toolType: 'zip_upload',
      tags: [],
      aspiceProcesses: [],
      workCategories: ['meeting'],
      zipFile: file,
    })
    expect(sentBody).toBeInstanceOf(FormData)
    const fd = sentBody as FormData
    expect(fd.get('title')).toBe('t')
    expect(fd.get('tool_type')).toBe('zip_upload')
    expect(fd.get('work_categories')).toBe('meeting')
    expect(fd.get('zip_file')).toBe(file)
  })
})
