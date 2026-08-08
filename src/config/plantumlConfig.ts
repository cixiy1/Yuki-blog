import type { PlantUMLConfig } from "../types/plantumlConfig";

/**
 * PlantUML 图表渲染配置
 *
 * 用于控制 markdown 文章中 `plantuml` 代码块到 PlantUML 服务器 SVG 图片的
 * 构建时编码与客户端渲染行为。支持明暗双主题与自建 PlantUML 服务器。
 *
 * @see https://plantuml.com/zh/theme
 * @see https://plantuml.com/zh/server
 */
export const plantumlConfig: PlantUMLConfig = {
	enable: true,
	server: "https://www.plantuml.com/plantuml",
	lightTheme: "",
	darkTheme: "cyborg"
};
