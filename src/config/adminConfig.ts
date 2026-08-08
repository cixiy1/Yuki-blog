import type { AdminConfig } from "@/types/adminConfig";

/**
 * 管理台管理员账号配置
 *
 * ⚠️ 安全说明：
 * - 只存 SHA-256 密码哈希，不存明文
 * - 默认账号：admin，默认密码：yuki2026（登录后请立即在管理台修改）
 * - 修改密码后此文件的 passwordHash 会被更新并提交到仓库
 */
export const adminConfig: AdminConfig = {
	// 管理员用户名
	username: "admin",
	// 密码 SHA-256 哈希（默认密码 yuki2026 的哈希）
	// 生成方式: echo -n "yuki2026" | sha256sum
	passwordHash: "289dc17b15c541bb3d5ce4f6d62187d4f8f1a1be2f9f47e1d7ae496a8cb4b30c",
	// 会话有效期（分钟）
	sessionTimeoutMinutes: 120,
};
