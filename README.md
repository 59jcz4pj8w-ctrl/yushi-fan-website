# 关于勇志 - NCT WISH 粉丝网站

> 关于勇志（YUSHI / NCT WISH）的粉丝应援网站，包含首页、粉丝留言板、养奶茶猫小游戏、官博官抖图集、演出合集等版块。

## 🌟 部署

本项目部署在 [Vercel](https://vercel.com)，数据库使用 [GitHub Gist](https://gist.github.com)，永久免费、永久稳定。

## 🛠 技术栈

- **前端**：单文件 HTML + CSS + JavaScript
- **后端**：Vercel Serverless Functions
- **存储**：GitHub Gist（留言数据）

## 📁 项目结构

```
├── index.html              # 主页面（所有版块）
├── api/
│   └── messages.js         # 留言板 API（读写 Gist）
├── assets/                 # 图片资源
├── package.json
├── vercel.json
└── manifest.json
```

## 🔐 环境变量（Vercel 配置）

部署时需要在 Vercel 项目设置中配置：

| 变量名 | 说明 |
|--------|------|
| `GITHUB_TOKEN` | GitHub Personal Access Token，需要 `gist` 权限 |
| `GIST_ID` | 用于存储留言的 Gist ID |

## 📜 留言板说明

- 字数限制：50字
- 容量上限：1000条
- 限流：每 10 秒最多 1 条（防刷屏）
- 双重存储：localStorage 本地缓存 + Gist 云端
