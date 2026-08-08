import type { AdminConfig } from "@/types/adminConfig";

/**
 * 管理台管理员账号配置
 *
 * ⚠️ 安全说明：
 * - 只存 SHA-256 密码哈希，不存明文
 * - 账号：Yukiho，密码：xiaoyi..（登录后请立即在管理台修改）
 * - 修改密码后此文件的 passwordHash 会被更新并提交到仓库
 */
export const adminConfig: AdminConfig = {
	// 管理员用户名
	username: "Yukiho",
	// 密码 SHA-256 哈希（密码 xiaoyi.. 的哈希）
	// 生成方式: echo -n "xiaoyi.." | sha256sum
	passwordHash: "8934f9d861740a48daf140e978e2542a12c5bdafd081aa72b44d28f3b5c647db",
	// 会话有效期（分钟）
	sessionTimeoutMinutes: 120,
};
