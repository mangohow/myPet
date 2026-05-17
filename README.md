# MC 桌宠

一个基于 Electron + Canvas 的透明悬浮桌面宠物系统，可通过 MCP 协议被 AI 助手实时控制。

## 功能

- 透明无边框窗口，悬浮于桌面，始终置顶
- 精灵图动画引擎，支持多组动作切换
- 双击桌宠循环切换动画
- 左键拖拽移动位置
- 鼠标穿透模式（中键或 `Ctrl+Shift+P` 切换），智能捕获仅在有交互时接管鼠标
- MCP SSE 服务器，供 AI 助手远程控制动画、气泡文字、TODO 和定时任务
- AI 状态自动映射动画 + 随机文本气泡（多个蔡徐坤梗文案）
- 定时自动回 idle + 随机空闲语音
- TODO 清单面板（右侧弹出，复选框点击切换、双击删除，>4条滚动显示）
- 托盘「添加TODO」支持连续输入多条待办
- Cron 定时任务调度
- 系统托盘图标，右键菜单可添加 TODO、显示 TODO 或退出
- 锁屏/解锁后自动恢复置顶
- 支持任意精灵图，更换配置即可切换宠物

## 快速开始

```bash
# 安装依赖
npm install

# 启动
npm start
```

启动后可见透明窗口出现在屏幕左上角，宠物自动播放待机动画。MCP 服务器同时监听 `http://localhost:3099/sse`。

### 打包分发

```bash
npm run pack
```

生成目录到 `release/win-unpacked/`，手动打包为 zip 即可分发。
更换桌宠只需替换 `resources/pet.json` 和 `resources/spritesheet.webp`（与 `app.asar` 同级）。

---

## 使用说明

| 操作 | 功能 |
|------|------|
| 左键拖拽 | 移动桌宠位置（rAF 节流，流畅拖拽） |
| 双击 | 依次循环所有动画 |
| 中键 / `Ctrl+Shift+P` | 切换鼠标穿透/交互模式 |
| 系统托盘右键 → 添加TODO | 呼出带输入框的 TODO 面板，回车即可连续添加 |
| 系统托盘右键 → 显示 TODO List | 手动呼出 TODO 清单面板 |

穿透模式下透明区域鼠标点击会穿透桌宠窗口，不影响操作桌面内容。鼠标移到桌宠或 TODO 面板上时自动进入交互模式。

### TODO 面板

- 复选框点击：切换完成/未完成
- 列表项双击：删除该项
- 面板每 60 秒自动弹出一次，持续 12 秒后自动隐藏
- 超过 4 条时出现美观滚动条
- 数据持久化到 `todo.json`（开发模式在 `assets/`，打包后在用户数据目录）

---

## 添加新宠物

**开发模式**：替换 `assets/pet.json` 和 `assets/spritesheet.webp`，重启即可。
**打包后**：替换 `resources/pet.json` 和 `resources/spritesheet.webp`（与 `app.asar` 同级）。

### pet.json 字段说明

```jsonc
{
  "id": "pet-id",                        // 唯一标识
  "displayName": "宠物名称",              // 显示名称（托盘 tooltip）
  "description": "描述文字",
  "spritesheetPath": "spritesheet.webp", // 精灵图文件名（与 pet.json 同目录）
  "trayIconPath": "tray-icon.png",       // 托盘图标文件名（与 pet.json 同目录）
  "todoTitle": "代办项提醒",              // TODO 面板标题文字
  "kind": "animal",                      // 种类
  "port": 3099,                          // MCP SSE 服务器监听端口
  "disableRandomText": false,             // 是否禁用状态切换时的随机文本
  "idleSpeechInterval": [30, 60],        // 空闲时随机说话间隔范围（秒）
  "todoReminderIntervalMs": 60000,       // TODO 面板自动弹出间隔（ms）
  "todoDisplayDurationMs": 12000,        // TODO 面板显示持续时间（ms）
  "scale": 0.5,                          // 显示缩放比例（0.5 = 半大）
  "frameSize": {
    "width": 192,                        // 单帧宽度（px）
    "height": 208                        // 单帧高度（px）
  },
  "stateMapping": {                      // AI 状态 → 动画映射
    "idle": "idle",
    "thinking": "waiting",
    "in-progress": "running",
    "executing": "running",
    "done": "jumping",
    "error": "failed"
  },
  "animations": {
    "idle": {                            // 动画名称
      "frames": [0, 1, 2, 3, 4, 5],     // 帧索引列表（从精灵图左上角按行编号）
      "frameDuration": 200               // 每帧停留时间（ms）
    }
    // ... 更多动画
  },
  "stateTexts": {                        // 各状态随机文本（切换状态时自动显示）
    "idle": ["文本1", "文本2"],
    "thinking": ["..."],
    "executing": ["..."],
    "done": ["..."],
    "error": ["..."]
  }
}
```

### 精灵图要求

- 格式：PNG / WebP
- 每帧尺寸需一致，由 `frameSize` 定义
- 帧编号从左到右、从上到下依次排列（索引从 0 开始）
- 图片宽度 = 帧宽 × 每行帧数，高度 = 帧高 × 行数

---

## MCP 功能

桌宠通过 MCP SSE 协议暴露下列工具，可供 Claude Desktop、Continue、Cline 等支持 MCP 的 AI 助手调用。

### 工具列表

| 工具 | 说明 | 参数 |
|------|------|------|
| `set_pet_animation` | 播放指定动画 | `animation`: 动画名称（自动适配当前宠物） |
| `set_pet_state` | 设置 AI 工作状态，自动映射到动画 | `state`: idle/thinking/in-progress/executing/done/error，可选 `text`(气泡文字) + `duration`(ms) + `nextState` |
| `pet_say` | 宠物显示气泡文字 | `text`: 要说的话 |
| `play_action_sequence` | 播放动作与文字序列 | `actions`: 数组，每项含 `animation?` + `text?` + `duration?`(ms) |
| `get_pet_info` | 获取当前宠物信息 | 无参数，返回名称、可用动画、状态映射、端口配置等 |
| `list_scheduled_tasks` | 列出所有定时任务 | 无参数 |
| `add_scheduled_task` | 添加 cron 定时任务 | `cron`: cron 表达式, `action`: 要执行的动作, `name`(可选), `enabled`(可选) |
| `delete_scheduled_task` | 删除定时任务 | `id`: 任务 ID |
| `add_todo` | 添加 TODO 项 | `text`: TODO 内容 |
| `list_todos` | 查询 TODO 列表 | `filter`: all/pending/done（可选，默认 all） |
| `mark_todo_done` | 标记 TODO 完成 | `id`: TODO ID |
| `delete_todo` | 删除 TODO 项 | `id`: TODO ID |

### 配置 AI 助手

以 Claude Desktop 为例，在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "coding-pet": {
      "url": "http://localhost:3099/sse"
    }
  }
}
```

Continue、Cline 等工具同理，添加一个 url 类型为 `http://localhost:3099/sse` 的 MCP 服务器即可。

### 在 AI 提示词中使用

```
当处理任务时，用 set_pet_state 更新状态：
- 开始任务 → {"state": "thinking"}
- 执行中 → {"state": "executing"}
- 完成 → {"state": "done"}
- 错误 → {"state": "error"}

也可用 pet_say 让宠物说简短消息。
```

---

## 项目结构

```
myPet/
├── main.js               # Electron 主进程（窗口管理、IPC、托盘、动态缩放）
├── preload.js            # 预加载脚本（桥接主进程与渲染进程）
├── mcp-server.js         # MCP SSE 服务器（状态控制、TODO、Cron）
├── package.json
├── renderer/
│   ├── index.html        # 透明窗口页面
│   ├── pet.css           # 窗口样式（气泡、TODO 面板）
│   └── pet.js            # Canvas 动画引擎 + 智能捕获 + 交互
├── assets/               # 开发模式下的资源和数据目录
│   ├── pet.json          #   宠物配置
│   ├── spritesheet.webp  #   精灵图
│   ├── tray-icon.png     #   系统托盘图标
│   ├── todo.json         #   TODO 数据持久化
│   └── scheduled-tasks.json  # Cron 定时任务持久化
└── release/              # 打包输出
    └── win-unpacked/
        ├── MC桌宠.exe
        └── resources/
            ├── app.asar
            ├── pet.json          # ← 用户可编辑
            └── spritesheet.webp  # ← 用户可替换
```
