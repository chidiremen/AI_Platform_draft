import { describe, expect, it } from 'vitest'
import { mapTool, mapUser } from '../api'

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
