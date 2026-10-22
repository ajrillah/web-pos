import {
  type CostSuggestionResponse,
  costFromBuyPrice,
  lineSubtotal,
  marginBasisPoints,
  type Product,
  type ProductUnit,
  type PurchaseLineInput,
  weightedAverageCost,
} from '@toko-podomoro/shared';

/** One Stok Masuk line being edited. */
export interface PurchaseLine {
  key: string;
  product: Product;
  unitId: string;
  /** Normal products: count of the chosen unit. Bulk: grams / ml. */
  qty: number | null;
  /** Buy price for one of the chosen unit (bulk: per kg / liter). */
  buyPrice: number | null;
  /** New cost per pricing unit (pcs, kg, ...); starts at the current cost. */
  newCostPrice: number | null;
  suggestion: CostSuggestionResponse | null;
}

export function newLine(product: Product): PurchaseLine {
  const unit = product.units.find((u) => u.isBase) ?? product.units[0];
  return {
    key: crypto.randomUUID(),
    product,
    unitId: unit?.id ?? '',
    qty: null,
    buyPrice: null,
    newCostPrice: product.costPrice,
    suggestion: null,
  };
}

export function unitOf(line: PurchaseLine): ProductUnit | undefined {
  return line.product.units.find((u) => u.id === line.unitId);
}

/** Quantity in base units (stock unit). */
export function qtyBaseOf(line: PurchaseLine): number {
  const qty = line.qty ?? 0;
  if (line.product.type === 'bulk') return qty;
  return qty * (unitOf(line)?.factor ?? 1);
}

export function subtotalOf(line: PurchaseLine): number {
  const unit = unitOf(line);
  if (!unit) return 0;
  return lineSubtotal({
    qtyBase: qtyBaseOf(line),
    unitPrice: line.buyPrice ?? 0,
    unitFactor: unit.factor,
  });
}

export function purchaseTotal(lines: PurchaseLine[]): number {
  return lines.reduce((sum, line) => sum + subtotalOf(line), 0);
}

export interface CostOptions {
  /** This purchase's price as a cost per pricing unit. */
  thisBuy: number | null;
  /** The last purchase's price as a cost. */
  lastBuy: number | null;
  /** Moving average of stock on hand and this purchase. */
  average: number | null;
}

export function costOptions(line: PurchaseLine): CostOptions {
  const unit = unitOf(line);
  const qtyBase = qtyBaseOf(line);
  const ready = unit !== undefined && line.buyPrice !== null && qtyBase > 0;
  const { product, suggestion } = line;
  return {
    thisBuy:
      unit && line.buyPrice !== null
        ? costFromBuyPrice(line.buyPrice, unit.factor, product.pricingFactor)
        : null,
    lastBuy: suggestion?.lastBuyCost ?? null,
    average: ready
      ? weightedAverageCost({
          stock: suggestion?.stock ?? product.stock,
          costPrice: suggestion?.costPrice ?? product.costPrice,
          pricingFactor: product.pricingFactor,
          qtyBase,
          subtotal: subtotalOf(line),
        })
      : null,
  };
}

/** Margin of the primary sell unit at the new cost, in basis points. */
export function marginOf(line: PurchaseLine): number | null {
  const primary = line.product.units.find((u) => u.isBase);
  if (!primary || line.newCostPrice === null) return null;
  return marginBasisPoints(
    primary.sellPrice,
    primary.factor,
    line.newCostPrice,
    line.product.pricingFactor,
  );
}

export function costChanged(line: PurchaseLine): boolean {
  return line.newCostPrice !== null && line.newCostPrice !== line.product.costPrice;
}

/** Why the lines cannot be saved yet, or null. */
export function lineProblem(lines: PurchaseLine[]): string | null {
  if (lines.length === 0) return 'Tambahkan barang yang masuk.';
  for (const line of lines) {
    if (!line.qty) return `Isi jumlah ${line.product.name}.`;
    if (line.buyPrice === null) return `Isi harga beli ${line.product.name}.`;
    if (line.newCostPrice === null) return `Isi harga modal ${line.product.name}.`;
  }
  return null;
}

export function toLineInputs(lines: PurchaseLine[]): PurchaseLineInput[] {
  return lines.map((line) => ({
    productId: line.product.id,
    unitId: line.unitId,
    qtyBase: qtyBaseOf(line),
    buyPrice: line.buyPrice ?? 0,
    newCostPrice: line.newCostPrice ?? 0,
  }));
}
