# 棋境 · AI 棋室

一个本地运行的多棋类 AI 对弈应用，支持五子棋、中国象棋、围棋和国际象棋。

## 功能

- 人对 AI、AI 对 AI 两种模式
- 双 AI 独立配置 Base URL、API Key、模型与 API 类型
- 支持 `Responses API` 和 `Chat Completions`
- 本地规则引擎校验每一步，模型无法绕过合法性检查
- AI 非法着法自动纠正重试
- 右侧可切换棋谱与 AI 思考路径，实时显示接口返回的推理增量，并在落子后记录思考用时
- 后续回合会向每个 AI 提供它自己最近六次思考轨迹；AI A 与 AI B 的轨迹严格隔离
- 悔棋、重开、双 AI 暂停与继续
- 围棋默认使用标准 19×19 棋盘，并支持切换 9、13 路；包含提子、禁自杀、简单劫、停一手与面积计分
- 国际象棋支持易位、吃过路兵和四种升变选择
- 设置保存在当前浏览器的 `localStorage`

## 启动

```powershell
npm install
npm run dev
```

打开 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)。

生产构建与本地预览：

```powershell
npm run build
npm run preview
```

模型请求由 Vite 的本地 `/api/ai` 中间件转发，避免浏览器 CORS 限制。API Key 只从浏览器传给本地中间件，再转发到配置的上游地址；应用不会把 Key 写入服务端文件或日志。请只在可信电脑上使用“保存配置”。

AI 请求默认启用 SSE 流式输出，本地代理会将上游数据逐块转发给浏览器。若兼容服务忽略流式参数并返回普通 JSON，应用仍会回退到一次性解析；只有接口实际提供推理字段时，思考视图才会显示推理内容。

## API 配置

Base URL 通常填写到版本根路径，例如：

```text
https://api.openai.com/v1
```

应用会根据所选类型追加：

```text
/responses
/chat/completions
```

也可以直接填写完整端点；切换 API 类型时，已知的端点后缀会自动替换。

模型必须返回以下 JSON；额外 Markdown 包裹也能解析，但不推荐：

```json
{"move":"合法着法ID","reason":"简短理由"}
```

## 验证

```powershell
npm test
npm run build
npm run qa:visual
```

`qa:visual` 使用本机 Microsoft Edge 和模拟 SSE 响应，验证桌面/移动布局、四种棋盘交互、双 AI 独立 Key、两种 API 流式调用路径、实时思考状态与落子耗时。截图输出到 `outputs/`。

也可以通过临时环境变量运行真实上游回归测试。脚本会检查思考文本是否发生多次增量更新，但不会打印或持久化密钥：

```powershell
$env:QIJING_QA_BASE_URL = 'https://example.com/v1'
$env:QIJING_QA_API_KEY = 'your-key'
npm run qa:real
Remove-Item Env:QIJING_QA_BASE_URL, Env:QIJING_QA_API_KEY
```

## 规则核心

- 国际象棋：`chess.js`
- 中国象棋：`elephantops`
- 围棋：`@sabaki/go-board`
- 五子棋：`@algorithm.ts/gomoku`，外加统一状态适配

应用层保存不可变棋局快照，规则库负责合法着与终局判定；AI 只负责从合法着法集合中做选择。
