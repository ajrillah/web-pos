import { type CustomerPayment, formatRupiah } from '@toko-podomoro/shared';
import { AmountBlock } from '../../components/receipts/ReceiptPromptDialog';

/** Paid amount, change (green), and remaining kasbon (gold) after a kasbon payment. */
export function PaymentSummary({ payment }: { payment: CustomerPayment }) {
  return (
    <div className="space-y-2">
      <AmountBlock label="Dibayar" amount={formatRupiah(payment.amount)} tone="neutral" />
      {payment.changeAmount > 0 && (
        <AmountBlock
          label="Kembalian"
          amount={formatRupiah(payment.changeAmount)}
          tone="change"
          testId="payment-change"
        />
      )}
      <p className="text-muted-foreground">
        Sisa kasbon {payment.customerName}:{' '}
        <span
          className="font-semibold text-warning-foreground tabular-nums"
          data-testid="payment-balance"
        >
          {formatRupiah(payment.balanceAfter)}
        </span>
      </p>
    </div>
  );
}
