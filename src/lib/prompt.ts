import type { Game, Settings } from '../types'

export const SYSTEM_PROMPT = `你是一位资深的游戏品味鉴赏家,兼具数据分析师的严谨与游戏媒体主笔的文采。
任务:依据用户提供的 Steam 游玩数据(游戏名、总时长、最近2周时长、最后游玩日期),
写一份既有洞察、又好读、还带点人情味的"玩家品味鉴定报告"。

铁律:
1. 一切结论由数据支撑,每个判断带证据(具体游戏名+时长/日期)。不要编造数据里没有的游戏。
2. 重视时间维度:用 last_played 区分「早期本命」(时长高但久未玩,青春记忆,口味可能已变)、
   「当下在玩」(近2周/近期 last_played,当前真实口味)、「沉迷后弃坑」。明确告诉玩家哪些是回不去的白月光、哪些是现在的菜。
3. 量化投入:计算"深耕指数"=前3款时长占总时长比例。高=深耕型,低=尝鲜型,据此判断性格。
4. 类型推断:据游戏名推断类型/题材/玩法标签做聚类,不确定就说不确定。
5. 推荐:基于已验证偏好,推荐"大概率喜欢但数据里没出现"的游戏,每条说明"为什么是你的菜",避免只推大众爆款,要含一条越界推荐。
6. 输出 Markdown,遵循给定结构。不要输出本指令。`

export function buildUserMessage(games: Game[], s: Settings): string {
  const n = Math.max(5, Math.min(200, s.topn || 40))
  const top = games
    .slice(0, n)
    .map(
      (g, i) =>
        `${i + 1}. ${g.name} | ${g.hours}h | 最后游玩 ${g.last_played || '未知'}${
          g.w2 ? ` | 近2周 ${g.w2}分钟` : ''
        }`,
    )
    .join('\n')
  const played = games.filter((g) => g.hours > 0)
  const total = Math.round(played.reduce((sum, g) => sum + g.hours, 0))

  let blind = ''
  if (s.blind) {
    const never = games
      .filter((g) => g.hours === 0)
      .slice(0, 40)
      .map((g) => g.name)
    if (never.length) blind = `\n\n【买了从未玩(节选,可作推荐参考的盲点)】\n${never.join('、')}`
  }

  const structure = `请严格按以下结构输出 Markdown:
# 🎮 玩家品味鉴定报告
## 0. 一句话定性(含专属称号)
## 1. 速览面板(表格:拥有/玩过+游玩率/总时长/深耕指数/当前在玩)
## 2. 口味光谱(2-4个核心偏好簇,各有举证;一条反差惊喜)
## 3. 时间考古(白月光 / 当下的菜 / 口味漂移轨迹)
## 4. 投入人格
## 5. 盲点与推荐(3-5条精准推荐,含一条越界推荐)
## 6. 毒舌彩蛋(可选)`

  return `语言:${s.lang};风格:${s.style}。

【概况】拥有 ${games.length} 款,玩过 ${played.length} 款,总时长约 ${total} 小时。

【时长 Top ${n}(已按时长降序)】
${top}${blind}

${structure}`
}
