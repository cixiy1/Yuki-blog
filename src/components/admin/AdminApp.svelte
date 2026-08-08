<script lang="ts">
	/**
	 * 管理台外壳：管理登录状态
	 * 未登录 → 显示登录表单；已登录 → 显示主面板
	 */
	import AdminLogin from "@/components/admin/AdminLogin.svelte";
	import AdminPanel from "@/components/admin/AdminPanel.svelte";
	import { isSessionValid } from "@/utils/admin/auth";
	import type { ConfigManifestEntry } from "@/utils/admin/config-manifest";
	import type { GitHubRepo } from "@/utils/admin/github";

	interface Props {
		manifest: ConfigManifestEntry[];
		initialConfigs: Record<string, unknown>;
		initialFileContents: Record<string, string>;
		repo: GitHubRepo;
		username: string;
		passwordHash: string;
		sessionTimeoutMinutes: number;
	}

	let {
		manifest,
		initialConfigs,
		initialFileContents,
		repo,
		username,
		passwordHash,
		sessionTimeoutMinutes,
	}: Props = $props();

	let authed = $state(false);

	// 纯客户端：挂载后检查会话（sessionStorage 只在浏览器存在，SSR 时跳过）
	import { onMount } from "svelte";
	onMount(() => {
		authed = isSessionValid();
	});

	function handleLoginSuccess() {
		authed = true;
	}

	function handleLogout() {
		authed = false;
	}
</script>

{#if authed}
	<AdminPanel
		{manifest}
		{initialConfigs}
		{initialFileContents}
		{repo}
		onLogout={handleLogout}
	/>
{:else}
	<AdminLogin
		{username}
		{passwordHash}
		{sessionTimeoutMinutes}
		onSuccess={handleLoginSuccess}
	/>
{/if}
