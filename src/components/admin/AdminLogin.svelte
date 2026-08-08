<script lang="ts">
	/**
	 * 管理台登录表单
	 * 校验用户名 + SHA-256 密码哈希，成功后建立会话
	 */
	import Icon from "@/components/common/Icon.svelte";
	import { saveSession, sha256Hex, verifyPassword } from "@/utils/admin/auth";

	interface Props {
		username: string;
		passwordHash: string;
		sessionTimeoutMinutes: number;
		onSuccess: () => void;
	}

	let { username, passwordHash, sessionTimeoutMinutes, onSuccess }: Props = $props();

	let inputUsername = $state("");
	let inputPassword = $state("");
	let error = $state("");
	let loading = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		if (!inputUsername || !inputPassword) {
			error = "请输入用户名和密码";
			return;
		}
		loading = true;
		try {
			const valid =
				inputUsername === username &&
				(await verifyPassword(inputPassword, passwordHash));
			if (valid) {
				saveSession(sessionTimeoutMinutes);
				onSuccess();
			} else {
				error = "用户名或密码错误";
			}
		} catch {
			error = "校验失败，请重试";
		} finally {
			loading = false;
		}
	}
</script>

<div class="admin-login-wrap">
	<form class="admin-login-card" onsubmit={handleSubmit}>
		<div class="admin-login-icon">
			<Icon icon="material-symbols:lock-outline-rounded" />
		</div>
		<h1 class="admin-login-title">博客管理台</h1>
		<p class="admin-login-sub">雪穗博客配置管理</p>

		<div class="admin-login-field">
			<label for="admin-username">用户名</label>
			<input
				id="admin-username"
				type="text"
				autocomplete="username"
				bind:value={inputUsername}
				placeholder="管理员用户名"
			/>
		</div>
		<div class="admin-login-field">
			<label for="admin-password">密码</label>
			<input
				id="admin-password"
				type="password"
				autocomplete="current-password"
				bind:value={inputPassword}
				placeholder="密码"
			/>
		</div>

		{#if error}
			<div class="admin-login-error">{error}</div>
		{/if}

		<button type="submit" class="admin-login-btn" disabled={loading}>
			{#if loading}
				<span class="admin-spinner"></span> 验证中...
			{:else}
				登 录
			{/if}
		</button>
	</form>
</div>

<style>
	.admin-login-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 1rem;
	}
	.admin-login-card {
		width: 100%;
		max-width: 22rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 2.5rem 2rem;
		background: var(--card-bg, rgba(255, 255, 255, 0.9));
		border-radius: var(--radius-large, 1rem);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
	}
	.admin-login-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.5rem;
		height: 3.5rem;
		margin: 0 auto;
		border-radius: 50%;
		background: color-mix(in srgb, var(--primary, #4c8dff) 15%, transparent);
		color: var(--primary, #4c8dff);
		font-size: 1.8rem;
	}
	.admin-login-title {
		margin: 0;
		text-align: center;
		font-size: 1.3rem;
		font-weight: 700;
	}
	.admin-login-sub {
		margin: -0.5rem 0 0.5rem;
		text-align: center;
		font-size: 0.85rem;
		opacity: 0.6;
	}
	.admin-login-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.admin-login-field label {
		font-size: 0.8rem;
		opacity: 0.75;
	}
	.admin-login-field input {
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line-divider, rgba(128, 128, 128, 0.3));
		border-radius: 0.5rem;
		background: var(--input-bg, rgba(128, 128, 128, 0.06));
		color: var(--text, inherit);
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.admin-login-field input:focus {
		border-color: var(--primary, #4c8dff);
	}
	.admin-login-error {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background: rgba(220, 60, 60, 0.12);
		color: #dc3c3c;
		font-size: 0.82rem;
	}
	.admin-login-btn {
		padding: 0.7rem;
		border: none;
		border-radius: 0.5rem;
		background: var(--primary, #4c8dff);
		color: #fff;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: filter 0.15s;
	}
	.admin-login-btn:hover {
		filter: brightness(1.1);
	}
	.admin-login-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.admin-spinner {
		display: inline-block;
		width: 0.85rem;
		height: 0.85rem;
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-top-color: #fff;
		border-radius: 50%;
		animation: admin-spin 0.8s linear infinite;
		vertical-align: middle;
		margin-right: 0.3rem;
	}
	@keyframes admin-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
