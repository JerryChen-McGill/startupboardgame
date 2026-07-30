# 迷你创业桌游

一款把用户、传播、需求与产品连接成完整创业项目的合作桌游原型。

玩家从用户、传播、需求和产品四类卡牌中选择方案，通过限时讨论、放置、连线和解释，把四张 3:4 卡牌按“用户、传播、需求、产品”的顺序拼成 2×2 项目面板。只检查四条相邻关系，不检查用户—产品、需求—传播两个对角组合。

## 网站内容

- 已达成共识的 V0.1 游戏规则
- 34 张现有卡牌名称与黑白印刷风格
- 按关系数量自动排序的卡牌库
- 34 张卡、133 条已确认关系组成的可编辑 SVG 关系网络
- 基于四条相邻关系的随机创业组合与融资实验台
- 统一尺寸、可叠合的十种轴对称几何接口

## 本地预览

这是一个无依赖静态网站。由于页面通过 `fetch` 读取 JSON，请使用本地 HTTP 服务器预览：

```powershell
python -m http.server 4173
```

也可以使用任何静态服务器，例如 VS Code Live Server。

## 检查

```powershell
node --test
node --check app.js
node scripts/generate-network.mjs
```

## 数据与关系图

主要内容都在 [`data/game-data.json`](./data/game-data.json)：

- `cards`：四类卡牌
- `relations`：卡牌之间的关系、权重与理由
- `relationMeta`：四种相邻关系类型的配色
- `accentPalette`：十种卡牌专属色

关系数据遵循两条约束：

- 只允许用户—需求、用户—传播、需求—产品、产品—传播四种相邻关系。
- 每条关系必须说明可感知的使用场景或明确的作用机制；不能只靠颜色、位置或模糊联想建立关系。

当前基准数据来自最新导出文件。所有卡牌与保留关系均默认确认；未确认关系不进入网站数据。

修改数据后，可重新生成独立 SVG：

```powershell
node scripts/generate-network.mjs
```

输出文件为 [`assets/relationship-network.svg`](./assets/relationship-network.svg)。

## GitHub Pages

推送到 `main` 分支后，`.github/workflows/deploy-pages.yml` 会自动部署网站。

线上地址：

<https://jerrychen-mcgill.github.io/startupboardgame/>
