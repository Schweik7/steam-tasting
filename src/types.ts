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

export interface Settings {
  base: string
  model: string
  key: string
  topn: number
  temp: number
  lang: '中文' | 'English'
  style: string
  blind: boolean
}
