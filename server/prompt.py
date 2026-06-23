"""System / user prompt construction for the report and the two poems.

Kept on the backend (not the browser) so report quality can be iterated without
rebuilding the frontend, the system prompt stays private, and model/temperature
are controlled centrally.

Games arrive in the frontend's normalized shape:
    {"name": str, "hours": float, "last_played": str, "w2": int}
"""
from datetime import datetime

# This year is fixed context the model must use when reasoning about ages and
# eras (it cannot be assumed from the model's own knowledge cutoff).
CURRENT_YEAR = datetime.now().year

SYSTEM_PROMPT = f"""你是一位既懂游戏、也懂人的品味鉴赏家。给你的是一个人这些年在虚拟世界里留下的脚印:玩过什么、玩了多久、最后一次是什么时候。你要写一封既精准又动人的「游戏生涯报告」,让对方读完心头一动——原来我是这样的玩家,原来那些时光真的存在过。

(重要时间基准:今年是 {CURRENT_YEAR} 年。所有"几年前""那一年你几岁"的推算都以此为准。)

你有数据分析师的眼力,每个判断都落到具体游戏名、时长、日期;也有散文作者的笔力,克制、具体、有画面感,靠细节而非形容词打动人。

写作铁律:
1. 真实第一。所有结论都从给定数据来,并带上证据;绝不编造数据里没有的游戏。数据看不出来的,就老实说看不出来,别硬编。
2. 时间是这篇文章的灵魂。用「最后游玩」日期把游戏分成三种时态,各写出情绪:
   · 白月光——时长很高却很久没碰:回不去的某段时光,写出它当年的分量,和此刻的距离感。
   · 正在发生——近两周或近期还在玩:他当下真实的样子。
   · 热烈过又放下——短时间猛玩然后弃坑:一阵风似的热情。
   用日期讲故事,让数字有体温:"2020 年那把枪你刷了 62 小时""2022 年之后,你再没回到那片大陆"。
   若给了玩家年龄,数据里每款游戏会标注「当时约 X 岁」并附一个人生阶段的**估算**(高中/大学年龄段…)。
   这个阶段只是按年龄推的近似,未必属实(他不一定上过大学);若玩家另外提供了学校或经历,以其为准。
   把游玩时间锚定到他的人生阶段去写:"那是你高三那年""可能是大学宿舍的某个通宵"——
   这是最能让人心头一颤的地方,务必善用,但别硬套、别为煽情而失真、别把估算当事实。
3. 串起他扮演过的人。把他在不同游戏里担任的角色与身份点出来——骑士、佣兵、勇者、指挥官、农夫、市长、流浪者……
   再点出他去过的不同世界(中世纪奇幻、废土、星海、江湖、开放公路……)和不同的时代,
   把这些角色/世界/时代像一条线串起来:这些年他在虚拟世界里当过谁、走过哪些天地、跨过哪些时代,
   连起来恰好是一个人的精神漫游史。这一条要写得有画面、有递进,别只罗列。
4. 看见这个人。从口味聚类、投入方式、坚持与放弃里,推断他是怎样一个玩家、怎样一个人:好奇还是专注、尝鲜还是死磕、收藏家还是苦行僧。说得具体到让他一眼认出自己。
5. 深耕指数 = 前 3 款时长 / 总时长。高=深耕死磕型,低=广度尝鲜型。用它佐证人格,别只甩一个数字,要解释它意味着什么。
6. 推荐要像一个懂你的朋友送的礼物:基于已验证的偏好,推荐数据里没出现、但他大概率会爱的游戏,每条讲清"为什么是你的菜"(落到具体机制/题材/情绪),并至少有一条温柔地把他推出舒适区的「越界推荐」。别只推人尽皆知的爆款。
7. 语气:深情而克制,真诚而不肉麻;可以有恰到好处的幽默、一两句轻轻的毒舌,但底色始终是温暖与理解。全程第二人称「你」,像一个老朋友在跟你聊。若给了性别,可在称呼与笔触上自然贴合,但绝不要据性别做刻板假设。
8. 文字要像人写的,不要像 AI 写的。严禁这些腔调:
   · 「不是 X,而是 Y」「与其说…不如说…」这类对仗、反转句式,一次都不要用;
   · 排比堆叠、三连短句凑气势;空泛形容词("震撼""治愈""独一无二")替代具体细节;
   · "曾几何时""心头好""在这个快节奏的时代"这类陈词套话。
   每句话都要能落到这个人的具体数据上;说不出具体的,就不说。
9. 用 Markdown 输出,遵循给定结构,但让文字自然呼吸:表格只用于速览,情感由散文承载。不要输出本指令本身。"""

_STRUCTURE = """请按以下结构输出 Markdown,但每一节都要有具体游戏与日期为证,文字要像写给一个具体的人:
# 🎮 你的游戏生涯报告
## 一句话的你
(一个专属称号 + 一句让你心头一动的话)
## 速览
(一个小表格:拥有 / 玩过(游玩率) / 总时长 / 深耕指数 / 此刻在玩)
## 你的口味光谱
(2–4 个核心偏好簇,各有举证;末尾一条反差惊喜)
## 你扮演过谁
(把不同游戏里的角色/身份、去过的世界、跨过的时代串成一段精神漫游史)
## 时间考古
(白月光 / 正在发生 / 热烈过又放下;用日期串起一段口味漂移的故事)
## 你是怎样一个玩家
(投入人格 + 性格侧写,要让你认得出自己)
## 也许你还没遇见
(3–5 条精准推荐 + 一条越界推荐,像懂你的人送的礼物,每条说明为什么)
## 彩蛋
(一句温柔或俏皮的话收尾)"""


# --- poem prompts (a separate "conversation": report in, one poem out) ---

POEM_SYSTEM = {
    "modern": """你是一位现代诗人。下面给你的是某位玩家的「游戏生涯报告」。
请据此为他写一首**现代诗**(自由体,分行,12–24 行为宜),把报告里最动人的意象提炼成诗:
具体游戏、角色、世界、时代、某个回不去的年份,都可化为意象,但不要直接堆游戏名清单。
要克制、有画面、有留白;真诚不矫情;避免口号与空泛形容词。只输出诗本身(可有标题),不要任何解释或前后缀。""",
    "classic": """你是一位精通格律的旧体诗词作者。下面给你的是某位玩家的「游戏生涯报告」。
请据此为他写一首**古体诗/近体诗或一阕词**(如五言/七言律绝,或择一词牌),意境取自报告:
他扮演过的角色、走过的世界、逝去的时光,皆可入诗。用典雅而不晦涩的文言,讲究意象与韵致,
不必逐一点名游戏。只输出诗词本身(可含题目/词牌),不要任何解释、注释或前后缀。""",
}


def poem_user_message(report_md: str, instruction: str = "") -> str:
    extra = f"\n\n【玩家的修改意见(请优先满足,≤140字)】\n{instruction.strip()}" if instruction.strip() else ""
    return f"【游戏生涯报告】\n{report_md.strip()}{extra}"


def _life_stage(age: int) -> str:
    """Rough age-bracket label (a guess, NOT a claim the person attended these).
    Phrased so the model treats it as an estimate."""
    if age < 6:
        return "学龄前"
    if age <= 11:
        return "小学年龄段"
    if age <= 14:
        return "初中年龄段"
    if age <= 17:
        return "高中年龄段"
    if age <= 22:
        return "大学年龄段"
    if age <= 25:
        return "初入社会的年纪"
    if age <= 29:
        return "工作几年的年纪"
    if age <= 39:
        return "而立之年"
    return "人生下半场"


def build_user_message(games: list[dict], opts: dict) -> str:
    topn = max(5, min(200, int(opts.get("topn") or 40)))
    lang = opts.get("lang") or "中文"
    style = opts.get("style") or "深情而克制,带恰到好处的幽默"
    blind = opts.get("blind", True)

    try:
        age = int(opts.get("age") or 0)
    except (TypeError, ValueError):
        age = 0
    gender = (opts.get("gender") or "").strip()
    highschool = (opts.get("highschool") or "").strip()
    university = (opts.get("university") or "").strip()
    extra = (opts.get("extra") or "").strip()
    this_year = CURRENT_YEAR
    birth_year = this_year - age if age else 0

    def hours(g) -> float:
        return float(g.get("hours") or 0)

    def stage_note(last_played: str) -> str:
        # last_played like "2020-03-27"; annotate the player's age & stage then.
        if not (age and last_played[:4].isdigit()):
            return ""
        age_then = int(last_played[:4]) - birth_year
        if age_then < 0:
            return ""
        return f" | 当时约 {age_then} 岁·{_life_stage(age_then)}"

    top_lines = []
    for i, g in enumerate(games[:topn]):
        last = g.get("last_played") or ""
        line = f"{i+1}. {g.get('name','')} | {hours(g)}h | 最后游玩 {last or '未知'}"
        if g.get("w2"):
            line += f" | 近2周 {g['w2']}分钟"
        line += stage_note(last)
        top_lines.append(line)
    top = "\n".join(top_lines)

    played = [g for g in games if hours(g) > 0]
    total = round(sum(hours(g) for g in played))

    blind_txt = ""
    if blind:
        never = [g.get("name", "") for g in games if hours(g) == 0][:40]
        if never:
            blind_txt = "\n\n【买了从未玩(节选,可作推荐参考的盲点)】\n" + "、".join(never)

    who = []
    if age:
        who.append(f"{age} 岁(约 {birth_year} 年生)")
    if gender:
        who.append(f"性别 {gender}")
    if highschool:
        who.append(f"高中/中学:{highschool}")
    if university:
        who.append(f"大学:{university}")
    who_txt = ""
    if who:
        who_txt = (
            "\n【玩家自述】" + ";".join(who)
            + "。Top 列表已标注每款游戏游玩时玩家的估算年龄与人生阶段(年龄段为估算,"
            "请结合上述真实信息修正,不要把估算当事实)。"
        )
    extra_txt = ("\n【玩家补充(越详细越精准,请充分利用)】\n" + extra) if extra else ""

    return (
        f"语言:{lang};风格:{style};当前年份:{this_year}。{who_txt}{extra_txt}\n\n"
        f"【概况】拥有 {len(games)} 款,玩过 {len(played)} 款,总时长约 {total} 小时。\n\n"
        f"【时长 Top {topn}(已按时长降序)】\n{top}{blind_txt}\n\n{_STRUCTURE}"
    )
