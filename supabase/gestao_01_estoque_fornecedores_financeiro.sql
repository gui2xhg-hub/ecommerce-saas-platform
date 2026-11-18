-- =====================================================================
-- GESTÃO COMPLETA: ESTOQUE • FORNECEDORES • COMPRAS • FINANCEIRO
-- Cole no Supabase > SQL Editor > Run.
--
-- SEGURO PARA QUEM JÁ USA:
--  * Só CRIA colunas, tabelas e funções; não altera nem apaga dados.
--  * A baixa automática de estoque fica DESLIGADA em todas as lojas.
--    Cada loja liga no painel (aba 📦 Estoque). Pedidos do delivery não são afetados.
--  * Pode ser executado mais de uma vez sem problema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) LOJAS E PRODUTOS
-- ---------------------------------------------------------------------
alter table public.tenants add column if not exists erp_version integer default 1;             -- indica que o banco já tem a gestão
alter table public.tenants add column if not exists stock_control_enabled boolean default false; -- baixa automática de estoque (opt-in)

alter table public.products add column if not exists cost_price numeric;        -- custo unitário (custo médio)
alter table public.products add column if not exists sku text;                  -- código interno
alter table public.products add column if not exists barcode text;              -- código de barras
alter table public.products add column if not exists min_stock integer;        -- estoque mínimo (alerta)
alter table public.products add column if not exists supplier_id bigint;        -- fornecedor principal
alter table public.products add column if not exists stock_location text;       -- local (prateleira, depósito)

-- ---------------------------------------------------------------------
-- 2) TABELAS NOVAS (criadas com o mesmo tipo de ID das lojas e produtos)
-- ---------------------------------------------------------------------
do $$
declare
  t_type text;
  p_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into t_type from pg_attribute a
   where a.attrelid = 'public.tenants'::regclass and a.attname = 'id';
  select format_type(a.atttypid, a.atttypmod) into p_type from pg_attribute a
   where a.attrelid = 'public.products'::regclass and a.attname = 'id';

  execute format($f$
    create table if not exists public.suppliers (
      id bigserial primary key,
      tenant_id %1$s not null references public.tenants(id) on delete cascade,
      name text not null,
      document text,
      contact_name text,
      phone text,
      email text,
      address text,
      notes text,
      lead_time_days integer,
      payment_terms text,
      active boolean not null default true,
      created_at timestamptz not null default now()
    )$f$, t_type);

  execute format($f$
    create table if not exists public.purchase_orders (
      id bigserial primary key,
      tenant_id %1$s not null references public.tenants(id) on delete cascade,
      supplier_id bigint references public.suppliers(id) on delete set null,
      supplier_name text,
      items jsonb not null default '[]'::jsonb,      -- [{product_id, name, quantity, unit_cost}]
      freight numeric not null default 0,
      other_costs numeric not null default 0,
      total numeric not null default 0,
      status text not null default 'rascunho',      -- rascunho | enviado | recebido | cancelado
      expected_date date,
      received_at timestamptz,
      payment_due_date date,
      installments integer not null default 1,
      installment_interval_days integer not null default 30,
      paid_on_receipt boolean not null default false,
      payment_method text,
      notes text,
      created_at timestamptz not null default now()
    )$f$, t_type);

  execute format($f$
    create table if not exists public.stock_movements (
      id bigserial primary key,
      tenant_id %1$s not null references public.tenants(id) on delete cascade,
      product_id %2$s,
      product_name text,
      movement_type text not null,                  -- entrada | saida | ajuste | venda | cancelamento | compra | perda | inventario
      quantity integer not null,                    -- positivo entra, negativo sai
      balance_after integer,
      unit_cost numeric,
      reason text,
      order_id text,
      purchase_order_id bigint,
      created_at timestamptz not null default now()
    )$f$, t_type, p_type);

  execute format($f$
    create table if not exists public.fin_transactions (
      id bigserial primary key,
      tenant_id %1$s not null references public.tenants(id) on delete cascade,
      type text not null,                           -- receita | despesa
      category text,
      description text,
      amount numeric not null default 0,
      due_date date,
      paid_at date,
      status text not null default 'pendente',      -- pendente | pago | cancelado
      payment_method text,
      supplier_id bigint references public.suppliers(id) on delete set null,
      purchase_order_id bigint references public.purchase_orders(id) on delete set null,
      order_id text,
      recurrence text not null default 'nenhuma',   -- nenhuma | mensal
      installment text,
      notes text,
      created_at timestamptz not null default now()
    )$f$, t_type);
end $$;

create index if not exists idx_stock_mov_tenant on public.stock_movements (tenant_id, created_at desc);
create index if not exists idx_stock_mov_order on public.stock_movements (order_id);
create index if not exists idx_fin_tenant_due on public.fin_transactions (tenant_id, due_date);
create index if not exists idx_po_tenant on public.purchase_orders (tenant_id, created_at desc);
create index if not exists idx_suppliers_tenant on public.suppliers (tenant_id);

grant select, insert, update, delete on public.suppliers, public.purchase_orders, public.stock_movements, public.fin_transactions to anon, authenticated;
grant usage, select on sequence public.suppliers_id_seq, public.purchase_orders_id_seq, public.stock_movements_id_seq, public.fin_transactions_id_seq to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) AJUSTE DE ESTOQUE (entrada, saída, perda, inventário) com histórico
--    Na entrada com custo, recalcula o CUSTO MÉDIO do produto.
-- ---------------------------------------------------------------------
create or replace function public.stock_adjust(
  p_tenant_id text,
  p_product_id text,
  p_mode text,              -- entrada | saida | perda | definir
  p_quantity integer,
  p_reason text default null,
  p_unit_cost numeric default null,
  p_purchase_order_id bigint default null
)
returns jsonb
language plpgsql
as $$
declare
  v_prod record;
  v_old integer;
  v_new integer;
  v_delta integer;
  v_cost numeric;
  v_type text;
begin
  if p_quantity is null or p_quantity < 0 then
    raise exception 'QUANTIDADE_INVALIDA: informe uma quantidade positiva';
  end if;

  select * into v_prod from public.products
   where id::text = p_product_id and tenant_id::text = p_tenant_id
   for update;
  if not found then
    raise exception 'PRODUTO_NAO_ENCONTRADO';
  end if;

  v_old := coalesce(v_prod.stock, 0);
  if p_mode = 'entrada' then
    v_new := v_old + p_quantity;
  elsif p_mode in ('saida', 'perda') then
    v_new := v_old - p_quantity;
  elsif p_mode = 'definir' then
    v_new := p_quantity;
  else
    raise exception 'TIPO_INVALIDO: use entrada, saida, perda ou definir';
  end if;
  if v_new < 0 then
    raise exception 'SEM_ESTOQUE: % — há só % em estoque', v_prod.name, v_old;
  end if;
  v_delta := v_new - v_old;

  -- custo médio ponderado na entrada
  v_cost := v_prod.cost_price;
  if p_mode = 'entrada' and p_unit_cost is not null and p_quantity > 0 then
    if v_old > 0 and v_prod.cost_price is not null then
      v_cost := round(((v_old * v_prod.cost_price) + (p_quantity * p_unit_cost)) / (v_old + p_quantity), 4);
    else
      v_cost := p_unit_cost;
    end if;
  end if;

  perform set_config('erp.internal', '1', true);
  update public.products set stock = v_new, cost_price = v_cost where id = v_prod.id;
  perform set_config('erp.internal', '0', true);

  v_type := case
    when p_purchase_order_id is not null then 'compra'
    when p_mode = 'definir' then 'inventario'
    else p_mode end;

  if v_delta <> 0 or p_mode = 'definir' then
    insert into public.stock_movements (tenant_id, product_id, product_name, movement_type, quantity, balance_after, unit_cost, reason, purchase_order_id)
    select v_prod.tenant_id, v_prod.id, v_prod.name, v_type, v_delta, v_new, coalesce(p_unit_cost, v_prod.cost_price), p_reason, p_purchase_order_id;
  end if;

  return jsonb_build_object('product_id', v_prod.id, 'stock_before', v_old, 'stock_after', v_new, 'cost_price', v_cost);
end;
$$;
grant execute on function public.stock_adjust(text, text, text, integer, text, numeric, bigint) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) BAIXA AUTOMÁTICA NA VENDA E ESTORNO NO CANCELAMENTO
--    Só age nas lojas com "stock_control_enabled" ligado e só em pedidos de venda
--    (locação tem controle próprio por data). Produtos com estoque vazio = ilimitado.
-- ---------------------------------------------------------------------
create or replace function public.orders_stock_control()
returns trigger
language plpgsql
as $$
declare
  v_enabled boolean;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_item record;
  v_prod record;
  v_was_cancelled boolean;
  v_is_cancelled boolean;
begin
  select coalesce(t.stock_control_enabled, false) into v_enabled from public.tenants t where t.id = new.tenant_id;
  if not coalesce(v_enabled, false) then return new; end if;
  if coalesce(v_new->>'order_type', 'venda') = 'aluguel' then return new; end if;

  v_is_cancelled := coalesce(v_new->>'status', '') = 'cancelado';

  if tg_op = 'INSERT' then
    if v_is_cancelled then return new; end if;
    v_was_cancelled := true;   -- trata como "ativando" o pedido
  else
    v_old := to_jsonb(old);
    v_was_cancelled := coalesce(v_old->>'status', '') = 'cancelado';
    if v_was_cancelled = v_is_cancelled then return new; end if;
  end if;

  for v_item in
    select (e->>'id') as pid, max(e->>'name') as pname, sum(coalesce(nullif(e->>'quantity', '')::int, 1)) as qty
      from jsonb_array_elements(case when jsonb_typeof(v_new->'items') = 'array' then v_new->'items' else '[]'::jsonb end) e
     where coalesce((e->>'is_digital')::boolean, false) = false and coalesce((e->>'rental')::boolean, false) = false
     group by 1
  loop
    select * into v_prod from public.products
     where id::text = v_item.pid and tenant_id = new.tenant_id
     for update;
    if not found or v_prod.stock is null or coalesce(v_prod.is_digital, false) then continue; end if;

    perform set_config('erp.internal', '1', true);
    if v_was_cancelled and not v_is_cancelled then
      -- pedido novo (ou reativado): baixa
      if v_prod.stock < v_item.qty then
        raise exception 'SEM_ESTOQUE: % — só há % em estoque', v_prod.name, v_prod.stock;
      end if;
      update public.products set stock = stock - v_item.qty where id = v_prod.id;
      insert into public.stock_movements (tenant_id, product_id, product_name, movement_type, quantity, balance_after, unit_cost, reason, order_id)
      values (new.tenant_id, v_prod.id, v_prod.name, 'venda', -v_item.qty, v_prod.stock - v_item.qty, v_prod.cost_price, 'Venda pedido #' || new.id, new.id::text);
    else
      -- pedido cancelado: devolve ao estoque só o que foi baixado por ele
      if exists (select 1 from public.stock_movements m where m.order_id = new.id::text and m.product_id::text = v_item.pid and m.movement_type = 'venda') then
        update public.products set stock = stock + v_item.qty where id = v_prod.id;
        insert into public.stock_movements (tenant_id, product_id, product_name, movement_type, quantity, balance_after, unit_cost, reason, order_id)
        values (new.tenant_id, v_prod.id, v_prod.name, 'cancelamento', v_item.qty, v_prod.stock + v_item.qty, v_prod.cost_price, 'Cancelamento pedido #' || new.id, new.id::text);
      end if;
    end if;
    perform set_config('erp.internal', '0', true);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_orders_stock_insert on public.orders;
create trigger trg_orders_stock_insert before insert on public.orders
for each row execute function public.orders_stock_control();

drop trigger if exists trg_orders_stock_update on public.orders;
create trigger trg_orders_stock_update before update on public.orders
for each row execute function public.orders_stock_control();


-- Pedido EXCLUÍDO (que não estava cancelado) devolve ao estoque o que tinha baixado
create or replace function public.orders_stock_on_delete()
returns trigger
language plpgsql
as $$
declare
  v_mov record;
begin
  if coalesce(to_jsonb(old)->>'status', '') = 'cancelado' then return old; end if;
  for v_mov in
    select m.product_id, sum(m.quantity) as qty
      from public.stock_movements m
     where m.order_id = old.id::text and m.movement_type in ('venda', 'cancelamento')
     group by m.product_id
    having sum(m.quantity) < 0
  loop
    perform set_config('erp.internal', '1', true);
    update public.products set stock = coalesce(stock, 0) - v_mov.qty where id = v_mov.product_id;
    insert into public.stock_movements (tenant_id, product_id, product_name, movement_type, quantity, balance_after, unit_cost, reason, order_id)
    select p.tenant_id, p.id, p.name, 'cancelamento', -v_mov.qty, p.stock, p.cost_price, 'Pedido #' || old.id || ' excluído', old.id::text
      from public.products p where p.id = v_mov.product_id;
    perform set_config('erp.internal', '0', true);
  end loop;
  return old;
end;
$$;

drop trigger if exists trg_orders_stock_delete on public.orders;
create trigger trg_orders_stock_delete before delete on public.orders
for each row execute function public.orders_stock_on_delete();

-- ---------------------------------------------------------------------
-- 5) ALTERAÇÃO DE ESTOQUE PELO CADASTRO DO PRODUTO TAMBÉM VAI PARA O HISTÓRICO
-- ---------------------------------------------------------------------
create or replace function public.products_stock_log()
returns trigger
language plpgsql
as $$
declare
  v_enabled boolean;
begin
  if coalesce(current_setting('erp.internal', true), '0') = '1' then return new; end if;
  if new.stock is not distinct from old.stock then return new; end if;
  select coalesce(t.stock_control_enabled, false) into v_enabled from public.tenants t where t.id = new.tenant_id;
  if not coalesce(v_enabled, false) then return new; end if;
  insert into public.stock_movements (tenant_id, product_id, product_name, movement_type, quantity, balance_after, unit_cost, reason)
  values (new.tenant_id, new.id, new.name, 'ajuste', coalesce(new.stock, 0) - coalesce(old.stock, 0), new.stock, new.cost_price, 'Alterado no cadastro do produto');
  return new;
end;
$$;

drop trigger if exists trg_products_stock_log on public.products;
create trigger trg_products_stock_log after update of stock on public.products
for each row execute function public.products_stock_log();

-- ---------------------------------------------------------------------
-- 6) RECEBER PEDIDO DE COMPRA
--    Dá entrada no estoque (rateando frete/custos no custo unitário), atualiza o
--    custo médio e cria as contas a pagar (parcelas) no financeiro.
-- ---------------------------------------------------------------------
create or replace function public.receive_purchase_order(p_tenant_id text, p_po_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_po record;
  v_item record;
  v_items_value numeric;
  v_extra numeric;
  v_unit numeric;
  v_n integer;
  v_part numeric;
  v_sum numeric := 0;
  i integer;
  v_due date;
begin
  select * into v_po from public.purchase_orders
   where id = p_po_id and tenant_id::text = p_tenant_id
   for update;
  if not found then raise exception 'COMPRA_NAO_ENCONTRADA'; end if;
  if v_po.status = 'recebido' then raise exception 'COMPRA_JA_RECEBIDA: esta compra já foi recebida'; end if;
  if v_po.status = 'cancelado' then raise exception 'COMPRA_CANCELADA: esta compra está cancelada'; end if;

  select coalesce(sum(coalesce(nullif(e->>'quantity','')::numeric, 0) * coalesce(nullif(e->>'unit_cost','')::numeric, 0)), 0)
    into v_items_value
    from jsonb_array_elements(v_po.items) e;
  v_extra := coalesce(v_po.freight, 0) + coalesce(v_po.other_costs, 0);

  for v_item in
    select e->>'product_id' as pid,
           coalesce(nullif(e->>'quantity','')::int, 0) as qty,
           coalesce(nullif(e->>'unit_cost','')::numeric, 0) as cost
      from jsonb_array_elements(v_po.items) e
  loop
    if v_item.pid is null or v_item.qty <= 0 then continue; end if;
    -- frete e outros custos rateados pelo valor de cada item (custo real de aquisição)
    v_unit := v_item.cost + case when v_items_value > 0 then (v_item.cost / v_items_value) * v_extra else 0 end;
    perform public.stock_adjust(p_tenant_id, v_item.pid, 'entrada', v_item.qty,
      'Compra #' || v_po.id || coalesce(' - ' || v_po.supplier_name, ''), round(v_unit, 4), v_po.id);
  end loop;

  update public.purchase_orders set status = 'recebido', received_at = now() where id = v_po.id;

  -- contas a pagar
  v_n := greatest(coalesce(v_po.installments, 1), 1);
  for i in 1..v_n loop
    if i < v_n then
      v_part := round(coalesce(v_po.total, 0) / v_n, 2);
      v_sum := v_sum + v_part;
    else
      v_part := round(coalesce(v_po.total, 0) - v_sum, 2);
    end if;
    v_due := coalesce(v_po.payment_due_date, current_date) + (i - 1) * coalesce(v_po.installment_interval_days, 30);
    insert into public.fin_transactions (tenant_id, type, category, description, amount, due_date, paid_at, status, payment_method, supplier_id, purchase_order_id, installment)
    values (v_po.tenant_id, 'despesa', 'Compra de mercadorias',
            'Compra #' || v_po.id || coalesce(' - ' || v_po.supplier_name, '') || case when v_n > 1 then ' (' || i || '/' || v_n || ')' else '' end,
            v_part, v_due,
            case when v_po.paid_on_receipt then current_date else null end,
            case when v_po.paid_on_receipt then 'pago' else 'pendente' end,
            v_po.payment_method, v_po.supplier_id, v_po.id,
            case when v_n > 1 then i || '/' || v_n else null end);
  end loop;

  return jsonb_build_object('ok', true, 'purchase_order_id', v_po.id, 'installments', v_n);
end;
$$;
grant execute on function public.receive_purchase_order(text, bigint) to anon, authenticated;

-- Pronto. Devem aparecer 5 linhas.
select proname from pg_proc where proname in ('stock_adjust', 'orders_stock_control', 'orders_stock_on_delete', 'products_stock_log', 'receive_purchase_order');
