import type { BackgroundWallpaperConfig } from "@/types/backgroundWallpaper";

export const backgroundWallpaper: BackgroundWallpaperConfig = {
	mode: "banner",
	playerEnable: true,
	src: {
		desktop: [
			"assets/images/DesktopWallpaper/spider-man.jpg"
		],
		mobile: [
			"assets/images/MobileWallpaper/spider-man.jpg"
		],
		playerUrl: "https://bed.twoleaf.cn/file/1785658612716_firefly.mp4"
	},
	common: {
		dimOpacity: 0.2,
		playerMode: "random",
		homeText: {
			enable: true,
			title: "分明一觉华胥梦，回首东风泪满衣",
			titleSize: "4.5rem",
			subtitle: [],
			subtitleSize: "1.5rem",
			typewriter: {
				enable: true,
				speed: 100,
				deleteSpeed: 50,
				pauseTime: 2000
			}
		},
		postInfo: {
			mode: "description"
		},
		navbar: {
			transparentMode: "semi",
			blur: 5
		},
		waves: {
			enable: {
				desktop: true,
				mobile: true
			}
		},
		gradient: {
			enable: {
				desktop: true,
				mobile: true
			},
			height: "10%"
		},
		carousel: {
			enable: false,
			interval: 5000,
			transitionEffect: "zoom"
		}
	},
	banner: {
		position: "0% 20%"
	},
	overlay: {
		zIndex: -1,
		opacity: 0.8,
		blur: 10,
		cardOpacity: 0.5
	},
	fullscreen: {
		position: "center"
	}
};
