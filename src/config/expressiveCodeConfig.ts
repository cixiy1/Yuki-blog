import type { ExpressiveCodeConfig } from "../types/expressiveCodeConfig";

/**
 * expressive-code配置
 * @see https://expressive-code.com/
 * 修改本配置后需要重启Astro开发服务器才能生效
 */

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	darkTheme: "one-dark-pro",
	lightTheme: "one-light",
	pluginCollapsible: {
		enable: true,
		lineThreshold: 15,
		previewLines: 8,
		defaultCollapsed: true
	},
	pluginLanguageBadge: {
		enable: true
	},
	pluginLanguageLogo: {
		enable: false,
		color: "mono",
		excludedLangs: []
	}
};
