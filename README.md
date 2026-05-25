# 知识库学习与考核系统 MVP

基于《知识库学习与考核系统框架文档》搭建的可移植 MVP。项目包含管理员端、学习端、考试端、防离开记录、AI 分段与题库审核的基础闭环。

## 快速启动

```bash
npm install
npm run dev
```

- 前端: http://localhost:5173
- API: http://localhost:3001/api/health

默认账号:

- 管理员: `admin` / `admin123`
- 学员: `SMU1001` / `123456`

生产模式:

```bash
npm run build
npm run start:win
```

Docker:

```bash
docker compose up --build
```

Docker 启动后访问 http://localhost:3001。

## 已实现范围

- 管理员看板: 学员数、完成率、待考试、通过率、违规数。
- 学员管理: 单个创建、CSV 批量导入、账号状态与飞书 ID。
- 独立登录: 管理员和学员登录后进入不同工作台。
- 知识库上传: 上传文档后使用 DeepSeek V4 拆分 L1-L4 知识点；未配置 Key 时自动降级为本地模拟生成。
- AI 审核: DeepSeek 生成的知识点与题目进入待审核状态，管理员可通过。
- 学习计划: 学习对象、阶段、难度、推送周期与自动考试规则。
- 学习端: 阅读进度、有效学习时长、完成后生成考试任务。
- 考试端: 客观题自动评分，记录页面失焦、切屏、复制粘贴、右键等违规事件。
- 飞书推送: 当前为可审计的模拟推送记录；配置 `FEISHU_WEBHOOK_URL` 后可扩展真实发送。

## 数据与移植

项目默认使用 JSON 文件存储，便于拷贝迁移:

- 业务数据: `data/store.json`
- 上传文件: `uploads/`

迁移到其他电脑时复制整个仓库，执行 `npm install && npm run dev` 即可。若需要保留已有业务数据，一并复制 `data/` 和 `uploads/`。

## DeepSeek V4 配置

复制 `.env.example` 为 `.env`，并填写:

```bash
DEEPSEEK_API_KEY=你的DeepSeek Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
```

如果不填写 `DEEPSEEK_API_KEY`，系统仍可运行，并使用本地模拟生成待审核知识点和题目。

## 验证

```bash
npm run check
```

该命令会构建前端，并调用后端 smoke test 检查核心 API 是否可用。
