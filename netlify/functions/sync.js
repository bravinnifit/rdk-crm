// netlify/functions/sync.js
// RDK GROUP — Motor de Sincronização Bling v3
// Variáveis de ambiente necessárias no Netlify:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   BLING_CLIENT_ID, BLING_CLIENT_SECRET, BLING_REFRESH_TOKEN

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BLING_BASE = 'https://www.bling.com.br/Api/v3';
const CLIENT_ID     = process.env.BLING_CLIENT_ID;
const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
let   REFRESH_TOKEN = process.env.BLING_REFRESH_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return resp(405, { error: 'Método não permitido' });
  }

  // Verifica autenticação Supabase
  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return resp(401, { error: 'Não autorizado' });
  const { data: { user }, error: authErr } = await sb.auth.getUser(auth.replace('Bearer ', ''));
  if (authErr || !user) return resp(401, { error: 'Token inválido' });

  const stats = { pedidos: 0, novos_afiliados: 0, atualizados: 0, erros: [] };

  try {
    // 1. Renova access token via refresh token
    const accessToken = await renovarToken();

    // 2. Busca pedidos dos últimos 60 dias
    const pedidos = await buscarPedidos(accessToken);

    // 3. Processa cada pedido
    for (const pedido of pedidos) {
      try {
        await processarPedido(pedido, stats);
        stats.pedidos++;
      } catch (e) {
        stats.erros.push(`Pedido ${pedido.numero}: ${e.message}`);
      }
    }

    // 4. Recalcula totais
    await recalcularTotais();

    return resp(200, { sucesso: true, ...stats });

  } catch (e) {
    console.error('[sync]', e);
    return resp(500, { error: e.message });
  }
};

// ── Renova o access token ──────────────────────────────────
async function renovarToken() {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: REFRESH_TOKEN,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const res = await fetch(`${BLING_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) throw new Error(`Erro ao renovar token: ${await res.text()}`);
  const data = await res.json();

  // Salva novo refresh token no Supabase para uso futuro
  if (data.refresh_token && data.refresh_token !== REFRESH_TOKEN) {
    REFRESH_TOKEN = data.refresh_token;
    await sb.from('sync_config').upsert({ chave: 'bling_refresh_token', valor: data.refresh_token });
  }

  return data.access_token;
}

// ── Busca todos os pedidos com paginação ─────────────────
async function buscarPedidos(token) {
  const todos = [];
  const dataInicio = diasAtras(60);
  let pagina = 1;

  while (true) {
    const url = `${BLING_BASE}/pedidos/vendas?pagina=${pagina}&limite=100&dataInicial=${dataInicio}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });

    if (res.status === 429) { await sleep(1000); continue; }
    if (!res.ok) throw new Error(`Bling erro ${res.status}: ${await res.text()}`);

    const json = await res.json();
    const pedidos = json.data || [];

    // Filtra apenas pedidos com vendedor
    todos.push(...pedidos.filter(p => p.vendedor?.id));

    if (pedidos.length < 100) break;
    pagina++;
    await sleep(150);
  }

  return todos;
}

// ── Processa um pedido ────────────────────────────────────
async function processarPedido(pedido, stats) {
  const vendedorId   = String(pedido.vendedor.id);
  const nomeVendedor = pedido.vendedor.nome || `Vendedor ${vendedorId}`;
  const numPedido    = String(pedido.numero || pedido.id);
  const valor        = Number(pedido.totalVenda || pedido.total || 0);
  const status       = traduzirStatus(pedido.situacao?.valor ?? pedido.situacao);
  const data         = (pedido.data || new Date().toISOString()).split('T')[0];
  const canal        = pedido.loja?.descricao || null;
  const produtos     = (pedido.itens || []).slice(0, 3).map(i => i.descricao || '?').join(', ') || null;

  // Verifica se afiliado existe
  const { data: existente } = await sb
    .from('afiliados')
    .select('bling_vendedor_id')
    .eq('bling_vendedor_id', vendedorId)
    .single();

  if (!existente) {
    await sb.from('afiliados').insert({
      bling_vendedor_id: vendedorId,
      nome_real: nomeVendedor,
      status_ativacao: 'Pendente de Cadastro',
      total_vendas_acumulado: 0
    });
    stats.novos_afiliados++;
  }

  // Upsert pedido
  await sb.from('vendas_consolidadas').upsert({
    id_pedido_bling:      numPedido,
    fk_bling_vendedor_id: vendedorId,
    valor_venda:          valor,
    status_pedido:        status,
    data_venda:           data,
    canal_venda:          canal,
    produtos_resumo:      produtos,
    sincronizado_em:      new Date().toISOString()
  }, { onConflict: 'id_pedido_bling' });

  stats.atualizados++;
}

// ── Recalcula total acumulado de cada afiliado ────────────
async function recalcularTotais() {
  const { data: afiliados } = await sb.from('afiliados').select('bling_vendedor_id');
  for (const af of afiliados || []) {
    const { data: vendas } = await sb
      .from('vendas_consolidadas')
      .select('valor_venda')
      .eq('fk_bling_vendedor_id', af.bling_vendedor_id)
      .not('status_pedido', 'in', '("Cancelado","Devolvido","Cancelado pelo cliente")');

    const total = (vendas || []).reduce((s, v) => s + Number(v.valor_venda || 0), 0);
    await sb.from('afiliados').update({ total_vendas_acumulado: total }).eq('bling_vendedor_id', af.bling_vendedor_id);
  }
}

// ── Helpers ───────────────────────────────────────────────
function traduzirStatus(s) {
  const m = { 0:'Em aberto',1:'Em andamento',2:'Atendido',3:'Cancelado',4:'Em digitação',6:'Atendido',10:'Cancelado pelo cliente' };
  return m[s] || String(s || 'Em aberto');
}
function diasAtras(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function resp(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}
