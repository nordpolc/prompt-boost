# prompt-boost · 提示词增强

输入框里一句话的草稿，按你选的人格补成一份能直接发给代理的任务：它猜你会补哪些话，替你说完，再按人格的专业口径检查一遍。

只补文本，不进模型训练，不联网（除了调用你自己 DSH 里配置的那个模型）。

---

## 装上

三种方式，选一种。前提：**DSH ≥ 0.2.2**，profile 为 `web`（`tui` 同理，把 `web` 换成 `tui`）。

### 1. 从 GitHub 装（推荐）

```bash
dsh plugin --profile web add github:nordpolc/prompt-boost
```

### 2. 从本地目录装

```bash
git clone https://github.com/nordpolc/prompt-boost.git
cd prompt-boost
dsh plugin --profile web add "file:$PWD"
./install.sh          # 校验装的是链接而不是副本，并提示重启
```

### 3. 手动接（不用 pnpm）

```bash
# 1) 把仓库放到任意位置，例如 ~/plugins/prompt-boost
# 2) 在 profile 的 package.json 里加依赖
#    "prompt-boost": "file:/home/you/plugins/prompt-boost"
# 3) 让 node_modules 指向源码，而不是复制一份
cd ~/.dsh/profiles/web/node_modules
ln -s /home/you/plugins/prompt-boost prompt-boost
# 4) 重启
systemctl --user restart dsh-web   # 或你的启动方式
```

装完**重启一次** DSH，界面里没有新按钮就强制刷新页面（Ctrl+Shift+R）。

---

## 用

工具行出现闪电按钮，右边一个 `⌄` 箭头。

- **点闪电**：把当前草稿按选中人格重写回填，原草稿进回退栈，点旁边的回退箭头即可还原（只保留最近一次）。
- **点 `⌄`**：选人格。选中的会记住，下次打开还是它。
- **任务约束**：菜单底部可编辑，只写这次任务的事实（预算、平台、字数、期限）。**不要写姓名、公司、岗位**——这些不会进成稿，也不需要。
- **工作区线索**：菜单里一行灰字。它读当前项目的 `package.json`、`git` 分支与未提交改动、顶层目录名，自动告诉模型这是什么栈，省得它猜。读不到就显示「没识别到项目」，不影响使用。

  自动识别取「最近有活动的那个会话工作区」。你有多个工作区同时开着时可能认错，用环境变量钉住：

  ```bash
  export DSH_PB_WORKSPACE=/path/to/your/project   # 写进启动脚本，重启 DSH
  ```
- **自定义**：选它时多一个输入框，写这次要它照做什么（例：只补数据和口径，别给排版建议）。

## 人格

| 人格 | 它替你补什么 |
|---|---|
| 自动 | 按草稿判断属于哪个职业 |
| 产品经理 | 用户场景、验收标准、不做什么、优先级 |
| 研发工程师 | 复现条件、接口边界、失败路径、怎么验证 |
| 运维工程师 | 影响面、备份、回滚、怎么确认生效 |
| 数据分析 | 口径、样本、异常值、结论能支撑什么决定 |
| 设计师 | 信息层级、状态、断点、可访问性 |
| 市场运营 | 目标人群、渠道、钩子、转化动作 |
| 内容编辑 | 读者、渠道、字数、必须出现与不能出现的事实 |
| 项目经理 | 里程碑、依赖、风险、谁验收 |
| 财务 | 口径、成本项、收益假设、敏感性 |
| 销售商务 | 客户画像、决策链、异议、下一步动作 |
| 法务合规 | 适用范围、责任边界、无效条款、留痕 |
| 培训教练 | 起点水平、可练的小步、检查点、怎么算学会 |
| 自定义 | 按你写的这次要求补 |

人格决定**专业口径与判断标准**，不是身份标签：成稿里不会出现「作为某某」，只写「你是一名……」这样的执行角色。

---

## 排错

**按钮还在，但没有 `⌄` 箭头**
装进 `node_modules` 的是副本，不是链接——源码改了它永远读旧的。

```bash
readlink -f ~/.dsh/profiles/web/node_modules/prompt-boost
# 应指向你的仓库目录；如果显示 drwx 的实体目录，说明是副本
```

修法：删掉副本，改成软链，再重启。

**点闪电报 401 / 无反应**
请求被 harness 拒绝，通常是没有登录或不是同一 origin。用 `https://…/hub/…` 那个入口打开 DSH，别直接开 127.0.0.1。

**报「模型未配置」**
插件用你 DSH 会话当前的默认模型。先在 DSH 里正常跑一轮对话，确认模型可用。

**结果像模板拼的**
把人格从「自动」换成具体职业；在任务约束里补一句这次任务的硬约束。人格越具体，补得越准。

---

## 开发

```bash
node .smoke.mjs        # 30 项：host 路由 + client 渲染，无需浏览器
```

四个文件各管一段：

| 文件 | 管什么 |
|---|---|
| `personas.js` | 人格名单与每席的四段 brief（读法/补/形/忌） |
| `index.js` | host：system prompt 拼装、模型调用、两条 HTTP 路由 |
| `workspace.js` | 工作区线索采集（package.json / git / 目录名），60 秒缓存 |
| `client.js` | 按钮、下拉菜单、localStorage、回退栈 |

加一个人格要动 `personas.js`（加席位）、`client.js`（列表加一行）、`locale/*.json`（描述清单）、`.smoke.mjs`（glyph 断言）。glyph 必须全局唯一。

## 许可

MIT。
