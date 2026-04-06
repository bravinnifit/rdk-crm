<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RDK GROUP — CRM Afiliados</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.tailwindcss.com"></script>
<style>
:root {
  --bg: #0a0a0a;
  --surface: #111111;
  --surface2: #181818;
  --border: rgba(255,255,255,0.08);
  --accent: #e8ff47;
  --text: #f0f0f0;
  --muted: #888;
}
body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); }
.font-syne { font-family: 'Syne', sans-serif; }
.hidden { display: none !important; }
/* Estilos da Tabela e Badges */
.badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
.badge-ativo { background: rgba(77,255,145,0.1); color: #4dff91; border: 1px solid rgba(77,255,145,0.2); }
.badge-pendente { background: rgba(255,184,77,0.1); color: #ffb84d; border: 1px solid rgba(255,184,77,0.2); }
</style>
</head>
<body class="min-h-screen">

<div id="login-screen" class="min-h-screen flex items-center justify-center p-4">
  <div class="bg-[#111] border border-white/10 p-10 rounded-[32px] w-full max-w-sm text-center shadow-2xl">
    <div class="text-[#e8ff47] font-syne text-[10px] tracking-[0.2em] uppercase mb-8">RDK GROUP</div>
    <h1 class="font-syne text-3xl font-extrabold mb-8 text-white">CRM <span class="text-[#e8ff47]">.</span></h1>
    <div class="space-y-4">
        <input id="login-email" type="email" placeholder="E-mail" class="w-full bg-[#181818] border border-white/5 rounded-2xl px-5 py-4 text-sm outline-none focus:border-[#e8ff47]">
        <input id="login-password" type="password" placeholder="Senha" class="w-full bg-[#181818] border border-white/5 rounded-2xl px-5 py-4 text-sm outline-none focus:border-[#e8ff47]">
        <button onclick="doLogin()" class="w-full bg-[#e8ff47] text-black font-syne font-bold rounded-2xl py-4 hover:scale-[1.02] transition-all">ENTRAR</button>
    </div>
    <p id="login-error" class="text-red-500 text-xs mt-4 hidden"></p>
  </div>
</div>

<div id="app" class="hidden flex flex-col min-h-screen">
  <nav class="border-b border-white/5 p-6 flex justify-between items-center bg-[#0a0a0a]/50 backdrop-blur-xl sticky top-0 z-50">
      <div class="font-syne font-bold tracking-tighter text-xl">RDK<span class="text-[#e8ff47]">GROUP</span></div>
      <div class="flex items-center gap-4">
          <button onclick="triggerSync()" class="bg-white/5 hover:bg-white/10 text-[10px] px-4 py-2 rounded-xl uppercase font-bold transition-all">⟳ Sincronizar Bling</button>
          <button onclick="doLogout()" class="text-xs text-white/40 hover:text-red-500">Sair</button>
      </div>
  </nav>

  <main class="p-6 max-w-7xl mx-auto w-full space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div class="bg-[#111] border border-white/5 p-8 rounded-[32px]">
              <p class="text-[10px] text-white/40 uppercase tracking-widest mb-2">Vendas/Mês</p>
              <h2 id="stat-mes" class="text-3xl font-syne font-bold text-[#e8ff47]">R$ 0,00</h2>
          </div>
          <div class="bg-[#111] border border-white/5 p-8 rounded-[32px]">
              <p class="text-[10px] text-white/40 uppercase tracking-widest mb-2">Afiliados Ativos</p>
              <h2 id="stat-ativos" class="text-3xl font-syne font-bold">0</h2>
          </div>
          <div class="bg-[#111] border border-white/5 p-8 rounded-[32px]">
              <p class="text-[10px] text-white/40 uppercase tracking-widest mb-2">Total Acumulado</p>
              <h2 id="stat-total" class="text-3xl font-syne font-bold">R$ 0,00</h2>
          </div>
      </div>

      <div class="bg-[#111] border border-white/5 rounded-[32px] overflow-hidden">
          <table class="w-full text-left">
              <thead class="text-[10px] text-white/30 uppercase tracking-widest bg-white/5 border-b border-white/5">
                  <tr>
                      <th class="p-6">@TikTok</th>
                      <th class="p-6">Nome / ID Bling</th>
                      <th class="p-6">Status</th>
                      <th class="p-6 text-right">Total Acumulado</th>
                  </tr>
              </thead>
              <tbody id="affiliates-tbody" class="text-sm">
                  </tbody>
          </table>
      </div>
  </main>
</div>

<script>
// Configurações do Supabase extraídas do seu ficheiro
const SUPABASE_URL = 'https://gxuhlndisvpelnjunhgc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4dWhsbmRpc3ZwZWxuanVuaGdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTUyMzgsImV4cCI6MjA5MDk5MTIzOH0.x6swLKQNRAWupZ14c0TSqjpO1N0oQ-EfSgd3sgINIIY';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Autenticação
async function doLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        const errEl = document.getElementById('login-error');
        errEl.textContent = "Credenciais inválidas";
        errEl.classList.remove('hidden');
    } else {
        location.reload();
    }
}

async function doLogout() { await sb.auth.signOut(); location.reload(); }

// Carregamento de Dados
async function loadDashboard() {
    // Busca afiliados da tabela base
    const { data: afiliados, error } = await sb.from('afiliados').select('*').order('total_vendas_acumulado', { ascending: false });
    
    if (error) { console.error(error); return; }

    const ativos = afiliados.filter(a => a.status_ativacao === 'Ativo').length;
    const totalSoma = afiliados.reduce((acc, a) => acc + Number(a.total_vendas_acumulado || 0), 0);

    document.getElementById('stat-ativos').textContent = ativos;
    document.getElementById('stat-total').textContent = totalSoma.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const tbody = document.getElementById('affiliates-tbody');
    tbody.innerHTML = afiliados.map(a => `
        <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-all cursor-pointer">
            <td class="p-6 text-[#e8ff47]">@${a.username_tiktok || '—'}</td>
            <td class="p-6 font-bold">${a.nome_real}<br><span class="text-[10px] text-white/20">ID: ${a.bling_vendedor_id}</span></td>
            <td class="p-6"><span class="badge ${a.status_ativacao === 'Ativo' ? 'badge-ativo' : 'badge-pendente'}">${a.status_ativacao}</span></td>
            <td class="p-6 text-right font-syne font-bold">R$ ${Number(a.total_vendas_acumulado || 0).toLocaleString('pt-BR')}</td>
        </tr>
    `).join('');
}

// Sincronização (Chama a sua Netlify Function do ficheiro sync.js)
async function triggerSync() {
    alert("Iniciando sincronização com Bling... Verifique o log do Netlify.");
    const { data: { session } } = await sb.auth.getSession();
    await fetch('/.netlify/functions/sync', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session.access_token }
    });
    loadDashboard();
}

// Inicialização
window.onload = async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        loadDashboard();
    }
};
</script>
</body>
</html>
