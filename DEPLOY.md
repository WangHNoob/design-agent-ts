# 游戏策划工坊 — 云服务器部署指南

## 一、服务器要求

| 项目 | 最低要求 |
|------|---------|
| CPU | 2 核 |
| 内存 | 4 GB |
| 磁盘 | 40 GB SSD |
| 系统 | Ubuntu 22.04 / CentOS 8+ |
| 软件 | Docker 24+、Docker Compose v2 |

---

## 二、安装 Docker

```bash
# Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 验证
docker --version
docker compose version
```

---

## 三、上传项目

```bash
# 在服务器上
mkdir -p /opt/game-designer
cd /opt/game-designer

# 方式1: 从本地上传 (在本地执行)
scp -r ./game-designer-ts user@your-server:/opt/game-designer/

# 方式2: Git clone
git clone https://github.com/your-org/game-designer-ts.git .
```

---

## 四、配置 .env（核心）

复制示例文件并编辑：

```bash
cp .env.example .env
nano .env
```

### 4.1 LLM 配置

```env
# API Key — 必填，从 LLM 供应商获取
LLM_API_KEY=sk-your-actual-api-key

# 供应商和模型
LLM_PROVIDER=anthropic          # openai / anthropic
LLM_MODEL=claude-sonnet-4-6     # 模型名称
LLM_BASE_URL=https://api.nagara.top  # API 代理地址（如使用代理）
```

### 4.2 认证与消息队列（强制）

```env
# 生成方式: openssl rand -hex 32
BETTER_AUTH_SECRET=a1b2c3d4e5f6...生成一个64位随机字符串

# 云部署时填你的对外可达域名（含协议）
BETTER_AUTH_BASE_URL=https://your-domain.com

# Redis Streams 执行队列必须开启
MQ_ENABLED=true
MQ_CONSUMER_GROUP=gd-workers
```

> **重要**: `BETTER_AUTH_SECRET` 绝不能使用默认值；缺少有效密钥、PostgreSQL、Redis 或 `MQ_ENABLED=true` 时进程会 fail-fast。
> 已退役开关：`USER_SYSTEM_ENABLED`、`USER_SYSTEM_REDIS_ENABLED`、`AUTO_INIT_SCHEMA`、`LTM_STORAGE_PATH` —— 不要再写进 `.env`。
> 观测 / Plan / 多 Agent / SSE / MCP 按需暴露 / 成本限流等开关以 `.env.example` 为准（如 `TRACING_*`、`PLAN_*`、`MULTI_AGENT_*`、`SSE_HEARTBEAT_MS`、`MCP_EXPOSE_MODE`），勿抄过期 blog 默认值。

### 4.3 Better Auth 对外地址

云部署请确保 `BETTER_AUTH_BASE_URL` 与浏览器访问域名一致；Docker Compose 内默认使用 `http://backend:3000` 供容器间回调。

### 4.4 PostgreSQL 数据库

```env
# Docker 内部连接（backend 容器使用，不需要改）
# POSTGRES_URL 在 docker-compose 中自动拼接

# 数据库凭据（docker-compose 创建数据库时使用）
POSTGRES_USER=game_designer
POSTGRES_PASSWORD=改成一个强密码!@#123
POSTGRES_DB=game_designer
POSTGRES_PORT=5432

# 备份保留天数
BACKUP_RETENTION=30
```

> **重要**: `POSTGRES_PASSWORD` 必须修改为强密码！

### 4.5 Redis

```env
# Docker 内部连接（backend 容器使用 redis://redis:6379/0）
# 本地调试用:
REDIS_URL=redis://localhost:6379/0
```

Redis 持久化已通过 `config/redis.conf` 配置好（AOF + RDB 双持久化），无需额外设置。

### 4.6 管理员邮箱域名

```env
# 逗号分隔的邮箱域名，这些域名的用户注册时自动获得 admin 角色
# 示例: "company.com" → user@company.com 注册后自动成为管理员
ADMIN_EMAIL_DOMAINS=game2sky.com
```

> 注意：这里填的是**域名**（如 `game2sky.com`），不是完整邮箱地址。

### 4.7 SMTP 邮件服务（验证码 + 邮箱验证）

```env
# 开启邮箱验证（注册后需验证邮箱才能登录）
EMAIL_VERIFICATION_ENABLED=true

# SMTP 服务器配置
SMTP_HOST=smtp.exmail.qq.com
SMTP_PORT=465
SMTP_USER=no-reply@game2sky.com
SMTP_PASSWORD=你的SMTP授权码
SMTP_FROM=no-reply@game2sky.com
```

#### 常见企业邮箱 SMTP 配置

| 邮箱服务 | SMTP_HOST | SMTP_PORT | 说明 |
|---------|-----------|-----------|------|
| 腾讯企业邮 | smtp.exmail.qq.com | 465 (SSL) | 推荐用465+SSL |
| 腾讯企业邮 | smtp.exmail.qq.com | 587 (TLS) | 备选 |
| 阿里企业邮 | smtp.mxhichina.com | 465 (SSL) | 推荐用465+SSL |
| 阿里企业邮 | smtp.mxhichina.com | 587 (TLS) | 备选 |
| Office 365 | smtp.office365.com | 587 (TLS) | 仅支持TLS |
| Gmail | smtp.gmail.com | 587 (TLS) | 需要应用专用密码 |
| QQ 邮箱 | smtp.qq.com | 465 (SSL) | 需要授权码 |

> **SMTP_PASSWORD** 不是邮箱登录密码，而是 SMTP 授权码：
> - 腾讯企业邮: 管理后台 → 邮箱设置 → 客户端专用密码
> - 阿里企业邮: 管理后台 → 账号安全 → 生成授权码
> - Gmail: Google 账号 → 安全 → 应用专用密码

### 4.8 Docker 端口映射

```env
# 对外暴露的端口（按需修改，避免冲突）
BACKEND_PORT=13000     # 后端 API
FRONTEND_PORT=3001     # 前端页面
REDIS_PORT=6379        # Redis（建议不对外暴露）
PROMETHEUS_PORT=9090   # Prometheus
ALERTMANAGER_PORT=9093 # Alertmanager
GRAFANA_PORT=3002      # Grafana
```

### 4.9 监控告警

```env
# Grafana 管理员
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=改成一个强密码
```

告警通知渠道配置在 `config/alertmanager.yml`，详见下方第五节。

---

## 五、配置告警通知

编辑 `config/alertmanager.yml`：

### 飞书 Webhook

```yaml
receivers:
  - name: "feishu"
    webhook_configs:
      - url: "https://open.feishu.cn/open-apis/bot/v2/hook/your-hook-id"
        send_resolved: true
route:
  receiver: "feishu"
```

### 钉钉 Webhook

```yaml
receivers:
  - name: "dingtalk"
    webhook_configs:
      - url: "http://localhost:5001/alerts"  # 需部署 dingtalk-webhook 适配器
        send_resolved: true
route:
  receiver: "dingtalk"
```

### 邮件告警

```yaml
receivers:
  - name: "email"
    email_configs:
      - to: "ops@game2sky.com"
        from: "alertmanager@game2sky.com"
        smarthost: "smtp.exmail.qq.com:465"
        auth_username: "alertmanager@game2sky.com"
        auth_password: "your-smtp-password"
        require_tls: false
route:
  receiver: "email"
```

---

## 六、构建与启动

```bash
cd /opt/game-designer

# 1. 安装依赖并编译（镜像 COPY 的是本地 dist/）
pnpm install
pnpm run build
cd frontend && pnpm install && pnpm run build && cd ..

# 2. 启动基础设施 + migrate + 应用
# postgres 使用 pgvector/pgvector:pg16；migrate 先于 backend
docker compose up -d --build

# 3. 查看日志
docker compose logs -f migrate backend
```

> 改完后端源码后必须重新 `pnpm run build` 并 `docker compose up -d --build backend`，否则容器会跑旧的 `dist/`。

### 验证服务

```bash
# 健康检查（源码接线正常时应含 postgres/redis）
curl http://localhost:13000/health

# 预期输出示例:
# {"status":"ok","checks":{"postgres":"ok","redis":"ok"}}
```

前端入口：http://localhost:3001 ；后端映射：http://localhost:13000 。

---

## 七、配置 HTTPS（推荐 Nginx 反向代理）

```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

编辑 `/etc/nginx/sites-available/game-designer`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://127.0.0.1:13000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 验证码端点
    location /auth/ {
        proxy_pass http://127.0.0.1:13000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 健康检查 & 监控
    location /health {
        proxy_pass http://127.0.0.1:13000;
    }

    location /metrics {
        proxy_pass http://127.0.0.1:13000;
    }
}

# Grafana（可选，独立域名或端口）
server {
    listen 80;
    server_name grafana.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/game-designer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 申请 SSL 证书
sudo certbot --nginx -d your-domain.com
```

申请 SSL 后，更新 `.env`：

```env
BETTER_AUTH_BASE_URL=https://your-domain.com
```

然后重启 backend：

```bash
docker compose restart backend
```

---

## 八、数据库备份与恢复

### 自动备份

Docker Compose 中已配置 `pg-backup` 服务，每天凌晨 2:00 自动备份，保留最近 N 天（由 `BACKUP_RETENTION` 控制）。

```bash
# 查看备份文件
docker exec gdt-pg-backup ls -lh /backups/

# 查看备份日志
docker exec gdt-pg-backup cat /backups/backup.log
```

### 手动恢复

```bash
# 1. 找到备份文件
docker exec gdt-pg-backup ls -lh /backups/

# 2. 解压并恢复
docker exec -i gdt-postgres psql -U game_designer -d game_designer < backup.sql

# 或从 gzip 恢复:
gunzip -c game_designer_20260610_020000.sql.gz | docker exec -i gdt-postgres psql -U game_designer -d game_designer
```

---

## 九、Grafana 监控

1. 访问 `http://your-server:3002`（或 `https://grafana.your-domain.com`）
2. 使用 `.env` 中的 `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` 登录
3. 添加数据源: Prometheus → URL: `http://prometheus:9090`
4. 导入仪表盘或创建自定义面板

### 关键监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| `app_postgres_up` | PostgreSQL 状态 | = 0 持续1分钟 |
| `app_redis_up` | Redis 状态 | = 0 持续1分钟 |
| `process_memory_heap_used_bytes` | 后端内存使用 | > 1GB |
| `process_uptime_seconds` | 后端运行时间 | 重启后归零 |

---

## 十、完整 .env 模板

```env
# ═══════════════════════════════════════════════════════════════
#  游戏策划工坊 — 生产环境配置模板
#  请根据实际情况修改所有标记 [必改] 的项
# ═══════════════════════════════════════════════════════════════

# ─── LLM [必改] ──────────────────────────────────────────────
LLM_API_KEY=sk-your-actual-api-key
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
LLM_BASE_URL=https://api.nagara.top

# ─── 框架 ────────────────────────────────────────────────────
AGENT_FRAMEWORK=langgraph

# ─── HITL ────────────────────────────────────────────────────
HITL_ENABLED=false
HITL_MAX_REVISIONS=10
HITL_TIMEOUT=300000
HITL_AUTO_CONTINUE=false

# ─── 知识库路径 ──────────────────────────────────────────────
KNOWLEDGE_WIKI_PATH=./knowledge/wiki
KNOWLEDGE_GRAPH_PATH=./knowledge/wiki

# ─── 联网搜索 ────────────────────────────────────────────────
TAVILY_ENABLED=false
TAVILY_API_KEY=tvly-your-api-key-here

# ─── 长期记忆 ────────────────────────────────────────────────
LTM_ENABLED=true
LTM_DEFAULT_NAMESPACE=global
LTM_MAX_CONTEXT_MEMORIES=10
LTM_MIN_IMPORTANCE=0.4
LTM_AUTO_EXTRACT=true
LTM_AUTO_PRUNE=true
LTM_MAX_AGE_MS=2592000000
LTM_PRUNE_BELOW_IMPORTANCE=0.3

# ─── 服务端口 ────────────────────────────────────────────────
PORT=4527

# ─── Agent 限制 ──────────────────────────────────────────────
SUB_AGENT_MAX_ITERATIONS=20
QUERY_AGENT_MAX_ITERATIONS=20
ITERATION_BUDGET_DEFAULT=25
CONTEXT_MAX_TOKENS=200000
CONTEXT_COMPRESSION_THRESHOLD=0.8
TAVILY_MAX_RESULTS=50
GREP_SEARCH_RESULT_LIMIT=20
WEB_SOURCE_RESULT_LIMIT=10
SESSION_LIST_LIMIT=500
MODEL_MAX_TOKENS=65536

# ─── 认证 [必改] ────────────────────────────────────────────
# Better Auth 密钥 [必改] 生成: openssl rand -hex 32
BETTER_AUTH_SECRET=替换为64位随机字符串

# Better Auth 基础URL [必改] 云部署填你的域名
BETTER_AUTH_BASE_URL=https://your-domain.com

MAX_CONCURRENT_PER_USER=3

# ─── PostgreSQL [必改] ──────────────────────────────────────
POSTGRES_URL=postgresql://game_designer:game_designer@localhost:5432/game_designer
POSTGRES_USER=game_designer
POSTGRES_PASSWORD=替换为强密码
POSTGRES_DB=game_designer
POSTGRES_PORT=5432

# 备份保留天数
BACKUP_RETENTION=30

# ─── Redis ───────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ─── 管理员邮箱域名 ─────────────────────────────────────────
# 逗号分隔，这些域名的用户注册后自动获得管理员角色
ADMIN_EMAIL_DOMAINS=game2sky.com

# ─── 邮箱验证 + SMTP [必改] ────────────────────────────────
EMAIL_VERIFICATION_ENABLED=true
SMTP_HOST=smtp.exmail.qq.com
SMTP_PORT=465
SMTP_USER=no-reply@game2sky.com
SMTP_PASSWORD=替换为SMTP授权码
SMTP_FROM=no-reply@game2sky.com

# ─── 消息队列（强制） ────────────────────────────────────────
MQ_ENABLED=true
MQ_CONSUMER_GROUP=gd-workers
MQ_POLL_INTERVAL_MS=100

# ─── Docker 端口映射 ────────────────────────────────────────
BACKEND_PORT=13000
FRONTEND_PORT=3001
REDIS_PORT=6379

# ─── 前端 ────────────────────────────────────────────────────
API_BASE_URL=http://localhost:13000

# ─── 监控 [必改] ────────────────────────────────────────────
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=替换为强密码
PROMETHEUS_PORT=9090
ALERTMANAGER_PORT=9093
GRAFANA_PORT=3002
```

---

## 十一、常用运维命令

```bash
# 查看所有服务状态
docker compose ps

# 查看后端日志
docker compose logs -f backend --tail 100

# 重启某个服务
docker compose restart backend

# 更新代码后重新部署
pnpm run build
cd frontend && pnpm run build && cd ..
docker compose up -d --build

# 清理旧镜像
docker system prune -f

# 查看 Redis 状态
docker exec gdt-redis redis-cli info persistence

# 手动触发数据库备份
docker exec gdt-pg-backup /usr/local/bin/pg-backup.sh

# 进入 PostgreSQL
docker exec -it gdt-postgres psql -U game_designer -d game_designer

# 查看用户列表
docker exec -it gdt-postgres psql -U game_designer -d game_designer -c 'SELECT id, email, name, role, "emailVerified" FROM "user"'
```

---

## 十二、安全检查清单

- [ ] `BETTER_AUTH_SECRET` 已替换为随机字符串
- [ ] `POSTGRES_PASSWORD` 已替换为强密码
- [ ] `SMTP_PASSWORD` 已填写 SMTP 授权码
- [ ] `GRAFANA_ADMIN_PASSWORD` 已替换为强密码
- [ ] Redis 端口未对外暴露（或已设置防火墙规则）
- [ ] PostgreSQL 端口未对外暴露
- [ ] 已配置 HTTPS（Nginx + Let's Encrypt）
- [ ] `BETTER_AUTH_BASE_URL` 已改为 `https://your-domain.com`
- [ ] 服务器防火墙仅开放 80/443 端口
- [ ] `.env` 文件权限设为 600: `chmod 600 .env`
