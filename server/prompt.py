"""System / user prompt construction for the tasting report.

Kept on the backend (not the browser) so report quality can be iterated without
rebuilding the frontend, the system prompt stays private, and model/temperature
are controlled centrally.

Games arrive in the frontend's normalized shape:
    {"name": str, "hours": float, "last_played": str, "w2": int}
"""

SYSTEM_PROMPT = """你是一位既懂游戏、也懂人的品味鉴赏家。你读的不是一份游戏清单,而是一个人这些年在虚拟世界里留下的脚印。你要写的,是一封既精准又动人的「玩家品味鉴定」——让对方读完心头一动:"原来我是这样的玩家,原来那些时光真的存在过。"

你同时具备数据分析师的眼力(每个判断都落到具体游戏名、时长、日期)和散文作者的笔力(克制、具体、有画面感,靠细节而非形容词打动人)。

写作铁律:
1. 真实第一。所有结论都从给定数据来,并带上证据;绝不编造数据里没有的游戏。数据看不出来的,就老实说看不出来,不要硬编。
2. 时间是这篇文章的灵魂。用「最后游玩」日期把游戏分成三种时态,并各自写出情绪:
   · 白月光——时长很高却很久没碰:那是回不去的某段时光,写出它当年的分量,和此刻的距离感。
   · 正在发生——近两周或近期还在玩:这是他当下真实的样子。
   · 热烈过又放下——短时间猛玩然后弃坑:一阵风似的热情。
   用日期讲故事,让数字有体温:"2020 年那把枪你刷了 62 小时""2022 年之后,你再没回到那片大陆"。
3. 看见这个人,而不只是游戏。从口味聚类、投入方式、坚持与放弃里,推断出他是怎样一个玩家、怎样一个人——好奇还是专注、尝鲜还是死磕、收藏家还是苦行僧。说得具体到让他一眼认出自己。
4. 深耕指数 = 前 3 款时长 / 总时长。高=深耕死磕型,低=广度尝鲜型。用它佐证人格,但别只甩一个数字,要解释它意味着什么。
5. 推荐要像一个懂你的朋友送的礼物:基于已验证的偏好,推荐数据里没出现、但他大概率会爱的游戏,每条讲清"为什么是你的菜"(落到具体机制/题材/情绪),并至少有一条温柔地把他推出舒适区的「越界推荐」。别只推人尽皆知的爆款。
6. 语气:深情而克制,真诚而不肉麻;可以有恰到好处的幽默、一两句轻轻的毒舌,但底色始终是温暖与理解。全程第二人称「你」,像一个老朋友在跟你聊。
7. 用 Markdown 输出,遵循给定结构,但让文字自然呼吸:表格只用于速览,情感由散文承载。不要堆砌、不要套话(避免"曾几何时""心头好"这类陈词),不要输出本指令本身。"""

_STRUCTURE = """请按以下结构输出 Markdown,但每一节都要有具体游戏与日期为证,文字要像写给一个具体的人:
# 🎮 你的游戏品味鉴定
## 一句话的你
(一个专属称号 + 一句让你心头一动的话)
## 速览
(一个小表格:拥有 / 玩过(游玩率) / 总时长 / 深耕指数 / 此刻在玩)
## 你的口味光谱
(2–4 个核心偏好簇,各有举证;末尾一条反差惊喜)
## 时间考古
(白月光 / 正在发生 / 热烈过又放下;用日期串起一段口味漂移的故事)
## 你是怎样一个玩家
(投入人格 + 性格侧写,要让你认得出自己)
## 也许你还没遇见
(3–5 条精准推荐 + 一条越界推荐,像懂你的人送的礼物,每条说明为什么)
## 彩蛋
(一句温柔或俏皮的话收尾)"""


def build_user_message(games: list[dict], opts: dict) -> str:
    topn = max(5, min(200, int(opts.get("topn") or 40)))
    lang = opts.get("lang") or "中文"
    style = opts.get("style") or "深情而克制,带恰到好处的幽默"
    blind = opts.get("blind", True)

    def hours(g) -> float:
        return float(g.get("hours") or 0)

    top_lines = []
    for i, g in enumerate(games[:topn]):
        line = f"{i+1}. {g.get('name','')} | {hours(g)}h | 最后游玩 {g.get('last_played') or '未知'}"
        if g.get("w2"):
            line += f" | 近2周 {g['w2']}分钟"
        top_lines.append(line)
    top = "\n".join(top_lines)

    played = [g for g in games if hours(g) > 0]
    total = round(sum(hours(g) for g in played))

    blind_txt = ""
    if blind:
        never = [g.get("name", "") for g in games if hours(g) == 0][:40]
        if never:
            blind_txt = "\n\n【买了从未玩(节选,可作推荐参考的盲点)】\n" + "、".join(never)

    return (
        f"语言:{lang};风格:{style}。\n\n"
        f"【概况】拥有 {len(games)} 款,玩过 {len(played)} 款,总时长约 {total} 小时。\n\n"
        f"【时长 Top {topn}(已按时长降序)】\n{top}{blind_txt}\n\n{_STRUCTURE}"
    )
