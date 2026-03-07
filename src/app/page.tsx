"use client";

import React, { useEffect, useMemo, useState } from "react";

type Variant = {
  id: string;
  product_id?: string;
  unit_type: string;
  currency: string;
  price_cents: number;
  duration_minutes: number;
};

type Product = {
  slug: string;
  name: string;
  description?: string;
  variants: Variant[];
};

type CatalogResp = { ok: boolean; products: Product[] };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_BASE!;

function money(cents: number, currency: string) {
  const amount = cents / 100;
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function toIsoLocal(dateStr: string, timeStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const dt = new Date(y, (m - 1), d, hh, mm, 0, 0);
  return dt.toISOString();
}

export default function Page() {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [productSlug, setProductSlug] = useState<string>("");
  const [variantId, setVariantId] = useState<string>("");

  const [date1, setDate1] = useState("");
  const [time1, setTime1] = useState("18:00");
  const [date2, setDate2] = useState("");
  const [time2, setTime2] = useState("10:00");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [avail, setAvail] = useState<null | { ok: boolean; available: boolean; reason?: string }>(null);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [holdResult, setHoldResult] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setLoadingCatalog(true);
        const res = await fetch(`${BASE}/get_catalog`, { method: "GET" });
        const json = (await res.json()) as CatalogResp;
        if (!json.ok) throw new Error("No se pudo cargar el catálogo.");
        setCatalog(json.products ?? []);
      } catch (e: any) {
        setErr(e?.message ?? "Error cargando catálogo");
      } finally {
        setLoadingCatalog(false);
      }
    })();
  }, []);

  const selectedProduct = useMemo(() => catalog.find((p) => p.slug === productSlug), [catalog, productSlug]);
  const variants = selectedProduct?.variants ?? [];
  const selectedVariant = useMemo(() => variants.find((v) => v.id === variantId), [variants, variantId]);

  const needsTwoDates = useMemo(() => productSlug === "boda-torna-boda", [productSlug]);

  const canCheck =
    Boolean(variantId) &&
    Boolean(date1) &&
    Boolean(time1) &&
    (!needsTwoDates || (Boolean(date2) && Boolean(time2)));

  const canCreate =
    canCheck &&
    avail?.ok &&
    avail.available &&
    Boolean(name.trim()) &&
    Boolean(email.trim()) &&
    Boolean(phone.trim());

  async function checkAvailability() {
    setErr("");
    setHoldResult(null);
    setChecking(true);
    try {
      const blocks = [{ start_at: toIsoLocal(date1, time1) }];
      if (needsTwoDates) blocks.push({ start_at: toIsoLocal(date2, time2) });

      const res = await fetch(`${BASE}/check_availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_id: variantId, blocks }),
      });
      const json = await res.json();
      setAvail(json);
    } catch (e: any) {
      setErr(e?.message ?? "Error revisando disponibilidad");
    } finally {
      setChecking(false);
    }
  }

  async function createHold() {
    setErr("");
    setCreating(true);
    try {
      const blocks = [{ start_at: toIsoLocal(date1, time1) }];
      if (needsTwoDates) blocks.push({ start_at: toIsoLocal(date2, time2) });

      const res = await fetch(`${BASE}/create_hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: variantId,
          customer: { name, email, phone },
          blocks,
          itinerary: { source: "widget", product_slug: productSlug },
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "No se pudo crear el hold");
      if (!json.created) throw new Error(json.reason ?? "No hay cupo");
      setHoldResult(json);
    } catch (e: any) {
      setErr(e?.message ?? "Error creando reserva");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-6 text-zinc-900">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-bold">UNUO — Booking (Bodas)</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Selecciona servicio, unidad y fecha(s). Luego genera tu reserva (hold) con anticipo 30%.
        </p>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-base font-semibold">1) Servicio</h2>

          {loadingCatalog ? (
            <div className="mt-2 text-sm text-zinc-600">Cargando catálogo…</div>
          ) : (
            <select
              value={productSlug}
              onChange={(e) => {
                setProductSlug(e.target.value);
                setVariantId("");
                setAvail(null);
                setHoldResult(null);
              }}
              className="mt-2 w-full rounded-xl border border-zinc-200 p-3 text-sm"
            >
              <option value="">Elige un servicio…</option>
              {catalog.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {selectedProduct ? (
            <div className="mt-3 text-sm text-zinc-600">
              <div>
                <span className="font-semibold text-zinc-800">Descripción:</span>{" "}
                {selectedProduct.description ?? "—"}
              </div>
              {needsTwoDates ? (
                <div className="mt-1">
                  <span className="font-semibold text-zinc-800">Nota:</span> este servicio requiere 2 fechas (boda + torna).
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-base font-semibold">2) Unidad</h2>

          <select
            value={variantId}
            disabled={!selectedProduct}
            onChange={(e) => {
              setVariantId(e.target.value);
              setAvail(null);
              setHoldResult(null);
            }}
            className="mt-2 w-full rounded-xl border border-zinc-200 p-3 text-sm disabled:opacity-60"
          >
            <option value="">
              {selectedProduct ? "Elige unidad…" : "Selecciona un servicio primero"}
            </option>
            {/* Variantes ordenadas por capacidad numérica (PAX más pequeño primero) */}
            {[...variants]
              .sort((a, b) => {
                const paxA = parseInt(a.unit_type.replace("PAX_", "")) || 0;
                const paxB = parseInt(b.unit_type.replace("PAX_", "")) || 0;
                return paxA - paxB;
              })
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.unit_type} — {money(v.price_cents, v.currency)} — {v.duration_minutes} min
                </option>
              ))}
          </select>

          {selectedVariant ? (
            <div className="mt-3 text-sm text-zinc-700">
              <div>
                <span className="font-semibold">Precio por bloque:</span>{" "}
                {money(selectedVariant.price_cents, selectedVariant.currency)}
              </div>
              <div>
                <span className="font-semibold">Duración:</span>{" "}
                {selectedVariant.duration_minutes} min
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-base font-semibold">3) Fecha(s)</h2>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px]">
            <input
              type="date"
              value={date1}
              onChange={(e) => setDate1(e.target.value)}
              className="rounded-xl border border-zinc-200 p-3 text-sm"
            />
            <input
              type="time"
              value={time1}
              onChange={(e) => setTime1(e.target.value)}
              className="rounded-xl border border-zinc-200 p-3 text-sm"
              step="60" // Permite seleccionar minutos; cambia a "3600" para horas exactas
            />
          </div>

          {needsTwoDates ? (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px]">
              <input
                type="date"
                value={date2}
                onChange={(e) => setDate2(e.target.value)}
                className="rounded-xl border border-zinc-200 p-3 text-sm"
              />
              <input
                type="time"
                value={time2}
                onChange={(e) => setTime2(e.target.value)}
                className="rounded-xl border border-zinc-200 p-3 text-sm"
                step="60"
              />
            </div>
          ) : null}

          <button
            onClick={checkAvailability}
            disabled={!canCheck || checking}
            className="mt-3 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checking ? "Revisando…" : "Ver disponibilidad"}
          </button>

          {avail ? (
            <div className="mt-3 text-sm">
              <span className="font-semibold">Disponibilidad:</span>{" "}
              {avail.available ? (
                <span className="text-green-700">Disponible ✅</span>
              ) : (
                <span className="text-red-700">No disponible ❌ {avail.reason ? `(${avail.reason})` : ""}</span>
              )}
            </div>
          ) : null}
        </section>

        <section className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-base font-semibold">4) Datos del cliente</h2>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-zinc-200 p-3 text-sm"
              suppressHydrationWarning
            />
            <input
              placeholder="Teléfono"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-xl border border-zinc-200 p-3 text-sm"
              suppressHydrationWarning
            />
          </div>

          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-200 p-3 text-sm"
            suppressHydrationWarning
          />

          <button
            onClick={createHold}
            disabled={!canCreate || creating}
            className="mt-3 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "Generando reserva…" : "Reservar (Hold) — anticipo 30%"}
          </button>

          {holdResult ? (
            <div className="mt-3 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <div className="font-bold">✅ Reserva creada</div>
              <div className="mt-1">
                <span className="font-semibold">booking_id:</span> {holdResult.booking_id}
              </div>
              <div>
                <span className="font-semibold">Total:</span> {money(holdResult.total_cents, holdResult.currency)}
              </div>
              <div>
                <span className="font-semibold">Anticipo (30%):</span> {money(holdResult.deposit_cents, holdResult.currency)}
              </div>
              <div>
                <span className="font-semibold">Restante:</span> {money(holdResult.remaining_cents, holdResult.currency)}
              </div>
            </div>
          ) : null}
        </section>

        <p className="mt-4 text-xs text-zinc-500">
          Próximo paso: integrar pago (Stripe) y confirmar automáticamente.
        </p>
      </div>
    </main>
  );
}
