import type { SiteConfig } from "@/types/siteConfig";

// 定义站点语言
// 语言代码，例如：'zh_CN', 'zh_TW', 'en', 'ja', 'ru', 'ko'。
const SITE_LANG = "zh_CN";

export const siteConfig: SiteConfig = {
	title: "Yuki Blog",
	subtitle: "雪穗的博客",
	site_url: "https://yuki-blog.2132539636.workers.dev",
	description: "雪穗博客（Yuki Blog）是一个基于 Astro 和 Firefly 主题搭建的个人博客，记录生活点滴与技术学习笔记。",
	keywords: [
		"Yuki",
		"Yuki Blog",
		"雪穗",
		"雪穗博客",
		"Astro",
		"博客",
		"技术博客",
		"静态博客"
	],
	themeColor: {
		hue: 165,
		defaultMode: "system"
	},
	pageWidth: 100,
	card: {
		border: false,
		followTheme: false
	},
	favicon: [
		{
			src: "/favicon/firefly-32.png"
		}
	],
	navbar: {
		logo: {
			type: "image",
			value: "assets/images/logo/firefly-light.png",
			valueDark: "assets/images/logo/firefly-dark.png",
			alt: "🍀"
		},
		title: "Yuki Blog",
		widthFull: false,
		menuAlign: "center",
		followTheme: false,
		stickyNavbar: true
	},
	siteStartDate: "2026-08-09",
	timezone: "Asia/Shanghai",
	pages: {
		friends: true,
		sponsor: true,
		guestbook: true,
		bangumi: true,
		gallery: true,
		anime: false,
		dynamic: true,
		booknav: true
	},
	categoryBar: true,
	foldArticle: true,
	postListLayout: {
		defaultMode: "grid",
		mobileDefaultMode: "grid",
		coverPosition: "right",
		descriptionLines: 2,
		showStatsIcons: true,
		tagsPosition: "bottom",
		meta: {
			showPublished: true,
			showCategory: true,
			showTags: true,
			tagCount: 3,
			showWords: false,
			showReadingTime: false
		},
		stats: {
			showPublished: true,
			showWords: true,
			showReadingTime: true
		},
		grid: {
			masonry: true,
			columnWidth: 320
		}
	},
	post: {
		rehypeCallouts: {
			theme: "github",
			enablePythonMarkdownAdmonitions: false
		},
		showLastModified: true,
		outdatedThreshold: 30,
		sharePoster: true,
		generateOgImages: false
	},
	bangumi: {
		userId: "1143164",
		mode: "dynamic",
		apiUrl: "https://bgmapi.anibt.net",
		subjectBaseUrl: "https://bgmmi.anibt.net/subject/",
		categoryOrder: [
			"anime",
			"book",
			"music",
			"game"
		]
	},
	anime: {
		bilibili: {
			uid: "435640487"
		}
	},
	pagination: {
		postsPerPage: 10
	},
	imageOptimization: {
		formats: "webp",
		quality: 85,
		noReferrerDomains: [
			"*.hdslb.com",
			"*.bilibili.com"
		]
	},
	lang: "zh_CN"
};
