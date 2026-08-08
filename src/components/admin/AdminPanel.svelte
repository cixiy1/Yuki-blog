<script lang="ts">
	/**
	 * 管理台主面板
	 * 左侧：配置分组导航；右侧：编辑区 + 保存按钮
	 * 保存时通过 GitHub API 提交配置改动，触发 Cloudflare 自动重建
	 */
	import Icon from "@/components/common/Icon.svelte";
	import ConfigEditor from "@/components/admin/ConfigEditor.svelte";
	import { clearSession } from "@/utils/admin/auth";
	import { verifyToken, updateConfigFile, type GitHubRepo } from "@/utils/admin/github";
	import { patchConfigExport } from "@/utils/admin/serializer";
	import type { ConfigManifestEntry } from "@/utils/admin/config-manifest";

	interface Props {
		manifest: ConfigManifestEntry[];
		/** key -> 原始配置值（构建时注入） */
		initialConfigs: Record<string, unknown>;
		/** key -> 原始文件内容（构建时注入，用于补丁式更新） */
		initialFileContents: Record<string, string>;
		repo: GitHubRepo;
		onLogout: () => void;
	}

	let {
		manifest,
		initialConfigs,
		initialFileContents,
		repo,
		onLogout,
	}: Props = $props();

	// 当前编辑的配置副本
	// 注意：不能 structuredClone —— Astro 传进来的 props 是响应式代理对象，无法克隆
	// 配置数据本身是纯 JSON，用 JSON 序列化深拷贝最安全
	let configs = $state<Record<string, unknown>>(
		JSON.parse(JSON.stringify(initialConfigs)),
	);
	// 每个配置的修改标记
	let dirtyKeys = $state<Set<string>>(new Set());
	// 当前选中的配置 key
	let selectedKey = $state(manifest.find((m) => m.editable)?.key ?? "");
	// GitHub token（存 localStorage）
	let token = $state(localStorage.getItem("yuki-admin-token") ?? "");
	// 保存状态
	let saving = $state(false);
	let saveMessage = $state<{ ok: boolean; text: string } | null>(null);

	const editableManifest = $derived(manifest.filter((m) => m.editable));
	const selectedEntry = $derived(
		manifest.find((m) => m.key === selectedKey) ?? null,
	);
	const selectedValue = $derived(
		selectedKey ? (configs[selectedKey] ?? null) : null,
	);

	function onConfigChange(path: string, value: unknown) {
		// path 形如 "siteConfig.title" 或 "friendsConfig[0].title"
		const key = path.split(/[.[]/)[0];
		if (!key || !(key in configs)) return;
		// 深拷贝后修改路径上的值
		const clone = JSON.parse(JSON.stringify(configs[key]));
		setByPath(clone, path.slice(key.length).replace(/^\./, ""), value);
		configs = { ...configs, [key]: clone };
		dirtyKeys = new Set(dirtyKeys).add(key);
		saveMessage = null;
	}

	/** 按路径设置对象值：a.b[0].c */
	function setByPath(obj: unknown, path: string, value: unknown) {
		if (!path) return;
		const parts = path.match(/([^.[\]]+)|(\[\d+\])/g) ?? [];
		let cur: any = obj;
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i].replace(/^\[|\]$/g, "");
			cur = cur[part];
		}
		const last = parts[parts.length - 1].replace(/^\[|\]$/g, "");
		cur[last] = value;
	}

	function resetConfig(key: string) {
		configs = {
			...configs,
			[key]: JSON.parse(JSON.stringify(initialConfigs[key])),
		};
		const set = new Set(dirtyKeys);
		set.delete(key);
		dirtyKeys = set;
		saveMessage = null;
	}

	async function saveToken() {
		const t = token.trim();
		if (!t) return;
		saveMessage = null;
		if (await verifyToken(t)) {
			localStorage.setItem("yuki-admin-token", t);
			saveMessage = { ok: true, text: "Token 有效，已保存到本地浏览器" };
		} else {
			saveMessage = { ok: false, text: "Token 无效，请检查" };
		}
	}

	async function saveAll() {
		if (dirtyKeys.size === 0) {
			saveMessage = { ok: true, text: "没有需要保存的修改" };
			return;
		}
		const t = token.trim();
		if (!t) {
			saveMessage = { ok: false, text: "请先在「部署设置」中填入 GitHub Token" };
			return;
		}
		saving = true;
		saveMessage = null;
		const results: string[] = [];
		let failed = false;

		for (const key of dirtyKeys) {
			const entry = manifest.find((m) => m.key === key);
			if (!entry) continue;
			const original = initialFileContents[key];
			if (!original) {
				results.push(`⚠ ${key}: 无原始文件内容，跳过`);
				failed = true;
				continue;
			}
			const patched = patchConfigExport(original, key, configs[key]);
			if (patched === null) {
				results.push(`⚠ ${key}: 未找到导出块，跳过`);
				failed = true;
				continue;
			}
			const filePath = `src/config/${entry.file}`;
			const res = await updateConfigFile(
				t,
				repo,
				filePath,
				patched,
				`chore(admin): 更新 ${entry.label} 配置`,
			);
			if (res.success) {
				results.push(`✓ ${entry.label}`);
			} else {
				results.push(`✗ ${entry.label}: ${res.message}`);
				failed = true;
			}
		}

		if (!failed) {
			// 全部成功：清除修改标记
			dirtyKeys = new Set();
			// 更新初始内容（下一次保存基于新内容）
			for (const key of [...dirtyKeys]) {
				const entry = manifest.find((m) => m.key === key);
				if (entry) {
					const patched = patchConfigExport(
						initialFileContents[key],
						key,
						configs[key],
					);
					if (patched) initialFileContents[key] = patched;
				}
			}
			saveMessage = {
				ok: true,
				text: `✅ 已提交 ${results.length} 个配置，Cloudflare 正在自动重新构建（约 1-3 分钟生效）`,
			};
		} else {
			saveMessage = { ok: false, text: results.join("\n") };
		}
		saving = false;
	}

	function handleLogout() {
		clearSession();
		onLogout();
	}
</script>

<div class="admin-shell">
	<!-- 顶部栏 -->
	<header class="admin-header">
		<div class="admin-header-left">
			<span class="admin-logo">
				<Icon icon="material-symbols:settings-rounded" />
			</span>
			<span class="admin-title">Yuki Blog 管理台</span>
		</div>
		<div class="admin-header-right">
			<a class="admin-link" href="/" target="_blank">
				<Icon icon="material-symbols:open-in-new-rounded" /> 查看博客
			</a>
			<button type="button" class="admin-link admin-link-danger" onclick={handleLogout}>
				<Icon icon="material-symbols:logout-rounded" /> 退出
			</button>
		</div>
	</header>

	<div class="admin-body">
		<!-- 左侧导航 -->
		<nav class="admin-nav">
			<div class="admin-nav-section">配置</div>
			{#each editableManifest as entry (entry.key)}
				<button
					type="button"
					class="admin-nav-item"
					class:admin-nav-active={selectedKey === entry.key}
					onclick={() => (selectedKey = entry.key)}
				>
					<span class="admin-nav-item-label">{entry.label}</span>
					{#if dirtyKeys.has(entry.key)}
						<span class="admin-dot"></span>
					{/if}
				</button>
			{/each}

			<div class="admin-nav-section admin-nav-section-spaced">部署设置</div>
			<button
				type="button"
				class="admin-nav-item"
				class:admin-nav-active={selectedKey === "__settings"}
				onclick={() => (selectedKey = "__settings")}
			>
				<span class="admin-nav-item-label">GitHub 部署</span>
			</button>
		</nav>

		<!-- 右侧内容区 -->
		<main class="admin-content">
			{#if selectedKey === "__settings"}
				<!-- 部署设置 -->
				<div class="admin-card">
					<h2 class="admin-card-title">GitHub 部署设置</h2>
					<p class="admin-card-desc">
						保存配置时，通过 GitHub API 提交到仓库，Cloudflare 会自动重新构建部署。
						仓库：{repo.owner}/{repo.repo}（master 分支）
					</p>
					<div class="admin-form-row">
						<label for="admin-gh-token">GitHub Token</label>
						<input
							id="admin-gh-token"
							class="admin-input"
							type="password"
							bind:value={token}
							placeholder="ghp_... / github_pat_..."
						/>
						<p class="admin-form-hint">
							创建方式：GitHub → Settings → Developer settings → Personal access tokens
							→ 新建 Token，勾选 repo 权限。Token 只保存在你自己的浏览器 localStorage 中。
						</p>
					</div>
					<button type="button" class="admin-btn admin-btn-primary" onclick={saveToken}>
						验证并保存 Token
					</button>
				</div>
			{:else if selectedEntry}
				<div class="admin-card">
					<div class="admin-card-head">
						<div>
							<h2 class="admin-card-title">{selectedEntry.label}</h2>
							<p class="admin-card-desc">{selectedEntry.description}</p>
						</div>
						<div class="admin-card-actions">
							<button
								type="button"
								class="admin-btn"
								onclick={() => resetConfig(selectedEntry.key)}
								disabled={!dirtyKeys.has(selectedEntry.key)}
							>
								还原
							</button>
						</div>
					</div>

					<div class="admin-editor">
						<ConfigEditor
							value={selectedValue}
							path={selectedEntry.key}
							label={selectedEntry.label}
							onChange={onConfigChange}
						/>
					</div>
				</div>
			{:else}
				<div class="admin-empty-state">
					<Icon icon="material-symbols:info-outline-rounded" />
					<p>此配置结构复杂（含函数或特殊类型），建议手动编辑源码。</p>
				</div>
			{/if}

			{#if selectedKey !== "__settings"}
				<!-- 底部保存栏 -->
				<div class="admin-save-bar">
					<div class="admin-save-info">
						{#if dirtyKeys.size > 0}
							<span class="admin-dirty-text">
								有 {dirtyKeys.size} 个配置已修改，保存后自动提交并重建
							</span>
						{:else}
							<span class="admin-clean-text">暂无修改</span>
						{/if}
						{#if saveMessage}
							<span
								class="admin-save-msg"
								class:admin-save-msg-ok={saveMessage.ok}
								class:admin-save-msg-err={!saveMessage.ok}
							>
								{saveMessage.text}
							</span>
						{/if}
					</div>
					<button
						type="button"
						class="admin-btn admin-btn-primary admin-btn-lg"
						onclick={saveAll}
						disabled={saving || dirtyKeys.size === 0}
					>
						{#if saving}
							<span class="admin-spinner"></span> 提交中...
						{:else}
							<Icon icon="material-symbols:cloud-upload-rounded" /> 保存并发布
						{/if}
					</button>
				</div>
			{/if}
		</main>
	</div>
</div>

<style>
	.admin-shell {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: var(--page-bg, #f5f5f7);
	}
	.admin-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.8rem 1.5rem;
		background: var(--card-bg, #fff);
		border-bottom: 1px solid var(--line-divider, rgba(128, 128, 128, 0.2));
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.admin-header-left {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.admin-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--primary, #4c8dff) 15%, transparent);
		color: var(--primary, #4c8dff);
	}
	.admin-title {
		font-weight: 700;
		font-size: 1.05rem;
	}
	.admin-header-right {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.admin-link {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: var(--text, inherit);
		opacity: 0.8;
		text-decoration: none;
		cursor: pointer;
		background: none;
		border: none;
	}
	.admin-link:hover {
		opacity: 1;
		color: var(--primary, #4c8dff);
	}
	.admin-link-danger:hover {
		color: #dc3c3c;
	}
	.admin-body {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.admin-nav {
		width: 13rem;
		flex-shrink: 0;
		padding: 1rem 0.75rem;
		background: var(--card-bg, #fff);
		border-right: 1px solid var(--line-divider, rgba(128, 128, 128, 0.2));
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.admin-nav-section {
		padding: 0.5rem 0.6rem 0.25rem;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.5;
	}
	.admin-nav-section-spaced {
		margin-top: 1rem;
	}
	.admin-nav-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		padding: 0.5rem 0.6rem;
		border: none;
		border-radius: 0.45rem;
		background: transparent;
		color: var(--text, inherit);
		font-size: 0.88rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s;
	}
	.admin-nav-item:hover {
		background: rgba(128, 128, 128, 0.1);
	}
	.admin-nav-active {
		background: color-mix(in srgb, var(--primary, #4c8dff) 15%, transparent);
		color: var(--primary, #4c8dff);
		font-weight: 600;
	}
	.admin-nav-item-label {
		flex: 1;
	}
	.admin-dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--primary, #4c8dff);
		flex-shrink: 0;
	}
	.admin-content {
		flex: 1;
		min-width: 0;
		padding: 1.5rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.admin-card {
		background: var(--card-bg, #fff);
		border-radius: var(--radius-large, 1rem);
		padding: 1.5rem;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
	}
	.admin-card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	.admin-card-title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
	}
	.admin-card-desc {
		margin: 0.35rem 0 0;
		font-size: 0.85rem;
		opacity: 0.65;
	}
	.admin-card-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.admin-editor {
		/* 编辑器容器 */
	}
	.admin-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.45rem 1rem;
		border: 1px solid var(--line-divider, rgba(128, 128, 128, 0.3));
		border-radius: 0.5rem;
		background: transparent;
		color: var(--text, inherit);
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.admin-btn:hover {
		background: rgba(128, 128, 128, 0.08);
	}
	.admin-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.admin-btn-primary {
		background: var(--primary, #4c8dff);
		border-color: var(--primary, #4c8dff);
		color: #fff;
	}
	.admin-btn-primary:hover {
		filter: brightness(1.1);
		background: var(--primary, #4c8dff);
	}
	.admin-btn-lg {
		padding: 0.6rem 1.5rem;
		font-size: 0.95rem;
		font-weight: 600;
	}
	.admin-save-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 1.5rem;
		background: var(--card-bg, #fff);
		border-radius: var(--radius-large, 1rem);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
		position: sticky;
		bottom: 1rem;
	}
	.admin-save-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.admin-dirty-text {
		font-size: 0.82rem;
		color: var(--primary, #4c8dff);
		font-weight: 600;
	}
	.admin-clean-text {
		font-size: 0.82rem;
		opacity: 0.5;
	}
	.admin-save-msg {
		font-size: 0.8rem;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.admin-save-msg-ok {
		color: #22a55a;
	}
	.admin-save-msg-err {
		color: #dc3c3c;
	}
	.admin-spinner {
		display: inline-block;
		width: 0.85rem;
		height: 0.85rem;
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-top-color: #fff;
		border-radius: 50%;
		animation: admin-spin 0.8s linear infinite;
	}
	@keyframes admin-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.admin-form-row {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 1rem 0;
	}
	.admin-form-row label {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.admin-input {
		padding: 0.55rem 0.8rem;
		border: 1px solid var(--line-divider, rgba(128, 128, 128, 0.3));
		border-radius: 0.5rem;
		background: var(--input-bg, rgba(128, 128, 128, 0.06));
		color: var(--text, inherit);
		font-size: 0.88rem;
		outline: none;
	}
	.admin-input:focus {
		border-color: var(--primary, #4c8dff);
	}
	.admin-form-hint {
		font-size: 0.78rem;
		opacity: 0.6;
		line-height: 1.5;
	}
	.admin-empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 4rem 1rem;
		color: var(--text-secondary, rgba(128, 128, 128, 0.8));
		font-size: 2rem;
	}
	.admin-empty-state p {
		font-size: 0.9rem;
		margin: 0;
	}
</style>
