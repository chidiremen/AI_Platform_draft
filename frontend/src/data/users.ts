/**
 * デモ用ユーザー（モック認証）。
 * バックエンド未接続のため、ID + パスワードはこのファイル内で検証する。
 * role: 'admin' = 組織管理者（全体管理・全データ閲覧）, 'member' = メンバー。
 * 登録者（Author）はメンバーがツールを登録した状態を指し、ロールとしては member。
 */

export type Role = 'admin' | 'member'

export interface User {
  /** ログインID */
  loginId: string
  /** モック用パスワード（平文・デモ専用） */
  password: string
  /** 表示名（ツールの author と突き合わせる） */
  name: string
  role: Role
  email?: string
}

export const MOCK_USERS: User[] = [
  { loginId: 'tanaka', password: 'password', name: '田中太郎', role: 'admin', email: 'tanaka@example.com' },
  { loginId: 'suzuki', password: 'password', name: '鈴木花子', role: 'member', email: 'suzuki@example.com' },
  { loginId: 'sato', password: 'password', name: '佐藤一郎', role: 'member', email: 'sato@example.com' },
  { loginId: 'yamada', password: 'password', name: '山田次郎', role: 'member', email: 'yamada@example.com' },
  { loginId: 'takahashi', password: 'password', name: '高橋美咲', role: 'member', email: 'takahashi@example.com' },
  { loginId: 'nakamura', password: 'password', name: '中村健太', role: 'member', email: 'nakamura@example.com' },
  { loginId: 'kobayashi', password: 'password', name: '小林陽子', role: 'member', email: 'kobayashi@example.com' },
  { loginId: 'watanabe', password: 'password', name: '渡辺裕介', role: 'member', email: 'watanabe@example.com' },
  { loginId: 'ito', password: 'password', name: '伊藤真理', role: 'member', email: 'ito@example.com' },
  { loginId: 'matsumoto', password: 'password', name: '松本大輔', role: 'member', email: 'matsumoto@example.com' },
]
