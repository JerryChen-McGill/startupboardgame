import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const dataPath = path.join(rootDirectory, "data", "game-data.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const approvedNetworkCards = {
  user: ["树精", "鼻涕虫", "小幽灵", "石头", "云团子"],
  need: ["刘海总是翘着", "喝水老是呛到", "每天八点会焦虑", "发呆收不回思绪", "一坐下就犯困"],
  product: ["月亮枕", "云口袋", "影子胶", "魔法豆", "飞天帽"],
  promotion: ["彩虹标语", "托个梦", "乌鸦广播", "漂流瓶", "流星快递"],
};

const relationTuples = [
  ["树精", "发呆收不回思绪", "user-need", "一站就是一天"],
  ["树精", "每天八点会焦虑", "user-need", "天黑前总担心掉叶子"],
  ["树精", "喝水老是呛到", "user-need", "下雨时一下喝太多"],
  ["鼻涕虫", "刘海总是翘着", "user-need", "头顶总黏着奇怪东西"],
  ["鼻涕虫", "喝水老是呛到", "user-need", "爬水洼时容易被呛"],
  ["鼻涕虫", "每天八点会焦虑", "user-need", "八点还没爬到家"],
  ["鼻涕虫", "一坐下就犯困", "user-need", "移动太慢，总像没睡醒"],
  ["小幽灵", "每天八点会焦虑", "user-need", "八点正好开始上班"],
  ["小幽灵", "发呆收不回思绪", "user-need", "思绪经常飘出身体"],
  ["小幽灵", "刘海总是翘着", "user-need", "没有重力压住头发"],
  ["小幽灵", "一坐下就犯困", "user-need", "白天总想睡觉"],
  ["石头", "刘海总是翘着", "user-need", "唯一一撮刘海偏偏压不平"],
  ["石头", "喝水老是呛到", "user-need", "嘴太小，雨太大"],
  ["石头", "发呆收不回思绪", "user-need", "一发呆就是几百年"],
  ["云团子", "刘海总是翘着", "user-need", "头发总被风吹起来"],
  ["云团子", "发呆收不回思绪", "user-need", "思绪像云一样飘散"],
  ["云团子", "一坐下就犯困", "user-need", "软绵绵的很容易睡着"],
  ["云团子", "每天八点会焦虑", "user-need", "担心八点被晚风吹散"],

  ["刘海总是翘着", "影子胶", "need-product", "固定刘海的影子"],
  ["刘海总是翘着", "云口袋", "need-product", "装一团云压住刘海"],
  ["刘海总是翘着", "魔法豆", "need-product", "长出一顶叶子帽"],
  ["刘海总是翘着", "飞天帽", "need-product", "直接把翘发藏起来"],
  ["喝水老是呛到", "月亮枕", "need-product", "躺着慢慢喝"],
  ["喝水老是呛到", "云口袋", "need-product", "先把水装进云里"],
  ["喝水老是呛到", "魔法豆", "need-product", "种出自动吸水藤"],
  ["每天八点会焦虑", "月亮枕", "need-product", "八点自动放松"],
  ["每天八点会焦虑", "云口袋", "need-product", "把焦虑暂时收进去"],
  ["每天八点会焦虑", "影子胶", "need-product", "把乱跑的影子粘回来"],
  ["每天八点会焦虑", "飞天帽", "need-product", "八点带人飞离烦恼"],
  ["发呆收不回思绪", "影子胶", "need-product", "粘住飘走的思绪"],
  ["发呆收不回思绪", "魔法豆", "need-product", "种出思绪回收藤"],
  ["发呆收不回思绪", "月亮枕", "need-product", "让脑袋安静下来"],
  ["发呆收不回思绪", "云口袋", "need-product", "把散乱想法装好"],
  ["一坐下就犯困", "月亮枕", "need-product", "把困意集中到晚上"],
  ["一坐下就犯困", "魔法豆", "need-product", "长出提神薄荷叶"],
  ["一坐下就犯困", "飞天帽", "need-product", "一困就把人升起来"],

  ["月亮枕", "托个梦", "product-promotion", "直接在梦里体验"],
  ["月亮枕", "漂流瓶", "product-promotion", "瓶里装一片月光"],
  ["月亮枕", "彩虹标语", "product-promotion", "夜空展示睡眠效果"],
  ["月亮枕", "流星快递", "product-promotion", "夜晚配送最合适"],
  ["云口袋", "彩虹标语", "product-promotion", "云朵自己拼广告词"],
  ["云口袋", "乌鸦广播", "product-promotion", "乌鸦背云到处播报"],
  ["云口袋", "漂流瓶", "product-promotion", "瓶里寄送迷你云"],
  ["云口袋", "流星快递", "product-promotion", "从天上直接送达"],
  ["影子胶", "乌鸦广播", "product-promotion", "神秘产品适合乌鸦传播"],
  ["影子胶", "托个梦", "product-promotion", "梦里演示影子被粘住"],
  ["影子胶", "漂流瓶", "product-promotion", "瓶里附一滴体验装"],
  ["魔法豆", "彩虹标语", "product-promotion", "豆藤长成巨大标语"],
  ["魔法豆", "托个梦", "product-promotion", "梦里先看到生长结果"],
  ["魔法豆", "乌鸦广播", "product-promotion", "乌鸦负责播种和宣传"],
  ["魔法豆", "流星快递", "product-promotion", "像种子一样撒向各地"],
  ["飞天帽", "彩虹标语", "product-promotion", "飞行轨迹写成标语"],
  ["飞天帽", "乌鸦广播", "product-promotion", "空中用户由乌鸦触达"],
  ["飞天帽", "流星快递", "product-promotion", "本身就适合高速配送"],

  ["彩虹标语", "树精", "user-promotion", "森林上空最容易看见"],
  ["彩虹标语", "石头", "user-promotion", "石头抬头就能看到"],
  ["彩虹标语", "鼻涕虫", "user-promotion", "爬得慢，可以看很久"],
  ["彩虹标语", "云团子", "user-promotion", "就在云边出现"],
  ["托个梦", "小幽灵", "user-promotion", "幽灵常在梦里活动"],
  ["托个梦", "树精", "user-promotion", "树精一睡就是很久"],
  ["托个梦", "石头", "user-promotion", "石头难得做梦，印象更深"],
  ["托个梦", "云团子", "user-promotion", "云团子常在梦里飘"],
  ["乌鸦广播", "树精", "user-promotion", "乌鸦经常停在树上"],
  ["乌鸦广播", "小幽灵", "user-promotion", "夜间广播正好覆盖幽灵"],
  ["乌鸦广播", "石头", "user-promotion", "声音比画面更容易注意"],
  ["乌鸦广播", "云团子", "user-promotion", "空中传播范围一致"],
  ["漂流瓶", "鼻涕虫", "user-promotion", "喜欢沿着湿地移动"],
  ["漂流瓶", "树精", "user-promotion", "河流经常经过森林"],
  ["漂流瓶", "小幽灵", "user-promotion", "神秘瓶子容易吸引幽灵"],
  ["流星快递", "云团子", "user-promotion", "都在天空活动"],
  ["流星快递", "小幽灵", "user-promotion", "夜间收到的概率最高"],
  ["流星快递", "石头", "user-promotion", "砸到附近就一定会注意"],
];

data.categoryMeta.user.color = "#73B97C";
data.categoryMeta.need.color = "#F0A15A";
data.categoryMeta.product.color = "#67A5D1";
data.categoryMeta.promotion.color = "#AC85D7";
data.categoryMeta.promotion.label = "传播";
data.categoryMeta.promotion.en = "SPREAD";

data.relationMeta = {
  "user-need": { label: "用户 × 需求", color: "#4A90E2" },
  "user-product": { label: "用户 × 产品", color: "#55A7A0" },
  "user-promotion": { label: "传播 × 用户", color: "#8B61C2" },
  "need-product": { label: "需求 × 产品", color: "#F39C3D" },
  "need-promotion": { label: "需求 × 传播", color: "#D47A9A" },
  "product-promotion": { label: "产品 × 传播", color: "#49A36B" },
};

Object.entries(data.cards).forEach(([type, cards]) => {
  const approvedNames = new Set(approvedNetworkCards[type]);
  cards.forEach((card) => {
    card.network = approvedNames.has(card.name);
  });
});

const cardByName = new Map(Object.values(data.cards).flat().map((card) => [card.name, card]));
data.relations = relationTuples.map(([sourceName, targetName, type, reason], index) => {
  const source = cardByName.get(sourceName);
  const target = cardByName.get(targetName);
  if (!source || !target) throw new Error(`Unknown approved card at tuple ${index + 1}: ${sourceName} / ${targetName}`);
  return { source: source.id, target: target.id, type, weight: 4, reason };
});

data.meta.networkCardCount = 20;
data.meta.relationCount = 72;
data.featuredCombos = {
  success: ["u-tree", "n-daze", "p-bean", "m-crow"],
  failure: ["u-tree", "n-hair", "p-pillow", "m-bottle"],
};

fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Synced ${data.relations.length} approved example relations.`);
