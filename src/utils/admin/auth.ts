/**
 * 管理台认证工具
 *
 * - SHA-256 密码哈希（使用 Web Crypto API）
 * - 会话管理（sessionStorage）
 */

const SESSION_KEY = "yuki-admin-session";

/** 计算字符串的 SHA-256 哈希（hex） */
export async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** 校验密码是否匹配哈希 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	const computed = await sha256Hex(password);
	return computed === hash;
}

/** 保存会话（带过期时间） */
export function saveSession(timeoutMinutes: number): void {
	const expiresAt = Date.now() + timeoutMinutes * 60 * 1000;
	sessionStorage.setItem(SESSION_KEY, String(expiresAt));
}

/** 清除会话 */
export function clearSession(): void {
	sessionStorage.removeItem(SESSION_KEY);
}

/** 检查会话是否有效 */
export function isSessionValid(): boolean {
	const raw = sessionStorage.getItem(SESSION_KEY);
	if (!raw) return false;
	const expiresAt = Number(raw);
	if (Number.isNaN(expiresAt)) return false;
	return Date.now() < expiresAt;
}
