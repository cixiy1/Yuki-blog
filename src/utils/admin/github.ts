/**
 * GitHub API 提交工具
 *
 * 管理台保存配置时，通过 GitHub Contents API 更新 src/config/*.ts 文件，
 * 提交到 master 分支后，Cloudflare 的 Git 集成会自动重新构建部署。
 */

export type GitHubRepo = {
	owner: string;
	repo: string;
};

export type GitHubSaveResult = {
	success: boolean;
	message: string;
};

const API_BASE = "https://api.github.com";

/** 获取文件当前内容与 sha（用于后续更新） */
async function getFileInfo(
	token: string,
	repo: GitHubRepo,
	path: string,
): Promise<{ sha: string; content: string } | null> {
	const res = await fetch(`${API_BASE}/repos/${repo.owner}/${repo.repo}/contents/${path}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});
	if (!res.ok) {
		if (res.status === 404) return null;
		throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
	}
	const data = await res.json();
	// base64 -> UTF-8 文本
	const binary = atob(data.content);
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	const content = new TextDecoder().decode(bytes);
	return { sha: data.sha, content };
}

/**
 * 更新单个配置文件
 * @returns 提交结果
 */
export async function updateConfigFile(
	token: string,
	repo: GitHubRepo,
	filePath: string, // 例如 src/config/siteConfig.ts
	newContent: string,
	commitMessage: string,
): Promise<GitHubSaveResult> {
	try {
		const info = await getFileInfo(token, repo, filePath);
		const body: Record<string, unknown> = {
			message: commitMessage,
			content: btoa(
				String.fromCharCode(...new TextEncoder().encode(newContent)),
			),
			branch: "master",
		};
		if (info) body.sha = info.sha;

		const res = await fetch(
			`${API_BASE}/repos/${repo.owner}/${repo.repo}/contents/${filePath}`,
			{
				method: "PUT",
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			},
		);
		if (!res.ok) {
			const err = await res.text().catch(() => "");
			return {
				success: false,
				message: `提交失败 (${res.status}): ${err.slice(0, 300)}`,
			};
		}
		return { success: true, message: `已提交 ${filePath}` };
	} catch (e) {
		return {
			success: false,
			message: `提交异常: ${e instanceof Error ? e.message : String(e)}`,
		};
	}
}

/** 校验 GitHub Token 是否有效（调用用户信息接口） */
export async function verifyToken(token: string): Promise<boolean> {
	try {
		const res = await fetch(`${API_BASE}/user`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		return res.ok;
	} catch {
		return false;
	}
}
