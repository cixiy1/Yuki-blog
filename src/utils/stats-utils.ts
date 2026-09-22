import { getSortedPosts } from "./content-utils";
import { formatDateToYYYYMMDD } from "./date-utils";
import { getPostUrlBySlug, removeFileExtension } from "./url-utils";

/**
 * 文章计数 id
 *
 * 计数服务（abacus）的 key 只接受 ^[A-Za-z0-9_\-.]{3,64}$，
 * 而本站的文章 slug 里有中文（如「小施施七夕快乐」），不能直接当 key。
 * 这里对 slug 做 FNV-1a 32 位哈希后转 36 进制，前缀 p 保证长度不小于 3。
 *
 * ⚠️ 改动这个算法等于让已有阅读量「归零」（旧 key 对不上新 key），不要随意动。
 * 浏览器端不重复计算 id，只消费 Astro 渲染出来的 data-stats-id。
 */
export function getStatsId(slug: string): string {
	const source = removeFileExtension(String(slug || ""));
	let hash = 0x811c9dc5;
	for (let i = 0; i < source.length; i++) {
		hash ^= source.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `p${hash.toString(36)}`;
}

export interface StatsPostEntry {
	/** 计数用 id */
	id: string;
	/** 文章 slug（无扩展名） */
	slug: string;
	title: string;
	url: string;
	published: string;
	category?: string;
}

/**
 * /stats 页需要的文章清单。
 * 加密文章不列出（标题也不该出现在公开统计页上）。
 */
export async function getStatsPostList(): Promise<StatsPostEntry[]> {
	const posts = await getSortedPosts();

	return posts
		.filter((post) => !post.data.password)
		.map((post) => {
			const slug = removeFileExtension(post.id);
			return {
				id: getStatsId(slug),
				slug,
				title: post.data.title,
				url: getPostUrlBySlug(slug),
				published: formatDateToYYYYMMDD(post.data.published),
				category: post.data.category || undefined,
			};
		});
}
