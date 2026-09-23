// 统计计数「读」代理（CF Pages Function）
//
// 浏览器改调本站同源接口（国内 Cloudflare 必达），由本函数在服务端去拉 abacus，
// 解决原 abacus.jasoncameron.dev 个人服务在国内的不可达 / 不稳定问题。
// 数据仍存于 abacus（命名空间 yiyu14.top），历史计数（含 site=242 等）全部保留。
//
// 路由：/get/{ns}/{key}  ->  转发 https://abacus.jasoncameron.dev/get/yiyu14.top/{key}

const TARGET = "https://abacus.jasoncameron.dev";
const NS = "yiyu14.top";
const KEY_RE = /^[A-Za-z0-9_.-]+$/;

function corsHeaders() {
	return {
		"access-control-allow-origin": "*",
		"access-control-allow-methods": "GET,OPTIONS",
		"access-control-allow-headers": "Origin,Content-Type",
		"cache-control": "no-store",
	};
}

export async function onRequestGet({ params }) {
	const key = params.key;
	if (!key || !KEY_RE.test(key)) {
		return new Response(JSON.stringify({ error: "bad key" }), {
			status: 400,
			headers: { "content-type": "application/json", ...corsHeaders() },
		});
	}
	try {
		const upstream = `${TARGET}/get/${NS}/${encodeURIComponent(key)}`;
		const resp = await fetch(upstream);
		const body = await resp.text();
		return new Response(body, {
			status: resp.status,
			headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders() },
		});
	} catch (e) {
		return new Response(JSON.stringify({ error: "upstream_error", detail: String(e) }), {
			status: 502,
			headers: { "content-type": "application/json", ...corsHeaders() },
		});
	}
}

export async function onRequestOptions() {
	return new Response(null, { status: 204, headers: corsHeaders() });
}
