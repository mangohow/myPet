# MC 桌宠

一个基于 Electron + Canvas 的透明悬浮桌面宠物系统，可通过 MCP 协议被 AI 助手实时控制。

## 功能

- 透明无边框窗口，悬浮于桌面
- 精灵图动画引擎，支持多组动作切换
- 双击桌宠循环切换动画
- 左键拖拽移动位置
- 鼠标穿透模式（中键或 `Ctrl+Shift+P` 切换）
- MCP SSE 服务器，供 AI 助手远程控制动画与气泡文字
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

生成目录到 `release/win-unpacked/`，手动打包为 zip 即可分发。解压后直接运行 `MC桌宠.exe`。

更换桌宠只需替换 `release/win-unpacked/resources/app/assets/` 下的文件。

---

## 使用说明

| 操作 | 功能 |
|------|------|
| 左键拖拽 | 移动桌宠位置 |
| 双击 | 依次循环所有动画 |
| 中键 / `Ctrl+Shift+P` | 切换鼠标穿透/交互模式 |

穿透模式下鼠标点击会穿透桌宠窗口，不影响操作桌面内容。

---

## 添加新宠物

将新宠物的精灵图和 `pet.json` 放入 `assets/` 目录，替换原有文件后重启即可。

### pet.json 字段说明

```jsonc
{
  "id": "pet-id",                    // 唯一标识
  "displayName": "宠物名称",          // 显示名称
  "description": "描述文字",
  "spritesheetPath": "spritesheet.webp",  // 精灵图文件名（放在 assets/ 下）
  "kind": "animal",                  // 种类
  "scale": 0.5,                      // 显示缩放比例（0.5 = 半大）
  "frameSize": {
    "width": 192,                    // 单帧宽度（px）
    "height": 208                    // 单帧高度（px）
  },
  "stateMapping": {                  // AI 状态 → 动画映射
    "idle": "idle",
    "thinking": "waiting",
    "in-progress": "running",
    "executing": "running",
    "done": "jumping",
    "error": "failed"
  },
  "animations": {
    "idle": {                        // 动画名称
      "frames": [0, 1, 2, 3, 4, 5], // 帧索引列表（从精灵图左上角按行编号）
      "frameDuration": 200           // 每帧停留时间（ms）
    }
    // ... 更多动画
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
| `set_pet_state` | 设置 AI 工作状态，自动映射到动画 | `state`: idle / thinking / in-progress / executing / done / error |
| `pet_say` | 宠物显示气泡文字 | `text`: 要说的话 |
| `get_pet_info` | 获取当前宠物信息 | 无参数，返回名称、可用动画列表、状态映射等 |

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
├── main.js               # Electron 主进程（窗口管理、IPC）
├── preload.js            # 预加载脚本（桥接主进程与渲染进程）
├── mcp-server.js         # MCP SSE 服务器
├── package.json
├── renderer/
│   ├── index.html        # 透明窗口页面
│   ├── pet.css           # 窗口样式
│   └── pet.js            # Canvas 动画引擎 + 交互控制
└── assets/
    ├── pet.json           # 宠物配置
    └── spritesheet.webp   # 精灵图
```
