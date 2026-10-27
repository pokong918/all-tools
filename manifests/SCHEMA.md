# 工具适配清单（Manifest）规范

每个工具一份 `manifests/tools/<id>.json`。宿主按此清单完成「下载 → 安装 → 启动 → 窗口内打开 → 停止」全流程，清单是工具适配的唯一契约。

## 字段说明

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `id` | ✅ | string | 工具唯一标识（同时是 `tools/` 下的目录名），kebab-case |
| `name` | ✅ | string | 显示名称 |
| `description` | ✅ | string | 原始（英文）简介 |
| `descriptionZh` |  | string | 中文简介 |
| `repo` | ✅ | string | `https://github.com/{owner}/{repo}` |
| `homepage` |  | string | 官网/在线版（仅展示） |
| `category` | ✅ | string | 一级分类（见下方预置分类） |
| `tags` |  | string[] | 标签：`免安装` `需 Node` `需 Python` `需 Docker` `中文界面` 等 |
| `stars` |  | number | 收录时 star 量级，仅展示参考 |
| `type` | ✅ | ToolType | `web-node` / `web-static` / `web-python` / `docker` / `cli` / `desktop`（M1 支持 web-node、web-static） |
| `runtime` |  | object | 环境要求，如 `{ "node": ">=18" }` |
| `install` |  | string | 安装命令（M1 对 web-node 固定 npm install，此字段为 M2 预留） |
| `start` | ✅ | string | 启动命令，支持 `{port}` 占位符（启动前替换为端口池实际分配端口） |
| `port` |  | object | `default`：期望端口（空闲则优先用）；`env`：端口环境变量名（默认 `PORT`） |
| `healthCheck` |  | object | `path`：探测路径（默认取 `openUrl`）；`timeoutMs`：就绪超时（默认 60000）。HTTP 状态 <500 视为就绪 |
| `openUrl` | ✅ | string | 就绪后在宿主窗口内打开的路径（以 `/` 开头），支持 `{port}` |
| `dataDirs` |  | string[] | 工具本地数据目录（相对工具目录），更新时保留、移除时提示 |
| `notes` |  | string | 备注（适配注意事项、脚本名待校准说明等） |

## 预置分类

图像与设计 / 开发工具 / AI 与大模型 / 文档与办公 / 下载与网络 / 安全与隐私 / 系统与硬件 / 数据与数据库 / 自动化与效率 / 文本与代码 / 生活实用 / 其他

## 端口参数化约定

- vite 类：`"npm run dev -- --port {port}"`
- Next.js 类：`"npm run dev -- -p {port}"`
- react-scripts 类：`"npm start"`（识别 `PORT` 环境变量，宿主自动注入）

三种形态均已覆盖主流 Web 工具；其他形态在 `notes` 中说明。

## 示例

```json
{
  "id": "2048",
  "name": "2048",
  "description": "The source code for 2048, a popular sliding tile puzzle game.",
  "descriptionZh": "经典数字拼图游戏 2048 的原始开源实现。",
  "repo": "https://github.com/gabrielecirulli/2048",
  "category": "生活实用",
  "tags": ["免安装"],
  "stars": 12000,
  "type": "web-static",
  "start": "#static",
  "openUrl": "/"
}
```

## 维护规则

1. 清单随本仓库版本管理；安装态由宿主首次启动从安装包资源拷贝、并按 FR-DIST-03 远程增量更新。
2. 上游脚本名/端口约定可能变化，**以实测为准，随测随改**——这正是清单外置的意义。
3. 新增清单需通过 `catalog.ts` 内置校验（必填字段 + repo 格式）。
