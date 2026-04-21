# Changelog

本文件遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/) 约定，版本号遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)。

> **变更类别**：`Added`（新增）/ `Changed`（变更）/ `Deprecated`（弃用）/ `Removed`（移除）/ `Fixed`（修复）/ `Security`（安全）

## [Unreleased]

### Added
- 新增完整项目文档体系：`README.md`、`docs/ARCHITECTURE.md`、`docs/DEVELOPMENT.md`、`docs/API.md`、`docs/DATABASE.md`、`docs/FRONTEND.md`、`CONTRIBUTING.md`。
- 新增 `apps/api/.env.example` 作为后端环境变量模板。
- `.cursorrules` 增加「文档同步」条款：任何代码变更必须同步更新相关文档与 CHANGELOG。

### Changed
- `.gitignore` 完善忽略规则：新增 `.dev-logs/`、`*.tsbuildinfo`、`*.log`、`coverage/`、`.vscode/`、`.idea/`、`Thumbs.db` 等常见产物，并加入 `!.env.example` / `!apps/api/.env.example` 例外放行规则，确保环境变量模板可入库。

### Fixed
- 暂无。

---

## [0.1.0] - 2026-03-25

首个 MVP 版本（基于现有仓库功能整理，版本号为文档化时锚定）。

### Added
- **账户体系**：注册 / 登录（邮箱或用户名）/ 登出 / 刷新 Token / `/auth/me`；JWT Access + Refresh，bcrypt 密码哈希。
- **发帖**：文本 + 最多 3 个媒体（图片 / 视频，≤ 50 MB），使用 Multer 磁盘存储。
- **信息流**：公开圈子 Feed、我的帖子、他人作者页、我的收藏。
- **评论**：两级结构（层主 + 同层回复），新写入使用 `layerMainId`，兼容历史 `@用户名` 数据。
- **互动**：点赞 / 收藏 / 转发 / 状态查询（`/states`）。
- **好友**：申请 / 接受 / 拒绝 / 关系查询 / 联系人列表 / 解除好友（保留联系人与私信历史）。
- **私信**：好友间一对一消息，200 条历史上限。
- **通知中心**：聚合评论 / 回复 / 点赞 / 收藏 / 管理员删除事件。
- **管理员**：全局帖子置顶（上限 3）、作者置顶（每人上限 3）、删任意帖 / 评论层 / 单条评论。
- **本地编排**：`scripts/dev-up.sh` 一键启动 Postgres + API + Web，`scripts/dev-stop.sh` 停止。

### Security
- Refresh Token 仅以 SHA-256 哈希入库。
- 开发环境 CORS 默认放行 `http://localhost:*`，生产需通过 `CORS_ORIGIN` 限制。

[Unreleased]: https://example.com/uniblog/compare/v0.1.0...HEAD
[0.1.0]: https://example.com/uniblog/releases/tag/v0.1.0
