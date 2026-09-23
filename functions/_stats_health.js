// 临时探测：确认 CF Pages 是否运行 functions/ 目录下的函数。
// 若 /_stats_health 返回 {"ok":true} 说明 Functions 已启用（问题在动态路由写法）；
// 若 404 说明本项目根本没启用 Pages Functions（需改用 Worker 或开控制台开启）。
export async function onRequest() {
	return new Response(JSON.stringify({ ok: true, via: "pages-function" }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}
