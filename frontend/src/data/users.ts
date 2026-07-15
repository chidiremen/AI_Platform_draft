/**
 * デモ用ユーザー（モック認証）。
 * バックエンド未接続のため、ID + パスワードはこのファイル内で検証する。
 * role: 'admin' = 組織管理者（全体管理）, 'tool_admin' = ツール管理者（admin同等）,
 *       'member' = メンバー。
 * 登録者（Author）はメンバーがツールを登録した状態を指し、ロールとしては member。
 */

export type Role = 'admin' | 'tool_admin' | 'member'

/** ロールの表示ラベル。API 側の TextChoices と一致させる。 */
export const ROLE_LABELS: Record<Role, string> = {
  admin: '組織管理者',
  tool_admin: 'ツール管理者',
  member: 'メンバー',
}

/** 管理者権限を持つロール（組織管理者・ツール管理者）。 */
export const ADMIN_ROLES: ReadonlySet<Role> = new Set(['admin', 'tool_admin'])

/** ユーザーが管理者権限を持つか。null/undefined 安全。 */
export function isAdminRole(role: Role | string | null | undefined): boolean {
  return role != null && ADMIN_ROLES.has(role as Role)
}

export interface User {
  /** バックエンドの数値ID（実APIモードでのユーザー更新に使用） */
  id?: number
  /** ログインID */
  loginId: string
  /** モック用パスワード（平文・デモ専用。実APIモードでは未設定） */
  password?: string
  /** 表示名（ツールの author と突き合わせる） */
  name: string
  role: Role
  email?: string
}

export const MOCK_USERS: User[] = [
  { loginId: 'tanaka', password: 'password', name: '田中太郎', role: 'admin', email: 'tanaka@example.com' },
  { loginId: 'suzuki', password: 'password', name: '鈴木花子', role: 'member', email: 'suzuki@example.com' },
  { loginId: 'sato', password: 'password', name: '佐藤一郎', role: 'tool_admin', email: 'sato@example.com' },
  { loginId: 'yamada', password: 'password', name: '山田次郎', role: 'member', email: 'yamada@example.com' },
  { loginId: 'takahashi', password: 'password', name: '高橋美咲', role: 'member', email: 'takahashi@example.com' },
  { loginId: 'nakamura', password: 'password', name: '中村健太', role: 'member', email: 'nakamura@example.com' },
  { loginId: 'kobayashi', password: 'password', name: '小林陽子', role: 'member', email: 'kobayashi@example.com' },
  { loginId: 'watanabe', password: 'password', name: '渡辺裕介', role: 'member', email: 'watanabe@example.com' },
  { loginId: 'ito', password: 'password', name: '伊藤真理', role: 'member', email: 'ito@example.com' },
  { loginId: 'matsumoto', password: 'password', name: '松本大輔', role: 'member', email: 'matsumoto@example.com' },
]
