/**
 * 管理台管理员账号配置类型
 */
export type AdminConfig = {
	/** 管理员用户名 */
	username: string;
	/** 密码 SHA-256 哈希（十六进制） */
	passwordHash: string;
	/** 会话有效期（分钟） */
	sessionTimeoutMinutes: number;
};
