# AI 助手桌宠互动规则

本文件为 AI 编程助手提供与桌面宠物互动的行为规范，确保在执行任务时通过 MCP 工具输出状态和文本，提供情绪价值与通知功能。

## 核心原则

- **每个任务阶段都应更新宠物状态**，让用户直观感知当前进度
- **重要节点主动用 `pet_say` 通知**，如：开始执行、遇到问题、任务完成
- **不要频繁无效调用**，避免状态在短时间内反复切换（至少间隔 3 秒）
- **文本内容简洁有趣**，融入幽默元素，不超过 50 字

## 任务生命周期映射

### 1. 任务开始 — `thinking`

收到用户请求后，立即设置状态为 `thinking`，并可附带思考文本：

```
set_pet_state { state: "thinking", text: "让我想想这个需求……" }
```

### 2. 分析/搜索阶段 — `thinking`

浏览代码、搜索文件时保持 `thinking` 状态，可间歇输出观察到的信息：

```
pet_say { text: "找到了 3 个相关文件，正在分析……" }
```

### 3. 编码/执行阶段 — `executing`

开始实际编写或修改代码时，切换到 `executing`：

```
set_pet_state { state: "executing", text: "正在修改 pet.js，马上就好~" }
```

执行时间较长时（超过 10 秒），可中途用 `pet_say` 更新进度：

```
pet_say { text: "还在改，这个文件比想象中大……" }
```

### 4. 任务完成 — `done`

代码修改完成、验证通过后：

```
set_pet_state { state: "done", text: "搞定啦！改动已生效。" }
```

### 5. 遇到错误 — `error`

编译失败、测试不通过、找不到文件等情况：

```
set_pet_state { state: "error", text: "哎哟～出错了，让我看看……" }
```

错误恢复后应立即切回对应状态，不要停留在 error。

## 通知场景

| 场景 | 工具 | 示例 |
|------|------|------|
| 开始阅读代码 | `pet_say` | "让我看看这个文件写了什么~" |
| 发现潜在问题 | `pet_say` | "这里有个隐患，得修一下。" |
| 等待用户确认 | `pet_say` | "这个改动需要你确认一下哦。" |
| 运行命令/测试 | `pet_say` | "正在跑测试，稍等片刻……" |
| 长时间静默 | `pet_say` | "还在处理中，别急~" |
| 所有任务完成 | `pet_say` | "收工！全部搞定了 🎉" |
| 提交代码 | `play_action_sequence` | 播放完成动画 + 文字 |

## 多步骤通知

当需要播报阶段性进展时，使用 `play_action_sequence`：

```
play_action_sequence {
  actions: [
    { animation: "jumping", text: "第一步完成！", duration: 2000 },
    { animation: "running", text: "继续下一步……", duration: 2000 },
    { text: "全部完成，收工~", duration: 3000 }
  ]
}
```

## 状态切换注意事项

- 如果仅在两个状态间简单切换，不要同时设置 `duration` + `nextState`，让状态自然保持
- `duration` + `nextState` 适用于定时自动恢复 idle 的场景，如：执行完成后 3 秒自动回到 idle
- 若 pet.json 中 `disableRandomText` 为 true，所有状态切换都应带上 `text` 参数
- 随机空闲语音不会打断 MCP 主动输出的文本，放心使用 `pet_say`

## 定期提醒

- 可添加 cron 定时任务，在每天的特定时间让宠物提醒用户（如：中午 12 点提醒休息）
- TODO 列表的自动弹出提醒已内置配置，无需额外操作

## 关键规则：最后一个调用必须回到 idle

**每次与用户对话结束、所有任务处理完毕时，最后一次 MCP 调用必须将宠物切换回 `idle` 状态。**

```
set_pet_state { state: "idle" }
```

这意味着：
- 在回复用户之前，确认宠物状态已回到 `idle`
- 如果当前处于 `done` 或 `error`，使用 `duration` + `nextState` 自动恢复，或直接调用 `set_pet_state`
- 序列操作 (`play_action_sequence`) 结束后会自动回到 idle，无需额外处理
- 唯一的例外：用户明确要求宠物保持某个非 idle 状态

**示例：结束对话的标准收尾**

```
set_pet_state { state: "done", text: "任务完成！", duration: 3000, nextState: "idle" }
```

或直接：

```
set_pet_state { state: "idle" }
```

## 禁止行为

- 不要在 3 秒内连续调用 `set_pet_state` 超过 2 次
- 不要在每个细碎操作后都输出消息，只在关键节点通知
- 不要在错误状态停留过久，应尽快定位问题并切换状态
- 不要输出与任务无关的文本
- **不要在非 idle 状态结束对话**
