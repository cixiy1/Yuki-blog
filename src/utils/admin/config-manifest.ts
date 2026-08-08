/**
 * 管理台配置清单
 *
 * 定义哪些配置文件可以在管理台编辑、对应的类型名、文件路径等信息。
 * editable: false 表示该配置含函数/复杂逻辑，建议手动编辑源码。
 */

export type ConfigManifestEntry = {
	/** 配置导出变量名 */
	key: string;
	/** 源文件相对 src/config 的文件名 */
	file: string;
	/** TS 类型名 */
	typeName: string;
	/** 类型导入路径（相对 src/config） */
	typeImport: string;
	/** 中文名 */
	label: string;
	/** 中文说明 */
	description: string;
	/** 是否可在管理台编辑 */
	editable: boolean;
};

export const configManifest: ConfigManifestEntry[] = [
	{
		key: "siteConfig",
		file: "siteConfig.ts",
		typeName: "SiteConfig",
		typeImport: "../types/siteConfig",
		label: "站点基础",
		description: "站点标题、副标题、URL、主题色、导航栏、页面开关等核心配置",
		editable: true,
	},
	{
		key: "profileConfig",
		file: "profileConfig.ts",
		typeName: "ProfileConfig",
		typeImport: "../types/profileConfig",
		label: "用户资料",
		description: "头像、名字、个人签名、社交链接",
		editable: true,
	},
	{
		key: "announcementConfig",
		file: "announcementConfig.ts",
		typeName: "AnnouncementConfig",
		typeImport: "../types/announcementConfig",
		label: "公告",
		description: "侧边栏公告的标题、内容、链接",
		editable: true,
	},
	{
		key: "commentConfig",
		file: "commentConfig.ts",
		typeName: "CommentConfig",
		typeImport: "../types/commentConfig",
		label: "评论系统",
		description: "Twikoo / Waline / Giscus / Disqus / Artalk 评论系统配置",
		editable: true,
	},
	{
		key: "coverImageConfig",
		file: "coverImageConfig.ts",
		typeName: "CoverImageConfig",
		typeImport: "../types/coverImageConfig",
		label: "封面图",
		description: "文章封面图显示开关、随机封面图 API",
		editable: true,
	},
	{
		key: "displaySettingsConfig",
		file: "displaySettingsConfig.ts",
		typeName: "DisplaySettingsConfig",
		typeImport: "../types/displaySettingsConfig",
		label: "显示设置面板",
		description: "设置面板中各切换项的开关",
		editable: true,
	},
	{
		key: "dynamicConfig",
		file: "dynamicConfig.ts",
		typeName: "DynamicConfig",
		typeImport: "../types/dynamicConfig",
		label: "动态页面",
		description: "动态页面标题、分页、Memos 数据源",
		editable: true,
	},
	{
		key: "sakuraConfig",
		file: "effectsConfig.ts",
		typeName: "SakuraConfig",
		typeImport: "../types/effectsConfig",
		label: "樱花特效",
		description: "樱花飘落特效的数量、速度、尺寸、透明度",
		editable: true,
	},
	{
		key: "expressiveCodeConfig",
		file: "expressiveCodeConfig.ts",
		typeName: "ExpressiveCodeConfig",
		typeImport: "../types/expressiveCodeConfig",
		label: "代码高亮",
		description: "代码块主题、折叠、语言徽章",
		editable: true,
	},
	{
		key: "footerConfig",
		file: "footerConfig.ts",
		typeName: "FooterConfig",
		typeImport: "../types/footerConfig",
		label: "页脚",
		description: "页脚 HTML 注入（如备案号）",
		editable: true,
	},
	{
		key: "friendsConfig",
		file: "friendsConfig.ts",
		typeName: "FriendLink[]",
		typeImport: "../types/friendsConfig",
		label: "友链",
		description: "友链列表（标题、头像、描述、网址、权重）",
		editable: true,
	},
	{
		key: "galleryConfig",
		file: "galleryConfig.ts",
		typeName: "GalleryConfig",
		typeImport: "../types/galleryConfig",
		label: "相册",
		description: "相册列表、瀑布流列宽",
		editable: true,
	},
	{
		key: "licenseConfig",
		file: "licenseConfig.ts",
		typeName: "LicenseConfig",
		typeImport: "../types/licenseConfig",
		label: "许可证",
		description: "文章版权协议（如 CC BY-NC-SA 4.0）",
		editable: true,
	},
	{
		key: "mermaidConfig",
		file: "mermaidConfig.ts",
		typeName: "MermaidConfig",
		typeImport: "../types/mermaidConfig",
		label: "Mermaid 图表",
		description: "Mermaid 图表亮色/暗色主题",
		editable: true,
	},
	{
		key: "musicPlayerConfig",
		file: "musicConfig.ts",
		typeName: "MusicPlayerConfig",
		typeImport: "../types/musicConfig",
		label: "音乐播放器",
		description: "音乐播放器开关、Meting API、本地音乐列表",
		editable: true,
	},
	{
		key: "plantumlConfig",
		file: "plantumlConfig.ts",
		typeName: "PlantUMLConfig",
		typeImport: "../types/plantumlConfig",
		label: "PlantUML 图表",
		description: "PlantUML 渲染开关、服务器地址、主题",
		editable: true,
	},
	{
		key: "sponsorConfig",
		file: "sponsorConfig.ts",
		typeName: "SponsorConfig",
		typeImport: "../types/sponsorConfig",
		label: "打赏",
		description: "打赏说明、方式列表、打赏者列表",
		editable: true,
	},
	{
		key: "analyticsConfig",
		file: "analyticsConfig.ts",
		typeName: "AnalyticsConfig",
		typeImport: "../types/analyticsConfig",
		label: "统计分析",
		description: "Google Analytics、Clarity、Umami、51la 统计配置",
		editable: true,
	},
	{
		key: "backgroundWallpaper",
		file: "backgroundWallpaper.ts",
		typeName: "BackgroundWallpaperConfig",
		typeImport: "../types/backgroundWallpaper",
		label: "背景壁纸",
		description: "壁纸模式、背景图片、横幅文字、水波纹、轮播",
		editable: true,
	},
	{
		key: "booknavConfig",
		file: "booknavConfig.ts",
		typeName: "BooknavGroup[]",
		typeImport: "../types/booknavConfig",
		label: "书签导航",
		description: "书签导航分组与书签列表",
		editable: true,
	},
	{
		key: "pioConfig",
		file: "pioConfig.ts",
		typeName: "Live2DWidgetConfig & SpineModelConfig",
		typeImport: "../types/pioConfig",
		label: "看板娘",
		description: "Spine / Live2D 看板娘模型配置",
		editable: false,
	},
	{
		key: "navBarConfig",
		file: "navBarConfig.ts",
		typeName: "NavBarConfig",
		typeImport: "../types/navBarConfig",
		label: "导航栏",
		description: "导航栏菜单（由函数动态生成，建议手动编辑）",
		editable: false,
	},
	{
		key: "fontConfig",
		file: "fontConfig.ts",
		typeName: "FontSelectionConfig",
		typeImport: "../types/fontConfig",
		label: "字体",
		description: "字体列表与选择（结构复杂，建议手动编辑）",
		editable: false,
	},
	{
		key: "sidebarLayoutConfig",
		file: "sidebarConfig.ts",
		typeName: "SidebarLayoutConfig",
		typeImport: "../types/sidebarConfig",
		label: "侧边栏布局",
		description: "侧边栏组件布局（结构复杂，建议手动编辑）",
		editable: false,
	},
];
