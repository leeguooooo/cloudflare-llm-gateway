/**
 * Self-contained, role-routed console served at GET /.
 *
 * Visual language: a hand-drawn / neo-brutalist
 * "sketchbook" theme: warm cream background with a dotted grid, white cards with
 * bold black borders and wobbly irregular border-radii, ZCOOL KuaiLe + Permanent
 * Marker display fonts, bright red accent, and an SVG roughen filter on dots.
 *
 * The page boots by calling /auth/me (cookie auto-sent, same-origin) and routes
 * into one of four surfaces by role/status:
 *   1. not logged in  -> landing with a 「登录」 button
 *   2. user + pending/blocked -> 「账号待开通」 card
 *   3. user + approved -> consumer console (控制台 · 我的令牌 · 模型 · 文档)
 *   4. admin -> admin console (总览 · Key 池 · 用户 · 令牌 · 文档)
 *
 * Every API call is a same-origin fetch carrying the SSO session cookie. The
 * browser NEVER sends an Authorization header.
 */

/** Operator-configurable branding (set via wrangler [vars]; all optional). */
interface Brand {
  BRAND_NAME?: string;
  SSO_LABEL?: string;
  SSO_NOTE?: string;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function adminPage(env?: Brand): string {
  const brand = env?.BRAND_NAME || "keypool";
  const ssoLabel = env?.SSO_LABEL || "使用 SSO 登录";
  const ssoNote = env?.SSO_NOTE || "单点登录(OIDC)。登录后由管理员开通即可使用。";
  return PAGE.replaceAll("__BRAND__", escHtml(brand))
    .replaceAll("__SSO_LABEL__", escHtml(ssoLabel))
    .replaceAll("__SSO_NOTE__", escHtml(ssoNote));
}

const PAGE = String.raw`<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>__BRAND__ · AI key 池</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&family=Permanent+Marker&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#1a1a1a; --cream:#fcfbf4; --paper:#fff;
    --red:#ff5447; --blue:#3f6fe0; --green:#36a85b; --yellow:#ffd23d; --amber:#e0a32a;
    --mint:#d8f0df; --peach:#ffe0cc; --softblue:#dde7ff; --creamy:#fff0bf;
    --muted:#57564d; --faint:#8a887d;
    --marker:'Permanent Marker',cursive;
    --zcool:'ZCOOL KuaiLe',cursive;
    --sans:'Noto Sans SC','PingFang SC',system-ui,-apple-system,sans-serif;
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{
    background-color:var(--cream);
    background-image:radial-gradient(rgba(0,0,0,.05) 1.4px,transparent 1.4px);
    background-size:22px 22px;
    color:var(--ink); font-family:var(--sans); font-size:15px; line-height:1.6;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:880px; margin:0 auto; padding:26px clamp(16px,4vw,32px) 60px}
  header.top{display:flex; align-items:center; gap:14px; margin-bottom:8px}
  .logo-dot{width:26px; height:26px; border:2.5px solid var(--ink); background:var(--red);
    border-radius:55% 45% 60% 40%; filter:url(#roughHi); flex:none}
  h1{font-family:var(--zcool); font-weight:400; font-size:clamp(28px,5vw,42px); margin:0; line-height:1.15}
  .tagline{font-family:var(--marker); color:var(--faint); font-size:15px; margin:2px 0 22px; transform:rotate(-1.2deg)}
  .pill{display:inline-flex; align-items:center; gap:7px; font-family:var(--marker); font-size:13px;
    border:2px solid var(--ink); border-radius:11px 14px 10px 13px/13px 10px 14px 11px; padding:3px 12px; background:var(--paper)}
  .pill .pd{width:11px;height:11px;border-radius:55% 45% 60% 40%;border:1.5px solid var(--ink);filter:url(#roughHi)}
  .pill.ok .pd{background:var(--green)} .pill.bad .pd{background:var(--red)} .pill .pd{background:var(--faint)}
  .card{background:var(--paper); border:2.5px solid var(--ink); padding:18px 20px; margin:16px 0;
    border-radius:18px 22px 15px 20px/20px 15px 22px 18px}
  .card.r1{border-radius:14px 17px 11px 15px/15px 11px 17px 14px}
  .card.r2{border-radius:20px 15px 22px 16px/16px 22px 14px 20px}
  .card h2{font-family:var(--zcool); font-weight:400; font-size:21px; margin:0 0 14px; display:flex; align-items:center; gap:9px}
  .card h2 .hd{width:14px;height:14px;border:2px solid var(--ink);border-radius:55% 45% 60% 40%;filter:url(#roughHi);flex:none}
  .h-red .hd{background:var(--red)} .h-blue .hd{background:var(--blue)} .h-green .hd{background:var(--green)} .h-yellow .hd{background:var(--yellow)}
  label{display:block; font-family:var(--marker); font-size:13px; color:var(--muted); margin-bottom:7px}
  input,textarea,select{width:100%; background:var(--cream); color:var(--ink); border:2px solid var(--ink);
    border-radius:10px 13px 9px 12px/12px 9px 13px 10px; padding:10px 13px; font-family:var(--sans); font-size:14px; outline:none}
  input:focus,textarea:focus{background:#fff; border-color:var(--red)}
  textarea{resize:vertical; min-height:120px; line-height:1.5}
  .row{display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap}
  .row > div{flex:1; min-width:180px}
  .btn{font-family:var(--zcool); font-size:16px; border:2.5px solid var(--ink); cursor:pointer;
    padding:9px 20px; border-radius:13px 16px 11px 14px/14px 11px 16px 13px; white-space:nowrap;
    transition:transform .12s; box-shadow:3px 3px 0 var(--ink)}
  .btn:active{transform:translate(2px,2px); box-shadow:1px 1px 0 var(--ink)}
  .btn.primary{background:var(--red); color:#fff}
  .btn.ghost{background:var(--paper); color:var(--ink)}
  .btn.small{font-size:13px; padding:5px 13px; box-shadow:2px 2px 0 var(--ink)}
  .btn:disabled{opacity:.5; cursor:not-allowed}
  table{width:100%; border-collapse:collapse; font-size:14px}
  th,td{text-align:left; padding:9px 10px; border-bottom:1.5px dashed #cfcbbd}
  th{font-family:var(--marker); font-weight:400; color:var(--muted); font-size:13px}
  td.n{font-variant-numeric:tabular-nums; font-weight:700}
  .dot{display:inline-block; width:13px;height:13px; border:2px solid var(--ink); border-radius:55% 45% 60% 40%; filter:url(#roughHi); vertical-align:-1px; margin-right:6px}
  .d-active{background:var(--green)} .d-cooldown{background:var(--yellow)} .d-disabled{background:var(--red)} .d-zero{background:#e8e6db}
  .d-warn{background:var(--amber)}
  .grid3{display:grid; grid-template-columns:repeat(3,1fr); gap:14px}
  .stat{border:2px solid var(--ink); padding:14px 16px; border-radius:16px 12px 18px 13px/13px 18px 11px 16px}
  .stat.s-a{background:var(--mint)} .stat.s-c{background:var(--creamy)} .stat.s-d{background:var(--peach)}
  .stat .lbl{font-family:var(--marker); font-size:13px; color:var(--muted)}
  .stat .num{font-family:var(--zcool); font-size:34px; line-height:1.1; margin-top:2px; font-variant-numeric:tabular-nums}
  .out{background:var(--cream); border:2px dashed var(--ink); border-radius:12px; padding:11px 14px;
    font-family:ui-monospace,Menlo,monospace; font-size:13px; white-space:pre-wrap; word-break:break-all; margin-top:13px}
  .out .k{color:var(--green); font-weight:700}
  .out .e{color:var(--red); font-weight:700}
  .hint{color:var(--faint); font-size:12.5px; margin-top:9px}
  .hint code{background:var(--creamy); border:1.5px solid var(--ink); border-radius:5px; padding:0 6px; font-family:ui-monospace,monospace}
  .endpoint{font-family:ui-monospace,Menlo,monospace; font-size:13px; background:var(--softblue);
    border:2px solid var(--ink); border-radius:9px; padding:8px 11px; word-break:break-all; margin-top:6px}
  @media(max-width:620px){.grid3{grid-template-columns:1fr}.btn{width:100%}}

  /* ===== role-routed layout: left sidebar nav (new-api style) + content ===== */
  .layout{display:flex; min-height:100vh; align-items:stretch}
  .side{width:212px; flex:none; background:var(--paper); border-right:2.5px solid var(--ink);
    padding:22px 16px; display:flex; flex-direction:column; gap:5px}
  .side .brand{display:flex; align-items:center; gap:10px; margin-bottom:6px}
  .side .brand h1{font-size:25px}
  .side .brand .logo-dot{width:24px;height:24px}
  .side .subt{font-family:var(--marker); color:var(--faint); font-size:11.5px; margin:0 0 18px; transform:rotate(-1.2deg)}
  .nav{display:flex; flex-direction:column; gap:5px}
  .nav a{display:flex; align-items:center; gap:9px; font-family:var(--zcool); font-size:17px;
    text-decoration:none; color:var(--ink); padding:8px 12px; border:2px solid transparent;
    border-radius:11px 14px 10px 13px/13px 10px 14px 11px; cursor:pointer; user-select:none}
  .nav a:hover{background:var(--cream)}
  .nav a.active{background:var(--creamy); border-color:var(--ink); box-shadow:2px 2px 0 var(--ink)}
  .nav a .hd{width:13px;height:13px;border:2px solid var(--ink);border-radius:55% 45% 60% 40%;filter:url(#roughHi);flex:none}
  .nav a.c-red .hd{background:var(--red)} .nav a.c-blue .hd{background:var(--blue)}
  .nav a.c-green .hd{background:var(--green)} .nav a.c-yellow .hd{background:var(--yellow)}
  .nav a.c-amber .hd{background:var(--amber)}
  .side .spacer{flex:1}
  .side .me-box{border-top:2px dashed #cfcbbd; padding-top:14px; font-size:13px; color:var(--muted)}
  .side .me-box .em{font-weight:700; color:var(--ink); word-break:break-all; display:block; margin-bottom:8px}
  .main{flex:1; min-width:0}
  .main .wrap{max-width:1080px; margin:0; padding-top:30px}
  .section{display:none}
  .section.active{display:block}
  .sec-h{font-family:var(--zcool); font-size:clamp(24px,4vw,32px); margin:0 0 4px}
  .sec-sub{font-family:var(--marker); color:var(--faint); font-size:13px; margin:0 0 18px; transform:rotate(-.6deg)}
  .mono-token{font-family:ui-monospace,Menlo,monospace; font-size:13px; word-break:break-all}
  .copyable{cursor:pointer; border-bottom:1.5px dashed var(--blue)}
  .copyable:hover{color:var(--blue)}
  .badge{display:inline-block; font-family:var(--marker); font-size:11px; border:1.5px solid var(--ink);
    border-radius:8px; padding:1px 8px; vertical-align:1px}
  .b-pending{background:var(--creamy)} .b-approved{background:var(--mint)} .b-blocked{background:var(--peach)}
  tr.hot td{background:#fff7d6}
  /* centered single-card surfaces (landing / pending) */
  .center{max-width:560px; margin:0 auto; padding:60px clamp(16px,4vw,32px)}
  @media(max-width:720px){
    .layout{flex-direction:column}
    .side{width:auto; border-right:none; border-bottom:2.5px solid var(--ink); flex-direction:row;
      flex-wrap:wrap; align-items:center; gap:10px; padding:14px 16px}
    .side .brand{margin-bottom:0}
    .side .subt{display:none}
    .nav{flex-direction:row; flex-wrap:wrap}
    .nav a{font-size:15px; padding:6px 10px}
    .side .spacer{flex:0}
    .side .me-box{border-top:none; padding-top:0; width:100%}
    .main .wrap{padding-top:18px}
  }
</style>
<script defer src="https://blog.leeguoo.com/scripts/visitor-beacon.js?v=20260629-2"></script>
</head>
<body>
<svg width="0" height="0" style="position:absolute"><defs>
  <filter id="roughHi"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5"/></filter>
</defs></svg>

<!-- ============ 1. landing (not logged in) ============ -->
<div id="view-landing" class="center" style="display:none">
  <header class="top">
    <span class="logo-dot"></span>
    <h1>__BRAND__</h1>
  </header>
  <div class="tagline">// 把一堆 AI key 攒成一个稳定的接口 · 坏了自动下架</div>
  <div class="card r1">
    <h2 class="h-red"><span class="hd"></span>登录</h2>
    <p style="margin:0 0 16px; color:var(--muted)">一个 OpenAI 兼容的 AI 网关。登录后即可申请 API 令牌。</p>
    <button class="btn primary" onclick="location.href='/auth/login'">__SSO_LABEL__</button>
    <div class="hint">__SSO_NOTE__</div>
  </div>
  <div class="card r2" id="landing-models" style="display:none">
    <h2 class="h-green"><span class="hd"></span>可用模型</h2>
    <table>
      <thead><tr><th>模型 id</th><th>来源</th></tr></thead>
      <tbody id="landing-models-body"><tr><td colspan="2" style="color:var(--faint)">加载中…</td></tr></tbody>
    </table>
  </div>
</div>

<!-- ============ 2. pending / blocked ============ -->
<div id="view-pending" class="center" style="display:none">
  <header class="top">
    <span class="logo-dot"></span>
    <h1>__BRAND__</h1>
  </header>
  <div class="tagline">// 账号开通制 · 管理员审核后开通</div>
  <div class="card r1">
    <h2 class="h-yellow"><span class="hd"></span>账号待开通</h2>
    <p style="margin:0 0 6px">当前账号：<b id="pending-email"></b></p>
    <p id="pending-msg" style="margin:0 0 16px; color:var(--muted)">已提交，等待管理员开通后即可获取 API 令牌。</p>
    <div class="row" style="align-items:center">
      <button class="btn ghost" id="pending-refresh">刷新</button>
      <a href="/auth/logout" class="btn ghost" style="text-decoration:none">退出</a>
    </div>
  </div>
</div>

<!-- ============ 3 & 4. console (sidebar + content) ============ -->
<div id="view-console" class="layout" style="display:none">
  <aside class="side">
    <div class="brand"><span class="logo-dot"></span><h1>__BRAND__</h1></div>
    <div class="subt">// AI key 池</div>
    <nav class="nav" id="nav"></nav>
    <a class="navitem" id="preview-toggle" style="display:none; color:var(--blue); margin-top:6px; font-size:15px"></a>
    <div class="spacer"></div>
    <div class="me-box">
      <span class="em" id="me-email"></span>
      <span class="pill" id="me-rolepill"><span class="pd"></span><span id="me-role"></span></span>
      <a href="/auth/logout" class="btn ghost small" style="text-decoration:none; margin-left:6px">退出</a>
    </div>
  </aside>

  <main class="main">
    <div class="wrap">

      <!-- ----- consumer: 控制台 ----- -->
      <section class="section" id="sec-dashboard">
        <h2 class="sec-h">控制台</h2>
        <p class="sec-sub" id="dash-greet">// 欢迎回来</p>
        <div class="card r1">
          <h2 class="h-blue"><span class="hd"></span>接入地址</h2>
          <div class="hint" style="margin-top:0">主接口(OpenAI 兼容):</div>
          <div class="endpoint"><span class="copyable" id="dash-endpoint"></span></div>
          <div id="dash-token-area" style="margin-top:16px"></div>
        </div>
        <div class="grid3">
          <div class="stat">
            <div class="num" id="dash-balance" style="color:var(--red)">…</div>
            <div class="lbl">余额 (USD)</div>
            <div class="hint" id="dash-bal-hint" style="display:none">余额不足，请充值</div>
            <button class="btn ghost small" id="dash-topup" style="margin-top:8px">充值</button>
          </div>
          <div class="stat">
            <div class="num" id="dash-req">…</div>
            <div class="lbl">近30天请求</div>
          </div>
          <div class="stat">
            <div class="num" id="dash-tok">…</div>
            <div class="lbl">近30天 token</div>
          </div>
        </div>
        <div class="card r2">
          <h2 class="h-green"><span class="hd"></span>快速开始
            <span style="flex:1"></span>
            <button class="btn ghost small" id="dash-curl-copy">复制</button>
          </h2>
          <div class="out" id="dash-curl"></div>
          <div class="hint">把 <code>$KEY</code> 换成上面的令牌即可。模型 id 见「模型」页。</div>
        </div>
      </section>

      <!-- ----- consumer: 我的令牌 ----- -->
      <section class="section" id="sec-tokens">
        <h2 class="sec-h">我的令牌</h2>
        <p class="sec-sub">// 这些令牌只属于你 · 妥善保管</p>
        <div class="card r1">
          <h2 class="h-blue"><span class="hd"></span>新建令牌</h2>
          <div class="row">
            <div><label>令牌名(可选)</label><input id="my-tname" placeholder="例如 my-app" autocomplete="off" /></div>
            <button class="btn primary" id="my-mint">生成令牌</button>
          </div>
          <div class="out" id="my-mint-out" style="display:none"></div>
        </div>
        <div class="card r2">
          <h2 class="h-green"><span class="hd"></span>令牌列表
            <span style="flex:1"></span>
            <button class="btn ghost small" id="my-tokens-refresh">刷新</button>
          </h2>
          <table>
            <thead><tr><th>id</th><th>名字</th><th>令牌</th><th>启用</th><th>用量</th><th>限速</th><th>有效期</th><th>创建</th><th></th></tr></thead>
            <tbody id="my-token-list"><tr><td colspan="9" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
        </div>
      </section>

      <!-- ----- shared: 模型 ----- -->
      <section class="section" id="sec-models">
        <h2 class="sec-h">模型</h2>
        <p class="sec-sub">// 当前可路由的模型</p>
        <div class="card r1">
          <table>
            <thead><tr><th>模型 id</th><th>来源</th></tr></thead>
            <tbody id="models-body"><tr><td colspan="2" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
        </div>
      </section>

      <!-- ----- shared: 文档 ----- -->
      <section class="section" id="sec-docs">
        <h2 class="sec-h">文档</h2>
        <p class="sec-sub">// OpenAI / Anthropic 兼容 · 同一套 SDK 即可接入</p>
        <div class="card r1">
          <h2 class="h-blue"><span class="hd"></span>接口与鉴权</h2>
          <div class="hint" style="margin-top:0">Chat Completions 接口:</div>
          <div class="endpoint copyable" id="docs-endpoint" title="点击复制"></div>
          <div class="hint">鉴权头:</div>
          <div class="endpoint">Authorization: Bearer &lt;你的令牌&gt;</div>
        </div>
        <div class="card r2">
          <h2 class="h-green"><span class="hd"></span>curl<span style="flex:1"></span><button class="btn ghost small" id="docs-curl-copy">复制</button></h2>
          <div class="out" id="docs-curl"></div>
        </div>
        <div class="card r1">
          <h2 class="h-yellow"><span class="hd"></span>OpenAI SDK<span style="flex:1"></span><button class="btn ghost small" id="docs-sdk-copy">复制</button></h2>
          <div class="out" id="docs-sdk"></div>
        </div>

        <div class="card r2">
          <h2 class="h-yellow"><span class="hd"></span>Anthropic 兼容(Claude SDK)<span style="flex:1"></span><button class="btn ghost small" id="docs-anthropic-copy">复制</button></h2>
          <div class="hint" style="margin-top:0">网关同时实现 Anthropic Messages 接口,Claude 官方 SDK / Claude Code 可直接接入:</div>
          <div class="endpoint">POST <span id="docs-anthropic-ep" class="copyable" title="点击复制"></span></div>
          <div class="hint">鉴权:<code>x-api-key: &lt;你的令牌&gt;</code> 或 <code>Authorization: Bearer &lt;你的令牌&gt;</code>。<code>base_url</code> 用上面的 Base URL,模型 id 与 OpenAI 接口<b>同一套</b>。</div>
          <div class="out" id="docs-anthropic"></div>
          <div class="hint">请求体为 Anthropic 格式:<code>messages</code> + <code>max_tokens</code>(必填)。响应同样带 <code>X-KeyPool-Provider</code> / <code>X-KeyPool-Model</code> / <code>X-KeyPool-Fallback</code> 响应头(回退后 Model 可能与请求不同)。</div>
        </div>
        <div class="card r2">
          <h2 class="h-blue"><span class="hd"></span>模型 id</h2>
          <table>
            <thead><tr><th>模型 id</th><th>来源</th></tr></thead>
            <tbody id="docs-models-body"><tr><td colspan="2" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
        </div>

        <div class="card r1">
          <h2 class="h-blue"><span class="hd"></span>POST /v1/chat/completions<span style="flex:1"></span><button class="btn ghost small" id="docs-reqbody-copy">复制</button></h2>
          <div class="hint" style="margin-top:0">Base URL(OpenAI <code>baseURL</code> 用这个):</div>
          <div class="endpoint copyable" id="docs-baseurl" title="点击复制"></div>
          <div class="hint">请求体(与 OpenAI 一致;支持 <code>stream:true</code> SSE 流式):</div>
          <div class="out" id="docs-reqbody"></div>
          <div class="hint">网关默认会在所选模型不可用时<b>自动回退</b>到同类可用模型。要关闭回退、强制只用所选模型,加 <code>"fallback": false</code>(此时模型不可用直接返回错误)。</div>
        </div>

        <div class="card r2">
          <h2 class="h-green"><span class="hd"></span>响应头</h2>
          <table>
            <thead><tr><th>响应头</th><th>含义</th></tr></thead>
            <tbody>
              <tr><td class="mono-token">X-KeyPool-Provider</td><td style="color:var(--muted)">实际命中的供应商(如 gemini)</td></tr>
              <tr><td class="mono-token">X-KeyPool-Model</td><td style="color:var(--muted)">实际使用的模型 id(回退后可能与请求不同)</td></tr>
              <tr><td class="mono-token">X-KeyPool-Fallback</td><td style="color:var(--muted)">出现即表示发生了回退,值为原始请求的模型</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card r1">
          <h2 class="h-yellow"><span class="hd"></span>其它接口</h2>
          <div class="hint" style="margin-top:0"><code>GET /v1/models</code> — 列出当前可路由的模型(仅含有可用 key、且未被标记不可用的模型):</div>
          <div class="endpoint">GET <span id="docs-models-ep" class="copyable" title="点击复制"></span></div>
          <div class="hint">原生透传(直接用各家原生协议,网关只负责选 key 与计费):</div>
          <div class="endpoint">/gemini/*&nbsp;&nbsp;·&nbsp;&nbsp;/mistral/*&nbsp;&nbsp;·&nbsp;&nbsp;/openrouter/*</div>
          <div class="hint">把上游的原生路径接在前缀后即可,例如 <code>/gemini/v1beta/models/...:generateContent</code>。鉴权同样用 <code>Authorization: Bearer &lt;你的令牌&gt;</code>。</div>
        </div>

        <div class="card r1">
          <h2 class="h-red"><span class="hd"></span>错误码</h2>
          <div class="hint" style="margin-top:0">错误响应为 OpenAI 兼容结构,错误信息在 <code>body.error.message</code>:</div>
          <table>
            <thead><tr><th>状态码</th><th>含义 / 处理</th></tr></thead>
            <tbody>
              <tr><td class="mono-token">402</td><td style="color:var(--muted)">余额不足 — 充值后重试</td></tr>
              <tr><td class="mono-token">429</td><td style="color:var(--muted)">限流 / 额度超限 — 退避后重试</td></tr>
              <tr><td class="mono-token">4xx</td><td style="color:var(--muted)">请求错误(参数 / 模型 id / 鉴权)</td></tr>
              <tr><td class="mono-token">5xx</td><td style="color:var(--muted)">上游错误 — 稍后重试</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card r2">
          <h2 class="h-red"><span class="hd"></span>计费</h2>
          <div class="hint" style="margin-top:0">按 token 计费:每次调用按输入 / 输出 token 数分别结算,价格见管理员配置的「模型价格」。余额不足时请求会被拒绝。用量与流水见「用量」与「余额」页。</div>
        </div>
      </section>

      <!-- ----- admin: 总览 ----- -->
      <section class="section" id="sec-overview">
        <h2 class="sec-h">总览</h2>
        <p class="sec-sub">// key 池健康度</p>
        <div class="card r1">
          <h2 class="h-green"><span class="hd"></span>池子状态
            <span id="ov-verdict" class="hint" style="margin:0 0 0 12px"></span>
            <span style="flex:1"></span>
            <span id="ov-stamp" class="hint" style="margin:0 10px 0 0"></span>
            <button class="btn ghost small" id="ov-probe">巡检</button>
            <button class="btn ghost small" id="ov-refresh">刷新</button>
          </h2>
          <div class="grid3">
            <div class="stat s-a"><div class="lbl">可用 active</div><div class="num" id="t-active">–</div></div>
            <div class="stat s-c"><div class="lbl">冷却 cooldown</div><div class="num" id="t-cooldown">–</div></div>
            <div class="stat s-d"><div class="lbl">禁用 disabled</div><div class="num" id="t-disabled">–</div></div>
          </div>
          <table style="margin-top:16px">
            <thead><tr><th>供应商</th><th>可用</th><th>冷却</th><th>禁用</th></tr></thead>
            <tbody id="ov-byprovider"><tr><td colspan="4" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
          <div class="out" id="ov-probe-out" style="display:none"></div>
        </div>
      </section>

      <!-- ----- admin: Key 池 ----- -->
      <section class="section" id="sec-keys">
        <h2 class="sec-h">Key 池</h2>
        <p class="sec-sub">// 导入即上架 · 坏 key 自动下架</p>
        <div class="card r2">
          <h2 class="h-yellow"><span class="hd"></span>导入 key</h2>
          <label>provider:key — 一行一个</label>
          <textarea id="keys" spellcheck="false" placeholder="gemini:AIzaSy...&#10;openrouter:sk-or-v1-...&#10;mistral:..."></textarea>
          <div style="margin-top:13px"><button class="btn primary" id="importBtn">导入并自动上架</button></div>
          <div class="hint">支持 <code>gemini</code> <code>mistral</code> <code>openrouter</code>。重复自动跳过；坏 key 首次调用即自动禁用。</div>
          <div class="out" id="importOut" style="display:none"></div>
        </div>
        <div class="card r1">
          <h2 class="h-green"><span class="hd"></span>各供应商状态
            <span style="flex:1"></span>
            <button class="btn ghost small" id="keys-refresh">刷新</button>
          </h2>
          <table>
            <thead><tr><th>供应商</th><th>可用</th><th>冷却</th><th>禁用</th></tr></thead>
            <tbody id="keys-byprovider"><tr><td colspan="4" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
        </div>
        <div class="card r2">
          <h2 class="h-red"><span class="hd"></span>模型可用性
            <span style="flex:1"></span>
            <button class="btn ghost small" id="modelstatus-probe">探测模型</button>
            <button class="btn ghost small" id="modelstatus-refresh">刷新</button>
          </h2>
          <div id="modelstatus-body" class="hint" style="margin-top:0">加载中…</div>
          <div class="hint">逐个模型试调一次,把不可用的(余额不足 / 模型下线)标灰;不可用的模型不会出现在 <code>/v1/models</code>。</div>
        </div>
      </section>

      <!-- ----- admin: Key 列表 ----- -->
      <section class="section" id="sec-keylist">
        <h2 class="sec-h">Key 列表</h2>
        <p class="sec-sub">// 每个 key 单独查看与操作 · 测活 / 余额(OpenRouter)</p>
        <div class="card r1">
          <h2 class="h-red"><span class="hd"></span>所有 key
            <span id="keylist-summary" class="hint" style="margin:0 0 0 12px"></span>
            <span style="flex:1"></span>
            <span id="keylist-checkall-out" class="hint" style="margin:0 10px 0 0"></span>
            <button class="btn ghost small" id="keylist-toggle">显示禁用</button>
            <button class="btn primary small" id="keylist-checkall">检测全部</button>
            <button class="btn ghost small" id="keylist-prune">清理失效</button>
            <button class="btn ghost small" id="keylist-refresh">刷新</button>
          </h2>
          <table>
            <thead><tr><th>供应商</th><th>key</th><th>请求/失败</th><th>上次错误</th><th>测活 / 余额</th><th>添加时间</th><th>操作</th></tr></thead>
            <tbody id="keylist-body"><tr><td colspan="7" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
          <div class="hint">「测活」实时探测:OpenRouter 显示真实余额;Gemini/Mistral 只能判断是否可用(限流也算可用)。探活成功会自动把禁用/冷却的 key 拉回可用。</div>
        </div>
      </section>

      <!-- ----- admin: 用户 ----- -->
      <section class="section" id="sec-users">
        <h2 class="sec-h">用户</h2>
        <p class="sec-sub">// 开通制 · 待开通的排在最上面</p>
        <div class="card r1">
          <h2 class="h-red"><span class="hd"></span>用户列表
            <span id="users-pending" class="badge" style="margin:0 0 0 12px"></span>
            <span style="flex:1"></span>
            <button class="btn ghost small" id="users-refresh">刷新</button>
          </h2>
          <table>
            <thead><tr><th>邮箱</th><th>角色</th><th>状态</th><th>创建</th><th></th></tr></thead>
            <tbody id="users-body"><tr><td colspan="5" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
        </div>
      </section>

      <!-- ----- admin: 令牌 ----- -->
      <section class="section" id="sec-admintokens">
        <h2 class="sec-h">令牌</h2>
        <p class="sec-sub">// 全局令牌 · 含管理员直发</p>
        <div class="card r2">
          <h2 class="h-blue"><span class="hd"></span>发令牌</h2>
          <div class="row">
            <div><label>令牌名(可选)</label><input id="adm-tname" placeholder="例如 service-x" autocomplete="off" /></div>
            <div><label>配额(请求数)</label><input id="adm-quota" type="number" min="1" placeholder="无限" /></div>
            <div><label>限速(RPM)</label><input id="adm-rpm" type="number" min="1" placeholder="无限" /></div>
            <div><label>有效期(天)</label><input id="adm-exp" type="number" min="1" placeholder="永久" /></div>
            <div><label>角色</label><select id="adm-role"><option value="user">用户</option><option value="admin">管理员</option></select></div>
            <button class="btn primary" id="adm-mint">发一个令牌</button>
          </div>
          <p class="hint">仅显示一次，请立即复制保存</p>
          <div class="out" id="adm-mint-out" style="display:none"></div>
        </div>
        <div class="card r1">
          <h2 class="h-green"><span class="hd"></span>令牌列表
            <span style="flex:1"></span>
            <button class="btn ghost small" id="adm-tokens-refresh">刷新</button>
          </h2>
          <table>
            <thead><tr><th>id</th><th>名字</th><th>角色</th><th>归属</th><th>用量</th><th>RPM</th><th>过期</th><th>启用</th><th>创建</th><th>操作</th></tr></thead>
            <tbody id="adm-token-list"><tr><td colspan="10" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
        </div>
      </section>

      <!-- ----- consumer: 聊天 ----- -->
      <section class="section" id="sec-chat">
        <h2 class="sec-h">聊天</h2>
        <p class="sec-sub">// 选个模型直接聊 · 按 token 计费</p>
        <div class="card r1">
          <div class="row" style="margin-bottom:10px">
            <div><label>模型</label><select id="chat-model"></select></div>
            <button class="btn ghost small" id="chat-clear">清空</button>
          </div>
          <div class="hint" id="chat-balance" style="margin-bottom:10px">剩余余额 <span id="chat-bal-usd">–</span> USD</div>
          <div id="chat-log" style="min-height:180px; max-height:420px; overflow:auto; border:2px dashed #cfcbbd; border-radius:12px; padding:12px; background:var(--cream)"><span style="color:var(--faint)">开始对话…</span></div>
          <div class="row" style="margin-top:12px; align-items:stretch">
            <div><textarea id="chat-input" style="min-height:56px" placeholder="说点什么…(Enter 发送,Shift+Enter 换行)"></textarea></div>
            <button class="btn primary" id="chat-send">发送</button>
          </div>
        </div>
      </section>

      <!-- ----- admin: 调试聊天 ----- -->
      <section class="section" id="sec-debugchat">
        <h2 class="sec-h">调试聊天</h2>
        <p class="sec-sub">// 用某个 key 直连试聊 · 不走池子 · 不计费</p>
        <div class="card r1">
          <div class="row" style="margin-bottom:10px">
            <div style="flex:2"><label>选 key</label><select id="dbg-key"></select></div>
            <div><label>模型(留空=默认)</label><input id="dbg-model" placeholder="默认" autocomplete="off" /></div>
            <button class="btn ghost small" id="dbg-clear">清空</button>
          </div>
          <div id="dbg-log" style="min-height:180px; max-height:420px; overflow:auto; border:2px dashed #cfcbbd; border-radius:12px; padding:12px; background:var(--cream)"><span style="color:var(--faint)">选一个 key,直连试聊…</span></div>
          <div class="row" style="margin-top:12px; align-items:stretch">
            <div><textarea id="dbg-input" style="min-height:56px" placeholder="测试这个 key…"></textarea></div>
            <button class="btn primary" id="dbg-send">发送</button>
          </div>
        </div>
      </section>

      <!-- ----- consumer: 用量 ----- -->
      <section class="section" id="sec-usage">
        <h2 class="sec-h">用量</h2>
        <p class="sec-sub">// 近 30 天 · 你自己的调用</p>
        <div class="grid3">
          <div class="stat s-a"><div class="lbl">总请求</div><div class="num" id="u-total">–</div></div>
          <div class="stat s-c"><div class="lbl">成功率</div><div class="num" id="u-rate">–</div></div>
          <div class="stat s-d"><div class="lbl">总 token</div><div class="num" id="u-tokens">–</div></div>
        </div>
        <div class="card r2" style="margin-top:14px">
          <h2 class="h-yellow"><span class="hd"></span>近 14 天请求
            <span style="flex:1"></span>
            <span class="hint" style="margin:0"><span class="dot d-active" style="margin-right:3px"></span>成功 <span class="dot d-disabled" style="margin:0 3px 0 10px"></span>失败</span>
          </h2>
          <div id="u-chart"></div>
        </div>
        <div class="card r1" style="margin-top:14px">
          <h2 class="h-green"><span class="hd"></span>按供应商</h2>
          <table><thead><tr><th>供应商</th><th>请求</th><th>成功</th><th>平均延迟</th><th>token</th></tr></thead>
          <tbody id="u-byprov"><tr><td colspan="5" style="color:var(--faint)">加载中…</td></tr></tbody></table>
        </div>
        <div class="card r2" style="margin-top:14px">
          <h2 class="h-blue"><span class="hd"></span>最近请求</h2>
          <table><thead><tr><th>时间</th><th>供应商</th><th>模型</th><th>状态</th><th>延迟</th><th>token</th></tr></thead>
          <tbody id="u-recent"><tr><td colspan="6" style="color:var(--faint)">加载中…</td></tr></tbody></table>
        </div>
      </section>

      <!-- ----- admin: 日志 ----- -->
      <section class="section" id="sec-logs">
        <h2 class="sec-h">日志</h2>
        <p class="sec-sub">// 近 30 天 · 全部调用</p>
        <div class="grid3">
          <div class="stat s-a"><div class="lbl">总请求</div><div class="num" id="l-total">–</div></div>
          <div class="stat s-c"><div class="lbl">成功率</div><div class="num" id="l-rate">–</div></div>
          <div class="stat s-d"><div class="lbl">总 token</div><div class="num" id="l-tokens">–</div></div>
        </div>
        <div class="card r2" style="margin-top:14px">
          <h2 class="h-yellow"><span class="hd"></span>近 14 天请求
            <span style="flex:1"></span>
            <span class="hint" style="margin:0"><span class="dot d-active" style="margin-right:3px"></span>成功 <span class="dot d-disabled" style="margin:0 3px 0 10px"></span>失败</span>
          </h2>
          <div id="l-chart"></div>
        </div>
        <div class="card r1" style="margin-top:14px">
          <h2 class="h-green"><span class="hd"></span>按供应商
            <span style="flex:1"></span>
            <button class="btn ghost small" id="logs-refresh">刷新</button>
          </h2>
          <table><thead><tr><th>供应商</th><th>请求</th><th>成功</th><th>平均延迟</th><th>token</th></tr></thead>
          <tbody id="l-byprov"><tr><td colspan="5" style="color:var(--faint)">加载中…</td></tr></tbody></table>
        </div>
        <div class="card r1" style="margin-top:14px">
          <h2 class="h-red"><span class="hd"></span>用户使用排行 · 近 30 天
            <span style="flex:1"></span>
            <button class="btn ghost small" id="rank-refresh">刷新</button>
          </h2>
          <table><thead><tr><th>#</th><th>用户</th><th>请求</th><th>成功率</th><th>token</th><th>最近</th></tr></thead>
          <tbody id="l-rank"><tr><td colspan="6" style="color:var(--faint)">加载中…</td></tr></tbody></table>
          <div class="hint">点某一行可只看该用户的日志。</div>
        </div>
        <div class="card r2" style="margin-top:14px">
          <h2 class="h-blue"><span class="hd"></span>最近请求
            <span style="flex:1"></span>
            <select id="logs-user" class="btn ghost small" style="max-width:200px"><option value="">全部用户</option></select>
            <button class="btn ghost small" id="logs-prev" style="margin-left:6px" disabled>上一页</button>
            <span id="logs-page" class="hint" style="margin:0 6px">第 1 页</span>
            <button class="btn ghost small" id="logs-next" disabled>下一页</button>
          </h2>
          <table><thead><tr><th>时间</th><th>用户</th><th>供应商</th><th>模型</th><th>状态</th><th>延迟</th><th>token</th></tr></thead>
          <tbody id="l-recent"><tr><td colspan="7" style="color:var(--faint)">加载中…</td></tr></tbody></table>
        </div>
      </section>

      <!-- ----- admin: 计费 ----- -->
      <section class="section" id="sec-billing">
        <h2 class="sec-h">计费</h2>
        <p class="sec-sub">// 余额 · 充值 · 流水 · 定价 <span id="bill-config" style="color:var(--ink)"></span></p>
        <div class="card r2">
          <h2 class="h-red"><span class="hd"></span>充值</h2>
          <div class="row">
            <div><label>用户 sub</label><input id="bill-sub" placeholder="OIDC sub" autocomplete="off" /></div>
            <div><label>金额(USD)</label><input id="bill-amount" type="number" step="0.0001" min="0" placeholder="例如 10" /></div>
            <div><label>备注(可选)</label><input id="bill-note" placeholder="例如 手动充值" autocomplete="off" /></div>
            <button class="btn primary" id="bill-topup">充值</button>
          </div>
          <div class="out" id="bill-topup-out" style="display:none"></div>
        </div>
        <div class="card r1">
          <h2 class="h-green"><span class="hd"></span>余额总览
            <span style="flex:1"></span>
            <button class="btn ghost small" id="bill-balances-refresh">刷新</button>
          </h2>
          <div class="grid3" style="margin-bottom:14px">
            <div class="stat"><div class="lbl">余额合计 USD</div><div class="num" id="bal-sum">–</div></div>
            <div class="stat"><div class="lbl">用户数</div><div class="num" id="bal-users">–</div></div>
            <div class="stat"><div class="lbl">付费用户数</div><div class="num" id="bal-paid">–</div></div>
          </div>
          <table>
            <thead><tr><th>邮箱</th><th>sub</th><th>余额 USD</th><th></th></tr></thead>
            <tbody id="bill-balances-body"><tr><td colspan="4" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
        </div>
        <div class="card r2">
          <h2 class="h-blue"><span class="hd"></span>最近流水
            <span style="flex:1"></span>
            <button class="btn ghost small" id="bill-txns-refresh">刷新</button>
          </h2>
          <table>
            <thead><tr><th>时间</th><th>sub</th><th>类型</th><th>金额 USD</th><th>余额 USD</th><th>模型</th><th>token</th><th>备注</th></tr></thead>
            <tbody id="bill-txns-body"><tr><td colspan="8" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
        </div>
        <div class="card r1">
          <h2 class="h-yellow"><span class="hd"></span>模型价格
            <span style="flex:1"></span>
            <button class="btn ghost small" id="prices-refresh">刷新</button>
          </h2>
          <div class="row">
            <div><label>模型</label><input id="price-model" placeholder="例如 gemini-2.0-flash" autocomplete="off" /></div>
            <div><label>输入 $/Mtok</label><input id="price-input" type="number" step="0.0001" min="0" placeholder="例如 0.5" /></div>
            <div><label>输出 $/Mtok</label><input id="price-output" type="number" step="0.0001" min="0" placeholder="例如 1.5" /></div>
            <button class="btn primary" id="price-save">保存价格</button>
          </div>
          <div class="out" id="price-out" style="display:none"></div>
          <table style="margin-top:14px">
            <thead><tr><th>模型</th><th>输入 $/Mtok</th><th>输出 $/Mtok</th><th></th></tr></thead>
            <tbody id="prices-body"><tr><td colspan="4" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
          <div class="hint">价格以 micro-USD 每 Mtok 存储；按输入/输出 token 分别计费。</div>
        </div>
      </section>

      <!-- ----- consumer: 余额 ----- -->
      <section class="section" id="sec-balance">
        <h2 class="sec-h">余额</h2>
        <p class="sec-sub">// 你的额度与流水</p>
        <div class="card r1">
          <h2 class="h-red"><span class="hd"></span>当前余额
            <span style="flex:1"></span>
            <button class="btn ghost small" id="bal-refresh">刷新</button>
          </h2>
          <div class="grid3">
            <div class="stat s-a"><div class="lbl">余额 USD</div><div class="num" id="bal-usd">–</div></div>
          </div>
        </div>
        <div class="card r2">
          <h2 class="h-green"><span class="hd"></span>充值</h2>
          <div class="hint" id="bal-topup-success" style="display:none; color:var(--green); margin-top:0">充值处理中，到账后余额会自动更新（可稍后点「刷新」）。</div>
          <div class="row">
            <div><label>金额(USD)</label><input id="bal-topup-amount" type="number" step="0.01" min="0" placeholder="例如 10" /></div>
            <button class="btn primary" id="bal-topup-btn">充值</button>
          </div>
          <div class="out" id="bal-topup-out" style="display:none"></div>
          <div class="hint">通过 Stripe 在线支付。支付成功后余额会在确认后自动到账。</div>
        </div>
        <div class="card r1">
          <h2 class="h-blue"><span class="hd"></span>最近流水</h2>
          <table>
            <thead><tr><th>时间</th><th>类型</th><th>金额 USD</th><th>余额 USD</th><th>模型</th><th>token</th><th>备注</th></tr></thead>
            <tbody id="bal-txns-body"><tr><td colspan="7" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
        </div>
      </section>

    </div>
  </main>
</div>

<script>
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var base = location.origin;
  var me = null;        // { email, role, status, sub }
  var modelsCache = null;

  // ---- same-origin fetch. Cookie auth only — NEVER an Authorization header. ----
  function api(path, opts){
    opts = opts || {};
    opts.credentials = 'same-origin';
    return fetch(base + path, opts).then(function(r){
      return r.text().then(function(t){
        var j=null; try{ j = t ? JSON.parse(t) : null; }catch(e){ j={raw:t}; }
        return { ok:r.ok, status:r.status, body:j };
      });
    });
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function pad2(n){ return (n<10?'0':'')+n; }
  // local time (was UTC via toISOString — showed CST users a -8h skew)
  function fmtDate(ms){ if(!ms) return '–'; try{ var d=new Date(ms); return pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+' '+pad2(d.getHours())+':'+pad2(d.getMinutes()); }catch(e){ return '–'; } }
  function fmtNum(n){ try{ return (n==null?0:n).toLocaleString('en-US'); }catch(e){ return String(n==null?0:n); } }
  // enum → 中文 (UI is Simplified Chinese; backend stores English enums)
  var KIND_ZH={topup:'充值',charge:'消费',usage:'消费'};
  var ROLE_CN={admin:'管理员',user:'用户'};
  var STATUS_CN={pending:'待开通',approved:'已开通',blocked:'已停用'};
  function copy(text, el){
    var done=function(){ if(el){ var o=el.textContent; el.textContent='已复制'; setTimeout(function(){ el.textContent=o; },900); } };
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done,done); }
    else { try{ var ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); }catch(e){} }
  }
  window.__kpCopy = copy; // bound in inline handlers

  function show(view){
    ['view-landing','view-pending','view-console'].forEach(function(v){ $(v).style.display='none'; });
    $(view).style.display = (view==='view-console') ? 'flex' : 'block';
  }

  // ---------------- models (shared) ----------------
  var modelsErr=false; // distinguish a failed /v1/models fetch from a genuinely empty pool
  function loadModels(){
    return api('/v1/models').then(function(r){
      if(!r.ok){ modelsErr=true; modelsCache=[]; return []; }
      var list = (r.body && (r.body.data || r.body)) || [];
      if(!Array.isArray(list)) list = [];
      modelsErr=false; modelsCache = list;
      return list;
    }).catch(function(){ modelsErr=true; modelsCache=[]; return []; });
  }
  function renderModelsInto(tbodyId){
    var tb=$(tbodyId); if(!tb) return;
    var list=modelsCache||[];
    if(modelsErr){ tb.innerHTML='<tr><td colspan="2"><span class="e">加载失败</span> · <button class="btn ghost small" id="'+tbodyId+'-retry">重试</button></td></tr>'; var rb=$(tbodyId+'-retry'); if(rb) rb.onclick=function(){ loadModels().then(function(){ renderModelsInto(tbodyId); }); }; return; }
    if(!list.length){ tb.innerHTML='<tr><td colspan="2" style="color:var(--faint)">暂无可用模型</td></tr>'; return; }
    tb.innerHTML = list.map(function(m){
      var d=MODEL_LABELS[m.id];
      return '<tr><td style="font-weight:700" class="mono-token copyable" data-copy="'+esc(m.id)+'" title="点击复制">'+esc(m.id)+(d?'<span style="font-weight:400;color:var(--faint)"> — '+esc(d)+'</span>':'')+'</td><td style="color:var(--muted)">'+esc(m.owned_by||m.ownedBy||'–')+'</td></tr>';
    }).join('');
    bindCopy(tb);
  }

  // ---------------- sidebar nav ----------------
  var NAV = {
    user: [
      {id:'dashboard', label:'控制台', color:'red'},
      {id:'chat',      label:'聊天', color:'blue'},
      {id:'tokens',    label:'我的令牌', color:'blue'},
      {id:'models',    label:'模型', color:'green'},
      {id:'usage',     label:'用量', color:'amber'},
      {id:'balance',   label:'余额', color:'red'},
      {id:'docs',      label:'文档', color:'yellow'}
    ],
    admin: [
      {id:'overview',    label:'总览', color:'green'},
      {id:'debugchat',   label:'调试聊天', color:'blue'},
      {id:'keys',        label:'Key 池', color:'yellow'},
      {id:'keylist',     label:'Key 列表', color:'red'},
      {id:'users',       label:'用户', color:'blue'},
      {id:'admintokens', label:'令牌', color:'green'},
      {id:'logs',        label:'日志', color:'amber'},
      {id:'billing',     label:'计费', color:'red'},
      {id:'docs',        label:'文档', color:'amber'}
    ]
  };
  var previewUser=false;
  var navIds=[];
  function buildNav(role){
    var items = NAV[role] || NAV.user;
    navIds = items.map(function(it){ return it.id; });
    $('nav').innerHTML = items.map(function(it){
      return '<a class="navitem c-'+it.color+'" data-sec="'+it.id+'" href="#'+it.id+'"><span class="hd"></span>'+it.label+'</a>';
    }).join('');
    Array.prototype.forEach.call($('nav').querySelectorAll('.navitem'), function(a){
      a.onclick = function(ev){ ev.preventDefault(); var id=a.getAttribute('data-sec'); if(location.hash!=='#'+id) location.hash=id; else selectSection(id); };
    });
    // Honor the URL hash on (re)build; fall back to the first nav item.
    var want = location.hash.replace(/^#/,'');
    selectSection(navIds.indexOf(want)>=0 ? want : items[0].id);
  }
  function selectSection(id){
    if(navIds.indexOf(id)<0) id = navIds[0];
    Array.prototype.forEach.call(document.querySelectorAll('.section'), function(s){ s.classList.remove('active'); });
    var sec=$('sec-'+id); if(sec) sec.classList.add('active');
    Array.prototype.forEach.call($('nav').querySelectorAll('.navitem'), function(a){
      a.classList.toggle('active', a.getAttribute('data-sec')===id);
    });
    if(location.hash!=='#'+id) { try{ history.replaceState(null,'','#'+id); }catch(e){} }
    onSectionEnter(id);
  }
  // Back/forward + manual hash edits switch sections.
  window.addEventListener('hashchange', function(){
    var id=location.hash.replace(/^#/,''); if(id && navIds.indexOf(id)>=0) selectSection(id);
  });
  function onSectionEnter(id){
    if(id==='models' || id==='docs'){
      loadModels().then(function(){ renderModelsInto('models-body'); renderModelsInto('docs-models-body'); fillDocs(); });
    }
    if(id==='dashboard') loadModels().then(loadDashboard);
    if(id==='tokens'){ var mo=$('my-mint-out'); if(mo){ mo.style.display='none'; mo.innerHTML=''; } loadMyTokens(); }
    if(id==='overview') loadStats('ov');
    if(id==='keys'){ loadStats('keys'); loadModelStatus(); }
    if(id==='keylist'){ var rb=$('keylist-refresh'); if(rb) rb.onclick=loadKeyList; var cb=$('keylist-checkall'); if(cb) cb.onclick=checkAllKeys; var tg=$('keylist-toggle'); if(tg) tg.onclick=function(){ keylistShowDisabled=!keylistShowDisabled; loadKeyList(); }; var pr=$('keylist-prune'); if(pr) pr.onclick=function(){ if(!confirm('清理所有永久失效的 key?欠费的会保留')) return; pr.disabled=true; var out=$('keylist-checkall-out'); if(out) out.textContent='清理中…'; api('/admin/keys/prune',{method:'POST'}).then(function(r){ pr.disabled=false; if(out) out.textContent='已清理 '+((r.body&&r.body.removed)||0)+' 个失效 key'; loadKeyList(); }).catch(function(){ pr.disabled=false; if(out) out.textContent='清理出错'; }); }; loadKeyList(); }
    if(id==='users') loadUsers();
    if(id==='admintokens') loadAdminTokens();
    if(id==='usage') loadUserUsage();
    if(id==='logs'){
      var lr=$('logs-refresh'); if(lr) lr.onclick=loadAdminUsage;
      var rr=$('rank-refresh'); if(rr) rr.onclick=loadAdminRank;
      var su=$('logs-user'); if(su) su.onchange=function(){ logsOwner=su.value; logsPage=0; loadAdminUsage(); };
      var pv=$('logs-prev'); if(pv) pv.onclick=function(){ if(logsPage>0){ logsPage--; loadAdminLogs(); } };
      var nx=$('logs-next'); if(nx) nx.onclick=function(){ logsPage++; loadAdminLogs(); };
      loadAdminUsage();
    }
    if(id==='billing') loadBilling();
    if(id==='balance') loadBalance();
    if(id==='chat') initChat();
    if(id==='debugchat') initDbgChat();
  }

  // ---------------- chat playgrounds ----------------
  function renderChat(logId, msgs){
    var el=$(logId); if(!el) return;
    if(!msgs.length){ el.innerHTML='<span style="color:var(--faint)">开始对话…</span>'; return; }
    el.innerHTML = msgs.map(function(m){
      var who = m.role==='user'?'你':(m.role==='assistant'?'AI':m.role);
      var col = m.role==='user'?'var(--blue)':'var(--green)';
      var note = m.note ? '<div style="font-size:12px;color:var(--amber);margin-top:2px">⤷ '+esc(m.note)+'</div>' : '';
      var raw = String(m.content==null?'':m.content);
      var body = (m.role==='assistant' && raw==='') ? '<span style="color:var(--faint)">▍…</span>' : esc(raw);
      return '<div style="margin-bottom:11px"><b style="font-family:var(--marker);color:'+col+'">'+who+'</b>'+note
        +'<div style="white-space:pre-wrap;word-break:break-word">'+body+'</div></div>';
    }).join('');
    el.scrollTop = el.scrollHeight;
  }
  function chatReply(r){
    if(r.ok && r.body && r.body.choices && r.body.choices[0] && r.body.choices[0].message)
      return r.body.choices[0].message.content;
    var e = r.body && (r.body.error && r.body.error.message || r.body.error) || JSON.stringify(r.body);
    return '⚠ [错误 '+r.status+'] '+e;
  }
  function bindEnter(inputId, sendFn){
    var el=$(inputId); if(!el||el.__b) return; el.__b=1;
    el.addEventListener('keydown', function(ev){ if(ev.isComposing || ev.keyCode===229) return; if(ev.key==='Enter' && !ev.shiftKey){ ev.preventDefault(); sendFn(); } });
  }
  // streaming chat: append an assistant bubble that fills in as SSE arrives.
  function streamChat(path, payload, logId, msgs, btn){
    var asst={role:'assistant',content:''};
    var usage=null, provider='';
    msgs.push(asst); renderChat(logId, msgs);
    payload.stream=true;
    payload.stream_options={include_usage:true};
    function fail(s,t){
      var j=null; try{j=JSON.parse(t);}catch(e){}
      if(s===402){
        asst.content='余额不足,请先充值'; renderChat(logId,msgs);
        var lg=$(logId);
        if(lg){ var bt=document.createElement('button'); bt.className='btn primary small'; bt.textContent='去充值'; bt.style.marginTop='6px'; bt.onclick=function(){ selectSection('balance'); }; lg.appendChild(bt); lg.scrollTop=lg.scrollHeight; }
        if(btn){ btn.disabled=false; btn.textContent='发送'; }
        return;
      }
      asst.content='⚠ [错误 '+s+'] '+((j&&j.error&&(j.error.message||j.error))||t||''); renderChat(logId,msgs); if(btn){ btn.disabled=false; btn.textContent='发送'; }
    }
    fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
    .then(function(resp){
      if(!resp.ok || !resp.body){ return resp.text().then(function(t){ fail(resp.status,t); }); }
      // If the gateway fell back to a different model, label the reply honestly.
      if(resp.headers.get('X-KeyPool-Fallback')){
        var actual=resp.headers.get('X-KeyPool-Model')||'';
        if(actual && actual!==(payload.model||'')) asst.note='所选模型暂不可用,已自动改用 '+actual;
      }
      provider=resp.headers.get('X-KeyPool-Provider')||'';
      var reader=resp.body.getReader(), dec=new TextDecoder(), buf='';
      (function pump(){
        return reader.read().then(function(res){
          if(res.done){
            if(!asst.content) asst.content='(无内容)';
            if(usage){ var ntk=(usage.total_tokens!=null)?usage.total_tokens:((usage.prompt_tokens||0)+(usage.completion_tokens||0)); var un='本次 ~'+ntk+' tokens'+(provider?' · '+provider:''); asst.note=asst.note?asst.note+' · '+un:un; }
            renderChat(logId,msgs); refreshChatBalance(); if(btn){ btn.disabled=false; btn.textContent='发送'; } return;
          }
          buf+=dec.decode(res.value,{stream:true});
          var parts=buf.split('\n'); buf=parts.pop();
          parts.forEach(function(line){
            line=line.trim(); if(line.indexOf('data:')!==0) return;
            var data=line.slice(5).trim(); if(!data||data==='[DONE]') return;
            try{ var o=JSON.parse(data); if(o&&o.usage) usage=o.usage; var d=o.choices&&o.choices[0]&&o.choices[0].delta; if(d&&typeof d.content==='string') asst.content+=d.content; }catch(e){}
          });
          renderChat(logId,msgs);
          return pump();
        });
      })();
    }).catch(function(){ asst.content=asst.content||'⚠ 网络错误'; renderChat(logId,msgs); if(btn){ btn.disabled=false; btn.textContent='发送'; } });
  }
  // consumer chat (billed)
  var chatMsgs=[];
  // Friendly Chinese descriptions so tier-alias model ids (qwen-max etc.) are legible.
  var MODEL_LABELS={
    'mistral-large-latest':'Mistral 旗舰','mistral-small-latest':'Mistral 轻量','open-mistral-nemo':'Mistral Nemo 开源','codestral-latest':'Mistral 代码',
    'moonshot-v1-8k':'Kimi 8K 上下文','moonshot-v1-32k':'Kimi 32K 上下文','moonshot-v1-128k':'Kimi 128K 长文','kimi-k2-0711-preview':'Kimi K2 预览',
    'glm-4-flash':'智谱 GLM-4 Flash(免费)','glm-4-plus':'智谱 GLM-4 Plus','glm-4-air':'智谱 GLM-4 Air','glm-4':'智谱 GLM-4',
    'qwen-max':'通义千问 Max(最强)','qwen-plus':'通义千问 Plus(均衡)','qwen-turbo':'通义千问 Turbo(快/省)','qwen2.5-72b-instruct':'通义千问 2.5 72B',
    'gemini-2.0-flash':'Gemini 2.0 Flash','gemini-2.0-flash-lite':'Gemini 2.0 Flash Lite','gemini-1.5-flash':'Gemini 1.5 Flash','gemini-1.5-pro':'Gemini 1.5 Pro',
    'gpt-4o':'OpenAI GPT-4o','gpt-4o-mini':'OpenAI GPT-4o mini','o3-mini':'OpenAI o3-mini',
    'deepseek-chat':'DeepSeek V3 对话','deepseek-reasoner':'DeepSeek R1 推理',
    'llama-3.3-70b-versatile':'Llama 3.3 70B (Groq)','llama-3.1-8b-instant':'Llama 3.1 8B (Groq)'
  };
  function modelLabel(id){ var d=MODEL_LABELS[id]; return d ? id+' — '+d : id; }
  function initChat(){
    loadModels().then(function(){
      var sel=$('chat-model'); var b=$('chat-send'); var inp=$('chat-input');
      var none=(modelsCache||[]).length===0;
      if(none){
        if(!chatMsgs.length) renderChat('chat-log', chatMsgs);
        $('chat-log').innerHTML='<span style="color:var(--faint)">// '+(modelsErr?'模型列表加载失败,稍后再试':'暂无可用模型,稍后再试')+'</span>';
        if(b) b.disabled=true; if(inp) inp.disabled=true;
        return;
      }
      if(b) b.disabled=false; if(inp) inp.disabled=false;
      if(sel && !sel.options.length){
        var groups={};
        (modelsCache||[]).forEach(function(m){ (groups[m.owned_by]=groups[m.owned_by]||[]).push(m.id); });
        sel.innerHTML = Object.keys(groups).map(function(p){
          return '<optgroup label="'+esc(p)+'">'+groups[p].map(function(id){return '<option value="'+esc(id)+'">'+esc(modelLabel(id))+'</option>';}).join('')+'</optgroup>';
        }).join('');
      }
    });
    var b=$('chat-send'); if(b) b.onclick=sendChat; refreshChatBalance();
    var cl=$('chat-clear'); if(cl) cl.onclick=function(){ chatMsgs=[]; renderChat('chat-log',chatMsgs); };
    bindEnter('chat-input', sendChat);
  }
  function refreshChatBalance(){
    var el=$('chat-bal-usd'); if(!el) return;
    api('/me/balance').then(function(r){
      if(!(r.ok && r.body && r.body.balance_micro!=null)){ el.innerHTML='<span class="e">读取失败</span>'; return; }
      var bal=r.body.balance_micro; el.textContent=usd(bal); el.style.color = bal<=0 ? 'var(--red)' : '';
    }).catch(function(){ el.textContent='–'; });
  }
  function sendChat(){
    var inp=$('chat-input'), txt=inp.value.trim(); if(!txt) return;
    var model=$('chat-model').value; if(!model) return;
    chatMsgs.push({role:'user',content:txt}); inp.value='';
    var btn=$('chat-send'); btn.disabled=true; btn.textContent='发送中…';
    streamChat('/v1/chat/completions', {model:model, messages:chatMsgs.slice()}, 'chat-log', chatMsgs, btn);
  }
  // admin debug chat (specific key, no billing)
  var dbgMsgs=[];
  function initDbgChat(){
    var sel=$('dbg-key'); var prev=sel?sel.value:'';
    api('/admin/keys/list').then(function(r){
      if(!sel) return;
      if(!r.ok){ $('dbg-log').innerHTML='<span style="color:var(--faint)">// 拉取 key 列表失败,稍后重试</span>'; return; }
      var keys=(r.body&&r.body.keys)||[];
      var b=$('dbg-send');
      if(!keys.length){ $('dbg-log').innerHTML='<span style="color:var(--faint)">// 池子里还没有 key,先去「Key 池」添加</span>'; if(b) b.disabled=true; return; }
      if(b) b.disabled=false;
      sel.innerHTML = keys.map(function(k){ return '<option value="'+k.id+'">#'+k.id+' · '+k.provider+' · '+esc(k.masked)+' ('+k.status+')</option>'; }).join('');
      if(prev) sel.value=prev; // keep the operator's selection across section re-entry
    });
    var b=$('dbg-send'); if(b) b.onclick=sendDbg;
    var cl=$('dbg-clear'); if(cl) cl.onclick=function(){ dbgMsgs=[]; renderChat('dbg-log',dbgMsgs); };
    bindEnter('dbg-input', sendDbg);
  }
  function sendDbg(){
    var inp=$('dbg-input'), txt=inp.value.trim(); if(!txt) return;
    var id=$('dbg-key').value; if(!id){ $('dbg-log').innerHTML='<span style="color:var(--faint)">先在上方选一个 key</span>'; return; }
    var model=$('dbg-model').value.trim();
    dbgMsgs.push({role:'user',content:txt}); inp.value='';
    var btn=$('dbg-send'); btn.disabled=true;
    var payload={messages:dbgMsgs.slice()}; if(model) payload.model=model;
    streamChat('/admin/keys/'+id+'/chat', payload, 'dbg-log', dbgMsgs, btn);
  }

  // ---------------- usage / logs (shared renderers) ----------------
  function pct(ok,n){ return n>0 ? Math.round(ok/n*100)+'%' : '–'; }
  function renderUsage(d, p){
    $(p+'-total').textContent = fmtNum(d.total||0);
    $(p+'-rate').textContent = pct(d.ok||0, d.total||0);
    $(p+'-tokens').textContent = fmtNum(d.tokens||0);
    var rows=(d.byProvider||[]).map(function(x){
      return '<tr><td style="font-weight:700">'+esc(x.provider)+'</td><td class="n">'+fmtNum(x.n)+'</td>'
        +'<td class="n">'+fmtNum(x.ok)+'</td><td class="n">'+Math.round(x.avg_latency||0)+'ms</td>'
        +'<td class="n">'+fmtNum(x.tokens||0)+'</td></tr>';
    }).join('');
    $(p+'-byprov').innerHTML = rows || '<tr><td colspan="5" style="color:var(--faint)">暂无</td></tr>';
  }
  function renderRecent(rows, tbodyId, showOwner){
    var cols = showOwner ? 7 : 6;
    var html=(rows||[]).map(function(r){
      var t=fmtDate(r.created_at);
      var okc=r.ok?'var(--green)':'var(--red)';
      var owner='';
      if(showOwner){
        // admin view: who sent it. owner_sub NULL = an admin-minted token (no user).
        var who = r.owner_email || r.owner_name || (r.owner_sub ? ('…'+String(r.owner_sub).slice(-6)) : '管理员令牌');
        var full = r.owner_email || r.owner_name || r.owner_sub || '管理员令牌';
        owner='<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(String(full))+'">'+esc(String(who))+'</td>';
      }
      return '<tr><td style="color:var(--faint)">'+t+'</td>'+owner+'<td>'+esc(r.provider)+'</td>'
        +'<td>'+esc(r.model||'–')+'</td><td style="color:'+okc+'">'+(r.status_code==null?'–':r.status_code)+'</td>'
        +'<td class="n">'+(r.latency_ms==null?'–':r.latency_ms+'ms')+'</td>'
        +'<td class="n">'+(r.total_tokens==null?'–':fmtNum(r.total_tokens))+'</td></tr>';
    }).join('');
    $(tbodyId).innerHTML = html || '<tr><td colspan="'+cols+'" style="color:var(--faint)">暂无</td></tr>';
  }
  // Inline SVG daily bar chart: last 14 days (byDay is newest-first), drawn
  // oldest->newest, ok in green stacked under failures in the red accent.
  function renderDayChart(containerId, byDay){
    var el=$(containerId); if(!el) return;
    var days=(Array.isArray(byDay)?byDay:[]).slice(0,14).reverse(); // oldest -> newest
    if(!days.length){ el.innerHTML='<div class="hint" style="margin:0">暂无每日数据</div>'; return; }
    var slot=34, bw=22, H=128, base=H-22, top=18;
    var W=days.length*slot+10;
    var max=1; days.forEach(function(d){ var n=d.n||0; if(n>max) max=n; });
    var bars=days.map(function(d,i){
      var n=d.n||0, ok=d.ok||0, fail=n-ok; if(fail<0) fail=0;
      var x=5+i*slot;
      var hN=Math.round((n/max)*(base-top));
      var hFail=Math.round((fail/max)*(base-top));
      var hOk=hN-hFail; if(hOk<0) hOk=0;
      var yTop=base-hN;
      var label=String(d.day||'').slice(5); // MM-DD
      var g='';
      if(hFail>0) g+='<rect x="'+x+'" y="'+yTop+'" width="'+bw+'" height="'+hFail+'" fill="var(--red)" stroke="var(--ink)" stroke-width="1.5" rx="2"/>';
      if(hOk>0) g+='<rect x="'+x+'" y="'+(yTop+hFail)+'" width="'+bw+'" height="'+hOk+'" fill="var(--green)" stroke="var(--ink)" stroke-width="1.5" rx="2"/>';
      if(n>0) g+='<text x="'+(x+bw/2)+'" y="'+(yTop-3)+'" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="ui-monospace,monospace">'+esc(String(n))+'</text>';
      g+='<text x="'+(x+bw/2)+'" y="'+(H-7)+'" text-anchor="middle" font-size="8.5" fill="var(--faint)" font-family="ui-monospace,monospace">'+esc(label)+'</text>';
      return g;
    }).join('');
    // Fixed display height; width derives from the viewBox so a 2-day chart
    // stays small instead of being scaled up to fill the whole card.
    el.innerHTML='<svg height="150" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMinYMid meet" style="max-width:100%;display:block">'
      +'<line x1="5" y1="'+base+'" x2="'+(W-5)+'" y2="'+base+'" stroke="var(--ink)" stroke-width="1.5"/>'
      +bars+'</svg>';
  }
  function loadUserUsage(){
    ['u-total','u-rate','u-tokens'].forEach(function(i){ if($(i)) $(i).textContent='…'; });
    api('/me/usage').then(function(r){
      if(r.ok){ renderUsage(r.body,'u'); renderDayChart('u-chart', r.body&&r.body.byDay); return; }
      ['u-total','u-rate','u-tokens'].forEach(function(i){ if($(i)) $(i).textContent='–'; });
      $('u-byprov').innerHTML='<tr><td colspan="5"><span class="e">加载失败</span> · <button class="btn ghost small" id="u-usage-retry">重试</button></td></tr>';
      var rb=$('u-usage-retry'); if(rb) rb.onclick=loadUserUsage;
    }).catch(function(){ ['u-total','u-rate','u-tokens'].forEach(function(i){ if($(i)) $(i).textContent='–'; }); });
    api('/me/logs').then(function(r){
      if(r.ok){ renderRecent(Array.isArray(r.body)?r.body:[], 'u-recent'); return; }
      $('u-recent').innerHTML='<tr><td colspan="6" style="color:var(--red)">加载失败,点此重试</td></tr>';
      var c=$('u-recent').querySelector('td'); if(c) c.onclick=loadUserUsage;
    });
  }
  // admin logs view state: owner filter (owner_sub, '' = all) + zero-based page.
  var logsOwner='';
  var logsPage=0;
  function fmtUser(o){
    return o.owner_email || o.owner_name || (o.owner_sub ? ('…'+String(o.owner_sub).slice(-6)) : '管理员令牌');
  }
  function loadAdminLogs(){
    var q='?page='+logsPage+'&size=50'+(logsOwner?('&owner='+encodeURIComponent(logsOwner)):'');
    return api('/admin/logs'+q).then(function(r){
      if(!r.ok) return;
      var b=r.body||{}; var rows=b.rows||[];
      renderRecent(rows,'l-recent',true);
      var pg=$('logs-page'); if(pg) pg.textContent='第 '+(logsPage+1)+' 页';
      var pv=$('logs-prev'); if(pv) pv.disabled = logsPage<=0;
      var nx=$('logs-next'); if(nx) nx.disabled = !b.hasMore;
    });
  }
  function loadAdminRank(){
    return api('/admin/usage/by-user').then(function(r){
      if(!r.ok) return;
      var rows=Array.isArray(r.body)?r.body:[];
      var tb=$('l-rank'); if(!tb) return;
      if(!rows.length){ tb.innerHTML='<tr><td colspan="6" style="color:var(--faint)">暂无</td></tr>'; return; }
      tb.innerHTML=rows.map(function(u,i){
        var rate=u.n>0?Math.round(u.ok/u.n*100)+'%':'–';
        var last=u.last_at?new Date(u.last_at).toISOString().slice(5,16).replace('T',' '):'–';
        var full=u.owner_email||u.owner_name||u.owner_sub||'管理员令牌';
        return '<tr data-sub="'+esc(String(u.owner_sub||''))+'" style="cursor:pointer">'
          +'<td class="n">'+(i+1)+'</td>'
          +'<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(String(full))+'">'+esc(fmtUser(u))+'</td>'
          +'<td class="n">'+u.n+'</td><td class="n">'+rate+'</td>'
          +'<td class="n">'+(u.tokens||0)+'</td>'
          +'<td style="color:var(--faint)">'+last+'</td></tr>';
      }).join('');
      Array.prototype.forEach.call(tb.querySelectorAll('tr[data-sub]'),function(tr){
        tr.onclick=function(){
          logsOwner=tr.getAttribute('data-sub'); logsPage=0;
          var sel=$('logs-user'); if(sel) sel.value=logsOwner;
          loadAdminUsage();
        };
      });
    });
  }
  function loadAdminUsers(){
    var sel=$('logs-user'); if(!sel||sel.__filled) return;
    api('/admin/users').then(function(r){
      if(!r.ok) return;
      var users=Array.isArray(r.body)?r.body:[];
      var opts='<option value="">全部用户</option>';
      users.forEach(function(u){
        var label=u.email||u.name||('…'+String(u.sub).slice(-6));
        opts+='<option value="'+esc(String(u.sub))+'">'+esc(label)+'</option>';
      });
      sel.innerHTML=opts; sel.__filled=true; sel.value=logsOwner;
    });
  }
  function loadAdminUsage(){
    var oq=logsOwner?('?owner='+encodeURIComponent(logsOwner)):'';
    api('/admin/usage'+oq).then(function(r){ if(r.ok){ renderUsage(r.body,'l'); renderDayChart('l-chart', r.body&&r.body.byDay); } });
    loadAdminLogs();
    loadAdminRank();
    loadAdminUsers();
  }

  // ---------------- billing / balance (money in micro-USD) ----------------
  function usd(micro){ return ((micro==null?0:micro)/1000000).toFixed(4); }
  function txnRow(t, withSub){
    var time=fmtDate(t.created_at);
    var amtc=(t.kind==='topup')?'var(--green)':'var(--red)';
    var sign=(t.kind==='topup')?'+':'-';
    var cells='<td style="color:var(--faint)">'+esc(time)+'</td>';
    if(withSub) cells+='<td style="font-family:ui-monospace,monospace;font-size:12px" title="'+esc(String(t.sub||''))+'">'+esc(String(t.sub||'').slice(0,12))+'</td>';
    cells+='<td>'+esc(KIND_ZH[t.kind]||t.kind)+'</td>'
      +'<td class="n" style="color:'+amtc+'">'+sign+usd(Math.abs(t.amount_micro))+'</td>'
      +'<td class="n">'+usd(t.balance_after_micro)+'</td>'
      +'<td>'+esc(t.model||'–')+'</td>'
      +'<td class="n">'+(t.tokens==null?'–':t.tokens)+'</td>'
      +'<td style="color:var(--faint)">'+esc(t.note||'–')+'</td>';
    return '<tr>'+cells+'</tr>';
  }

  // ---------------- admin: billing ----------------
  function loadBilling(){
    loadBalances(); loadBillingTxns(); loadPrices();
    api('/admin/config').then(function(r){ if(!r.ok) return; var b=r.body||{};
      var zhe = b.discount!=null ? (b.discount*10) : 10;
      $('bill-config').innerHTML = '· 计费'+(b.billing_enabled?'<b style="color:var(--green)">开</b>':'<b style="color:var(--red)">关</b>')+' · 折扣 <b>'+zhe+'折</b>(市场价×'+(b.discount!=null?b.discount:1)+')';
    });
  }
  function loadBalances(){
    var tb=$('bill-balances-body');
    return api('/admin/balances').then(function(r){
      if(!r.ok){ tb.innerHTML='<tr><td colspan="4" class="e">错误 '+r.status+'</td></tr>'; ['bal-sum','bal-users','bal-paid'].forEach(function(i){ if($(i)) $(i).textContent='–'; }); return; }
      var list=Array.isArray(r.body)?r.body:[];
      var bsum=0,bpaid=0; list.forEach(function(b){ var m=b.balance_micro||0; bsum+=m; if(m>0)bpaid++; });
      if($('bal-sum')) $('bal-sum').textContent=usd(bsum);
      if($('bal-users')) $('bal-users').textContent=list.length;
      if($('bal-paid')) $('bal-paid').textContent=bpaid;
      if(!list.length){ tb.innerHTML='<tr><td colspan="4" style="color:var(--faint)">暂无</td></tr>'; return; }
      tb.innerHTML=list.map(function(b){
        return '<tr><td style="font-weight:700; word-break:break-all">'+esc(b.email||'–')+'</td>'
          +'<td style="font-family:ui-monospace,monospace;font-size:12px">'+esc(String(b.sub||'').slice(0,16))+'</td>'
          +'<td class="n">'+usd(b.balance_micro)+'</td>'
          +'<td><button class="btn ghost small" data-fillsub="'+esc(b.sub)+'">充值</button></td></tr>';
      }).join('');
      Array.prototype.forEach.call(tb.querySelectorAll('[data-fillsub]'), function(btn){
        btn.onclick=function(){ $('bill-sub').value=btn.getAttribute('data-fillsub'); $('bill-amount').focus(); };
      });
    }).catch(function(){ tb.innerHTML='<tr><td colspan="4" class="e">出错</td></tr>'; ['bal-sum','bal-users','bal-paid'].forEach(function(i){ if($(i)) $(i).textContent='–'; }); });
  }
  function loadBillingTxns(){
    var tb=$('bill-txns-body');
    return api('/admin/transactions').then(function(r){
      var list=Array.isArray(r.body)?r.body:[];
      if(!list.length){ tb.innerHTML='<tr><td colspan="8" style="color:var(--faint)">暂无</td></tr>'; return; }
      tb.innerHTML=list.map(function(t){ return txnRow(t, true); }).join('');
    }).catch(function(){ tb.innerHTML='<tr><td colspan="8" class="e">出错</td></tr>'; });
  }
  function topUp(){
    var sub=$('bill-sub').value.trim();
    var amount=parseFloat($('bill-amount').value);
    var note=$('bill-note').value.trim();
    var o=$('bill-topup-out'); o.style.display='block';
    if(!sub || !(amount>0)){ o.innerHTML='<span class="e">请填写有效的 sub 和金额</span>'; return; }
    var btn=$('bill-topup'); btn.disabled=true;
    var payload={amount_usd:amount}; if(note) payload.note=note;
    api('/admin/balances/'+encodeURIComponent(sub)+'/topup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){ btn.disabled=false;
      if(!r.ok){ var msg=(r.body&&r.body.error&&r.body.error.message)||('错误 '+r.status); o.innerHTML='<span class="e">'+esc(msg)+'</span>'; return; }
      var bal=(r.body&&r.body.balance_micro);
      o.innerHTML='<span class="k">充值成功</span> 新余额 '+usd(bal)+' USD';
      $('bill-amount').value=''; $('bill-note').value='';
      loadBalances(); loadBillingTxns();
    }).catch(function(){ btn.disabled=false; o.innerHTML='<span class="e">网络错误</span>'; });
  }

  // ---------------- admin: model prices ----------------
  function priceUsd(micro){ return ((micro==null?0:micro)/1000000).toFixed(4); }
  function loadPrices(){
    var tb=$('prices-body');
    return api('/admin/prices').then(function(r){
      var list=Array.isArray(r.body)?r.body:((r.body&&r.body.prices)||[]);
      if(!Array.isArray(list)||!list.length){ tb.innerHTML='<tr><td colspan="4" style="color:var(--faint)">暂无</td></tr>'; return; }
      tb.innerHTML=list.map(function(p){
        var inp=p.input_per_mtok_micro!=null?p.input_per_mtok_micro:p.price_per_mtok_micro;
        var out=p.output_per_mtok_micro!=null?p.output_per_mtok_micro:p.price_per_mtok_micro;
        return '<tr><td style="font-weight:700" class="mono-token">'+esc(p.model)+'</td>'
          +'<td class="n">'+priceUsd(inp)+'</td>'
          +'<td class="n">'+priceUsd(out)+'</td>'
          +'<td><button class="btn ghost small" data-editprice="'+esc(p.model)+'" data-pin="'+esc(priceUsd(inp))+'" data-pout="'+esc(priceUsd(out))+'">编辑</button></td></tr>';
      }).join('');
      Array.prototype.forEach.call(tb.querySelectorAll('[data-editprice]'), function(btn){
        btn.onclick=function(){
          $('price-model').value=btn.getAttribute('data-editprice');
          $('price-input').value=btn.getAttribute('data-pin');
          $('price-output').value=btn.getAttribute('data-pout');
          $('price-model').focus();
        };
      });
    }).catch(function(){ tb.innerHTML='<tr><td colspan="4" class="e">出错</td></tr>'; });
  }
  function savePrice(){
    var model=$('price-model').value.trim();
    var inUsd=parseFloat($('price-input').value);
    var outUsd=parseFloat($('price-output').value);
    var o=$('price-out'); o.style.display='block';
    if(!model || !(inUsd>=0) || !(outUsd>=0)){ o.innerHTML='<span class="e">请填写模型与有效价格</span>'; return; }
    var btn=$('price-save'); btn.disabled=true;
    var payload={ model:model, input_per_mtok_micro:Math.round(inUsd*1000000), output_per_mtok_micro:Math.round(outUsd*1000000) };
    api('/admin/prices',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){ btn.disabled=false;
      if(!r.ok){ var msg=(r.body&&r.body.error&&r.body.error.message)||('错误 '+r.status); o.innerHTML='<span class="e">'+esc(msg)+'</span>'; return; }
      o.innerHTML='<span class="k">已保存</span> '+esc(model);
      $('price-model').value=''; $('price-input').value=''; $('price-output').value='';
      loadPrices();
    }).catch(function(){ btn.disabled=false; o.innerHTML='<span class="e">网络错误</span>'; });
  }

  // ---------------- consumer: top-up via Stripe ----------------
  function checkout(){
    var amount=parseFloat($('bal-topup-amount').value);
    var o=$('bal-topup-out'); o.style.display='block';
    if(!(amount>0)){ o.innerHTML='<span class="e">请填写有效金额</span>'; return; }
    var btn=$('bal-topup-btn'); btn.disabled=true;
    api('/me/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({amount_usd:amount})})
    .then(function(r){ btn.disabled=false;
      if(r.status===503){ o.innerHTML='<span class="e">支付未配置</span>'; return; }
      if(r.ok && r.body && r.body.url){ location.href=r.body.url; return; }
      var msg=(r.body&&r.body.error&&r.body.error.message)||('错误 '+r.status); o.innerHTML='<span class="e">'+esc(msg)+'</span>';
    }).catch(function(){ btn.disabled=false; o.innerHTML='<span class="e">网络错误</span>'; });
  }

  // ---------------- consumer: balance ----------------
  function loadBalance(){
    if(/[?&]topup=success(?:&|$)/.test(location.search)){ var h=$('bal-topup-success'); if(h) h.style.display='block'; }
    api('/me/balance').then(function(r){
      // distinguish a failed read from a genuine zero balance — never show fake 0.0000
      if(!(r.ok && r.body && r.body.balance_micro!=null)){ $('bal-usd').innerHTML='<span class="e">读取失败</span>'; return; }
      var bal=r.body.balance_micro;
      $('bal-usd').textContent = usd(bal);
      $('bal-usd').style.color = bal<=0 ? 'var(--red)' : '';
    }).catch(function(){ $('bal-usd').textContent='–'; });
    var tb=$('bal-txns-body');
    api('/me/transactions').then(function(r){
      var list=Array.isArray(r.body)?r.body:[];
      if(!list.length){ tb.innerHTML='<tr><td colspan="7" style="color:var(--faint)">暂无</td></tr>'; return; }
      tb.innerHTML=list.map(function(t){ return txnRow(t, false); }).join('');
    }).catch(function(){ tb.innerHTML='<tr><td colspan="7" class="e">出错</td></tr>'; });
  }

  // ---------------- admin: per-key list ----------------
  function checkAllKeys(){
    var btn=$('keylist-checkall'), out=$('keylist-checkall-out');
    if(btn) btn.disabled=true; if(out) out.textContent='检测中…(几十个 key 需要十几秒)';
    api('/admin/check-all-keys',{method:'POST'}).then(function(r){
      if(btn) btn.disabled=false; var b=r.body||{};
      if(out){
        var base='<span style="color:var(--green)">可用 '+(b.alive||0)+'</span> / 不可用 '+(b.dead||0);
        out.innerHTML = b.capped
          ? base+' · 本轮检测 '+(b.checked||0)+'/'+(b.total||0)+'(单次上限,其余下轮自动轮替)'
          : base;
      }
      loadKeyList();
    }).catch(function(){ if(btn) btn.disabled=false; if(out) out.textContent='出错'; });
  }
  var keylistShowDisabled = false;
  function loadKeyList(){
    var tb=$('keylist-body');
    tb.innerHTML='<tr><td colspan="7" style="color:var(--faint)">加载中…</td></tr>';
    return api('/admin/keys/list').then(function(r){
      var all=(r.body && r.body.keys) || [];
      var sm=$('keylist-summary');
      if(sm){
        var cD=0,cC=0,cW=0,cA=0;
        all.forEach(function(k){
          if(k.status==='disabled') cD++;
          else if(k.status==='cooldown') cC++;
          else if(k.last_error) cW++;
          else cA++;
        });
        sm.innerHTML = all.length
          ? ('共 '+all.length+' · 可用 '+cA+' · 冷却 '+cC+' · 禁用 '+cD+(cW?' · 异常 '+cW:''))
          : '池子为空';
      }
      var disN = all.filter(function(k){return k.status==='disabled';}).length;
      var tg=$('keylist-toggle'); if(tg) tg.textContent = keylistShowDisabled ? '只看启用' : ('显示禁用('+disN+')');
      var keys = keylistShowDisabled ? all : all.filter(function(k){return k.status!=='disabled';});
      if(!all.length){ tb.innerHTML='<tr><td colspan="7" style="color:var(--faint)">还没有 key</td></tr>'; return; }
      if(!keys.length){ tb.innerHTML='<tr><td colspan="7" style="color:var(--faint)">全部已禁用 · 点「显示禁用」查看</td></tr>'; return; }
      tb.innerHTML = keys.map(function(k){
        // active + a lingering last_error = valid key that's currently failing
        // (e.g. throttled gemini) — show amber 'warn', not a misleading green.
        var sd = k.status==='disabled' ? 'd-disabled'
               : k.status==='cooldown' ? 'd-cooldown'
               : k.last_error ? 'd-warn'
               : 'd-active';
        var reason = (k.status==='disabled' && k.disabled_reason) ? k.disabled_reason : k.last_error;
        var err = reason ? esc(String(reason).slice(0,60)) : '';
        var sLabel = sd==='d-disabled'?'已禁用':sd==='d-cooldown'?'冷却中':sd==='d-warn'?'异常(仍在用)':'可用';
        var toggle = (k.status==='active')
          ? '<button class="btn ghost small kl-disable">禁用</button>'
          : '<button class="btn ghost small kl-enable">启用</button>';
        // gemini keys carry a Google project id (parsed on probe); show a short
        // 'proj …<last4>' badge so the operator can spot keys sharing a project.
        var proj = k.project_id
          ? ' <span class="badge" style="background:var(--cream);border-color:#cfcbbd;color:var(--faint);font-size:9.5px;padding:0 6px" title="project '+esc(String(k.project_id))+'">proj …'+esc(String(k.project_id).slice(-4))+'</span>'
          : '';
        return '<tr data-id="'+k.id+'">'
          +'<td><span class="dot '+sd+'" title="'+sLabel+'"></span>'+esc(k.provider)+proj+'</td>'
          +'<td style="font-family:ui-monospace,monospace;font-size:12.5px">'+esc(k.masked)+'</td>'
          +'<td class="n">'+k.total_requests+' / '+k.total_fails+'</td>'
          +'<td style="max-width:180px;color:var(--faint);font-size:12px;overflow:hidden;text-overflow:ellipsis"'+(reason?' title="'+esc(String(reason))+'"':'')+'>'+err+'</td>'
          +'<td class="kl-result" style="font-size:12.5px;white-space:nowrap"></td>'
          +'<td style="color:var(--faint);font-size:12px;white-space:nowrap" title="'+(k.created_at?esc(new Date(k.created_at).toLocaleString()):'')+'">'+(k.created_at?fmtDate(k.created_at):'–')+'</td>'
          +'<td style="white-space:nowrap"><button class="btn ghost small kl-check">测活</button> '+toggle+' <button class="btn ghost small kl-del">删</button></td>'
          +'</tr>';
      }).join('');
      Array.prototype.forEach.call(tb.querySelectorAll('tr[data-id]'), function(tr){
        var id=tr.getAttribute('data-id');
        var res=tr.querySelector('.kl-result');
        var chk=tr.querySelector('.kl-check');
        if(chk) chk.onclick=function(){
          chk.disabled=true; res.textContent='测…';
          api('/admin/keys/'+id+'/check',{method:'POST'}).then(function(r){
            chk.disabled=false; var b=r.body||{};
            if(b.alive){
              var bal = (b.balance && b.balance.remaining!=null)
                ? ' · 余 '+(Math.round(b.balance.remaining*100)/100)+' '+b.balance.unit : '';
              res.innerHTML='<span style="color:var(--green)">可用'+(b.rateLimited?'(限流)':'')+'</span>'+bal;
            } else { res.innerHTML='<span style="color:var(--red)">不可用 '+(b.status||'')+'</span>'; }
            setTimeout(loadKeyList, 1000);
          }).catch(function(){ chk.disabled=false; res.innerHTML='<span style="color:var(--red)">出错</span>'; });
        };
        var en=tr.querySelector('.kl-enable'); if(en) en.onclick=function(){ api('/admin/keys/'+id+'/enable',{method:'POST'}).then(loadKeyList); };
        var dis=tr.querySelector('.kl-disable'); if(dis) dis.onclick=function(){ api('/admin/keys/'+id+'/disable',{method:'POST'}).then(loadKeyList); };
        var del=tr.querySelector('.kl-del'); if(del) del.onclick=function(){ if(confirm('删除这个 key?不可恢复')) api('/admin/keys/'+id,{method:'DELETE'}).then(loadKeyList); };
      });
    }).catch(function(){
      tb.innerHTML='<tr><td colspan="7" style="color:var(--red)">加载失败 · <button class="btn ghost small" id="keylist-retry">重试</button></td></tr>';
      var rb=$('keylist-retry'); if(rb) rb.onclick=loadKeyList;
      var sm=$('keylist-summary'); if(sm) sm.innerHTML='';
    });
  }

  // ---------------- consumer: dashboard ----------------
  function loadDashboard(){
    $('dash-greet').textContent = '// 欢迎回来, ' + (me.email||'');
    var ep = 'POST ' + base + '/v1/chat/completions';
    var es=$('dash-endpoint'); es.textContent = ep; es.setAttribute('data-copy', ep); bindCopy(es.parentNode);
    var cc=$('dash-curl-copy'); if(cc) cc.onclick = function(){ copy($('dash-curl').textContent, cc); };
    var tu=$('dash-topup'); if(tu) tu.onclick = function(){ selectSection('balance'); };
    loadDashTokens();
    loadDashStats();
  }
  function loadDashTokens(){
    var area=$('dash-token-area');
    area.innerHTML = '<div class="hint" style="color:var(--faint)">加载令牌中…</div>';
    api('/me/tokens').then(function(r){
      if(!r.ok){
        area.innerHTML = '<span class="e">令牌加载失败</span> · <button class="btn ghost small" id="dash-tok-retry">重试</button>';
        var rb=$('dash-tok-retry'); if(rb) rb.onclick=loadDashTokens;
        $('dash-curl').innerHTML = curlSnippet(null); return;
      }
      var list = Array.isArray(r.body)? r.body : [];
      var enabled = list.filter(function(t){ return t.enabled; });
      var tok = enabled.length ? enabled[0].token : null;
      if(tok){
        area.innerHTML = '<label>你的令牌</label>'
          + '<div class="endpoint"><span class="mono-token copyable" data-copy="'+esc(tok)+'">'+esc(tok)+'</span></div>'
          + '<div class="hint">点击即可复制。更多令牌见「我的令牌」。</div>';
        bindCopy(area);
      } else if(me.status!=='approved'){
        area.innerHTML = '<div class="hint">账号待开通，请联系管理员</div>';
      } else {
        area.innerHTML = '<button class="btn primary" id="dash-first">生成我的第一个令牌</button>'
          + '<div class="hint">还没有令牌。生成后即可调用接口。</div>';
        $('dash-first').onclick = function(){ selectSection('tokens'); };
      }
      $('dash-curl').innerHTML = curlSnippet(tok);
    }).catch(function(){
      area.innerHTML = '<span class="e">网络错误</span> · <button class="btn ghost small" id="dash-tok-retry">重试</button>';
      var rb=$('dash-tok-retry'); if(rb) rb.onclick=loadDashTokens;
      $('dash-curl').innerHTML = curlSnippet(null);
    });
  }
  function loadDashStats(){
    var bn=$('dash-balance'), bh=$('dash-bal-hint');
    bn.textContent='…'; if(bh) bh.style.display='none';
    api('/me/balance').then(function(r){
      // distinguish a failed read from a genuine zero balance — never show fake 0.0000
      if(!(r.ok && r.body && r.body.balance_micro!=null)){ bn.innerHTML='<span class="e">读取失败</span>'; return; }
      var bal=r.body.balance_micro;
      bn.textContent = usd(bal);
      if(bh) bh.style.display = bal<=0 ? 'block' : 'none';
    }).catch(function(){ bn.textContent='–'; });
    var rq=$('dash-req'), tk=$('dash-tok');
    rq.textContent='…'; tk.textContent='…';
    api('/me/usage').then(function(r){
      if(!(r.ok && r.body)){ rq.textContent='–'; tk.textContent='–'; return; }
      rq.textContent = fmtNum(r.body.total||0);
      tk.textContent = fmtNum(r.body.tokens||0);
    }).catch(function(){ rq.textContent='–'; tk.textContent='–'; });
  }
  function curlSnippet(tok){
    var key = tok || '$KEY';
    var model = (modelsCache && modelsCache[0] && modelsCache[0].id) || 'gemini-2.0-flash';
    return 'curl ' + base + '/v1/chat/completions \\\n'
      + '  -H "Authorization: Bearer ' + esc(key) + '" \\\n'
      + '  -H "Content-Type: application/json" \\\n'
      + '  -d \'{"model":"' + esc(model) + '","messages":[{"role":"user","content":"hello"}]}\'';
  }

  function bindCopy(scope){
    Array.prototype.forEach.call((scope||document).querySelectorAll('.copyable'), function(el){
      if(el.__bound) return; el.__bound=true;
      el.onclick = function(){ copy(el.getAttribute('data-copy'), el); };
    });
  }

  // ---------------- consumer: my tokens ----------------
  function loadMyTokens(){
    var tb=$('my-token-list');
    if(tb) tb.innerHTML='<tr><td colspan="9" style="color:var(--faint)">加载中…</td></tr>';
    return api('/me/tokens').then(function(r){
      if(!r.ok){ tb.innerHTML='<tr><td colspan="9" style="color:var(--red)">加载失败 · '+esc((r.body&&r.body.error&&r.body.error.message)||('错误 '+r.status))+' <button class="btn ghost small" id="my-tokens-retry">重试</button></td></tr>'; var rb=$('my-tokens-retry'); if(rb) rb.onclick=loadMyTokens; return; }
      var list = Array.isArray(r.body)? r.body : [];
      if(!list.length){ tb.innerHTML='<tr><td colspan="9" style="color:var(--faint)">还没有令牌</td></tr>'; return; }
      tb.innerHTML = list.map(function(t){
        var expired = t.expires_at!=null && Date.now()>t.expires_at;
        return '<tr><td>'+t.id+'</td>'
          + '<td style="font-weight:700">'+esc(t.name||'–')+'</td>'
          + '<td><span class="mono-token copyable" data-copy="'+esc(t.token)+'">'+esc(t.token)+'</span></td>'
          + '<td>'+(expired?'<span class="dot d-disabled"></span><span style="color:var(--red)">已过期</span>':'<span class="dot '+(t.enabled?'d-active':'d-disabled')+'"></span>'+(t.enabled?'启用':'停用'))+'</td>'
          + '<td class="n">'+t.used_requests+'/'+(t.quota_requests==null?'∞':t.quota_requests)+'</td>'
          + '<td class="n">'+(t.rpm_limit==null?'∞':t.rpm_limit+'/min')+'</td>'
          + '<td style="color:var(--faint)">'+(t.expires_at==null?'永久':(expired?'<span style="color:var(--red)">已过期</span>':fmtDate(t.expires_at)))+'</td>'
          + '<td style="color:var(--faint)">'+fmtDate(t.created_at)+'</td>'
          + '<td><button class="btn ghost small" data-del="'+t.id+'">删除</button></td></tr>';
      }).join('');
      bindCopy(tb);
      Array.prototype.forEach.call(tb.querySelectorAll('[data-del]'), function(b){
        b.onclick = function(){
          if(!confirm('删除该令牌？此操作不可撤销。')) return;
          b.disabled=true;
          api('/me/tokens/'+b.getAttribute('data-del'),{method:'DELETE'}).then(function(r){ if(!r.ok){ b.disabled=false; return; } loadMyTokens(); }).catch(function(){ b.disabled=false; });
        };
      });
    }).catch(function(){ if(tb) tb.innerHTML='<tr><td colspan="9" style="color:var(--red)">网络错误</td></tr>'; });
  }
  function mintMy(){
    var name=$('my-tname').value.trim();
    var btn=$('my-mint'); btn.disabled=true; btn.textContent='生成中…';
    api('/me/tokens',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name})})
    .then(function(r){ btn.disabled=false; btn.textContent='生成令牌'; var o=$('my-mint-out'); o.style.display='block';
      if(!r.ok){
        var msg=(r.body&&r.body.error&&r.body.error.message)||('错误 '+r.status);
        o.innerHTML='<span class="e">'+esc(msg)+'</span>'; return;
      }
      o.innerHTML='新令牌(立即复制): <span class="k mono-token copyable" data-copy="'+esc(r.body.token)+'">'+esc(r.body.token)+'</span> <button class="btn ghost small" id="my-mint-close">我已复制 · 关闭</button>';
      bindCopy(o); var cb=$('my-mint-close'); if(cb) cb.onclick=function(){ o.style.display='none'; o.innerHTML=''; }; $('my-tname').value=''; loadMyTokens();
    }).catch(function(){ btn.disabled=false; btn.textContent='生成令牌'; });
  }

  // ---------------- docs (shared, static from models) ----------------
  function fillDocs(){
    var model = (modelsCache && modelsCache[0] && modelsCache[0].id) || 'gemini-2.0-flash';
    function setEp(id, val){ var el=$(id); if(!el) return; el.textContent=val; el.setAttribute('data-copy', val); }
    setEp('docs-endpoint', 'POST ' + base + '/v1/chat/completions');
    setEp('docs-baseurl', base + '/v1');
    setEp('docs-models-ep', base + '/v1/models');
    setEp('docs-anthropic-ep', base + '/v1/messages');

    var curlRaw = 'curl ' + base + '/v1/chat/completions \\\n'
      + '  -H "Authorization: Bearer <你的令牌>" \\\n'
      + '  -H "Content-Type: application/json" \\\n'
      + '  -d \'{"model":"' + model + '","messages":[{"role":"user","content":"hello"}]}\'';
    $('docs-curl').innerHTML = esc(curlRaw);

    var reqRaw = '{\n'
      + '  "model": "' + model + '",\n'
      + '  "messages": [{"role":"user","content":"hello"}],\n'
      + '  "stream": false,\n'
      + '  "fallback": true\n'
      + '}';
    if($('docs-reqbody')) $('docs-reqbody').innerHTML = esc(reqRaw);

    var sdkRaw = 'from openai import OpenAI\n'
      + 'client = OpenAI(\n'
      + '    base_url="' + base + '/v1",\n'
      + '    api_key="<你的令牌>",\n'
      + ')\n'
      + 'resp = client.chat.completions.create(\n'
      + '    model="' + model + '",\n'
      + '    messages=[{"role":"user","content":"hello"}],\n'
      + ')\n'
      + 'print(resp.choices[0].message.content)';
    $('docs-sdk').innerHTML = esc(sdkRaw);

    var anthRaw = 'curl ' + base + '/v1/messages \\\n'
      + '  -H "x-api-key: <你的令牌>" \\\n'
      + '  -H "anthropic-version: 2023-06-01" \\\n'
      + '  -H "Content-Type: application/json" \\\n'
      + '  -d \'{"model":"' + model + '","max_tokens":1024,"messages":[{"role":"user","content":"hello"}]}\'';
    if($('docs-anthropic')) $('docs-anthropic').innerHTML = esc(anthRaw);

    function bindBtn(id, raw){ var b=$(id); if(b) b.onclick=function(){ copy(raw, this); }; }
    bindBtn('docs-curl-copy', curlRaw);
    bindBtn('docs-reqbody-copy', reqRaw);
    bindBtn('docs-sdk-copy', sdkRaw);
    bindBtn('docs-anthropic-copy', anthRaw);

    bindCopy($('sec-docs'));
  }

  // ---------------- admin: stats (overview + keys) ----------------
  function renderStats(s, tbodyId){
    var t=(s&&s.totals)||{active:0,cooldown:0,disabled:0};
    if($('t-active')){ $('t-active').textContent=t.active; $('t-cooldown').textContent=t.cooldown; $('t-disabled').textContent=t.disabled; }
    var total=(t.active||0)+(t.cooldown||0)+(t.disabled||0);
    // overview-only: one-line health verdict + 更新于 stamp in the 池子状态 card header
    if(tbodyId==='ov-byprovider'){
      var vd=$('ov-verdict');
      if(vd){
        if(total===0) vd.innerHTML='<span class="dot d-disabled"></span>池子为空';
        else if((t.cooldown||0)+(t.disabled||0)===0) vd.innerHTML='<span class="dot d-active"></span>全部可用';
        else vd.innerHTML='<span class="dot d-cooldown"></span>有 '+(t.cooldown||0)+' 个冷却 · '+(t.disabled||0)+' 个禁用';
      }
      var stp=$('ov-stamp'); if(stp) stp.textContent='更新于 '+fmtDate(Date.now());
    }
    var html='';
    if(total===0){
      // pool empty: don't render phantom all-zero gemini/mistral/openrouter rows
      html='<tr><td colspan="4" class="kp-stats-empty" style="color:var(--faint);cursor:pointer">还没有 key · 去「Key 池」导入</td></tr>';
    } else {
      var prov={}, order=['gemini','mistral','openrouter'];
      order.forEach(function(p){ prov[p]={active:0,cooldown:0,disabled:0}; });
      ((s&&s.byProviderStatus)||[]).forEach(function(r){ if(!prov[r.provider])prov[r.provider]={active:0,cooldown:0,disabled:0}; prov[r.provider][r.status]=r.n; });
      Object.keys(prov).forEach(function(p){ var x=prov[p];
        html += '<tr><td style="font-weight:700">'+p+'</td>'
          +'<td class="n"><span class="dot d-active '+(x.active>0?'':'d-zero')+'"></span>'+x.active+'</td>'
          +'<td class="n"><span class="dot d-cooldown '+(x.cooldown>0?'':'d-zero')+'"></span>'+x.cooldown+'</td>'
          +'<td class="n"><span class="dot d-disabled '+(x.disabled>0?'':'d-zero')+'"></span>'+x.disabled+'</td></tr>';
      });
    }
    if($(tbodyId)){
      $(tbodyId).innerHTML = html;
      var ec=$(tbodyId).querySelector('.kp-stats-empty');
      if(ec) ec.onclick=function(){ selectSection('keys'); };
    }
  }
  function loadStats(prefix){
    var tbodyId = prefix==='ov' ? 'ov-byprovider' : 'keys-byprovider';
    if($(tbodyId)) $(tbodyId).innerHTML='<tr><td colspan="4" style="color:var(--faint)">加载中…</td></tr>';
    function errTiles(){ ['t-active','t-cooldown','t-disabled'].forEach(function(i){ if($(i)) $(i).textContent='–'; }); if(prefix==='ov'){ var vd=$('ov-verdict'); if(vd) vd.innerHTML=''; var stp=$('ov-stamp'); if(stp) stp.textContent=''; } }
    return api('/admin/keys').then(function(r){
      if(!r.ok){ if($(tbodyId)) $(tbodyId).innerHTML='<tr><td colspan="4" class="e">错误 '+r.status+'</td></tr>'; errTiles(); return; }
      renderStats(r.body, tbodyId);
    }).catch(function(){ if($(tbodyId)) $(tbodyId).innerHTML='<tr><td colspan="4" class="e">网络错误</td></tr>'; errTiles(); });
  }
  function probe(){
    var btn=$('ov-probe'); btn.disabled=true; var o=$('ov-probe-out'); o.style.display='block'; o.textContent='巡检中…';
    api('/admin/probe',{method:'POST'}).then(function(r){ btn.disabled=false;
      if(!r.ok){ o.innerHTML='<span class="e">错误 '+r.status+'</span>'; return; }
      var b=r.body||{};
      // format the typed fields into Chinese instead of dumping raw English JSON
      if(b.revived!=null || b.probed!=null || b.reactivated!=null)
        o.innerHTML='<span class="k">巡检完成</span> 唤醒冷却 '+(b.revived||0)+' · 探测禁用 '+(b.probed||0)+' · 复活 '+(b.reactivated||0);
      else o.innerHTML='<span class="k">巡检完成</span> '+esc(JSON.stringify(b));
      loadStats('ov');
    }).catch(function(){ btn.disabled=false; o.innerHTML='<span class="e">网络错误</span>'; });
  }
  function importKeys(){
    var keys=$('keys').value; if(!keys.trim()) return;
    var btn=$('importBtn'); btn.disabled=true; var o=$('importOut'); o.style.display='block'; o.textContent='导入中…(坏 key 会即时试调)';
    api('/admin/keys/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keys:keys})})
    .then(function(r){ btn.disabled=false;
      if(!r.ok){ o.innerHTML='<span class="e">'+esc((r.body&&r.body.error&&r.body.error.message)||('错误 '+r.status))+'</span>'; return; }
      var b=r.body||{}, by=b.byProvider?Object.keys(b.byProvider).map(function(k){return k+'='+b.byProvider[k];}).join('  '):'';
      var skipN=(b.skipped&&b.skipped.length)||0;
      var html='<span class="k">新增 '+b.added+'</span>  重复 '+b.duplicate+'  跳过 '+skipN+'\n'+esc(by);
      if(skipN && Array.isArray(b.skipped)) html+='\n<span class="e">以下行已跳过(检查 provider 前缀):</span>\n'+b.skipped.map(function(s){return esc(String(s).slice(0,40));}).join('\n');
      o.innerHTML=html;
      $('keys').value=''; loadStats('keys'); loadStats('ov');
    }).catch(function(){ btn.disabled=false; o.innerHTML='<span class="e">网络错误</span>'; });
  }

  // ---------------- admin: model availability ----------------
  function loadModelStatus(){
    var el=$('modelstatus-body'); if(!el) return;
    return api('/admin/models-status').then(function(r){
      var list=Array.isArray(r.body)?r.body:[];
      if(!list.length){ el.innerHTML='<span style="color:var(--faint)">尚未探测 · 点「探测模型」逐个试调</span>'; return; }
      var bad=list.filter(function(m){ return !m.available; });
      if(!bad.length){ el.innerHTML='<span style="color:var(--green)">全部模型可用</span> · 已探测 '+list.length+' 个'; return; }
      el.innerHTML = '<div style="margin-bottom:6px;color:var(--muted)">不可用 '+bad.length+' / 已探测 '+list.length+'</div>'
        + bad.map(function(m){
          return '<div style="margin:3px 0"><span class="dot d-disabled"></span><b class="mono-token">'+esc(m.model)+'</b>'
            +' <span style="color:var(--faint);font-size:12px">'+esc(m.provider||'')+'</span>'
            +(m.reason?' · <span style="color:var(--red);font-size:12px">'+esc(String(m.reason).slice(0,80))+'</span>':'')+'</div>';
        }).join('');
    }).catch(function(){ el.innerHTML='<span class="e">出错</span>'; });
  }
  function probeModels(){
    var btn=$('modelstatus-probe'); var el=$('modelstatus-body');
    if(btn) btn.disabled=true; if(el) el.innerHTML='探测中…(逐个模型试调一次,稍候十几秒)';
    api('/admin/probe-models',{method:'POST'}).then(function(){ if(btn) btn.disabled=false; loadModelStatus(); })
    .catch(function(){ if(btn) btn.disabled=false; loadModelStatus(); });
  }

  // ---------------- admin: users ----------------
  function loadUsers(){
    var tb=$('users-body');
    if(tb) tb.innerHTML='<tr><td colspan="5" style="color:var(--faint)">加载中…</td></tr>';
    return api('/admin/users').then(function(r){
      if(!r.ok){ tb.innerHTML='<tr><td colspan="5" style="color:var(--red)">加载失败 ('+r.status+') · <button class="btn ghost small" id="users-retry">重试</button></td></tr>'; var rb=$('users-retry'); if(rb) rb.onclick=loadUsers; var pb0=$('users-pending'); if(pb0) pb0.textContent=''; return; }
      var list = Array.isArray(r.body)? r.body : [];
      var pb=$('users-pending');
      if(pb){
        var pend=list.filter(function(u){return u.status==='pending';}).length;
        pb.className = pend>0 ? 'badge b-pending' : 'badge';
        pb.style.color = pend>0 ? '' : 'var(--faint)';
        pb.textContent = pend>0 ? ('待开通 '+pend) : '无待开通';
      }
      if(!list.length){ tb.innerHTML='<tr><td colspan="5" style="color:var(--faint)">还没有用户</td></tr>'; return; }
      tb.innerHTML = list.map(function(u){
        var bcls = u.status==='approved'?'b-approved':(u.status==='blocked'?'b-blocked':'b-pending');
        var action='';
        // never offer 停用 on an admin row — would let an admin lock themselves out.
        if(u.role==='admin') action='<span class="hint">管理员</span>';
        else if(u.status==='approved') action='<button class="btn ghost small" data-block="'+u.id+'">停用</button>';
        else if(u.status==='blocked') action='<button class="btn primary small" data-approve="'+u.id+'" data-was-blocked="1">恢复</button>';
        else action='<button class="btn primary small" data-approve="'+u.id+'">开通</button>';
        var hot = u.status==='pending' ? ' class="hot"' : '';
        return '<tr'+hot+'><td style="font-weight:700; word-break:break-all">'+esc(u.email||u.name||u.sub||'–')+'</td>'
          + '<td>'+esc(ROLE_CN[u.role]||u.role)+'</td>'
          + '<td><span class="badge '+bcls+'"'+(u.approved_at?' title="开通于 '+esc(fmtDate(u.approved_at))+'"':'')+'>'+esc(STATUS_CN[u.status]||u.status)+'</span></td>'
          + '<td style="color:var(--faint)">'+fmtDate(u.created_at)+'</td>'
          + '<td>'+action+'</td></tr>';
      }).join('');
      Array.prototype.forEach.call(tb.querySelectorAll('[data-approve]'), function(b){
        b.onclick=function(){
          if(b.getAttribute('data-was-blocked') && !confirm('恢复该用户？其令牌仍为停用状态,需另行启用。')) return;
          b.disabled=true; api('/admin/users/'+b.getAttribute('data-approve')+'/approve',{method:'POST'}).then(function(r){ if(!r.ok){ b.disabled=false; return; } loadUsers(); }).catch(function(){ b.disabled=false; }); };
      });
      Array.prototype.forEach.call(tb.querySelectorAll('[data-block]'), function(b){
        b.onclick=function(){ if(!confirm('停用该用户？其令牌会一并禁用。')) return; b.disabled=true;
          api('/admin/users/'+b.getAttribute('data-block')+'/block',{method:'POST'}).then(function(r){ if(!r.ok){ b.disabled=false; return; } loadUsers(); }).catch(function(){ b.disabled=false; }); };
      });
    }).catch(function(){ if(tb) tb.innerHTML='<tr><td colspan="5" style="color:var(--red)">网络错误</td></tr>'; var pb1=$('users-pending'); if(pb1) pb1.textContent=''; });
  }

  // ---------------- admin: tokens ----------------
  function loadAdminTokens(){
    var tb=$('adm-token-list');
    if(tb) tb.innerHTML='<tr><td colspan="10" style="color:var(--faint)">加载中…</td></tr>';
    return api('/admin/tokens').then(function(r){
      if(!r.ok){ tb.innerHTML='<tr><td colspan="10"><span class="e">错误 '+r.status+'</span></td></tr>'; return; }
      var list = Array.isArray(r.body)? r.body : [];
      if(!list.length){ tb.innerHTML='<tr><td colspan="10" style="color:var(--faint)">还没有</td></tr>'; return; }
      tb.innerHTML = list.map(function(t){
        return '<tr><td>'+t.id+'</td><td style="font-weight:700">'+esc(t.name||'–')+'</td>'
          + '<td><span class="badge">'+esc(ROLE_CN[t.role]||t.role)+'</span></td>'
          + '<td>'+(t.owner_sub==null?'<span class="badge">全局</span>':'<span style="color:var(--faint)" title="'+esc(t.owner_sub)+'">…'+esc(String(t.owner_sub).slice(-8))+'</span>')+'</td>'
          + '<td class="n">'+t.used_requests+'/'+(t.quota_requests==null?'∞':t.quota_requests)+'</td>'
          + '<td class="n">'+(t.rpm_limit==null?'∞':t.rpm_limit)+'</td>'
          + '<td style="color:var(--faint)">'+(t.expires_at==null?'永久':fmtDate(t.expires_at))+'</td>'
          + '<td><span class="dot '+(t.enabled?'d-active':'d-disabled')+'"></span>'+(t.enabled?'启用':'停用')+'</td>'
          + '<td style="color:var(--faint)">'+fmtDate(t.created_at)+'</td>'
          + '<td><button class="btn ghost small" data-del="'+t.id+'">删除</button></td></tr>';
      }).join('');
      Array.prototype.forEach.call(tb.querySelectorAll('[data-del]'), function(b){
        b.onclick = function(){
          if(!confirm('删除该令牌？使用方将立即被拒。')) return;
          b.disabled=true;
          api('/admin/tokens/'+b.getAttribute('data-del'),{method:'DELETE'}).then(function(r){ if(!r.ok){ b.disabled=false; return; } loadAdminTokens(); }).catch(function(){ b.disabled=false; });
        };
      });
    }).catch(function(){ if(tb) tb.innerHTML='<tr><td colspan="10"><span class="e">网络错误</span></td></tr>'; });
  }
  function mintAdmin(){
    var name=$('adm-tname').value.trim();
    var q=parseInt($('adm-quota').value,10), rpm=parseInt($('adm-rpm').value,10), exp=parseInt($('adm-exp').value,10);
    var role=$('adm-role').value;
    var payload={name:name};
    if(q>0) payload.quota_requests=q;
    if(rpm>0) payload.rpm_limit=rpm;
    if(exp>0) payload.expires_in_days=exp;
    if(role==='admin'){ if(!confirm('发放管理员令牌？该令牌可访问管理接口。')) return; payload.role='admin'; }
    var btn=$('adm-mint'); var lbl=btn.textContent; btn.disabled=true; btn.textContent='发放中…';
    api('/admin/tokens',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){ btn.disabled=false; btn.textContent=lbl; var o=$('adm-mint-out'); o.style.display='block';
      if(!r.ok){ o.innerHTML='<span class="e">错误 '+r.status+'</span>'; return; }
      o.innerHTML='新令牌(立即复制): <span class="k mono-token copyable" data-copy="'+esc(r.body.token)+'">'+esc(r.body.token)+'</span>';
      bindCopy(o); $('adm-tname').value=''; $('adm-quota').value=''; $('adm-rpm').value=''; $('adm-exp').value=''; loadAdminTokens();
    }).catch(function(){ btn.disabled=false; btn.textContent=lbl; });
  }

  // ---------------- wire static handlers ----------------
  $('my-mint').onclick = mintMy;
  $('my-tokens-refresh').onclick = loadMyTokens;
  $('ov-refresh').onclick = function(){ loadStats('ov'); };
  $('ov-probe').onclick = probe;
  $('keys-refresh').onclick = function(){ loadStats('keys'); };
  $('modelstatus-refresh').onclick = loadModelStatus;
  $('modelstatus-probe').onclick = probeModels;
  $('importBtn').onclick = importKeys;
  $('users-refresh').onclick = loadUsers;
  $('adm-mint').onclick = mintAdmin;
  $('adm-tokens-refresh').onclick = loadAdminTokens;
  $('bill-topup').onclick = topUp;
  $('bill-balances-refresh').onclick = loadBalances;
  $('bill-txns-refresh').onclick = loadBillingTxns;
  $('prices-refresh').onclick = loadPrices;
  $('price-save').onclick = savePrice;
  $('bal-refresh').onclick = loadBalance;
  $('bal-topup-btn').onclick = checkout;
  $('pending-refresh').onclick = function(){ boot(); };

  // ---------------- boot / routing ----------------
  function showLanding(){
    show('view-landing');
    loadModels().then(function(list){
      if(list.length){ $('landing-models').style.display='block'; renderModelsInto('landing-models-body'); }
    });
  }
  function showPending(){
    show('view-pending');
    $('pending-email').textContent = me.email || '';
    if(me.status==='blocked'){ $('pending-msg').textContent='账号已被停用，请联系管理员。'; }
  }
  function showConsole(){
    show('view-console');
    $('me-email').textContent = me.email || '';
    $('me-role').textContent = me.role;
    $('me-rolepill').className = 'pill ' + (me.role==='admin'?'ok':'');
    previewUser=false;
    buildNav(me.role);
    var pt=$('preview-toggle');
    if(pt){
      if(me.role==='admin'){
        pt.style.display='flex';
        pt.textContent='👤 预览用户视角';
        pt.onclick=function(){
          previewUser=!previewUser;
          pt.textContent = previewUser ? '↩ 回管理台' : '👤 预览用户视角';
          buildNav(previewUser ? 'user' : 'admin');
        };
      } else { pt.style.display='none'; }
    }
  }
  function boot(){
    return api('/auth/me').then(function(r){
      if(r.status===401 || !r.ok || !r.body || !r.body.role){ me=null; showLanding(); return; }
      me = r.body; // { email, role, status, sub }
      if(me.role==='admin'){ showConsole(); return; }
      if(me.status==='approved'){ showConsole(); return; }
      showPending();
    }).catch(function(){ me=null; showLanding(); });
  }
  boot();
})();
</script>
</body>
</html>`;
