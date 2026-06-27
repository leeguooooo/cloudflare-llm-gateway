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
  input,textarea{width:100%; background:var(--cream); color:var(--ink); border:2px solid var(--ink);
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
          <div class="endpoint" id="dash-endpoint"></div>
          <div id="dash-token-area" style="margin-top:16px"></div>
        </div>
        <div class="card r2">
          <h2 class="h-green"><span class="hd"></span>快速开始</h2>
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
            <thead><tr><th>id</th><th>名字</th><th>令牌</th><th>启用</th><th>用量</th><th>创建</th><th></th></tr></thead>
            <tbody id="my-token-list"><tr><td colspan="7" style="color:var(--faint)">加载中…</td></tr></tbody>
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
        <p class="sec-sub">// OpenAI 兼容 · 同一套 SDK 即可接入</p>
        <div class="card r1">
          <h2 class="h-blue"><span class="hd"></span>接口与鉴权</h2>
          <div class="hint" style="margin-top:0">Chat Completions 接口:</div>
          <div class="endpoint" id="docs-endpoint"></div>
          <div class="hint">鉴权头:</div>
          <div class="endpoint">Authorization: Bearer &lt;你的令牌&gt;</div>
        </div>
        <div class="card r2">
          <h2 class="h-green"><span class="hd"></span>curl</h2>
          <div class="out" id="docs-curl"></div>
        </div>
        <div class="card r1">
          <h2 class="h-yellow"><span class="hd"></span>OpenAI SDK</h2>
          <div class="out" id="docs-sdk"></div>
        </div>
        <div class="card r2">
          <h2 class="h-blue"><span class="hd"></span>模型 id</h2>
          <table>
            <thead><tr><th>模型 id</th><th>来源</th></tr></thead>
            <tbody id="docs-models-body"><tr><td colspan="2" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
        </div>
      </section>

      <!-- ----- admin: 总览 ----- -->
      <section class="section" id="sec-overview">
        <h2 class="sec-h">总览</h2>
        <p class="sec-sub">// key 池健康度</p>
        <div class="card r1">
          <h2 class="h-green"><span class="hd"></span>池子状态
            <span style="flex:1"></span>
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
      </section>

      <!-- ----- admin: Key 列表 ----- -->
      <section class="section" id="sec-keylist">
        <h2 class="sec-h">Key 列表</h2>
        <p class="sec-sub">// 每个 key 单独查看与操作 · 测活 / 余额(OpenRouter)</p>
        <div class="card r1">
          <h2 class="h-red"><span class="hd"></span>所有 key
            <span style="flex:1"></span>
            <button class="btn ghost small" id="keylist-refresh">刷新</button>
          </h2>
          <table>
            <thead><tr><th>供应商</th><th>key</th><th>请求/失败</th><th>上次错误</th><th>测活 / 余额</th><th>操作</th></tr></thead>
            <tbody id="keylist-body"><tr><td colspan="6" style="color:var(--faint)">加载中…</td></tr></tbody>
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
            <button class="btn primary" id="adm-mint">发一个令牌</button>
          </div>
          <div class="out" id="adm-mint-out" style="display:none"></div>
        </div>
        <div class="card r1">
          <h2 class="h-green"><span class="hd"></span>令牌列表
            <span style="flex:1"></span>
            <button class="btn ghost small" id="adm-tokens-refresh">刷新</button>
          </h2>
          <table>
            <thead><tr><th>id</th><th>名字</th><th>角色</th><th>用量</th><th>RPM</th><th>过期</th><th>启用</th><th>创建</th></tr></thead>
            <tbody id="adm-token-list"><tr><td colspan="8" style="color:var(--faint)">加载中…</td></tr></tbody>
          </table>
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
        <div class="card r1" style="margin-top:14px">
          <h2 class="h-green"><span class="hd"></span>按供应商
            <span style="flex:1"></span>
            <button class="btn ghost small" id="logs-refresh">刷新</button>
          </h2>
          <table><thead><tr><th>供应商</th><th>请求</th><th>成功</th><th>平均延迟</th><th>token</th></tr></thead>
          <tbody id="l-byprov"><tr><td colspan="5" style="color:var(--faint)">加载中…</td></tr></tbody></table>
        </div>
        <div class="card r2" style="margin-top:14px">
          <h2 class="h-blue"><span class="hd"></span>最近请求</h2>
          <table><thead><tr><th>时间</th><th>供应商</th><th>模型</th><th>状态</th><th>延迟</th><th>token</th></tr></thead>
          <tbody id="l-recent"><tr><td colspan="6" style="color:var(--faint)">加载中…</td></tr></tbody></table>
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
  function fmtDate(ms){ if(!ms) return '–'; try{ return new Date(ms).toISOString().slice(0,16).replace('T',' '); }catch(e){ return '–'; } }
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
  function loadModels(){
    return api('/v1/models').then(function(r){
      var list = (r.body && (r.body.data || r.body)) || [];
      if(!Array.isArray(list)) list = [];
      modelsCache = list;
      return list;
    }).catch(function(){ modelsCache=[]; return []; });
  }
  function renderModelsInto(tbodyId){
    var tb=$(tbodyId); if(!tb) return;
    var list=modelsCache||[];
    if(!list.length){ tb.innerHTML='<tr><td colspan="2" style="color:var(--faint)">暂无</td></tr>'; return; }
    tb.innerHTML = list.map(function(m){
      return '<tr><td style="font-weight:700" class="mono-token">'+esc(m.id)+'</td><td style="color:var(--muted)">'+esc(m.owned_by||m.ownedBy||'–')+'</td></tr>';
    }).join('');
  }

  // ---------------- sidebar nav ----------------
  var NAV = {
    user: [
      {id:'dashboard', label:'控制台', color:'red'},
      {id:'tokens',    label:'我的令牌', color:'blue'},
      {id:'models',    label:'模型', color:'green'},
      {id:'usage',     label:'用量', color:'amber'},
      {id:'docs',      label:'文档', color:'yellow'}
    ],
    admin: [
      {id:'overview',    label:'总览', color:'green'},
      {id:'keys',        label:'Key 池', color:'yellow'},
      {id:'keylist',     label:'Key 列表', color:'red'},
      {id:'users',       label:'用户', color:'blue'},
      {id:'admintokens', label:'令牌', color:'green'},
      {id:'logs',        label:'日志', color:'amber'},
      {id:'docs',        label:'文档', color:'amber'}
    ]
  };
  function buildNav(role){
    var items = NAV[role] || NAV.user;
    $('nav').innerHTML = items.map(function(it){
      return '<a class="navitem c-'+it.color+'" data-sec="'+it.id+'"><span class="hd"></span>'+it.label+'</a>';
    }).join('');
    Array.prototype.forEach.call($('nav').querySelectorAll('.navitem'), function(a){
      a.onclick = function(){ selectSection(a.getAttribute('data-sec')); };
    });
    selectSection(items[0].id);
  }
  function selectSection(id){
    Array.prototype.forEach.call(document.querySelectorAll('.section'), function(s){ s.classList.remove('active'); });
    var sec=$('sec-'+id); if(sec) sec.classList.add('active');
    Array.prototype.forEach.call($('nav').querySelectorAll('.navitem'), function(a){
      a.classList.toggle('active', a.getAttribute('data-sec')===id);
    });
    onSectionEnter(id);
  }
  function onSectionEnter(id){
    if(id==='models' || id==='docs'){
      loadModels().then(function(){ renderModelsInto('models-body'); renderModelsInto('docs-models-body'); fillDocs(); });
    }
    if(id==='dashboard') loadDashboard();
    if(id==='tokens') loadMyTokens();
    if(id==='overview') loadStats('ov');
    if(id==='keys') loadStats('keys');
    if(id==='keylist'){ var rb=$('keylist-refresh'); if(rb) rb.onclick=loadKeyList; loadKeyList(); }
    if(id==='users') loadUsers();
    if(id==='admintokens') loadAdminTokens();
    if(id==='usage') loadUserUsage();
    if(id==='logs'){ var lr=$('logs-refresh'); if(lr) lr.onclick=loadAdminUsage; loadAdminUsage(); }
  }

  // ---------------- usage / logs (shared renderers) ----------------
  function pct(ok,n){ return n>0 ? Math.round(ok/n*100)+'%' : '–'; }
  function renderUsage(d, p){
    $(p+'-total').textContent = d.total||0;
    $(p+'-rate').textContent = pct(d.ok||0, d.total||0);
    $(p+'-tokens').textContent = d.tokens||0;
    var rows=(d.byProvider||[]).map(function(x){
      return '<tr><td style="font-weight:700">'+esc(x.provider)+'</td><td class="n">'+x.n+'</td>'
        +'<td class="n">'+x.ok+'</td><td class="n">'+Math.round(x.avg_latency||0)+'ms</td>'
        +'<td class="n">'+(x.tokens||0)+'</td></tr>';
    }).join('');
    $(p+'-byprov').innerHTML = rows || '<tr><td colspan="5" style="color:var(--faint)">暂无</td></tr>';
  }
  function renderRecent(rows, tbodyId){
    var html=(rows||[]).map(function(r){
      var t=new Date(r.created_at).toISOString().slice(5,16).replace('T',' ');
      var okc=r.ok?'var(--green)':'var(--red)';
      return '<tr><td style="color:var(--faint)">'+t+'</td><td>'+esc(r.provider)+'</td>'
        +'<td>'+esc(r.model||'–')+'</td><td style="color:'+okc+'">'+(r.status_code==null?'–':r.status_code)+'</td>'
        +'<td class="n">'+(r.latency_ms==null?'–':r.latency_ms+'ms')+'</td>'
        +'<td class="n">'+(r.total_tokens==null?'–':r.total_tokens)+'</td></tr>';
    }).join('');
    $(tbodyId).innerHTML = html || '<tr><td colspan="6" style="color:var(--faint)">暂无</td></tr>';
  }
  function loadUserUsage(){
    api('/me/usage').then(function(r){ if(r.ok) renderUsage(r.body,'u'); });
    api('/me/logs').then(function(r){ if(r.ok) renderRecent(Array.isArray(r.body)?r.body:[], 'u-recent'); });
  }
  function loadAdminUsage(){
    api('/admin/usage').then(function(r){ if(r.ok) renderUsage(r.body,'l'); });
    api('/admin/logs').then(function(r){ if(r.ok) renderRecent(Array.isArray(r.body)?r.body:[], 'l-recent'); });
  }

  // ---------------- admin: per-key list ----------------
  function loadKeyList(){
    var tb=$('keylist-body');
    tb.innerHTML='<tr><td colspan="6" style="color:var(--faint)">加载中…</td></tr>';
    return api('/admin/keys/list').then(function(r){
      var keys=(r.body && r.body.keys) || [];
      if(!keys.length){ tb.innerHTML='<tr><td colspan="6" style="color:var(--faint)">还没有 key</td></tr>'; return; }
      tb.innerHTML = keys.map(function(k){
        var sd = k.status==='active'?'d-active':k.status==='cooldown'?'d-cooldown':'d-disabled';
        var err = k.last_error ? esc(String(k.last_error).slice(0,48)) : '';
        var toggle = (k.status==='active')
          ? '<button class="btn ghost small kl-disable">禁用</button>'
          : '<button class="btn ghost small kl-enable">启用</button>';
        return '<tr data-id="'+k.id+'">'
          +'<td><span class="dot '+sd+'"></span>'+esc(k.provider)+'</td>'
          +'<td style="font-family:ui-monospace,monospace;font-size:12.5px">'+esc(k.masked)+'</td>'
          +'<td class="n">'+k.total_requests+' / '+k.total_fails+'</td>'
          +'<td style="max-width:180px;color:var(--faint);font-size:12px;overflow:hidden;text-overflow:ellipsis">'+err+'</td>'
          +'<td class="kl-result" style="font-size:12.5px;white-space:nowrap"></td>'
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
    });
  }

  // ---------------- consumer: dashboard ----------------
  function loadDashboard(){
    $('dash-greet').textContent = '// 欢迎回来, ' + (me.email||'');
    $('dash-endpoint').textContent = 'POST ' + base + '/v1/chat/completions';
    api('/me/tokens').then(function(r){
      var list = Array.isArray(r.body)? r.body : [];
      var enabled = list.filter(function(t){ return t.enabled; });
      var area=$('dash-token-area');
      var tok = enabled.length ? enabled[0].token : null;
      if(tok){
        area.innerHTML = '<label>你的令牌</label>'
          + '<div class="endpoint"><span class="mono-token copyable" data-copy="'+esc(tok)+'">'+esc(tok)+'</span></div>'
          + '<div class="hint">点击即可复制。更多令牌见「我的令牌」。</div>';
        bindCopy(area);
      } else {
        area.innerHTML = '<button class="btn primary" id="dash-first">生成我的第一个令牌</button>'
          + '<div class="hint">还没有令牌。生成后即可调用接口。</div>';
        $('dash-first').onclick = function(){ selectSection('tokens'); };
      }
      $('dash-curl').innerHTML = curlSnippet(tok);
    }).catch(function(){ $('dash-curl').innerHTML = curlSnippet(null); });
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
    return api('/me/tokens').then(function(r){
      var list = Array.isArray(r.body)? r.body : [];
      var tb=$('my-token-list');
      if(!list.length){ tb.innerHTML='<tr><td colspan="7" style="color:var(--faint)">还没有令牌</td></tr>'; return; }
      tb.innerHTML = list.map(function(t){
        return '<tr><td>'+t.id+'</td>'
          + '<td style="font-weight:700">'+esc(t.name||'–')+'</td>'
          + '<td><span class="mono-token copyable" data-copy="'+esc(t.token)+'">'+esc(t.token)+'</span></td>'
          + '<td>'+(t.enabled?'是':'否')+'</td>'
          + '<td class="n">'+t.used_requests+'/'+(t.quota_requests==null?'∞':t.quota_requests)+'</td>'
          + '<td style="color:var(--faint)">'+fmtDate(t.created_at)+'</td>'
          + '<td><button class="btn ghost small" data-del="'+t.id+'">删除</button></td></tr>';
      }).join('');
      bindCopy(tb);
      Array.prototype.forEach.call(tb.querySelectorAll('[data-del]'), function(b){
        b.onclick = function(){
          if(!confirm('删除该令牌？此操作不可撤销。')) return;
          b.disabled=true;
          api('/me/tokens/'+b.getAttribute('data-del'),{method:'DELETE'}).then(function(){ loadMyTokens(); });
        };
      });
    });
  }
  function mintMy(){
    var name=$('my-tname').value.trim();
    var btn=$('my-mint'); btn.disabled=true;
    api('/me/tokens',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name})})
    .then(function(r){ btn.disabled=false; var o=$('my-mint-out'); o.style.display='block';
      if(!r.ok){
        var msg=(r.body&&r.body.error&&r.body.error.message)||('错误 '+r.status);
        o.innerHTML='<span class="e">'+esc(msg)+'</span>'; return;
      }
      o.innerHTML='新令牌(立即复制): <span class="k mono-token copyable" data-copy="'+esc(r.body.token)+'">'+esc(r.body.token)+'</span>';
      bindCopy(o); $('my-tname').value=''; loadMyTokens();
    }).catch(function(){ btn.disabled=false; });
  }

  // ---------------- docs (shared, static from models) ----------------
  function fillDocs(){
    $('docs-endpoint').textContent = 'POST ' + base + '/v1/chat/completions';
    $('docs-curl').innerHTML = curlSnippet(null);
    var model = (modelsCache && modelsCache[0] && modelsCache[0].id) || 'gemini-2.0-flash';
    $('docs-sdk').innerHTML = esc(
      'from openai import OpenAI\n' +
      'client = OpenAI(\n' +
      '    base_url="' + base + '/v1",\n' +
      '    api_key="<你的令牌>",\n' +
      ')\n' +
      'resp = client.chat.completions.create(\n' +
      '    model="' + model + '",\n' +
      '    messages=[{"role":"user","content":"hello"}],\n' +
      ')\n' +
      'print(resp.choices[0].message.content)'
    );
  }

  // ---------------- admin: stats (overview + keys) ----------------
  function renderStats(s, tbodyId){
    var t=(s&&s.totals)||{active:0,cooldown:0,disabled:0};
    if($('t-active')){ $('t-active').textContent=t.active; $('t-cooldown').textContent=t.cooldown; $('t-disabled').textContent=t.disabled; }
    var prov={}, order=['gemini','mistral','openrouter'];
    order.forEach(function(p){ prov[p]={active:0,cooldown:0,disabled:0}; });
    ((s&&s.byProviderStatus)||[]).forEach(function(r){ if(!prov[r.provider])prov[r.provider]={active:0,cooldown:0,disabled:0}; prov[r.provider][r.status]=r.n; });
    var html='';
    Object.keys(prov).forEach(function(p){ var x=prov[p];
      html += '<tr><td style="font-weight:700">'+p+'</td>'
        +'<td class="n"><span class="dot d-active '+(x.active>0?'':'d-zero')+'"></span>'+x.active+'</td>'
        +'<td class="n"><span class="dot d-cooldown '+(x.cooldown>0?'':'d-zero')+'"></span>'+x.cooldown+'</td>'
        +'<td class="n"><span class="dot d-disabled '+(x.disabled>0?'':'d-zero')+'"></span>'+x.disabled+'</td></tr>';
    });
    if($(tbodyId)) $(tbodyId).innerHTML = html;
  }
  function loadStats(prefix){
    var tbodyId = prefix==='ov' ? 'ov-byprovider' : 'keys-byprovider';
    return api('/admin/keys').then(function(r){
      if(!r.ok){ if($(tbodyId)) $(tbodyId).innerHTML='<tr><td colspan="4" class="e">错误 '+r.status+'</td></tr>'; return; }
      renderStats(r.body, tbodyId);
    });
  }
  function probe(){
    var btn=$('ov-probe'); btn.disabled=true; var o=$('ov-probe-out'); o.style.display='block'; o.textContent='巡检中…';
    api('/admin/probe',{method:'POST'}).then(function(r){ btn.disabled=false;
      if(!r.ok){ o.innerHTML='<span class="e">错误 '+r.status+'</span>'; return; }
      o.innerHTML='<span class="k">巡检完成</span> '+esc(JSON.stringify(r.body||{}));
      loadStats('ov');
    }).catch(function(){ btn.disabled=false; o.innerHTML='<span class="e">网络错误</span>'; });
  }
  function importKeys(){
    var keys=$('keys').value; if(!keys.trim()) return;
    var btn=$('importBtn'); btn.disabled=true;
    api('/admin/keys/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keys:keys})})
    .then(function(r){ btn.disabled=false; var o=$('importOut'); o.style.display='block';
      if(!r.ok){ o.innerHTML='<span class="e">错误 '+r.status+'</span> '+esc(JSON.stringify(r.body)); return; }
      var b=r.body||{}, by=b.byProvider?Object.keys(b.byProvider).map(function(k){return k+'='+b.byProvider[k];}).join('  '):'';
      o.innerHTML='<span class="k">新增 '+b.added+'</span>  重复 '+b.duplicate+'  跳过 '+((b.skipped&&b.skipped.length)||0)+'\n'+esc(by);
      $('keys').value=''; loadStats('keys'); loadStats('ov');
    }).catch(function(){ btn.disabled=false; });
  }

  // ---------------- admin: users ----------------
  function loadUsers(){
    return api('/admin/users').then(function(r){
      var list = Array.isArray(r.body)? r.body : [];
      var tb=$('users-body');
      if(!list.length){ tb.innerHTML='<tr><td colspan="5" style="color:var(--faint)">还没有用户</td></tr>'; return; }
      tb.innerHTML = list.map(function(u){
        var bcls = u.status==='approved'?'b-approved':(u.status==='blocked'?'b-blocked':'b-pending');
        var action='';
        if(u.status==='approved') action='<button class="btn ghost small" data-block="'+u.id+'">停用</button>';
        else action='<button class="btn primary small" data-approve="'+u.id+'">开通</button>';
        var hot = u.status==='pending' ? ' class="hot"' : '';
        return '<tr'+hot+'><td style="font-weight:700; word-break:break-all">'+esc(u.email||'–')+'</td>'
          + '<td>'+esc(u.role)+'</td>'
          + '<td><span class="badge '+bcls+'">'+esc(u.status)+'</span></td>'
          + '<td style="color:var(--faint)">'+fmtDate(u.created_at)+'</td>'
          + '<td>'+action+'</td></tr>';
      }).join('');
      Array.prototype.forEach.call(tb.querySelectorAll('[data-approve]'), function(b){
        b.onclick=function(){ b.disabled=true; api('/admin/users/'+b.getAttribute('data-approve')+'/approve',{method:'POST'}).then(function(){ loadUsers(); }); };
      });
      Array.prototype.forEach.call(tb.querySelectorAll('[data-block]'), function(b){
        b.onclick=function(){ if(!confirm('停用该用户？其令牌会一并禁用。')) return; b.disabled=true;
          api('/admin/users/'+b.getAttribute('data-block')+'/block',{method:'POST'}).then(function(){ loadUsers(); }); };
      });
    });
  }

  // ---------------- admin: tokens ----------------
  function loadAdminTokens(){
    return api('/admin/tokens').then(function(r){
      var list = Array.isArray(r.body)? r.body : [];
      var tb=$('adm-token-list');
      if(!list.length){ tb.innerHTML='<tr><td colspan="8" style="color:var(--faint)">还没有</td></tr>'; return; }
      tb.innerHTML = list.map(function(t){
        return '<tr><td>'+t.id+'</td><td style="font-weight:700">'+esc(t.name||'–')+'</td>'
          + '<td>'+esc(t.role)+'</td>'
          + '<td class="n">'+t.used_requests+'/'+(t.quota_requests==null?'∞':t.quota_requests)+'</td>'
          + '<td class="n">'+(t.rpm_limit==null?'∞':t.rpm_limit)+'</td>'
          + '<td style="color:var(--faint)">'+(t.expires_at==null?'永久':fmtDate(t.expires_at))+'</td>'
          + '<td>'+(t.enabled?'是':'否')+'</td>'
          + '<td style="color:var(--faint)">'+fmtDate(t.created_at)+'</td></tr>';
      }).join('');
    });
  }
  function mintAdmin(){
    var name=$('adm-tname').value.trim();
    var q=parseInt($('adm-quota').value,10), rpm=parseInt($('adm-rpm').value,10), exp=parseInt($('adm-exp').value,10);
    var payload={name:name};
    if(q>0) payload.quota_requests=q;
    if(rpm>0) payload.rpm_limit=rpm;
    if(exp>0) payload.expires_in_days=exp;
    var btn=$('adm-mint'); btn.disabled=true;
    api('/admin/tokens',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){ btn.disabled=false; var o=$('adm-mint-out'); o.style.display='block';
      if(!r.ok){ o.innerHTML='<span class="e">错误 '+r.status+'</span>'; return; }
      o.innerHTML='新令牌(立即复制): <span class="k mono-token copyable" data-copy="'+esc(r.body.token)+'">'+esc(r.body.token)+'</span>';
      bindCopy(o); $('adm-tname').value=''; $('adm-quota').value=''; $('adm-rpm').value=''; $('adm-exp').value=''; loadAdminTokens();
    }).catch(function(){ btn.disabled=false; });
  }

  // ---------------- wire static handlers ----------------
  $('my-mint').onclick = mintMy;
  $('my-tokens-refresh').onclick = loadMyTokens;
  $('ov-refresh').onclick = function(){ loadStats('ov'); };
  $('ov-probe').onclick = probe;
  $('keys-refresh').onclick = function(){ loadStats('keys'); };
  $('importBtn').onclick = importKeys;
  $('users-refresh').onclick = loadUsers;
  $('adm-mint').onclick = mintAdmin;
  $('adm-tokens-refresh').onclick = loadAdminTokens;
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
    buildNav(me.role);
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
