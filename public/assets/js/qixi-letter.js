/*
 * 七夕·星河信笺 —— 星空 canvas 动画
 * 由 Yuki 的 AI 助手生成
 *
 * 说明：本组件嵌在带 password 的加密文章里，内容在客户端解密后才注入 DOM，
 * 因此脚本用「DOMContentLoaded + password:decrypted 事件 + 轮询」三种方式
 * 等待内容就绪，并用 dataset 守卫做幂等初始化（swup 切页不会重复绑定）。
 */
(function () {
	function ready() {
		var canvas = document.querySelector(".qixi-wrap #sky");
		if (!canvas || canvas.dataset.qixiBound === "1") return null;
		return canvas;
	}

	function start(canvas) {
	  var ctx = canvas.getContext('2d');
	  var W, H, DPR;
	  var stars = [];
	  var shooting = null;

	  function resize() {
	    DPR = Math.min(window.devicePixelRatio || 1, 2);
	    W = canvas.clientWidth;
	    H = canvas.clientHeight;
	    canvas.width = W * DPR;
	    canvas.height = H * DPR;
	    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
	    seedStars();
	  }

	  function seedStars() {
	    stars = [];
	    var count = Math.min(300, Math.floor((W * H) / 4600));
	    for (var i = 0; i < count; i++) {
	      stars.push({
	        x: Math.random() * W,
	        y: Math.random() * H,
	        r: Math.random() * 1.4 + 0.3,
	        base: Math.random() * 2 * Math.PI,
	        speed: Math.random() * 1.6 + 0.6,
	        gold: Math.random() < 0.18
	      });
	    }
	    stars.push({ x: W * 0.16, y: H * 0.2, r: 2.2, base: 0, speed: 1.1, gold: true, hero: true });
	    stars.push({ x: W * 0.84, y: H * 0.82, r: 2.0, base: Math.PI, speed: 1.1, gold: true, hero: true });
	  }

	  function drawGalaxy() {
	    var g = ctx.createLinearGradient(0, H * 0.92, W, H * 0.08);
	    g.addColorStop(0, 'rgba(232, 200, 138, 0.0)');
	    g.addColorStop(0.35, 'rgba(232, 200, 138, 0.10)');
	    g.addColorStop(0.5, 'rgba(240, 217, 168, 0.16)');
	    g.addColorStop(0.65, 'rgba(232, 200, 138, 0.10)');
	    g.addColorStop(1, 'rgba(232, 200, 138, 0.0)');
	    ctx.fillStyle = g;
	    ctx.fillRect(0, 0, W, H);

	    ctx.beginPath();
	    ctx.moveTo(W * 0.18, H * 0.22);
	    ctx.quadraticCurveTo(W * 0.5, H * 0.42, W * 0.82, H * 0.8);
	    ctx.strokeStyle = 'rgba(240, 217, 168, 0.20)';
	    ctx.lineWidth = 1;
	    ctx.setLineDash([3, 9]);
	    ctx.stroke();
	    ctx.setLineDash([]);

	    for (var i = 0; i <= 18; i++) {
	      var t = i / 18;
	      var qx = W * 0.18 + (W * 0.82 - W * 0.18) * t;
	      var qy = H * 0.22 + (H * 0.8 - H * 0.22) * t + Math.sin(t * Math.PI) * (-H * 0.10);
	      var pulse = 0.5 + 0.5 * Math.sin(i * 1.7 + Date.now() / 600);
	      ctx.beginPath();
	      ctx.arc(qx, qy, 1 + pulse * 0.8, 0, Math.PI * 2);
	      ctx.fillStyle = 'rgba(240, 217, 168, ' + (0.25 + pulse * 0.4) + ')';
	      ctx.fill();
	    }
	  }

	  var t0 = Date.now();
	  function frame() {
	    var t = (Date.now() - t0) / 1000;
	    ctx.clearRect(0, 0, W, H);
	    drawGalaxy();

	    for (var i = 0; i < stars.length; i++) {
	      var s = stars[i];
	      var tw = 0.55 + 0.45 * Math.sin(s.base + t * s.speed);
	      var c = s.gold
	        ? 'rgba(240, 217, 168, ' + (0.55 + 0.45 * tw) + ')'
	        : 'rgba(255, 255, 255, ' + (0.35 + 0.45 * tw) + ')';
	      ctx.beginPath();
	      ctx.arc(s.x, s.y, s.r * (s.hero ? 1.6 : 1), 0, Math.PI * 2);
	      ctx.fillStyle = c;
	      ctx.fill();
	      if (s.hero) {
	        var gl = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 7);
	        gl.addColorStop(0, s.gold ? 'rgba(240,217,168,0.35)' : 'rgba(255,255,255,0.25)');
	        gl.addColorStop(1, 'rgba(0,0,0,0)');
	        ctx.fillStyle = gl;
	        ctx.fillRect(s.x - s.r * 7, s.y - s.r * 7, s.r * 14, s.r * 14);
	      }
	    }

	    if (!shooting && Math.random() < 0.003) {
	      shooting = { x: Math.random() * W * 0.7 + W * 0.2, y: Math.random() * H * 0.3, len: 90, life: 0 };
	    }
	    if (shooting) {
	      var m = shooting;
	      m.life += 0.035;
	      var mx = m.x - m.life * 340;
	      var my = m.y + m.life * 200;
	      var alpha = Math.max(0, 1 - m.life * 1.4);
	      var grad = ctx.createLinearGradient(mx, my, mx + m.len, my - m.len * 0.55);
	      grad.addColorStop(0, 'rgba(255,255,255,' + alpha * 0.9 + ')');
	      grad.addColorStop(1, 'rgba(255,255,255,0)');
	      ctx.strokeStyle = grad;
	      ctx.lineWidth = 1.4;
	      ctx.beginPath();
	      ctx.moveTo(mx, my);
	      ctx.lineTo(mx + m.len, my - m.len * 0.55);
	      ctx.stroke();
	      if (m.life > 1.1) shooting = null;
	    }

	    requestAnimationFrame(frame);
	  }

	  resize();
	  frame();
	  window.addEventListener('resize', resize);
	}

	function init() {
		var canvas = ready();
		if (!canvas) return false;
		canvas.dataset.qixiBound = "1";
		try {
			start(canvas);
		} catch (e) {
			canvas.dataset.qixiBound = "";
			return false;
		}
		return true;
	}

	// 加密文章解密完成后会派发该事件
	document.addEventListener("password:decrypted", function () {
		init();
	});

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}

	// 兜底轮询：内容注入时机不确定，成功即停
	var timer = setInterval(function () {
		if (init()) clearInterval(timer);
	}, 400);
	setTimeout(function () {
		clearInterval(timer);
	}, 20000);
})();
