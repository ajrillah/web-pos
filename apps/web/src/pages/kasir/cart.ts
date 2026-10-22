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
  /** Quantity in the product's stock unit; normal items: a multiple of the unit factor. */
  qtyBase: number;
  /** Price when the sale was held, if it came back from Tahan. */
  heldUnitPrice?: number;
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
  | { type: 'remove'; key: string }
  | { type: 'replaceProducts'; products: Map<string, Product> }
  | { type: 'load'; lines: Omit<CartLine, 'key'>[] }
  | { type: 'clear' };

const newKey = () => crypto.randomUUID();

export function lineUnit(line: CartLine): ProductUnit | undefined {
  return line.product.units.find((u) => u.id === line.unitId);
}

export function primaryUnit(product: Product): ProductUnit | undefined {
  return product.units.find((u) => u.isBase) ?? product.units[0];
}

export function lineSubtotalOf(line: CartLine): number {
  const unit = lineUnit(line);
  return unit
    ? lineSubtotal({ qtyBase: line.qtyBase, unitPrice: unit.sellPrice, unitFactor: unit.factor })
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
      // The same product in the same unit adds up on its existing line.
      const existing = cart.lines.find(
        (l) => l.product.id === action.product.id && l.unitId === unit.id,
      );
      if (existing) {
        return {
          lines: cart.lines.map((l) =>
            l.key === existing.key
              ? { ...l, product: action.product, qtyBase: l.qtyBase + qtyBase }
              : l,
          ),
          newestKey: existing.key,
        };
      }
      const key = newKey();
      return {
        lines: [...cart.lines, { key, product: action.product, unitId: unit.id, qtyBase }],
        newestKey: key,
      };
    }
    case 'setQty':
      if (action.qtyBase < 1) return cart;
      return {
        lines: cart.lines.map((l) =>
          l.key === action.key ? { ...l, qtyBase: action.qtyBase } : l,
        ),
        newestKey: action.key,
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
          const { heldUnitPrice: _, ...rest } = l;
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
  return cart.lines.map((l) => ({ productId: l.product.id, unitId: l.unitId, qtyBase: l.qtyBase }));
}

/** Base units of `product` in the whole cart (it can be on several lines). */
export function cartQtyOf(cart: Cart, productId: string): number {
  return cart.lines.reduce((sum, l) => (l.product.id === productId ? sum + l.qtyBase : sum), 0);
}
