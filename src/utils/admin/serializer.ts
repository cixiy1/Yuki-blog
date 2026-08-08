/**
 * 配置序列化工具
 *
 * 将编辑后的配置对象（JSON 结构）写回 src/config/*.ts 文件。
 * 采用"补丁式"更新：保留原文件的 import 语句、注释和其他导出，
 * 只替换目标 `export const xxx = ...` 的值部分，避免破坏文件结构。
 */

/** 将 JS 值序列化为 TS 源码（缩进用 tab，与项目风格一致） */
export function serializeValue(value: unknown, indentLevel = 0): string {
	const indent = "\t".repeat(indentLevel);
	const childIndent = "\t".repeat(indentLevel + 1);

	if (value === null) return "null";
	if (value === undefined) return "undefined";

	const type = typeof value;
	if (type === "string") return JSON.stringify(value);
	if (type === "number" || type === "boolean") return String(value);
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value.map((v) => `${childIndent}${serializeValue(v, indentLevel + 1)}`);
		return `[\n${items.join(",\n")}\n${indent}]`;
	}
	if (type === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return "{}";
		const lines = entries.map(([k, v]) => {
			const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
			return `${childIndent}${key}: ${serializeValue(v, indentLevel + 1)}`;
		});
		return `{\n${lines.join(",\n")}\n${indent}}`;
	}
	return "undefined";
}

/**
 * 在 TS 文件内容中，找到 `export const <name>` 导出的值部分并替换。
 * 通过括号深度扫描定位值的结束位置，兼容对象、数组、字符串、数字。
 * 返回替换后的完整文件内容；找不到导出时返回 null。
 */
export function patchConfigExport(
	original: string,
	exportName: string,
	newValue: unknown,
): string | null {
	// 匹配 `export const name` 或 `export const name: Type`
	const pattern = new RegExp(`export\\s+const\\s+${exportName}\\b[^=]*=\\s*`);
	const match = pattern.exec(original);
	if (!match) return null;

	const valueStart = match.index + match[0].length;
	const valueStr = original.slice(valueStart);
	const end = findValueEnd(valueStr);
	if (end === -1) return null;

	const newBody = serializeValue(newValue);
	return original.slice(0, valueStart) + newBody + original.slice(valueStart + end);
}

/** 扫描值的结束位置：匹配括号/方括号/引号深度 */
function findValueEnd(s: string): number {
	let depth = 0;
	let inString: string | null = null;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (inString) {
			if (ch === "\\") i++;
			else if (ch === inString) inString = null;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") {
			inString = ch;
			continue;
		}
		if (ch === "{" || ch === "[" || ch === "(") {
			depth++;
			continue;
		}
		if (ch === "}" || ch === "]" || ch === ")") {
			depth--;
			if (depth === 0) return i + 1;
			continue;
		}
		// 顶层分号结束（值是非括号类型的标量时）
		if (depth === 0 && ch === ";") return i + 1;
		// 注释处理：跳过 // 与 /* */
		if (depth === 0 && ch === "/" && s[i + 1] === "/") {
			const nl = s.indexOf("\n", i);
			if (nl === -1) return i;
			i = nl;
		}
	}
	return -1;
}

/** 判断两个 JSON 值是否相等（用于检测是否有修改） */
export function isEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
