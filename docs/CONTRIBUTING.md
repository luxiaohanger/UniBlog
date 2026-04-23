# 贡献指南

感谢贡献！在提交代码之前请通读本文件。项目遵循「代码 + 文档 + 变更日志」三合一提交原则。

## 1. 工作流概览

```text
fork / branch ─► 本地改代码 ─► 同步更新文档 ─► 更新 CHANGELOG ─► Lint/Build ─► PR
```

1. 从 `main` 切出特性分支：`feat/<短描述>` / `fix/<短描述>` / `docs/<短描述>`。
2. 本地完成修改，按下文约定同步文档。
3. 执行 `npm run lint && npm run build` 保证通过。
4. 提交 PR，描述关联问题、变更动机与影响面。

## 2. 文档同步约定（**必须**）

> **一次提交同时包含代码与对应文档的改动。** 文档缺失将被 review 打回。

| 代码变更范围 | 需同步更新的文档 |
| --- | --- |
| 新增 / 修改 / 删除 API 路由或响应字段 | `apps/api/docs/API.md`、必要时 `docs/ARCHITECTURE.md` |
| 修改 `apps/api/prisma/schema.prisma` / 新建迁移 | `apps/api/docs/DATABASE.md`（模型说明 + 迁移列表） |
| 新增 / 调整前端页面 or 关键组件 | `apps/web/docs/FRONTEND.md`（目录结构 / 复用要点） |
| 修改开发脚本、环境变量、启动流程 | `README.md`、`scripts/README.md`、`docker/compose.yml`、`docker/README.md`、`apps/api/docs/DEVELOPMENT.md`、`apps/api/.env.example` |
| 架构级重构（模块拆分 / 新增包） | `docs/ARCHITECTURE.md`、`README.md`「项目结构」 |
| **任意用户可感知的变更** | `docs/CHANGELOG.md` 的 `[Unreleased]` 段落追加一条 |

### CHANGELOG 追加规则

在 [CHANGELOG.md](./CHANGELOG.md) 的 `[Unreleased]` 下，按类别追加一行（中文描述优先）：

```markdown
### Added
- 新增 `/posts/:id/bookmarks` 接口，支持收藏夹分组。(#PR编号)
```

发布版本时（维护者职责）：

1. 把 `[Unreleased]` 内容移入新版本标题下（如 `## [0.2.0] - YYYY-MM-DD`）。
2. 在文件底部追加对应 compare 链接。
3. 打 Git tag：`git tag v0.2.0 && git push --tags`。

## 3. Commit 规范（Conventional Commits）

格式：

```text
<type>(<scope>): <subject>

<body 可选>
<footer 可选>
```

| type | 场景 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 仅文档 |
| `refactor` | 重构（无行为变更） |
| `perf` | 性能优化 |
| `style` | 代码格式 / 样式 |
| `test` | 测试 |
| `build` | 构建 / 依赖 |
| `ci` | CI 配置 |
| `chore` | 其他维护 |

`scope` 建议使用 `api` / `web` / `db` / `scripts` / `docs`。示例：

```text
feat(api): 新增帖子分组接口 /posts/:id/bookmarks
fix(web): 修复消息页未读红点未清除的问题
docs(db): 补充 Friendship 状态机说明
```

## 4. 代码规范

- TypeScript 严格模式；禁止无理由 `any`。
- 错误响应统一 `{ error: '<snake_case_code>' }`。
- 前端样式优先内联 `style={{}}`，共享类写在 `apps/web/src/app/globals.css`；禁止 `*.module.css`。
- 所有异步交互必须处理 Loading / Error 态。
- 详细规范见 [.cursorrules](../.cursorrules)。

## 5. 提交前自检

```bash
npm run lint
npm run build
# 如改了 schema：
npm exec -w "@uniblog/api" prisma migrate dev --name <change>
```

Checklist：

- [ ] 代码可编译、lint 通过。
- [ ] 相关文档（`docs/`、`apps/*/docs/`、`scripts/README.md` 等）已同步（对照本页第 2 节表格）。
- [ ] `docs/CHANGELOG.md` 的 `[Unreleased]` 已追加条目。
- [ ] 新增 API：`apps/api/docs/API.md` 包含路径、参数、示例响应、错误码。
- [ ] 新增 Schema 字段 / 迁移：`apps/api/docs/DATABASE.md` 已更新，迁移目录已提交。
- [ ] 新增环境变量：`apps/api/.env.example` 与 `apps/api/docs/DEVELOPMENT.md` 都已更新。
- [ ] 敏感信息（真实 `.env`、密钥、上传文件）未被提交。

## 6. 分支与 PR

- 小功能直接提 PR；架构级改动先开 Issue 讨论。
- PR 描述模板（复制填写）：

```markdown
## 背景
<问题 / 需求链接>

## 变更
- [ ] 代码：...
- [ ] 文档：docs/xxx.md、docs/CHANGELOG.md
- [ ] 数据库迁移：有 / 无

## 测试
<如何验证>

## 风险与回滚
<是否影响历史数据、回滚步骤>
```

## 7. 行为准则

尊重每一位贡献者，技术讨论 > 人身攻击。遇分歧优先开 Issue 寻求共识。

—— Happy hacking!
