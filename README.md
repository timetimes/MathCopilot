# Math Copilot 🧮

**数学大模型约束工程软件** — AI 驱动的数学解题助手，支持分步提示、代码生成、几何可视化与交互式探索。

---

## ✨ 功能特性

| 特性 | 说明 |
|------|------|
| **🧠 两段式 AI 工作流** | 先给出分步解题思路，确认后再生成完整解答 |
| **📐 几何可视化** | 使用 JSXGraph 渲染几何图形，支持鼠标拖拽交互 |
| **📈 函数绘图** | 基于 Plotly 绘制数学函数曲线，支持缩放和平移 |
| **🔌 动态 Skill 系统** | 自动加载 `/backend/skills/` 下的 Skill 模块，支持运行时热加载 |
| **🤖 自动 Skill 生成** | LLM 可根据问题自动生成新的 Skill 代码文件 |
| **🛡️ 沙箱执行** | 安全执行 LLM 生成的数学代码，禁止危险操作 |
| **🔄 可视化交互回传** | 用户在画板上拖拽后，新参数回传后端重算 |

---

## 🏗️ 项目架构

```
MathCopilot/
├── backend/                      # FastAPI 后端
│   ├── main.py                   # 应用入口与路由
│   ├── config.py                 # 配置（环境变量）
│   ├── models.py                 # Pydantic 数据模型
│   ├── skills/                   # Skill 动态加载目录
│   │   ├── skill_loader.py       # Skill 加载器
│   │   ├── geometry_basics.py    # 几何基础（距离、中点）
│   │   ├── visualize_function.py # 函数绘图
│   │   ├── trigonometry.py       # 三角函数
│   │   └── algebra.py            # 代数运算
│   ├── agent/
│   │   └── workflow.py           # 两段式工作流（Hint + Solve）
│   └── sandbox/
│       └── executor.py           # 安全代码执行沙箱
├── frontend/                     # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # 主页面
│   │   │   ├── layout.tsx        # 布局
│   │   │   └── globals.css       # 全局样式
│   │   ├── components/
│   │   │   ├── Chat.tsx          # 聊天对话框
│   │   │   ├── Visualization.tsx # 可视化渲染（JSXGraph/Plotly）
│   │   │   └── VisualizationPanel.tsx # 可视化面板
│   │   ├── lib/
│   │   │   └── api.ts            # API 服务层
│   │   └── types.ts              # TypeScript 类型定义
│   ├── package.json
│   ├── next.config.js
│   └── tailwind.config.js
├── .gitignore
└── README.md
```

---

## 🚀 快速开始

### 环境要求

- Python ≥ 3.10
- Node.js ≥ 18
- （可选）OpenAI / Anthropic API Key

### 1. 后端启动

#### 方式 A：管理脚本（推荐）

```bash
# 安装依赖
pip install -r backend/requirements.txt

# 一键启动
python manage.py start
# 或: python manage.py start --port 9000
# 或: python manage.py start --auto-port   # 端口被占时自动切换
```

#### 方式 B：直接启动

```bash
cd backend
cp .env.example .env   # 编辑 .env 填入 API Key（可选）
python -m backend.main
# 或: uvicorn backend.main:app --reload
```

> **端口冲突**：脚本会自动检测端口占用。`python -m backend.main` 在 8000 被占时自动尝试 8001-8020。

#### 方式 C：Windows PowerShell

```powershell
.\start.ps1                 # 默认 8000
.\start.ps1 -Port 9000      # 指定端口
.\start.ps1 -AutoPort       # 自动切换
```

#### 方式 D：Docker

```bash
# 构建并启动
docker compose up -d

# 查看日志
docker compose logs -f

# 仅启动后端
docker compose up -d backend

# 停止
docker compose down
```

启动后：后端 **http://localhost:8000** | API 文档 **http://localhost:8000/docs**

### 2. 前端启动

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 **http://localhost:3000**。

---

## 📖 使用指南

### 基本工作流程

1. 在聊天框中输入数学/几何问题（如"计算点 A(1,2) 到 B(4,6) 的距离"）
2. AI 返回**分步解题思路**，引导学生自己思考
3. 点击 **【查看完整解答与可视化】** 按钮
4. AI 调用对应的 Skill 生成完整解答 + 可视化数据
5. 右侧面板显示几何图形或函数曲线
6. 如果是几何图形，**可以直接拖拽点**来探索不同位置

### 示例问题

```
- 计算点 A(1,2) 到点 B(4,6) 的距离
- 绘制函数 y = sin(x) 的图像
- 求两点 (0,0) 和 (4,3) 连线的中点坐标
- 解方程 x² - 3x + 2 = 0
- 验证 sin²30° + cos²30° = 1
- 求等差数列 1,3,5,7,... 的前 10 项和
```

---

## 🛠️ 管理脚本

项目自带 `manage.py` 统一管理工具：

| 命令 | 说明 |
|------|------|
| `python manage.py start` | 启动后端（支持 `--port` `--auto-port`） |
| `python manage.py test` | 运行测试（支持 `--coverage`） |
| `python manage.py check` | 环境检查 |
| `python manage.py list-skills` | 列出所有 Skill |
| `python manage.py shell` | 交互式 Python shell |

---

## 🐳 Docker 部署

```bash
# 完整环境（后端 + 前端）
docker compose up -d

# 仅后端
docker compose up -d backend

# 查看后端日志
docker compose logs -f backend

# 停止
docker compose down
```

构建说明见 `Dockerfile`（多阶段构建，镜像仅 ~200MB）。

---

## 🔧 配置说明

### 环境变量 (`.env`)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_PROVIDER` | `openai` | LLM 提供商: `openai` / `anthropic` / `mock` |
| `LLM_MODEL_NAME` | `gpt-4-turbo-preview` | 模型名称 |
| `OPENAI_API_KEY` | - | OpenAI API Key |
| `ANTHROPIC_API_KEY` | - | Anthropic API Key |
| `SANDBOX_MODE` | `subprocess` | 沙箱模式: `subprocess` / `docker` |
| `APP_PORT` | `8000` | 后端端口 |
| `APP_HOST` | `0.0.0.0` | 监听地址 |
| `DEBUG` | `true` | 调试模式（热重载） |

> **注意**：不配置 API Key 也可以运行，系统会使用内置的 **fallback 逻辑** 进行基础解答和可视化。

---

## 🧪 测试

### 后端测试

```bash
cd backend
pip install pytest pytest-asyncio httpx
pytest tests/ -v
```

### 测试覆盖

| 测试文件 | 覆盖内容 |
|----------|----------|
| `test_skills.py` | 所有 Skill 的功能正确性 |
| `test_sandbox.py` | 沙箱安全检查和代码执行 |
| `test_api.py` | 所有 API 端点的集成测试 |

---

## 🧩 Skill 系统

### 内置 Skills

| Skill | 说明 |
|-------|------|
| `geometry_basics` | 两点距离、中点坐标、线段可视化 |
| `visualize_function` | 数学函数曲线离散化 |
| `trigonometry` | 三角函数计算与恒等式验证 |
| `algebra` | 方程求解、表达式求值、等差/等比数列 |

### 开发新 Skill

每个 Skill 是一个 `.py` 文件，必须包含三个要素：

```python
NAME = "my_skill"
DESCRIPTION = "我的自定义 Skill"

def run(params: dict) -> dict:
    # params: 从 LLM 或前端传入的参数
    # return: 包含 type 字段的字典（用于可视化）
    return {"type": "function_plot", "points": [...], ...}
```

将文件放入 `backend/skills/` 目录，系统会自动加载。

### 自动生成 Skill

当 LLM 判断现有 Skills 无法解决用户问题时，会自动生成新的 Python 代码并写入 `backend/skills/` 目录。这通过 `/api/generate-skill` 端点实现。

---

## 📮 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 服务信息 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/skills` | 获取所有 Skills |
| POST | `/api/chat` | 聊天（两段式：hint / solve） |
| POST | `/api/solve` | 直接求解 |
| POST | `/api/generate-skill` | 创建新 Skill |
| POST | `/api/interact` | 可视化交互回传 |
| POST | `/api/execute` | 沙箱执行代码 |

---

## 🛡️ 安全设计

- **沙箱执行**：`executor.py` 使用 AST 静态分析禁止 `os`/`subprocess`/`sys` 等危险模块
- **受限内置函数**：沙箱中只暴露安全的 `builtins`（数学和基础操作）
- **代码扫描**：执行前扫描 `import` / `from ... import` / 危险内置函数
- **超时控制**：可通过 `SANDBOX_TIMEOUT` 配置执行超时

---

## 🧪 技术栈

| 层级 | 技术 |
|------|------|
| **前端框架** | Next.js 14 + React 18 |
| **语言** | TypeScript |
| **样式** | Tailwind CSS |
| **可视化** | JSXGraph (几何) + Plotly (函数) |
| **Markdown** | react-markdown + remark-gfm |
| **图标** | Lucide React |
| **后端框架** | FastAPI + Uvicorn |
| **AI 框架** | LangChain / LangGraph |
| **数学库** | SymPy, NumPy, SciPy |
| **测试** | Pytest + FastAPI TestClient |

---

## 📄 License

MIT License

---

<p align="center">Made with ❤️ for math education</p>
