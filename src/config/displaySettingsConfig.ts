import type { DisplaySettingsConfig } from "../types/displaySettingsConfig";

// 显示设置面板开关配置
// 集中管理设置面板中所有可切换项的开关
// 方便统一控制哪些设置项对用户可见
// 也方便进行调试预览效果

export const displaySettingsConfig: DisplaySettingsConfig = {
	themeColorSwitchable: true,
	layoutSwitchable: true,
	cardBorderSwitchable: true,
	cardFollowThemeSwitchable: true,
	wallpaperModeSwitchable: true,
	wavesSwitchable: true,
	gradientSwitchable: true,
	bannerTitleSwitchable: true,
	bannerCarouselSwitchable: true,
	overlaySwitchable: {
		opacity: true,
		blur: true,
		cardOpacity: true
	},
	sakuraSwitchable: true
};
