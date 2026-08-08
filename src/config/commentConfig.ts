import type { CommentConfig } from "../types/commentConfig";

export const commentConfig: CommentConfig = {
	type: "giscus",
	twikoo: {
		envId: "https://twikoo.vercel.app",
		lang: "zh-CN",
		visitorCount: true,
		jsUrl: "https://cdn.jsdelivr.net/npm/twikoo@1.7.14/dist/twikoo.min.js",
		cssUrl: "/assets/css/twikoo-custom.css"
	},
	waline: {
		serverURL: "https://waline.vercel.app",
		lang: "zh-CN",
		emoji: [
			"https://unpkg.com/@waline/emojis@1.4.0/weibo",
			"https://unpkg.com/@waline/emojis@1.4.0/bilibili",
			"https://unpkg.com/@waline/emojis@1.4.0/bmoji"
		],
		login: "enable",
		visitorCount: true
	},
	artalk: {
		server: "https://artalk.example.com/",
		locale: "zh-CN",
		visitorCount: true
	},
	giscus: {
		repo: "cixiy1/Yuki-blog",
		repoId: "R_kgDOTx2vjg",
		category: "General",
		categoryId: "DIC_kwDOTx2vjs4DC9oL",
		mapping: "title",
		strict: "0",
		reactionsEnabled: "1",
		emitMetadata: "1",
		inputPosition: "top",
		lang: "zh-CN",
		loading: "lazy"
	},
	disqus: {
		shortname: "firefly"
	}
};
