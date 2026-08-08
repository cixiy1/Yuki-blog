import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	showInNavbar: true,
	showInSidebar: true,
	mode: "local",
	volume: 0.7,
	playMode: "list",
	showLyrics: true,
	meting: {
		api: "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		server: "netease",
		type: "playlist",
		id: "10046455237",
		auth: "",
		fallbackApis: [
			"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id"
		]
	},
	local: {
		playlist: [
			{
				name: "失眠",
				artist: "Suki刘舒妤",
				url: "/assets/music/shimian-suki.flac",
				cover: "",
				lrc: ""
			}
		]
	}
};
