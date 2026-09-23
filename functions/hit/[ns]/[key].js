// 统计计数「写（自增）」代理（CF Pages Function）
//
// 路由：/hit/{ns}/{key}  ->  转发 https://abacus.jasoncameron.dev/hit/yiyu14.top/{key}
// 其余说明同 functions/get/[ns]/[key].js（同源入口、服务端拉 abacus、保留历史数据）。

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
		const upstream = `${TARGET}/hit/${NS}/${encodeURIComponent(key)}`;
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
