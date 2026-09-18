/*
 * 本地 markdown2html 冒烟校验（CommonMark HTML 块规则）
 * 用途：验证嵌入到 .md 里的 HTML 组件在 Astro 渲染后结构不被破坏。
 * 重点关注：HTML 块以容器 div 开头时（type 6），块内出现空行会导致
 * 后续 CSS/DOM 被当成 markdown 正文包进 <p>（惨案防护）。
 *
 * 依赖 markdown-it（`pnpm add -D markdown-it`，或临时用 MD_IT_PATH 指向已有安装）。
 *
 * 用法：node scripts/check-md-embed.mjs <file.md>
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let MarkdownIt;
try {
	MarkdownIt = require("markdown-it");
} catch {
	if (!process.env.MD_IT_PATH) {
		console.error("✗ 需要 markdown-it，请先安装或设置 MD_IT_PATH 环境变量");
		process.exit(2);
	}
	MarkdownIt = require(process.env.MD_IT_PATH);
}

const file = process.argv[2];
const raw = readFileSync(file, "utf-8");

// 去掉 frontmatter
const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
if (!fm) {
	console.error("✗ 找不到 frontmatter");
	process.exit(1);
}
const body = raw.slice(fm[0].length);

const md = new MarkdownIt({ html: true });
md.validateLink = () => true;
const out = md.render(body);

let fail = 0;
const check = (name, cond, extra = "") => {
	console.log(`${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
	if (!cond) fail++;
};

// 1) style 块必须完整且内部没有 <p>
const styleOpen = (out.match(/<style>/g) || []).length;
const styleClose = (out.match(/<\/style>/g) || []).length;
check("style 标签配对", styleOpen === 1 && styleClose === 1, `open=${styleOpen} close=${styleClose}`);

const styleBody = (out.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
check("style 内未被插入 <p>", !styleBody.includes("<p"), `len=${styleBody.length}`);
check("style 内容未被转义", !styleBody.includes("&lt;") && !styleBody.includes("&gt;"));

// 2) 结构计数：任何一个 HTML 标签，渲染前后的数量都必须对得上
const count = (s, re) => (s.match(re) || []).length;
// 注意：p / em / strong / a 这类标签也可能由 markdown 正文生成，不参与比对，
// 只校验结构性标签，避免假警报。
const STRUCTURAL = new Set([
	"div", "section", "nav", "header", "footer", "article", "aside", "main",
	"table", "thead", "tbody", "tfoot", "tr", "th", "td", "col", "colgroup",
	"ul", "ol", "li", "dl", "dt", "dd", "h1", "h2", "h3", "h4", "h5", "h6",
	"span", "canvas", "svg", "script", "style", "figure", "figcaption",
]);
const tags = [
	...new Set(body.match(/<([a-zA-Z][a-zA-Z0-9]*)/g).map((s) => s.slice(1))),
]
	.filter((t) => STRUCTURAL.has(t))
	.sort();
const mismatched = [];
for (const tag of tags) {
	const re = new RegExp(`<${tag}\\b`, "g");
	const a = count(body, re);
	const b = count(out, re);
	if (a !== b) mismatched.push(`<${tag}> ${a}→${b}`);
}
check(
	"HTML 标签数量渲染前后一致",
	mismatched.length === 0,
	mismatched.length ? mismatched.join(", ") : `${tags.length} 类标签`,
);

// 3) 不应有把 HTML 片段当文本包起来的段落 / 缩进代码块
check("无 CSS 文本泄漏成段落", !styleBody.includes("</p>"));
check("无孤立闭合标签成段落", !/<\/style><\/p>/.test(out) && !/<\/div><\/p>/.test(out));
check(
	"无缩进代码块（组件内不能有空行 + 缩进）",
	!out.includes("<pre><code>"),
	`pre 数量=${(out.match(/<pre><code>/g) || []).length}`,
);
check("组件 HTML 未被转义", !/&lt;div|&lt;table|&lt;section|&lt;style/.test(out));

// 4) 标签配平
const open = count(out, /<div\b/g);
const close = count(out, /<\/div>/g);
check("div 配平", open === close, `open=${open} close=${close}`);

console.log(fail === 0 ? "\n全部通过" : `\n失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);
