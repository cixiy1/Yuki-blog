<script lang="ts">
	/**
	 * 递归配置编辑器
	 * 根据 JSON 值的类型自动生成对应的表单控件：
	 * - 字符串：单行输入框（长文本自动用 textarea）
	 * - 数字：数字输入
	 * - 布尔：开关
	 * - 数组：可增删的列表，逐项递归
	 * - 对象：分组的嵌套字段
	 */
	import Icon from "@/components/common/Icon.svelte";
	import ConfigEditor from "./ConfigEditor.svelte";

	interface Props {
		value: unknown;
		path: string; // 例如 "siteConfig.title" 或 "friendsConfig[0].title"
		label?: string;
		description?: string;
		onChange: (path: string, value: unknown) => void;
		depth?: number;
	}

	let { value, path, label = "", description = "", onChange, depth = 0 }: Props = $props();

	const isObject = $derived(
		typeof value === "object" && value !== null && !Array.isArray(value),
	);
	const isArray = $derived(Array.isArray(value));
	const isString = $derived(typeof value === "string");
	const isNumber = $derived(typeof value === "number");
	const isBoolean = $derived(typeof value === "boolean");
	const isLongText = $derived(isString && (value as string).length > 60);

	function onStringInput(e: Event) {
		onChange(path, (e.target as HTMLInputElement | HTMLTextAreaElement).value);
	}
	function onNumberInput(e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		onChange(path, raw === "" ? 0 : Number(raw));
	}
	function onBooleanToggle() {
		onChange(path, !value);
	}
	function onKeyInput(e: Event, oldKey: string) {
		// 对象键名编辑（仅深度对象场景）
		const newKey = (e.target as HTMLInputElement).value;
		if (newKey === oldKey || !newKey) return;
		const obj = value as Record<string, unknown>;
		const entries = Object.entries(obj);
		const idx = entries.findIndex(([k]) => k === oldKey);
		if (idx === -1) return;
		entries[idx] = [newKey, obj[oldKey]];
		onChange(path, Object.fromEntries(entries));
	}
	function addArrayItem() {
		const arr = [...(value as unknown[])];
		arr.push("");
		onChange(path, arr);
	}
	function removeArrayItem(index: number) {
		const arr = [...(value as unknown[])];
		arr.splice(index, 1);
		onChange(path, arr);
	}
	function moveArrayItem(index: number, dir: -1 | 1) {
		const arr = [...(value as unknown[])];
		const target = index + dir;
		if (target < 0 || target >= arr.length) return;
		[arr[index], arr[target]] = [arr[target], arr[index]];
		onChange(path, arr);
	}
	function onArrayItemChange(index: number, newValue: unknown) {
		const arr = [...(value as unknown[])];
		arr[index] = newValue;
		onChange(path, arr);
	}
	function onArrayItemLabelChange(index: number, newLabel: unknown) {
		onArrayItemChange(index, newLabel);
	}
</script>

{#if isObject}
	<div class="admin-field-group" class:admin-nested={depth > 0}>
		{#if label}
			<div class="admin-group-header">
				<span class="admin-group-label">{label}</span>
				{#if description}
					<span class="admin-group-desc">{description}</span>
				{/if}
			</div>
		{/if}
		<div class="admin-group-body">
			{#each Object.entries(value as Record<string, unknown>) as [key, val], i (key)}
				<div class="admin-row">
					<div class="admin-row-label">
						<span class="admin-key">{key}</span>
					</div>
					<div class="admin-row-control">
						<ConfigEditor
							value={val}
							path={`${path}.${key}`}
							onChange={onChange}
							depth={depth + 1}
						/>
					</div>
				</div>
			{/each}
		</div>
	</div>
{:else if isArray}
	<div class="admin-field-group">
		{#if label}
			<div class="admin-group-header">
				<span class="admin-group-label">{label}</span>
				<button
					type="button"
					class="admin-btn admin-btn-small admin-btn-primary"
					onclick={addArrayItem}
				>
					<Icon icon="material-symbols:add-rounded" /> 添加
				</button>
			</div>
		{/if}
		<div class="admin-array-list">
			{#each (value as unknown[]) as item, i (i)}
				<div class="admin-array-item">
					<div class="admin-array-item-actions">
						<button
							type="button"
							class="admin-icon-btn"
							title="上移"
							onclick={() => moveArrayItem(i, -1)}
						>
							<Icon icon="material-symbols:arrow-upward-rounded" />
						</button>
						<button
							type="button"
							class="admin-icon-btn"
							title="下移"
							onclick={() => moveArrayItem(i, 1)}
						>
							<Icon icon="material-symbols:arrow-downward-rounded" />
						</button>
						<button
							type="button"
							class="admin-icon-btn admin-icon-btn-danger"
							title="删除"
							onclick={() => removeArrayItem(i)}
						>
							<Icon icon="material-symbols:delete-rounded" />
						</button>
					</div>
					<div class="admin-array-item-body">
						<ConfigEditor
							value={item}
							path={`${path}[${i}]`}
							label={`第 ${i + 1} 项`}
							onChange={onArrayItemChange}
							depth={depth + 1}
						/>
					</div>
				</div>
			{/each}
		</div>
	</div>
{:else if isBoolean}
	<button
		type="button"
		class="admin-toggle"
		class:admin-toggle-on={value === true}
		role="switch"
		aria-checked={value === true}
		onclick={onBooleanToggle}
	>
		<span class="admin-toggle-thumb"></span>
		<span class="admin-toggle-text">{value === true ? "开" : "关"}</span>
	</button>
{:else if isString}
	{#if isLongText}
		<textarea
			class="admin-input admin-textarea"
			value={value as string}
			rows={Math.min(6, Math.max(2, Math.ceil((value as string).length / 40)))}
			oninput={onStringInput}
		></textarea>
	{:else}
		<input
			class="admin-input"
			type="text"
			value={value as string}
			oninput={onStringInput}
		/>
	{/if}
{:else if isNumber}
	<input
		class="admin-input admin-input-number"
		type="number"
		step="any"
		value={value as number}
		oninput={onNumberInput}
	/>
{:else}
	<span class="admin-empty">（不支持的值类型）</span>
{/if}

<style>
	.admin-field-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
	}
	.admin-nested {
		padding-left: 0.75rem;
		border-left: 2px solid var(--line-divider, rgba(128, 128, 128, 0.25));
	}
	.admin-group-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.admin-group-label {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--text, inherit);
	}
	.admin-group-desc {
		font-size: 0.8rem;
		color: var(--text-secondary, rgba(128, 128, 128, 0.8));
	}
	.admin-group-body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.admin-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		padding: 0.25rem 0;
	}
	.admin-row-label {
		flex: 0 0 14rem;
		min-width: 8rem;
		padding-top: 0.4rem;
	}
	.admin-key {
		font-family: var(--font-jetbrains-mono, ui-monospace, monospace);
		font-size: 0.78rem;
		color: var(--primary, #4c8dff);
		word-break: break-all;
	}
	.admin-row-control {
		flex: 1;
		min-width: 0;
	}
	.admin-input {
		width: 100%;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--line-divider, rgba(128, 128, 128, 0.3));
		border-radius: 0.5rem;
		background: var(--input-bg, rgba(128, 128, 128, 0.08));
		color: var(--text, inherit);
		font-size: 0.85rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.admin-input:focus {
		border-color: var(--primary, #4c8dff);
	}
	.admin-input-number {
		width: 8rem;
	}
	.admin-textarea {
		resize: vertical;
		line-height: 1.4;
	}
	.admin-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--line-divider, rgba(128, 128, 128, 0.3));
		border-radius: 999px;
		background: transparent;
		cursor: pointer;
		transition: all 0.15s;
	}
	.admin-toggle-thumb {
		width: 1.4rem;
		height: 0.85rem;
		border-radius: 999px;
		background: rgba(128, 128, 128, 0.35);
		position: relative;
		transition: background 0.15s;
	}
	.admin-toggle-thumb::after {
		content: "";
		position: absolute;
		top: 50%;
		left: 2px;
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 50%;
		background: #fff;
		transform: translateY(-50%);
		transition: left 0.15s;
	}
	.admin-toggle-on .admin-toggle-thumb {
		background: var(--primary, #4c8dff);
	}
	.admin-toggle-on .admin-toggle-thumb::after {
		left: calc(100% - 0.65rem - 2px);
	}
	.admin-toggle-text {
		font-size: 0.8rem;
		color: var(--text, inherit);
	}
	.admin-array-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.admin-array-item {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		border: 1px solid var(--line-divider, rgba(128, 128, 128, 0.2));
		border-radius: 0.5rem;
		background: rgba(128, 128, 128, 0.04);
	}
	.admin-array-item-actions {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex-shrink: 0;
	}
	.admin-array-item-body {
		flex: 1;
		min-width: 0;
	}
	.admin-icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		border: none;
		border-radius: 0.35rem;
		background: transparent;
		color: var(--text-secondary, rgba(128, 128, 128, 0.8));
		cursor: pointer;
		transition: background 0.15s;
	}
	.admin-icon-btn:hover {
		background: rgba(128, 128, 128, 0.15);
	}
	.admin-icon-btn-danger:hover {
		background: rgba(220, 60, 60, 0.2);
		color: #dc3c3c;
	}
	.admin-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.4rem 0.9rem;
		border-radius: 0.5rem;
		border: none;
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.15s;
	}
	.admin-btn-small {
		padding: 0.2rem 0.6rem;
		font-size: 0.78rem;
	}
	.admin-btn-primary {
		background: var(--primary, #4c8dff);
		color: #fff;
	}
	.admin-btn-primary:hover {
		filter: brightness(1.1);
	}
	.admin-empty {
		font-size: 0.8rem;
		color: var(--text-secondary, rgba(128, 128, 128, 0.8));
	}
</style>
