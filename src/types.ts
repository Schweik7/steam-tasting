export interface Game {
  name: string
  hours: number
  last_played: string
  w2: number // playtime in last 2 weeks (minutes)
  appid: string | number
}

export interface ParseResult {
  games: Game[]
  source: string
}

export interface Profile {
  steamid: string
  name: string
  avatar: string
  profileurl: string
}

export interface MeResponse {
  profile: Profile
  games: Record<string, unknown>[]
  gamesPrivate: boolean
}

export interface Settings {
  base: string
  model: string
  key: string
  topn: number
  temp: number
  lang: '中文' | 'English'
  style: string
  blind: boolean
  age: number // 0 = 未填;用于把游玩日期映射到人生阶段(高中/大学…)
  gender: string // '' / 男 / 女 / 其他
  magicVal: string // 邀请码;有效性由后端 /api/invite 校验,有效则用我方 API
}
