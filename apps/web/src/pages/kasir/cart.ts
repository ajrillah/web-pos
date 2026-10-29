import {
  lineSubtotal,
  type Product,
  type ProductUnit,
  type RoundingMode,
  roundSaleTotal,
  type SaleLineInput,
} from '@toko-podomoro/shared';

// Cart state for the Kasir screen. Totals use the shared math; the server recomputes them
// on payment and refuses if its total differs (docs/design.md 4.6).

export interface CartLine {
  key: string;
  product: Product;
  unitId: string;
  /** Quantity in the product's stock unit; normal items: a multiple of the unit factor. May be negative (return). */
  qtyBase: number;
  /** Price when the sale was held, if it came back from Tahan. */
  heldUnitPrice?: number;
  /** Optional per-line note (shown on receipt in parentheses). */
  note?: string;
  /** Cashier-overridden sell price for this line (per unit factor base units). */
  unitPrice?: number;
}

export interface Cart {
  lines: CartLine[];
  /** Key of the most recently added or changed line (tinted, "BARU"). */
  newestKey: string | null;
}

export const emptyCart: Cart = { lines: [], newestKey: null };

export type CartAction =
  | { type: 'add'; product: Product; unitId?: string; qtyBase?: number }
  | { type: 'setQty'; key: string; qtyBase: number }
  | { type: 'setUnit'; key: string; unitId: string }
  | { type: 'setNote'; key: string; note: string }
  | { type: 'setPrice'; key: string; unitPrice: number | undefined }
  | { type: 'remove'; key: string }
  | { type: 'replaceProducts'; products: Map<string, Product> }
  | { type: 'load'; lines: Omit<CartLine, 'key'>[] }
  | { type: 'clear' };

const newKey = () => crypto.randomUUID();

/**
 * A line at zero is refused on payment, so it never stays in the cart (it can only come up when
 * a quantity is set to zero).
 */
function withLines(lines: CartLine[], newestKey: string | null): Cart {
  const kept = lines.filter((l) => l.qtyBase !== 0);
  return { lines: kept, newestKey: kept.some((l) => l.key === newestKey) ? newestKey : null };
}

export function lineUnit(line: CartLine): ProductUnit | undefined {
  return line.product.units.find((u) => u.id === line.unitId);
}

export function primaryUnit(product: Product): ProductUnit | undefined {
  return product.units.find((u) => u.isBase) ?? product.units[0];
}

export function lineSubtotalOf(line: CartLine): number {
  const unit = lineUnit(line);
  const price = line.unitPrice ?? unit?.sellPrice ?? 0;
  return unit
    ? lineSubtotal({ qtyBase: line.qtyBase, unitPrice: price, unitFactor: unit.factor })
    : 0;
}

export function cartReducer(cart: Cart, action: CartAction): Cart {
  switch (action.type) {
    case 'add': {
      const unit = action.unitId
        ? action.product.units.find((u) => u.id === action.unitId)
        : primaryUnit(action.product);
      if (!unit) return cart;
      const qtyBase = action.qtyBase ?? unit.factor;
      // The same product in the same unit adds up on its existing line, but a return stays on a
      // line of its own: MS2 stores it as a separate sale item (docs/design.md 6.1.1).
      const existing = cart.lines.find(
        (l) =>
          l.product.id === action.product.id &&
          l.unitId === unit.id &&
          Math.sign(l.qtyBase) === Math.sign(qtyBase),
      );
      if (existing) {
        return withLines(
          cart.lines.map((l) =>
            l.key === existing.key
              ? { ...l, product: action.product, qtyBase: l.qtyBase + qtyBase }
              : l,
          ),
          existing.key,
        );
      }
      const key = newKey();
      return {
        lines: [...cart.lines, { key, product: action.product, unitId: unit.id, qtyBase }],
        newestKey: key,
      };
    }
    case 'setQty':
      return withLines(
        cart.lines.map((l) => (l.key === action.key ? { ...l, qtyBase: action.qtyBase } : l)),
        action.key,
      );
    case 'setNote':
      return {
        lines: cart.lines.map((l) => (l.key === action.key ? { ...l, note: action.note } : l)),
        newestKey: cart.newestKey,
      };
    case 'setPrice':
      return {
        lines: cart.lines.map((l) => {
          if (l.key !== action.key) return l;
          if (action.unitPrice === undefined) {
            const { unitPrice: _, ...rest } = l;
            return rest;
          }
          return { ...l, unitPrice: action.unitPrice };
        }),
        newestKey: cart.newestKey,
      };
    case 'setUnit':
      return {
        lines: cart.lines.map((l) => {
          if (l.key !== action.key) return l;
          const from = lineUnit(l);
          const to = l.product.units.find((u) => u.id === action.unitId);
          if (!from || !to) return l;
          // Keep the count of sell units: 2 bungkus becomes 2 slop.
          const count = Math.max(1, Math.round(l.qtyBase / from.factor));
          // A different unit has its own price, so the held-price comparison no longer applies.
          const { heldUnitPrice: _, unitPrice: __, ...rest } = l;
          return { ...rest, unitId: to.id, qtyBase: count * to.factor };
        }),
        newestKey: action.key,
      };
    case 'remove':
      return {
        lines: cart.lines.filter((l) => l.key !== action.key),
        newestKey: cart.newestKey === action.key ? null : cart.newestKey,
      };
    case 'replaceProducts':
      // Fresh product data (prices, stock); lines whose product or unit is gone are dropped.
      return {
        ...cart,
        lines: cart.lines.flatMap((l) => {
          const product = action.products.get(l.product.id);
          if (!product?.active || !product.units.some((u) => u.id === l.unitId)) return [];
          return [{ ...l, product }];
        }),
      };
    case 'load': {
      const lines = action.lines.map((l) => ({ ...l, key: newKey() }));
      return { lines, newestKey: lines.at(-1)?.key ?? null };
    }
    case 'clear':
      return emptyCart;
  }
}

export interface CartTotals {
  subtotal: number;
  roundingAmount: number;
  total: number;
}

export function cartTotals(cart: Cart, rounding: RoundingMode): CartTotals {
  const subtotal = cart.lines.reduce((sum, l) => sum + lineSubtotalOf(l), 0);
  const { total, roundingAmount } = roundSaleTotal(subtotal, rounding);
  return { subtotal, roundingAmount, total };
}

export function saleLines(cart: Cart): SaleLineInput[] {
  return cart.lines.map((l) => ({
    productId: l.product.id,
    unitId: l.unitId,
    qtyBase: l.qtyBase,
    ...(l.note ? { note: l.note } : {}),
    ...(l.unitPrice !== undefined ? { unitPrice: l.unitPrice } : {}),
  }));
}

/** Base units of `product` in the whole cart (it can be on several lines). */
export function cartQtyOf(cart: Cart, productId: string): number {
  return cart.lines.reduce((sum, l) => (l.product.id === productId ? sum + l.qtyBase : sum), 0);
}
