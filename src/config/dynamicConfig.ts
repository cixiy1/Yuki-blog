import type { DynamicConfig } from "@/types/dynamicConfig";

export const dynamicConfig: DynamicConfig = {
	title: "",
	description: "",
	profileUrl: "/about/",
	showComment: true,
	itemsPerPage: 20,
	apiUrl: "/api/dynamic.json",
	memos: {
		enable: false,
		apiUrl: "https://memos.example.com",
		parent: "users/xiaye"
	}
};
