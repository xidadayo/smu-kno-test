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

系统不再内置演示学员、演示知识库、演示进度、演示考试结果或演示违规记录。学员账号、知识库、题库、学习记录、考试结果和违规记录都需要由真实操作产生。

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
- 数据维护: 管理员可对账号、文档、知识点、题目、计划、进度、考试、违规、推送、审计记录执行查看、编辑、删除。
- 独立登录: 管理员和学员登录后进入不同工作台。
- 知识库上传: 上传文档时分配到“全公司”或指定部门，支持 txt、md、csv、html、Word docx、PDF、PPT pptx 自动提取正文，随后使用 DeepSeek V4 拆分 L1-L4 知识点；未配置 Key 时自动降级为本地正文规则生成。
- AI 审核: DeepSeek 生成的知识点与题目进入待审核状态，管理员可通过。
- 学习计划: 学习对象、阶段、难度、推送周期与自动考试规则。
- 学习端: 分页学习知识点，完成一个进入下一个；每个阶段必须学完该阶段所有可见知识点后才会生成考试。
- 考试设置: 管理员可在学习计划中设置考试题目数量、及格分和考试时长。
- 考试结果: 后台监控页只展示真实考试提交数据，可查看题数、正确数、得分、结果、用时和提交时间。
- 组卷与计分: 阶段考试只从本阶段已审核知识点对应题目中抽取，成绩按百分制计算并保留原始分。
- 阶段流转: 考试未通过会重新推送本阶段学习计划；考试通过会自动推送学习计划中的下一阶段。
- 部门隔离: 学员只看到“全公司”和本人部门的已审核知识点，自动组卷也按部门过滤。
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

图片型 PDF 会自动走 OCR 兜底。可选配置：

```bash
PDF_OCR_LANG=eng
PDF_OCR_MAX_PAGES=24
PDF_OCR_WIDTH=2200
KNOWLEDGE_TEXT_LIMIT=80000
KNOWLEDGE_MAX_POINTS=120
KNOWLEDGE_MAX_QUESTIONS=120
```

## 验证

```bash
npm run check
```

该命令会构建前端，并调用后端 smoke test 检查核心 API 是否可用。

## Docker 部署

完整 Docker 部署说明见 [DOCKER_DEPLOY.md](./DOCKER_DEPLOY.md)。生产部署建议使用：

```bash
cp .env.example .env
docker compose up -d --build
```

部署时请持久化 `data/`、`uploads/`、`.ocr-cache/`，这样学员数据、上传文档和 OCR 缓存可以迁移到极空间或其他电脑。
