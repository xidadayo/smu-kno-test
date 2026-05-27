# Docker 部署说明

本项目可以通过 Docker 部署到极空间、NAS、Linux 服务器或其他电脑。部署后数据会保存在宿主机目录中，便于迁移和备份。

## 目录说明

- `data/`：系统数据，包括账号、知识库、学习记录、考试记录、违规记录。
- `uploads/`：上传的 Word、PDF、PPT 等原始文件。
- `.ocr-cache/`：PDF OCR 识别缓存和语言包缓存。

这三个目录已经在 `docker-compose.yml` 中挂载到容器外部，重启或升级镜像不会丢失。

## 快速启动

1. 复制环境变量文件：

```bash
cp .env.example .env
```

2. 编辑 `.env`，至少确认以下配置：

```bash
APP_PORT=3001
APP_ORIGIN=*
DEEPSEEK_API_KEY=你的DeepSeek密钥
DEEPSEEK_MODEL=deepseek-v4-pro
```

3. 构建并启动：

```bash
docker compose up -d --build
```

4. 浏览器访问：

```text
http://服务器IP:3001
```

如果部署在极空间，服务器 IP 就是极空间在局域网中的 IP 地址。

## 常用命令

查看运行状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f smu-kno-test
```

停止服务：

```bash
docker compose down
```

升级代码后重新构建：

```bash
docker compose up -d --build
```

## 迁移到其他电脑

在旧电脑或极空间上保留以下内容：

```text
data/
uploads/
.ocr-cache/
.env
```

把项目代码和这些目录复制到新电脑，然后执行：

```bash
docker compose up -d --build
```

## 知识库生成相关配置

```bash
PDF_OCR_LANG=eng
PDF_OCR_MAX_PAGES=24
PDF_OCR_WIDTH=2200
KNOWLEDGE_TEXT_LIMIT=80000
KNOWLEDGE_MAX_POINTS=120
KNOWLEDGE_MAX_QUESTIONS=120
```

如果上传文档很长，可以适当调高 `KNOWLEDGE_TEXT_LIMIT`、`KNOWLEDGE_MAX_POINTS` 和 `KNOWLEDGE_MAX_QUESTIONS`。调高后 AI 调用时间和费用也会增加。

## 极空间部署建议

在极空间 Docker 管理器中使用本项目目录作为 compose 项目目录，确保 `data/`、`uploads/`、`.ocr-cache/` 位于极空间可持久化的共享文件夹中。端口默认映射为 `3001:3001`，局域网访问地址为：

```text
http://极空间IP:3001
```

如果需要外网访问，建议通过极空间自带远程访问、反向代理或 HTTPS 网关暴露服务。
