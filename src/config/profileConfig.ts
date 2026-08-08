import type { ProfileConfig } from "../types/profileConfig";

export const profileConfig: ProfileConfig = {
	avatar: "assets/images/avatar.avif",
	name: "雪穗",
	bio: "你好，我是雪穗，欢迎来到我的博客。",
	links: [
		{
			name: "qq",
			icon: "fa7-brands:qq",
			url: "https://wpa.qq.com/msgrd?v=3&uin=2132539636&site=qq&menu=yes",
			showName: false
		},
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/cixiy1",
			showName: false
		},
		{
			name: "Email",
			icon: "fa7-solid:envelope",
			url: "mailto:2132539636@qq.com",
			showName: false
		},
		{
			name: "RSS",
			icon: "fa7-solid:rss",
			url: "/rss/",
			showName: false
		}
	]
};
