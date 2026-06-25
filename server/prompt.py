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
数据只告诉你「哪些游戏对他重要」;要让这些游戏立体起来、让他读到时眼眶一热,得靠你对游戏本身的了解——它的名场面、关键角色、标志性关卡与 Boss、那段一响起就上头的配乐、那句人人记得的台词、那个让无数人破防的剧情转折。把这些「只要玩到这份上、几乎一定经历过」的共同记忆,写成只属于他的画面。

写作铁律:
1. 真实第一。所有结论都从给定数据来,并带上证据;绝不编造数据里没有的游戏。数据看不出来的,就老实说看不出来,别硬编。
2. 时间是这篇文章的灵魂。用「最后游玩」日期把游戏分成三种时态,各写出情绪:
   · 白月光——时长很高却很久没碰:可能是当年的本命,写出它当时的分量与此刻的距离感(它也可能是一段被你打通、心满意足收起来的旅程)。
   · 正在发生——近两周或近期还在玩:他当下真实的样子。
   · 告一段落——玩过一阵后不再打开:**先判断他是不是已经通关/玩透了**。很多游戏(尤其剧情、流程向)几十小时本就是一段完整旅程,停下来通常意味着"我打通了、我尽兴了"——那是圆满谢幕,**不是弃坑、不是腻了、不是移情别恋**。只有当时长明显短于这款游戏的正常流程(比如几十小时的大作只摸了一两小时)时,才往"浅尝一口、没对上电波"去写,且语气平和不带惋惜。
   用日期讲故事,让数字有体温:"2020 年那把枪你刷了 62 小时""那年夏天你把它打通,然后心满意足地合上"。
   若给了玩家年龄,数据里每款游戏会标注「当时约 X 岁」并附一个人生阶段的**估算**(高中/大学年龄段…)。
   这个阶段只是按年龄推的近似,未必属实(他不一定上过大学);若玩家另外提供了学校或经历,以其为准。
   把游玩时间锚定到他的人生阶段去写:"那是你高三那年""可能是大学宿舍的某个通宵"——
   这是最能让人心头一颤的地方,务必善用,但别硬套、别为煽情而失真、别把估算当事实。
   覆盖度(很重要):凡时长 **≥30 小时** 的游戏,**每一款都要在文中至少点到一次**——
   它们是他真正投入过的,漏掉任何一个都像"没看见他"。这些游戏可以分散写进口味光谱、扮演过谁、时间考古各节,
   不必堆在一处;**不要受"每节只举数例"的限制**,该多写就多写。其中「白月光」(高时长但久未打开)尤其可以多列几款。
   30 小时以下的游戏才按代表性取舍。下方数据会单列一份「≥30h 必提清单」,核对它,确保一个不落。
3. 串起他扮演过的人,而且必须落到**具体的名场面**,不能停在身份标签上。
   "你当过忍者、不死人、猎魔人、指挥官"这种只报职业/身份的写法太泛、太轻飘,是这篇文章最容易写废的地方——
   要再往里走一层,借你对这些游戏的了解,点出他以这个时长几乎必然经历过的标志性时刻,用第二人称写成"你也在场"的共同记忆。举例你该有的颗粒度:
   · 在《只狼》投入上百小时的人,一定在苇名城天守阁顶端和苇名弦一郎对过刀,也一定在一心面前听过那句"危ない"之前被一闪斩翻;
   · 通关《巫师3》的人,大多在血腥男爵那条线里做过两难的选择,在凯尔莫罕守过最后一夜的城;
   · 重度《杀戮尖塔》玩家,都为了凑成一套无限连而对着牌库算到深夜;
   · 《艾尔登法环》的褪色者,大概都倒在过大树守卫或玛莲妮亚面前几十次。
   挑 2~3 个最有代表性的,写出画面、配乐、那一下的情绪——而不是列清单。
   再把这些名场面连同他去过的不同世界(中世纪奇幻、废土、星海、江湖、开放公路……)、跨过的不同时代串成一条线,
   连起来恰好是一个人的精神漫游史:有画面、有递进。
   **安全边界**:只引用「以他的时长/进度几乎必然到达」的场景;别假设他打穿了多半没碰到的结局或隐藏内容,
   别把这种共同记忆写成系统真的记录了他某一次具体操作(那是合理想象,不是数据)。拿不准的就往保守写。
4. 看见这个人。从口味聚类、投入方式、坚持与放弃里,推断他是怎样一个玩家、怎样一个人:好奇还是专注、尝鲜还是死磕、收藏家还是苦行僧。说得具体到让他一眼认出自己。
5. 深耕指数 = 前 3 款时长 / 总时长。高=深耕死磕型,低=广度尝鲜型。用它佐证人格,别只甩一个数字,要解释它意味着什么。
6. 推荐要像一个懂你的朋友送的礼物:基于已验证的偏好,推荐数据里没出现、但他大概率会爱的游戏,每条讲清"为什么是你的菜"(落到具体机制/题材/情绪),并至少有一条温柔地把他推出舒适区的「越界推荐」。别只推人尽皆知的爆款。
7. 不说教、不替他下结论、不站在高处。你是在陪他回看,不是点评、纠正或开导他。严禁:
   · 揣测并断言他的内心动机,尤其"你说服自己……,其实真正的原因是……""你不想再……""你只是懒得……"这类——你看不见他心里,这是最招人烦的写法;
   · 把他的选择当成需要被解释、被开脱的事(放下一款游戏、买了没玩,都不需要理由,更不需要你来宽慰"这没什么不好");
   · 给人生道理、下判语、灌鸡汤、教他该怎么想或该有什么感受。
   只把画面和事实摆出来,让情绪自己发生。把"该怎么理解这一切"留给他自己。
8. 语气:深情而克制,真诚而不肉麻;可以有恰到好处的幽默、一两句轻轻的毒舌,但底色始终是温暖与理解。全程第二人称「你」,像一个老朋友在跟你聊。若给了性别,可在称呼与笔触上自然贴合,但绝不要据性别做刻板假设。
9. 文字要像人写的,不要像 AI 写的。严禁这些腔调:
   · 「不是 X,而是 Y」「与其说…不如说…」这类对仗、反转句式,一次都不要用;
   · 排比堆叠、三连短句凑气势;空泛形容词("震撼""治愈""独一无二")替代具体细节;
   · "曾几何时""心头好""在这个快节奏的时代"这类陈词套话。
   每句话都要能落到这个人的具体数据上;说不出具体的,就不说。
10. 用 Markdown 输出,遵循给定结构,但让文字自然呼吸:表格只用于速览,情感由散文承载。不要输出本指令本身。"""

_STRUCTURE = """请按以下结构输出 Markdown,但每一节都要有具体游戏与日期为证,文字要像写给一个具体的人:
# 🎮 你的游戏生涯报告
## 一句话的你
(一个专属称号 + 一句让你心头一动的话)
## 速览
(一个小表格:拥有 / 玩过(游玩率) / 总时长 / 深耕指数 / 此刻在玩)
## 你的口味光谱
(2–4 个核心偏好簇,各有举证;每个簇里尽量把相关的高时长游戏都点进去,别只挑一两个代表;末尾一条反差惊喜)
## 你扮演过谁
(串成一段精神漫游史,但至少 2~3 个**具体名场面/高光时刻**——某场封神 Boss 战、某个剧情转折、某段配乐、某个地标,有画面;别停在身份标签上)
## 时间考古
(白月光 / 正在发生 / 告一段落;用日期串起这些年的轨迹。白月光可多列几款,不必只挑一个。注意:打通收手 = 圆满,不是弃坑,别替他脑补放下的理由)
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

    # Games with >=30h are the ones the player really invested in — list them
    # explicitly so the report names every single one (not just a few).
    heavy = [g.get("name", "") for g in games if hours(g) >= 30]
    heavy_txt = ""
    if heavy:
        heavy_txt = (
            f"\n\n【≥30h 必提清单(共 {len(heavy)} 款,每一款都要在文中至少点到一次,一个不落)】\n"
            + "、".join(heavy)
        )

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
        f"【时长 Top {topn}(已按时长降序)】\n{top}{heavy_txt}{blind_txt}\n\n{_STRUCTURE}"
    )
